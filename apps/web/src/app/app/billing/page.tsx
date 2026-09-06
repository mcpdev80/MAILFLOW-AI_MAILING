"use client";

import { SettingsShell } from "@/components/settings-shell";
import { BillingUi } from "./billing-ui";
import { useBillingPage } from "./use-billing-page";

export default function BillingPage() {
  return <SettingsShell><BillingUi state={useBillingPage()} /></SettingsShell>;
}
