"use client";

import { useAppearance } from "@/lib/appearance-preferences";
import { useI18n } from "@/lib/i18n";
import type {
  Density,
  SidePanelAlignment,
  Theme,
  WorkspaceLayout,
} from "@/lib/types";
import { useEffect, useState } from "react";
import styles from "./preferences.module.css";

const themes: Theme[] = ["light", "dark", "system"];
const layouts: WorkspaceLayout[] = [
  "classic",
  "vertical",
  "focus",
  "compact",
  "wide",
];

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
  const previewClass =
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
      <span className={`${styles.themePreview} ${previewClass}`} />
      <strong>{t(`settings.appearance.theme.${value}`)}</strong>
    </button>
  );
}

function ChoiceButton<T extends string>({
  value,
  selected,
  label,
  className = "",
  onSelect,
}: {
  value: T;
  selected: boolean;
  label: string;
  className?: string;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.optionButton} ${className} ${selected ? styles.selected : ""}`}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  );
}

function SettingsSideNav() {
  const { t } = useI18n();
  return (
    <nav className={styles.sideNav} aria-label={t("settings.title")}>
      <span className={styles.sideItem}>Profile & Account</span>
      <span className={`${styles.sideItem} ${styles.sideItemActive}`}>
        {t("settings.appearance.title")}
      </span>
      <span className={styles.sideItem}>{t("nav.mailboxes")}</span>
      <span className={styles.sideItem}>AI Providers</span>
      <span className={styles.sideItem}>Rules & Actions</span>
      <span className={styles.sideItem}>Organization</span>
      <span className={styles.sideItem}>Security & Passkeys</span>
      <span className={styles.sideItem}>Data & Retention</span>
      <span className={styles.sideItem}>Billing</span>
    </nav>
  );
}

export default function PreferencesPage() {
  const { t } = useI18n();
  const appearance = useAppearance();
  const [theme, setTheme] = useState<Theme>(appearance.theme);
  const [density, setDensity] = useState<Density>(appearance.density);
  const [layout, setLayout] = useState<WorkspaceLayout>(appearance.workspaceLayout);
  const [alignment, setAlignment] = useState<SidePanelAlignment>(
    appearance.sidePanelAlignment,
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "failed" | null>(null);

  useEffect(() => {
    setTheme(appearance.theme);
    setDensity(appearance.density);
    setLayout(appearance.workspaceLayout);
    setAlignment(appearance.sidePanelAlignment);
  }, [
    appearance.density,
    appearance.sidePanelAlignment,
    appearance.theme,
    appearance.workspaceLayout,
  ]);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await appearance.updateAppearance({
        theme,
        density,
        workspace_layout: layout,
        side_panel_alignment: alignment,
      });
      setNotice("saved");
    } catch {
      setNotice("failed");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setTheme("system");
    setDensity("comfortable");
    setLayout("classic");
    setAlignment("left");
    setNotice(null);
  }

  return (
    <main className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>{t("settings.title")}</h1>
        <p>{t("settings.description")}</p>
      </div>
      <div className={styles.settingsSplit}>
        <SettingsSideNav />
        <section className={styles.panel}>
          <header className={styles.sectionHeader}>
            <h2>{t("settings.appearance.title")}</h2>
            <p>{t("settings.appearance.description")}</p>
          </header>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("settings.appearance.theme")}</h3>
            <div className={styles.themeGrid}>
              {themes.map((item) => (
                <ThemeChoice
                  key={item}
                  value={item}
                  selected={theme === item}
                  onSelect={setTheme}
                />
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("settings.appearance.workspace")}</h3>
            <div className={styles.optionRow}>
              {layouts.map((item) => (
                <ChoiceButton
                  key={item}
                  value={item}
                  selected={layout === item}
                  label={t(`settings.appearance.layout.${item}`)}
                  onSelect={setLayout}
                />
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("settings.appearance.density")}</h3>
            <div className={styles.densityRow}>
              <span>{t("settings.appearance.density.compact")}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="1"
                value={density === "compact" ? 0 : 1}
                onChange={(event) =>
                  setDensity(event.currentTarget.value === "0" ? "compact" : "comfortable")
                }
                aria-label={t("settings.appearance.density")}
              />
              <span>{t("settings.appearance.density.comfortable")}</span>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("settings.appearance.alignment")}</h3>
            <div className={styles.optionRow}>
              {(["left", "right"] as const).map((item) => (
                <ChoiceButton
                  key={item}
                  value={item}
                  selected={alignment === item}
                  label={t(`settings.appearance.alignment.${item}`)}
                  className={styles.alignmentButton}
                  onSelect={setAlignment}
                />
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className="btn" disabled={saving} onClick={save}>
              {saving ? t("common.loading") : t("settings.appearance.apply")}
            </button>
            <button type="button" className="btn secondary" disabled={saving} onClick={reset}>
              {t("settings.appearance.reset")}
            </button>
          </div>
          {notice && (
            <p className={`${styles.notice} ${notice === "saved" ? styles.success : styles.error}`}>
              {t(`settings.appearance.${notice}`)}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
