"use client";

import { useWorkspaceEditor } from "./use-workspace-editor";
import { WorkspaceEditorUi } from "./workspace-editor-ui";

export default function WorkspaceEditorPage() {
  const controller = useWorkspaceEditor();
  return <WorkspaceEditorUi controller={controller} />;
}
