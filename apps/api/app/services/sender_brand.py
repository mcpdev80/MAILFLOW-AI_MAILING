"""Privacy-safe sender brand discovery with SSRF protection and local caching."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from email.utils import parseaddr

import dns.resolver
from bs4 import BeautifulSoup
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sender_brand import SenderBrandCache

_MAX_IMAGE_BYTES = 384 * 1024
_MAX_HTML_BYTES = 512 * 1024
_POSITIVE_TTL = timedelta(days=7)
_NEGATIVE_TTL = timedelta(hours=24)
_USER_AGENT = "MailFlow/1.0 sender-brand-resolver"
_ALLOWED_IMAGE_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/svg+xml",
}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def sender_domain(address: str) -> str | None:
    parsed = parseaddr(address)[1].strip().lower()
    if "@" not in parsed:
        return None
    domain = parsed.rsplit("@", 1)[1].rstrip(".")
    if not domain or len(domain) > 253 or "." not in domain:
        return None
    try:
        domain.encode("idna")
    except UnicodeError:
        return None
    return domain


def _public_host(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


def _safe_url(url: str, *, expected_domain: str | None = None) -> str | None:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.rstrip(".").lower()
    if expected_domain and host != expected_domain and not host.endswith(f".{expected_domain}"):
        return None
    if not _public_host(host):
        return None
    return urllib.parse.urlunparse(parsed._replace(fragment=""))


def _read_url(url: str, *, limit: int, expected_domain: str | None = None) -> tuple[bytes, str, str] | None:
    current = _safe_url(url, expected_domain=expected_domain)
    if not current:
        return None
    opener = urllib.request.build_opener(_NoRedirect())
    for _ in range(3):
        request = urllib.request.Request(
            current,
            headers={"User-Agent": _USER_AGENT, "Accept": "image/*,text/html;q=0.8,*/*;q=0.1"},
        )
        try:
            response = opener.open(request, timeout=4)
        except urllib.error.HTTPError as exc:
            if exc.code not in {301, 302, 303, 307, 308}:
                return None
            location = exc.headers.get("Location")
            if not location:
                return None
            redirected = urllib.parse.urljoin(current, location)
            current = _safe_url(redirected, expected_domain=expected_domain)
            if not current:
                return None
            continue
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            return None
        with response:
            content_type = (response.headers.get_content_type() or "application/octet-stream").lower()
            length = response.headers.get("Content-Length")
            try:
                if length and int(length) > limit:
                    return None
            except ValueError:
                return None
            payload = response.read(limit + 1)
            if len(payload) > limit:
                return None
            return payload, content_type, current
    return None


def _sanitize_svg(payload: bytes) -> bytes | None:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return None
    lower = text.lower()
    forbidden = ("<script", "<foreignobject", "javascript:", "xlink:href=", "url(")
    if any(token in lower for token in forbidden):
        return None
    return payload


def _validated_image(result: tuple[bytes, str, str] | None) -> tuple[bytes, str, str] | None:
    if result is None:
        return None
    payload, content_type, source_url = result
    content_type = content_type.split(";", 1)[0].strip().lower()
    if content_type not in _ALLOWED_IMAGE_TYPES or not payload:
        return None
    if content_type == "image/svg+xml":
        payload = _sanitize_svg(payload)
        if payload is None:
            return None
    return payload, content_type, source_url


def _bimi_logo(domain: str) -> tuple[bytes, str, str, str] | None:
    try:
        answers = dns.resolver.resolve(f"default._bimi.{domain}", "TXT", lifetime=3)
    except Exception:
        return None
    for answer in answers:
        record = b"".join(answer.strings).decode("utf-8", errors="ignore")
        parts = [part.strip() for part in record.split(";")]
        logo = next((part[2:].strip() for part in parts if part.lower().startswith("l=")), "")
        if not logo:
            continue
        fetched = _validated_image(_read_url(logo, limit=_MAX_IMAGE_BYTES))
        if fetched is not None:
            payload, content_type, source_url = fetched
            return payload, content_type, source_url, "bimi"
    return None


def _website_logo(domain: str) -> tuple[bytes, str, str, str] | None:
    home = _read_url(f"https://{domain}/", limit=_MAX_HTML_BYTES, expected_domain=domain)
    candidates: list[str] = []
    if home is not None:
        html, content_type, final_url = home
        if content_type.startswith("text/html"):
            soup = BeautifulSoup(html, "html.parser")
            for link in soup.find_all("link"):
                rel = {str(item).lower() for item in (link.get("rel") or [])}
                if not rel.intersection({"icon", "shortcut", "apple-touch-icon"}):
                    continue
                href = str(link.get("href") or "").strip()
                if href:
                    candidates.append(urllib.parse.urljoin(final_url, href))
    candidates.extend(
        [
            f"https://{domain}/apple-touch-icon.png",
            f"https://{domain}/favicon.ico",
        ]
    )
    seen: set[str] = set()
    for candidate in candidates[:8]:
        if candidate in seen:
            continue
        seen.add(candidate)
        fetched = _validated_image(
            _read_url(candidate, limit=_MAX_IMAGE_BYTES, expected_domain=domain)
        )
        if fetched is not None:
            payload, content_type, source_url = fetched
            return payload, content_type, source_url, "website"
    return None


def _discover(domain: str) -> tuple[bytes, str, str, str] | None:
    return _bimi_logo(domain) or _website_logo(domain)


async def _store_result(
    session: AsyncSession,
    domain: str,
    discovered: tuple[bytes, str, str, str] | None,
    now: datetime,
) -> tuple[bytes, str, str] | None:
    expires_at = now + (_POSITIVE_TTL if discovered else _NEGATIVE_TTL)
    cached = await session.get(SenderBrandCache, domain)
    if cached is None:
        cached = SenderBrandCache(domain=domain, expires_at=expires_at)
        session.add(cached)
    cached.checked_at = now
    cached.expires_at = expires_at
    if discovered is None:
        cached.status = "missing"
        cached.source_type = None
        cached.source_url = None
        cached.content_type = None
        cached.image_data = None
        await session.commit()
        return None

    payload, content_type, source_url, source_type = discovered
    cached.status = "found"
    cached.source_type = source_type
    cached.source_url = source_url[:1000]
    cached.content_type = content_type
    cached.image_data = payload
    await session.commit()
    return payload, content_type, source_type


async def sender_brand_asset(
    session: AsyncSession,
    address: str,
) -> tuple[bytes, str, str] | None:
    domain = sender_domain(address)
    if domain is None:
        return None
    now = datetime.now(tz=UTC)
    cached = await session.get(SenderBrandCache, domain)
    if cached is not None and cached.expires_at > now:
        if cached.status == "found" and cached.image_data and cached.content_type:
            return bytes(cached.image_data), cached.content_type, cached.source_type or "cache"
        return None

    discovered = await asyncio.to_thread(_discover, domain)
    try:
        return await _store_result(session, domain, discovered, now)
    except IntegrityError:
        # Two browser image requests for the same domain may race on a cold cache.
        await session.rollback()
        return await _store_result(session, domain, discovered, now)
