"""Bridge command handler protocol, stub implementations, and file mutation queue."""

import os
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, Protocol


class CommandError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class CommandResult:
    data: Dict[str, Any] = field(default_factory=dict)


class BridgeCommandHandler(Protocol):
    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]: ...


class StubHandler:
    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        raise CommandError("not_implemented", "Command type not yet implemented")


class FileMutationQueue:
    """Per-file write serialization using reentrant locks keyed by realpath."""

    def __init__(self) -> None:
        self._locks: Dict[str, threading.Lock] = {}
        self._meta_lock = threading.Lock()

    def acquire(self, path: str) -> None:
        lock = self._get_lock(path)
        lock.acquire()

    def release(self, path: str) -> None:
        lock = self._get_lock(path)
        lock.release()

    def _get_lock(self, path: str) -> threading.Lock:
        real = os.path.realpath(path)
        with self._meta_lock:
            if real not in self._locks:
                self._locks[real] = threading.Lock()
            return self._locks[real]
