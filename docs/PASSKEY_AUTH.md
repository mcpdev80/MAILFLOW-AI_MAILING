# Passkey authentication

MailFlow uses the Better Auth passkey plugin for WebAuthn/FIDO2 authentication in multi-user deployments (`WEB_AUTH=on`). Passkeys are an additional sign-in method for the existing Better Auth user. They do not create a second identity and do not replace mailbox OAuth tokens, IMAP passwords, organization API keys, or LLM credentials.

## Deployment requirements

Production passkeys require a secure browser context. Use HTTPS for the public web origin. `http://localhost` remains valid for local development.

The passkey relying-party identity is derived from `BETTER_AUTH_URL` unless overridden:

```text
PASSKEY_RP_NAME=MailFlow
PASSKEY_RP_ID=mail.example.com
PASSKEY_ORIGIN=https://mail.example.com
```

`PASSKEY_RP_ID` is a hostname, not a URL. The configured origin must be the RP-ID host or a subdomain of it.

Choose the public hostname before enrolling users. Browsers bind WebAuthn credentials to the RP-ID. Moving an installation to an unrelated hostname can make previously enrolled passkeys unusable and require recovery through another valid sign-in method.

## Database migration

After enabling the passkey plugin, apply the Better Auth schema migration:

```bash
pnpm --filter @mailflow/web auth:migrate
```

For installations bootstrapped through raw SQL, `apps/web/better-auth-schema.sql` also contains the `passkey` and `auth_security_event` tables.

The passkey table contains only public authenticator metadata such as credential ID, public key, counter, device type, backup state, transports, display name, and creation time. Private keys never leave the user's authenticator.

## Enrollment and sign-in

An authenticated user can register multiple passkeys under **Security**. Better Auth requires a fresh authenticated session for registration, and MailFlow requires WebAuthn user verification. Platform authenticators and cross-platform security keys are supported.

The login page offers passkey sign-in first while retaining email/password as a migration and recovery fallback. Conditional WebAuthn UI is requested when supported by the browser.

Adding a passkey does not automatically delete the user's password. For recovery, keep at least two independent authentication methods where practical, for example a second passkey and the verified email/password fallback.

MailFlow does not implement administrator impersonation or administrator access to private passkey credentials.

## Sensitive operations and recent authentication

A session is considered recent for ten minutes after authentication. Passkey sign-in and email/password sign-in both create a fresh session.

Recent authentication is required for:

- removing passkeys;
- changing shared-mailbox access grants;
- changing mailbox ownership or private/shared mode;
- deleting a mailbox.

The Next.js BFF signs the Better Auth session creation time together with the existing actor identity. FastAPI verifies that signature before using the timestamp for step-up authorization, so a browser cannot forge a fresh-auth state.

## Security audit

MailFlow stores compact authentication-method events for passkey enrollment and removal. Routine successful logins, WebAuthn challenges, credential payloads, private keys, mailbox content, and authentication secrets are not written to the security audit table.

## Recovery considerations

Before changing a production RP-ID or public hostname, confirm that users retain another verified recovery method. A hostname migration should be treated as an authentication migration rather than a transparent infrastructure change.
