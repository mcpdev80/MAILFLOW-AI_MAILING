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

export function MailContextMenu({
  position,
  capabilities,
  seen,
  flagged,
  onAction,
  onClose,
}: MailContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      MAIL_ACTION_GROUPS.map((group) => ({
        ...group,
        actions: group.actions.filter((action) =>
          actionVisible(action, seen, flagged),
        ),
      })),
    [flagged, seen],
  );

  useEffect(() => {
    const handlePointer = (event: MouseEvent | PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (openSubmenu) setOpenSubmenu(null);
        else if (openGroup) setOpenGroup(null);
        else onClose();
      }
    };
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, openGroup, openSubmenu]);

  useEffect(() => {
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });
  }, []);

  function run(action: MailActionDefinition) {
    if (!capabilityAllowed(action, capabilities)) return;
    if (action.submenu?.length) {
      setOpenSubmenu((current) => (current === action.id ? null : action.id));
      return;
    }
    void onAction(action.id);
    onClose();
  }

  function keyboardNavigate(event: React.KeyboardEvent<HTMLElement>) {
    const root = menuRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])"),
    );
    const index = items.indexOf(event.currentTarget);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  }

  return (
    <div
      ref={menuRef}
      className="mailContextMenu"
      role="menu"
      aria-label="Message actions"
      style={{ left: position.x, top: position.y }}
    >
      {groups.map((group) => (
        <div className="menuGroup" key={group.id}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openGroup === group.id}
            onKeyDown={keyboardNavigate}
            onClick={() => {
              setOpenGroup((current) =>
                current === group.id ? null : group.id,
              );
              setOpenSubmenu(null);
            }}
          >
            <span>{group.label}</span>
            <span aria-hidden="true">›</span>
          </button>
          {openGroup === group.id && (
            <div className="submenu" role="menu">
              {group.actions.map((action) => {
                const allowed = capabilityAllowed(action, capabilities);
                return (
                  <div className="submenuItem" key={action.id}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!allowed}
                      aria-disabled={!allowed}
                      aria-haspopup={
                        action.submenu?.length ? "menu" : undefined
                      }
                      aria-expanded={
                        action.submenu?.length
                          ? openSubmenu === action.id
                          : undefined
                      }
                      className={action.destructive ? "danger" : undefined}
                      title={
                        allowed
                          ? undefined
                          : "This mailbox/provider does not support this action."
                      }
                      onKeyDown={keyboardNavigate}
                      onClick={() => run(action)}
                    >
                      <span>
                        {action.ai ? `✨ ${action.label}` : action.label}
                      </span>
                      {action.submenu?.length ? (
                        <span aria-hidden="true">›</span>
                      ) : null}
                    </button>
                    {action.submenu?.length && openSubmenu === action.id && (
                      <div className="nestedSubmenu" role="menu">
                        {action.submenu.map((child) => (
                          <button
                            type="button"
                            role="menuitem"
                            key={`${action.id}-${child.label}`}
                            onKeyDown={keyboardNavigate}
                            onClick={() => run(child)}
                          >
                            {child.ai ? `✨ ${child.label}` : child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <style jsx>{`
        .mailContextMenu {
          position: fixed;
          z-index: 1000;
          min-width: 190px;
          max-width: min(290px, calc(100vw - 16px));
          padding: 0.35rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface, var(--bg));
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.24);
        }
        .menuGroup { position: relative; }
        button {
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 0.52rem 0.62rem;
          border-radius: 7px;
          text-align: left;
          cursor: pointer;
          font: inherit;
          white-space: nowrap;
        }
        button:hover,
        button:focus-visible {
          outline: none;
          background: var(--surface-2, rgba(127, 127, 127, 0.13));
        }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .danger { color: #dc2626; }
        .submenu,
        .nestedSubmenu {
          position: absolute;
          left: calc(100% - 3px);
          top: 0;
          min-width: 220px;
          padding: 0.35rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface, var(--bg));
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
        }
        .submenuItem { position: relative; }
        .nestedSubmenu { left: calc(100% - 3px); }
        @media (max-width: 780px) {
          .mailContextMenu {
            left: 8px !important;
            right: 8px;
            top: auto !important;
            bottom: 8px;
            max-width: none;
          }
          .submenu,
          .nestedSubmenu {
            position: static;
            margin: 0.25rem 0 0.25rem 0.65rem;
            box-shadow: none;
            border-radius: 8px;
          }
        }
      `}</style>
    </div>
  );
}
