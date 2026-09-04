SHELL := /bin/bash

.PHONY: test test-container test-docker format clean-test

TEST_COMPOSE = docker compose -f infrastructure/docker-compose.test.yml
TEST_LOG = .test-output.log
TEST_REPORT = test-report.md

# Run the full local validation suite and always write a shareable Markdown report.
# Container checks and the production API image build are independent; both run
# so a single report can expose either failure without hiding the other.
test:
	@set -o pipefail; \
	status=0; \
	: > $(TEST_LOG); \
	echo "==> Containerized checks" | tee -a $(TEST_LOG); \
	$(TEST_COMPOSE) run --build --rm test 2>&1 | tee -a $(TEST_LOG); \
	container_status=$${PIPESTATUS[0]}; \
	if [ $$container_status -ne 0 ]; then status=$$container_status; fi; \
	echo | tee -a $(TEST_LOG); \
	echo "==> API Docker build" | tee -a $(TEST_LOG); \
	docker build -f infrastructure/docker/Dockerfile.api -t mailflow-api:test . 2>&1 | tee -a $(TEST_LOG); \
	docker_status=$${PIPESTATUS[0]}; \
	if [ $$docker_status -ne 0 ] && [ $$status -eq 0 ]; then status=$$docker_status; fi; \
	$(TEST_COMPOSE) down -v --remove-orphans >/dev/null 2>&1 || true; \
	bash scripts/test-report.sh $(TEST_LOG) $$status $(TEST_REPORT); \
	rm -f $(TEST_LOG); \
	exit $$status

# Python lint/format checks, pytest, Biome and TypeScript typecheck only.
test-container:
	@set -e; \
	trap '$(TEST_COMPOSE) down -v --remove-orphans >/dev/null 2>&1 || true' EXIT; \
	$(TEST_COMPOSE) run --build --rm test

# Match the CI Docker image build check.
test-docker:
	docker build -f infrastructure/docker/Dockerfile.api -t mailflow-api:test .

# Apply Ruff and Biome fixes to the local source tree from a container.
format:
	$(TEST_COMPOSE) run --build --rm --no-deps format

clean-test:
	$(TEST_COMPOSE) down -v --remove-orphans
