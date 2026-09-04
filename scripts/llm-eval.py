#!/usr/bin/env python3
"""Run reproducible MailFlow classification evaluations against a live OpenAI-compatible LLM."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from mailflow_core.classification.llm_client import LLMClient, LLMConfig, ModelRole
from mailflow_core.types import ParsedEmail

DEFAULT_CASES = Path("tests/eval/llm_cases.json")
DEFAULT_JSON = Path("llm-eval-results.json")
DEFAULT_MARKDOWN = Path("llm-eval-report.md")


@dataclass(frozen=True)
class CaseResult:
    model: str
    case_id: str
    passed: bool
    latency_ms: int
    category: str | None
    expected_category: str
    suspicious_content: bool | None
    expected_suspicious_content: bool
    action_required: str | None
    expected_action_required: str | None
    confidence: float | None
    review_required: bool | None
    raw_response: str | None = None
    error: str | None = None


class EvaluationLLMClient(LLMClient):
    """LLMClient variant that exposes the last raw classification response for diagnostics."""

    def __init__(self, config: LLMConfig) -> None:
        super().__init__(config)
        self.last_raw_response: str | None = None

    def _call_classification(
        self,
        messages: list[dict],
        primary_role: ModelRole,
    ) -> tuple[str, str, ModelRole]:
        raw, model_used, role = super()._call_classification(messages, primary_role)
        self.last_raw_response = raw
        return raw, model_used, role


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default=os.getenv("LLM_EVAL_BASE_URL", "http://127.0.0.1:4000/v1"),
    )
    parser.add_argument(
        "--models",
        default=os.getenv("LLM_EVAL_MODELS", "qwen3.5-2b,qwen3.6-sglang,ornith15"),
        help="Comma-separated model IDs exposed by the OpenAI-compatible endpoint",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("LLM_EVAL_API_KEY", "local-eval"),
        help="API key passed to the OpenAI-compatible endpoint; defaults to a local dummy key",
    )
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument(
        "--minimum-score",
        type=float,
        default=float(os.getenv("LLM_EVAL_MINIMUM_SCORE", "0.80")),
    )
    return parser.parse_args()


def _load_cases(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise ValueError("evaluation case file must contain a non-empty JSON array")
    return data


def _email(case: dict) -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized=str(case["subject"]),
        body_text=str(case.get("body", "")),
        body_html="",
        signature="",
        from_email=str(case.get("from_email", "sender@example.com")),
        from_domain=str(case.get("from_domain", "example.com")),
        to_emails=["me@example.com"],
        reply_to=case.get("reply_to"),
        list_id=case.get("list_id"),
        precedence=case.get("precedence"),
    )


def _litellm_model(model: str) -> str:
    """Route arbitrary gateway model IDs through LiteLLM's OpenAI-compatible provider."""
    if "/" in model:
        return model
    return f"openai/{model}"


def _evaluate_one(client: EvaluationLLMClient, model: str, case: dict) -> CaseResult:
    started = time.monotonic()
    expected_category = str(case["expected_category"])
    expected_suspicious = bool(case.get("expected_suspicious_content", False))
    expected_action = case.get("expected_action_required")
    client.last_raw_response = None
    try:
        result = client.classify(
            _email(case),
            classification_stage=int(case.get("stage", 1)),
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        passed = (
            result.category == expected_category
            and result.suspicious_content == expected_suspicious
            and (expected_action is None or result.action_required == expected_action)
        )
        return CaseResult(
            model=model,
            case_id=str(case["id"]),
            passed=passed,
            latency_ms=latency_ms,
            category=result.category,
            expected_category=expected_category,
            suspicious_content=result.suspicious_content,
            expected_suspicious_content=expected_suspicious,
            action_required=result.action_required,
            expected_action_required=expected_action,
            confidence=result.confidence,
            review_required=result.review_required,
            raw_response=client.last_raw_response,
        )
    except Exception as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        return CaseResult(
            model=model,
            case_id=str(case["id"]),
            passed=False,
            latency_ms=latency_ms,
            category=None,
            expected_category=expected_category,
            suspicious_content=None,
            expected_suspicious_content=expected_suspicious,
            action_required=None,
            expected_action_required=expected_action,
            confidence=None,
            review_required=None,
            raw_response=client.last_raw_response,
            error=f"{type(exc).__name__}: {exc}",
        )


def _ratio(matches: int, total: int) -> float | None:
    if total == 0:
        return None
    return matches / total


def _summary(results: list[CaseResult]) -> dict[str, dict]:
    grouped: dict[str, list[CaseResult]] = {}
    for result in results:
        grouped.setdefault(result.model, []).append(result)
    summary: dict[str, dict] = {}
    for model, model_results in grouped.items():
        latencies = [item.latency_ms for item in model_results]
        passed = sum(item.passed for item in model_results)
        parsed = [item for item in model_results if item.error is None]
        action_cases = [item for item in parsed if item.expected_action_required is not None]
        summary[model] = {
            "passed": passed,
            "total": len(model_results),
            "score": passed / len(model_results),
            "category_accuracy": _ratio(
                sum(item.category == item.expected_category for item in parsed),
                len(model_results),
            ),
            "suspicious_accuracy": _ratio(
                sum(item.suspicious_content == item.expected_suspicious_content for item in parsed),
                len(model_results),
            ),
            "action_accuracy": _ratio(
                sum(item.action_required == item.expected_action_required for item in action_cases),
                len(action_cases),
            ),
            "parse_validity": _ratio(len(parsed), len(model_results)),
            "mean_latency_ms": round(statistics.mean(latencies), 1),
            "median_latency_ms": round(statistics.median(latencies), 1),
            "errors": sum(item.error is not None for item in model_results),
        }
    return summary


def _format_ratio(value: float | None) -> str:
    return "-" if value is None else f"{value:.1%}"


def _write_markdown(
    path: Path,
    *,
    base_url: str,
    summary: dict[str, dict],
    results: list[CaseResult],
) -> None:
    lines = [
        "# MailFlow local LLM evaluation",
        "",
        f"Endpoint: `{base_url}`",
        "",
        "## Summary",
        "",
        "| Model | Exact | Category | Suspicious | Action | Parse | Mean latency | Median latency | Errors |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for model, item in summary.items():
        lines.append(
            f"| `{model}` | {item['score']:.1%} | "
            f"{_format_ratio(item['category_accuracy'])} | "
            f"{_format_ratio(item['suspicious_accuracy'])} | "
            f"{_format_ratio(item['action_accuracy'])} | "
            f"{_format_ratio(item['parse_validity'])} | "
            f"{item['mean_latency_ms']:.0f} ms | {item['median_latency_ms']:.0f} ms | "
            f"{item['errors']} |"
        )
    lines.extend(
        [
            "",
            "Exact requires category, suspicious-content handling and action-required expectations "
            "for the case to match. Category and suspicious accuracy count parse errors as misses; "
            "action accuracy uses only cases with an explicit action expectation.",
            "",
            "## Cases",
            "",
            "| Model | Case | Result | Category | Suspicious | Action | Confidence | Latency |",
            "| --- | --- | --- | --- | --- | --- | ---: | ---: |",
        ]
    )
    for item in results:
        status = "PASS" if item.passed else "FAIL"
        confidence = "-" if item.confidence is None else f"{item.confidence:.2f}"
        category = item.category or item.error or "-"
        lines.append(
            f"| `{item.model}` | `{item.case_id}` | {status} | {category} | "
            f"{item.suspicious_content} | {item.action_required or '-'} | {confidence} | "
            f"{item.latency_ms} ms |"
        )

    failed_with_raw = [item for item in results if not item.passed and item.raw_response]
    if failed_with_raw:
        lines.extend(["", "## Raw responses for failed cases", ""])
        for item in failed_with_raw:
            lines.append(f"### {item.model} / {item.case_id}")
            lines.append("")
            if item.error:
                lines.append(f"Error: `{item.error}`")
                lines.append("")
            lines.append("```text")
            lines.append(item.raw_response or "")
            lines.append("```")
            lines.append("")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = _parse_args()
    cases = _load_cases(args.cases)
    models = [item.strip() for item in args.models.split(",") if item.strip()]
    if not models:
        raise ValueError("at least one model must be configured")

    all_results: list[CaseResult] = []
    for model in models:
        print(f"==> Evaluating {model}")
        client = EvaluationLLMClient(
            LLMConfig(
                model_id=_litellm_model(model),
                api_base=args.base_url,
                api_key=args.api_key,
                timeout=60.0,
                max_retries=0,
            )
        )
        for case in cases:
            result = _evaluate_one(client, model, case)
            all_results.append(result)
            print(
                f"  {result.case_id}: {'PASS' if result.passed else 'FAIL'} "
                f"({result.latency_ms} ms)"
            )

    summary = _summary(all_results)
    args.json.write_text(
        json.dumps(
            {
                "base_url": args.base_url,
                "summary": summary,
                "results": [asdict(item) for item in all_results],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    _write_markdown(
        args.markdown,
        base_url=args.base_url,
        summary=summary,
        results=all_results,
    )

    failed_models = [model for model, item in summary.items() if item["score"] < args.minimum_score]
    print(f"\nWrote {args.markdown} and {args.json}")
    if failed_models:
        print(
            f"Models below minimum score {args.minimum_score:.0%}: {', '.join(failed_models)}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
