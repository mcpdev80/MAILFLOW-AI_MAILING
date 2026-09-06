"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export default function HomePage() {
  const { t } = useI18n();
  return (
    <main className="home-shell">
      <section className="home-hero">
        <div className="home-badge">MailFlow</div>
        <h1>{t("home.tagline")}</h1>
        <p className="home-lead">{t("home.stepAutomation")}</p>
        <div className="home-actions">
          <Link className="btn btn-lg" href="/signup">
            {t("home.getStarted")}
          </Link>
          <Link className="btn secondary btn-lg" href="/login">
            {t("home.openDashboard")}
          </Link>
        </div>
      </section>

      <section className="home-grid" aria-label={t("home.howItWorks")}>
        <article className="feature-card">
          <span className="feature-step">01</span>
          <h2>{t("home.stepProvider")}</h2>
          <p className="muted">{t("home.howItWorks")}</p>
        </article>
        <article className="feature-card">
          <span className="feature-step">02</span>
          <h2>{t("home.stepMailbox")}</h2>
          <p className="muted">{t("home.stepMailbox")}</p>
        </article>
        <article className="feature-card">
          <span className="feature-step">03</span>
          <h2>{t("home.stepAutomation")}</h2>
          <p className="muted">{t("home.tagline")}</p>
        </article>
      </section>
    </main>
  );
}
