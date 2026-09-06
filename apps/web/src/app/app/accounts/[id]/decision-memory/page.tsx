"use client";

import { DecisionMemoryUi } from "./decision-memory-ui";
import { useDecisionMemoryPage } from "./use-decision-memory-page";

export default function DecisionMemoryPage() {
  const decision = useDecisionMemoryPage();

  return (
    <DecisionMemoryUi
      accountId={decision.accountId}
      entries={decision.entries}
      editing={decision.editing}
      draft={decision.draft}
      busy={decision.busy}
      error={decision.error}
      notice={decision.notice}
      setDraft={decision.setDraft}
      onBeginEdit={decision.beginEdit}
      onCancelEdit={decision.cancelEdit}
      onSave={decision.save}
      onToggle={decision.toggle}
      onRemove={decision.remove}
      onReload={decision.reload}
    />
  );
}
