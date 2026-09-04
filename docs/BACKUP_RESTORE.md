# Backup and restore

MailFlow treats PostgreSQL as the authoritative backup target for application state. Redis is operational queue state and is not required to restore a deployment.

## What to back up

Back up the complete PostgreSQL database with normal PostgreSQL tooling such as `pg_dump`, storage snapshots or managed-database backups. This includes MailFlow organizations, mailbox configuration, processed-message state, compact thread summaries, rules, audit records, Better Auth users/organizations/members, passkey records and encrypted credentials stored in PostgreSQL.

Do not make Redis part of the authoritative backup. Queued jobs are reconstructable from PostgreSQL-backed account state and scheduling.

MailFlow does not require full mailbox bodies or attachments in its application backup. The mailbox provider remains the source of truth for message content.

## Encryption keys are separate

A database dump contains encrypted credential blobs but must not contain the deployment encryption key. Keep `SECRET_ENCRYPTION_KEYS` or the legacy `SECRET_KEY` in a separate protected backup.

A restored database without the matching key intentionally fails secret validation. Do not work around this by deleting or replacing encrypted values unless the affected accounts are deliberately reconnected.

The same applies to web-layer deployment secrets such as `WEB_SECRET_KEY`, `BETTER_AUTH_SECRET` and `INTERNAL_API_SECRET`: preserve them separately from the database backup.

## Passkeys

The PostgreSQL backup contains the Better Auth server-side passkey records: credential ID, public key, counter and metadata. Passkey private keys remain on authenticators and are never stored by MailFlow.

Keep the restored public hostname and WebAuthn RP-ID stable. Restoring under a different hostname or RP-ID can make existing passkeys unusable even when the database restore itself is correct.

## Safe restore sequence

1. Stop MailFlow workers or start them with `WORKER_PAUSED=true`.
2. Restore PostgreSQL.
3. Restore the matching deployment secrets outside PostgreSQL.
4. Run the normal Alembic migration path for the application version being deployed.
5. Start the API. Startup fails if the database schema revision is unsupported or stored encrypted secrets cannot be decrypted.
6. With the API code available, run the restore validator from the API application environment:

   ```bash
   cd apps/api
   python -m app.restore_check
   ```

7. Resolve every validation failure before resuming workers.
8. Validate configured mailbox and LLM providers operationally.
9. Set `WORKER_PAUSED=false` and start/restart workers.

Do not resume mailbox processing before restore validation passes.

## What the validator checks

`python -m app.restore_check` checks the current MailFlow schema revision, decryption of stored mailbox/OAuth/provider secrets, private-mailbox owner invariants, Better Auth organization linkage in multi-user mode, organization membership for private owners and shared mailbox grants, and the presence/count of server-side passkey records.

The command prints only non-secret deployment metadata and counts. It never prints plaintext credentials or encryption keys.

## Schema safeguards

The API and worker both verify the database schema revision before normal startup. The container API entrypoint still runs `alembic upgrade head` first, but direct application startup also fails closed when a database is older or otherwise unsupported.

When adding a new Alembic migration, update `EXPECTED_SCHEMA_REVISION` in `apps/api/app/restore_validation.py` as part of the same change. Destructive or large data migrations require an explicit migration plan rather than silent data loss. Ownership/security migrations must preserve fail-closed behavior.

Before every schema-changing upgrade, create a PostgreSQL backup or storage snapshot.

## Interrupted and queued work

Current mailbox cycle jobs are Redis queue entries keyed by account ID and do not contain credentials. Redis is not restored. Due mailbox work is reconstructed by the worker scheduler from PostgreSQL state.

During a restore, `WORKER_PAUSED=true` prevents both new cycle scheduling and execution of already queued mailbox-mutating cycle jobs. Future persistent backfill/review/apply job types must follow the same rule: PostgreSQL owns resumable state, and any state that was `running` at backup time must be recovered to a safe paused/resumable state before workers resume.

## Backup retention

MailFlow intentionally does not implement its own backup-retention product. Rotation, off-site copies, storage encryption, snapshot schedules and restore testing remain deployment responsibilities. Use the backup capabilities appropriate for the PostgreSQL environment and periodically test a restore with the procedure above.
