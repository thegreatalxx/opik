"""Bridge poll loop — polls for bridge commands and dispatches to handlers."""

import collections
import logging
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Optional, Set

from ..rest_api.core.api_error import ApiError
from .bridge_api import BridgeApiClient, BridgeCommand
from .bridge_handlers import (
    BridgeCommandHandler,
    CommandError,
    CommandResult,
    FileMutationQueue,
    StubHandler,
)

LOGGER = logging.getLogger(__name__)

WRITE_COMMAND_TYPES = frozenset({"write_file", "edit_file"})
_REPORT_MAX_RETRIES = 3
_REPORT_BACKOFF_BASE = 1.0


def _pascal_case(snake: str) -> str:
    return "".join(word.capitalize() for word in snake.split("_"))


def _build_op_summary(cmd: BridgeCommand) -> str:
    args = cmd.args
    path = args.get("path", "")
    label = _pascal_case(cmd.type)
    if cmd.type == "edit_file":
        edits = args.get("edits", [])
        count = len(edits)
        suffix = f" ({count} edit{'s' if count != 1 else ''})" if count else ""
        return f"{label} {path}{suffix}"
    if cmd.type in ("read_file", "write_file"):
        return f"{label} {path}"
    if cmd.type == "list_files":
        pattern = args.get("pattern", "")
        return f"{label} {pattern}"
    if cmd.type == "search_files":
        pattern = args.get("pattern", "")
        return f"{label} {pattern}"
    if cmd.type == "run_agent":
        name = args.get("name", "")
        return f"{label} {name}"
    return label


class BridgePollLoop:
    def __init__(
        self,
        api: BridgeApiClient,
        runner_id: str,
        repo_root: Path,
        handlers: Dict[str, BridgeCommandHandler],
        shutdown_event: threading.Event,
        backoff_cap_seconds: float = 30.0,
        on_command_start: Optional[Any] = None,
        on_command_end: Optional[Any] = None,
    ) -> None:
        self._api = api
        self._runner_id = runner_id
        self._repo_root = repo_root
        self._handlers = handlers
        self._shutdown_event = shutdown_event
        self._backoff_cap_seconds = backoff_cap_seconds
        self._on_command_start = on_command_start
        self._on_command_end = on_command_end
        self._cancelled_commands: collections.OrderedDict[str, float] = (
            collections.OrderedDict()
        )
        self._lock = threading.Lock()
        self._mutation_queue = FileMutationQueue()
        self._executor = ThreadPoolExecutor(max_workers=10, thread_name_prefix="bridge")

    @property
    def cancelled_commands(self) -> collections.OrderedDict:
        return self._cancelled_commands

    def run(self) -> None:
        backoff = 1.0
        poll_failures = 0

        try:
            while not self._shutdown_event.is_set():
                try:
                    commands = self._api.next_bridge_commands(
                        self._runner_id, max_commands=10
                    )
                    poll_failures = 0
                except ApiError as e:
                    if e.status_code == 410:
                        LOGGER.info("Runner evicted (410), stopping bridge loop")
                        self._shutdown_event.set()
                        return
                    poll_failures += 1
                    if poll_failures == 1:
                        LOGGER.warning(
                            "Bridge poll error (API %s). Retrying...",
                            e.status_code,
                        )
                    else:
                        LOGGER.debug("Bridge poll error", exc_info=True)
                    self._backoff_wait(backoff)
                    backoff = min(backoff * 2, self._backoff_cap_seconds)
                    continue
                except Exception:
                    poll_failures += 1
                    if poll_failures == 1:
                        LOGGER.warning(
                            "Bridge poll error. Retrying...", exc_info=True
                        )
                    else:
                        LOGGER.debug("Bridge poll error", exc_info=True)
                    self._backoff_wait(backoff)
                    backoff = min(backoff * 2, self._backoff_cap_seconds)
                    continue

                backoff = 1.0

                if not commands:
                    continue

                self._dispatch_batch(commands)
        finally:
            self._executor.shutdown(wait=True)

    def _dispatch_batch(self, commands: list) -> None:
        futures = {}
        for cmd in commands:
            with self._lock:
                if cmd.command_id in self._cancelled_commands:
                    del self._cancelled_commands[cmd.command_id]
                    self._report_result(
                        cmd.command_id, "cancelled", error={"code": "cancelled", "message": "Command cancelled"}
                    )
                    continue

            future = self._executor.submit(self._execute_command, cmd)
            futures[future] = cmd

        for future in as_completed(futures):
            cmd = futures[future]
            try:
                future.result()
            except Exception:
                LOGGER.error(
                    "Unexpected error processing command %s",
                    cmd.command_id,
                    exc_info=True,
                )

    def _execute_command(self, cmd: BridgeCommand) -> None:
        start = time.monotonic()
        handler = self._handlers.get(cmd.type)
        is_write = cmd.type in WRITE_COMMAND_TYPES

        if handler is None:
            handler = StubHandler()

        summary = _build_op_summary(cmd)
        if self._on_command_start:
            self._on_command_start(cmd.command_id, cmd.type, summary)

        if is_write and "path" in cmd.args:
            self._mutation_queue.acquire(cmd.args["path"])

        try:
            result_data = handler.execute(cmd.args, timeout=cmd.timeout_seconds)
            duration_ms = int((time.monotonic() - start) * 1000)
            self._report_result(
                cmd.command_id,
                "completed",
                result=result_data,
                duration_ms=duration_ms,
            )
            if self._on_command_end:
                self._on_command_end(cmd.command_id, True, None)
        except CommandError as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            self._report_result(
                cmd.command_id,
                "failed",
                error={"code": e.code, "message": e.message},
                duration_ms=duration_ms,
            )
            if self._on_command_end:
                self._on_command_end(cmd.command_id, False, e.code)
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            self._report_result(
                cmd.command_id,
                "failed",
                error={"code": "internal_error", "message": str(e)},
                duration_ms=duration_ms,
            )
            if self._on_command_end:
                self._on_command_end(cmd.command_id, False, str(e))
        finally:
            if is_write and "path" in cmd.args:
                self._mutation_queue.release(cmd.args["path"])

    def _report_result(
        self,
        command_id: str,
        status: str,
        result: Optional[dict] = None,
        error: Optional[dict] = None,
        duration_ms: Optional[int] = None,
    ) -> None:
        for attempt in range(_REPORT_MAX_RETRIES):
            try:
                self._api.report_bridge_result(
                    self._runner_id,
                    command_id,
                    status=status,
                    result=result,
                    error=error,
                    duration_ms=duration_ms,
                )
                return
            except ApiError as e:
                if e.status_code == 409:
                    return
                if attempt < _REPORT_MAX_RETRIES - 1:
                    delay = _REPORT_BACKOFF_BASE * (2**attempt)
                    time.sleep(delay)
                else:
                    LOGGER.error(
                        "Failed to report result for command %s after %d attempts",
                        command_id,
                        _REPORT_MAX_RETRIES,
                    )
            except Exception:
                if attempt < _REPORT_MAX_RETRIES - 1:
                    delay = _REPORT_BACKOFF_BASE * (2**attempt)
                    time.sleep(delay)
                else:
                    LOGGER.error(
                        "Failed to report result for command %s after %d attempts",
                        command_id,
                        _REPORT_MAX_RETRIES,
                        exc_info=True,
                    )

    def _backoff_wait(self, backoff: float) -> None:
        wait = min(backoff, self._backoff_cap_seconds) * (
            0.5 + random.random() * 0.5
        )
        self._shutdown_event.wait(wait)

    def add_cancelled_commands(self, command_ids: list) -> None:
        now = time.monotonic()
        with self._lock:
            for cid in command_ids:
                self._cancelled_commands[cid] = now
            self._prune_cancelled()

    def _prune_cancelled(self) -> None:
        cutoff = time.monotonic() - 300
        while self._cancelled_commands:
            oldest_key, oldest_time = next(iter(self._cancelled_commands.items()))
            if oldest_time > cutoff:
                break
            del self._cancelled_commands[oldest_key]
        while len(self._cancelled_commands) > 10_000:
            self._cancelled_commands.popitem(last=False)
