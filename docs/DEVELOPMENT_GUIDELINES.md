# Development Guidelines

These guidelines define the development style for MailFlow going forward. The goal is to extend the existing project without turning it into a second codebase with different conventions.

The main priorities are:

- human maintainability
- explicit and understandable code
- incremental changes
- clear responsibility boundaries
- testability
- minimal unnecessary abstraction

## 1. Respect the existing project structure

Keep the current separation of responsibilities unless there is a strong reason to change it.

```text
packages/core/
    domain logic
    parsers
    classification
    provider abstractions
    resilience

apps/api/
    HTTP/API
    ORM models
    repositories
    services
    authentication
    configuration

apps/worker/
    background job execution

apps/web/
    Next.js UI
```

Domain logic should stay independent from FastAPI, SQLAlchemy and frontend concerns where practical.

Do not move existing modules only to make the structure look cleaner.

## 2. Prefer simple domain objects

Use small, explicit dataclasses, enums and typed structures for state that has a stable meaning.

Examples:

```text
ClassificationResult
RoutingResult
ThreadContext
DecisionMemoryMatch
ReviewItem
CycleStats
```

Avoid passing large untyped dictionaries through multiple layers when a stable structure exists.

Prefer:

```python
@dataclass
class CycleStats:
    emails_processed: int = 0
    drafts_saved: int = 0
    errors: int = 0
    last_error: str | None = None
```

over:

```python
stats: dict
```

Do not introduce abstract base classes, factories or strategy layers unless they solve a real current problem.

## 3. Keep domain logic separate from persistence

Database access belongs in repositories or clearly defined persistence helpers.

Services should not accumulate arbitrary SQL queries throughout business logic.

Preferred pattern:

```text
Service
  -> Repository
      -> SQLAlchemy
```

Repositories may translate ORM models into core/domain dataclasses when useful.

Do not create one repository per database table automatically. Create a repository when it represents a useful persistence boundary.

## 4. Services orchestrate

Services should coordinate work rather than contain every detail themselves.

A service may:

- load configuration
- call domain logic
- invoke providers
- apply policies
- persist results
- coordinate retries and state transitions

A service should not become the permanent home for unrelated logic just because it already exists.

When a service begins to own several distinct responsibilities, extract the new responsibility into a focused module or service.

Do not split code prematurely. Extraction should follow real responsibility boundaries.

## 5. Prefer explicit code over clever abstractions

MailFlow should remain easy to follow in a debugger and during code review.

Prefer visible processing stages such as:

```text
DecisionMemory lookup
Stage 0 classification
Stage 1 classification
Stage 2 classification
Stage 3 classification
Attachment escalation
Routing
Mailbox action
Persistence
```

over generic workflow engines or configuration-driven execution frameworks.

A small amount of duplication is acceptable when it keeps control flow obvious.

## 6. Use English for new code

New development should use English consistently for:

- class names
- function names
- variable names
- type names
- comments
- docstrings
- commit messages
- technical documentation

User-facing text belongs in the localization system and may be available in multiple languages.

Existing Spanish comments/docstrings do not need to be rewritten only for consistency. If a file is substantially changed, touched documentation may be converted to English as part of that change.

Avoid large language-only cleanup commits.

## 7. Comments explain why

Comments should document non-obvious intent, invariants and operational constraints.

Good examples:

```python
# Mark the message before moving it because the UID is no longer valid
# in the source folder after the move.
```

```python
# Backfill yields capacity here so live mail processing remains responsive.
```

Avoid comments that simply restate the code:

```python
# Increment counter
counter += 1
```

Important invariants should be documented close to the code that depends on them.

## 8. Avoid monster modules

A file should have one clearly explainable primary responsibility.

Do not enforce an arbitrary maximum line count. File size alone is not a design rule.

A longer cohesive module can be easier to maintain than ten tiny files.

However, modules such as the mail processing cycle must not become containers for every new feature.

When adding functionality, ask whether it belongs to the current responsibility or deserves a separate module.

## 9. Avoid micro-modules

Do not create a separate file for every small function or classification stage.

Avoid structures such as:

```text
classification/
    stage0.py
    stage1.py
    stage2.py
    stage3.py
    threshold.py
    confidence.py
    stage_result.py
```

Prefer cohesive modules such as:

```text
classification/
    adaptive.py
    llm_client.py
    rule_engine.py
    decision_memory.py
    thread_context.py
```

Split further only when the responsibility becomes large enough to justify it.

## 10. Do not silently swallow failures

Operational failures and uncertain model decisions are different states.

Avoid broad exception handling such as:

```python
try:
    ...
except Exception:
    pass
```

when the caller needs to distinguish what happened.

Use explicit exceptions or typed results where appropriate, for example:

```text
ModelUnavailable
ModelTimeout
InvalidModelResponse
ProviderUnavailable
ClassificationUncertain
```

Transient failures may be retried according to policy, but they must remain observable through logs/metrics and final state.

## 11. Keep typing strong

Use Python and TypeScript type information consistently.

Prefer:

```python
str | None
list[EmailData]
tuple[EmailAccount, AccountConfig, LLMProvider | None]
```

over untyped containers where the structure is known.

Stable dictionaries should normally become dataclasses, TypedDicts, Pydantic models or equivalent typed structures depending on the layer.

Types should help refactoring rather than merely satisfy a checker.

## 12. Keep configuration centralized and typed

Do not scatter magic values across services.

Values such as these should have an explicit configuration owner:

```text
classification confidence thresholds
stage context limits
fast/deep model selection
backfill batch size
inference concurrency
retention periods
action policy thresholds
```

Prefer focused configuration groups such as:

```text
ClassificationConfig
InferenceConfig
BackfillConfig
RetentionConfig
ActionPolicy
```

Do not create one oversized global configuration object containing unrelated application state.

## 13. Preserve incremental compatibility

Prefer small migrations from current behavior to new behavior.

Do not rewrite a working subsystem only because a cleaner theoretical design is possible.

When implementing a feature:

1. identify the existing execution path
2. make the smallest structural change needed
3. keep existing behavior compatible where possible
4. add tests for the new behavior
5. remove legacy paths only when their replacement is proven

Refactoring unrelated modules in the same change should be avoided.

## 14. Keep security boundaries server-side

Authorization and security decisions must not rely on UI visibility alone.

Examples include:

- organization isolation
- private/shared mailbox ownership
- credentials
- review items
- audit visibility
- DecisionMemory
- background jobs
- search and dashboard aggregates

Knowing a resource ID must never be sufficient to bypass authorization.

Security-sensitive ownership or access transitions should fail closed.

## 15. Background jobs carry IDs, not secrets

Redis/job payloads should contain stable resource identifiers and job parameters, not plaintext credentials or large duplicated state.

Workers should load authoritative configuration and secrets server-side when needed.

Persistent job state belongs in PostgreSQL when it must survive restart or restore.

Redis should remain operational queue state, not the sole source of truth.

## 16. Keep audit and operational logging separate

Audit records should represent meaningful state changes, user decisions and final exceptional events.

Operational logs/metrics may contain implementation detail such as retries, queue state or timing.

Do not create audit rows for every processing stage or successful model call.

Do not store full email bodies, prompts, attachment contents or secrets in audit records.

## 17. Frontend code should remain straightforward

Prefer normal React/Next.js patterns before adding new state-management or UI frameworks.

Create reusable components when a UI concept appears repeatedly, for example:

```text
StatCard
MailboxHealthRow
ReviewBadge
ClassificationBadge
JobProgress
EmptyState
```

Do not create a component abstraction for every small fragment.

Data authorization must remain enforced by the backend even when the frontend filters views correctly.

## 18. Avoid unnecessary dependencies

Before adding a new library, check whether the existing stack or standard library already solves the problem well enough.

A dependency is justified when it provides meaningful correctness, security, compatibility or maintenance value.

Avoid dependencies only to reduce a small amount of obvious code.

## 19. Tests follow responsibility boundaries

New architecture components should be independently testable where practical.

Tests should focus on behavior and important invariants, including:

- successful paths
- failure paths
- retries/degraded behavior
- authorization boundaries
- idempotency
- restart/resume behavior
- private/shared mailbox isolation

Do not test implementation details that prevent reasonable refactoring.

Integration tests should cover boundaries where bugs are most likely, such as API -> service -> repository or worker -> provider -> persistence.

## 20. Human readability wins

When choosing between two technically valid designs, prefer the one that a developer unfamiliar with the feature can understand faster.

A contributor should be able to answer these questions without reverse engineering the entire repository:

- Where does this feature live?
- What owns this state?
- Where is it persisted?
- What happens when it fails?
- What authorizes access to it?
- What happens after a restart?

If those answers are difficult to find, the design is probably too indirect.

## Practical review checklist

Before merging a change, verify:

- Does the change follow the existing repository structure?
- Is domain logic kept independent where practical?
- Are database operations in an appropriate persistence boundary?
- Is the control flow explicit and understandable?
- Did we avoid unnecessary abstractions and dependencies?
- Are stable data structures typed?
- Are configuration values owned by a clear config object/policy?
- Are errors observable instead of silently swallowed?
- Are security and ownership checks enforced server-side?
- Are secrets absent from logs, queues and API responses?
- Are comments focused on intent and invariants?
- Is the feature independently testable?
- Did we avoid unrelated refactoring?
- Could another developer maintain this code six months from now?

## Guiding rule

Do not optimize MailFlow for architectural novelty.

Optimize it for correctness, security, understandable control flow and long-term human maintenance.
