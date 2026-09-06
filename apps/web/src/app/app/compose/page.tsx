"use client";

import { ComposeUi } from "./compose-ui";
import { useComposePage } from "./use-compose-page";

export default function ComposePage() {
  const controller = useComposePage();
  return <ComposeUi controller={controller} />;
}
