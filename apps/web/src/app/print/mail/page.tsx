"use client";

import { Suspense } from "react";
import { MailPrintUi } from "./mail-print-ui";
import { useMailPrintPage } from "./use-mail-print-page";

function MailPrintContent() {
  return <MailPrintUi state={useMailPrintPage()} />;
}

export default function MailPrintPage() {
  return (
    <Suspense fallback={null}>
      <MailPrintContent />
    </Suspense>
  );
}
