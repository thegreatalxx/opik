import os
import threading
import time
from pathlib import Path
from typing import Set

import pytest

from opik.runner.file_watcher import FileWatcher

watchfiles = pytest.importorskip("watchfiles")


class TestFileWatcher:
    def test_watcher__py_change__triggers_callback(self, tmp_path):
        changes = []
        event = threading.Event()

        def on_change(paths: Set[Path]):
            changes.extend(paths)
            event.set()

        watcher = FileWatcher(repo_root=tmp_path, on_change=on_change, debounce_seconds=0.3)
        shutdown = threading.Event()
        t = threading.Thread(target=watcher.run, args=(shutdown,))
        t.start()

        time.sleep(0.5)
        (tmp_path / "test.py").write_text("x = 1")

        assert event.wait(timeout=5)
        assert any("test.py" in str(p) for p in changes)
        shutdown.set()
        t.join(timeout=5)

    def test_watcher__txt_change__ignored(self, tmp_path):
        changes = []

        def on_change(paths: Set[Path]):
            changes.extend(paths)

        watcher = FileWatcher(repo_root=tmp_path, on_change=on_change, debounce_seconds=0.3)
        shutdown = threading.Event()
        t = threading.Thread(target=watcher.run, args=(shutdown,))
        t.start()

        time.sleep(0.5)
        (tmp_path / "readme.txt").write_text("hello")
        time.sleep(2)

        shutdown.set()
        t.join(timeout=5)
        assert not any(".txt" in str(p) for p in changes)

    def test_watcher__shutdown__stops(self, tmp_path):
        watcher = FileWatcher(repo_root=tmp_path, on_change=lambda p: None)
        shutdown = threading.Event()
        t = threading.Thread(target=watcher.run, args=(shutdown,))
        t.start()
        time.sleep(0.3)
        shutdown.set()
        t.join(timeout=5)
        assert not t.is_alive()

    def test_watcher__nested_dir__detected(self, tmp_path):
        (tmp_path / "src").mkdir()
        changes = []
        event = threading.Event()

        def on_change(paths: Set[Path]):
            changes.extend(paths)
            event.set()

        watcher = FileWatcher(repo_root=tmp_path, on_change=on_change, debounce_seconds=0.3)
        shutdown = threading.Event()
        t = threading.Thread(target=watcher.run, args=(shutdown,))
        t.start()

        time.sleep(0.5)
        (tmp_path / "src" / "agent.py").write_text("import os")

        assert event.wait(timeout=5)
        assert any("agent.py" in str(p) for p in changes)
        shutdown.set()
        t.join(timeout=5)

    def test_watcher__new_file_created__detected(self, tmp_path):
        changes = []
        event = threading.Event()

        def on_change(paths: Set[Path]):
            changes.extend(paths)
            event.set()

        watcher = FileWatcher(repo_root=tmp_path, on_change=on_change, debounce_seconds=0.3)
        shutdown = threading.Event()
        t = threading.Thread(target=watcher.run, args=(shutdown,))
        t.start()

        time.sleep(0.5)
        (tmp_path / "new_module.py").write_text("pass")

        assert event.wait(timeout=5)
        assert any("new_module.py" in str(p) for p in changes)
        shutdown.set()
        t.join(timeout=5)

    def test_watcher__file_deleted__detected(self, tmp_path):
        f = tmp_path / "delete_me.py"
        f.write_text("pass")

        changes = []
        event = threading.Event()

        def on_change(paths: Set[Path]):
            changes.extend(paths)
            event.set()

        watcher = FileWatcher(repo_root=tmp_path, on_change=on_change, debounce_seconds=0.3)
        shutdown = threading.Event()
        t = threading.Thread(target=watcher.run, args=(shutdown,))
        t.start()

        time.sleep(0.5)
        f.unlink()

        assert event.wait(timeout=5)
        assert any("delete_me.py" in str(p) for p in changes)
        shutdown.set()
        t.join(timeout=5)
