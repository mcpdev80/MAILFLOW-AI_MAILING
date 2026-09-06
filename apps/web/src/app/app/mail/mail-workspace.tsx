"use client";

import { useAppearance } from "@/lib/appearance-preferences";
import type { WorkspacePanel } from "@/lib/types";
import { ContentPane } from "./mail-workspace-content";
import styles from "./mail-workspace.module.css";
import { WorkspaceOverlays } from "./mail-workspace-overlays";
import {
  AccountsPanel,
  ClassicSidePane,
  FoldersPanel,
  MessageListPane,
} from "./mail-workspace-panels";
import { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

export function MailWorkspace() {
  const state = useMailWorkspace();
  const appearance = useAppearance();
  return (
    <main className={styles.page}>
      {state.error && <div className={styles.error}>{state.error}</div>}
      {appearance.workspaceLayout === "custom" ? (
        <CustomWorkspace state={state} />
      ) : (
        <StandardWorkspace state={state} />
      )}
      <WorkspaceOverlays state={state} />
    </main>
  );
}

function StandardWorkspace({ state }: { state: WorkspaceState }) {
  const appearance = useAppearance();
  return (
    <div
      className={styles.workspace}
      data-layout={appearance.workspaceLayout}
      data-side={appearance.sidePanelAlignment}
    >
      <ClassicSidePane state={state} />
      <MessageListPane state={state} />
      <ContentPane state={state} />
    </div>
  );
}

function CustomWorkspace({ state }: { state: WorkspaceState }) {
  const appearance = useAppearance();
  const config = appearance.workspaceCustomConfig;
  if (!config) return <StandardWorkspace state={state} />;
  return (
    <div className={styles.customWorkspace}>
      {[...config.panels]
        .sort((a, b) => a.order - b.order)
        .filter((panel) => panel.visible)
        .map((panel) => (
          <CustomPanel
            key={panel.panel}
            panel={panel.panel}
            dock={panel.dock}
            order={panel.order}
            size={panel.size_px}
            state={state}
            actionBarBottom={config.action_bar_dock === "bottom"}
          />
        ))}
    </div>
  );
}

function CustomPanel({
  panel,
  dock,
  order,
  size,
  state,
  actionBarBottom,
}: {
  panel: WorkspacePanel;
  dock: "left" | "center" | "right" | "top" | "bottom";
  order: number;
  size: number | null;
  state: WorkspaceState;
  actionBarBottom: boolean;
}) {
  const fullRow = dock === "top" || dock === "bottom";
  const basis = fullRow
    ? "100%"
    : size
      ? `${size}px`
      : panel === "message_content"
        ? "480px"
        : "240px";
  return (
    <section
      className={styles.customPanel}
      data-full-row={fullRow}
      style={{
        flexBasis: basis,
        flexGrow: panel === "message_content" && !fullRow ? 1 : 0,
        order,
      }}
    >
      <PanelContent panel={panel} state={state} actionBarBottom={actionBarBottom} />
    </section>
  );
}

function PanelContent({
  panel,
  state,
  actionBarBottom,
}: {
  panel: WorkspacePanel;
  state: WorkspaceState;
  actionBarBottom: boolean;
}) {
  if (panel === "accounts") return <AccountsPanel state={state} />;
  if (panel === "folders") return <FoldersPanel state={state} />;
  if (panel === "message_list") return <MessageListPane state={state} />;
  return <ContentPane state={state} actionBarBottom={actionBarBottom} />;
}
