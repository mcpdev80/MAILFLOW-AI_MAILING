"use client";

import { ApiError, api } from "@/lib/api";
import type { MessageDetail } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

function PrintableMessage({ message }: { message: MessageDetail }) {
  return (
    <article className="printMessage">
      <header>
        <h2>{message.subject || "(no subject)"}</h2>
        <dl>
          <div>
            <dt>From</dt>
            <dd>{message.from_email}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{message.to_emails.join(", ") || message.account_address}</dd>
          </div>
          {message.cc_emails.length > 0 && (
            <div>
              <dt>CC</dt>
              <dd>{message.cc_emails.join(", ")}</dd>
            </div>
          )}
          <div>
            <dt>Date</dt>
            <dd>{message.date || ""}</dd>
          </div>
        </dl>
      </header>
      {message.safe_html ? (
        <iframe
          className="printBodyFrame"
          sandbox=""
          srcDoc={message.safe_html}
          title={`Message from ${message.from_email}`}
        />
      ) : (
        <pre>{message.body_text || "(empty message)"}</pre>
      )}
      {message.attachments.length > 0 && (
        <footer>
          <strong>Attachments:</strong>{" "}
          {message.attachments.map((item) => item.filename).join(", ")}
        </footer>
      )}
    </article>
  );
}

export default function MailPrintPage() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const account = params.get("account");
    const folder = params.get("folder");
    const uid = Number(params.get("uid"));
    const mode = params.get("mode") === "thread" ? "thread" : "message";
    if (!account || !folder || !Number.isInteger(uid) || uid <= 0) {
      setError("Invalid print request.");
      setLoading(false);
      return;
    }

    const accountId = account;
    const folderName = folder;
    let cancelled = false;
    async function load() {
      try {
        const message = await api.messageDetail(accountId, folderName, uid);
        if (mode === "thread" && message.thread_id) {
          const thread = await api.threadDetail(accountId, message.thread_id);
          if (!cancelled) setMessages(thread.messages);
        } else if (!cancelled) {
          setMessages([message]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load mail",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main className="printPage">
      <div className="printToolbar">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading || Boolean(error)}
        >
          Print
        </button>
        <button type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading &&
        !error &&
        messages.map((message) => (
          <PrintableMessage
            key={`${message.account_id}:${message.folder}:${message.uid}`}
            message={message}
          />
        ))}

      <style jsx>{`
        .printPage {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px;
          background: white;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        .printToolbar {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 8px 0 16px;
          background: white;
        }
        .printToolbar button {
          padding: 7px 12px;
          border: 1px solid #bbb;
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
        }
        .printMessage {
          break-inside: avoid-page;
          padding: 0 0 28px;
          margin: 0 0 28px;
          border-bottom: 1px solid #bbb;
        }
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
      `}</style>
    </main>
  );
}
