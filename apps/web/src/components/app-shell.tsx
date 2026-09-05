"use client";

import { attentionApi } from "@/lib/attention-api";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavEntry = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

function NavLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link className={`app-nav-item${active ? " active" : ""}`} href={entry.href}>
      <span className="app-nav-icon" aria-hidden="true">{entry.icon}</span>
      <span>{entry.label}</span>
      {entry.badge ? <span className="app-nav-badge">{entry.badge}</span> : null}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    attentionApi.notifications().then((center) => {
      if (active) setUnread(center.unread);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const primary: NavEntry[] = [
    { href: "/app/dashboard", label: t("nav.dashboard"), icon: "⌂" },
    { href: "/app/mail", label: t("nav.mail"), icon: "✉" },
    { href: "/app/search", label: t("search.title"), icon: "⌕" },
    { href: "/app/review", label: t("nav.review"), icon: "✓", badge: unread },
    { href: "/app/notifications", label: t("nav.notifications"), icon: "●" },
    { href: "/app/daily-summary", label: t("nav.dailySummary"), icon: "≡" },
  ];
  const settings: NavEntry[] = [
    { href: "/app/settings/preferences", label: t("nav.settings"), icon: "⚙" },
  ];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="app-brand" href="/app/dashboard">
          <span className="app-brand-mark" />
          <strong>Mailflow</strong>
        </Link>
        <nav className="app-nav" aria-label="Mailflow">
          {primary.map((entry) => (
            <NavLink key={entry.href} entry={entry} active={isActive(pathname, entry.href)} />
          ))}
          <div className="app-nav-section">{t("nav.settings")}</div>
          {settings.map((entry) => (
            <NavLink key={entry.href} entry={entry} active={isActive(pathname, entry.href)} />
          ))}
        </nav>
      </aside>
      <main className="app-content">{children}</main>
    </div>
  );
}
