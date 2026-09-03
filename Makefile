.PHONY: test test-container test-docker format clean-test

TEST_COMPOSE = docker compose -f infrastructure/docker-compose.test.yml

# Run the local validation suite in an isolated test container.
# PostgreSQL is started as a disposable sidecar and removed afterwards.
test: test-container test-docker

# Python lint/format checks, pytest, Biome and TypeScript typecheck.
test-container:
	@set -e; \
	trap '$(TEST_COMPOSE) down -v --remove-orphans >/dev/null 2>&1 || true' EXIT; \
	$(TEST_COMPOSE) run --build --rm test

# Match the CI Docker image build check.
test-docker:
	docker build -f infrastructure/docker/Dockerfile.api -t mailflow-api:test .

# Apply Ruff and Biome formatting in the same container used by make test.
format:
	@set -e; \
	trap '$(TEST_COMPOSE) down -v --remove-orphans >/dev/null 2>&1 || true' EXIT; \
	$(TEST_COMPOSE) run --build --rm test bash scripts/format.sh

clean-test:
	$(TEST_COMPOSE) down -v --remove-orphans
