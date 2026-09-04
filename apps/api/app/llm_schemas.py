"""HTTP DTOs for organization-scoped LLM model role configuration."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LLMProviderCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=50)
    base_url: str = Field(min_length=1, max_length=500)
    api_key: str | None = Field(default=None, repr=False)

    # Legacy compatibility inputs. New clients may omit them when the explicit
    # role model is present; the router stores derived compatibility values.
    default_classification_model: str | None = Field(default=None, max_length=200)
    default_generation_model: str | None = Field(default=None, max_length=200)

    fast_classification_model: str | None = Field(default=None, max_length=200)
    deep_classification_model: str | None = Field(default=None, max_length=200)
    generation_model: str | None = Field(default=None, max_length=200)

    fast_classification_base_url: str | None = Field(default=None, max_length=500)
    deep_classification_base_url: str | None = Field(default=None, max_length=500)
    generation_base_url: str | None = Field(default=None, max_length=500)
    fast_api_key: str | None = Field(default=None, repr=False)
    deep_api_key: str | None = Field(default=None, repr=False)
    generation_api_key: str | None = Field(default=None, repr=False)


class LLMProviderUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=100)
    type: str | None = Field(default=None, max_length=50)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, repr=False)
    default_classification_model: str | None = Field(default=None, max_length=200)
    default_generation_model: str | None = Field(default=None, max_length=200)
    fast_classification_model: str | None = Field(default=None, max_length=200)
    deep_classification_model: str | None = Field(default=None, max_length=200)
    generation_model: str | None = Field(default=None, max_length=200)
    fast_classification_base_url: str | None = Field(default=None, max_length=500)
    deep_classification_base_url: str | None = Field(default=None, max_length=500)
    generation_base_url: str | None = Field(default=None, max_length=500)
    fast_api_key: str | None = Field(default=None, repr=False)
    deep_api_key: str | None = Field(default=None, repr=False)
    generation_api_key: str | None = Field(default=None, repr=False)
    is_active: bool | None = None


class LLMProviderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    label: str
    type: str
    base_url: str
    default_classification_model: str
    default_generation_model: str
    fast_classification_model: str | None
    deep_classification_model: str | None
    generation_model: str | None
    fast_classification_base_url: str | None
    deep_classification_base_url: str | None
    generation_base_url: str | None
    is_active: bool
    has_api_key: bool = False
    has_fast_api_key: bool = False
    has_deep_api_key: bool = False
    has_generation_api_key: bool = False
    created_at: datetime
