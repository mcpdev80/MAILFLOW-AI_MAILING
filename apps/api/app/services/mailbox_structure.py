"""Mailbox structure discovery and explicit-confirmation apply workflow."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

from mailflow_core.providers.imap_generic import ImapGenericProvider

from app import oauth
from app.crypto import decrypt_secret
from app.lifecycle import record_lifecycle_event
from app.mailbox_structure import build_proposal
from app.repositories.account import AccountRepository
from app.structure_schemas import StructureApply

_SYSTEM_FLAGS = {
    "\\seen",
    "\\answered",
    "\\flagged",
    "\\deleted",
    "\\draft",
    "\\recent",
    "\\*",
}


@dataclass(frozen=True)
class StructureDiscovery:
    proposal: dict[str, object]


class MailboxStructureService:
    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    async def _account(self, account_id: UUID):
        async with self._sf() as session:
            account, _, _ = await AccountRepository(session).get_full_config(account_id)
            return account

    @staticmethod
    async def _provider(account) -> ImapGenericProvider:
        password: str | None = None
        access_token: str | None = None
        if account.provider_type in ("gmail", "microsoft") and account.encrypted_oauth:
            refresh_token = str(
                decrypt_secret(account.encrypted_oauth)["refresh_token"]
            )
            access_token = await asyncio.to_thread(
                oauth.access_token_from_refresh,
                account.provider_type,
                refresh_token,
            )
        elif account.encrypted_credentials:
            password = str(decrypt_secret(account.encrypted_credentials)["password"])
        return ImapGenericProvider(
            host=account.imap_host,
            port=account.imap_port,
            username=account.username,
            password=password,
            use_ssl=account.use_ssl,
            access_token=access_token,
        )

    @staticmethod
    def _decode(value: object) -> str:
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return str(value)

    @classmethod
    def _discover_connected(
        cls,
        provider: ImapGenericProvider,
        inbox_folder: str,
    ) -> tuple[list[str], list[str]]:
        client = provider._client
        if client is None:
            raise RuntimeError("imap_not_connected")
        folders = [cls._decode(item[2]) for item in client.list_folders()]
        selected = client.select_folder(inbox_folder)
        raw_flags = (
            selected.get(b"PERMANENTFLAGS")
            or selected.get("PERMANENTFLAGS")
            or selected.get(b"FLAGS")
            or selected.get("FLAGS")
            or ()
        )
        tags: list[str] = []
        for raw in raw_flags:
            value = cls._decode(raw)
            if value.casefold() not in _SYSTEM_FLAGS and not value.startswith("\\"):
                tags.append(value)
        return folders, tags

    async def discover(self, account_id: UUID, *, locale: str) -> StructureDiscovery:
        account = await self._account(account_id)
        provider = await self._provider(account)
        try:
            await asyncio.to_thread(provider.connect)
            folders, tags = await asyncio.to_thread(
                self._discover_connected,
                provider,
                account.inbox_folder,
            )
        finally:
            await asyncio.to_thread(provider.disconnect)
        return StructureDiscovery(
            proposal=build_proposal(
                locale=locale,
                existing_folders=folders,
                existing_tags=tags,
                current_config=dict(account.structure_config or {}),
            )
        )

    async def apply(
        self,
        account_id: UUID,
        payload: StructureApply,
        *,
        actor_user_id: str,
    ) -> dict[str, object]:
        account = await self._account(account_id)
        provider = await self._provider(account)
        created_folders: list[str] = []
        reused_folders: list[str] = []
        try:
            await asyncio.to_thread(provider.connect)
            existing_folders, existing_tags = await asyncio.to_thread(
                self._discover_connected,
                provider,
                account.inbox_folder,
            )
            existing_folder_set = {name.casefold(): name for name in existing_folders}
            existing_tag_set = {name.casefold(): name for name in existing_tags}

            # Validate every requested reuse before the first provider mutation.
            for item in payload.folders:
                if (
                    item.action == "reuse"
                    and item.mailbox_name.casefold() not in existing_folder_set
                ):
                    raise ValueError(f"folder_to_reuse_not_found:{item.mailbox_name}")
            for item in payload.tags:
                if (
                    item.action == "reuse"
                    and item.mailbox_name.casefold() not in existing_tag_set
                ):
                    raise ValueError(f"tag_to_reuse_not_found:{item.mailbox_name}")

            for item in payload.folders:
                existing = existing_folder_set.get(item.mailbox_name.casefold())
                if existing is not None:
                    reused_folders.append(existing)
                    continue
                await asyncio.to_thread(
                    provider.ensure_folder_exists, item.mailbox_name
                )
                created_folders.append(item.mailbox_name)

            # Generic IMAP keywords have no standalone create primitive. Approved
            # new tag mappings therefore materialize idempotently when first used.
            config = {
                "version": 1,
                "locale_at_setup": payload.locale,
                "folders": {
                    item.internal_id: (
                        existing_folder_set.get(item.mailbox_name.casefold())
                        or item.mailbox_name
                    )
                    for item in payload.folders
                },
                "tags": {
                    item.internal_id: (
                        existing_tag_set.get(item.mailbox_name.casefold())
                        or item.mailbox_name
                    )
                    for item in payload.tags
                },
                "routes": [item.model_dump() for item in payload.routes],
            }
        finally:
            await asyncio.to_thread(provider.disconnect)

        async with self._sf() as session:
            account, _, _ = await AccountRepository(session).get_full_config(account_id)
            account.structure_config = config
            await record_lifecycle_event(
                session,
                org_id=account.org_id,
                account_id=account.id,
                actor_user_id=actor_user_id,
                actor_type="user",
                event="mailbox_structure_applied",
                details={
                    "created_folders": len(created_folders),
                    "reused_folders": len(reused_folders),
                    "folder_mappings": len(config["folders"]),
                    "tag_mappings": len(config["tags"]),
                    "routes": len(config["routes"]),
                },
            )
            await session.commit()

        return {
            "created_folders": created_folders,
            "reused_folders": reused_folders,
            "tag_mappings": dict(config["tags"]),
            "structure_config": config,
        }
