"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export function GlobalNav() {
  const { t } = useI18n();

  return (
    <nav className="nav">
      <strong>
        <Link href="/">MailFlow</Link>
      </strong>
      <div className="spacer" />
      <Link href="/app/dashboard">{t("nav.dashboard")}</Link>
      <Link href="/app/billing">{t("nav.billing")}</Link>
      <Link href="/onboarding">{t("nav.getStarted")}</Link>
      <LanguageSwitcher compact />
    </nav>
  );
}
