"""Supervisor — launches child process, file watcher, bridge loop, heartbeat."""

import logging
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from .. import Opik
from ..rest_api.types.agent import Agent
from ..rest_api.types.param import Param
from .bridge_api import BridgeApiClient
from .bridge_handlers.edit_file import EditFileHandler
from .bridge_handlers.list_files import ListFilesHandler
from .bridge_handlers.read_file import ReadFileHandler
from .bridge_handlers.search_files import SearchFilesHandler
from .bridge_handlers.write_file import WriteFileHandler
from .bridge_loop import BridgePollLoop
from .file_watcher import FileWatcher
from .snapshot import build_checklist
from .stability_guard import StabilityGuard

LOGGER = logging.getLogger(__name__)

_RESTART_DEBOUNCE_SECONDS = 1.0


class Supervisor:
    def __init__(
        self,
        command: List[str],
        env: Dict[str, str],
        repo_root: Path,
        runner_id: str,
        api: Any,
        on_child_output: Optional[Callable[[str, str], None]] = None,
        on_child_restart: Optional[Callable[[str], None]] = None,
        on_command_start: Optional[Callable] = None,
        on_command_end: Optional[Callable] = None,
    ) -> None:
        self._command = command
        self._env = env
        self._repo_root = repo_root
        self._runner_id = runner_id
        self._api = api
        self._on_child_output = on_child_output or self._default_output_callback
        self._on_child_restart = on_child_restart
        self._on_command_start = on_command_start
        self._on_command_end = on_command_end
        self._shutdown_event = threading.Event()
        self._child: Optional[subprocess.Popen] = None
        self._child_lock = threading.Lock()
        self._stability_guard = StabilityGuard()
        self._last_restart = 0.0
        self._restart_lock = threading.Lock()
        self._bridge_loop: Optional[BridgePollLoop] = None
        self._stderr_buffer: List[str] = []
        self._stderr_lock = threading.Lock()
        self._stderr_max_lines = 500

    def run(self) -> None:
        self._install_signal_handlers()

        handlers = {
            "read_file": ReadFileHandler(self._repo_root),
            "write_file": WriteFileHandler(self._repo_root),
            "edit_file": EditFileHandler(self._repo_root),
            "list_files": ListFilesHandler(self._repo_root),
            "search_files": SearchFilesHandler(self._repo_root),
        }
        bridge_api = BridgeApiClient(self._api)
        self._bridge_loop = BridgePollLoop(
            api=bridge_api,
            runner_id=self._runner_id,
            repo_root=self._repo_root,
            handlers=handlers,
            shutdown_event=self._shutdown_event,
            on_command_start=self._on_command_start,
            on_command_end=self._on_command_end,
        )

        bridge_thread = threading.Thread(
            target=self._bridge_loop.run, name="bridge-poll", daemon=True
        )
        bridge_thread.start()

        heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop, name="heartbeat", daemon=True
        )
        heartbeat_thread.start()

        watcher = FileWatcher(
            repo_root=self._repo_root,
            on_change=self._on_file_change,
        )
        watcher_thread = threading.Thread(
            target=watcher.run,
            args=(self._shutdown_event,),
            name="file-watcher",
            daemon=True,
        )
        watcher_thread.start()

        self._start_child()
        self._send_checklist()

        try:
            self._wait_loop()
        finally:
            self._shutdown_event.set()
            self._stop_child()

    def _wait_loop(self) -> None:
        while not self._shutdown_event.is_set():
            with self._child_lock:
                child = self._child

            if child is not None:
                try:
                    exit_code = child.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    continue

                if self._shutdown_event.is_set():
                    return

                if exit_code == 0:
                    LOGGER.debug("Child exited cleanly (code 0)")
                    self._shutdown_event.set()
                    return

                LOGGER.warning("Child exited with code %d", exit_code)
                stderr_tail = self._get_stderr_tail()

                if self._stability_guard.last_restart_was_edit:
                    LOGGER.info(
                        "Child crashed after file edit — waiting for next edit to retry"
                    )
                    self._stability_guard.waiting_for_fix = True
                    self._patch_crash_info(exit_code, stderr_tail)
                    with self._child_lock:
                        self._child = None
                else:
                    self._stability_guard.record_crash()
                    if not self._stability_guard.is_stable():
                        LOGGER.error(
                            "Child is crash-looping, not restarting. "
                            "Fix the issue and restart opik connect."
                        )
                        self._patch_crash_info(exit_code, stderr_tail)
                        self._shutdown_event.set()
                        return
                    self._restart_child(f"child exited with code {exit_code}")
            else:
                self._shutdown_event.wait(0.5)

    def _start_child(self) -> subprocess.Popen:
        with self._stderr_lock:
            self._stderr_buffer.clear()
        LOGGER.debug("Starting child: %s", " ".join(self._command))
        child = subprocess.Popen(
            self._command,
            env=self._env,
            cwd=str(self._repo_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        with self._child_lock:
            self._child = child

        threading.Thread(
            target=self._read_stream,
            args=(child, child.stdout, "stdout"),
            name="child-stdout",
            daemon=True,
        ).start()
        threading.Thread(
            target=self._read_stream,
            args=(child, child.stderr, "stderr"),
            name="child-stderr",
            daemon=True,
        ).start()

        return child

    def _stop_child(self, graceful_timeout: float = 10.0) -> Optional[int]:
        with self._child_lock:
            child = self._child
            self._child = None

        if child is None:
            return None

        if child.poll() is not None:
            return child.returncode

        try:
            child.terminate()
            child.wait(timeout=graceful_timeout)
        except subprocess.TimeoutExpired:
            LOGGER.warning("Child did not exit after SIGTERM, sending SIGKILL")
            child.kill()
            child.wait(timeout=5)

        return child.returncode

    def _restart_child(self, reason: str) -> None:
        with self._restart_lock:
            now = time.monotonic()
            if now - self._last_restart < _RESTART_DEBOUNCE_SECONDS:
                return
            self._last_restart = now

        LOGGER.debug("Restarting child: %s", reason)
        if self._on_child_restart:
            self._on_child_restart(reason)
        self._stop_child()
        self._start_child()
        self._send_checklist()
        LOGGER.debug("Child restarted")

    def _send_checklist(self) -> None:
        try:
            checklist = build_checklist(self._repo_root, self._command)
            bridge_api = BridgeApiClient(self._api)
            bridge_api.update_checklist(self._runner_id, checklist)
            LOGGER.debug("Checklist sent (instrumented=%s)", checklist["instrumentation"])
        except Exception:
            LOGGER.debug("Failed to send checklist", exc_info=True)

    def _on_file_change(self, paths: Set[Path]) -> None:
        if self._shutdown_event.is_set():
            return
        self._stability_guard.waiting_for_fix = False
        self._stability_guard.last_restart_was_edit = True
        names = ", ".join(str(p.relative_to(self._repo_root)) for p in list(paths)[:5])
        self._restart_child(f"file changed: {names}")

    def _read_stream(
        self, child: subprocess.Popen, stream: Any, name: str
    ) -> None:
        try:
            for raw_line in iter(stream.readline, b""):
                if self._shutdown_event.is_set():
                    break
                try:
                    line = raw_line.decode("utf-8", errors="replace").rstrip("\n\r")
                except Exception:
                    continue
                if name == "stderr":
                    with self._stderr_lock:
                        self._stderr_buffer.append(line)
                        if len(self._stderr_buffer) > self._stderr_max_lines:
                            self._stderr_buffer = self._stderr_buffer[-self._stderr_max_lines:]
                self._on_child_output(name, line)
        except (ValueError, OSError):
            pass

    def _get_stderr_tail(self) -> str:
        with self._stderr_lock:
            tail = "\n".join(self._stderr_buffer)
            return tail

    def _patch_crash_info(self, exit_code: int, stderr_tail: str) -> None:
        try:
            bridge_api = BridgeApiClient(self._api)
            bridge_api.patch_checklist(self._runner_id, {
                "child_status": "crashed",
                "last_crash": {
                    "exit_code": exit_code,
                    "stderr_tail": stderr_tail,
                },
            })
        except Exception:
            LOGGER.debug("Failed to patch crash info", exc_info=True)

    def _default_output_callback(self, stream: str, line: str) -> None:
        target = sys.stderr if stream == "stderr" else sys.stdout
        try:
            print(line, file=target, flush=True)
        except (BrokenPipeError, OSError):
            pass

    def _heartbeat_loop(self) -> None:
        import collections
        import random

        from ..rest_api.core.api_error import ApiError

        cancelled_jobs: collections.OrderedDict = collections.OrderedDict()
        lock = threading.Lock()

        while not self._shutdown_event.is_set():
            try:
                resp = self._api.runners.heartbeat(
                    self._runner_id,
                    request_options={
                        "additional_body_parameters": {
                            "capabilities": ["jobs", "bridge"],
                        },
                    },
                )

                if self._bridge_loop:
                    cancelled_command_ids = getattr(
                        resp, "cancelled_command_ids", None
                    ) or []
                    if cancelled_command_ids:
                        self._bridge_loop.add_cancelled_commands(cancelled_command_ids)

            except ApiError as e:
                if e.status_code == 410:
                    LOGGER.info("Runner evicted (410), shutting down")
                    self._shutdown_event.set()
                    return
                LOGGER.debug("Heartbeat error", exc_info=True)
            except Exception:
                LOGGER.debug("Heartbeat error", exc_info=True)

            self._shutdown_event.wait(5.0)

    def _install_signal_handlers(self) -> None:
        def handler(signum: int, frame: Any) -> None:
            LOGGER.info("Received signal %s, shutting down", signum)
            self._shutdown_event.set()

        try:
            signal.signal(signal.SIGTERM, handler)
            signal.signal(signal.SIGINT, handler)
        except ValueError:
            LOGGER.warning("Cannot install signal handlers outside main thread")
