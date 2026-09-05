"""Schemas for safe per-account mailbox structure setup."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class StructureEntryApply(BaseModel):
    internal_id: str = Field(
        min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9_-]*$"
    )
    mailbox_name: str = Field(min_length=1, max_length=255)
    action: Literal["reuse", "create"]


class StructureRouteApply(BaseModel):
    category: str = Field(min_length=1, max_length=64)
    subcategory: str | None = Field(default=None, max_length=255)
    folder_id: str = Field(min_length=1, max_length=64)


class StructureApply(BaseModel):
    locale: Literal["de", "en", "es"] = "en"
    folders: list[StructureEntryApply] = Field(default_factory=list, max_length=100)
    tags: list[StructureEntryApply] = Field(default_factory=list, max_length=100)
    routes: list[StructureRouteApply] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_unique_ids_and_routes(self):
        folder_ids = [item.internal_id for item in self.folders]
        tag_ids = [item.internal_id for item in self.tags]
        if len(folder_ids) != len(set(folder_ids)):
            raise ValueError("duplicate folder internal_id")
        if len(tag_ids) != len(set(tag_ids)):
            raise ValueError("duplicate tag internal_id")
        known = set(folder_ids)
        for route in self.routes:
            if route.folder_id not in known:
                raise ValueError(
                    f"route references unknown folder_id: {route.folder_id}"
                )
        route_keys = [(item.category, item.subcategory) for item in self.routes]
        if len(route_keys) != len(set(route_keys)):
            raise ValueError("duplicate category/subcategory route")
        return self


class StructureApplyOut(BaseModel):
    created_folders: list[str]
    reused_folders: list[str]
    tag_mappings: dict[str, str]
    structure_config: dict
