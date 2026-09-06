"use client";

import { SettingsShell, settingsShellStyles as s } from "@/components/settings-shell";
import { useI18n } from "@/lib/i18n";
import {
  applyStructure,
  clearStructureDraft,
  readStructureDraft,
  saveStructureDraft,
  type StructureApplyResult,
  type StructureDraft,
} from "@/lib/structure-setup";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function StructureReviewPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [accountId, setAccountId] = useState("");
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [result, setResult] = useState<StructureApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("account") ?? "";
    setAccountId(id);
    setDraft(id ? readStructureDraft(id) : null);
  }, []);

  const routeByFolder = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!draft) return map;
    for (const route of draft.routes) {
      const label = route.subcategory ? `${route.category} / ${route.subcategory}` : route.category;
      map.set(route.folder_id, [...(map.get(route.folder_id) ?? []), label]);
    }
    return map;
  }, [draft]);

  async function apply() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const applied = await applyStructure(draft.account_id, draft);
      setResult(applied);
      clearStructureDraft(draft.account_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("structure.unableApply"));
    } finally {
      setBusy(false);
    }
  }

  if (!draft && !result) {
    return <SettingsShell><section className={s.panel}><div className="empty">{t("structure.noReview")}</div><button className="btn" type="button" style={{ marginTop: 14 }} onClick={() => router.push(`/app/settings/folder-discovery${accountId ? `?account=${encodeURIComponent(accountId)}` : ""}`)}>{t("structure.startFolderDiscovery")}</button></section></SettingsShell>;
  }

  if (result) {
    return <SettingsShell><section className={s.panel}>
      <div style={{ display: "grid", placeItems: "center", textAlign: "center", padding: "36px 18px" }}>
        <span style={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 24, background: "var(--mf-success-soft)", color: "var(--mf-success)", fontSize: 24, fontWeight: 800 }}>✓</span>
        <h2 style={{ margin: "16px 0 6px" }}>{t("structure.applied")}</h2>
        <p className="muted" style={{ maxWidth: 560, lineHeight: 1.55 }}>{t("structure.appliedSubtitle")}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}><span className="pill ok">{result.reused_folders.length} {t("structure.reused")}</span><span className="pill">{result.created_folders.length} {t("structure.created")}</span><span className="pill">{Object.keys(result.tag_mappings).length} {t("structure.tagMappings")}</span></div>
        <button className="btn" type="button" style={{ marginTop: 22 }} onClick={() => router.push("/app/settings/folders")}>{t("structure.backFoldersTags")}</button>
      </div>
    </section></SettingsShell>;
  }

  const current = draft as StructureDraft;
  const createCount = current.folders.filter((item) => item.action === "create").length;
  const reuseCount = current.folders.filter((item) => item.action === "reuse").length;

  return (
    <SettingsShell>
      <section className={s.panel} style={{ background: "transparent", border: 0, padding: 0 }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
          <div><h1 style={{ margin: 0, fontSize: 24 }}>{t("structure.reviewApply")}</h1><p className="muted" style={{ margin: "4px 0 0" }}>{t("structure.reviewApplySubtitle")}</p></div>
          <span style={{ borderRadius: 999, background: "var(--mf-primary-soft)", color: "var(--mf-primary)", padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>{t("structure.step3")}</span>
        </header>

        <div style={{ border: "1px solid var(--mf-primary)", borderRadius: 8, padding: 15, background: "var(--mf-primary-soft)", color: "var(--mf-primary)", fontWeight: 700, marginBottom: 16 }}>{current.folders.length} {t("structure.foldersMapped")} · {createCount} {t("structure.toCreate")} · {reuseCount} {t("structure.toReuse")} · {current.routes.length} {t("structure.classificationRoutes")}</div>
        {error && <div className="alert error">{error}</div>}

        <div style={{ border: "1px solid var(--mf-border)", borderRadius: 8, overflow: "hidden", background: "var(--mf-surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(250px,1fr) 160px", gap: 16, background: "var(--mf-surface-muted)", color: "var(--mf-text-muted)", padding: "11px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}><span>{t("structure.folderName")}</span><span>{t("structure.mappedCategories")}</span><span>{t("structure.status")}</span></div>
          {current.folders.map((folder) => <div key={folder.internal_id} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(250px,1fr) 160px", gap: 16, alignItems: "center", padding: "13px 16px", borderTop: "1px solid var(--mf-surface-muted)" }}>
            <strong style={{ fontSize: 13 }}>{folder.mailbox_name}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{(routeByFolder.get(folder.internal_id) ?? []).join(", ") || "—"}</span>
            <span className={`pill ${folder.action === "reuse" ? "ok" : ""}`}>{folder.action === "reuse" ? t("structure.reuseExisting") : t("structure.createNew")}</span>
          </div>)}
        </div>

        {current.tags.length > 0 && <div style={{ border: "1px solid var(--mf-border)", borderRadius: 8, padding: 16, marginTop: 16, background: "var(--mf-surface)" }}><strong>{t("structure.tagMappings")}</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{current.tags.map((tag) => <span key={tag.internal_id} className="pill">{tag.mailbox_name} · {tag.action}</span>)}</div></div>}

        <div style={{ border: "1px solid var(--mf-warning)", borderRadius: 8, padding: 15, marginTop: 16, background: "color-mix(in srgb, var(--mf-warning) 12%, var(--mf-surface))", color: "var(--mf-warning)", fontSize: 13 }}>{t("structure.safetyNotice")}</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => { saveStructureDraft(current); router.push(`/app/settings/category-mapping?account=${encodeURIComponent(current.account_id)}`); }}>{t("structure.back")}</button>
          <button className="btn" type="button" disabled={busy} onClick={() => void apply()}>{busy ? t("structure.applying") : t("structure.applyChanges")}</button>
        </div>
      </section>
    </SettingsShell>
  );
}
