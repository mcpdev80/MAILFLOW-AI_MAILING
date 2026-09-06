"use client";

import { SettingsShell } from "@/components/settings-shell";
import { ModelSettingsUi } from "./model-settings-ui";
import { useModelSettings } from "./use-model-settings";

export default function ModelSettingsPage() {
  const controller = useModelSettings();
  return <SettingsShell><ModelSettingsUi controller={controller} /></SettingsShell>;
}
