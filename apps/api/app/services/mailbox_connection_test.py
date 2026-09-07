"""Credential and transport validation for mailbox connection settings."""

from __future__ import annotations

import smtplib
import socket
import ssl

import imapclient


class MailboxConnectionError(RuntimeError):
    """Safe connection-test failure exposed as a stable API error code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def test_mailbox_connection(
    *,
    imap_host: str,
    imap_port: int,
    use_ssl: bool,
    username: str,
    password: str,
    smtp_host: str,
    smtp_port: int,
    smtp_security: str,
    smtp_username: str,
    smtp_password: str,
) -> None:
    """Verify IMAP read access and SMTP authentication without sending mail."""
    _test_imap(
        host=imap_host,
        port=imap_port,
        use_ssl=use_ssl,
        username=username,
        password=password,
    )
    _test_smtp(
        host=smtp_host,
        port=smtp_port,
        security=smtp_security,
        username=smtp_username,
        password=smtp_password,
    )


def _test_imap(*, host: str, port: int, use_ssl: bool, username: str, password: str) -> None:
    client: imapclient.IMAPClient | None = None
    try:
        client = imapclient.IMAPClient(
            host,
            port=port,
            use_uid=True,
            ssl=use_ssl,
            timeout=15,
        )
        client.login(username, password)
        client.select_folder("INBOX", readonly=True)
    except socket.gaierror as exc:
        raise MailboxConnectionError("imap_dns_failed") from exc
    except ssl.SSLError as exc:
        raise MailboxConnectionError("imap_tls_failed") from exc
    except imapclient.exceptions.LoginError as exc:
        raise MailboxConnectionError("imap_auth_failed") from exc
    except TimeoutError as exc:
        raise MailboxConnectionError("imap_connection_timeout") from exc
    except (imapclient.exceptions.IMAPClientError, OSError) as exc:
        raise MailboxConnectionError("imap_connection_failed") from exc
    except Exception as exc:
        raise MailboxConnectionError("imap_connection_failed") from exc
    finally:
        if client is not None:
            try:
                client.logout()
            except Exception:  # noqa: BLE001, S110
                pass


def _test_smtp(
    *, host: str, port: int, security: str, username: str, password: str
) -> None:
    context = ssl.create_default_context()
    try:
        if security == "ssl":
            with smtplib.SMTP_SSL(host, port, timeout=15, context=context) as client:
                client.ehlo()
                client.login(username, password)
            return

        with smtplib.SMTP(host, port, timeout=15) as client:
            client.ehlo()
            if security == "starttls":
                if not client.has_extn("starttls"):
                    raise MailboxConnectionError("smtp_starttls_unavailable")
                client.starttls(context=context)
                client.ehlo()
            client.login(username, password)
    except MailboxConnectionError:
        raise
    except socket.gaierror as exc:
        raise MailboxConnectionError("smtp_dns_failed") from exc
    except ssl.SSLError as exc:
        raise MailboxConnectionError("smtp_tls_failed") from exc
    except smtplib.SMTPAuthenticationError as exc:
        raise MailboxConnectionError("smtp_auth_failed") from exc
    except smtplib.SMTPNotSupportedError as exc:
        raise MailboxConnectionError("smtp_auth_not_supported") from exc
    except TimeoutError as exc:
        raise MailboxConnectionError("smtp_connection_timeout") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise MailboxConnectionError("smtp_connection_failed") from exc
