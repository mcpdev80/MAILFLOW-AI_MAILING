"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import type { Invitation, Member, MembersController } from "./use-members-page";

export function MembersUi({ controller }: { controller: MembersController }) {
  const { t } = useI18n();
  return (
    <main className="container" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <p><Link href="/app/dashboard">← {t("members.back")}</Link></p>
      <h1>{t("members.title")}</h1>
      {controller.error && <div className="alert error">{membersError(controller.error, t)}</div>}
      {controller.loading ? <div className="card muted">{t("common.loading")}</div> : <MembersContent controller={controller} />}
    </main>
  );
}

function MembersContent({ controller }: { controller: MembersController }) {
  return (
    <>
      <MemberList members={controller.members} />
      <InviteCard controller={controller} />
      {controller.invitations.length > 0 && <InvitationList invitations={controller.invitations} />}
    </>
  );
}

function MemberList({ members }: { members: Member[] }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("members.members")}</h2>
      {members.length === 0 ? <p className="muted">{t("members.empty")}</p> : <ul>{members.map((member) => <li key={member.id}>{member.user?.email ?? member.user?.name ?? member.id} <span className="muted">· {roleLabel(member.role, t)}</span></li>)}</ul>}
    </section>
  );
}

function InviteCard({ controller }: { controller: MembersController }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("members.inviteTitle")}</h2>
      <form onSubmit={(event) => { event.preventDefault(); void controller.invite(); }} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input type="email" required placeholder={t("members.emailPlaceholder")} value={controller.email} onChange={(event) => controller.setEmail(event.target.value)} />
        <select value={controller.role} onChange={(event) => controller.setRole(event.target.value as "member" | "admin")}>
          <option value="member">{t("members.role.member")}</option>
          <option value="admin">{t("members.role.admin")}</option>
        </select>
        <button className="btn" type="submit" disabled={controller.busy}>{controller.busy ? t("members.inviting") : t("members.invite")}</button>
      </form>
    </section>
  );
}

function InvitationList({ invitations }: { invitations: Invitation[] }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("members.pending")}</h2>
      <ul>{invitations.map((invitation) => <li key={invitation.id}>{invitation.email} <span className="muted">· {roleLabel(invitation.role, t)} · {invitation.status}</span></li>)}</ul>
    </section>
  );
}

function roleLabel(role: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (role === "admin") return t("members.role.admin");
  if (role === "member") return t("members.role.member");
  return role;
}

function membersError(value: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === "members_load_failed") return t("members.loadFailed");
  if (value === "members_invite_failed") return t("members.inviteFailed");
  return value;
}
