"""Bridge-specific REST client methods.

Not auto-generated — manually wraps the Fern httpx client for bridge endpoints
that don't exist in the Fern API definition yet.
"""

import logging
import typing
from dataclasses import dataclass
from json.decoder import JSONDecodeError

from ..rest_api.client import OpikApi
from ..rest_api.core.api_error import ApiError

LOGGER = logging.getLogger(__name__)


@dataclass
class BridgeCommand:
    command_id: str
    type: str
    args: dict
    timeout_seconds: int
    submitted_at: str


class BridgeApiClient:
    """Thin wrapper around the Fern httpx client for bridge endpoints."""

    def __init__(self, api: OpikApi) -> None:
        self._client_wrapper = api._client_wrapper  # type: ignore[attr-defined]

    def next_bridge_commands(
        self,
        runner_id: str,
        max_commands: int = 10,
    ) -> typing.List[BridgeCommand]:
        response = self._client_wrapper.httpx_client.request(
            f"v1/private/local-runners/{runner_id}/bridge/next",
            method="POST",
            json={"max_commands": max_commands},
            request_options={"timeout_in_seconds": 35},
        )
        if response.status_code == 204:
            return []
        if response.status_code == 410:
            raise ApiError(
                status_code=410,
                headers=dict(response.headers),
                body="Runner evicted",
            )
        if 200 <= response.status_code < 300:
            try:
                data = response.json()
            except JSONDecodeError:
                raise ApiError(
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    body=response.text,
                )
            commands = []
            for cmd in data.get("commands", []):
                commands.append(
                    BridgeCommand(
                        command_id=cmd["command_id"],
                        type=cmd["type"],
                        args=cmd.get("args", {}),
                        timeout_seconds=cmd.get("timeout_seconds", 30),
                        submitted_at=cmd.get("submitted_at", ""),
                    )
                )
            return commands
        try:
            body = response.json()
        except JSONDecodeError:
            body = response.text
        raise ApiError(
            status_code=response.status_code,
            headers=dict(response.headers),
            body=body,
        )

    def report_bridge_result(
        self,
        runner_id: str,
        command_id: str,
        status: str,
        result: typing.Optional[dict] = None,
        error: typing.Optional[dict] = None,
        duration_ms: typing.Optional[int] = None,
    ) -> None:
        payload: dict = {"status": status}
        if result is not None:
            payload["result"] = result
        if error is not None:
            payload["error"] = error
        if duration_ms is not None:
            payload["duration_ms"] = duration_ms

        response = self._client_wrapper.httpx_client.request(
            f"v1/private/local-runners/{runner_id}/bridge/commands/{command_id}/result",
            method="POST",
            json=payload,
        )
        if response.status_code == 409:
            raise ApiError(
                status_code=409,
                headers=dict(response.headers),
                body="Duplicate result",
            )
        if response.status_code == 404:
            raise ApiError(
                status_code=404,
                headers=dict(response.headers),
                body="Command not found",
            )
        if not (200 <= response.status_code < 300):
            try:
                body = response.json()
            except JSONDecodeError:
                body = response.text
            raise ApiError(
                status_code=response.status_code,
                headers=dict(response.headers),
                body=body,
            )

    def update_checklist(self, runner_id: str, checklist: dict) -> None:
        try:
            response = self._client_wrapper.httpx_client.request(
                f"v1/private/local-runners/{runner_id}/checklist",
                method="PUT",
                json=checklist,
            )
            if not (200 <= response.status_code < 300):
                LOGGER.debug(
                    "Failed to update checklist: %s", response.status_code
                )
        except Exception:
            LOGGER.debug("Failed to update checklist", exc_info=True)

    def patch_checklist(self, runner_id: str, patch: dict) -> None:
        try:
            response = self._client_wrapper.httpx_client.request(
                f"v1/private/local-runners/{runner_id}/checklist",
                method="PATCH",
                json=patch,
            )
            if not (200 <= response.status_code < 300):
                LOGGER.debug(
                    "Failed to patch checklist: %s", response.status_code
                )
        except Exception:
            LOGGER.debug("Failed to patch checklist", exc_info=True)
