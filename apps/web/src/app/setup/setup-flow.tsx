"use client";

import { WizardShell, wizardStyles as s } from "@/components/wizard-shell";
import { type BootstrapStatus, getBootstrapStatus } from "@/lib/bootstrap-api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { InstanceSetup } from "./setup-ui";

type SupportedLanguage = "de" | "en" | "es";

type InstanceBootstrapStatus = {
  auth_enabled: boolean;
  instance_owner_exists: boolean;
};

const copy = {
  de: {
    title: "Willkommen bei Mailflow",
    subtitle:
      "Wir bereiten deine Instanz in fünf kurzen Schritten vor. Danach folgt separat das 6-Schritt-Benutzer-Onboarding.",
    start: "Einrichtung starten",
    language: "Sprache",
    languageSet: "wurde vom Installer auf Deutsch gesetzt",
    tls: "TLS-Zertifikat",
    tlsCustom:
      "vorhandenes Zertifikat wurde vom Installer erkannt und eingerichtet",
    tlsAutomatic: "automatische Zertifikatsverwaltung ist eingerichtet",
    url: "Öffentliche URL",
    steps: [
      [
        "1. Sprache & Darstellung",
        "Prüfe die vom Installer gesetzte Sprache und die Darstellungs-Vorgaben.",
      ],
      [
        "2. URL & HTTPS",
        "Prüfe die erkannte öffentliche Adresse und TLS-Konfiguration.",
      ],
      [
        "3. KI-Provider",
        "Verbinde den Modell-Endpunkt für Klassifizierung und Generierung.",
      ],
      [
        "4. Instance Owner",
        "Lege den ersten Instanz-Administrator und seine Organisation an.",
      ],
      [
        "5. Instanzprüfung",
        "Prüfe die Instanz und richte optional direkt einen Passkey ein.",
      ],
    ],
    info: "Nach der Instanz-Einrichtung startet das separate 6-Schritt-Onboarding für Postfach, Datenschutz und Verhalten.",
  },
  en: {
    title: "Welcome to Mailflow",
    subtitle:
      "We will prepare your instance in five short steps, then continue with the separate 6-step user onboarding.",
    start: "Start setup",
    language: "Language",
    languageSet: "was set to English by the installer",
    tls: "TLS certificate",
    tlsCustom:
      "an existing certificate was detected and configured by the installer",
    tlsAutomatic: "automatic certificate management is configured",
    url: "Public URL",
    steps: [
      [
        "1. Language & appearance",
        "Review the language and appearance defaults set during installation.",
      ],
      [
        "2. URL & HTTPS",
        "Review the detected public address and TLS configuration.",
      ],
      [
        "3. AI provider",
        "Connect the model endpoint for classification and generation.",
      ],
      [
        "4. Instance Owner",
        "Create the first instance administrator and organization.",
      ],
      [
        "5. Instance verification",
        "Verify the instance and optionally register a passkey immediately.",
      ],
    ],
    info: "After instance setup, Mailflow starts the separate 6-step onboarding for mailbox, privacy and behavior settings.",
  },
  es: {
    title: "Bienvenido a Mailflow",
    subtitle:
      "Prepararemos tu instancia en cinco pasos breves y después continuaremos con la incorporación de usuario de 6 pasos.",
    start: "Iniciar configuración",
    language: "Idioma",
    languageSet: "fue configurado en español por el instalador",
    tls: "Certificado TLS",
    tlsCustom: "el instalador detectó y configuró un certificado existente",
    tlsAutomatic: "la gestión automática de certificados está configurada",
    url: "URL pública",
    steps: [
      [
        "1. Idioma y apariencia",
        "Revisa el idioma y la apariencia definidos durante la instalación.",
      ],
      [
        "2. URL y HTTPS",
        "Revisa la dirección pública detectada y la configuración TLS.",
      ],
      [
        "3. Proveedor de IA",
        "Conecta el endpoint del modelo para clasificación y generación.",
      ],
      [
        "4. Instance Owner",
        "Crea el primer administrador de la instancia y su organización.",
      ],
      [
        "5. Verificación de instancia",
        "Verifica la instancia y registra opcionalmente una passkey.",
      ],
    ],
    info: "Después de configurar la instancia, Mailflow inicia la incorporación separada de 6 pasos para buzón, privacidad y comportamiento.",
  },
} as const;

function normalizeLanguage(
  value: string | null | undefined,
): SupportedLanguage {
  return value === "de" || value === "es" ? value : "en";
}

export function SetupFlow() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [guardLoaded, setGuardLoaded] = useState(false);

  useEffect(() => {
    void Promise.allSettled([
      getBootstrapStatus(),
      fetch("/api/instance-bootstrap/status", { cache: "no-store" }).then(
        async (response) => {
          if (!response.ok) throw new Error("instance_bootstrap_status_failed");
          return (await response.json()) as InstanceBootstrapStatus;
        },
      ),
    ]).then(([bootstrapResult, guardResult]) => {
      if (bootstrapResult.status === "fulfilled") {
        setBootstrap(bootstrapResult.value);
      } else {
        setBootstrap(null);
      }

      if (
        guardResult.status === "fulfilled" &&
        guardResult.value.auth_enabled &&
        guardResult.value.instance_owner_exists
      ) {
        router.replace("/app");
        return;
      }
      setGuardLoaded(true);
    });
  }, [router]);

  const language = normalizeLanguage(bootstrap?.fields.language.value);
  const t = copy[language];
  const tlsValue = bootstrap?.fields.tls.value;
  const tlsText = useMemo(() => {
    if (!bootstrap?.fields.tls.configured) return null;
    return tlsValue === "custom" ? t.tlsCustom : t.tlsAutomatic;
  }, [bootstrap, tlsValue, t]);

  if (!guardLoaded) return null;
  if (started) return <InstanceSetup />;

  return (
    <WizardShell
      kind="setup"
      step={1}
      total={5}
      title={t.title}
      subtitle={t.subtitle}
      next={{ label: t.start, onClick: () => setStarted(true) }}
    >
      <div className={s.section}>
        {bootstrap?.fields.language.configured ? (
          <div className={s.info}>
            <span className={s.infoIcon}>✓</span>
            <span>
              <strong>{t.language}:</strong> {t.languageSet}
            </span>
          </div>
        ) : null}

        {tlsText ? (
          <div className={s.info}>
            <span className={s.infoIcon}>✓</span>
            <span>
              <strong>{t.tls}:</strong> {tlsText}
            </span>
          </div>
        ) : null}

        {bootstrap?.fields.public_url.configured &&
        bootstrap.fields.public_url.value ? (
          <div className={s.info}>
            <span className={s.infoIcon}>✓</span>
            <span>
              <strong>{t.url}:</strong> {bootstrap.fields.public_url.value}
            </span>
          </div>
        ) : null}

        {t.steps.map(([title, description]) => (
          <div key={title}>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
        ))}
      </div>
      <div className={s.info}>
        <span className={s.infoIcon}>i</span>
        <span>{t.info}</span>
      </div>
    </WizardShell>
  );
}
