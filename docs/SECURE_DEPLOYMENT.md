# Secure MailFlow deployment

MailFlow's production Docker deployment uses a single HTTPS edge and keeps application/data services off host ports by default.

## Security boundary

```text
Internet / LAN
    |
    | HTTPS :443 (HTTP :80 only for redirect/ACME)
    v
  Caddy edge
    |
    +--> web:3000 (Docker backend network)
    |
    +--> api:8000 only for the OAuth callback and Stripe webhook paths

web --> api:8000 through the same-origin BFF (/api/mf)
web --> PostgreSQL (Better Auth only)
api/worker --> PostgreSQL + Redis
PostgreSQL/Redis --> internal Docker networks only
```

The production compose file does **not** publish ports 3000, 8000, 5432 or 6379. The development compose file remains the explicit local-debug exception.

## Required production settings

Use one canonical public URL:

```env
MAILFLOW_PUBLIC_URL=https://mail.example.com
ENVIRONMENT=production
CORS_ORIGINS=
API_DOCS_ENABLED=false
```

For authenticated multi-user deployments, align the public auth/passkey URLs with the same host:

```env
BETTER_AUTH_URL=https://mail.example.com
PASSKEY_ORIGIN=https://mail.example.com
PASSKEY_RP_ID=mail.example.com
OAUTH_REDIRECT_BASE=https://mail.example.com
OAUTH_SUCCESS_REDIRECT=https://mail.example.com/app/dashboard
BILLING_SUCCESS_URL=https://mail.example.com/app/billing?status=success
BILLING_CANCEL_URL=https://mail.example.com/app/billing?status=cancel
```

Use strong random values for `SECRET_KEY`, `BETTER_AUTH_SECRET`, `WEB_SECRET_KEY`, `INTERNAL_API_SECRET`, the database password and (for single-tenant API-key mode) `SINGLE_TENANT_API_KEY`.

## Mode A: automatic Let's Encrypt

For a public DNS name pointing to the MailFlow host, Caddy obtains and renews the certificate automatically.

```env
MAILFLOW_PUBLIC_URL=https://mail.example.com
```

Start the production stack:

```bash
docker compose -f infrastructure/docker-compose.yml up -d --build
```

Only ports 80 and 443 are published by the stack. Port 80 is used for HTTP-to-HTTPS redirect and ACME HTTP validation where applicable.

For a private/local `https://localhost` deployment, Caddy may use its local CA; clients must trust that CA. For normal internet-facing operation, use a real DNS hostname.

## Mode B: own certificate / wildcard certificate

Provide PEM files for the certificate chain and private key. A wildcard certificate is supported as long as it covers the hostname in `MAILFLOW_PUBLIC_URL`.

```env
MAILFLOW_PUBLIC_URL=https://mail.example.com
TLS_CERT_FILE=/srv/mailflow/certs/fullchain.pem
TLS_KEY_FILE=/srv/mailflow/certs/privkey.pem
```

Start with the custom-TLS override:

```bash
docker compose \
  -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.custom-tls.yml \
  up -d --build
```

The certificate and private key are mounted read-only into the edge container. Do not copy private keys into an image or commit them to Git.

## Optional enterprise/custom CA trust

If outbound services use an internal PKI (for example an internal LLM endpoint), mount a PEM CA bundle:

```env
MAILFLOW_CA_BUNDLE=/srv/mailflow/ca/company-ca-bundle.pem
```

Start with the CA override (and combine it with the custom-TLS override if needed):

```bash
docker compose \
  -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.custom-ca.yml \
  up -d --build
```

The override wires the bundle into Python TLS verification (`SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE`) and Node (`NODE_EXTRA_CA_CERTS`). TLS verification remains enabled; there is no production `verify=false` mode.

If the Python bundle replaces the platform CA file, provide a complete trust bundle containing every root CA that the deployment must trust (public and private as applicable).

## Public API surface

The edge sends normal requests to the Next.js web service. The browser reaches MailFlow API operations through the same-origin BFF at `/api/mf/*`.

Two provider-initiated API paths are intentionally routed directly to the internal API:

- `/oauth/gmail/callback` and `/oauth/microsoft/callback`
- `/billing/webhook`

The BFF itself only allows an explicit prefix allowlist. Internal API routes, metrics and API documentation are not part of the public edge surface.

## CORS

For the normal production architecture, leave `CORS_ORIGINS` empty because browser traffic is same-origin through the BFF.

If a separate trusted frontend must call the Python API, list exact HTTPS origins separated by commas. Production startup rejects wildcard origins and non-HTTPS remote origins.

## Security headers

The Caddy edge applies:

- HSTS (`Strict-Transport-Security`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy`
- CSP with same-origin defaults and no framing/object embedding
- removal of the `Server` response header

Better Auth production cookies are explicitly configured as `Secure` and `HttpOnly`, with `SameSite=Lax` for the same-origin deployment model.

## Development

Use `infrastructure/docker-compose.dev.yml` when direct localhost ports are intentionally needed for debugging/testing. Do not treat the development compose file as the production security boundary.

## Verification checklist

After deployment:

```bash
# Only expected edge ports should be public from production compose.
docker compose -f infrastructure/docker-compose.yml ps

# Verify HTTPS and headers.
curl -I https://mail.example.com/

# These must not be host-reachable unless explicitly exposed outside production compose.
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:5432/
curl http://127.0.0.1:6379/
```

Also verify OAuth callback URLs registered with Google/Microsoft exactly match `OAUTH_REDIRECT_BASE` and that the Stripe webhook points to `https://<host>/billing/webhook`.
