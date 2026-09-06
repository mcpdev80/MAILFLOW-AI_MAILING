"use client";

import { type TranslationKey, useI18n } from "@/lib/i18n";
import type { MailDraft } from "@/lib/types";
import Link from "next/link";
import type { useDraftsPage } from "./use-drafts-page";

type DraftsState = ReturnType<typeof useDraftsPage>;

export function DraftsUi({ state }: { state: DraftsState }) {
  const { t } = useI18n();
  return (
    <main className="container">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <h1>{t("drafts.title")}</h1>
          <p className="muted">{t("drafts.description")}</p>
        </div>
        <Link className="btn" href="/app/compose">
          {t("drafts.compose")}
        </Link>
      </header>
      {state.error && <div className="alert error">{state.error}</div>}
      {state.drafts === null && <p className="muted">{t("drafts.loading")}</p>}
      {state.drafts?.length === 0 && (
        <div className="card empty">{t("drafts.empty")}</div>
      )}
      {state.drafts && state.drafts.length > 0 && (
        <DraftTable drafts={state.drafts} discard={state.discard} />
      )}
    </main>
  );
}

function DraftTable({
  drafts,
  discard,
}: { drafts: MailDraft[]; discard: (id: string) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>{t("drafts.subject")}</th>
            <th>{t("drafts.recipients")}</th>
            <th>{t("drafts.state")}</th>
            <th>{t("drafts.updated")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} discard={discard} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftRow({
  draft,
  discard,
}: { draft: MailDraft; discard: (id: string) => Promise<void> }) {
  const { t, locale } = useI18n();
  return (
    <tr>
      <td>
        <Link href={`/app/compose?draft=${draft.id}`}>
          {draft.subject || t("drafts.noSubject")}
        </Link>
        <div className="muted" style={{ fontSize: "0.8rem" }}>
          {draftTypeLabel(draft, t)} ·{" "}
          {t("drafts.attachments").replace(
            "{count}",
            String(draft.attachments.length),
          )}
        </div>
      </td>
      <td className="muted">{draft.to_recipients.join(", ") || "—"}</td>
      <td>
        <span className={`pill ${draft.status === "failed" ? "off" : ""}`}>
          {t(`drafts.status.${draft.status}` as TranslationKey)}
        </span>
      </td>
      <td className="muted">
        {new Date(draft.updated_at).toLocaleString(locale)}
      </td>
      <td style={{ display: "flex", gap: 6 }}>
        <Link className="btn secondary" href={`/app/compose?draft=${draft.id}`}>
          {t("drafts.open")}
        </Link>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void discard(draft.id)}
        >
          {t("drafts.discard")}
        </button>
      </td>
    </tr>
  );
}

function draftTypeLabel(
  draft: MailDraft,
  t: (key: TranslationKey) => string,
): string {
  return t(`drafts.type.${draft.message_type}` as TranslationKey);
}
