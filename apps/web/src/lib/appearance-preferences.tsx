"use client";

import { api } from "@/lib/api";
import type {
  Density,
  SidePanelAlignment,
  Theme,
  UserPreferences,
  UserPreferencesUpdate,
  WorkspaceCustomConfig,
  WorkspaceLayout,
} from "@/lib/types";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AppearanceContextValue = {
  ready: boolean;
  theme: Theme;
  density: Density;
  workspaceLayout: WorkspaceLayout;
  sidePanelAlignment: SidePanelAlignment;
  workspaceCustomConfig: WorkspaceCustomConfig | null;
  updateAppearance: (update: UserPreferencesUpdate) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDocumentAppearance(theme: Theme, density: Density) {
  document.documentElement.dataset.theme = resolveTheme(theme);
  document.documentElement.dataset.density = density;
  document.documentElement.style.colorScheme = theme === "system" ? "light dark" : theme;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getUserPreferences()
      .then((result) => {
        if (!active) return;
        setPreferences(result);
        applyDocumentAppearance(result.theme, result.density);
      })
      .catch(() => {
        if (!active) return;
        applyDocumentAppearance("system", "comfortable");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if ((preferences?.theme ?? "system") !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () =>
      applyDocumentAppearance("system", preferences?.density ?? "comfortable");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preferences?.density, preferences?.theme]);

  const updateAppearance = useCallback(async (update: UserPreferencesUpdate) => {
    const saved = await api.updateUserPreferences(update);
    setPreferences(saved);
    applyDocumentAppearance(saved.theme, saved.density);
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ready,
      theme: preferences?.theme ?? "system",
      density: preferences?.density ?? "comfortable",
      workspaceLayout: preferences?.workspace_layout ?? "classic",
      sidePanelAlignment: preferences?.side_panel_alignment ?? "left",
      workspaceCustomConfig: preferences?.workspace_custom_config ?? null,
      updateAppearance,
    }),
    [preferences, ready, updateAppearance],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}
