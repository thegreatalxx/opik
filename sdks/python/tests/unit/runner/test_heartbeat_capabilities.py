import threading
from unittest.mock import MagicMock

import pytest

from opik.rest_api.types.local_runner_heartbeat_response import (
    LocalRunnerHeartbeatResponse,
)
from opik.runner.bridge_loop import BridgePollLoop
from opik.runner.in_process_loop import InProcessRunnerLoop


@pytest.fixture
def mock_api():
    api = MagicMock()
    api.runners.heartbeat = MagicMock(
        return_value=LocalRunnerHeartbeatResponse(cancelled_job_ids=[])
    )
    api.runners.next_job = MagicMock(return_value=None)
    api.runners.report_job_result = MagicMock()
    return api


@pytest.fixture
def shutdown_event():
    return threading.Event()


class TestHeartbeatCapabilities:
    def test_heartbeat__sends_capabilities(self, mock_api, shutdown_event):
        from pathlib import Path

        bridge_api = MagicMock()
        bridge_loop = BridgePollLoop(
            api=bridge_api,
            runner_id="r-1",
            repo_root=Path("/tmp"),
            handlers={},
            shutdown_event=shutdown_event,
        )

        call_count = 0

        def heartbeat_side_effect(runner_id, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count >= 1:
                shutdown_event.set()
            return LocalRunnerHeartbeatResponse(cancelled_job_ids=[])

        mock_api.runners.heartbeat.side_effect = heartbeat_side_effect

        loop = InProcessRunnerLoop(
            mock_api,
            "r-1",
            shutdown_event,
            heartbeat_interval_seconds=0.05,
            bridge_loop=bridge_loop,
        )

        t = threading.Thread(target=loop._heartbeat_loop)
        t.start()
        t.join(timeout=5)

        call_kwargs = mock_api.runners.heartbeat.call_args
        request_options = call_kwargs[1].get("request_options", {})
        caps = request_options.get("additional_body_parameters", {}).get(
            "capabilities"
        )
        assert caps == ["jobs", "bridge"]

    def test_heartbeat__sends_jobs_only_without_bridge(
        self, mock_api, shutdown_event
    ):
        call_count = 0

        def heartbeat_side_effect(runner_id, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count >= 1:
                shutdown_event.set()
            return LocalRunnerHeartbeatResponse(cancelled_job_ids=[])

        mock_api.runners.heartbeat.side_effect = heartbeat_side_effect

        loop = InProcessRunnerLoop(
            mock_api,
            "r-1",
            shutdown_event,
            heartbeat_interval_seconds=0.05,
        )

        t = threading.Thread(target=loop._heartbeat_loop)
        t.start()
        t.join(timeout=5)

        call_kwargs = mock_api.runners.heartbeat.call_args
        request_options = call_kwargs[1].get("request_options", {})
        caps = request_options.get("additional_body_parameters", {}).get(
            "capabilities"
        )
        assert caps == ["jobs"]

    def test_heartbeat__extracts_cancelled_command_ids(
        self, mock_api, shutdown_event
    ):
        from pathlib import Path

        bridge_api = MagicMock()
        bridge_loop = BridgePollLoop(
            api=bridge_api,
            runner_id="r-1",
            repo_root=Path("/tmp"),
            handlers={},
            shutdown_event=shutdown_event,
        )

        call_count = 0

        def heartbeat_side_effect(runner_id, **kwargs):
            nonlocal call_count
            call_count += 1
            resp = LocalRunnerHeartbeatResponse(
                cancelled_job_ids=[],
                cancelled_command_ids=["cmd-x", "cmd-y"],
            )
            if call_count >= 1:
                shutdown_event.set()
            return resp

        mock_api.runners.heartbeat.side_effect = heartbeat_side_effect

        loop = InProcessRunnerLoop(
            mock_api,
            "r-1",
            shutdown_event,
            heartbeat_interval_seconds=0.05,
            bridge_loop=bridge_loop,
        )

        t = threading.Thread(target=loop._heartbeat_loop)
        t.start()
        t.join(timeout=5)

        assert "cmd-x" in bridge_loop.cancelled_commands
        assert "cmd-y" in bridge_loop.cancelled_commands
