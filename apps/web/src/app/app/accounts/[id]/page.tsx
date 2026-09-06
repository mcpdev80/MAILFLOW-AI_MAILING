"use client";

import { AccountDetailUi } from "./account-detail-ui";
import { useAccountDetail } from "./use-account-detail";

export default function AccountDetailPage() {
  const controller = useAccountDetail();
  return <AccountDetailUi controller={controller} />;
}
