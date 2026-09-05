"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null);
  const [managedAccounts, setManagedAccounts] = useState<EmailAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const { t } = useI18n();

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
        <h1>{t("nav.dashboard")}</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {accounts && accounts.length > 0 && (
            <>
              <Link className="btn" href="/app/compose">
                {t("dashboard.compose")}
              </Link>
              <Link className="btn secondary" href="/app/drafts">
                {t("dashboard.drafts")}
              </Link>
            </>
          )}
          <Link className="btn secondary" href="/app/settings/security">
            {t("dashboard.security")}
          </Link>
          <Link className="btn secondary" href="/onboarding">
            {t("dashboard.connectMailbox")}
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {accounts === null && <p className="muted">{t("common.loading")}</p>}

      {accounts !== null &&
        accounts.length === 0 &&
        managedAccounts.length === 0 &&
        !error && (
          <div className="card empty">
            <p>{t("dashboard.noMailboxes")}</p>
            <Link className="btn" href="/onboarding">
              {t("dashboard.connectFirst")}
            </Link>
          </div>
        )}

      {accounts !== null && accounts.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t("dashboard.mailbox")}</th>
                <th>{t("dashboard.privacy")}</th>
                <th>{t("dashboard.status")}</th>
                <th>{t("dashboard.every")}</th>
                <th>{t("dashboard.lastCycle")}</th>
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
                      {a.is_active ? t("common.active") : t("common.paused")}
                    </span>
                  </td>
                  <td>{a.interval_minutes} min</td>
                  <td className="muted">
                    {a.last_cycle_at
                      ? new Date(a.last_cycle_at).toLocaleString()
                      : t("dashboard.never")}
                  </td>
                  <td style={{ display: "flex", gap: "0.4rem" }}>
                    <Link
                      className="btn secondary"
                      href={`/app/compose?account=${a.id}`}
                    >
                      {t("dashboard.compose")}
                    </Link>
                    <Link
                      className="btn secondary"
                      href={`/app/accounts/${a.id}/smtp`}
                    >
                      SMTP
                    </Link>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={runningId === a.id}
                      onClick={() => runNow(a.id)}
                    >
                      {runningId === a.id
                        ? t("dashboard.running")
                        : t("dashboard.runNow")}
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
          <h3>{t("dashboard.managedTitle")}</h3>
          <p className="muted">{t("dashboard.managedBody")}</p>
          <table className="table">
            <thead>
              <tr>
                <th>{t("dashboard.mailbox")}</th>
                <th>{t("dashboard.status")}</th>
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
                    <span className="pill">{t("dashboard.manageOnly")}</span>
                  </td>
                  <td>
                    <Link
                      className="btn secondary"
                      href={`/app/accounts/${account.id}`}
                    >
                      {t("dashboard.manageAccess")}
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
