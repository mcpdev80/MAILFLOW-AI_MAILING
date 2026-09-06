import { InvitationUi } from "./invitation-ui";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return <InvitationUi invitationId={invitationId} />;
}
