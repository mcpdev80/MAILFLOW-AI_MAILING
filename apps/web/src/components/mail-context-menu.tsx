"use client";

import {
  MAIL_ACTION_GROUPS,
  type MailActionDefinition,
  type MailActionId,
} from "@/lib/mail-actions";
import type { MailboxCapabilities } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface MailContextMenuProps {
  position: ContextMenuPosition;
  capabilities: MailboxCapabilities | null | undefined;
  seen: boolean;
  flagged: boolean;
  onAction: (action: MailActionId) => void | Promise<void>;
  onClose: () => void;
}

type Group = (typeof MAIL_ACTION_GROUPS)[number];

function capabilityAllowed(
  action: MailActionDefinition,
  capabilities: MailboxCapabilities | null | undefined,
): boolean {
  if (!action.capability) return true;
  return Boolean(capabilities?.[action.capability]);
}

function actionVisible(
  action: MailActionDefinition,
  seen: boolean,
  flagged: boolean,
): boolean {
  if (action.id === "mark_read") return !seen;
  if (action.id === "mark_unread") return seen;
  if (action.id === "flag") return !flagged;
  if (action.id === "unflag") return flagged;
  return true;
}

function useVisibleGroups(seen: boolean, flagged: boolean) {
  return useMemo(
    () =>
      MAIL_ACTION_GROUPS.map((group) => ({
        ...group,
        actions: group.actions.filter((action) =>
          actionVisible(action, seen, flagged),
        ),
      })),
    [flagged, seen],
  );
}

function focusByKey(
  event: React.KeyboardEvent<HTMLElement>,
  root: HTMLDivElement | null,
) {
  if (!root) return;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])"),
  );
  const index = items.indexOf(event.currentTarget);
  const targets: Record<string, HTMLElement | undefined> = {
    ArrowDown: items[(index + 1) % items.length],
    ArrowUp: items[(index - 1 + items.length) % items.length],
    Home: items[0],
    End: items.at(-1),
  };
  const target = targets[event.key];
  if (!target) return;
  event.preventDefault();
  target.focus();
}

function ActionButton({
  action,
  allowed,
  expanded,
  onRun,
  onKeyDown,
}: {
  action: MailActionDefinition;
  allowed: boolean;
  expanded: boolean;
  onRun: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={!allowed}
      aria-disabled={!allowed}
      aria-haspopup={action.submenu?.length ? "menu" : undefined}
      aria-expanded={action.submenu?.length ? expanded : undefined}
      data-destructive={action.destructive || undefined}
      data-ai={action.ai || undefined}
      onKeyDown={onKeyDown}
      onClick={onRun}
    >
      {action.label}
    </button>
  );
}

function GroupMenu({
  group,
  capabilities,
  expanded,
  openSubmenu,
  setOpenSubmenu,
  run,
  onKeyDown,
}: {
  group: Group;
  capabilities: MailboxCapabilities | null | undefined;
  expanded: boolean;
  openSubmenu: string | null;
  setOpenSubmenu: (value: string | null) => void;
  run: (action: MailActionDefinition) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}) {
  if (!expanded) return null;
  return (
    <div role="menu" data-mail-menu-group={group.id}>
      {group.actions.map((action) => {
        const allowed = capabilityAllowed(action, capabilities);
        const submenuOpen = openSubmenu === action.id;
        return (
          <div key={action.id}>
            <ActionButton
              action={action}
              allowed={allowed}
              expanded={submenuOpen}
              onRun={() => {
                if (action.submenu?.length) {
                  setOpenSubmenu(submenuOpen ? null : action.id);
                } else {
                  run(action);
                }
              }}
              onKeyDown={onKeyDown}
            />
            {submenuOpen && action.submenu?.length ? (
              <div role="menu">
                {action.submenu.map((child) => (
                  <ActionButton
                    key={`${action.id}-${child.id}`}
                    action={child}
                    allowed={capabilityAllowed(child, capabilities)}
                    expanded={false}
                    onRun={() => run(child)}
                    onKeyDown={onKeyDown}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function MailContextMenu(props: MailContextMenuProps) {
  const { position, capabilities, seen, flagged, onAction, onClose } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = useVisibleGroups(seen, flagged);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (openSubmenu) setOpenSubmenu(null);
      else if (openGroup) setOpenGroup(null);
      else onClose();
    };
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, openGroup, openSubmenu]);

  useEffect(() => {
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });
  }, []);

  const run = (action: MailActionDefinition) => {
    if (!capabilityAllowed(action, capabilities)) return;
    void onAction(action.id);
    onClose();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) =>
    focusByKey(event, menuRef.current);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      data-mail-context-menu
      style={{ position: "fixed", left: position.x, top: position.y }}
    >
      {groups.map((group) => (
        <div key={group.id}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openGroup === group.id}
            onKeyDown={onKeyDown}
            onClick={() => {
              setOpenGroup(openGroup === group.id ? null : group.id);
              setOpenSubmenu(null);
            }}
          >
            {group.label}
          </button>
          <GroupMenu
            group={group}
            capabilities={capabilities}
            expanded={openGroup === group.id}
            openSubmenu={openSubmenu}
            setOpenSubmenu={setOpenSubmenu}
            run={run}
            onKeyDown={onKeyDown}
          />
        </div>
      ))}
    </div>
  );
}
