# MVP Test Log

This branch/PR collects all fixes discovered during the manual MVP acceptance test.

## Rules

- Record every user-visible regression found during MVP testing.
- Fix only what is required for the MVP test to proceed.
- Keep real backend/API behavior; do not add demo or fake state.
- Desktop/Web only. Tablet/mobile remain deferred.
- Re-run the relevant automated checks before merge.

## Findings

### 2026-09-07

- [ ] Fresh installation opens the legacy root landing page instead of the canonical setup/onboarding flow.
- [ ] Legacy root landing page still exists although the Desktop MVP was expected to replace it.
- [ ] Installed root page renders without the expected Mailflow/Figma styling; investigate missing or failed Next.js static/CSS delivery.
- [ ] Verify fresh-instance routing from `/` into the canonical setup flow and then the 6-step user onboarding flow.
- [ ] Remove or retire obsolete Desktop/Web surfaces that should no longer be reachable in the MVP.

