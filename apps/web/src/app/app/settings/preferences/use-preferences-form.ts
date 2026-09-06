"use client";

import { useAppearance } from "@/lib/appearance-preferences";
import type {
  Density,
  SidePanelAlignment,
  Theme,
  WorkspaceLayout,
} from "@/lib/types";
import { useEffect, useState } from "react";

export function usePreferencesForm() {
  const appearance = useAppearance();
  const [theme, setTheme] = useState<Theme>(appearance.theme);
  const [density, setDensity] = useState<Density>(appearance.density);
  const [layout, setLayout] = useState<WorkspaceLayout>(appearance.workspaceLayout);
  const [alignment, setAlignment] = useState<SidePanelAlignment>(appearance.sidePanelAlignment);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "failed" | null>(null);

  useEffect(() => {
    setTheme(appearance.theme);
    setDensity(appearance.density);
    setLayout(appearance.workspaceLayout);
    setAlignment(appearance.sidePanelAlignment);
  }, [appearance.density, appearance.sidePanelAlignment, appearance.theme, appearance.workspaceLayout]);

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

  return {
    theme,
    setTheme,
    density,
    setDensity,
    layout,
    setLayout,
    alignment,
    setAlignment,
    saving,
    notice,
    save,
    reset,
  };
}
