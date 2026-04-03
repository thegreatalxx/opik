"""Tests for RunnerTUI — inline display with Rich Live pending panel."""

import threading
from io import StringIO

from rich.console import Console

from opik.runner.tui import RunnerTUI


def _make_tui(*, is_tty: bool = True) -> tuple[RunnerTUI, StringIO]:
    buf = StringIO()
    console = Console(file=buf, force_terminal=is_tty, width=80)
    tui = RunnerTUI(console=console)
    return tui, buf


# --- App lines ---


class TestAppLine:
    def test_renders_with_gradient_border(self):
        tui, buf = _make_tui()
        tui.start()
        tui.app_line("hello world")
        tui.stop()
        output = buf.getvalue()
        assert "\u2503" in output
        assert "hello world" in output

    def test_goes_to_scrollback(self):
        tui, buf = _make_tui()
        tui.start()
        tui.app_line("line one")
        tui.app_line("line two")
        tui.stop()
        output = buf.getvalue()
        assert "line one" in output
        assert "line two" in output

    def test_stderr_same_format(self):
        tui, buf = _make_tui()
        tui.start()
        tui.app_line("stdout line", stream="stdout")
        tui.app_line("stderr line", stream="stderr")
        tui.stop()
        output = buf.getvalue()
        # Both have the gradient border
        lines = output.split("\n")
        stdout_lines = [l for l in lines if "stdout line" in l]
        stderr_lines = [l for l in lines if "stderr line" in l]
        assert len(stdout_lines) == 1
        assert len(stderr_lines) == 1
        assert "\u2503" in stdout_lines[0]
        assert "\u2503" in stderr_lines[0]


# --- Op lifecycle ---


class TestOpLifecycle:
    def test_op_start_appears_in_pending(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file src/agent.py")
        assert "cmd-1" in tui._pending_ops
        tui.stop()

    def test_op_start_gray_dot(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file src/agent.py")
        # The pending panel should contain the op with dim styling
        panel = tui._build_panel()
        assert "read_file src/agent.py" in panel.plain
        tui.stop()

    def test_op_end_success_promoted_to_scrollback(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file src/agent.py")
        tui.op_end("cmd-1", success=True)
        tui.stop()
        output = buf.getvalue()
        assert "\u2713" in output
        assert "read_file src/agent.py" in output

    def test_op_end_failure_promoted_to_scrollback(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "edit_file", "edit_file src/tools.py")
        tui.op_end("cmd-1", success=False, error="match_not_found")
        tui.stop()
        output = buf.getvalue()
        assert "\u2717" in output
        assert "edit_file src/tools.py" in output
        assert "match_not_found" in output

    def test_op_end_removes_from_pending(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file src/agent.py")
        tui.op_end("cmd-1", success=True)
        assert "cmd-1" not in tui._pending_ops
        tui.stop()

    def test_op_end_unknown_id_no_crash(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_end("nonexistent", success=True)
        tui.stop()


# --- Concurrent ops ---


class TestConcurrentOps:
    def test_multiple_ops_all_pending(self):
        tui, buf = _make_tui()
        tui.start()
        for i in range(5):
            tui.op_start(f"cmd-{i}", "read_file", f"read_file file{i}.py")
        assert len(tui._pending_ops) == 5
        tui.stop()

    def test_complete_out_of_order(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file a.py")
        tui.op_start("cmd-2", "read_file", "read_file b.py")
        tui.op_start("cmd-3", "read_file", "read_file c.py")
        # Complete middle one first
        tui.op_end("cmd-2", success=True)
        assert "cmd-2" not in tui._pending_ops
        assert "cmd-1" in tui._pending_ops
        assert "cmd-3" in tui._pending_ops
        tui.stop()

    def test_all_ops_complete_panel_empty(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file a.py")
        tui.op_start("cmd-2", "read_file", "read_file b.py")
        tui.op_end("cmd-1", success=True)
        tui.op_end("cmd-2", success=True)
        assert len(tui._pending_ops) == 0
        panel = tui._build_panel()
        assert panel.plain.strip() == ""
        tui.stop()


# --- Interleaving ---


class TestInterleaving:
    def test_app_lines_between_ops_correct_order(self):
        tui, buf = _make_tui()
        tui.start()
        tui.app_line("log 1")
        tui.op_start("cmd-1", "read_file", "read_file src/agent.py")
        tui.app_line("log 2")
        tui.op_end("cmd-1", success=True)
        tui.stop()
        output = buf.getvalue()
        pos_log1 = output.index("log 1")
        pos_log2 = output.index("log 2")
        pos_op = output.index("read_file src/agent.py")
        assert pos_log1 < pos_log2
        assert pos_log2 < pos_op


# --- Restart ---


class TestRestart:
    def test_child_restarted_prints_separator(self):
        tui, buf = _make_tui()
        tui.start()
        tui.child_restarted("file changed: src/agent.py")
        tui.stop()
        output = buf.getvalue()
        assert "Restarting..." in output

    def test_child_restarted_clears_pending(self):
        tui, buf = _make_tui()
        tui.start()
        tui.op_start("cmd-1", "read_file", "read_file a.py")
        tui.op_start("cmd-2", "read_file", "read_file b.py")
        tui.child_restarted("file changed")
        assert len(tui._pending_ops) == 0
        tui.stop()


# --- Non-TTY ---


class TestNonTTY:
    def test_no_live_panel(self):
        tui, buf = _make_tui(is_tty=False)
        tui.start()
        assert tui._live is None
        tui.op_start("cmd-1", "read_file", "read_file a.py")
        tui.op_end("cmd-1", success=True)
        tui.stop()
        output = buf.getvalue()
        assert "read_file a.py" in output

    def test_no_ansi(self):
        buf = StringIO()
        console = Console(file=buf, force_terminal=False, no_color=True, width=80)
        tui = RunnerTUI(console=console)
        tui.start()
        tui.app_line("plain output")
        tui.op_start("cmd-1", "read_file", "read_file a.py")
        tui.op_end("cmd-1", success=True)
        tui.stop()
        output = buf.getvalue()
        assert "\033[" not in output


# --- Thread safety ---


class TestThreadSafety:
    def test_concurrent_app_and_ops_no_crash(self):
        tui, buf = _make_tui()
        tui.start()
        errors = []

        def worker(i: int) -> None:
            try:
                tui.app_line(f"line from thread {i}")
                tui.op_start(f"cmd-{i}", "read_file", f"read_file f{i}.py")
                tui.op_end(f"cmd-{i}", success=(i % 2 == 0))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        tui.stop()
        assert not errors
