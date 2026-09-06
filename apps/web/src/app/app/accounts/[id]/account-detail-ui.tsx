"use client";

import { useI18n } from "@/lib/i18n";
import type { Cycle } from "@/lib/types";
import Link from "next/link";
import { ActionPolicyCard } from "./ActionPolicyCard";
import type { useAccountDetail } from "./use-account-detail";

type Controller = ReturnType<typeof useAccountDetail>;

export function AccountDetailUi({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  const error = accountMessage(controller.error, t);
  const notice = accountMessage(controller.notice, t);
  return (
    <main className="container" style={{ maxWidth: 1440, margin: "0 auto" }}>
      <p><Link href="/app/dashboard">← {t("account.back")}</Link></p>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}
      {controller.account && <AccountContent controller={controller} />}
    </main>
  );
}

function AccountContent({ controller }: { controller: Controller }) {
  return (
    <>
      <AccountHeader controller={controller} />
      {!controller.contentAccessible && <ManageOnlyNotice />}
      {controller.session?.user?.id && controller.permissions.canManageOwnership && <MailboxAccess controller={controller} />}
      <ActionPolicyCard account={controller.account!} canManage={controller.permissions.canManageOwnership} onSaved={controller.setAccount} />
      {controller.contentAccessible && <CycleOverview controller={controller} />}
    </>
  );
}

function AccountHeader({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  const account = controller.account!;
  async function disconnect() {
    if (window.confirm(t("account.disconnectConfirm"))) await controller.disconnect();
  }
  return (
    <header style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{account.username}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {controller.contentAccessible && <Link className="btn secondary" href={`/app/accounts/${controller.id}/decision-memory`}>{t("account.learned")}</Link>}
          {controller.contentAccessible && <button className="btn" type="button" disabled={controller.busy} onClick={() => void controller.runNow()}>{controller.busy ? t("account.working") : t("account.run")}</button>}
          {controller.permissions.canManageOwnership && <button className="btn danger" type="button" disabled={controller.busy} onClick={() => void disconnect()}>{t("account.disconnect")}</button>}
        </div>
      </div>
      <p className="muted">{account.imap_host}:{account.imap_port} · {t("account.every")} {account.interval_minutes} {t("account.minutes")} · {account.is_active ? t("account.active") : t("account.paused")} · {account.ownership_mode}</p>
    </header>
  );
}

function ManageOnlyNotice() {
  const { t } = useI18n();
  return <div className="alert">{t("account.manageOnly")}</div>;
}

function MailboxAccess({ controller }: { controller: Controller }) {
  const account = controller.account!;
  if (account.ownership_mode === "private" && controller.permissions.isPrivateOwner) return <PrivateAccess controller={controller} />;
  if (account.ownership_mode === "shared" && controller.permissions.canManageShared) return <SharedAccess controller={controller} />;
  return null;
}

function PrivateAccess({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t("account.access")}</h2>
      <p className="muted">{t("account.privateInfo")}</p>
      <MemberChecklist controller={controller} label={t("account.shareMembers")} />
      <button className="btn secondary" type="button" disabled={controller.busy} onClick={() => void controller.makeShared()}>{t("account.convertShared")}</button>
      <hr style={{ margin: "20px 0" }} />
      <OwnerPicker controller={controller} label={t("account.transferPrivate")} placeholder={t("account.selectMember")} excludeCurrent />
      <button className="btn secondary" type="button" disabled={controller.busy || !controller.transferUserId} onClick={() => void confirmTransfer(controller)}>{t("account.transfer")}</button>
    </section>
  );
}

function SharedAccess({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t("account.access")}</h2>
      <p className="muted">{t("account.sharedInfo")}</p>
      <MemberChecklist controller={controller} label={t("account.membersAccess")} />
      <button className="btn secondary" type="button" disabled={controller.busy} onClick={() => void controller.saveSharedAccess()}>{t("account.saveAccess")}</button>
      <hr style={{ margin: "20px 0" }} />
      <OwnerPicker controller={controller} label={t("account.convertPrivate")} placeholder={t("account.selectOwner")} />
      <button className="btn secondary" type="button" disabled={controller.busy || !controller.transferUserId} onClick={() => void controller.makePrivate()}>{t("account.makePrivate")}</button>
    </section>
  );
}

function MemberChecklist({ controller, label }: { controller: Controller; label: string }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend>{label}</legend>
      {controller.memberOptions.map((member) => <label key={member.id} style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={controller.selectedSharedUsers.includes(member.id)} onChange={(event) => controller.toggleSharedUser(member.id, event.target.checked)} /><span>{member.label} <span className="muted">· {member.role}</span></span></label>)}
    </fieldset>
  );
}

function OwnerPicker({ controller, label, placeholder, excludeCurrent = false }: { controller: Controller; label: string; placeholder: string; excludeCurrent?: boolean }) {
  const currentUserId = controller.session?.user?.id;
  const options = excludeCurrent ? controller.memberOptions.filter((member) => member.id !== currentUserId) : controller.memberOptions;
  return (
    <label className="field"><span>{label}</span><select value={controller.transferUserId} onChange={(event) => controller.setTransferUserId(event.target.value)}><option value="">{placeholder}</option>{options.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label>
  );
}

async function confirmTransfer(controller: Controller) {
  const { t } = translationOutsideComponent();
  if (window.confirm(t("account.transferConfirm"))) await controller.transferPrivateMailbox();
}

function CycleOverview({ controller }: { controller: Controller }) {
  const { t } = useI18n();
  const stats = [[t("account.cycles"), controller.cycles.length], [t("account.emailsProcessed"), controller.totals.emails], [t("account.draftsSaved"), controller.totals.drafts], [t("account.errors"), controller.totals.errors]] as const;
  return (
    <section>
      <div className="stat-grid" style={{ margin: "20px 0" }}>{stats.map(([label, value]) => <div className="stat" key={label}><div className="n">{value}</div><div className="l">{label}</div></div>)}</div>
      <CycleHistory cycles={controller.cycles} />
    </section>
  );
}

function CycleHistory({ cycles }: { cycles: Cycle[] }) {
  const { t, locale } = useI18n();
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{t("account.cycleHistory")}</h2>
      {cycles.length === 0 ? <p className="muted">{t("account.noCycles")}</p> : <table className="table"><thead><tr><th>{t("account.when")}</th><th>{t("account.emails")}</th><th>{t("account.drafts")}</th><th>{t("account.errors")}</th><th>{t("account.duration")}</th></tr></thead><tbody>{cycles.map((cycle) => <CycleRow key={cycle.id} cycle={cycle} locale={locale} />)}</tbody></table>}
    </div>
  );
}

function CycleRow({ cycle, locale }: { cycle: Cycle; locale: string }) {
  return <tr><td className="muted">{new Date(cycle.created_at).toLocaleString(locale)}</td><td>{cycle.emails_processed}</td><td>{cycle.drafts_saved}</td><td>{cycle.error_count}</td><td className="muted">{cycle.duration_ms != null ? `${cycle.duration_ms} ms` : "—"}</td></tr>;
}

function accountMessage(value: string | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!value) return null;
  const messages: Record<string, string> = {
    shared_access_updated: t("account.sharedUpdated"), mailbox_shared: t("account.nowShared"), mailbox_private: t("account.nowPrivate"),
    select_private_owner: t("account.selectPrivateOwner"), select_new_owner: t("account.selectNewOwner"),
  };
  return messages[value] ?? value;
}

function translationOutsideComponent(): ReturnType<typeof useI18n> {
  throw new Error("translationOutsideComponent must not execute");
}
