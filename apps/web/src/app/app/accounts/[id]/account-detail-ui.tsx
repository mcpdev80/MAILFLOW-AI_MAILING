"use client";

import { useI18n } from "@/lib/i18n";
import type { Cycle, EmailAccount } from "@/lib/types";
import Link from "next/link";
import { ActionPolicyCard } from "./ActionPolicyCard";
import type { useAccountDetail } from "./use-account-detail";

type Controller = ReturnType<typeof useAccountDetail>;

export function AccountDetailUi({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  const error = accountMessage(controller.error, t);
  const notice = accountMessage(controller.notice, t);
  if (!controller.account) return <main className="container"><div className="empty">Loading mailbox…</div></main>;
  const account = controller.account;
  return (
    <main style={{ padding: 24, maxWidth: 1280, width: "100%" }}>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 18 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}><Link href="/app/settings/mailboxes" style={{ textDecoration: "none" }}>Mailboxes</Link> › {account.username}</div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{account.username}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {controller.contentAccessible && <button className="btn" type="button" disabled={controller.busy} onClick={() => void controller.runNow()}>{controller.busy ? t("account.working") : "Force Sync Now"}</button>}
          {controller.permissions.canManageOwnership && <button className="btn secondary" type="button" disabled={controller.busy} onClick={() => { if (window.confirm(t("account.disconnectConfirm"))) void controller.disconnect(); }}>{t("account.disconnect")}</button>}
        </div>
      </div>

      <nav style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--mf-border)", marginBottom: 18 }}>
        <span style={{ padding: "0 4px 11px", color: "var(--mf-primary)", borderBottom: "2px solid var(--mf-primary)", fontWeight: 700 }}>Overview</span>
        <Link href={`/app/settings/folder-discovery?account=${account.id}`} style={{ padding: "0 4px 11px", color: "var(--mf-text-muted)", textDecoration: "none" }}>Folders & Tags</Link>
        <Link href="/app/settings/rules" style={{ padding: "0 4px 11px", color: "var(--mf-text-muted)", textDecoration: "none" }}>Rules</Link>
        {controller.contentAccessible && <Link href={`/app/accounts/${account.id}/decision-memory`} style={{ padding: "0 4px 11px", color: "var(--mf-text-muted)", textDecoration: "none" }}>Learning</Link>}
      </nav>

      {!controller.contentAccessible && <div className="alert">{t("account.manageOnly")}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 20 }}>
        <DetailCard title="Connection Details">
          <KeyValue label="Protocol" value={account.provider_type === "generic_imap" ? "IMAP" : account.provider_type} />
          <KeyValue label="Server Address" value={account.imap_host} />
          <KeyValue label="Port" value={String(account.imap_port)} />
          <KeyValue label="TLS" value={account.use_ssl ? "Active" : "Off"} accent={account.use_ssl} />
          <KeyValue label="Ownership" value={account.ownership_mode} />
        </DetailCard>
        <DetailCard title="Sync Status">
          <KeyValue label="Status" value={account.is_active ? "Active" : "Paused"} accent={account.is_active} />
          <KeyValue label="Sync Interval" value={`Every ${account.interval_minutes} minutes`} />
          <KeyValue label="Cycles" value={String(controller.cycles.length)} />
          <KeyValue label="Processed" value={String(controller.totals.emails)} />
          <KeyValue label="Failed / Errors" value={String(controller.totals.errors)} />
        </DetailCard>
      </div>

      {controller.contentAccessible && <section style={{ marginTop: 20 }}><DetailCard title="System Health & Analytics"><div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 18 }}><Metric label="Overall Health" value={controller.totals.errors === 0 ? "Excellent" : "Attention"} accent={controller.totals.errors === 0} /><Metric label="Emails processed" value={String(controller.totals.emails)} /><Metric label="Drafts saved" value={String(controller.totals.drafts)} /><Metric label="Last error" value={controller.totals.errors === 0 ? "None" : `${controller.totals.errors} errors`} /></div></DetailCard></section>}

      <section style={{ marginTop: 20 }}>
        <ActionPolicyCard account={account} canManage={controller.permissions.canManageOwnership} onSaved={controller.setAccount} />
      </section>

      {controller.session?.user?.id && controller.permissions.canManageOwnership && <section style={{ marginTop: 20 }}><MailboxAccess controller={controller} account={account} /></section>}
      {controller.contentAccessible && <section style={{ marginTop: 20 }}><CycleHistory cycles={controller.cycles} /></section>}
    </main>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={{ border: "1px solid var(--mf-border)", borderRadius: 8, padding: 24, background: "var(--mf-surface)" }}><h2 style={{ margin: "0 0 16px", fontSize: 16 }}>{title}</h2><div style={{ borderTop: "1px solid var(--mf-border)", paddingTop: 14, display: "grid", gap: 11 }}>{children}</div></section>;
}
function KeyValue({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}><span className="muted">{label}</span><strong style={{ color: accent ? "var(--mf-success)" : "var(--mf-text)" }}>{value}</strong></div>;
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div><strong style={{ fontSize: 16, color: accent ? "var(--mf-success)" : "var(--mf-text)" }}>{value}</strong></div>;
}

function MailboxAccess({ controller, account }: { controller: Controller; account: EmailAccount }) {
  if (account.ownership_mode === "private" && controller.permissions.isPrivateOwner) return <PrivateAccess controller={controller} />;
  if (account.ownership_mode === "shared" && controller.permissions.canManageShared) return <SharedAccess controller={controller} />;
  return null;
}
function PrivateAccess({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  return <section style={{ border: "1px solid var(--mf-border)", borderRadius: 8, background: "var(--mf-surface)", padding: 24 }}><h2 style={{ marginTop: 0, fontSize: 16 }}>{t("account.access")}</h2><p className="muted">{t("account.privateInfo")}</p><MemberChecklist controller={controller} label={t("account.shareMembers")} /><div style={{ display: "flex", gap: 8, marginTop: 14 }}><button className="btn secondary" type="button" disabled={controller.busy} onClick={() => void controller.makeShared()}>{t("account.convertShared")}</button></div><div style={{ borderTop: "1px solid var(--mf-border)", marginTop: 18, paddingTop: 18 }}><OwnerPicker controller={controller} label={t("account.transferPrivate")} placeholder={t("account.selectMember")} excludeCurrent /><button className="btn secondary" type="button" style={{ marginTop: 10 }} disabled={controller.busy || !controller.transferUserId} onClick={() => { if (window.confirm(t("account.transferConfirm"))) void controller.transferPrivateMailbox(); }}>{t("account.transfer")}</button></div></section>;
}
function SharedAccess({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  return <section style={{ border: "1px solid var(--mf-border)", borderRadius: 8, background: "var(--mf-surface)", padding: 24 }}><h2 style={{ marginTop: 0, fontSize: 16 }}>{t("account.access")}</h2><p className="muted">{t("account.sharedInfo")}</p><MemberChecklist controller={controller} label={t("account.membersAccess")} /><button className="btn secondary" type="button" style={{ marginTop: 12 }} disabled={controller.busy} onClick={() => void controller.saveSharedAccess()}>{t("account.saveAccess")}</button><div style={{ borderTop: "1px solid var(--mf-border)", marginTop: 18, paddingTop: 18 }}><OwnerPicker controller={controller} label={t("account.convertPrivate")} placeholder={t("account.selectOwner")} /><button className="btn secondary" type="button" style={{ marginTop: 10 }} disabled={controller.busy || !controller.transferUserId} onClick={() => void controller.makePrivate()}>{t("account.makePrivate")}</button></div></section>;
}
function MemberChecklist({ controller, label }: { controller: Controller; label: string }) {
  return <fieldset className="field" style={{ border: 0, padding: 0 }}><legend>{label}</legend>{controller.memberOptions.map((member) => <label key={member.id} style={{ display: "flex", gap: 8, alignItems: "center" }}><input style={{ width: 16, minHeight: 16 }} type="checkbox" checked={controller.selectedSharedUsers.includes(member.id)} onChange={(event) => controller.toggleSharedUser(member.id, event.target.checked)} /><span>{member.label} <span className="muted">· {member.role}</span></span></label>)}</fieldset>;
}
function OwnerPicker({ controller, label, placeholder, excludeCurrent = false }: { controller: Controller; label: string; placeholder: string; excludeCurrent?: boolean }) {
  const currentUserId = controller.session?.user?.id;
  const options = excludeCurrent ? controller.memberOptions.filter((member) => member.id !== currentUserId) : controller.memberOptions;
  return <label className="field"><span>{label}</span><select value={controller.transferUserId} onChange={(event) => controller.setTransferUserId(event.target.value)}><option value="">{placeholder}</option>{options.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label>;
}
function CycleHistory({ cycles }: { cycles: Cycle[] }) {
  const { t, locale } = useI18n();
  return <div style={{ border: "1px solid var(--mf-border)", borderRadius: 8, padding: 24, background: "var(--mf-surface)" }}><h2 style={{ marginTop: 0, fontSize: 16 }}>{t("account.cycleHistory")}</h2>{cycles.length === 0 ? <p className="muted">{t("account.noCycles")}</p> : <table className="table"><thead><tr><th>{t("account.when")}</th><th>{t("account.emails")}</th><th>{t("account.drafts")}</th><th>{t("account.errors")}</th><th>{t("account.duration")}</th></tr></thead><tbody>{cycles.map((cycle) => <tr key={cycle.id}><td className="muted">{new Date(cycle.created_at).toLocaleString(locale)}</td><td>{cycle.emails_processed}</td><td>{cycle.drafts_saved}</td><td>{cycle.error_count}</td><td className="muted">{cycle.duration_ms != null ? `${cycle.duration_ms} ms` : "—"}</td></tr>)}</tbody></table>}</div>;
}
function accountMessage(value: string | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!value) return null;
  const messages: Record<string, string> = { shared_access_updated: t("account.sharedUpdated"), mailbox_shared: t("account.nowShared"), mailbox_private: t("account.nowPrivate"), select_private_owner: t("account.selectPrivateOwner"), select_new_owner: t("account.selectNewOwner") };
  return messages[value] ?? value;
}
