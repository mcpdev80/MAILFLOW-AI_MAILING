"use client";

import { SecuritySettingsUi } from "./security-settings-ui";
import { useSecuritySettings } from "./use-security-settings";

export default function SecuritySettingsPage() {
  const controller = useSecuritySettings();
  return <SecuritySettingsUi controller={controller} />;
}
