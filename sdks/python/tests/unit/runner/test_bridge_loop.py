import threading
import time
from unittest.mock import MagicMock, patch

import pytest

from opik.rest_api.core.api_error import ApiError
from opik.runner.bridge_api import BridgeCommand
from opik.runner.bridge_handlers import CommandError, StubHandler
from opik.runner.bridge_loop import BridgePollLoop


def _make_command(command_id="cmd-1", type="read_file", args=None, timeout=30):
    return BridgeCommand(
        command_id=command_id,
        type=type,
        args=args or {"path": "test.py"},
        timeout_seconds=timeout,
        submitted_at="2026-04-01T10:00:00Z",
    )


@pytest.fixture
def mock_api():
    api = MagicMock()
    api.next_bridge_commands = MagicMock(return_value=[])
    api.report_bridge_result = MagicMock()
    return api


@pytest.fixture
def shutdown_event():
    return threading.Event()


@pytest.fixture
def loop(mock_api, shutdown_event):
    from pathlib import Path

    stub = StubHandler()
    return BridgePollLoop(
        api=mock_api,
        runner_id="r-1",
        repo_root=Path("/tmp"),
        handlers={"read_file": stub},
        shutdown_event=shutdown_event,
        backoff_cap_seconds=0.01,
    )


class TestPolling:
    def test_poll__no_commands__loops(self, mock_api, shutdown_event, loop):
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count >= 3:
                shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        assert call_count >= 3

    def test_poll__single_command__dispatches_and_reports(
        self, mock_api, shutdown_event, loop
    ):
        cmd = _make_command()
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        mock_api.report_bridge_result.assert_called_once()
        call_args = mock_api.report_bridge_result.call_args
        assert call_args[0][1] == "cmd-1"  # command_id positional
        assert call_args[1]["status"] == "failed"
        assert call_args[1]["error"]["code"] == "not_implemented"

    def test_poll__batch_commands__dispatches_all(
        self, mock_api, shutdown_event, loop
    ):
        cmds = [_make_command(f"cmd-{i}") for i in range(3)]
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return cmds
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        assert mock_api.report_bridge_result.call_count == 3

    def test_poll__network_error__backs_off(self, mock_api, shutdown_event, loop):
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("fail")
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        assert call_count >= 2

    def test_poll__410_evicted__stops_loop(self, mock_api, shutdown_event, loop):
        mock_api.next_bridge_commands.side_effect = ApiError(status_code=410)

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        assert shutdown_event.is_set()

    def test_poll__shutdown_event__stops_loop(self, mock_api, shutdown_event, loop):
        def side_effect(runner_id, max_commands=10):
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        assert not t.is_alive()


class TestDispatch:
    def test_dispatch__read_commands__parallel(self, mock_api, shutdown_event, loop):
        thread_ids = []
        barrier = threading.Barrier(3, timeout=5)

        class SlowHandler:
            def execute(self, args, timeout):
                thread_ids.append(threading.current_thread().ident)
                barrier.wait()
                return {"content": "ok"}

        loop._handlers["read_file"] = SlowHandler()
        cmds = [_make_command(f"cmd-{i}") for i in range(3)]
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return cmds
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=10)

        assert len(set(thread_ids)) == 3

    def test_dispatch__handler_exception__reports_failed(
        self, mock_api, shutdown_event, loop
    ):
        class FailingHandler:
            def execute(self, args, timeout):
                raise RuntimeError("boom")

        loop._handlers["read_file"] = FailingHandler()
        cmd = _make_command()
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        call_kwargs = mock_api.report_bridge_result.call_args.kwargs
        assert call_kwargs["status"] == "failed"
        assert call_kwargs["error"]["code"] == "internal_error"

    def test_dispatch__unknown_type__reports_not_implemented(
        self, mock_api, shutdown_event, loop
    ):
        cmd = _make_command(type="unknown_cmd")
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        call_kwargs = mock_api.report_bridge_result.call_args.kwargs
        assert call_kwargs["status"] == "failed"
        assert call_kwargs["error"]["code"] == "not_implemented"


class TestCancellation:
    def test_dispatch__cancelled_command__skipped(
        self, mock_api, shutdown_event, loop
    ):
        cmd = _make_command()
        loop.add_cancelled_commands(["cmd-1"])
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        call_kwargs = mock_api.report_bridge_result.call_args.kwargs
        assert call_kwargs["status"] == "cancelled"

    def test_cancelled_set__populated_from_heartbeat(self, shutdown_event):
        from pathlib import Path

        api = MagicMock()
        loop = BridgePollLoop(
            api=api,
            runner_id="r-1",
            repo_root=Path("/tmp"),
            handlers={},
            shutdown_event=shutdown_event,
        )

        loop.add_cancelled_commands(["cmd-a", "cmd-b"])
        assert "cmd-a" in loop.cancelled_commands
        assert "cmd-b" in loop.cancelled_commands


class TestResultReporting:
    def test_report__success__calls_api(self, mock_api, shutdown_event, loop):
        class OkHandler:
            def execute(self, args, timeout):
                return {"content": "hello"}

        loop._handlers["read_file"] = OkHandler()
        cmd = _make_command()
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        call_kwargs = mock_api.report_bridge_result.call_args.kwargs
        assert call_kwargs["status"] == "completed"
        assert call_kwargs["result"] == {"content": "hello"}
        assert call_kwargs["duration_ms"] is not None

    def test_report__network_error__retries(self, mock_api, shutdown_event, loop):
        class OkHandler:
            def execute(self, args, timeout):
                return {"content": "ok"}

        loop._handlers["read_file"] = OkHandler()
        report_calls = 0

        def report_side_effect(*args, **kwargs):
            nonlocal report_calls
            report_calls += 1
            if report_calls == 1:
                raise ConnectionError("fail")

        mock_api.report_bridge_result.side_effect = report_side_effect
        cmd = _make_command()
        call_count = 0

        def poll_side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = poll_side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=10)

        assert report_calls >= 2

    def test_report__all_retries_fail__logs_and_continues(
        self, mock_api, shutdown_event, loop
    ):
        class OkHandler:
            def execute(self, args, timeout):
                return {"content": "ok"}

        loop._handlers["read_file"] = OkHandler()
        mock_api.report_bridge_result.side_effect = ConnectionError("fail")
        cmd = _make_command()
        call_count = 0

        def poll_side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = poll_side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=15)

        assert mock_api.report_bridge_result.call_count == 3
        assert not t.is_alive()

    def test_report__409_duplicate__swallowed(self, mock_api, shutdown_event, loop):
        class OkHandler:
            def execute(self, args, timeout):
                return {"content": "ok"}

        loop._handlers["read_file"] = OkHandler()
        mock_api.report_bridge_result.side_effect = ApiError(status_code=409)
        cmd = _make_command()
        call_count = 0

        def poll_side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = poll_side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=5)

        assert mock_api.report_bridge_result.call_count == 1


class TestShutdown:
    def test_shutdown__waits_for_inflight(self, mock_api, shutdown_event, loop):
        completed = threading.Event()

        class SlowHandler:
            def execute(self, args, timeout):
                time.sleep(0.2)
                completed.set()
                return {"content": "ok"}

        loop._handlers["read_file"] = SlowHandler()
        cmd = _make_command()
        call_count = 0

        def side_effect(runner_id, max_commands=10):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [cmd]
            shutdown_event.set()
            return []

        mock_api.next_bridge_commands.side_effect = side_effect

        t = threading.Thread(target=loop.run)
        t.start()
        t.join(timeout=10)

        assert completed.is_set()
        call_kwargs = mock_api.report_bridge_result.call_args.kwargs
        assert call_kwargs["status"] == "completed"
