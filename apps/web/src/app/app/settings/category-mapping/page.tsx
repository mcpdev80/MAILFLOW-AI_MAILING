"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  type StructureDraft,
  currentToDraft,
  loadStructureCurrent,
  readStructureDraft,
  saveStructureDraft,
} from "@/lib/structure-setup";
import type { EmailAccount } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function CategoryMappingPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [loading, setLoading] = useState(true);
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
      )
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (!accountId) {
      setDraft(null);
      return;
    }
    const pending = readStructureDraft(accountId);
    if (pending) {
      setDraft(pending);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void loadStructureCurrent(accountId)
      .then((current) => {
        if (active) setDraft(currentToDraft(accountId, current, locale));
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : t("structure.discoveryFailed"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, locale, t]);

  function updateRoute(
    index: number,
    patch: Partial<StructureDraft["routes"][number]>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            routes: current.routes.map((route, routeIndex) =>
              routeIndex === index ? { ...route, ...patch } : route,
            ),
          }
        : current,
    );
  }

  function addRoute() {
    setDraft((current) => {
      if (!current || current.folders.length === 0) return current;
      return {
        ...current,
        routes: [
          ...current.routes,
          {
            category: "",
            subcategory: null,
            folder_id: current.folders[0].internal_id,
          },
        ],
      };
    });
  }

  function removeRoute(index: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            routes: current.routes.filter((_, routeIndex) => routeIndex !== index),
          }
        : current,
    );
  }

  function next() {
    if (!draft) return;
    const normalized = {
      ...draft,
      routes: draft.routes
        .filter((route) => route.category.trim() && route.folder_id)
        .map((route) => ({
          ...route,
          category: route.category.trim(),
          subcategory: route.subcategory?.trim() || null,
        })),
    };
    saveStructureDraft(normalized);
    router.push(
      `/app/settings/structure-review?account=${encodeURIComponent(normalized.account_id)}`,
    );
  }

  const folderName = useMemo(
    () => new Map(draft?.folders.map((item) => [item.internal_id, item.mailbox_name]) ?? []),
    [draft],
  );
  const targetCount = new Set(
    draft?.routes.map((route) => folderName.get(route.folder_id)) ?? [],
  ).size;

  if (loading && !draft) {
    return (
      <SettingsShell>
        <section className={s.panel}>
          <div className="empty">{t("common.loading")}</div>
        </section>
      </SettingsShell>
    );
  }

  if (!draft) {
    return (
      <SettingsShell>
        <section className={s.panel}>
          <label className="field" style={{ maxWidth: 360, marginBottom: 16 }}>
            {t("structure.mailbox")}
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="alert error">{error}</div>}
          <div className="empty">{t("structure.noDraft")}</div>
          <button
            className="btn"
            type="button"
            style={{ marginTop: 14 }}
            onClick={() =>
              router.push(
                `/app/settings/folder-discovery${accountId ? `?account=${encodeURIComponent(accountId)}` : ""}`,
              )
            }
          >
            {t("structure.openDiscovery")}
          </button>
        </section>
      </SettingsShell>
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
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>
              {t("structure.categoryMapping")}
            </h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {t("structure.categoryMappingSubtitle")}
            </p>
          </div>
          <label className="field" style={{ minWidth: 260 }}>
            {t("structure.mailbox")}
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error && <div className="alert error">{error}</div>}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 12,
          }}
        >
          <span className="pill ok">{t("structure.savedConfiguration")}</span>
          <button
            className="btn secondary"
            type="button"
            disabled={draft.folders.length === 0}
            onClick={addRoute}
          >
            {t("structure.addCategory")}
          </button>
        </div>

        {draft.routes.length === 0 ? (
          <div className="empty">{t("structure.noRoutes")}</div>
        ) : (
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
                  "minmax(170px,1fr) minmax(170px,1fr) minmax(220px,1fr) 110px",
                gap: 12,
                background: "var(--mf-surface-muted)",
                color: "var(--mf-text-muted)",
                padding: "11px 16px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              <span>{t("structure.category")}</span>
              <span>{t("structure.subcategory")}</span>
              <span>{t("structure.targetFolder")}</span>
              <span>{t("structure.action")}</span>
            </div>
            {draft.routes.map((route, index) => (
              <div
                key={`${index}:${route.category}:${route.subcategory ?? ""}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(170px,1fr) minmax(170px,1fr) minmax(220px,1fr) 110px",
                  gap: 12,
                  alignItems: "center",
                  padding: "13px 16px",
                  borderTop: "1px solid var(--mf-surface-muted)",
                }}
              >
                <input
                  value={route.category}
                  placeholder={t("structure.category")}
                  onChange={(event) =>
                    updateRoute(index, { category: event.target.value })
                  }
                />
                <input
                  value={route.subcategory ?? ""}
                  placeholder={t("structure.subcategory")}
                  onChange={(event) =>
                    updateRoute(index, {
                      subcategory: event.target.value || null,
                    })
                  }
                />
                <select
                  value={route.folder_id}
                  onChange={(event) =>
                    updateRoute(index, { folder_id: event.target.value })
                  }
                >
                  {draft.folders.map((folder) => (
                    <option key={folder.internal_id} value={folder.internal_id}>
                      {folder.mailbox_name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => removeRoute(index)}
                >
                  {t("structure.remove")}
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 8,
            background: "var(--mf-surface-muted)",
            color: "var(--mf-text-secondary)",
            fontSize: 12,
          }}
        >
          {draft.routes.length} {t("structure.classificationRoutes")} · {targetCount}{" "}
          {t("structure.targetFolders")}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
          }}
        >
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              saveStructureDraft(draft);
              router.push(
                `/app/settings/folder-discovery?account=${encodeURIComponent(draft.account_id)}`,
              );
            }}
          >
            {t("structure.back")}
          </button>
          <button className="btn" type="button" onClick={next}>
            {t("structure.nextReview")}
          </button>
        </div>
      </section>
    </SettingsShell>
  );
}
