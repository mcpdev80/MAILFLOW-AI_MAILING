"use client";

import { ApiError, api } from "@/lib/api";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null);
  const [managedAccounts, setManagedAccounts] = useState<EmailAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [visible, managed] = await Promise.all([
        api.listAccounts(),
        api.listManagedMailboxes(),
      ]);
      setAccounts(visible);
      const visibleIds = new Set(visible.map((account) => account.id));
      setManagedAccounts(
        managed.filter((account) => !visibleIds.has(account.id)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not reach the API (${err.message})`
          : "Could not reach the API",
      );
      setAccounts([]);
      setManagedAccounts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runNow(id: string) {
    setRunningId(id);
    setNotice(null);
    setError(null);
    try {
      const res = await api.runCycle(id);
      setNotice(
        res.enqueued
          ? "Cycle enqueued — refresh history in a moment."
          : "Could not enqueue (is the worker/Redis running?).",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Run failed");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <main className="container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <h1>Dashboard</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {accounts && accounts.length > 0 && (
            <Link className="btn" href="/app/compose">
              Compose
            </Link>
          )}
          <Link className="btn secondary" href="/app/settings/security">
            Security
          </Link>
          <Link className="btn secondary" href="/onboarding">
            + Connect mailbox
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {accounts === null && <p className="muted">Loading…</p>}

      {accounts !== null &&
        accounts.length === 0 &&
        managedAccounts.length === 0 &&
        !error && (
          <div className="card empty">
            <p>No mailboxes connected yet.</p>
            <Link className="btn" href="/onboarding">
              Connect your first mailbox
            </Link>
          </div>
        )}

      {accounts !== null && accounts.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Mailbox</th>
                <th>Privacy</th>
                <th>Status</th>
                <th>Every</th>
                <th>Last cycle</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/app/accounts/${a.id}`}>{a.username}</Link>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {a.imap_host}
                    </div>
                  </td>
                  <td>
                    <span className="pill">{a.ownership_mode}</span>
                  </td>
                  <td>
                    <span className={`pill ${a.is_active ? "ok" : "off"}`}>
                      {a.is_active ? "active" : "paused"}
                    </span>
                  </td>
                  <td>{a.interval_minutes} min</td>
                  <td className="muted">
                    {a.last_cycle_at
                      ? new Date(a.last_cycle_at).toLocaleString()
                      : "never"}
                  </td>
                  <td style={{ display: "flex", gap: "0.4rem" }}>
                    <Link className="btn secondary" href={`/app/compose?account=${a.id}`}>
                      Compose
                    </Link>
                    <Link className="btn secondary" href={`/app/accounts/${a.id}/smtp`}>
                      SMTP
                    </Link>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={runningId === a.id}
                      onClick={() => runNow(a.id)}
                    >
                      {runningId === a.id ? "Running…" : "Run now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {managedAccounts.length > 0 && (
        <div className="card">
          <h3>Shared mailboxes you manage</h3>
          <p className="muted">
            These mailboxes are not visible to you unless you are also
            explicitly granted mailbox access.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Mailbox</th>
                <th>Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {managedAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.username}
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {account.imap_host}
                    </div>
                  </td>
                  <td>
                    <span className="pill">manage only</span>
                  </td>
                  <td>
                    <Link
                      className="btn secondary"
                      href={`/app/accounts/${account.id}`}
                    >
                      Manage access
                    </Link>
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
