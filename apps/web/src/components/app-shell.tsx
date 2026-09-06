"use client";

import { api } from "@/lib/api";
import { attentionApi } from "@/lib/attention-api";
import { useSession } from "@/lib/auth-client";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./app-shell.module.css";

type NavItem = {
  href: string;
  label: TranslationKey;
  badge?: number | null;
};

function initials(name?: string | null, email?: string | null): string {
  const source = (name || email || "").trim();
  if (!source) return "–";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const session = useSession();
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [notificationCount, setNotificationCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.health(),
      attentionApi.review(),
      attentionApi.notifications(),
    ]).then(([healthResult, reviewResult, notificationResult]) => {
      if (!active) return;
      setHealthy(
        healthResult.status === "fulfilled" &&
          healthResult.value.status === "ok" &&
          healthResult.value.db === "ok",
      );
      if (reviewResult.status === "fulfilled") {
        setReviewCount(reviewResult.value.counters.review_needed);
      }
      if (notificationResult.status === "fulfilled") {
        setNotificationCount(notificationResult.value.unread);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const navItems = useMemo<NavItem[]>(
    () => [
      { href: "/app/dashboard", label: "nav.dashboard" },
      { href: "/app/mail", label: "nav.mail" },
      { href: "/app/review", label: "nav.review", badge: reviewCount },
      { href: "/app/search", label: "nav.search" },
      { href: "/app/accounts", label: "nav.mailboxes" },
      { href: "/app/settings/preferences", label: "nav.settings" },
    ],
    [reviewCount],
  );

  const user = session.data?.user;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <Link href="/app/dashboard" className={styles.brand}>
            <span className={styles.brandMark}>M</span>
            <span className={styles.brandText}>Mailflow</span>
          </Link>
          <nav className={styles.nav} aria-label="Mailflow">
            {navItems.map((item, index) => (
              <div key={item.href}>
                {index === 4 && <div className={styles.separator} />}
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${
                    isActivePath(pathname, item.href) ? styles.navItemActive : ""
                  }`}
                >
                  <span className={styles.navMarker} aria-hidden="true" />
                  <span className={styles.navLabel}>{t(item.label)}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className={styles.badge}>{item.badge}</span>
                  )}
                </Link>
              </div>
            ))}
          </nav>
        </div>
        <Link href="/app/settings/preferences" className={styles.profile}>
          <span className={styles.avatar}>{initials(user?.name, user?.email)}</span>
          <span className={styles.profileMeta}>
            <span className={styles.profileName}>{user?.name || user?.email || ""}</span>
            {user?.email && <span className={styles.profileEmail}>{user.email}</span>}
          </span>
        </Link>
      </aside>

      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.statusWrap}>
            <span className={styles.statusLabel}>{t("shell.systemStatus")}:</span>
            <span
              className={`${styles.status} ${healthy === false ? styles.statusDegraded : ""}`}
            >
              <span className={styles.statusDot} aria-hidden="true" />
              {healthy === false ? t("shell.degraded") : t("shell.operational")}
            </span>
          </div>
          <div className={styles.headerActions}>
            <Link
              href="/app/notifications"
              className={styles.notificationLink}
              aria-label={t("shell.notifications")}
            >
              <span aria-hidden="true">●</span>
              {notificationCount != null && notificationCount > 0 && (
                <span className={styles.notificationDot} />
              )}
            </Link>
          </div>
        </header>
        <div className={styles.main}>{children}</div>
      </div>
    </div>
  );
}
