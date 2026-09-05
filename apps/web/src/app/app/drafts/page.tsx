"use client";

import { ApiError, api } from "@/lib/api";
import type { MailDraft } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<MailDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDrafts(await api.listDrafts());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load drafts");
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function discard(id: string) {
    if (!window.confirm("Discard this draft?")) return;
    try {
      await api.discardDraft(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not discard draft");
    }
  }

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Drafts</h1>
          <p className="muted">Saved outgoing messages across your authorized mailboxes.</p>
        </div>
        <Link className="btn" href="/app/compose">Compose</Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {drafts === null && <p className="muted">Loading…</p>}
      {drafts?.length === 0 && <div className="card empty">No saved drafts.</div>}

      {drafts && drafts.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Recipients</th>
                <th>State</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>
                    <Link href={`/app/compose?draft=${draft.id}`}>
                      {draft.subject || "(no subject)"}
                    </Link>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {draft.message_type.replace("_", " ")} · {draft.attachments.length} attachment{draft.attachments.length === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="muted">{draft.to_recipients.join(", ") || "—"}</td>
                  <td><span className={`pill ${draft.status === "failed" ? "off" : ""}`}>{draft.status}</span></td>
                  <td className="muted">{new Date(draft.updated_at).toLocaleString()}</td>
                  <td style={{ display: "flex", gap: "0.4rem" }}>
                    <Link className="btn secondary" href={`/app/compose?draft=${draft.id}`}>Open</Link>
                    <button type="button" className="btn secondary" onClick={() => discard(draft.id)}>Discard</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
