from unittest.mock import MagicMock, patch

import pytest

from opik.rest_api.types.local_runner_connect_response import (
    LocalRunnerConnectResponse,
)


class TestConnectRewrite:
    @patch("opik.cli.connect.Supervisor")
    @patch("opik.cli.connect.Opik")
    def test_connect__creates_supervisor(self, mock_opik_cls, mock_sup_cls):
        from click.testing import CliRunner

        from opik.cli.connect import connect

        mock_client = MagicMock()
        mock_opik_cls.return_value = mock_client
        mock_client.rest_client.runners.connect_runner.return_value = (
            LocalRunnerConnectResponse(runner_id="r-1", project_name="proj")
        )
        mock_sup_cls.return_value.run = MagicMock()

        runner = CliRunner()
        result = runner.invoke(
            connect,
            ["--pair", "CODE", "python", "main.py"],
            obj={"api_key": None},
        )

        mock_sup_cls.assert_called_once()
        call_kwargs = mock_sup_cls.call_args[1]
        assert call_kwargs["command"] == ["python", "main.py"]
        assert call_kwargs["runner_id"] == "r-1"

    @patch("opik.cli.connect.Supervisor")
    @patch("opik.cli.connect.Opik")
    def test_connect__no_execvpe(self, mock_opik_cls, mock_sup_cls):
        from click.testing import CliRunner

        from opik.cli.connect import connect

        mock_client = MagicMock()
        mock_opik_cls.return_value = mock_client
        mock_client.rest_client.runners.connect_runner.return_value = (
            LocalRunnerConnectResponse(runner_id="r-1", project_name="proj")
        )
        mock_sup_cls.return_value.run = MagicMock()

        with patch("os.execvpe") as mock_exec:
            runner = CliRunner()
            runner.invoke(
                connect,
                ["--pair", "CODE", "python", "main.py"],
                obj={"api_key": None},
            )
            mock_exec.assert_not_called()
