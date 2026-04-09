"""HMAC-SHA256 signing and verification for bridge commands."""

import hashlib
import hmac as _hmac
import json
from typing import Any, Optional


def _canonical(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _compute_hmac(key: bytes, command_id: str, cmd_type: str, payload: Any) -> str:
    message = f"{command_id}|{cmd_type}|{_canonical(payload)}"
    return _hmac.new(key, message.encode("utf-8"), hashlib.sha256).hexdigest()


class CommandSigner:
    def __init__(self, key: bytes) -> None:
        self._key = key

    def sign(self, command_id: str, cmd_type: str, payload: Any) -> str:
        return _compute_hmac(self._key, command_id, cmd_type, payload)


class CommandVerifier:
    def __init__(self, key: bytes) -> None:
        self._key = key
        self.tamper_count: int = 0

    def verify(
        self,
        command_id: str,
        cmd_type: str,
        payload: Any,
        hmac_value: Optional[str],
    ) -> bool:
        if hmac_value is None:
            self.tamper_count += 1
            return False

        expected = _compute_hmac(self._key, command_id, cmd_type, payload)
        if not _hmac.compare_digest(expected, hmac_value):
            self.tamper_count += 1
            return False

        return True
