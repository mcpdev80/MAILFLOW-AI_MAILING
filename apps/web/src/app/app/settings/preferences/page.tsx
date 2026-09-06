"use client";

import { useI18n } from "@/lib/i18n";
import type { Theme, WorkspaceLayout } from "@/lib/types";
import { SettingsNav } from "./settings-nav";
import styles from "./preferences.module.css";
import { usePreferencesForm } from "./use-preferences-form";

const themes: Theme[] = ["light", "dark", "system"];
const layouts: WorkspaceLayout[] = ["classic", "vertical", "focus", "compact", "wide"];

function ThemeChoice({
  value,
  selected,
  onSelect,
}: {
  value: Theme;
  selected: boolean;
  onSelect: (value: Theme) => void;
}) {
  const { t } = useI18n();
  const preview =
    value === "light"
      ? styles.lightPreview
      : value === "dark"
        ? styles.darkPreview
        : styles.systemPreview;
  return (
    <button
      type="button"
      className={`${styles.themeCard} ${selected ? styles.selected : ""}`}
      onClick={() => onSelect(value)}
    >
      <span className={`${styles.themePreview} ${preview}`} />
      <strong>{t(`settings.appearance.theme.${value}`)}</strong>
    </button>
  );
}

function OptionButton({
  selected,
  label,
  onClick,
  compact = false,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.optionButton} ${compact ? styles.alignmentButton : ""} ${
        selected ? styles.selected : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ThemeSection({ form }: { form: ReturnType<typeof usePreferencesForm> }) {
  const { t } = useI18n();
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings.appearance.theme")}</h3>
      <div className={styles.themeGrid}>
        {themes.map((item) => (
          <ThemeChoice
            key={item}
            value={item}
            selected={form.theme === item}
            onSelect={form.setTheme}
          />
        ))}
      </div>
    </div>
  );
}

function WorkspaceSection({ form }: { form: ReturnType<typeof usePreferencesForm> }) {
  const { t } = useI18n();
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings.appearance.workspace")}</h3>
      <div className={styles.optionRow}>
        {layouts.map((item) => (
          <OptionButton
            key={item}
            selected={form.layout === item}
            label={t(`settings.appearance.layout.${item}`)}
            onClick={() => form.setLayout(item)}
          />
        ))}
      </div>
    </div>
  );
}

function DensitySection({ form }: { form: ReturnType<typeof usePreferencesForm> }) {
  const { t } = useI18n();
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings.appearance.density")}</h3>
      <div className={styles.densityRow}>
        <span>{t("settings.appearance.density.compact")}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="1"
          value={form.density === "compact" ? 0 : 1}
          onChange={(event) =>
            form.setDensity(event.currentTarget.value === "0" ? "compact" : "comfortable")
          }
          aria-label={t("settings.appearance.density")}
        />
        <span>{t("settings.appearance.density.comfortable")}</span>
      </div>
    </div>
  );
}

function AlignmentSection({ form }: { form: ReturnType<typeof usePreferencesForm> }) {
  const { t } = useI18n();
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings.appearance.alignment")}</h3>
      <div className={styles.optionRow}>
        {(["left", "right"] as const).map((item) => (
          <OptionButton
            key={item}
            compact
            selected={form.alignment === item}
            label={t(`settings.appearance.alignment.${item}`)}
            onClick={() => form.setAlignment(item)}
          />
        ))}
      </div>
    </div>
  );
}

function AppearancePanel() {
  const { t } = useI18n();
  const form = usePreferencesForm();
  return (
    <section className={styles.panel}>
      <header className={styles.sectionHeader}>
        <h2>{t("settings.appearance.title")}</h2>
        <p>{t("settings.appearance.description")}</p>
      </header>
      <ThemeSection form={form} />
      <WorkspaceSection form={form} />
      <DensitySection form={form} />
      <AlignmentSection form={form} />
      <div className={styles.actions}>
        <button type="button" className="btn" disabled={form.saving} onClick={form.save}>
          {form.saving ? t("common.loading") : t("settings.appearance.apply")}
        </button>
        <button type="button" className="btn secondary" disabled={form.saving} onClick={form.reset}>
          {t("settings.appearance.reset")}
        </button>
      </div>
      {form.notice && (
        <p
          className={`${styles.notice} ${
            form.notice === "saved" ? styles.success : styles.error
          }`}
        >
          {t(`settings.appearance.${form.notice}`)}
        </p>
      )}
    </section>
  );
}

export default function PreferencesPage() {
  const { t } = useI18n();
  return (
    <main className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>{t("settings.title")}</h1>
        <p>{t("settings.description")}</p>
      </div>
      <div className={styles.settingsSplit}>
        <SettingsNav />
        <AppearancePanel />
      </div>
    </main>
  );
}
