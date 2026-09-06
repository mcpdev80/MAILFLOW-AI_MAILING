"use client";

import { Suspense } from "react";
import { ComposeUi } from "./compose-ui";
import styles from "./compose-overlay.module.css";
import { useComposePage } from "./use-compose-page";

function ComposePageContent() {
  const controller = useComposePage();
  return (
    <div className={styles.overlay}>
      <ComposeUi controller={controller} />
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={null}>
      <ComposePageContent />
    </Suspense>
  );
}
