import type {
  WorkspaceCustomConfig,
  WorkspacePanel,
  WorkspacePanelConfig,
} from "@/lib/types";

export const workspacePanels: readonly WorkspacePanel[] = [
  "accounts",
  "folders",
  "message_list",
  "message_content",
];

export const workspaceDocks = [
  "left",
  "center",
  "right",
  "top",
  "bottom",
] as const;

export function defaultWorkspaceConfig(): WorkspaceCustomConfig {
  return {
    version: 1,
    panels: [
      panel("accounts", "left", 1, 220),
      panel("folders", "left", 2, 240),
      panel("message_list", "center", 3, 360),
      panel("message_content", "right", 4, null),
    ],
    message_content_overlay: false,
    show_resize_handles: true,
    action_bar_dock: "top",
    system_status_position: "top",
  };
}

export function normalizeWorkspaceConfig(
  value: WorkspaceCustomConfig | null,
): WorkspaceCustomConfig {
  if (!value) return defaultWorkspaceConfig();
  const defaults = defaultWorkspaceConfig();
  const storedByPanel = new Map(value.panels.map((item) => [item.panel, item]));
  return {
    ...defaults,
    ...value,
    panels: workspacePanels.map((name) => {
      const stored = storedByPanel.get(name);
      const fallback = defaults.panels.find((item) => item.panel === name)!;
      return stored ? { ...fallback, ...stored } : fallback;
    }),
  };
}

export function reorderWorkspacePanels(
  panels: WorkspacePanelConfig[],
  from: WorkspacePanel,
  to: WorkspacePanel,
): WorkspacePanelConfig[] {
  const sorted = [...panels].sort((a, b) => a.order - b.order);
  const fromIndex = sorted.findIndex((item) => item.panel === from);
  const toIndex = sorted.findIndex((item) => item.panel === to);
  if (fromIndex < 0 || toIndex < 0) return sorted;
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(toIndex, 0, moved);
  return sorted.map((item, index) => ({ ...item, order: index + 1 }));
}

function panel(
  name: WorkspacePanel,
  dock: WorkspacePanelConfig["dock"],
  order: number,
  sizePx: number | null,
): WorkspacePanelConfig {
  return { panel: name, dock, order, size_px: sizePx, visible: true };
}
