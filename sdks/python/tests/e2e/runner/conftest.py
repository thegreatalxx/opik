import base64
import dataclasses
import hashlib
import hmac as _hmac
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time

import pytest
from spake2 import SPAKE2_B

import opik
import opik.api_objects.opik_client
from opik.api_objects import rest_helpers
from opik.rest_api import core as rest_api_core
from opik.rest_api.core.request_options import RequestOptions
from ..conftest import OPIK_E2E_TESTS_PROJECT_NAME


ECHO_APP = os.path.join(os.path.dirname(__file__), "echo_app.py")
OPIK_CLI = shutil.which("opik") or "opik"

RUNNER_STARTUP_TIMEOUT = 15
PAKE_TIMEOUT = 15

_phase_report_key = pytest.StashKey[dict]()


@dataclasses.dataclass
class RunnerInfo:
    runner_id: str
    process: subprocess.Popen
    output_lines: list
    shared_key: bytes


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    item.stash.setdefault(_phase_report_key, {})[rep.when] = rep


@pytest.fixture()
def opik_client(configure_e2e_tests_env, shutdown_cached_client_after_test):
    client = opik.api_objects.opik_client.Opik(batching=True)
    yield client
    client.end()


@pytest.fixture()
def api_client(opik_client):
    return opik_client.rest_client


@pytest.fixture()
def subprocess_env(opik_client):
    cfg = opik_client.config
    env = os.environ.copy()
    env["OPIK_URL_OVERRIDE"] = cfg.url_override
    if cfg.api_key:
        env["OPIK_API_KEY"] = cfg.api_key
    if cfg.workspace:
        env["OPIK_WORKSPACE"] = cfg.workspace
    return env


@pytest.fixture()
def project_id(api_client):
    try:
        api_client.projects.create_project(name=OPIK_E2E_TESTS_PROJECT_NAME)
    except rest_api_core.ApiError:
        pass
    return rest_helpers.resolve_project_id_by_name(
        api_client, OPIK_E2E_TESTS_PROJECT_NAME
    )


def _drain_stdout(proc, output_lines):
    for line in proc.stdout:
        output_lines.append(line.rstrip())


def _wait_for_pattern(output_lines, pattern, deadline):
    while time.monotonic() < deadline:
        for line in list(output_lines):
            match = re.search(pattern, line)
            if match:
                return match
        time.sleep(0.1)
    return None


def _browser_pake_exchange(api_client, project_id, code):
    """Perform the browser side of the PAKE exchange. Returns shared_key."""
    poll_opts = RequestOptions(timeout_in_seconds=PAKE_TIMEOUT + 10)

    daemon_msgs = api_client.runners.get_pake_messages(
        project_id=project_id,
        role="browser",
        after_step=-1,
        request_options=poll_opts,
    )
    daemon_step0 = [m for m in daemon_msgs if m.role == "daemon" and m.step == 0]
    assert daemon_step0, "No daemon SPAKE2 message received"

    daemon_payload = base64.b64decode(daemon_step0[0].payload)

    browser_spake = SPAKE2_B(code.encode("utf-8"))
    browser_msg = browser_spake.start()

    api_client.runners.post_pake_message(
        project_id=project_id,
        role="browser",
        step=0,
        payload=base64.b64encode(browser_msg).decode("ascii"),
    )

    browser_key = browser_spake.finish(daemon_payload)

    # Key confirmation
    confirm_msgs = api_client.runners.get_pake_messages(
        project_id=project_id,
        role="browser",
        after_step=0,
        request_options=poll_opts,
    )
    daemon_confirms = [m for m in confirm_msgs if m.role == "daemon" and m.step == 1]
    assert daemon_confirms, "No daemon confirmation received"

    expected_confirm_a = _hmac.new(
        browser_key, b"confirm-A", hashlib.sha256
    ).hexdigest()
    assert _hmac.compare_digest(expected_confirm_a, daemon_confirms[0].payload), (
        "Daemon key confirmation failed"
    )

    browser_confirm_b = _hmac.new(browser_key, b"confirm-B", hashlib.sha256).hexdigest()
    api_client.runners.post_pake_message(
        project_id=project_id,
        role="browser",
        step=1,
        payload=browser_confirm_b,
    )

    return browser_key


def sign_command(shared_key, command_id, cmd_type, args):
    """Sign a bridge command with the shared PAKE key."""
    canonical = json.dumps(args, sort_keys=True, separators=(",", ":"))
    message = f"{command_id}|{cmd_type}|{canonical}"
    return _hmac.new(shared_key, message.encode("utf-8"), hashlib.sha256).hexdigest()


@pytest.fixture()
def runner_process(api_client, subprocess_env, project_id, request):
    """Start daemon with --project, perform browser-side PAKE, yield RunnerInfo with shared_key."""

    proc = subprocess.Popen(
        [
            OPIK_CLI,
            "connect",
            "--project",
            OPIK_E2E_TESTS_PROJECT_NAME,
            sys.executable,
            ECHO_APP,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=subprocess_env,
    )

    output_lines = []
    drain_thread = threading.Thread(
        target=_drain_stdout, args=(proc, output_lines), daemon=True
    )
    drain_thread.start()

    deadline = time.monotonic() + RUNNER_STARTUP_TIMEOUT

    # Wait for pairing code
    match = _wait_for_pattern(
        output_lines, r"Pairing code: ([A-HJ-NP-Z2-9]{6})", deadline
    )
    if match is None:
        proc.terminate()
        proc.wait(timeout=5)
        drain_thread.join(timeout=5)
        pytest.fail(
            f"Pairing code not found within {RUNNER_STARTUP_TIMEOUT}s.\n"
            f"Output:\n" + "\n".join(output_lines)
        )

    code = match.group(1)

    # Browser-side PAKE exchange
    shared_key = _browser_pake_exchange(api_client, project_id, code)

    # Complete pairing
    connect_resp = api_client.runners.complete_pairing(project_id=project_id)
    runner_id = connect_resp.runner_id

    # Wait for daemon to show runner ID (confirms it picked up completion)
    runner_match = _wait_for_pattern(
        output_lines, r"runner: (\S+)", time.monotonic() + PAKE_TIMEOUT
    )
    if runner_match is None:
        proc.terminate()
        proc.wait(timeout=5)
        drain_thread.join(timeout=5)
        pytest.fail(
            "Daemon did not complete pairing.\nOutput:\n" + "\n".join(output_lines)
        )

    info = RunnerInfo(
        runner_id=runner_id,
        process=proc,
        output_lines=output_lines,
        shared_key=shared_key,
    )

    yield info

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    drain_thread.join(timeout=5)

    report = request.node.stash.get(_phase_report_key, {})
    if report.get("call") and report["call"].failed:
        print(f"\n--- Runner output (runner_id={runner_id}) ---")
        print("\n".join(output_lines))
        print("--- End runner output ---")
