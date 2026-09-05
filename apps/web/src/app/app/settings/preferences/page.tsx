"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";

export default function PreferencesPage() {
  const { t } = useI18n();

  return (
    <main className="container">
      <h1>{t("settings.language.title")}</h1>
      <p className="muted">{t("settings.language.description")}</p>
      <div className="card" style={{ maxWidth: "34rem" }}>
        <LanguageSwitcher />
      </div>
    </main>
  );
}
