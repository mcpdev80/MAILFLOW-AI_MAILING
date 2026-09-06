"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import type { SecuritySettingsController, UserPasskey } from "./use-security-settings";

export function SecuritySettingsUi({ controller }: { controller: SecuritySettingsController }) {
  const { t } = useI18n();
  return (
    <main className="container" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1>{t("security.title")}</h1>
      <p className="muted">{t("security.description")}</p>
      {controller.error && <div className="alert error">{securityError(controller.error, t)}</div>}
      {controller.needsRecentAuth && <RecentAuthNotice />}
      <AddPasskey controller={controller} />
      <PasskeyList controller={controller} />
      <RecoveryCard />
    </main>
  );
}

function RecentAuthNotice() {
  const { t } = useI18n();
  return <div className="alert">{t("security.recentAuth")} <Link href="/login?redirect=/app/settings/security">{t("security.signInAgain")}</Link></div>;
}

function AddPasskey({ controller }: { controller: SecuritySettingsController }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("security.addTitle")}</h2>
      <form onSubmit={(event) => { event.preventDefault(); void controller.add(); }}>
        <label className="field"><span>{t("security.deviceName")}</span><input value={controller.name} maxLength={100} placeholder={t("security.devicePlaceholder")} onChange={(event) => controller.setName(event.target.value)} /></label>
        <button className="btn" type="submit" disabled={controller.busy}>{t("security.add")}</button>
      </form>
    </section>
  );
}

function PasskeyList({ controller }: { controller: SecuritySettingsController }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("security.registered")}</h2>
      {controller.loading ? <p className="muted">{t("common.loading")}</p> : controller.passkeys.length === 0 ? <p className="muted">{t("security.empty")}</p> : <div style={{ display: "grid", gap: 10 }}>{controller.passkeys.map((passkey) => <PasskeyCard key={passkey.id} passkey={passkey} controller={controller} />)}</div>}
    </section>
  );
}

function PasskeyCard({ passkey, controller }: { passkey: UserPasskey; controller: SecuritySettingsController }) {
  const { t, locale } = useI18n();
  const name = passkey.name || t("security.unnamed");
  async function rename() {
    const next = window.prompt(t("security.renamePrompt"), passkey.name ?? "")?.trim();
    if (next) await controller.rename(passkey, next);
  }
  async function remove() {
    const prompt = t("security.deleteConfirm").replace("{name}", name);
    if (window.confirm(prompt)) await controller.remove(passkey);
  }
  return (
    <article className="card" style={{ margin: 0 }}>
      <strong>{name}</strong>
      <p className="muted">{t("security.created")}: {formatDate(passkey.createdAt, locale)} · {t("security.type")}: {passkey.deviceType || "—"}{passkey.backedUp ? ` · ${t("security.backedUp")}` : ""}</p>
      <div style={{ display: "flex", gap: 8 }}><button className="btn secondary" type="button" disabled={controller.busy} onClick={() => void rename()}>{t("security.rename")}</button><button className="btn danger" type="button" disabled={controller.busy} onClick={() => void remove()}>{t("security.delete")}</button></div>
    </article>
  );
}

function RecoveryCard() {
  const { t } = useI18n();
  return <section className="card"><h2>{t("security.recoveryTitle")}</h2><p>{t("security.recovery")}</p></section>;
}

function formatDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

function securityError(value: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === "security_load_failed") return t("security.loadFailed");
  if (value === "security_add_failed") return t("security.addFailed");
  if (value === "security_rename_failed") return t("security.renameFailed");
  if (value === "security_delete_failed" || value === "security_update_failed") return t("security.deleteFailed");
  return value;
}
