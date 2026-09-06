"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function FoldersTagsPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listAccounts()
      .then((rows) => {
        setAccounts(rows);
        if (rows[0]) setAccountId(rows[0].id);
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : t("structure.unableLoadMailboxes"),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);

  const account = useMemo(
    () => accounts.find((item) => item.id === accountId) ?? null,
    [accounts, accountId],
  );
  const systemFolders = account
    ? [
        {
          name: account.inbox_folder || "INBOX",
          role: t("structure.roleInbox"),
          detail: t("structure.detailInbox"),
        },
        {
          name: account.drafts_folder || "Drafts",
          role: t("structure.roleDrafts"),
          detail: t("structure.detailDrafts"),
        },
        {
          name: account.unclassified_folder || "Unclassified",
          role: t("structure.roleUnclassified"),
          detail: t("structure.detailUnclassified"),
        },
      ]
    : [];

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header
          className={s.panelHeader}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div>
            <h2>{t("structure.foldersTags")}</h2>
            <p>{t("structure.foldersTagsSubtitle")}</p>
          </div>
          <label className="field" style={{ minWidth: 260 }}>
            {t("structure.mailbox")}
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error && <div className="alert error">{error}</div>}
        {loading ? (
          <div className="empty">{t("structure.loadingMailboxStructure")}</div>
        ) : !account ? (
          <div className="empty">{t("structure.connectMailboxFirst")}</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                marginBottom: 18,
              }}
            >
              <div>
                <strong style={{ fontSize: 15 }}>
                  {t("structure.mappedSystemFolders")}
                </strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {t("structure.mappedSystemFoldersSubtitle")}
                </div>
              </div>
              <Link
                className="btn"
                href={`/app/settings/folder-discovery?account=${encodeURIComponent(account.id)}`}
              >
                {t("structure.discoverStructure")}
              </Link>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {systemFolders.map((folder) => (
                <div
                  key={folder.role}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px minmax(0,1fr) auto",
                    gap: 16,
                    alignItems: "center",
                    border: "1px solid var(--mf-border)",
                    borderRadius: 8,
                    padding: 16,
                    background: "var(--mf-surface)",
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 20,
                      background: "var(--mf-primary-soft)",
                      color: "var(--mf-primary)",
                      fontWeight: 800,
                    }}
                  >
                    ⌑
                  </span>
                  <div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <strong>{folder.name}</strong>
                      <span className="pill">{t("structure.system")}</span>
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 12, marginTop: 4 }}
                    >
                      {folder.detail}
                    </div>
                  </div>
                  <span className="pill ok">
                    {t("structure.activeMapping")}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                borderTop: "1px solid var(--mf-border)",
                marginTop: 24,
                paddingTop: 20,
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: 20,
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ fontSize: 15 }}>
                  {t("structure.smartDiscovery")}
                </strong>
                <p
                  className="muted"
                  style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.5 }}
                >
                  {t("structure.smartDiscoverySubtitle")}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  className="btn secondary"
                  href={`/app/accounts/${account.id}`}
                >
                  {t("structure.mailboxDetails")}
                </Link>
                <Link
                  className="btn"
                  href={`/app/settings/folder-discovery?account=${encodeURIComponent(account.id)}`}
                >
                  {t("structure.startSetup")}
                </Link>
              </div>
            </div>
          </>
        )}
      </section>
    </SettingsShell>
  );
}
