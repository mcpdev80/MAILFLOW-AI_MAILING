# Deployment bootstrap contract

Mailflow separates infrastructure bootstrap from application onboarding.

Deployment mechanisms such as the CLI installer, Docker Compose, Helm, or an
Operator may provide infrastructure-owned values before the application starts.
The GUI reads those values through `GET /bootstrap/status`, shows them as already
configured, and does not ask the user to configure them again.

## Environment contract

| Variable | Purpose | Example |
| --- | --- | --- |
| `MAILFLOW_DEPLOYMENT_SOURCE` | Identifies who supplied the deployment values | `cli`, `compose`, `helm`, `operator`, `environment` |
| `MAILFLOW_PUBLIC_URL` | Canonical externally reachable URL | `https://mail.example.com` |
| `MAILFLOW_TLS_MODE` | TLS ownership/mode | `automatic`, `custom`, `external`, `none` |
| `MAILFLOW_BOOTSTRAP_LANGUAGE` | Initial UI language | `de`, `en`, `es` |

`TLS_CERT_FILE` and `TLS_KEY_FILE` remain runtime certificate settings. For
backward compatibility the API reports TLS mode `custom` when both are present
and `MAILFLOW_TLS_MODE` is not explicitly set.

## Ownership rules

`MAILFLOW_PUBLIC_URL` and TLS are deployment-managed infrastructure values. The
GUI may display their state and source but must not silently rewrite deployment
configuration.

`MAILFLOW_BOOTSTRAP_LANGUAGE` is only an initial preference. A user's persisted
language choice takes precedence later.

The UI locale precedence is:

1. persisted user preference;
2. previous local browser choice;
3. deployment bootstrap language;
4. browser language;
5. English.

## Deployment integrations

The CLI installer writes `MAILFLOW_DEPLOYMENT_SOURCE=cli` and the selected TLS,
URL, and detected system language into its `.env` file.

Docker Compose defaults `MAILFLOW_DEPLOYMENT_SOURCE` to `compose` and forwards
the bootstrap variables to the API container.

A future Helm chart or Operator should set the same variables with source
`helm` or `operator`. No deployment-specific GUI API is required.

## API shape

`GET /bootstrap/status` returns only non-secret metadata:

```json
{
  "deployment_source": "cli",
  "fields": {
    "public_url": {
      "value": "https://mail.example.com",
      "configured": true,
      "source": "cli",
      "managed": true
    },
    "tls": {
      "value": "custom",
      "configured": true,
      "source": "cli",
      "managed": true
    },
    "language": {
      "value": "de",
      "configured": true,
      "source": "cli",
      "managed": false
    }
  }
}
```

Secrets, private keys, certificate contents, passwords, and API keys must never
be returned by this endpoint.
