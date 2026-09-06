"use client";

import { api } from "@/lib/api";
import { useAppearance } from "@/lib/appearance-preferences";
import { attentionApi } from "@/lib/attention-api";
import { useSession } from "@/lib/auth-client";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./app-shell.module.css";

type NavItem = {
  href: string;
  label: TranslationKey | null;
  fallback: string;
  glyph: string;
  badge?: number | null;
};
type ShellState = {
  healthy: boolean | null;
  reviewCount: number | null;
  notificationCount: number | null;
};

function initials(name?: string | null, email?: string | null): string {
  const source = (name || email || "").trim();
  if (!source) return "–";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function useShellState(): ShellState {
  const [state, setState] = useState<ShellState>({ healthy: null, reviewCount: null, notificationCount: null });
  useEffect(() => {
    let active = true;
    Promise.allSettled([api.health(), attentionApi.review(), attentionApi.notifications()]).then(
      ([health, review, notifications]) => {
        if (!active) return;
        setState({
          healthy: health.status === "fulfilled" && health.value.status === "ok" && health.value.db === "up",
          reviewCount: review.status === "fulfilled" ? review.value.counters.review_needed : null,
          notificationCount: notifications.status === "fulfilled" ? notifications.value.unread : null,
        });
      },
    );
    return () => { active = false; };
  }, []);
  return state;
}

function Sidebar({ reviewCount }: { reviewCount: number | null }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const user = useSession().data?.user;
  const items = useMemo<NavItem[]>(
    () => [
      { href: "/app/dashboard", label: "nav.dashboard", fallback: "Dashboard", glyph: "▦" },
      { href: "/app/mail", label: "nav.mail", fallback: "Mail", glyph: "■" },
      { href: "/app/review", label: "nav.review", fallback: "Review", glyph: "●", badge: reviewCount },
      { href: "/app/search", label: "nav.search", fallback: "Search", glyph: "●" },
      { href: "/app/processing", label: null, fallback: "Processing", glyph: "■" },
      { href: "/app/accounts", label: "nav.mailboxes", fallback: "Mailboxes", glyph: "■" },
      { href: "/app/learning", label: null, fallback: "Learning", glyph: "■" },
      { href: "/app/settings/preferences", label: "nav.settings", fallback: "Settings", glyph: "•" },
    ],
    [reviewCount],
  );
  return (
    <aside className={styles.sidebar} data-testid="app-sidebar">
      <div className={styles.sidebarTop}>
        <Link href="/app/dashboard" className={styles.brand} aria-label="Mailflow">
          <span className={styles.brandMark}>M</span>
          <span className={styles.brandText}>Mailflow</span>
        </Link>
        <nav className={styles.nav} aria-label="Mailflow">
          {items.map((item, index) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <div key={item.href}>
                {index === 4 && <div className={styles.separator} />}
                <Link href={item.href} className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}>
                  <span className={styles.navGlyph} aria-hidden="true">{item.glyph}</span>
                  <span className={styles.navLabel}>{item.label ? t(item.label) : item.fallback}</span>
                  {item.badge != null && item.badge > 0 && <span className={styles.badge}>{item.badge}</span>}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
      <Link href="/app/settings/preferences" className={styles.profile}>
        <span className={styles.avatar}>{initials(user?.name, user?.email)}</span>
        <span className={styles.profileMeta}>
          <span className={styles.profileName}>{user?.name || user?.email || ""}</span>
          {user?.email && <span className={styles.profileEmail}>{user.email}</span>}
        </span>
        <span className={styles.profileChevron} aria-hidden="true">⌄</span>
      </Link>
    </aside>
  );
}

function StatusPill({ state }: { state: ShellState }) {
  const { t } = useI18n();
  const statusText = state.healthy == null ? t("shell.checking") : state.healthy ? t("shell.operational") : t("shell.degraded");
  return (
    <div className={styles.statusWrap} data-testid="system-status">
      <span className={styles.statusLabel}>{t("shell.systemStatus")}:</span>
      <span className={`${styles.status} ${state.healthy === false ? styles.statusDegraded : ""}`}>
        <span className={styles.statusDot} aria-hidden="true" />
        {statusText}
      </span>
    </div>
  );
}

function Header({ state, showStatus }: { state: ShellState; showStatus: boolean }) {
  const { t } = useI18n();
  const user = useSession().data?.user;
  return (
    <header className={styles.header} data-testid="app-header">
      {showStatus ? <StatusPill state={state} /> : <span />}
      <div className={styles.headerActions}>
        <Link href="/app/notifications" className={styles.notificationLink} aria-label={t("shell.notifications")}>
          <span aria-hidden="true">●</span>
          {state.notificationCount != null && state.notificationCount > 0 && <span className={styles.notificationDot} />}
        </Link>
        <Link href="/app/settings/preferences" className={styles.headerAvatar} aria-label={user?.name || user?.email || "Profile"}>
          {initials(user?.name, user?.email)}
        </Link>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const state = useShellState();
  const appearance = useAppearance();
  const statusPosition = appearance.workspaceLayout === "custom"
    ? (appearance.workspaceCustomConfig?.system_status_position ?? "top")
    : "top";
  return (
    <div className={styles.shell} data-testid="app-shell">
      <Sidebar reviewCount={state.reviewCount} />
      <div className={styles.content}>
        <Header state={state} showStatus={statusPosition === "top"} />
        <div className={styles.main} data-testid="app-content">{children}</div>
        {statusPosition === "bottom" && <footer className={styles.statusFooter}><StatusPill state={state} /></footer>}
      </div>
    </div>
  );
}
