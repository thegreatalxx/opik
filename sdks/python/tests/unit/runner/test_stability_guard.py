import time

import pytest

from opik.runner.stability_guard import StabilityGuard


class TestStabilityGuard:
    def test_guard__no_crashes__stable(self):
        guard = StabilityGuard()
        assert guard.is_stable() is True

    def test_guard__one_crash__stable(self):
        guard = StabilityGuard(max_crashes=3)
        guard.record_crash()
        assert guard.is_stable() is True

    def test_guard__max_crashes_in_window__unstable(self):
        guard = StabilityGuard(max_crashes=3, window_seconds=10.0)
        guard.record_crash()
        guard.record_crash()
        guard.record_crash()
        assert guard.is_stable() is False

    def test_guard__crashes_outside_window__stable(self):
        guard = StabilityGuard(max_crashes=3, window_seconds=0.1)
        guard.record_crash()
        guard.record_crash()
        time.sleep(0.15)
        guard.record_crash()
        assert guard.is_stable() is True

    def test_guard__reset__clears_history(self):
        guard = StabilityGuard(max_crashes=3)
        guard.record_crash()
        guard.record_crash()
        guard.record_crash()
        assert guard.is_stable() is False
        guard.reset()
        assert guard.is_stable() is True

    def test_guard__exactly_at_boundary(self):
        guard = StabilityGuard(max_crashes=3)
        guard.record_crash()
        guard.record_crash()
        assert guard.is_stable() is True

    def test_guard__last_restart_was_edit__tracks(self):
        guard = StabilityGuard()
        assert guard.last_restart_was_edit is False
        guard.last_restart_was_edit = True
        assert guard.last_restart_was_edit is True

    def test_guard__waiting_for_fix__tracks(self):
        guard = StabilityGuard()
        assert guard.waiting_for_fix is False
        guard.waiting_for_fix = True
        assert guard.waiting_for_fix is True

    def test_guard__reset__clears_waiting_for_fix(self):
        guard = StabilityGuard()
        guard.waiting_for_fix = True
        guard.reset()
        assert guard.waiting_for_fix is False
