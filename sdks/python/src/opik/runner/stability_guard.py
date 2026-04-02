"""Stability guard — prevents infinite restart loops from bad edits."""

import threading
import time
from collections import deque


class StabilityGuard:
    def __init__(self, max_crashes: int = 3, window_seconds: float = 30.0) -> None:
        self._max_crashes = max_crashes
        self._window_seconds = window_seconds
        self._crashes: deque = deque()
        self._lock = threading.Lock()
        self._last_restart_was_edit = False
        self._waiting_for_fix = False

    def record_crash(self) -> None:
        now = time.monotonic()
        with self._lock:
            self._crashes.append(now)
            self._prune(now)

    def is_stable(self) -> bool:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            return len(self._crashes) < self._max_crashes

    def reset(self) -> None:
        with self._lock:
            self._crashes.clear()
            self._waiting_for_fix = False

    @property
    def last_restart_was_edit(self) -> bool:
        return self._last_restart_was_edit

    @last_restart_was_edit.setter
    def last_restart_was_edit(self, value: bool) -> None:
        self._last_restart_was_edit = value

    @property
    def waiting_for_fix(self) -> bool:
        return self._waiting_for_fix

    @waiting_for_fix.setter
    def waiting_for_fix(self, value: bool) -> None:
        self._waiting_for_fix = value

    def _prune(self, now: float) -> None:
        cutoff = now - self._window_seconds
        while self._crashes and self._crashes[0] < cutoff:
            self._crashes.popleft()
