"use client";

import { api } from "@/lib/api";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "comfortable" | "compact";
export type WorkspaceLayout = "classic" | "vertical" | "focus" | "compact" | "wide";

export type WorkspacePreferences = {
  theme: ThemePreference;
  density: DensityPreference;
  workspace_layout: WorkspaceLayout;
};

type PreferenceResponse = WorkspacePreferences & {
  locale: "de" | "en" | "es";
  locale_configured: boolean;
};

type PreferencePatch = Partial<WorkspacePreferences>;
type WorkspaceContextValue = WorkspacePreferences & {
  ready: boolean;
  update: (patch: PreferencePatch) => Promise<void>;
};

const DEFAULTS: WorkspacePreferences = {
  theme: "system",
  density: "comfortable",
  workspace_layout: "classic",
};
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function resolvedTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyPreferences(preferences: WorkspacePreferences) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(preferences.theme);
  root.dataset.density = preferences.density;
  root.dataset.workspace = preferences.workspace_layout;
}

async function savePatch(patch: PreferencePatch): Promise<PreferenceResponse> {
  const update = api.updateUserPreferences as unknown as (
    payload: PreferencePatch,
  ) => Promise<PreferenceResponse>;
  return update(patch);
}

export function WorkspacePreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<WorkspacePreferences>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (api.getUserPreferences as unknown as () => Promise<PreferenceResponse>)()
      .then((value) => {
        if (!active) return;
        const next = {
          theme: value.theme ?? DEFAULTS.theme,
          density: value.density ?? DEFAULTS.density,
          workspace_layout: value.workspace_layout ?? DEFAULTS.workspace_layout,
        };
        setPreferences(next);
        applyPreferences(next);
      })
      .catch(() => applyPreferences(DEFAULTS))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyPreferences(preferences);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preferences]);

  const update = useCallback(async (patch: PreferencePatch) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      applyPreferences(next);
      return next;
    });
    const saved = await savePatch(patch);
    setPreferences({
      theme: saved.theme,
      density: saved.density,
      workspace_layout: saved.workspace_layout,
    });
  }, []);

  const value = useMemo(
    () => ({ ...preferences, ready, update }),
    [preferences, ready, update],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspacePreferences(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspacePreferences must be used inside its provider");
  return value;
}
