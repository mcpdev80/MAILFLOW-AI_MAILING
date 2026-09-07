"use client";

import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../admin-pages.module.css";

type ModelOption = {
  id: string;
  model_id: string;
  provider_id: string;
  provider_label: string;
  provider_type: string;
};

type Assignment = {
  catalog_model_id: string | null;
  provider_id: string;
  model_id: string;
} | null;

type Assignments = {
  fast: Assignment;
  deep: Assignment;
  generation: Assignment;
};

type Role = keyof Assignments;

const COPY = {
  de: {
    title: "Modellauswahl",
    description:
      "Wähle aus den Modellen, die der Instanz-Administrator für diese Organisation freigegeben hat. Anbieter, Endpunkte und API-Schlüssel werden ausschließlich in der Instanzverwaltung gepflegt.",
    fast: "Schnell",
    fastText: "Für schnelle Klassifizierung und einfache Entscheidungen.",
    deep: "Tief",
    deepText: "Für komplexere Klassifizierung und Analyse.",
    generation: "Generierung",
    generationText: "Für Antworten, Entwürfe und Textgenerierung.",
    save: "Modellauswahl speichern",
    saved: "Modellauswahl gespeichert.",
    empty: "Für diese Organisation wurden noch keine KI-Modelle freigegeben.",
    askAdmin: "Der Instanz-Administrator muss zuerst Modelle freigeben.",
    loading: "Modelle werden geladen …",
  },
  en: {
    title: "Model selection",
    description:
      "Choose from models approved for this organization by the instance administrator. Providers, endpoints and API keys are managed only in instance administration.",
    fast: "Fast",
    fastText: "For quick classification and simple decisions.",
    deep: "Deep",
    deepText: "For more complex classification and analysis.",
    generation: "Generation",
    generationText: "For replies, drafts and text generation.",
    save: "Save model selection",
    saved: "Model selection saved.",
    empty: "No AI models have been approved for this organization yet.",
    askAdmin: "The instance administrator must approve models first.",
    loading: "Loading models …",
  },
  es: {
    title: "Selección de modelos",
    description:
      "Elige entre los modelos aprobados para esta organización por el administrador de la instancia. Proveedores, endpoints y claves API se gestionan solo a nivel de instancia.",
    fast: "Rápido",
    fastText: "Para clasificación rápida y decisiones sencillas.",
    deep: "Profundo",
    deepText: "Para clasificación y análisis más complejos.",
    generation: "Generación",
    generationText: "Para respuestas, borradores y generación de texto.",
    save: "Guardar selección",
    saved: "Selección guardada.",
    empty: "Todavía no hay modelos de IA aprobados para esta organización.",
    askAdmin: "El administrador de la instancia debe aprobar modelos primero.",
    loading: "Cargando modelos …",
  },
} as const;

export default function OrganizationModelsPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [models, setModels] = useState<ModelOption[]>([]);
  const [roles, setRoles] = useState<Record<Role, string>>({
    fast: "",
    deep: "",
    generation: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsResponse, assignmentsResponse] = await Promise.all([
        fetch("/api/mf/llm-catalog/models", { cache: "no-store" }),
        fetch("/api/mf/llm-catalog/assignments", { cache: "no-store" }),
      ]);
      if (!modelsResponse.ok || !assignmentsResponse.ok) {
        throw new Error("model_selection_load_failed");
      }
      const catalog = (await modelsResponse.json()) as { models: ModelOption[] };
      const assignments = (await assignmentsResponse.json()) as Assignments;
      setModels(catalog.models ?? []);
      setRoles({
        fast: assignments.fast?.catalog_model_id ?? "",
        deep: assignments.deep?.catalog_model_id ?? "",
        generation: assignments.generation?.catalog_model_id ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "model_selection_load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedLabel = useMemo(
    () =>
      new Map(
        models.map((model) => [
          model.id,
          `${model.provider_label} · ${model.model_id}`,
        ]),
      ),
    [models],
  );

  async function save() {
    if (!roles.fast || !roles.deep || !roles.generation) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/mf/llm-catalog/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fast: { model_id: roles.fast },
          deep: { model_id: roles.deep },
          generation: { model_id: roles.generation },
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(payload?.detail ?? "model_selection_save_failed");
      }
      setNotice(copy.saved);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "model_selection_save_failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className={styles.page}>{copy.loading}</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.note}>{notice}</p>}

      {models.length === 0 ? (
        <section className={styles.card}>
          <h2>{copy.empty}</h2>
          <p>{copy.askAdmin}</p>
        </section>
      ) : (
        <>
          <section className={styles.grid}>
            {(
              [
                ["fast", copy.fast, copy.fastText],
                ["deep", copy.deep, copy.deepText],
                ["generation", copy.generation, copy.generationText],
              ] as const
            ).map(([role, label, description]) => (
              <article className={styles.card} key={role}>
                <h2>{label}</h2>
                <p>{description}</p>
                <select
                  value={roles[role]}
                  onChange={(event) =>
                    setRoles((current) => ({
                      ...current,
                      [role]: event.currentTarget.value,
                    }))
                  }
                >
                  <option value="">–</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {groupedLabel.get(model.id)}
                    </option>
                  ))}
                </select>
              </article>
            ))}
          </section>
          <div>
            <button
              type="button"
              className="btn"
              disabled={
                busy || !roles.fast || !roles.deep || !roles.generation
              }
              onClick={() => void save()}
            >
              {copy.save}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
