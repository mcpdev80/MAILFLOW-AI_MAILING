"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  type StructureDraft,
  type StructureProposal,
  loadStructureProposal,
  proposalToDraft,
  saveStructureDraft,
} from "@/lib/structure-setup";
import type { EmailAccount } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function FolderDiscoveryPage() {
  const router = useRouter();
  const { t, locale: currentLocale } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [locale, setLocale] = useState<"de" | "en" | "es">(currentLocale);
  const [proposal, setProposal] = useState<StructureProposal | null>(null);
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery =
      new URLSearchParams(window.location.search).get("account") ?? "";
    void api
      .listAccounts()
      .then((rows) => {
        setAccounts(rows);
        const selected = rows.some((item) => item.id === fromQuery)
          ? fromQuery
          : (rows[0]?.id ?? "");
        setAccountId(selected);
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : t("structure.unableLoadMailboxes"),
        ),
      );
  }, [t]);

  async function discover() {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadStructureProposal(accountId, locale);
      const nextDraft = proposalToDraft(accountId, result);
      setProposal(result);
      setDraft(nextDraft);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("structure.discoveryFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  function updateFolder(
    index: number,
    patch: Partial<StructureDraft["folders"][number]>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            folders: current.folders.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  }

  function next() {
    if (!draft) return;
    saveStructureDraft(draft);
    router.push(
      `/app/settings/category-mapping?account=${encodeURIComponent(draft.account_id)}`,
    );
  }

  return (
    <SettingsShell>
      <section
        className={s.panel}
        style={{ background: "transparent", border: 0, padding: 0 }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>
              {t("structure.folderDiscovery")}
            </h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {t("structure.folderDiscoverySubtitle")}
            </p>
          </div>
          <span
            style={{
              borderRadius: 999,
              background: "var(--mf-primary-soft)",
              color: "var(--mf-primary)",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t("structure.step1")}
          </span>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px,1fr) 130px auto",
            gap: 12,
            alignItems: "end",
            marginBottom: 18,
          }}
        >
          <label className="field">
            {t("structure.mailbox")}
            <select
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                setProposal(null);
                setDraft(null);
              }}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("structure.language")}
            <select
              value={locale}
              onChange={(event) => {
                setLocale(event.target.value as "de" | "en" | "es");
                setProposal(null);
                setDraft(null);
              }}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <button
            className="btn"
            type="button"
            disabled={!accountId || loading}
            onClick={() => void discover()}
          >
            {loading
              ? t("structure.scanning")
              : proposal
                ? t("structure.scanAgain")
                : t("structure.discoverFolders")}
          </button>
        </div>

        {error && <div className="alert error">{error}</div>}
        {!proposal || !draft ? (
          <div className="empty">{t("structure.startDiscovery")}</div>
        ) : (
          <>
            <div
              style={{
                border: "1px solid var(--mf-border)",
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--mf-surface)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(220px,1.4fr) minmax(220px,1.2fr) 150px",
                  gap: 16,
                  background: "var(--mf-surface-muted)",
                  color: "var(--mf-text-muted)",
                  padding: "11px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                <span>{t("structure.folder")}</span>
                <span>{t("structure.mailboxName")}</span>
                <span>{t("structure.action")}</span>
              </div>
              {proposal.folders.map((item, index) => {
                const selected = draft.folders[index];
                return (
                  <div
                    key={item.internal_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(220px,1.4fr) minmax(220px,1.2fr) 150px",
                      gap: 16,
                      alignItems: "center",
                      padding: "13px 16px",
                      borderTop: "1px solid var(--mf-surface-muted)",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 13 }}>
                        {item.proposed_name}
                      </strong>
                      <div
                        className="muted"
                        style={{ marginTop: 3, fontSize: 11 }}
                      >
                        {item.existing_match
                          ? `${item.match_kind} ${t("structure.match")} · ${Math.round(item.match_confidence * 100)}% ${t("structure.confidence")}`
                          : t("structure.noExistingMatch")}
                      </div>
                    </div>
                    <input
                      value={selected.mailbox_name}
                      onChange={(event) =>
                        updateFolder(index, {
                          mailbox_name: event.target.value,
                        })
                      }
                    />
                    <select
                      value={selected.action}
                      onChange={(event) =>
                        updateFolder(index, {
                          action: event.target.value as "reuse" | "create",
                        })
                      }
                    >
                      <option value="reuse" disabled={!item.existing_match}>
                        {t("structure.reuseExisting")}
                      </option>
                      <option value="create">{t("structure.createNew")}</option>
                    </select>
                  </div>
                );
              })}
            </div>

            {proposal.tags.length > 0 && (
              <div
                style={{
                  marginTop: 18,
                  border: "1px solid var(--mf-border)",
                  borderRadius: 8,
                  padding: 16,
                  background: "var(--mf-surface)",
                }}
              >
                <strong>{t("structure.tagSuggestions")}</strong>
                <p
                  className="muted"
                  style={{ margin: "5px 0 0", fontSize: 12 }}
                >
                  {proposal.tags.length} {t("structure.tagMappingsDiscovered")}
                </p>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 18,
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                {proposal.existing_folders.length}{" "}
                {t("structure.existingFoldersFound")} ·{" "}
                {proposal.folders.length} {t("structure.proposedMappings")}
              </span>
              <button className="btn" type="button" onClick={next}>
                {t("structure.nextCategoryMapping")}
              </button>
            </div>
          </>
        )}
      </section>
    </SettingsShell>
  );
}
