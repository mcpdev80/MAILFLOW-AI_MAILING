# BaseHarbor integration

BaseHarbor is the recommended self-host runtime for MailFlow. It provides PostgreSQL, Valkey/Redis, managed secrets and the application backend network. MailFlow remains portable because its containers consume standard environment variables and protocols rather than a BaseHarbor SDK.

## Repository contract

The repository-level `baseharbor.yaml` declares:

- PostgreSQL
- Redis/Valkey
- managed secrets
- required `SECRET_KEY`

The primary application Compose file is `infrastructure/docker-compose.yml`. It contains only MailFlow workloads:

```text
api
worker
web
edge
```

It intentionally does not define PostgreSQL or Redis. BaseHarbor supplies those services and injects the standard runtime contract into the selected application containers.

## Normal operation

Users can operate MailFlow through the familiar wrapper:

```bash
./mailflow install
./mailflow start
./mailflow stop
./mailflow restart
./mailflow status
./mailflow doctor
```

The wrapper delegates the platform lifecycle to `baha`:

```text
./mailflow start    -> baha app apply
./mailflow stop     -> baha app down
./mailflow restart  -> baha app down + baha app up
./mailflow status   -> baha app status
./mailflow doctor   -> baha app doctor
```

Direct BaseHarbor commands remain available from the repository root:

```bash
baha app plan
baha app apply
baha app status
baha app doctor
baha app env --path
baha app secret list
baha app secret set SECRET_KEY --stdin
```

## Runtime independence

MailFlow application code does not call `baha`, require a BaseHarbor login/token or use a BaseHarbor SDK. Runtime containers receive normal values:

```text
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SECRET_KEY=...
```

The Python API and Alembic migrations accept conventional PostgreSQL URLs and select the `asyncpg` SQLAlchemy driver internally.

The `/health` endpoint probes PostgreSQL and Redis directly. Readiness therefore reflects MailFlow's actual runtime dependencies rather than the availability of the `baha` CLI.

## Secrets

`SECRET_KEY` is stored through the BaseHarbor managed-secret path backed by OpenBao. It is not required in the repository Compose file. BaseHarbor materializes it into the MailFlow workload at startup.

Other application-owned provider settings remain application-owned. BaseHarbor does not choose MailFlow's LLM endpoint/model/provider.

## Standalone compatibility

The all-in-one deployment remains available explicitly at:

```text
infrastructure/docker-compose.standalone.yml
```

That compatibility stack contains its own PostgreSQL and Redis services. Existing standalone installations can opt into it with:

```bash
MAILFLOW_RUNTIME=standalone ./mailflow start
```

The standalone stack is deliberately separate from the BaseHarbor-first production Compose file so the two backend ownership models cannot accidentally run at the same time.
