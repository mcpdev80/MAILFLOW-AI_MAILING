"use client";

import { DraftsUi } from "./drafts-ui";
import { useDraftsPage } from "./use-drafts-page";

export default function DraftsPage() {
  return <DraftsUi state={useDraftsPage()} />;
}
