"""Structured logging, correlation context, and credential redaction."""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from typing import Any

from app.config import settings
from app.secrets import redact_text, redact_value

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
log_context_ctx: ContextVar[dict[str, Any]] = ContextVar("log_context", default={})

_RESERVED = set(logging.makeLogRecord({}).__dict__.keys()) | {
    "message",
    "asctime",
    "taskName",
}


def bind_log_context(**fields: Any) -> None:
    merged = {
        **log_context_ctx.get(),
        **{k: v for k, v in fields.items() if v is not None},
    }
    log_context_ctx.set(merged)


def clear_log_context() -> None:
    log_context_ctx.set({})


class SecretRedactionFilter(logging.Filter):
    """Sanitize messages, arguments and structured extras before formatting."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = redact_value(record.args)
            else:
                record.args = tuple(redact_value(value) for value in record.args)
        for key, value in list(record.__dict__.items()):
            if key not in _RESERVED and not key.startswith("_"):
                record.__dict__[key] = redact_value(value, key=key)
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
        }
        request_id = request_id_ctx.get()
        if request_id:
            payload["request_id"] = request_id
        payload.update(redact_value(log_context_ctx.get()))

        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = redact_value(value, key=key)

        if record.exc_info:
            payload["exc_info"] = redact_text(self.formatException(record.exc_info))
        if record.stack_info:
            payload["stack_info"] = redact_text(self.formatStack(record.stack_info))

        return json.dumps(payload, default=str, ensure_ascii=False)


class ContextTextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = redact_text(super().format(record))
        bits = []
        request_id = request_id_ctx.get()
        if request_id:
            bits.append(f"request_id={request_id}")
        for key, value in redact_value(log_context_ctx.get()).items():
            bits.append(f"{key}={value}")
        return f"{base} [{' '.join(bits)}]" if bits else base


def setup_logging() -> None:
    formatter: logging.Formatter
    if settings.LOG_FORMAT.lower() == "json":
        formatter = JsonFormatter()
    else:
        formatter = ContextTextFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"
        )

    handler = logging.StreamHandler()
    handler.addFilter(SecretRedactionFilter())
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.LOG_LEVEL.upper())
