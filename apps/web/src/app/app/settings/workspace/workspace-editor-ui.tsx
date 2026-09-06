"use client";

import { type TranslationKey, useI18n } from "@/lib/i18n";
import type {
  SystemStatusPosition,
  WorkspaceCustomConfig,
  WorkspaceDock,
  WorkspacePanelConfig,
} from "@/lib/types";
import type { WorkspaceEditorController } from "./use-workspace-editor";
import { workspaceDocks } from "./workspace-editor-model";
import styles from "./workspace.module.css";

export function WorkspaceEditorUi({
  controller,
}: { controller: WorkspaceEditorController }) {
  return (
    <main className={styles.page}>
      <EditorMain controller={controller} />
      <EditorSidebar controller={controller} />
    </main>
  );
}

function EditorMain({ controller }: { controller: WorkspaceEditorController }) {
  const { t } = useI18n();
  return (
    <section className={styles.editor}>
      <header className={styles.header}>
        <div>
          <h1>{t("settings.workspaceEditor.title")}</h1>
          <p>{t("settings.workspaceEditor.description")}</p>
        </div>
        <span className={styles.activeBadge}>
          {t("settings.workspaceEditor.active")}
        </span>
      </header>
      <PresetReference />
      <WorkspacePreview config={controller.config} />
      <WorkspaceOptions controller={controller} />
    </section>
  );
}

function PresetReference() {
  const { t } = useI18n();
  const presets = ["classic", "vertical", "focus", "compact", "wide"] as const;
  return (
    <div className={styles.presets}>
      <div className={styles.presetLabel}>
        {t("settings.appearance.workspace")}
      </div>
      <div className={styles.presetRow}>
        {presets.map((preset) => (
          <button key={preset} className={styles.preset} type="button" disabled>
            {t(`settings.appearance.layout.${preset}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspacePreview({ config }: { config: WorkspaceCustomConfig }) {
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
          style={{
            flexBasis: panel.size_px ? `${panel.size_px}px` : undefined,
          }}
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

function WorkspaceOptions({
  controller,
}: { controller: WorkspaceEditorController }) {
  const { t } = useI18n();
  const patch = (value: Partial<WorkspaceCustomConfig>) =>
    controller.setConfig((current) => ({ ...current, ...value }));
  return (
    <div className={styles.options}>
      <strong>{t("settings.workspaceEditor.panelOptions")}</strong>
      <BooleanOption
        label={t("settings.workspaceEditor.overlay")}
        checked={controller.config.message_content_overlay}
        onChange={(value) => patch({ message_content_overlay: value })}
      />
      <BooleanOption
        label={t("settings.workspaceEditor.resizeHandles")}
        checked={controller.config.show_resize_handles}
        onChange={(value) => patch({ show_resize_handles: value })}
      />
    </div>
  );
}

function BooleanOption({
  label,
  checked,
  onChange,
}: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={styles.optionRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {label}
    </label>
  );
}

function EditorSidebar({
  controller,
}: { controller: WorkspaceEditorController }) {
  const { t } = useI18n();
  return (
    <aside className={styles.sidebar}>
      <div>
        <h2>{t("settings.workspaceEditor.orderDock")}</h2>
        <p>{t("settings.workspaceEditor.description")}</p>
      </div>
      <PanelList controller={controller} />
      <QuickOptions controller={controller} />
      <EditorActions controller={controller} />
    </aside>
  );
}

function PanelList({ controller }: { controller: WorkspaceEditorController }) {
  return (
    <div className={styles.panelList}>
      {controller.panels.map((panel) => (
        <PanelRow
          key={panel.panel}
          panel={panel}
          onChange={controller.updatePanel}
          onDragStart={() => controller.setDragged(panel.panel)}
          onDrop={() => controller.dropOn(panel.panel)}
        />
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
  panel: WorkspacePanelConfig;
  onChange: (next: WorkspacePanelConfig) => void;
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
        <span>{t("settings.workspaceEditor.dock")}</span>
        <select
          value={panel.dock}
          onChange={(event) =>
            onChange({
              ...panel,
              dock: event.currentTarget.value as WorkspaceDock,
            })
          }
        >
          {workspaceDocks.map((dock) => (
            <option key={dock} value={dock}>
              {dockLabel(t, dock)}
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
              size_px: event.currentTarget.value
                ? Number(event.currentTarget.value)
                : null,
            })
          }
        />
      </label>
      <label className={styles.fieldRow}>
        <span>{t("settings.workspaceEditor.visible")}</span>
        <input
          type="checkbox"
          checked={panel.visible}
          onChange={(event) =>
            onChange({ ...panel, visible: event.currentTarget.checked })
          }
        />
      </label>
    </div>
  );
}

function QuickOptions({
  controller,
}: { controller: WorkspaceEditorController }) {
  const { t } = useI18n();
  return (
    <div className={styles.quick}>
      <SelectOption
        label={t("settings.workspaceEditor.actionBar")}
        value={controller.config.action_bar_dock}
        values={["top", "bottom"]}
        labelFor={(value) => dockLabel(t, value as WorkspaceDock)}
        onChange={(value) =>
          controller.setConfig((current) => ({
            ...current,
            action_bar_dock: value as "top" | "bottom",
          }))
        }
      />
      <SelectOption
        label={t("settings.workspaceEditor.systemStatus")}
        value={controller.config.system_status_position}
        values={["top", "bottom", "hidden"]}
        labelFor={(value) =>
          value === "hidden"
            ? t("settings.workspaceEditor.status.hidden")
            : dockLabel(t, value as WorkspaceDock)
        }
        onChange={(value) =>
          controller.setConfig((current) => ({
            ...current,
            system_status_position: value as SystemStatusPosition,
          }))
        }
      />
    </div>
  );
}

function SelectOption({
  label,
  value,
  values,
  labelFor,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  labelFor: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.fieldRow}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {labelFor(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EditorActions({
  controller,
}: { controller: WorkspaceEditorController }) {
  const { t } = useI18n();
  return (
    <div className={styles.footerActions}>
      <button
        className="btn"
        type="button"
        disabled={controller.saving}
        onClick={() => void controller.save()}
      >
        {controller.saving
          ? t("common.loading")
          : t("settings.workspaceEditor.apply")}
      </button>
      <button
        className="btn secondary"
        type="button"
        disabled={controller.saving}
        onClick={controller.discard}
      >
        {t("settings.workspaceEditor.discard")}
      </button>
      {controller.notice && (
        <span className={styles.notice}>
          {t(`settings.appearance.${controller.notice}`)}
        </span>
      )}
    </div>
  );
}

function dockLabel(
  t: (key: TranslationKey) => string,
  dock: WorkspaceDock,
): string {
  return t(`settings.workspaceEditor.dock.${dock}`);
}
