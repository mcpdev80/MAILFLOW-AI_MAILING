"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";
import { api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { LOCALES, LOCALE_NAMES, type Locale, useI18n } from "@/lib/i18n";
import type { UserDateFormat } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

const DATE_FORMATS: readonly UserDateFormat[] = [
  "DD.MM.YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
];

const fallbackTimezones = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

const copy = {
  de: {
    title: "Profil & Konto",
    subtitle: "Persönliche Daten und Kontoeinstellungen verwalten.",
    displayName: "Anzeigename",
    email: "E-Mail-Adresse",
    emailHint:
      "Die Login-E-Mail wird über das Authentifizierungskonto verwaltet.",
    language: "Sprache",
    languageHint:
      "Die Oberfläche wird sofort in der gewählten Sprache angezeigt.",
    timezone: "Zeitzone",
    timezoneHint: "Wird für Datums- und Zeitangaben in MailFlow verwendet.",
    dateFormat: "Datumsformat",
    dateFormatHint:
      "Legt fest, wie Datumswerte in der Oberfläche dargestellt werden.",
    save: "Änderungen speichern",
    saving: "Speichern…",
    reset: "Zurücksetzen",
    saved: "Profil und Einstellungen gespeichert.",
    saveError: "Profil oder Einstellungen konnten nicht gespeichert werden.",
    danger: "Gefahrenbereich",
    deleteTitle: "Konto & Daten löschen",
    deleteText:
      "Das vollständige sichere Löschen eines Benutzerkontos ist noch nicht verfügbar. Die Funktion bleibt deaktiviert, bis Better Auth, Mitgliedschaften, private Postfach-Zuordnungen und aufbewahrte Daten gemeinsam sicher entfernt werden können.",
    delete: "Konto löschen",
  },
  en: {
    title: "Profile & Account",
    subtitle: "Update your personal details and account information.",
    displayName: "Display Name",
    email: "Email Address",
    emailHint: "Your login email is managed by the authentication account.",
    language: "Language",
    languageHint:
      "The interface switches to the selected language immediately.",
    timezone: "Time Zone",
    timezoneHint: "Used for date and time values throughout MailFlow.",
    dateFormat: "Date Format",
    dateFormatHint: "Controls how dates are displayed in the interface.",
    save: "Save Changes",
    saving: "Saving…",
    reset: "Reset",
    saved: "Profile and preferences saved.",
    saveError: "Unable to save profile or preferences.",
    danger: "Danger Zone",
    deleteTitle: "Delete Account & Data",
    deleteText:
      "Complete safe user-account deletion is not available yet. This action stays disabled until Better Auth, memberships, private mailbox ownership and retained data can be removed together safely.",
    delete: "Delete Account",
  },
  es: {
    title: "Perfil y cuenta",
    subtitle: "Actualiza tus datos personales y la información de tu cuenta.",
    displayName: "Nombre para mostrar",
    email: "Dirección de correo",
    emailHint:
      "El correo de acceso se gestiona mediante la cuenta de autenticación.",
    language: "Idioma",
    languageHint: "La interfaz cambia inmediatamente al idioma seleccionado.",
    timezone: "Zona horaria",
    timezoneHint: "Se utiliza para las fechas y horas en MailFlow.",
    dateFormat: "Formato de fecha",
    dateFormatHint: "Controla cómo se muestran las fechas en la interfaz.",
    save: "Guardar cambios",
    saving: "Guardando…",
    reset: "Restablecer",
    saved: "Perfil y preferencias guardados.",
    saveError: "No se pudieron guardar el perfil o las preferencias.",
    danger: "Zona de peligro",
    deleteTitle: "Eliminar cuenta y datos",
    deleteText:
      "La eliminación segura y completa de una cuenta de usuario aún no está disponible. La acción seguirá desactivada hasta que Better Auth, las membresías, la propiedad de buzones privados y los datos retenidos puedan eliminarse juntos de forma segura.",
    delete: "Eliminar cuenta",
  },
} satisfies Record<Locale, Record<string, string>>;

function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function defaultDateFormat(locale: Locale): UserDateFormat {
  if (locale === "en") return "MM/DD/YYYY";
  return "DD.MM.YYYY";
}

function supportedTimezones(current: string): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  let values: string[] = [];
  try {
    values = intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    values = [];
  }
  const merged = new Set<string>([
    "UTC",
    current,
    ...values,
    ...fallbackTimezones,
  ]);
  return [...merged].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export default function ProfileSettingsPage() {
  const session = useSession();
  const user = session.data?.user;
  const { locale, setLocale } = useI18n();
  const text = copy[locale];
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [dateFormat, setDateFormat] = useState<UserDateFormat>(
    defaultDateFormat(locale),
  );
  const [loadedTimezone, setLoadedTimezone] = useState("UTC");
  const [loadedDateFormat, setLoadedDateFormat] = useState<UserDateFormat>(
    defaultDateFormat(locale),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  useEffect(() => {
    let active = true;
    void api
      .getUserPreferences()
      .then((preferences) => {
        if (!active) return;
        const browserTimezone = detectedTimezone();
        const nextTimezone =
          preferences.timezone === "UTC" && browserTimezone !== "UTC"
            ? browserTimezone
            : preferences.timezone;
        const nextDateFormat = preferences.date_format;
        setTimezone(nextTimezone);
        setLoadedTimezone(nextTimezone);
        setDateFormat(nextDateFormat);
        setLoadedDateFormat(nextDateFormat);
      })
      .catch(() => {
        if (!active) return;
        const browserTimezone = detectedTimezone();
        const browserDateFormat = defaultDateFormat(locale);
        setTimezone(browserTimezone);
        setLoadedTimezone(browserTimezone);
        setDateFormat(browserDateFormat);
        setLoadedDateFormat(browserDateFormat);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const timezoneOptions = useMemo(
    () => supportedTimezones(timezone),
    [timezone],
  );

  async function changeLanguage(next: Locale) {
    setNotice(null);
    await setLocale(next);
    if (dateFormat === loadedDateFormat) {
      const nextFormat = defaultDateFormat(next);
      setDateFormat(nextFormat);
    }
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const [profileResult] = await Promise.all([
        authClient.updateUser({ name }),
        api.updateUserPreferences({
          locale,
          timezone,
          date_format: dateFormat,
        }),
      ]);
      if (profileResult.error) {
        throw new Error(profileResult.error.message ?? text.saveError);
      }
      setLoadedTimezone(timezone);
      setLoadedDateFormat(dateFormat);
      setNotice({ kind: "ok", message: text.saved });
      await session.refetch();
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : text.saveError,
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName(user?.name ?? "");
    setTimezone(loadedTimezone);
    setDateFormat(loadedDateFormat);
    setNotice(null);
  }

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader}>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </header>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "var(--mf-surface-muted)",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {initials(user?.name, user?.email)}
          </div>
          <div>
            <strong style={{ display: "block", fontSize: 16 }}>
              {user?.name || "MailFlow"}
            </strong>
            <span className="muted">{user?.email}</span>
          </div>
        </div>

        <div className={s.section}>
          <label className="field">
            {text.displayName}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="field">
            {text.email}
            <input value={user?.email ?? ""} readOnly disabled />
            <small>{text.emailHint}</small>
          </label>
          <div className="row">
            <label className="field">
              {text.language}
              <select
                value={locale}
                onChange={(event) =>
                  void changeLanguage(event.target.value as Locale)
                }
              >
                {LOCALES.map((item) => (
                  <option key={item} value={item}>
                    {LOCALE_NAMES[item]}
                  </option>
                ))}
              </select>
              <small>{text.languageHint}</small>
            </label>
            <label className="field">
              {text.timezone}
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {timezoneOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <small>{text.timezoneHint}</small>
            </label>
            <label className="field">
              {text.dateFormat}
              <select
                value={dateFormat}
                onChange={(event) =>
                  setDateFormat(event.target.value as UserDateFormat)
                }
              >
                {DATE_FORMATS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <small>{text.dateFormatHint}</small>
            </label>
          </div>
        </div>

        <div className={s.actions}>
          <button
            className="btn"
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? text.saving : text.save}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={reset}
          >
            {text.reset}
          </button>
        </div>
        {notice && (
          <div className={`alert ${notice.kind}`}>{notice.message}</div>
        )}

        <div
          className={s.section}
          style={{ borderTop: "1px solid var(--mf-border)", paddingTop: 20 }}
        >
          <h3 className={s.sectionTitle} style={{ color: "var(--mf-danger)" }}>
            {text.danger}
          </h3>
          <div className="alert error">
            <strong>{text.deleteTitle}</strong>
            <br />
            <span>{text.deleteText}</span>
          </div>
          <button className="btn destructive" type="button" disabled>
            {text.delete}
          </button>
        </div>
      </section>
    </SettingsShell>
  );
}

function initials(name?: string | null, email?: string | null): string {
  return (
    (name || email || "M")
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M"
  );
}
