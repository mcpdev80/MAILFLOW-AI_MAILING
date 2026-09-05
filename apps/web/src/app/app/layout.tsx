"use client";

import { attentionApi } from "@/lib/attention-api";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const { t } = useI18n();

  useEffect(() => {
    let active = true;
    attentionApi
      .notifications()
      .then((center) => {
        if (active) setUnread(center.unread);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <nav
        aria-label="Mailflow"
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border, #ddd)",
          flexWrap: "wrap",
        }}
      >
        <Link href="/app/dashboard">
          <strong>Mailflow</strong>
        </Link>
        <Link href="/app/dashboard">{t("nav.dashboard")}</Link>
        <Link href="/app/search">Search</Link>
        <Link href="/app/mail">{t("nav.mail")}</Link>
        <Link href="/app/review">{t("nav.review")}</Link>
        <Link href="/app/notifications">
          {t("nav.notifications")}
          {unread > 0 ? ` (${unread})` : ""}
        </Link>
        <Link href="/app/daily-summary">{t("nav.dailySummary")}</Link>
        <Link href="/app/settings/preferences">{t("nav.settings")}</Link>
      </nav>
      {children}
    </>
  );
}
