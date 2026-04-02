import os
import tempfile
import threading
import time

import pytest

from opik.runner.bridge_handlers import (
    CommandError,
    CommandResult,
    FileMutationQueue,
    StubHandler,
)


class TestStubHandler:
    def test_stub_handler__raises_not_implemented(self):
        handler = StubHandler()
        with pytest.raises(CommandError) as exc_info:
            handler.execute({"path": "foo.py"}, timeout=10)
        assert exc_info.value.code == "not_implemented"

    def test_command_error__fields(self):
        err = CommandError("file_not_found", "File not found: foo.py")
        assert err.code == "file_not_found"
        assert err.message == "File not found: foo.py"

    def test_command_result__fields(self):
        result = CommandResult(data={"content": "hello"})
        assert result.data == {"content": "hello"}


class TestFileMutationQueue:
    def test_same_file__serialized(self):
        queue = FileMutationQueue()
        order = []
        barrier = threading.Barrier(2, timeout=5)

        def writer(label, path):
            queue.acquire(path)
            try:
                order.append(f"{label}_start")
                time.sleep(0.05)
                order.append(f"{label}_end")
            finally:
                queue.release(path)

        t1 = threading.Thread(target=writer, args=("a", "/tmp/test_same.txt"))
        t2 = threading.Thread(target=writer, args=("b", "/tmp/test_same.txt"))
        t1.start()
        time.sleep(0.01)
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        assert order == ["a_start", "a_end", "b_start", "b_end"]

    def test_different_files__parallel(self):
        queue = FileMutationQueue()
        started = threading.Event()
        both_started = []

        def writer(path, event):
            queue.acquire(path)
            try:
                event.set()
                time.sleep(0.05)
            finally:
                queue.release(path)

        e1 = threading.Event()
        e2 = threading.Event()
        t1 = threading.Thread(target=writer, args=("/tmp/file_a.txt", e1))
        t2 = threading.Thread(target=writer, args=("/tmp/file_b.txt", e2))
        t1.start()
        t2.start()

        assert e1.wait(timeout=2)
        assert e2.wait(timeout=2)

        t1.join(timeout=5)
        t2.join(timeout=5)

    def test_symlink__resolves_to_same_lock(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            target = os.path.join(tmpdir, "target.txt")
            link = os.path.join(tmpdir, "link.txt")
            with open(target, "w") as f:
                f.write("x")
            os.symlink(target, link)

            queue = FileMutationQueue()
            queue.acquire(target)

            acquired = threading.Event()

            def try_acquire():
                queue.acquire(link)
                acquired.set()
                queue.release(link)

            t = threading.Thread(target=try_acquire)
            t.start()

            assert not acquired.wait(timeout=0.1)

            queue.release(target)
            assert acquired.wait(timeout=2)
            t.join(timeout=5)

    def test_read_no_lock(self):
        queue = FileMutationQueue()
        queue.acquire("/tmp/locked.txt")

        other_acquired = threading.Event()

        def reader():
            other_acquired.set()

        t = threading.Thread(target=reader)
        t.start()
        assert other_acquired.wait(timeout=2)
        t.join(timeout=5)

        queue.release("/tmp/locked.txt")
