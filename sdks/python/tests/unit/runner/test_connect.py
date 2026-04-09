from unittest.mock import MagicMock, patch

import httpx
from click.testing import CliRunner

from opik.cli.main import cli
from opik.rest_api.types.daemon_pair_register_response import DaemonPairRegisterResponse
from opik.rest_api.types.pake_message_response import PakeMessageResponse


def _mock_api(mock_opik_cls):
    """Set up Opik mock with project lookup and runner API."""
    client = MagicMock()
    api = MagicMock()

    project = MagicMock()
    project.id = "proj-123"
    api.projects.get_projects.return_value = MagicMock(content=[project])

    api.runners.register_daemon_pair.return_value = DaemonPairRegisterResponse(
        runner_id="r-abc",
        expires_in_seconds=300,
    )

    client.rest_client = api
    mock_opik_cls.return_value = client
    return client, api


def _mock_pake_messages(api):
    """Set up poll responses for a successful PAKE exchange."""
    api.runners.get_pake_messages.side_effect = [
        [PakeMessageResponse(role="browser", step=0, payload="c3Bha2UyLW1zZy1i")],
        [PakeMessageResponse(role="browser", step=1, payload="fake-confirm-B")],
        [PakeMessageResponse(role="browser", step=2, payload="my-project")],
    ]


class TestConnect:
    @patch("opik.cli.connect.RunnerTUI")
    @patch("opik.cli.connect.Supervisor")
    @patch("opik.cli.connect.PakeSession")
    @patch("opik.cli.connect.Opik")
    def test_connect__pake_flow__creates_supervisor(
        self, mock_opik_cls, mock_pake_cls, mock_supervisor_cls, mock_tui_cls
    ):
        client, api = _mock_api(mock_opik_cls)
        _mock_pake_messages(api)

        session = MagicMock()
        session.start.return_value = b"spake2-msg-a"
        session.finish.return_value = b"shared-key"
        session.shared_key = b"shared-key"
        session.confirmation.return_value = "confirm-A-hex"
        session.verify_confirmation.return_value = True
        mock_pake_cls.return_value = session

        runner = CliRunner()
        result = runner.invoke(
            cli, ["connect", "--project", "my-project", "echo", "hello"]
        )
        assert result.exit_code == 0, result.output

        api.runners.register_daemon_pair.assert_called_once_with(
            project_id="proj-123",
            runner_name=api.runners.register_daemon_pair.call_args[1]["runner_name"],
        )

        mock_supervisor_cls.assert_called_once()
        call_kwargs = mock_supervisor_cls.call_args[1]
        assert call_kwargs["command"] == ["echo", "hello"]
        assert call_kwargs["shared_key"] == b"shared-key"
        assert call_kwargs["runner_id"] == "r-abc"
        env = call_kwargs["env"]
        assert env["OPIK_RUNNER_MODE"] == "true"
        assert env["OPIK_RUNNER_ID"] == "r-abc"
        assert env["OPIK_PROJECT_NAME"] == "my-project"

        tui_instance = mock_tui_cls.return_value
        assert call_kwargs["on_child_restart"] == tui_instance.child_restarted
        assert call_kwargs["on_error"] == tui_instance.error

        mock_supervisor_cls.return_value.run.assert_called_once()

    @patch("opik.cli.connect.RunnerTUI")
    @patch("opik.cli.connect.Supervisor")
    @patch("opik.cli.connect.PakeSession")
    @patch("opik.cli.connect.Opik")
    def test_connect__network_failure__shows_clean_error(
        self, mock_opik_cls, mock_pake_cls, mock_supervisor_cls, mock_tui_cls
    ):
        client, api = _mock_api(mock_opik_cls)
        config = MagicMock()
        config.url_override = "https://api.test"
        client.config = config

        api.runners.register_daemon_pair.side_effect = httpx.ConnectError(
            "Connection refused"
        )

        session = MagicMock()
        session.start.return_value = b"msg"
        mock_pake_cls.return_value = session

        runner = CliRunner()
        result = runner.invoke(
            cli, ["connect", "--project", "my-project", "echo", "hello"]
        )
        assert result.exit_code != 0
        assert "Could not connect to Opik at https://api.test" in result.output

    @patch("opik.cli.connect.RunnerTUI")
    @patch("opik.cli.connect.Supervisor")
    @patch("opik.cli.connect.PakeSession")
    @patch("opik.cli.connect.Opik")
    def test_connect__no_command__standalone_mode(
        self, mock_opik_cls, mock_pake_cls, mock_supervisor_cls, mock_tui_cls
    ):
        client, api = _mock_api(mock_opik_cls)
        _mock_pake_messages(api)

        session = MagicMock()
        session.start.return_value = b"spake2-msg-a"
        session.finish.return_value = b"shared-key"
        session.shared_key = b"shared-key"
        session.confirmation.return_value = "confirm-A-hex"
        session.verify_confirmation.return_value = True
        mock_pake_cls.return_value = session

        runner = CliRunner()
        result = runner.invoke(cli, ["connect", "--project", "my-project"])
        assert result.exit_code == 0, result.output

        mock_supervisor_cls.assert_called_once()
        assert mock_supervisor_cls.call_args[1]["command"] is None

    @patch("opik.cli.connect.RunnerTUI")
    @patch("opik.cli.connect.PakeSession")
    @patch("opik.cli.connect.Opik")
    def test_connect__key_confirmation_fails__shows_error(
        self, mock_opik_cls, mock_pake_cls, mock_tui_cls
    ):
        client, api = _mock_api(mock_opik_cls)
        api.runners.get_pake_messages.side_effect = [
            [PakeMessageResponse(role="browser", step=0, payload="c3Bha2UyLW1zZy1i")],
            [PakeMessageResponse(role="browser", step=1, payload="bad-confirm")],
        ]

        session = MagicMock()
        session.start.return_value = b"spake2-msg-a"
        session.finish.return_value = b"shared-key"
        session.shared_key = b"shared-key"
        session.confirmation.return_value = "confirm-A-hex"
        session.verify_confirmation.return_value = False
        mock_pake_cls.return_value = session

        runner = CliRunner()
        result = runner.invoke(
            cli, ["connect", "--project", "my-project", "echo", "hello"]
        )
        assert result.exit_code != 0
        assert "Key confirmation failed" in result.output

    def test_connect__no_project__shows_error(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["connect", "echo", "hello"])
        assert result.exit_code == 2
        assert "--project" in result.output
