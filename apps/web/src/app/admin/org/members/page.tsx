"use client";

import { MembersUi } from "@/app/app/settings/members/members-ui";
import { useMembersPage } from "@/app/app/settings/members/use-members-page";

export default function OrganizationMembersPage() {
  const controller = useMembersPage();
  return <MembersUi controller={controller} />;
}
