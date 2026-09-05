import { api } from "./api";
import { undoMailMove, type MoveUndoRequest } from "./mail-ux-api";
import type {
  EmailAccount,
  InboxMessage,
  MailActionResult,
  MailboxMetadata,
  MessageDetail,
  UnifiedInbox,
} from "./types";

export type WorkspaceBootstrap = {
  accounts: EmailAccount[];
  inbox: UnifiedInbox;
};

export type MessagePointer = Pick<
  InboxMessage,
  "account_id" | "folder" | "uid" | "message_id"
>;

export type MoveTarget = {
  account_id: string;
  folder: string;
};

export function canMoveToTarget(
  message: Pick<MessagePointer, "account_id">,
  target: Pick<MoveTarget, "account_id">,
): boolean {
  return message.account_id === target.account_id;
}

export async function loadWorkspaceBootstrap(
  accountId?: string | null,
  folder?: string | null,
): Promise<WorkspaceBootstrap> {
  const [accounts, inbox] = await Promise.all([
    api.listAccounts(),
    api.unifiedInbox({ accountId, folder, limit: 50 }),
  ]);
  return { accounts, inbox };
}

export function loadMailboxMetadata(accountId: string): Promise<MailboxMetadata> {
  return api.mailboxMetadata(accountId);
}

export function loadMessage(pointer: MessagePointer): Promise<MessageDetail> {
  return api.messageDetail(pointer.account_id, pointer.folder, pointer.uid);
}

export async function moveMessage(
  message: MessagePointer,
  target: MoveTarget,
): Promise<MailActionResult> {
  if (!canMoveToTarget(message, target)) {
    throw new Error("cross_account_move_not_supported");
  }
  return api.mailAction(message.account_id, message.folder, message.uid, {
    action: "move",
    destination_folder: target.folder,
  });
}

export function undoMove(
  accountId: string,
  payload: MoveUndoRequest,
): Promise<MailActionResult> {
  return undoMailMove(accountId, payload);
}
