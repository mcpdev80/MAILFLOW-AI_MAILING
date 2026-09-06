"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./settings-shell.module.css";

const items = [
  { href: "/app/settings/profile", label: "Profile & Account" },
  { href: "/app/settings/preferences", label: "Appearance & Workspace" },
  { href: "/app/settings/mailboxes", label: "Mailboxes" },
  { href: "/app/settings/models", label: "AI Providers" },
  { href: "/app/settings/rules", label: "Rules & Actions" },
  { href: "/app/settings/members", label: "Organization" },
  { href: "/app/settings/security", label: "Security & Passkeys" },
  { href: "/app/settings/retention", label: "Data & Retention" },
  { href: "/app/billing", label: "Billing" },
];

const mailboxTools = [
  { href: "/app/settings/folders", label: "Folders & Tags" },
  { href: "/app/settings/folder-discovery", label: "Folder Discovery" },
  { href: "/app/settings/category-mapping", label: "Category Mapping" },
  { href: "/app/settings/review-apply", label: "Review & Apply" },
];

export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <main className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>Settings</h1>
        <p>
          Manage your profile, workspace, security, integrations and mailbox
          behavior
        </p>
      </div>
      <div className={styles.split}>
        <nav className={styles.nav} aria-label="Settings">
          {items.map((item) => (
            <SettingsLink key={item.href} {...item} pathname={pathname} />
          ))}
          <span className={styles.navGroupLabel}>Mailbox Intelligence</span>
          {mailboxTools.map((item) => (
            <SettingsLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>
        {children}
      </div>
    </main>
  );
}

function SettingsLink({
  href,
  label,
  pathname,
}: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
    >
      {label}
    </Link>
  );
}

export { styles as settingsShellStyles };
