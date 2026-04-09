import hashlib
import hmac as _hmac

import pytest

from opik.runner.pake import PakeSession, generate_code

from spake2 import SPAKE2_B


def _browser_confirmation(key: bytes) -> str:
    """Simulate browser-side confirmation: HMAC(K, 'confirm-B')."""
    return _hmac.new(key, b"confirm-B", hashlib.sha256).hexdigest()


def _browser_verifies_daemon(key: bytes, daemon_confirm: str) -> bool:
    """Browser verifies daemon's confirm-A tag."""
    expected = _hmac.new(key, b"confirm-A", hashlib.sha256).hexdigest()
    return _hmac.compare_digest(expected, daemon_confirm)


class TestGenerateCode:
    def test_length(self):
        code = generate_code()
        assert len(code) == 6

    def test_charset(self):
        code = generate_code()
        allowed = set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
        assert all(c in allowed for c in code)

    def test_no_ambiguous_chars(self):
        for _ in range(100):
            code = generate_code()
            assert "0" not in code
            assert "O" not in code
            assert "1" not in code
            assert "I" not in code
            assert "L" not in code


class TestPakeSession:
    def test_key_derivation_both_sides_same(self):
        password = "H8SR0L"
        daemon = PakeSession(password)
        browser = SPAKE2_B(password.encode("utf-8"))

        msg_a = daemon.start()
        msg_b = browser.start()

        key_daemon = daemon.finish(msg_b)
        key_browser = browser.finish(msg_a)

        assert key_daemon == key_browser

    def test_different_passwords_different_keys(self):
        daemon = PakeSession("AAAAAA")
        browser = SPAKE2_B(b"BBBBBB")

        msg_a = daemon.start()
        msg_b = browser.start()

        daemon.finish(msg_b)
        key_browser = browser.finish(msg_a)

        assert daemon.shared_key != key_browser

    def test_shared_key_before_finish_raises(self):
        session = PakeSession("H8SR0L")
        session.start()
        with pytest.raises(RuntimeError, match="not complete"):
            _ = session.shared_key

    def test_asymmetric_confirmation_roundtrip(self):
        password = "H8SR0L"
        daemon = PakeSession(password)
        browser = SPAKE2_B(password.encode("utf-8"))

        msg_a = daemon.start()
        msg_b = browser.start()

        daemon.finish(msg_b)
        browser_key = browser.finish(msg_a)

        browser_confirm = _browser_confirmation(browser_key)
        assert daemon.verify_confirmation(browser_confirm)

        assert _browser_verifies_daemon(browser_key, daemon.confirmation())

    def test_confirmation_fails_with_different_keys(self):
        daemon = PakeSession("AAAAAA")
        browser = SPAKE2_B(b"BBBBBB")

        msg_a = daemon.start()
        msg_b = browser.start()

        daemon.finish(msg_b)
        browser_key = browser.finish(msg_a)

        browser_confirm = _browser_confirmation(browser_key)
        assert not daemon.verify_confirmation(browser_confirm)

    def test_daemon_cannot_self_confirm(self):
        """Daemon's own confirmation tag must not pass verify_confirmation
        (asymmetric: daemon sends confirm-A, expects confirm-B)."""
        password = "H8SR0L"
        daemon = PakeSession(password)
        browser = SPAKE2_B(password.encode("utf-8"))

        msg_a = daemon.start()
        msg_b = browser.start()
        daemon.finish(msg_b)
        browser.finish(msg_a)

        assert not daemon.verify_confirmation(daemon.confirmation())
