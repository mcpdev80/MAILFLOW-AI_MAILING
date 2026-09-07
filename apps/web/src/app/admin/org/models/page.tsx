"use client";

import { ModelSettingsUi } from "@/app/app/settings/models/model-settings-ui";
import { useModelSettings } from "@/app/app/settings/models/use-model-settings";

export default function OrganizationModelsPage() {
  const controller = useModelSettings();
  return <ModelSettingsUi controller={controller} />;
}
