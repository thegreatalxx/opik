"""SPAKE2-based PAKE for bridge pairing.

Daemon = SPAKE2_A (initiator, posts first).
Browser = SPAKE2_B.
"""

import hashlib
import hmac as _hmac
import secrets

from spake2 import SPAKE2_A

PAIRING_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
PAIRING_CODE_LENGTH = 6


def generate_code(length: int = PAIRING_CODE_LENGTH) -> str:
    return "".join(secrets.choice(PAIRING_CODE_CHARSET) for _ in range(length))


class PakeSession:
    """Daemon-side SPAKE2 session (role A)."""

    def __init__(self, password: str) -> None:
        self._spake = SPAKE2_A(password.encode("utf-8"))
        self._key: bytes | None = None

    def start(self) -> bytes:
        return self._spake.start()

    def finish(self, msg_in: bytes) -> bytes:
        self._key = self._spake.finish(msg_in)
        return self._key

    @property
    def shared_key(self) -> bytes:
        if self._key is None:
            raise RuntimeError("PAKE exchange not complete")
        return self._key

    def confirmation(self) -> str:
        """Daemon sends HMAC(K, 'confirm-A'). Browser must verify this tag."""
        return _hmac.new(self.shared_key, b"confirm-A", hashlib.sha256).hexdigest()

    def verify_confirmation(self, value: str) -> bool:
        """Verify browser's confirmation tag HMAC(K, 'confirm-B')."""
        expected = _hmac.new(self.shared_key, b"confirm-B", hashlib.sha256).hexdigest()
        return _hmac.compare_digest(expected, value)
