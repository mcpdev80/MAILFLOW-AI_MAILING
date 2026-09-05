"use client";

import { LOCALE_NAMES, LOCALES, type Locale, useI18n } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
      }}
    >
      {!compact && <span>{t("common.language")}</span>}
      <select
        aria-label={t("common.language")}
        value={locale}
        onChange={(event) => void setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {LOCALE_NAMES[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
