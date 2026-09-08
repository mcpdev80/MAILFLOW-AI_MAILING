"use client";

import { useAppearance } from "@/lib/appearance-preferences";
import type { WorkspacePanel } from "@/lib/types";
import { useEffect, useState } from "react";
import { ContentPane } from "./mail-workspace-content";
import { WorkspaceOverlays } from "./mail-workspace-overlays";
import {
  AccountsPanel,
  ClassicSidePane,
  FoldersPanel,
  MessageListPane,
} from "./mail-workspace-panels";
import styles from "./mail-workspace.module.css";
import { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

type PaneSizes = {
  side: number;
  list: number;
};

const PANE_STORAGE_KEY = "mailflow:mail-pane-sizes:v1";
const DEFAULT_PANES: PaneSizes = { side: 230, list: 360 };

function readPaneSizes(): PaneSizes {
  if (typeof window === "undefined") return DEFAULT_PANES;
  try {
    const raw = window.localStorage.getItem(PANE_STORAGE_KEY);
    if (!raw) return DEFAULT_PANES;
    const value = JSON.parse(raw) as Partial<PaneSizes>;
    return {
      side: clamp(Number(value.side) || DEFAULT_PANES.side, 170, 420),
      list: clamp(Number(value.list) || DEFAULT_PANES.list, 260, 720),
    };
  } catch {
    return DEFAULT_PANES;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
  const [sizes, setSizes] = useState<PaneSizes>(DEFAULT_PANES);

  useEffect(() => {
    setSizes(readPaneSizes());
  }, []);

  function resizePane(kind: keyof PaneSizes, startX: number, startSize: number) {
    const onMove = (event: PointerEvent) => {
      const direction =
        kind === "side" && appearance.sidePanelAlignment === "right" ? -1 : 1;
      const next = clamp(
        startSize + (event.clientX - startX) * direction,
        kind === "side" ? 170 : 260,
        kind === "side" ? 420 : 720,
      );
      setSizes((current) => ({ ...current, [kind]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      setSizes((current) => {
        window.localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(current));
        return current;
      });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  if (appearance.workspaceLayout === "focus") {
    return (
      <div
        className={styles.workspace}
        data-layout="focus"
        data-side={appearance.sidePanelAlignment}
      >
        <MessageListPane state={state} />
      </div>
    );
  }

  const sidePane = (
    <div className={styles.standardSide} style={{ width: sizes.side }}>
      <ClassicSidePane state={state} />
    </div>
  );
  const messageList = (
    <div className={styles.standardList} style={{ width: sizes.list }}>
      <MessageListPane state={state} />
    </div>
  );
  const content = (
    <div className={styles.standardContent}>
      <ContentPane state={state} />
    </div>
  );
  const sideHandle = (
    <ResizeHandle
      label="Resize folders"
      onPointerDown={(event) => resizePane("side", event.clientX, sizes.side)}
    />
  );
  const listHandle = (
    <ResizeHandle
      label="Resize message list"
      onPointerDown={(event) => resizePane("list", event.clientX, sizes.list)}
    />
  );

  return (
    <div
      className={styles.workspace}
      data-layout={appearance.workspaceLayout}
      data-side={appearance.sidePanelAlignment}
    >
      {appearance.sidePanelAlignment === "right" ? (
        <>
          {messageList}
          {listHandle}
          {content}
          {sideHandle}
          {sidePane}
        </>
      ) : (
        <>
          {sidePane}
          {sideHandle}
          {messageList}
          {listHandle}
          {content}
        </>
      )}
    </div>
  );
}

function ResizeHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={styles.resizeHandle}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
    >
      <span />
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
      <PanelContent
        panel={panel}
        state={state}
        actionBarBottom={actionBarBottom}
      />
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
