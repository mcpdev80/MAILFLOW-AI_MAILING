"use client";

import { BillingUi } from "./billing-ui";
import { useBillingPage } from "./use-billing-page";

export default function BillingPage() {
  return <BillingUi state={useBillingPage()} />;
}
