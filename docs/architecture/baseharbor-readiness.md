# BaseHarbor readiness

MailFlow is an independent application. BaseHarbor is an optional backend runtime that may provision and operate infrastructure for MailFlow through open/native protocols.

MailFlow must never require a BaseHarbor SDK or embed BaseHarbor business logic.

## Ownership boundary

### MailFlow owns

- IMAP/SMTP and provider integrations
- mailbox synchronization and message actions
- classification and routing
- DecisionMemory
- review and historical backfill
- threads and summaries
- notifications and user preferences
- assistant tool semantics and confirmation policy
- MailFlow API, worker and web UI

### BaseHarbor may provide

- PostgreSQL
- Valkey/Redis protocol
- OpenBao/Vault-compatible secrets
- OIDC/OAuth2 identity
- S3-compatible object storage
- certificates/PKI
- backup/restore
- OpenTelemetry/OpenMetrics observability
- OpenAI-compatible AI connectivity
- MCP connectivity

## Stable integration contracts

MailFlow consumes infrastructure through standard configuration and protocols:

| Capability | MailFlow contract |
| --- | --- |
| Database | `DATABASE_URL` / PostgreSQL protocol |
| Cache/queue | `REDIS_URL` / Redis protocol |
| Secrets | local encrypted storage today; optional OpenBao/Vault-compatible adapter |
| Identity | MailFlow auth today; optional OIDC/OAuth2 adapter |
| Object storage | local/provider-specific today; future S3-compatible adapter |
| Telemetry | Sentry today; future OTLP/OpenTelemetry endpoint |
| AI | existing OpenAI-compatible model paths |
| Agent tools | MailFlow-owned neutral tool registry |
| MCP | optional transport/runtime adapter; never a business-logic dependency |

## Deployment modes

### Standalone

MailFlow's existing Compose stack provisions its own dependencies.

### BaseHarbor-backed

`baseharbor.yaml` requests the backend resources BaseHarbor currently supports. MailFlow API/worker/web remain application-owned and consume the resulting native endpoints and credentials.

The intended migration is configuration-only wherever possible:

```text
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
OPENBAO_ADDR=https://...
OIDC_ISSUER=https://...
S3_ENDPOINT=https://...
OTEL_EXPORTER_OTLP_ENDPOINT=https://...
OPENAI_BASE_URL=https://...
MCP_ENDPOINT=https://...
```

Not every optional contract above is implemented by BaseHarbor yet. MailFlow must therefore treat them as optional adapters and retain standalone fallbacks.

## Assistant architecture

The assistant is split into two stable layers:

```text
MailFlow UI
   -> MailFlow Assistant API
      -> AgentRuntime
         -> OpenAI-compatible runtime / MCP runtime / future runtime
      -> MailFlow ToolRegistry
         -> MailFlow services
            -> provider implementations
```

The runtime is replaceable. Tool semantics and authorization stay inside MailFlow.

### Safety classes

- `read`: may execute directly after normal authorization
- `prepare`: may create a preview or draft but must not send
- `write`: mutates mailbox/application state and may require confirmation
- `destructive`: always requires explicit confirmation

Sending mail and destructive/bulk mailbox actions are never authorized solely by the LLM/runtime.

## Migration rule

A BaseHarbor integration change is acceptable only if MailFlow can still run without BaseHarbor and the application can still consume the underlying capability through an open/native protocol.
