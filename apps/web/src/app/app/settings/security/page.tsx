"use client";

import { SettingsShell } from "@/components/settings-shell";
import { SecuritySettingsUi } from "./security-settings-ui";
import { useSecuritySettings } from "./use-security-settings";

export default function SecuritySettingsPage() {
  const controller = useSecuritySettings();
  return <SettingsShell><SecuritySettingsUi controller={controller} /></SettingsShell>;
}
