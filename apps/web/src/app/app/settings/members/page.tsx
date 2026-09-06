"use client";

import { SettingsShell } from "@/components/settings-shell";
import { MembersUi } from "./members-ui";
import { useMembersPage } from "./use-members-page";

export default function MembersPage() {
  const controller = useMembersPage();
  return <SettingsShell><MembersUi controller={controller} /></SettingsShell>;
}
