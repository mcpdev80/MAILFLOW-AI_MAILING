"use client";

import { Suspense } from "react";
import { ComposeUi } from "./compose-ui";
import { useComposePage } from "./use-compose-page";

function ComposePageContent() {
  const controller = useComposePage();
  return <ComposeUi controller={controller} />;
}

export default function ComposePage() {
  return (
    <Suspense fallback={null}>
      <ComposePageContent />
    </Suspense>
  );
}
