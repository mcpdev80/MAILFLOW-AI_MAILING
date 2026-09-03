"use client";

import { authClient, useSession } from "@/lib/auth-client";
import { ApiError, api } from "@/lib/api";
import type {
  Cycle,
  EmailAccount,
  SharedMailboxAccess,
} from "@/lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  userId?: string;
  role: string;
  user?: { id?: string; email?: string; name?: string };
};

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params.id;

  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sharedAccess, setSharedAccess] = useState<SharedMailboxAccess[] | null>(
    null,
  );
  const [selectedSharedUsers, setSelectedSharedUsers] = useState<string[]>([]);
  const [transferUserId, setTransferUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [acc, cyc] = await Promise.all([
        api.getAccount(id),
        api.listCycles(id),
      ]);
      setAccount(acc);
      setCycles(cyc);

      if (acc.ownership_mode === "shared") {
        try {
          const access = await api.listSharedAccess(id);
          setSharedAccess(access);
          setSelectedSharedUsers(
            access.filter((grant) => grant.can_use).map((grant) => grant.user_id),
          );
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            // The user may use this shared mailbox without managing its sharing.
            setSharedAccess(null);
          } else {
            throw err;
          }
        }
      } else {
        setSharedAccess(null);
        setSelectedSharedUsers([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load account",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session?.user?.id) return;
    authClient.organization
      .listMembers()
      .then((result) => {
        if (!result.error) {
          const data = result.data as unknown as { members?: Member[] };
          setMembers(data.members ?? []);
        }
      })
      .catch(() => {
        /* Member data is only needed for optional ownership management. */
      });
  }, [session?.user?.id]);

  const isPrivateOwner =
    account?.ownership_mode === "private" &&
    account.owner_user_id === session?.user?.id;
  const canManageShared = sharedAccess !== null;
  const canManageOwnership = isPrivateOwner || canManageShared;

  const memberOptions = useMemo(
    () =>
      members
        .map((member) => ({
          id: member.userId ?? member.user?.id ?? "",
          label:
            member.user?.email ??
            member.user?.name ??
            member.userId ??
            member.user?.id ??
            member.id,
          role: member.role,
        }))
        .filter((member) => member.id),
    [members],
  );

  async function runNow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.runCycle(id);
      setTimeout(load, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Disconnect this mailbox? Processing history is removed.")) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteAccount(id);
      router.push("/app/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  function toggleSharedUser(userId: string, checked: boolean) {
    setSelectedSharedUsers((current) =>
      checked
        ? [...new Set([...current, userId])]
        : current.filter((value) => value !== userId),
    );
  }

  async function saveSharedAccess() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const access = await api.replaceSharedAccess(id, selectedSharedUsers);
      setSharedAccess(access);
      setSelectedSharedUsers(
        access.filter((grant) => grant.can_use).map((grant) => grant.user_id),
      );
      setNotice("Shared mailbox access updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update access");
    } finally {
      setBusy(false);
    }
  }

  async function makeShared() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.changeMailboxOwnership(id, {
        mode: "shared",
        shared_user_ids: selectedSharedUsers,
      });
      setAccount(updated);
      await load();
      setNotice("Mailbox is now shared with the selected members.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not share mailbox");
    } finally {
      setBusy(false);
    }
  }

  async function makePrivate() {
    if (!transferUserId) {
      setError("Select the new private owner first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.changeMailboxOwnership(id, {
        mode: "private",
        target_owner_user_id: transferUserId,
      });
      if (updated.owner_user_id !== session?.user?.id) {
        router.push("/app/dashboard");
        return;
      }
      setAccount(updated);
      await load();
      setNotice("Mailbox is now private.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not change mailbox owner",
      );
    } finally {
      setBusy(false);
    }
  }

  async function transferPrivateMailbox() {
    if (!transferUserId) {
      setError("Select the new owner first.");
      return;
    }
    if (!confirm("Transfer this private mailbox to the selected user?")) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.changeMailboxOwnership(id, {
        mode: "private",
        target_owner_user_id: transferUserId,
      });
      router.push("/app/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed");
      setBusy(false);
    }
  }

  const totals = cycles.reduce(
    (acc, c) => {
      acc.emails += c.emails_processed;
      acc.drafts += c.drafts_saved;
      acc.errors += c.error_count;
      return acc;
    },
    { emails: 0, drafts: 0, errors: 0 },
  );

  return (
    <main className="container">
      <p>
        <Link href="/app/dashboard">← Dashboard</Link>
      </p>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {account && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <h1 style={{ margin: 0 }}>{account.username}</h1>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                type="button"
                className="btn"
                onClick={runNow}
                disabled={busy}
              >
                {busy ? "Working…" : "Run cycle now"}
              </button>
              {canManageOwnership && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={remove}
                  disabled={busy}
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
          <p className="muted">
            {account.imap_host}:{account.imap_port} · every{" "}
            {account.interval_minutes} min ·{" "}
            {account.is_active ? "active" : "paused"} ·{" "}
            {account.ownership_mode}
          </p>

          {session?.user?.id && canManageOwnership && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <h3>Mailbox access</h3>

              {account.ownership_mode === "private" && isPrivateOwner && (
                <>
                  <p className="muted">
                    This mailbox is private. Organization admins cannot see it.
                  </p>
                  <div className="field">
                    <span>Share with selected members</span>
                    {memberOptions.map((member) => (
                      <label
                        key={member.id}
                        style={{ display: "flex", gap: "0.5rem" }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSharedUsers.includes(member.id)}
                          onChange={(e) =>
                            toggleSharedUser(member.id, e.target.checked)
                          }
                        />
                        <span>
                          {member.label}{" "}
                          <span className="muted">· {member.role}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={makeShared}
                  >
                    Convert to shared
                  </button>

                  <hr style={{ margin: "1.25rem 0" }} />
                  <div className="field">
                    <label htmlFor="transfer-owner">Transfer private ownership</label>
                    <select
                      id="transfer-owner"
                      value={transferUserId}
                      onChange={(e) => setTransferUserId(e.target.value)}
                    >
                      <option value="">Select member…</option>
                      {memberOptions
                        .filter((member) => member.id !== session.user.id)
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.label}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy || !transferUserId}
                    onClick={transferPrivateMailbox}
                  >
                    Transfer ownership
                  </button>
                </>
              )}

              {account.ownership_mode === "shared" && canManageShared && (
                <>
                  <p className="muted">
                    Only explicitly selected members can see this shared mailbox.
                  </p>
                  <div className="field">
                    <span>Members with mailbox access</span>
                    {memberOptions.map((member) => (
                      <label
                        key={member.id}
                        style={{ display: "flex", gap: "0.5rem" }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSharedUsers.includes(member.id)}
                          onChange={(e) =>
                            toggleSharedUser(member.id, e.target.checked)
                          }
                        />
                        <span>
                          {member.label}{" "}
                          <span className="muted">· {member.role}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={saveSharedAccess}
                  >
                    Save access
                  </button>

                  <hr style={{ margin: "1.25rem 0" }} />
                  <div className="field">
                    <label htmlFor="private-owner">Convert to private mailbox</label>
                    <select
                      id="private-owner"
                      value={transferUserId}
                      onChange={(e) => setTransferUserId(e.target.value)}
                    >
                      <option value="">Select owner…</option>
                      {memberOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy || !transferUserId}
                    onClick={makePrivate}
                  >
                    Make private
                  </button>
                </>
              )}
            </div>
          )}

          <div className="stat-grid" style={{ margin: "1.25rem 0" }}>
            <div className="stat">
              <div className="n">{cycles.length}</div>
              <div className="l">cycles</div>
            </div>
            <div className="stat">
              <div className="n">{totals.emails}</div>
              <div className="l">emails processed</div>
            </div>
            <div className="stat">
              <div className="n">{totals.drafts}</div>
              <div className="l">drafts saved</div>
            </div>
            <div className="stat">
              <div className="n">{totals.errors}</div>
              <div className="l">errors</div>
            </div>
          </div>

          <div className="card">
            <h3>Cycle history</h3>
            {cycles.length === 0 ? (
              <p className="muted">
                No cycles yet. Hit “Run cycle now” or wait for the scheduler.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Emails</th>
                    <th>Drafts</th>
                    <th>Errors</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.id}>
                      <td className="muted">
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                      <td>{c.emails_processed}</td>
                      <td>{c.drafts_saved}</td>
                      <td>
                        {c.error_count > 0 ? (
                          <span className="pill" style={{ color: "#ff6b6b" }}>
                            {c.error_count}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="muted">
                        {c.duration_ms != null ? `${c.duration_ms} ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </main>
  );
}
