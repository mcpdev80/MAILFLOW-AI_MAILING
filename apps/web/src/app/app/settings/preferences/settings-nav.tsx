"use client";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import styles from "./preferences.module.css";

const items: TranslationKey[] = [
  "settings.nav.profile",
  "settings.appearance.title",
  "settings.nav.mailboxes",
  "settings.nav.providers",
  "settings.nav.rules",
  "settings.nav.organization",
  "settings.nav.security",
  "settings.nav.retention",
  "settings.nav.billing",
];

export function SettingsNav() {
  const { t } = useI18n();
  return (
    <nav className={styles.sideNav} aria-label={t("settings.title")}>
      {items.map((key) => (
        <span
          key={key}
          className={`${styles.sideItem} ${
            key === "settings.appearance.title" ? styles.sideItemActive : ""
          }`}
        >
          {t(key)}
        </span>
      ))}
    </nav>
  );
}
