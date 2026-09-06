# End-to-end testing with Playwright

Mailflow uses Playwright for deterministic browser-level testing of the web UI.

## Commands

From the repository root:

```bash
pnpm test:e2e
```

From `apps/web`:

```bash
pnpm test:e2e:setup
pnpm test:e2e
pnpm test:e2e:headed
pnpm test:e2e:ui
```

`test:e2e:setup` installs the pinned Chromium runtime once for local development. The test scripts install the small isolated runner package under `apps/web/e2e/node_modules` when needed.

Playwright is intentionally isolated in `apps/web/e2e/package.json` with the exact `@playwright/test` version `1.63.0`. It is not part of the application dependency graph and does not alter the production pnpm lockfile. CI installs that isolated package and the matching Chromium runtime before executing the suite.

## What belongs in E2E tests

Use Playwright for user-visible behavior across routing, state, forms and API boundaries. Current coverage includes:

- Login and signup surfaces.
- Application shell and system status.
- Dashboard and cross-mailbox search.
- Mail workspace and thread opening.
- Composer persistence and explicit send flow.
- Review Inbox.
- Appearance/workspace preferences.
- Drafts, notifications and daily summary.
- Billing and model-role settings.
- Workspace editor and onboarding.
- Mailbox index-to-detail navigation.
- Mobile-width smoke coverage.

Extend the suite whenever a new Figma-backed production surface or interaction is implemented.

## Selector policy

Tests should follow this order:

1. Accessible roles and names (`getByRole`).
2. Labels (`getByLabel`).
3. Stable user-visible text when the text itself is part of the contract.
4. `data-testid` only for structural landmarks, async state containers or controls without a stable accessible identity.

Do not couple tests to generated CSS class names, DOM depth or visual coordinates.

Shared structural test IDs currently include:

- `app-shell`
- `app-sidebar`
- `app-header`
- `app-content`
- `system-status`

## Fixtures and fake data

Production UI must never ship demo mail, users, folders or KPI values. Deterministic fixture data is allowed only inside `apps/web/e2e/`.

The E2E API fixtures intercept the same `/api/mf/*` contracts used by production code. Tests therefore exercise the real frontend controllers and state transitions without requiring external IMAP, SMTP, LLM or OAuth services.

When an API contract changes, update both the typed frontend contract and the Playwright fixture in the same change.

## Real-stack tests

The deterministic mocked-contract suite is the default CI layer. A smaller real-stack suite may be added separately for integration environments where Postgres, Better Auth and the FastAPI service are available. Do not make core browser tests depend on third-party OAuth, live mailboxes or live LLMs.

## Failure artifacts

Playwright keeps the following on failures:

- Trace
- Screenshot
- Video
- HTML report in CI

These directories are ignored by Git.
