"use client";

import { ModelSettingsUi } from "./model-settings-ui";
import { useModelSettings } from "./use-model-settings";

export default function ModelSettingsPage() {
  const controller = useModelSettings();
  return <ModelSettingsUi controller={controller} />;
}
