"""File watcher — watches the repo for file changes and signals restart."""

import logging
import threading
from pathlib import Path
from typing import Callable, Optional, Set

LOGGER = logging.getLogger(__name__)

DEFAULT_EXTENSIONS = {".py", ".js", ".ts", ".yaml", ".yml", ".json", ".toml"}


class FileWatcher:
    def __init__(
        self,
        repo_root: Path,
        on_change: Callable[[Set[Path]], None],
        extensions: Optional[Set[str]] = None,
        debounce_seconds: float = 1.0,
        ignore_patterns: Optional[list] = None,
    ) -> None:
        self._repo_root = repo_root
        self._on_change = on_change
        self._extensions = extensions or DEFAULT_EXTENSIONS
        self._debounce_seconds = debounce_seconds

    def run(self, shutdown_event: threading.Event) -> None:
        try:
            import watchfiles
        except ImportError:
            LOGGER.warning("watchfiles not installed, file watcher disabled")
            shutdown_event.wait()
            return

        watch_filter = watchfiles.DefaultFilter(
            ignore_paths=[
                str(self._repo_root / ".git"),
                str(self._repo_root / "__pycache__"),
                str(self._repo_root / ".venv"),
                str(self._repo_root / "node_modules"),
            ],
        )

        for changes in watchfiles.watch(
            self._repo_root,
            watch_filter=watch_filter,
            stop_event=shutdown_event,
            debounce=int(self._debounce_seconds * 1000),
        ):
            if shutdown_event.is_set():
                return

            matched: Set[Path] = set()
            for _change_type, path_str in changes:
                path = Path(path_str)
                if path.suffix in self._extensions:
                    matched.add(path)

            if matched:
                try:
                    self._on_change(matched)
                except Exception:
                    LOGGER.error("Error in file change callback", exc_info=True)
