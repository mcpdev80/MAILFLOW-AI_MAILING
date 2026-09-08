# BaseHarbor integration

MailFlow can use BaseHarbor as an optional backend provisioner without becoming dependent on BaseHarbor at runtime.

The repository-level `baseharbor.yaml` declares the backend capabilities MailFlow needs: PostgreSQL, Redis/Valkey and the required `SECRET_KEY` secret. From the repository root a BaseHarbor-enabled environment can therefore use:

```bash
baha app plan
baha app secret set SECRET_KEY --stdin
baha app apply
baha app env --path
```

MailFlow itself does not call `baha`, require a BaseHarbor login/token, or use a BaseHarbor SDK. The runtime continues to consume normal interfaces:

```text
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SECRET_KEY=...
```

The Python API accepts a conventional `postgresql://` URL and selects its `asyncpg` SQLAlchemy driver internally. Existing `postgresql+asyncpg://` deployments continue to work unchanged.

The `/health` endpoint probes PostgreSQL and Redis directly. Its readiness therefore reflects MailFlow's actual runtime dependencies rather than the presence or health of BaseHarbor itself.

The same application remains runnable without BaseHarbor by supplying the same environment variables through Docker Compose, a process manager, CI/CD, or another platform.

## Container networking

BaseHarbor-managed services currently expose their generated native runtime contract independently of MailFlow's own Compose topology. Automatic attachment of existing application containers to a BaseHarbor application network is a BaseHarbor-side workload/networking capability and is intentionally not emulated in MailFlow with provider-specific networking code.

This separation keeps the application portable: when BaseHarbor's workload integration attaches the MailFlow API/worker/web containers, those containers still consume only the standard URLs above.
