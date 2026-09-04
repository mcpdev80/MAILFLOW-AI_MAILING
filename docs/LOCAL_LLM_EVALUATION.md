# Local LLM evaluation

MailFlow includes an optional live evaluation runner for OpenAI-compatible local models. It is separate from `make test` so normal validation never depends on a running LLM.

## Run

```bash
LLM_EVAL_BASE_URL=http://192.168.1.100:4000/v1 \
LLM_EVAL_MODELS=qwen3.5-2b,qwen3.6-sglang,ornith15 \
make test-llm
```

If the endpoint requires authentication:

```bash
LLM_EVAL_API_KEY=... make test-llm
```

## Output

The runner writes two files in the repository root:

- `llm-eval-report.md` for quick human review
- `llm-eval-results.json` for machine-readable comparison/history

Each model is scored against the same deterministic case set and reports:

- pass rate
- mean and median latency
- parse/runtime errors
- category result
- prompt-injection `suspicious_content` result
- action-required result where the case defines one
- confidence and review state

The default minimum score is 80%. Override it when experimenting:

```bash
LLM_EVAL_MINIMUM_SCORE=0.70 make test-llm
```

## Cases

The baseline cases live in `tests/eval/llm_cases.json`. They contain synthetic mail only; no real mailbox data is required.

Keep expected checks focused on stable MailFlow behavior. Avoid asserting subjective model details such as exact wording or exact confidence values.

The live evaluation is intentionally not part of CI. It is used locally when changing prompts, model routing or classification behavior.
