"use client";

import { useAppearance } from "@/lib/appearance-preferences";
import type {
  WorkspaceCustomConfig,
  WorkspaceLayout,
  WorkspacePanel,
  WorkspacePanelConfig,
} from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import {
  normalizeWorkspaceConfig,
  reorderWorkspacePanels,
} from "./workspace-editor-model";

export function useWorkspaceEditor() {
  const appearance = useAppearance();
  const [config, setConfig] = useState<WorkspaceCustomConfig>(() =>
    normalizeWorkspaceConfig(null),
  );
  const [dragged, setDragged] = useState<WorkspacePanel | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "failed" | null>(null);

  useEffect(() => {
    if (appearance.ready) {
      setConfig(normalizeWorkspaceConfig(appearance.workspaceCustomConfig));
    }
  }, [appearance.ready, appearance.workspaceCustomConfig]);

  const panels = useMemo(
    () => [...config.panels].sort((a, b) => a.order - b.order),
    [config.panels],
  );

  function updatePanel(next: WorkspacePanelConfig) {
    setConfig((current) => ({
      ...current,
      panels: current.panels.map((panel) =>
        panel.panel === next.panel ? next : panel,
      ),
    }));
  }

  function dropOn(target: WorkspacePanel) {
    if (!dragged || dragged === target) return;
    setConfig((current) => ({
      ...current,
      panels: reorderWorkspacePanels(current.panels, dragged, target),
    }));
    setDragged(null);
  }

  async function applyPreset(layout: Exclude<WorkspaceLayout, "custom">) {
    setSaving(true);
    setNotice(null);
    try {
      await appearance.updateAppearance({ workspace_layout: layout });
      setNotice("saved");
    } catch {
      setNotice("failed");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await appearance.updateAppearance({
        workspace_layout: "custom",
        workspace_custom_config: config,
      });
      setNotice("saved");
    } catch {
      setNotice("failed");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setConfig(normalizeWorkspaceConfig(appearance.workspaceCustomConfig));
    setNotice(null);
  }

  return {
    config,
    setConfig,
    panels,
    saving,
    notice,
    activeLayout: appearance.workspaceLayout,
    setDragged,
    updatePanel,
    dropOn,
    applyPreset,
    save,
    discard,
  };
}

export type WorkspaceEditorController = ReturnType<typeof useWorkspaceEditor>;
