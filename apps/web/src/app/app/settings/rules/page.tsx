"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  type DomainRule,
  type InternalDomain,
  type KeywordRule,
  rulesApi,
} from "@/lib/rules-api";
import type { EmailAccount } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type RuleTab = "domain" | "keyword" | "internal";

export default function RulesSettingsPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [domainRules, setDomainRules] = useState<DomainRule[]>([]);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);
  const [internalDomains, setInternalDomains] = useState<InternalDomain[]>([]);
  const [tab, setTab] = useState<RuleTab>("domain");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("work");
  const [keywords, setKeywords] = useState("");
  const [matchAll, setMatchAll] = useState(false);
  const [internalDomain, setInternalDomain] = useState("");

  const selected = useMemo(
    () => accounts.find((item) => item.id === accountId) ?? null,
    [accounts, accountId],
  );

  const loadRules = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const [domains, keyword, internal] = await Promise.all([
          rulesApi.listDomain(id),
          rulesApi.listKeyword(id),
          rulesApi.listInternalDomains(id),
        ]);
        setDomainRules(domains);
        setKeywordRules(keyword);
        setInternalDomains(internal);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("rules.unableLoad"));
      }
    },
    [t],
  );

  useEffect(() => {
    void (async () => {
      try {
        const rows = await api.listAccounts();
        setAccounts(rows);
        if (rows[0]) setAccountId((current) => current || rows[0].id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("rules.unableLoadMailboxes"),
        );
      }
    })();
  }, [t]);

  useEffect(() => {
    if (accountId) void loadRules(accountId);
  }, [accountId, loadRules]);

  async function updatePolicy(
    account: EmailAccount,
    patch: {
      move_policy?: "off" | "review" | "automatic";
      archive_policy?: "off" | "review" | "automatic";
    },
  ) {
    setBusy(true);
    setError(null);
    try {
      await api.updateAccount(account.id, patch);
      const rows = await api.listAccounts();
      setAccounts(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("rules.unableUpdatePolicy"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function addDomainRule() {
    if (!accountId || !domain.trim() || !label.trim()) return;
    setBusy(true);
    try {
      await rulesApi.createDomain(accountId, {
        domain: domain.trim().toLowerCase(),
        label: label.trim(),
        rule_id: `domain_${Date.now()}`,
        priority: domainRules.length,
      });
      setDomain("");
      await loadRules(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rules.unableCreate"));
    } finally {
      setBusy(false);
    }
  }

  async function addKeywordRule() {
    const parsed = keywords
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!accountId || parsed.length === 0 || !label.trim()) return;
    setBusy(true);
    try {
      await rulesApi.createKeyword(accountId, {
        keywords: parsed,
        label: label.trim(),
        rule_id: `keyword_${Date.now()}`,
        priority: keywordRules.length,
        match_all: matchAll,
      });
      setKeywords("");
      await loadRules(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rules.unableCreate"));
    } finally {
      setBusy(false);
    }
  }

  async function addInternalDomain() {
    if (!accountId || !internalDomain.trim()) return;
    setBusy(true);
    try {
      await rulesApi.createInternalDomain(
        accountId,
        internalDomain.trim().toLowerCase(),
      );
      setInternalDomain("");
      await loadRules(accountId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("rules.unableCreateInternal"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: RuleTab, id: string) {
    if (!accountId) return;
    setBusy(true);
    try {
      if (kind === "domain") await rulesApi.deleteDomain(accountId, id);
      if (kind === "keyword") await rulesApi.deleteKeyword(accountId, id);
      if (kind === "internal")
        await rulesApi.deleteInternalDomain(accountId, id);
      await loadRules(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rules.unableDelete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader}>
          <div>
            <h2>{t("rules.title")}</h2>
            <p>{t("rules.subtitle")}</p>
          </div>
          <label className="field" style={{ minWidth: 260 }}>
            {t("rules.mailbox")}
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error && <div className="alert error">{error}</div>}
        {!selected ? (
          <div className="empty">{t("rules.noMailbox")}</div>
        ) : (
          <>
            <div className={s.section}>
              <h3 className={s.sectionTitle}>{t("rules.actionPolicies")}</h3>
              <p className={s.sectionCopy}>
                {t("rules.actionPoliciesSubtitle")}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginTop: 14,
                }}
              >
                <label className="field">
                  {t("rules.move")}
                  <select
                    disabled={busy}
                    value={selected.move_policy}
                    onChange={(event) =>
                      void updatePolicy(selected, {
                        move_policy: event.target.value as
                          | "off"
                          | "review"
                          | "automatic",
                      })
                    }
                  >
                    <option value="automatic">
                      {t("rules.automaticSafe")}
                    </option>
                    <option value="review">{t("rules.reviewFirst")}</option>
                    <option value="off">{t("rules.off")}</option>
                  </select>
                </label>
                <label className="field">
                  {t("rules.archive")}
                  <select
                    disabled={busy}
                    value={selected.archive_policy}
                    onChange={(event) =>
                      void updatePolicy(selected, {
                        archive_policy: event.target.value as
                          | "off"
                          | "review"
                          | "automatic",
                      })
                    }
                  >
                    <option value="automatic">
                      {t("rules.automaticSafe")}
                    </option>
                    <option value="review">{t("rules.reviewFirst")}</option>
                    <option value="off">{t("rules.off")}</option>
                  </select>
                </label>
              </div>
            </div>

            <div
              className={s.section}
              style={{
                borderTop: "1px solid var(--mf-border)",
                paddingTop: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 18,
                  borderBottom: "1px solid var(--mf-border)",
                  marginBottom: 18,
                }}
              >
                {(["domain", "keyword", "internal"] as RuleTab[]).map(
                  (item) => (
                    <button
                      key={item}
                      className="btn secondary"
                      type="button"
                      onClick={() => setTab(item)}
                      style={{
                        border: 0,
                        borderBottom:
                          tab === item
                            ? "2px solid var(--mf-primary)"
                            : "2px solid transparent",
                        borderRadius: 0,
                        color:
                          tab === item
                            ? "var(--mf-primary)"
                            : "var(--mf-text-muted)",
                        background: "transparent",
                      }}
                    >
                      {item === "domain"
                        ? t("rules.domainRules")
                        : item === "keyword"
                          ? t("rules.keywordRules")
                          : t("rules.internalDomains")}
                    </button>
                  ),
                )}
              </div>

              {tab === "domain" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 180px auto",
                      gap: 10,
                      alignItems: "end",
                      marginBottom: 16,
                    }}
                  >
                    <label className="field">
                      {t("rules.senderDomain")}
                      <input
                        value={domain}
                        onChange={(event) => setDomain(event.target.value)}
                        placeholder="example.com"
                      />
                    </label>
                    <label className="field">
                      {t("rules.classification")}
                      <select
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                      >
                        {[
                          "work",
                          "private",
                          "finance",
                          "orders",
                          "appointments",
                          "newsletters",
                          "notifications",
                          "other",
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !domain.trim()}
                      onClick={() => void addDomainRule()}
                    >
                      {t("rules.createRule")}
                    </button>
                  </div>
                  <RuleList
                    empty={t("rules.noDomainRules")}
                    rows={domainRules.map((rule) => ({
                      id: rule.id,
                      title: rule.domain,
                      detail: `${t("rules.classifyAs")} ${rule.label}`,
                      meta: `${t("rules.priority")} ${rule.priority}`,
                    }))}
                    busy={busy}
                    deleteLabel={t("rules.delete")}
                    onRemove={(id) => void remove("domain", id)}
                  />
                </>
              )}

              {tab === "keyword" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 180px auto",
                      gap: 10,
                      alignItems: "end",
                      marginBottom: 10,
                    }}
                  >
                    <label className="field">
                      {t("rules.keywords")}
                      <input
                        value={keywords}
                        onChange={(event) => setKeywords(event.target.value)}
                        placeholder="invoice, payment, receipt"
                      />
                    </label>
                    <label className="field">
                      {t("rules.classification")}
                      <select
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                      >
                        {[
                          "work",
                          "private",
                          "finance",
                          "orders",
                          "appointments",
                          "newsletters",
                          "notifications",
                          "other",
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !keywords.trim()}
                      onClick={() => void addKeywordRule()}
                    >
                      {t("rules.createRule")}
                    </button>
                  </div>
                  <label
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 16,
                    }}
                  >
                    <input
                      style={{ width: 16, minHeight: 16 }}
                      type="checkbox"
                      checked={matchAll}
                      onChange={(event) => setMatchAll(event.target.checked)}
                    />
                    {t("rules.requireAll")}
                  </label>
                  <RuleList
                    empty={t("rules.noKeywordRules")}
                    rows={keywordRules.map((rule) => ({
                      id: rule.id,
                      title: rule.keywords.join(rule.match_all ? " + " : " / "),
                      detail: `${t("rules.classifyAs")} ${rule.label}`,
                      meta: rule.match_all
                        ? t("rules.matchAll")
                        : t("rules.matchAny"),
                    }))}
                    busy={busy}
                    deleteLabel={t("rules.delete")}
                    onRemove={(id) => void remove("keyword", id)}
                  />
                </>
              )}

              {tab === "internal" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "end",
                      marginBottom: 16,
                    }}
                  >
                    <label className="field">
                      {t("rules.internalOrgDomain")}
                      <input
                        value={internalDomain}
                        onChange={(event) =>
                          setInternalDomain(event.target.value)
                        }
                        placeholder="company.example"
                      />
                    </label>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !internalDomain.trim()}
                      onClick={() => void addInternalDomain()}
                    >
                      {t("rules.addDomain")}
                    </button>
                  </div>
                  <RuleList
                    empty={t("rules.noInternalDomains")}
                    rows={internalDomains.map((item) => ({
                      id: item.id,
                      title: item.domain,
                      detail: t("rules.treatInternal"),
                      meta: t("rules.organization"),
                    }))}
                    busy={busy}
                    deleteLabel={t("rules.delete")}
                    onRemove={(id) => void remove("internal", id)}
                  />
                </>
              )}
            </div>
          </>
        )}
      </section>
    </SettingsShell>
  );
}

function RuleList({
  rows,
  empty,
  busy,
  deleteLabel,
  onRemove,
}: {
  rows: { id: string; title: string; detail: string; meta: string }[];
  empty: string;
  busy: boolean;
  deleteLabel: string;
  onRemove: (id: string) => void;
}) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 16,
            alignItems: "center",
            border: "1px solid var(--mf-border)",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div>
            <strong>{row.title}</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {row.detail}
            </div>
          </div>
          <span className="pill">{row.meta}</span>
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={() => onRemove(row.id)}
          >
            {deleteLabel}
          </button>
        </div>
      ))}
    </div>
  );
}
