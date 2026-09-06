"use client";

import { useAppearance } from "@/lib/appearance-preferences";
import { useI18n } from "@/lib/i18n";
import type {
  UserPreferencesUpdate,
  WorkspaceCustomConfig,
  WorkspacePanel,
} from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import styles from "./workspace.module.css";

type EditorDock = "left" | "center" | "right" | "top" | "bottom";
type EditorPanel = {
  panel: WorkspacePanel;
  dock: EditorDock;
  order: number;
  size_px: number | null;
  visible: boolean;
};
type EditorConfig = {
  version: 1;
  panels: EditorPanel[];
  message_content_overlay: boolean;
  show_resize_handles: boolean;
  action_bar_dock: "top" | "bottom";
  system_status_position: "top" | "bottom" | "hidden";
};

const panelNames: WorkspacePanel[] = [
  "accounts",
  "folders",
  "message_list",
  "message_content",
];

function defaultConfig(): EditorConfig {
  return {
    version: 1,
    panels: [
      { panel: "accounts", dock: "left", order: 1, size_px: 220, visible: true },
      { panel: "folders", dock: "left", order: 2, size_px: 240, visible: true },
      { panel: "message_list", dock: "center", order: 3, size_px: 360, visible: true },
      { panel: "message_content", dock: "right", order: 4, size_px: null, visible: true },
    ],
    message_content_overlay: false,
    show_resize_handles: true,
    action_bar_dock: "top",
    system_status_position: "top",
  };
}

function fromStored(value: WorkspaceCustomConfig | null): EditorConfig {
  if (!value) return defaultConfig();
  const extended = value as WorkspaceCustomConfig & Partial<EditorConfig>;
  return {
    ...defaultConfig(),
    ...extended,
    panels: value.panels.map((panel) => ({ ...panel, dock: panel.dock as EditorDock })),
  };
}

function Preview({ config }: { config: EditorConfig }) {
  const { t } = useI18n();
  const visible = [...config.panels]
    .filter((panel) => panel.visible)
    .sort((a, b) => a.order - b.order);
  return (
    <div className={styles.preview}>
      {visible.map((panel) => (
        <div
          key={panel.panel}
          className={`${styles.previewPanel} ${panel.panel === "accounts" ? styles.previewPanelSelected : ""}`}
          style={{ flexBasis: panel.size_px ? `${panel.size_px}px` : undefined }}
        >
          <div className={styles.panelHeader}>
            <span>{t(`settings.workspaceEditor.panel.${panel.panel}`)}</span>
            <span className={styles.dragHandle}>⋮</span>
          </div>
          <div className={styles.previewBody} />
        </div>
      ))}
    </div>
  );
}

function PanelRow({
  panel,
  onChange,
  onDragStart,
  onDrop,
}: {
  panel: EditorPanel;
  onChange: (next: EditorPanel) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={styles.panelRow}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className={styles.panelName}>
        <span>{t(`settings.workspaceEditor.panel.${panel.panel}`)}</span>
        <span className={styles.orderBadge}>#{panel.order}</span>
      </div>
      <label className={styles.fieldRow}>
        <span>Dock</span>
        <select
          value={panel.dock}
          onChange={(event) => onChange({ ...panel, dock: event.currentTarget.value as EditorDock })}
        >
          {(["left", "center", "right", "top", "bottom"] as const).map((dock) => (
            <option key={dock} value={dock}>
              {dock}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.fieldRow}>
        <span>{t("settings.workspaceEditor.size")}</span>
        <input
          type="number"
          min="180"
          max="1600"
          value={panel.size_px ?? ""}
          onChange={(event) =>
            onChange({
              ...panel,
              size_px: event.currentTarget.value ? Number(event.currentTarget.value) : null,
            })
          }
        />
      </label>
      <label className={styles.fieldRow}>
        <span>{t("settings.workspaceEditor.visible")}</span>
        <input
          type="checkbox"
          checked={panel.visible}
          onChange={(event) => onChange({ ...panel, visible: event.currentTarget.checked })}
        />
      </label>
    </div>
  );
}

function reorderPanels(panels: EditorPanel[], from: WorkspacePanel, to: WorkspacePanel) {
  const sorted = [...panels].sort((a, b) => a.order - b.order);
  const fromIndex = sorted.findIndex((item) => item.panel === from);
  const toIndex = sorted.findIndex((item) => item.panel === to);
  const [moved] = sorted.splice(fromIndex, 1);
  sorted.splice(toIndex, 0, moved);
  return sorted.map((item, index) => ({ ...item, order: index + 1 }));
}

export default function WorkspaceEditorPage() {
  const { t } = useI18n();
  const appearance = useAppearance();
  const [config, setConfig] = useState<EditorConfig>(() => fromStored(null));
  const [dragged, setDragged] = useState<WorkspacePanel | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "failed" | null>(null);

  useEffect(() => {
    if (appearance.ready) setConfig(fromStored(appearance.workspaceCustomConfig));
  }, [appearance.ready, appearance.workspaceCustomConfig]);

  const panels = useMemo(
    () => [...config.panels].sort((a, b) => a.order - b.order),
    [config.panels],
  );

  function updatePanel(next: EditorPanel) {
    setConfig((current) => ({
      ...current,
      panels: current.panels.map((panel) => (panel.panel === next.panel ? next : panel)),
    }));
  }

  function dropOn(target: WorkspacePanel) {
    if (!dragged || dragged === target) return;
    setConfig((current) => ({
      ...current,
      panels: reorderPanels(current.panels, dragged, target),
    }));
    setDragged(null);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const update = {
        workspace_layout: "custom",
        workspace_custom_config: config,
      } as unknown as UserPreferencesUpdate;
      await appearance.updateAppearance(update);
      setNotice("saved");
    } catch {
      setNotice("failed");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setConfig(fromStored(appearance.workspaceCustomConfig));
    setNotice(null);
  }

  return (
    <main className={styles.page}>
      <section className={styles.editor}>
        <header className={styles.header}>
          <div>
            <h1>{t("settings.workspaceEditor.title")}</h1>
            <p>{t("settings.workspaceEditor.description")}</p>
          </div>
          <span className={styles.activeBadge}>{t("settings.workspaceEditor.active")}</span>
        </header>
        <div className={styles.presets}>
          <div className={styles.presetLabel}>{t("settings.appearance.workspace")}</div>
          <div className={styles.presetRow}>
            {(["classic", "vertical", "focus", "compact", "wide"] as const).map((preset) => (
              <button key={preset} className={styles.preset} type="button" disabled>
                {t(`settings.appearance.layout.${preset}`)}
              </button>
            ))}
          </div>
        </div>
        <Preview config={config} />
        <div className={styles.options}>
          <strong>{t("settings.workspaceEditor.panelOptions")}</strong>
          <label className={styles.optionRow}>
            <input
              type="checkbox"
              checked={config.message_content_overlay}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  message_content_overlay: event.currentTarget.checked,
                }))
              }
            />
            {t("settings.workspaceEditor.overlay")}
          </label>
          <label className={styles.optionRow}>
            <input
              type="checkbox"
              checked={config.show_resize_handles}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  show_resize_handles: event.currentTarget.checked,
                }))
              }
            />
            {t("settings.workspaceEditor.resizeHandles")}
          </label>
        </div>
      </section>

      <aside className={styles.sidebar}>
        <div>
          <h2>{t("settings.workspaceEditor.orderDock")}</h2>
          <p>{t("settings.workspaceEditor.description")}</p>
        </div>
        <div className={styles.panelList}>
          {panels.map((panel) => (
            <PanelRow
              key={panel.panel}
              panel={panel}
              onChange={updatePanel}
              onDragStart={() => setDragged(panel.panel)}
              onDrop={() => dropOn(panel.panel)}
            />
          ))}
        </div>
        <div className={styles.quick}>
          <label className={styles.fieldRow}>
            <span>{t("settings.workspaceEditor.actionBar")}</span>
            <select
              value={config.action_bar_dock}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  action_bar_dock: event.currentTarget.value as "top" | "bottom",
                }))
              }
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <label className={styles.fieldRow}>
            <span>{t("settings.workspaceEditor.systemStatus")}</span>
            <select
              value={config.system_status_position}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  system_status_position: event.currentTarget.value as EditorConfig["system_status_position"],
                }))
              }
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
        </div>
        <div className={styles.footerActions}>
          <button className="btn" type="button" disabled={saving} onClick={save}>
            {saving ? t("common.loading") : t("settings.workspaceEditor.apply")}
          </button>
          <button className="btn secondary" type="button" disabled={saving} onClick={discard}>
            {t("settings.workspaceEditor.discard")}
          </button>
          {notice && (
            <span className={styles.notice}>{t(`settings.appearance.${notice}`)}</span>
          )}
        </div>
      </aside>
    </main>
  );
}
