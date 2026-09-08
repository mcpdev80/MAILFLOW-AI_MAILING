"""Replaceable runtime boundary for the MailFlow assistant.

The runtime may be backed by an OpenAI-compatible endpoint, MCP-capable agent,
or another implementation. MailFlow business authorization must never live here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

AgentRole = Literal["system", "user", "assistant", "tool"]


@dataclass(frozen=True)
class AgentMessage:
    role: AgentRole
    content: str
    name: str | None = None


@dataclass(frozen=True)
class AgentRuntimeCapabilities:
    tool_calling: bool = False
    streaming: bool = False
    mcp: bool = False
    structured_output: bool = False


@dataclass(frozen=True)
class AgentRuntimeHealth:
    available: bool
    provider: str
    detail: str | None = None


@dataclass(frozen=True)
class AgentToolCall:
    name: str
    arguments: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentRuntimeResponse:
    content: str
    tool_calls: tuple[AgentToolCall, ...] = ()
    model: str | None = None


class AgentRuntime(Protocol):
    """Minimal runtime contract consumed by MailFlow's assistant service."""

    @property
    def provider(self) -> str: ...

    def capabilities(self) -> AgentRuntimeCapabilities: ...

    async def health(self) -> AgentRuntimeHealth: ...

    async def chat(
        self,
        messages: list[AgentMessage],
        *,
        tools: list[dict[str, object]] | None = None,
    ) -> AgentRuntimeResponse: ...
