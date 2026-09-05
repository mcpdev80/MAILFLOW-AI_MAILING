"""Schemas for user-controlled AI writing assistance."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

WritingAction = Literal[
    "draft_reply",
    "draft_from_points",
    "improve",
    "shorten",
    "expand",
    "friendlier",
    "professional",
    "direct",
    "formal",
    "informal",
    "proofread",
    "translate",
    "same_language",
    "custom",
]
WritingScope = Literal["full", "selection"]


class WritingRequest(BaseModel):
    action: WritingAction
    scope: WritingScope = "full"
    selected_text: str | None = Field(default=None, max_length=20_000)
    instruction: str | None = Field(default=None, max_length=2_000)
    target_language: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_action_inputs(self) -> "WritingRequest":
        if self.scope == "selection" and not (self.selected_text or "").strip():
            raise ValueError("selected_text is required for selection scope")
        if self.action == "translate" and not (self.target_language or "").strip():
            raise ValueError("target_language is required for translate")
        if self.action == "custom" and not (self.instruction or "").strip():
            raise ValueError("instruction is required for custom")
        return self


class WritingPreview(BaseModel):
    action: WritingAction
    scope: WritingScope
    text: str
    used_thread_context: bool = False
    used_current_message: bool = False
