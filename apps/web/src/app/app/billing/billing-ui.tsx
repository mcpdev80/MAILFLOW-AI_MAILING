"use client";

import { useI18n } from "@/lib/i18n";
import type { PlanStatus } from "@/lib/types";
import Link from "next/link";
import { TEAM_MIN_SEATS, type useBillingPage } from "./use-billing-page";

type BillingState = ReturnType<typeof useBillingPage>;

export function BillingUi({ state }: { state: BillingState }) {
  const { t } = useI18n();
  return (
    <main className="container">
      <p><Link href="/app/dashboard">← {t("billing.back")}</Link></p>
      <h1>{t("billing.title")}</h1>
      {state.error && <div className="alert error">{state.error}</div>}
      {state.status && <BillingContent state={state} status={state.status} />}
    </main>
  );
}

function BillingContent({ state, status }: { state: BillingState; status: PlanStatus }) {
  return (
    <>
      <PlanCard status={status} />
      {status.billing_enabled ? <SubscriptionCard state={state} status={status} /> : <SelfHostedCard />}
    </>
  );
}

function PlanCard({ status }: { status: PlanStatus }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("billing.currentPlan")}: {status.label}{status.plan === "team" && <span className="muted"> · {status.seats} {t("billing.seats")}</span>} {!status.billing_enabled && <span className="pill off">{t("billing.selfHost")}</span>}</h2>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <UsageStat value={`${status.accounts_used}/${limitLabel(status.max_accounts, t("billing.unlimited"))}`} label={t("billing.mailboxes")} />
        <UsageStat value={`${status.emails_today}/${limitLabel(status.max_emails_per_day, t("billing.unlimited"))}`} label={t("billing.emailsToday")} />
      </div>
    </section>
  );
}

function UsageStat({ value, label }: { value: string; label: string }) {
  return <div className="stat"><div className="n">{value}</div><div className="l">{label}</div></div>;
}

function SubscriptionCard({ state, status }: { state: BillingState; status: PlanStatus }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("billing.manage")}</h2>
      {status.plan === "free" ? <UpgradeChoices state={state} /> : <button type="button" className="btn" disabled={state.busy} onClick={() => void state.openPortal()}>{t("billing.manageCancel")}</button>}
    </section>
  );
}

function UpgradeChoices({ state }: { state: BillingState }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <button type="button" className="btn" disabled={state.busy} onClick={() => void state.upgrade("pro")}>{t("billing.upgradePro")}</button>
      <label className="field" htmlFor="team-seats" style={{ marginBottom: 0 }}>
        <span>{t("billing.teamSeats")} ({t("billing.minimum")} {TEAM_MIN_SEATS})</span>
        <input id="team-seats" type="number" min={TEAM_MIN_SEATS} max={500} value={state.teamSeats} style={{ width: 112 }} onChange={(event) => state.setTeamSeats(Math.max(TEAM_MIN_SEATS, Number(event.target.value) || 0))} />
      </label>
      <button type="button" className="btn secondary" disabled={state.busy} onClick={() => void state.upgrade("team")}>{t("billing.upgradeTeam").replace("{count}", String(state.teamSeats))}</button>
    </div>
  );
}

function SelfHostedCard() {
  const { t } = useI18n();
  return <section className="card"><p className="muted">{t("billing.selfHostedInfo")}</p></section>;
}

function limitLabel(value: number | null, unlimited: string): string {
  return value === null ? unlimited : String(value);
}
