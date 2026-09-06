"use client";

import { Suspense } from "react";
import { OnboardingUi } from "./onboarding-ui";
import { useOnboardingPage } from "./use-onboarding-page";

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  return <OnboardingUi controller={useOnboardingPage()} />;
}
