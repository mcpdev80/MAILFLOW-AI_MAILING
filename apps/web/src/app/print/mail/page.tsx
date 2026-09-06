"use client";

import { MailPrintUi } from "./mail-print-ui";
import { useMailPrintPage } from "./use-mail-print-page";

export default function MailPrintPage() {
  return <MailPrintUi state={useMailPrintPage()} />;
}
