import { API_BASE } from "./config";
import type { EmailAccountCreate, EmailAccountUpdate } from "./types";

export type MailboxConnectionTestResult = {
  imap: "ok";
  smtp: "ok";
};

async function request(
  path: string,
  payload: EmailAccountCreate | EmailAccountUpdate,
): Promise<MailboxConnectionTestResult> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const detail =
      (body && typeof body.detail === "string" && body.detail) ||
      response.statusText ||
      "mailbox_connection_test_failed";
    throw new Error(detail);
  }
  return body as MailboxConnectionTestResult;
}

export const mailboxConnectionApi = {
  testNew: (payload: EmailAccountCreate) =>
    request("/accounts/test-connection", payload),
  testExisting: (id: string, payload: EmailAccountUpdate) =>
    request(`/accounts/${encodeURIComponent(id)}/test-connection`, payload),
};

export function mailboxConnectionErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "mailbox_connection_test_failed";
  const messages: Record<string, string> = {
    imap_dns_failed: "Der IMAP-Servername konnte nicht aufgelöst werden.",
    imap_tls_failed: "Die TLS-Verbindung zum IMAP-Server ist fehlgeschlagen.",
    imap_auth_failed: "Die IMAP-Anmeldung ist fehlgeschlagen. Benutzername oder Passwort prüfen.",
    imap_connection_timeout: "Der IMAP-Server hat nicht rechtzeitig geantwortet.",
    imap_connection_failed: "Die Verbindung zum IMAP-Server ist fehlgeschlagen.",
    smtp_dns_failed: "Der SMTP-Servername konnte nicht aufgelöst werden.",
    smtp_tls_failed: "Die TLS-Verbindung zum SMTP-Server ist fehlgeschlagen.",
    smtp_auth_failed: "Die SMTP-Anmeldung ist fehlgeschlagen. Benutzername oder Passwort prüfen.",
    smtp_auth_not_supported: "Der SMTP-Server unterstützt die konfigurierte Anmeldung nicht.",
    smtp_starttls_unavailable: "Der SMTP-Server bietet STARTTLS nicht an.",
    smtp_connection_timeout: "Der SMTP-Server hat nicht rechtzeitig geantwortet.",
    smtp_connection_failed: "Die Verbindung zum SMTP-Server ist fehlgeschlagen.",
    smtp_required_for_generic_account: "Für ein IMAP-Konto muss auch ein SMTP-Server konfiguriert sein.",
    imap_credentials_missing: "IMAP-Zugangsdaten fehlen.",
    smtp_credentials_missing: "SMTP-Zugangsdaten fehlen.",
  };
  return messages[code] ?? code;
}
