"use client";

import { useI18n } from "@/lib/i18n";
import {
  MAIL_ACTION_GROUPS,
  type MailActionDefinition,
  type MailActionId,
} from "@/lib/mail-actions";
import type { MailboxCapabilities } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./mail-context-menu.module.css";

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
  if (!items.length) return;
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

function ActionButton(props: {
  action: MailActionDefinition;
  allowed: boolean;
  expanded: boolean;
  onRun: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      className={styles.actionButton}
      type="button"
      role="menuitem"
      disabled={!props.allowed}
      aria-disabled={!props.allowed}
      aria-haspopup={props.action.submenu?.length ? "menu" : undefined}
      aria-expanded={props.action.submenu?.length ? props.expanded : undefined}
      data-destructive={props.action.destructive || undefined}
      data-ai={props.action.ai || undefined}
      onKeyDown={props.onKeyDown}
      onClick={props.onRun}
    >
      {t(props.action.labelKey)}
      {props.action.submenu?.length ? (
        <span className={styles.chevron}>›</span>
      ) : null}
    </button>
  );
}

function GroupMenu(props: {
  group: Group;
  capabilities: MailboxCapabilities | null | undefined;
  expanded: boolean;
  openSubmenu: string | null;
  setOpenSubmenu: (value: string | null) => void;
  run: (action: MailActionDefinition) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}) {
  if (!props.expanded) return null;
  return (
    <div role="menu">
      {props.group.actions.map((action) => (
        <GroupAction key={action.id} action={action} props={props} />
      ))}
    </div>
  );
}

function GroupAction({
  action,
  props,
}: { action: MailActionDefinition; props: Parameters<typeof GroupMenu>[0] }) {
  const submenuOpen = props.openSubmenu === action.id;
  return (
    <div>
      <ActionButton
        action={action}
        allowed={capabilityAllowed(action, props.capabilities)}
        expanded={submenuOpen}
        onRun={() =>
          action.submenu?.length
            ? props.setOpenSubmenu(submenuOpen ? null : action.id)
            : props.run(action)
        }
        onKeyDown={props.onKeyDown}
      />
      {submenuOpen && action.submenu?.length ? (
        <Submenu action={action} props={props} />
      ) : null}
    </div>
  );
}

function Submenu({
  action,
  props,
}: { action: MailActionDefinition; props: Parameters<typeof GroupMenu>[0] }) {
  return (
    <div className={styles.submenu} role="menu">
      {action.submenu?.map((child) => (
        <ActionButton
          key={`${action.id}-${child.id}`}
          action={child}
          allowed={capabilityAllowed(child, props.capabilities)}
          expanded={false}
          onRun={() => props.run(child)}
          onKeyDown={props.onKeyDown}
        />
      ))}
    </div>
  );
}

function useMenuDismiss(
  menuRef: React.RefObject<HTMLDivElement | null>,
  openGroup: string | null,
  setOpenGroup: (value: string | null) => void,
  openSubmenu: string | null,
  setOpenSubmenu: (value: string | null) => void,
  onClose: () => void,
) {
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
  }, [menuRef, onClose, openGroup, openSubmenu, setOpenGroup, setOpenSubmenu]);
}

export function MailContextMenu(props: MailContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = useVisibleGroups(props.seen, props.flagged);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  useMenuDismiss(
    menuRef,
    openGroup,
    setOpenGroup,
    openSubmenu,
    setOpenSubmenu,
    props.onClose,
  );
  useInitialFocus(menuRef);
  const run = (action: MailActionDefinition) => runAction(action, props);
  return (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={t("mail.group.more")}
      style={{
        position: "fixed",
        left: props.position.x,
        top: props.position.y,
      }}
    >
      <GroupList
        groups={groups}
        capabilities={props.capabilities}
        openGroup={openGroup}
        setOpenGroup={setOpenGroup}
        openSubmenu={openSubmenu}
        setOpenSubmenu={setOpenSubmenu}
        run={run}
        menuRef={menuRef}
      />
    </div>
  );
}

function useInitialFocus(menuRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus(),
    );
  }, [menuRef]);
}

function runAction(action: MailActionDefinition, props: MailContextMenuProps) {
  if (!capabilityAllowed(action, props.capabilities)) return;
  void props.onAction(action.id);
  props.onClose();
}

function GroupList(props: {
  groups: Group[];
  capabilities: MailboxCapabilities | null | undefined;
  openGroup: string | null;
  setOpenGroup: (value: string | null) => void;
  openSubmenu: string | null;
  setOpenSubmenu: (value: string | null) => void;
  run: (action: MailActionDefinition) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  return (
    <>
      {props.groups.map((group) => (
        <div className={styles.group} key={group.id}>
          <button
            className={styles.groupButton}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={props.openGroup === group.id}
            onKeyDown={(event) => focusByKey(event, props.menuRef.current)}
            onClick={() => {
              props.setOpenGroup(
                props.openGroup === group.id ? null : group.id,
              );
              props.setOpenSubmenu(null);
            }}
          >
            {t(group.labelKey)}
            <span className={styles.chevron}>›</span>
          </button>
          <GroupMenu
            group={group}
            capabilities={props.capabilities}
            expanded={props.openGroup === group.id}
            openSubmenu={props.openSubmenu}
            setOpenSubmenu={props.setOpenSubmenu}
            run={props.run}
            onKeyDown={(event) => focusByKey(event, props.menuRef.current)}
          />
        </div>
      ))}
    </>
  );
}
