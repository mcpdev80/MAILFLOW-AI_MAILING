"use client";

import { WorkspaceEditorUi } from "./workspace-editor-ui";
import { useWorkspaceEditor } from "./use-workspace-editor";

export default function WorkspaceEditorPage() {
  const controller = useWorkspaceEditor();
  return <WorkspaceEditorUi controller={controller} />;
}
