"""Runner activation — called after the user's module loads to start the in-process loop."""

import logging
import os
import signal
import threading

from pathlib import Path

from .. import Opik
from ..rest_api.types.agent import Agent
from ..rest_api.types.param import Param
from . import registry
from .bridge_api import BridgeApiClient
from .bridge_handlers.edit_file import EditFileHandler
from .bridge_handlers.list_files import ListFilesHandler
from .bridge_handlers.read_file import ReadFileHandler
from .bridge_handlers.search_files import SearchFilesHandler
from .bridge_handlers.write_file import WriteFileHandler
from .bridge_loop import BridgePollLoop
from .in_process_loop import InProcessRunnerLoop

LOGGER = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


def install_signal_handlers(shutdown_event: threading.Event) -> None:
    def handler(signum: int, frame: object) -> None:
        LOGGER.info("Received signal %s, shutting down", signum)
        shutdown_event.set()

    try:
        signal.signal(signal.SIGTERM, handler)
        signal.signal(signal.SIGINT, handler)
    except ValueError:
        LOGGER.warning("Cannot install signal handlers outside main thread")


def activate_runner() -> None:
    """Start the runner loop in a background thread (non-blocking)."""
    if os.environ.get("OPIK_RUNNER_MODE") != "true":
        return

    global _started
    with _lock:
        if _started:
            return
        _started = True

    shutdown_event = threading.Event()
    install_signal_handlers(shutdown_event)

    t = threading.Thread(target=_run, args=(shutdown_event,), daemon=True)
    t.start()


def _run(shutdown_event: threading.Event) -> None:
    runner_id = os.environ.get("OPIK_RUNNER_ID", "")
    project_name = os.environ.get("OPIK_PROJECT_NAME", "")

    if not runner_id:
        LOGGER.error(
            "OPIK_RUNNER_ID is not set. "
            "Do not set OPIK_RUNNER_MODE manually — use 'opik connect' to launch your command: "
            "opik connect --pair <code> python3 main.py"
        )
        return

    client = Opik(_show_misconfiguration_message=False)
    api = client.rest_client

    def _to_payload(entry: dict) -> dict:
        return Agent(
            description=entry.get("docstring", ""),
            language="python",
            params=[Param(name=p.name, type=p.type) for p in entry.get("params", [])],
            timeout=0,
        ).dict()

    def _sync_agent(name: str) -> None:
        entry = registry.get_all().get(name)
        if entry is None:
            return
        try:
            api.runners.register_agents(runner_id, request={name: _to_payload(entry)})
        except Exception:
            LOGGER.warn("Failed to register agent '%s'", name, exc_info=True)

    registry.on_register(_sync_agent)

    entrypoints = registry.get_all()
    if entrypoints:
        api.runners.register_agents(
            runner_id,
            request={name: _to_payload(entry) for name, entry in entrypoints.items()},
        )

    LOGGER.debug("Runner activated")

    repo_root = Path(os.environ.get("OPIK_REPO_ROOT", os.getcwd()))
    handlers = {
        "read_file": ReadFileHandler(repo_root),
        "write_file": WriteFileHandler(repo_root),
        "edit_file": EditFileHandler(repo_root),
        "list_files": ListFilesHandler(repo_root),
        "search_files": SearchFilesHandler(repo_root),
    }
    bridge_api = BridgeApiClient(api)
    bridge_loop = BridgePollLoop(
        api=bridge_api,
        runner_id=runner_id,
        repo_root=repo_root,
        handlers=handlers,
        shutdown_event=shutdown_event,
    )

    bridge_thread = threading.Thread(
        target=bridge_loop.run,
        name="bridge-poll",
        daemon=True,
    )
    bridge_thread.start()

    loop = InProcessRunnerLoop(
        api, runner_id, shutdown_event, bridge_loop=bridge_loop
    )

    try:
        loop.run()
    finally:
        client.end()
