"""Sanitize untrusted email content and detect likely instruction hijacking."""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser

_ACTIVE_TAGS = {
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "meta",
    "link",
    "svg",
    "canvas",
}

_SUSPICIOUS_PATTERNS = (
    re.compile(r"\b(ignore|disregard|forget)\b.{0,80}\b(previous|prior|system|developer)\b.{0,40}\b(instruction|prompt|message)s?\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"\b(system|developer)\s+(prompt|message|instruction)s?\b", re.IGNORECASE),
    re.compile(r"\b(reveal|show|print|expose|return)\b.{0,80}\b(api[_ -]?key|secret|credential|password|token|configuration)\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"\bdo\s+not\s+follow\b.{0,80}\b(instruction|policy|rule)s?\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"\bact\s+as\b.{0,80}\b(system|developer|assistant|administrator)\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"\bexecute\b.{0,80}\b(tool|command|shell|script|action)\b", re.IGNORECASE | re.DOTALL),
)

_DISCUSSION_MARKERS = re.compile(
    r"\b(example|quoted|quote|discussion|discuss|training|awareness|security test|prompt injection)\b",
    re.IGNORECASE,
)


class _VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._blocked_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in _ACTIVE_TAGS:
            self._blocked_depth += 1
        elif tag.lower() in {"br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _ACTIVE_TAGS and self._blocked_depth:
            self._blocked_depth -= 1
        elif tag.lower() in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._blocked_depth == 0:
            self.parts.append(data)


def html_to_safe_text(value: str) -> str:
    """Extract visible inert text from HTML without preserving active elements."""
    if not value:
        return ""
    parser = _VisibleTextParser()
    parser.feed(value)
    parser.close()
    text = html.unescape("".join(parser.parts))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def sanitize_text(value: str) -> str:
    """Remove control characters that can blur prompt/data boundaries."""
    value = value.replace("\x00", "")
    value = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return value.strip()


def looks_suspicious(value: str) -> bool:
    """Flag likely instruction hijacking without treating topic discussion as an attack."""
    text = sanitize_text(value)
    if not text:
        return False
    matches = sum(bool(pattern.search(text)) for pattern in _SUSPICIOUS_PATTERNS)
    if matches == 0:
        return False
    if _DISCUSSION_MARKERS.search(text) and matches == 1:
        return False
    return True
