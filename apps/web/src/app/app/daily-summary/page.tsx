"use client";

import { DailySummaryUi } from "./daily-summary-ui";
import { useDailySummaryPage } from "./use-daily-summary-page";

export default function DailySummaryPage() {
  const summary = useDailySummaryPage();

  return (
    <DailySummaryUi
      summary={summary.summary}
      error={summary.error}
      isEmpty={summary.isEmpty}
      onReload={summary.reload}
    />
  );
}
