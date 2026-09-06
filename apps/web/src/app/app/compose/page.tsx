"use client";

import { Suspense } from "react";
import styles from "./compose-overlay.module.css";
import { ComposeUi } from "./compose-ui";
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
