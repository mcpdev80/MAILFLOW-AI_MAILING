"""Provider-neutral MailFlow assistant contracts."""

from app.assistant.runtime import (
    AgentMessage,
    AgentRuntime,
    AgentRuntimeCapabilities,
    AgentRuntimeHealth,
    AgentRuntimeResponse,
)
from app.assistant.tools import (
    AssistantTool,
    AssistantToolRegistry,
    ToolSafety,
    default_tool_registry,
)

__all__ = [
    "AgentMessage",
    "AgentRuntime",
    "AgentRuntimeCapabilities",
    "AgentRuntimeHealth",
    "AgentRuntimeResponse",
    "AssistantTool",
    "AssistantToolRegistry",
    "ToolSafety",
    "default_tool_registry",
]
