"""Tests for bridge command op summary formatting."""

from opik.runner.bridge_api import BridgeCommand
from opik.runner.bridge_loop import _build_op_summary


def _cmd(type: str, **args: object) -> BridgeCommand:
    return BridgeCommand(
        command_id="test-id",
        type=type,
        args=args,
        timeout_seconds=30,
        submitted_at="",
    )


class TestOpSummary:
    def test_read_file_shows_path(self):
        assert _build_op_summary(_cmd("read_file", path="src/agent.py")) == "ReadFile src/agent.py"

    def test_edit_file_shows_edit_count(self):
        edits = [{"old": "a", "new": "b"}, {"old": "c", "new": "d"}]
        assert _build_op_summary(_cmd("edit_file", path="src/agent.py", edits=edits)) == "EditFile src/agent.py (2 edits)"

    def test_edit_file_single_edit(self):
        edits = [{"old": "a", "new": "b"}]
        assert _build_op_summary(_cmd("edit_file", path="src/agent.py", edits=edits)) == "EditFile src/agent.py (1 edit)"

    def test_search_files_shows_pattern(self):
        assert _build_op_summary(_cmd("search_files", pattern="@opik.track")) == "SearchFiles @opik.track"

    def test_list_files_shows_pattern(self):
        assert _build_op_summary(_cmd("list_files", pattern="**/*.py")) == "ListFiles **/*.py"

    def test_write_file_shows_path(self):
        assert _build_op_summary(_cmd("write_file", path="src/new.py")) == "WriteFile src/new.py"

    def test_run_agent_shows_name(self):
        assert _build_op_summary(_cmd("run_agent", name="moderate_content")) == "RunAgent moderate_content"

    def test_unknown_type_returns_type(self):
        assert _build_op_summary(_cmd("some_future_cmd")) == "SomeFutureCmd"
