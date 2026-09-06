"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";
import { useI18n } from "@/lib/i18n";
import {
  readStructureDraft,
  saveStructureDraft,
  type StructureDraft,
} from "@/lib/structure-setup";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CategoryMappingPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [accountId, setAccountId] = useState("");
  const [draft, setDraft] = useState<StructureDraft | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("account") ?? "";
    setAccountId(id);
    setDraft(id ? readStructureDraft(id) : null);
  }, []);

  function updateRoute(index: number, folderId: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            routes: current.routes.map((route, routeIndex) =>
              routeIndex === index ? { ...route, folder_id: folderId } : route,
            ),
          }
        : current,
    );
  }

  function next() {
    if (!draft) return;
    saveStructureDraft(draft);
    router.push(
      `/app/settings/structure-review?account=${encodeURIComponent(draft.account_id)}`,
    );
  }

  if (!draft) {
    return (
      <SettingsShell>
        <section className={s.panel}>
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

  const folderName = new Map(
    draft.folders.map((item) => [item.internal_id, item.mailbox_name]),
  );
  const targetCount = new Set(
    draft.routes.map((route) => folderName.get(route.folder_id)),
  ).size;

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
              {t("structure.categoryMapping")}
            </h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {t("structure.categoryMappingSubtitle")}
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
            {t("structure.step2")}
          </span>
        </header>

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
                  "minmax(200px,1fr) minmax(220px,1fr) 150px",
                gap: 16,
                background: "var(--mf-surface-muted)",
                color: "var(--mf-text-muted)",
                padding: "11px 16px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              <span>{t("structure.classification")}</span>
              <span>{t("structure.targetFolder")}</span>
              <span>{t("structure.action")}</span>
            </div>
            {draft.routes.map((route, index) => (
              <div
                key={`${route.category}:${route.subcategory ?? ""}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(200px,1fr) minmax(220px,1fr) 150px",
                  gap: 16,
                  alignItems: "center",
                  padding: "13px 16px",
                  borderTop: "1px solid var(--mf-surface-muted)",
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>{route.category}</strong>
                  {route.subcategory && (
                    <div
                      className="muted"
                      style={{ marginTop: 3, fontSize: 11 }}
                    >
                      {route.subcategory}
                    </div>
                  )}
                </div>
                <select
                  value={route.folder_id}
                  onChange={(event) => updateRoute(index, event.target.value)}
                >
                  {draft.folders.map((folder) => (
                    <option key={folder.internal_id} value={folder.internal_id}>
                      {folder.mailbox_name}
                    </option>
                  ))}
                </select>
                <span
                  className={`pill ${draft.folders.find((folder) => folder.internal_id === route.folder_id)?.action === "reuse" ? "ok" : ""}`}
                >
                  {draft.folders.find(
                    (folder) => folder.internal_id === route.folder_id,
                  )?.action === "reuse"
                    ? t("structure.reuseExisting")
                    : t("structure.createNew")}
                </span>
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
          {draft.routes.length} {t("structure.classificationRoutes")} ·{" "}
          {targetCount} {t("structure.targetFolders")}
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
