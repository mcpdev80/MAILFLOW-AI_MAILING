"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export default function HomePage() {
  const { t } = useI18n();
  return (
    <main className="container">
      <section className="hero">
        <h1>MailFlow</h1>
        <p className="muted">{t("home.tagline")}</p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            marginTop: "1.5rem",
          }}
        >
          <Link className="btn" href="/onboarding">
            {t("home.getStarted")}
          </Link>
          <Link className="btn secondary" href="/app/dashboard">
            {t("home.openDashboard")}
          </Link>
        </div>
      </section>
      <div className="card">
        <h2>{t("home.howItWorks")}</h2>
        <ol className="muted">
          <li>{t("home.stepProvider")}</li>
          <li>{t("home.stepMailbox")}</li>
          <li>{t("home.stepAutomation")}</li>
        </ol>
      </div>
    </main>
  );
}
