"""MailFlow-owned assistant tool definitions and safety metadata.

Agent runtimes receive these schemas but never decide whether a mutation is
allowed. Authorization and confirmation remain MailFlow responsibilities.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ToolSafety(StrEnum):
    READ = "read"
    PREPARE = "prepare"
    WRITE = "write"
    DESTRUCTIVE = "destructive"


@dataclass(frozen=True)
class AssistantTool:
    name: str
    description: str
    safety: ToolSafety
    parameters: dict[str, object]
    confirmation_required: bool = False

    def __post_init__(self) -> None:
        if self.safety is ToolSafety.DESTRUCTIVE and not self.confirmation_required:
            raise ValueError("destructive assistant tools must require confirmation")
        if self.name == "mail.send" and not self.confirmation_required:
            raise ValueError("mail.send must require explicit confirmation")

    def model_schema(self) -> dict[str, object]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class AssistantToolRegistry:
    def __init__(self, tools: tuple[AssistantTool, ...]) -> None:
        by_name = {tool.name: tool for tool in tools}
        if len(by_name) != len(tools):
            raise ValueError("assistant tool names must be unique")
        self._tools = by_name

    def get(self, name: str) -> AssistantTool:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise KeyError(f"unknown assistant tool: {name}") from exc

    def all(self) -> tuple[AssistantTool, ...]:
        return tuple(self._tools.values())

    def model_schemas(self) -> list[dict[str, object]]:
        return [tool.model_schema() for tool in self._tools.values()]

    def requires_confirmation(self, name: str) -> bool:
        return self.get(name).confirmation_required


_OBJECT = "object"


def _schema(properties: dict[str, object], required: list[str] | None = None) -> dict[str, object]:
    return {
        "type": _OBJECT,
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


def default_tool_registry() -> AssistantToolRegistry:
    """Return the stable first-party MailFlow assistant tool surface."""
    return AssistantToolRegistry(
        (
            AssistantTool(
                name="mail.search",
                description="Search mail the current user is authorized to access.",
                safety=ToolSafety.READ,
                parameters=_schema(
                    {
                        "query": {"type": "string"},
                        "account_id": {"type": "string"},
                        "folder": {"type": "string"},
                        "unread": {"type": "boolean"},
                        "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                    },
                    ["query"],
                ),
            ),
            AssistantTool(
                name="mail.read",
                description="Read one mail by account, folder and UID.",
                safety=ToolSafety.READ,
                parameters=_schema(
                    {
                        "account_id": {"type": "string"},
                        "folder": {"type": "string"},
                        "uid": {"type": "integer", "minimum": 1},
                    },
                    ["account_id", "folder", "uid"],
                ),
            ),
            AssistantTool(
                name="thread.read",
                description="Read an authorized MailFlow thread.",
                safety=ToolSafety.READ,
                parameters=_schema(
                    {
                        "account_id": {"type": "string"},
                        "thread_id": {"type": "string"},
                    },
                    ["account_id", "thread_id"],
                ),
            ),
            AssistantTool(
                name="mail.create_draft",
                description="Prepare a draft for the user to review. This never sends mail.",
                safety=ToolSafety.PREPARE,
                parameters=_schema(
                    {
                        "account_id": {"type": "string"},
                        "to": {"type": "array", "items": {"type": "string"}},
                        "subject": {"type": "string"},
                        "body": {"type": "string"},
                        "in_reply_to_uid": {"type": "integer", "minimum": 1},
                    },
                    ["account_id", "to", "body"],
                ),
            ),
            AssistantTool(
                name="mail.move",
                description="Move one or more authorized mails to another folder.",
                safety=ToolSafety.WRITE,
                confirmation_required=True,
                parameters=_schema(
                    {
                        "messages": {
                            "type": "array",
                            "items": _schema(
                                {
                                    "account_id": {"type": "string"},
                                    "folder": {"type": "string"},
                                    "uid": {"type": "integer", "minimum": 1},
                                },
                                ["account_id", "folder", "uid"],
                            ),
                        },
                        "destination": {"type": "string"},
                    },
                    ["messages", "destination"],
                ),
            ),
            AssistantTool(
                name="mail.trash",
                description="Move one or more authorized mails to trash.",
                safety=ToolSafety.DESTRUCTIVE,
                confirmation_required=True,
                parameters=_schema(
                    {
                        "messages": {
                            "type": "array",
                            "items": _schema(
                                {
                                    "account_id": {"type": "string"},
                                    "folder": {"type": "string"},
                                    "uid": {"type": "integer", "minimum": 1},
                                },
                                ["account_id", "folder", "uid"],
                            ),
                        }
                    },
                    ["messages"],
                ),
            ),
            AssistantTool(
                name="mail.send",
                description="Send a reviewed mail. MailFlow must require explicit user confirmation before execution.",
                safety=ToolSafety.WRITE,
                confirmation_required=True,
                parameters=_schema(
                    {
                        "account_id": {"type": "string"},
                        "to": {"type": "array", "items": {"type": "string"}},
                        "subject": {"type": "string"},
                        "body": {"type": "string"},
                    },
                    ["account_id", "to", "body"],
                ),
            ),
        )
    )
