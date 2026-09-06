"use client";

import { OnboardingUi } from "./onboarding-ui";
import { useOnboardingPage } from "./use-onboarding-page";

export default function OnboardingPage() {
  return <OnboardingUi controller={useOnboardingPage()} />;
}
