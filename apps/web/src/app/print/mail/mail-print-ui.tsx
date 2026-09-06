"use client";

import { useI18n } from "@/lib/i18n";
import type { MessageDetail } from "@/lib/types";
import type { useMailPrintPage } from "./use-mail-print-page";

type PrintState = ReturnType<typeof useMailPrintPage>;

export function MailPrintUi({ state }: { state: PrintState }) {
  const { t } = useI18n();
  return (
    <main className="printPage">
      <div className="printToolbar">
        <button type="button" onClick={() => window.print()} disabled={state.loading || Boolean(state.error)}>{t("mail.print")}</button>
        <button type="button" onClick={() => window.close()}>{t("mail.close")}</button>
      </div>
      {state.loading && <p>{t("common.loading")}</p>}
      {state.error && <p className="error">{state.error}</p>}
      {!state.loading && !state.error && state.messages.map((message) => <PrintableMessage key={`${message.account_id}:${message.folder}:${message.uid}`} message={message} />)}
      <PrintStyles />
    </main>
  );
}

function PrintableMessage({ message }: { message: MessageDetail }) {
  const { t, locale } = useI18n();
  return (
    <article className="printMessage">
      <header>
        <h2>{message.subject || t("mail.noSubject")}</h2>
        <dl>
          <MetaRow label={t("mail.from")} value={message.from_email} />
          <MetaRow label={t("mail.to")} value={message.to_emails.join(", ") || message.account_address} />
          {message.cc_emails.length > 0 && <MetaRow label={t("mail.cc")} value={message.cc_emails.join(", ")} />}
          <MetaRow label={t("mail.date")} value={message.date ? new Date(message.date).toLocaleString(locale) : ""} />
        </dl>
      </header>
      {message.safe_html ? <iframe className="printBodyFrame" sandbox="" srcDoc={message.safe_html} title={`${t("mail.messageFrom")} ${message.from_email}`} /> : <pre>{message.body_text || t("mail.emptyMessage")}</pre>}
      {message.attachments.length > 0 && <footer><strong>{t("mail.attachmentsLabel")}:</strong> {message.attachments.map((item) => item.filename).join(", ")}</footer>}
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function PrintStyles() {
  return <style jsx>{`
    .printPage { max-width: 900px; margin: 0 auto; padding: 24px; background: white; color: #111; font-family: Arial, Helvetica, sans-serif; }
    .printToolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 8px 0 16px; background: white; }
    .printToolbar button { padding: 7px 12px; border: 1px solid #bbb; border-radius: 6px; background: #fff; cursor: pointer; }
    .printMessage { break-inside: avoid-page; padding: 0 0 28px; margin: 0 0 28px; border-bottom: 1px solid #bbb; }
    .printMessage h2 { margin: 0 0 12px; font-size: 20px; }
    dl { margin: 0 0 16px; font-size: 12px; }
    dl div { display: grid; grid-template-columns: 64px 1fr; gap: 8px; margin: 3px 0; }
    dt { font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; font: 14px/1.5 Arial, Helvetica, sans-serif; }
    .printBodyFrame { width: 100%; min-height: 500px; border: 0; background: white; }
    footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 12px; }
    .error { color: #b91c1c; }
    @media print {
      .printPage { max-width: none; margin: 0; padding: 0; }
      .printToolbar { display: none; }
      .printMessage:last-child { border-bottom: 0; }
      @page { margin: 14mm; }
    }
  `}</style>;
}
