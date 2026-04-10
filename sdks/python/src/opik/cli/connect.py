import base64
import logging
import os
import platform
import shutil
import uuid
from pathlib import Path
from typing import Optional, Tuple

import click
import httpx

from opik import Opik
from opik.api_objects.rest_helpers import resolve_project_id_by_name
from opik.rest_api.client import OpikApi
from opik.rest_api.core.api_error import ApiError
from opik.rest_api.core.request_options import RequestOptions
from opik.runner.pake import PakeSession, generate_code
from opik.runner.supervisor import Supervisor
from opik.runner.tui import RunnerTUI

LOGGER = logging.getLogger(__name__)
_PAKE_TIMEOUT = 300.0
_PAKE_POLL_OPTIONS = RequestOptions(timeout_in_seconds=_PAKE_TIMEOUT + 10)
_PAKE_COMPLETE_OPTIONS = _PAKE_POLL_OPTIONS


def _validate_command(command: Tuple[str, ...]) -> None:
    if not command:
        return

    executable = command[0]
    resolved = executable if os.path.isfile(executable) else shutil.which(executable)
    if resolved is None:
        click.echo(f"Error: Command not found: '{executable}'", err=True)
        raise SystemExit(2)
    if not os.access(resolved, os.X_OK):
        click.echo(f"Error: Command is not executable: '{executable}'", err=True)
        raise SystemExit(2)


def _wait_for_pake_step(
    api: OpikApi,
    project_id: str,
    after_step: int,
    expected_role: str,
    expected_step: int,
    failure_msg: str,
    request_options: RequestOptions = _PAKE_POLL_OPTIONS,
) -> str:
    """Poll for a PAKE message matching role+step, raise ClickException on timeout or missing payload."""
    messages = api.runners.get_pake_messages(
        project_id=project_id,
        role="daemon",
        after_step=after_step,
        request_options=request_options,
    )
    matches = [
        m for m in messages if m.role == expected_role and m.step == expected_step
    ]
    if not matches:
        raise click.ClickException(failure_msg)

    payload = matches[0].payload
    if not payload:
        raise click.ClickException(f"{failure_msg} (empty payload)")
    return payload


def _run_pake_exchange(api: OpikApi, code: str, project_id: str) -> Tuple[str, bytes]:
    """Run the PAKE exchange (session must already be registered).

    Returns (project_name, shared_key).
    """
    session = PakeSession(code)
    outgoing_msg = session.start()

    api.runners.post_pake_message(
        project_id=project_id,
        role="daemon",
        step=0,
        payload=base64.b64encode(outgoing_msg).decode("ascii"),
    )

    browser_payload_b64 = _wait_for_pake_step(
        api,
        project_id,
        after_step=-1,
        expected_role="browser",
        expected_step=0,
        failure_msg="Pairing timed out. Check that the browser is connected and try again.",
    )
    try:
        browser_payload = base64.b64decode(browser_payload_b64)
    except Exception:
        raise click.ClickException("Invalid SPAKE2 message from browser (bad base64).")
    session.finish(browser_payload)

    api.runners.post_pake_message(
        project_id=project_id,
        role="daemon",
        step=1,
        payload=session.confirmation(),
    )

    browser_confirm = _wait_for_pake_step(
        api,
        project_id,
        after_step=0,
        expected_role="browser",
        expected_step=1,
        failure_msg="Key confirmation timed out. Check that the browser is connected and try again.",
    )
    if not session.verify_confirmation(browser_confirm):
        raise click.ClickException(
            "Key confirmation failed — possible man-in-the-middle attack. Aborting."
        )

    project_name = _wait_for_pake_step(
        api,
        project_id,
        after_step=1,
        expected_role="browser",
        expected_step=2,
        failure_msg="Pairing completion timed out. Browser did not complete pairing.",
        request_options=_PAKE_COMPLETE_OPTIONS,
    )

    return project_name, session.shared_key


_DEFAULT_SESSION_TTL = 24 * 3600


@click.command(context_settings={"ignore_unknown_options": True})
@click.option(
    "--project", "project_name", required=True, help="Project name to connect to."
)
@click.option("--name", default=None, help="Runner name.")
@click.option(
    "--ttl",
    "session_ttl",
    default=_DEFAULT_SESSION_TTL,
    type=int,
    help="Session TTL in seconds. Daemon shuts down after this duration. Default: 24h.",
)
@click.option(
    "--watch/--no-watch",
    default=None,
    help="Enable/disable file watcher. Auto-detected from command (e.g. --reload disables it).",
)
@click.argument("command", nargs=-1, type=click.UNPROCESSED)
@click.pass_context
def connect(
    ctx: click.Context,
    project_name: str,
    name: Optional[str],
    session_ttl: int,
    watch: Optional[bool],
    command: Tuple[str, ...],
) -> None:
    """Connect a local runner to Opik and launch a supervised process."""
    _validate_command(command)

    api_key = ctx.obj.get("api_key") if ctx.obj else None
    client = Opik(api_key=api_key, _show_misconfiguration_message=False)
    api = client.rest_client

    tui: Optional[RunnerTUI] = None
    try:
        runner_name = name or f"{platform.node()}-{uuid.uuid4().hex[:6]}"
        project_id = resolve_project_id_by_name(api, project_name)
        code = generate_code()

        register_result = api.runners.register_daemon_pair(
            project_id=project_id, runner_name=runner_name
        )
        runner_id = register_result.runner_id

        tui = RunnerTUI()
        tui.start()
        tui.print_banner(
            project_name=project_name,
            url=client.config.url_override,
        )

        tui.pairing_started(code, _PAKE_TIMEOUT)
        try:
            resolved_project_name, shared_key = _run_pake_exchange(
                api, code, project_id
            )
        except KeyboardInterrupt:
            tui.pairing_failed("interrupted")
            raise
        except Exception:
            tui.pairing_failed()
            raise
        tui.pairing_completed()

        env = {
            **os.environ,
            "OPIK_RUNNER_MODE": "true",
            "OPIK_RUNNER_ID": runner_id,
            "OPIK_PROJECT_NAME": resolved_project_name or project_name,
        }

        opik_logger = logging.getLogger("opik")
        opik_logger.handlers = [
            h
            for h in opik_logger.handlers
            if not isinstance(h, logging.StreamHandler)
            or isinstance(h, logging.FileHandler)
        ]

        supervisor = Supervisor(
            command=list(command) if command else None,
            env=env,
            repo_root=Path.cwd(),
            runner_id=runner_id,
            api=api,
            on_child_output=tui.app_line,
            on_child_restart=tui.child_restarted,
            on_error=tui.error,
            on_command_start=tui.op_start,
            on_command_end=tui.op_end,
            watch=watch,
            shared_key=shared_key,
            session_ttl=float(session_ttl),
        )
        supervisor.run()
    except KeyboardInterrupt:
        raise SystemExit(130)
    except ApiError as e:
        click.echo(f"Error: {e.body}" if e.body else f"Error: {e.status_code}")
        raise SystemExit(1)
    except httpx.ConnectError:
        click.echo(
            f"Error: Could not connect to Opik at {client.config.url_override}. "
            "Check that the backend is running."
        )
        raise SystemExit(1)
    except OSError as e:
        cmd_name = command[0] if command else "unknown"
        click.echo(f"Error: Could not execute command '{cmd_name}': {e}")
        raise SystemExit(1)
    finally:
        if tui is not None:
            tui.stop()
        client.end()
