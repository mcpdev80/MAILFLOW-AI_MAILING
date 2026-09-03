# Secret management

MailFlow stores mailbox passwords, OAuth refresh tokens and organization LLM API keys as authenticated Fernet ciphertext in PostgreSQL. Plaintext values are write-only at the HTTP boundary and are decrypted only in the server-side processing path immediately before use.

## Key configuration

`SECRET_KEY` remains the deployment signing secret and is also the legacy database encryption key when `SECRET_ENCRYPTION_KEYS` is empty.

For independent database encryption, configure `SECRET_ENCRYPTION_KEYS` as a comma-separated Fernet key ring:

```text
SECRET_ENCRYPTION_KEYS=PRIMARY_KEY,FALLBACK_KEY_1,FALLBACK_KEY_2
```

The first key encrypts all new or updated secrets. Remaining keys are used only to decrypt existing ciphertext during rotation.

Never store encryption keys in PostgreSQL, database dumps, Git, logs, audit events or browser-visible configuration. Supply them through the deployment secret mechanism or environment.

## Rotation

Generate a new Fernet key, then temporarily configure the new key first and the current key second:

```text
SECRET_ENCRYPTION_KEYS=NEW_KEY,OLD_KEY
```

Run the rotation command in the API environment:

```bash
python -m app.secret_rotation
```

The command validates/decrypts existing mailbox credentials, OAuth refresh tokens and LLM API keys, then re-encrypts them with `NEW_KEY`. It prints counts only; it never prints plaintext values.

Restart API and workers with the same two-key configuration. Startup validates all encrypted application secrets. Once both services start successfully, remove the old fallback:

```text
SECRET_ENCRYPTION_KEYS=NEW_KEY
```

If the matching key is missing or invalid while encrypted data exists, API/worker startup fails rather than silently processing with unusable credentials.

## Runtime and queues

Workers receive only stable mailbox IDs through Redis/ARQ. They load encrypted configuration from PostgreSQL and decrypt credentials inside the processing cycle. Passwords, refresh tokens and LLM API keys must never be added to job payloads or persistent worker state.

## API and UI behavior

Read APIs do not return mailbox passwords, OAuth refresh tokens or LLM API keys. Provider responses expose only state such as `has_api_key`. Updating a secret replaces its ciphertext; sending an empty LLM API key clears it for local endpoints that do not require authentication.

Private/shared mailbox authorization remains the content and management boundary. Organization admin status alone does not reveal another user's private mailbox credentials.

## Logs and errors

The application logging handler redacts common password, token, API-key, authorization-header and URL-query forms. Provider error handling should still avoid deliberately including credentials in exception text.

## Backups and restore

Database backups contain encrypted secret blobs but must not contain the active encryption key. Back up the deployment key separately using the infrastructure secret-management process.

A restore is usable only when the matching encryption key (or a key ring containing it) is also restored. Startup validation intentionally fails when restored ciphertext cannot be decrypted.

## Deletion

Deleting a mailbox or LLM provider deletes the corresponding encrypted secret fields with the database row. No plaintext credential is persisted in Redis jobs, audit rows or normal application logs.

OAuth provider-side revocation is best-effort and depends on provider support; local ciphertext deletion does not itself guarantee remote token revocation.
