"""CLI command: opik connect — standalone bridge daemon."""

from typing import Optional

import click

from ._run import run_cli_session
from .pairing import RunnerType


@click.command()
@click.option("--project", "project_name", required=True, help="Opik project name.")
@click.option("--name", default=None, help="Runner name.")
@click.option(
    "--workspace",
    default=None,
    help="Opik workspace name. Overrides OPIK_WORKSPACE and config file.",
)
@click.option(
    "--api-key",
    "local_api_key",
    default=None,
    help="Opik API key. Overrides global --api-key and OPIK_API_KEY env var.",
)
@click.pass_context
def connect(
    ctx: click.Context,
    project_name: str,
    name: Optional[str],
    workspace: Optional[str],
    local_api_key: Optional[str],
) -> None:
    """Connect a local bridge daemon to Opik."""
    api_key = local_api_key or (ctx.obj.get("api_key") if ctx.obj else None)
    run_cli_session(
        project_name=project_name,
        name=name,
        runner_type=RunnerType.CONNECT,
        api_key=api_key,
        workspace=workspace,
    )
