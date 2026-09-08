import pytest

from app.assistant.tools import (
    AssistantTool,
    ToolSafety,
    default_tool_registry,
)


def test_destructive_tools_require_confirmation():
    with pytest.raises(ValueError, match="destructive assistant tools must require confirmation"):
        AssistantTool(
            name="mail.delete_forever",
            description="delete",
            safety=ToolSafety.DESTRUCTIVE,
            parameters={"type": "object", "properties": {}},
        )


def test_send_always_requires_explicit_confirmation():
    with pytest.raises(ValueError, match="mail.send must require explicit confirmation"):
        AssistantTool(
            name="mail.send",
            description="send",
            safety=ToolSafety.WRITE,
            parameters={"type": "object", "properties": {}},
        )


def test_default_registry_keeps_read_and_mutation_policy_separate():
    registry = default_tool_registry()

    assert registry.get("mail.search").safety is ToolSafety.READ
    assert registry.requires_confirmation("mail.search") is False
    assert registry.get("mail.create_draft").safety is ToolSafety.PREPARE
    assert registry.requires_confirmation("mail.create_draft") is False
    assert registry.requires_confirmation("mail.move") is True
    assert registry.get("mail.trash").safety is ToolSafety.DESTRUCTIVE
    assert registry.requires_confirmation("mail.trash") is True
    assert registry.requires_confirmation("mail.send") is True


def test_runtime_receives_only_tool_schema_not_authorization_decision():
    schema = default_tool_registry().get("mail.send").model_schema()

    assert schema["type"] == "function"
    assert schema["function"]["name"] == "mail.send"
    assert "confirmation_required" not in schema["function"]
