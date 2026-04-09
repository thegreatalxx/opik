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
from opik.rest_api.client import OpikApi
from opik.rest_api.core.api_error import ApiError
from opik.rest_api.core.request_options import RequestOptions
from opik.runner.pake import PakeSession, generate_code
from opik.runner.supervisor import Supervisor
from opik.runner.tui import RunnerTUI

LOGGER = logging.getLogger(__name__)
_PAKE_TIMEOUT = 30.0
_PAKE_POLL_OPTIONS = RequestOptions(timeout_in_seconds=_PAKE_TIMEOUT + 10)
_PAKE_COMPLETE_OPTIONS = RequestOptions(timeout_in_seconds=310)


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


def _resolve_project_id(api: OpikApi, project_name: str) -> str:
    resp = api.projects.get_projects(name=project_name)
    if resp.content:
        return str(resp.content[0].id)
    raise click.ClickException(f"Project '{project_name}' not found")


def _run_pake_exchange(
    api: OpikApi, code: str, project_id: str, runner_name: str
) -> Tuple[str, str, bytes]:
    """Run the full PAKE exchange and return (runner_id, project_name, shared_key)."""

    result = api.runners.register_daemon_pair(
        project_id=project_id, runner_name=runner_name
    )
    runner_id = result.runner_id

    session = PakeSession(code)
    outgoing_msg = session.start()

    api.runners.post_pake_message(
        project_id=project_id,
        role="daemon",
        step=0,
        payload=base64.b64encode(outgoing_msg).decode("ascii"),
    )

    messages = api.runners.get_pake_messages(
        project_id=project_id,
        role="daemon",
        after_step=-1,
        request_options=_PAKE_POLL_OPTIONS,
    )
    browser_msgs = [m for m in messages if m.role == "browser" and m.step == 0]
    if not browser_msgs:
        raise click.ClickException(
            "Pairing timed out. Check that the browser is connected and try again."
        )

    browser_payload = base64.b64decode(browser_msgs[0].payload)
    session.finish(browser_payload)

    api.runners.post_pake_message(
        project_id=project_id,
        role="daemon",
        step=1,
        payload=session.confirmation(),
    )

    confirm_msgs = api.runners.get_pake_messages(
        project_id=project_id,
        role="daemon",
        after_step=0,
        request_options=_PAKE_POLL_OPTIONS,
    )
    browser_confirms = [m for m in confirm_msgs if m.role == "browser" and m.step == 1]
    if not browser_confirms:
        raise click.ClickException(
            "Key confirmation timed out. Check that the browser is connected and try again."
        )

    if not session.verify_confirmation(browser_confirms[0].payload):
        raise click.ClickException(
            "Key confirmation failed — possible man-in-the-middle attack. Aborting."
        )

    complete_msgs = api.runners.get_pake_messages(
        project_id=project_id,
        role="daemon",
        after_step=1,
        request_options=_PAKE_COMPLETE_OPTIONS,
    )
    complete_data = [m for m in complete_msgs if m.step == 2]
    if not complete_data:
        raise click.ClickException(
            "Pairing completion timed out. Browser did not complete pairing."
        )

    project_name = complete_data[0].payload or ""

    return runner_id, project_name, session.shared_key


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

    try:
        runner_name = name or f"{platform.node()}-{uuid.uuid4().hex[:6]}"
        project_id = _resolve_project_id(api, project_name)
        code = generate_code()

        tui = RunnerTUI()
        tui.start()

        click.echo(f"\n  Pairing code: {code}")
        click.echo("  Enter this code in Ollie to start your session.")
        click.echo("  Expires in 5 minutes.\n")

        runner_id, resolved_project_name, shared_key = _run_pake_exchange(
            api, code, project_id, runner_name
        )

        tui.print_banner(
            runner_id,
            resolved_project_name or project_name,
            url=client.config.url_override,
        )

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
            on_command_start=tui.op_start,
            on_command_end=tui.op_end,
            watch=watch,
            shared_key=shared_key,
            session_ttl=float(session_ttl),
        )
        try:
            supervisor.run()
        finally:
            tui.stop()
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
        client.end()
