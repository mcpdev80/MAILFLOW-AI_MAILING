"use client";

import { useI18n } from "@/lib/i18n";
import { useInvitationPage } from "./use-invitation-page";

export function InvitationUi({ invitationId }: { invitationId: string }) {
  const { t } = useI18n();
  const state = useInvitationPage(invitationId);

  if (state.state === "loading") {
    return (
      <main className="container">
        <p>{t("invitation.loading")}</p>
      </main>
    );
  }

  if (state.state === "invalid") {
    return <StatusCard text={t("invitation.invalid")} />;
  }

  if (state.state === "accepted") {
    return <StatusCard text={t("invitation.accepted")} />;
  }

  if (state.state === "declined") {
    return <StatusCard text={t("invitation.declined")} />;
  }

  const invitation = state.invitation;
  if (!invitation) return <StatusCard text={t("invitation.invalid")} />;

  return (
    <main className="container">
      <section className="card">
        <h1>{t("invitation.title")}</h1>
        {invitation.organizationName && (
          <p>
            <strong>{t("invitation.organization")}:</strong> {invitation.organizationName}
          </p>
        )}
        <p>
          <strong>{t("invitation.email")}:</strong> {invitation.email}
        </p>
        <p>
          <strong>{t("invitation.role")}:</strong> {roleLabel(invitation.role, t)}
        </p>
        {state.error && <div className="alert error">{t("invitation.failed")}</div>}
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={state.busy !== null}
            onClick={() => void state.accept()}
          >
            {state.busy === "accept" ? t("invitation.accepting") : t("invitation.accept")}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={state.busy !== null}
            onClick={() => void state.decline()}
          >
            {state.busy === "decline" ? t("invitation.declining") : t("invitation.decline")}
          </button>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ text }: { text: string }) {
  return (
    <main className="container">
      <section className="card">
        <p>{text}</p>
      </section>
    </main>
  );
}

function roleLabel(
  role: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (role === "member") return t("members.role.member");
  if (role === "admin") return t("members.role.admin");
  return role;
}
