import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from opik.runner.supervisor import Supervisor


def _make_supervisor(
    tmp_path,
    command=None,
    on_child_output=None,
):
    api = MagicMock()
    api.runners.heartbeat = MagicMock(
        return_value=MagicMock(cancelled_job_ids=[], cancelled_command_ids=[])
    )
    env = {
        **os.environ,
        "OPIK_RUNNER_MODE": "true",
        "OPIK_RUNNER_ID": "r-test",
        "OPIK_PROJECT_NAME": "test-project",
    }
    return Supervisor(
        command=command or [sys.executable, "-c", "import time; time.sleep(60)"],
        env=env,
        repo_root=tmp_path,
        runner_id="r-test",
        api=api,
        on_child_output=on_child_output,
    )


class TestChildLifecycle:
    def test_start_child__launches_process(self, tmp_path):
        sup = _make_supervisor(tmp_path, command=[sys.executable, "-c", "print('hi')"])
        child = sup._start_child()
        assert child.pid > 0
        child.wait(timeout=5)

    def test_start_child__env_includes_runner_vars(self, tmp_path):
        lines = []

        def callback(stream, line):
            lines.append(line)

        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import os; print(os.environ['OPIK_RUNNER_ID'])"],
            on_child_output=callback,
        )
        child = sup._start_child()
        child.wait(timeout=5)
        time.sleep(0.2)
        assert any("r-test" in l for l in lines)

    def test_start_child__captures_stdout(self, tmp_path):
        lines = []

        def callback(stream, line):
            lines.append((stream, line))

        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "print('hello from child')"],
            on_child_output=callback,
        )
        child = sup._start_child()
        child.wait(timeout=5)
        time.sleep(0.2)
        assert any("hello from child" in l[1] for l in lines)
        assert any(l[0] == "stdout" for l in lines)

    def test_start_child__captures_stderr(self, tmp_path):
        lines = []

        def callback(stream, line):
            lines.append((stream, line))

        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import sys; print('err msg', file=sys.stderr)"],
            on_child_output=callback,
        )
        child = sup._start_child()
        child.wait(timeout=5)
        time.sleep(0.2)
        assert any("err msg" in l[1] for l in lines)
        assert any(l[0] == "stderr" for l in lines)

    def test_stop_child__sigterm_then_wait(self, tmp_path):
        sup = _make_supervisor(tmp_path)
        sup._start_child()
        exit_code = sup._stop_child(graceful_timeout=5)
        assert exit_code is not None

    def test_stop_child__sigkill_after_timeout(self, tmp_path):
        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)"],
        )
        sup._start_child()
        time.sleep(0.3)
        exit_code = sup._stop_child(graceful_timeout=1)
        assert exit_code is not None

    def test_stop_child__already_dead__no_error(self, tmp_path):
        sup = _make_supervisor(
            tmp_path, command=[sys.executable, "-c", "pass"]
        )
        sup._start_child()
        time.sleep(0.5)
        exit_code = sup._stop_child()
        assert exit_code is not None


class TestRestart:
    def test_restart__stops_and_starts(self, tmp_path):
        sup = _make_supervisor(tmp_path)
        old_child = sup._start_child()
        old_pid = old_child.pid
        sup._restart_child("test restart")
        with sup._child_lock:
            new_child = sup._child
        assert new_child is not None
        assert new_child.pid != old_pid
        sup._stop_child()

    def test_restart__debounce__multiple_triggers_one_restart(self, tmp_path):
        sup = _make_supervisor(tmp_path)
        sup._start_child()
        first_pid = sup._child.pid

        sup._restart_child("trigger 1")
        second_pid = sup._child.pid
        sup._restart_child("trigger 2")  # debounced
        third_pid = sup._child.pid

        assert second_pid != first_pid
        assert third_pid == second_pid
        sup._stop_child()


class TestChildExit:
    def test_child_exit__restarts_if_stable(self, tmp_path):
        pids = []

        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import sys; sys.exit(1)"],
        )
        sup._stability_guard._max_crashes = 5

        def run_sup():
            sup.run()

        t = threading.Thread(target=run_sup)
        t.start()
        time.sleep(3)
        sup._shutdown_event.set()
        t.join(timeout=10)

    def test_child_exit__exit_0__no_restart(self, tmp_path):
        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "pass"],
        )

        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)
        assert sup._shutdown_event.is_set()


class TestShutdown:
    def test_shutdown__stops_all(self, tmp_path):
        sup = _make_supervisor(tmp_path)

        def run_then_shutdown():
            time.sleep(1)
            sup._shutdown_event.set()

        threading.Thread(target=run_then_shutdown, daemon=True).start()
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)

        with sup._child_lock:
            assert sup._child is None

    def test_shutdown__child_already_dead__clean_exit(self, tmp_path):
        sup = _make_supervisor(
            tmp_path, command=[sys.executable, "-c", "pass"]
        )
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)


class TestBridgeIntegration:
    def test_supervisor__bridge_loop_runs(self, tmp_path):
        sup = _make_supervisor(tmp_path)

        def check_and_stop():
            time.sleep(1.5)
            assert sup._bridge_loop is not None
            sup._shutdown_event.set()

        threading.Thread(target=check_and_stop, daemon=True).start()
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)

    def test_supervisor__bridge_loop_survives_child_restart(self, tmp_path):
        sup = _make_supervisor(tmp_path)

        def restart_then_stop():
            time.sleep(1)
            bridge = sup._bridge_loop
            sup._restart_child("test")
            time.sleep(0.5)
            assert sup._bridge_loop is bridge  # same object, still alive
            sup._shutdown_event.set()

        threading.Thread(target=restart_then_stop, daemon=True).start()
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)


class TestEditCrashRecovery:
    def test_edit_crash__waits_for_fix_instead_of_shutdown(self, tmp_path):
        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import sys; sys.exit(1)"],
        )
        sup._stability_guard.last_restart_was_edit = True

        def stop_after_wait():
            time.sleep(2)
            assert sup._stability_guard.waiting_for_fix is True
            assert not sup._shutdown_event.is_set()
            sup._shutdown_event.set()

        threading.Thread(target=stop_after_wait, daemon=True).start()
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)

    def test_edit_crash__file_change_triggers_retry(self, tmp_path):
        call_count = {"n": 0}
        orig_command = [sys.executable, "-c", "import sys; sys.exit(1)"]

        sup = _make_supervisor(tmp_path, command=orig_command)
        sup._stability_guard.last_restart_was_edit = True

        def simulate_fix():
            time.sleep(1.5)
            if sup._stability_guard.waiting_for_fix:
                sup._command = [sys.executable, "-c", "import time; time.sleep(60)"]
                sup._stability_guard.waiting_for_fix = False
                sup._stability_guard.last_restart_was_edit = True
                sup._restart_child("file changed: app.py")
                time.sleep(1)
                sup._shutdown_event.set()

        threading.Thread(target=simulate_fix, daemon=True).start()
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=15)

        with sup._child_lock:
            child = sup._child
        if child and child.poll() is None:
            child.kill()

    def test_non_edit_crash__still_uses_stability_guard(self, tmp_path):
        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import sys; sys.exit(1)"],
        )
        # last_restart_was_edit is False by default

        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=15)

        assert sup._shutdown_event.is_set()

    def test_stderr_captured_on_crash(self, tmp_path):
        sup = _make_supervisor(
            tmp_path,
            command=[sys.executable, "-c", "import sys; print('boom', file=sys.stderr); sys.exit(1)"],
        )
        sup._stability_guard.last_restart_was_edit = True

        def stop_after_crash():
            time.sleep(2)
            sup._shutdown_event.set()

        threading.Thread(target=stop_after_crash, daemon=True).start()
        t = threading.Thread(target=sup.run)
        t.start()
        t.join(timeout=10)

        tail = sup._get_stderr_tail()
        assert "boom" in tail
