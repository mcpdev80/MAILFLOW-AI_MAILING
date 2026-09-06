"use client";

import { MembersUi } from "./members-ui";
import { useMembersPage } from "./use-members-page";

export default function MembersPage() {
  const controller = useMembersPage();
  return <MembersUi controller={controller} />;
}
