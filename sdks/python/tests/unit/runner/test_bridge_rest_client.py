from unittest.mock import MagicMock, PropertyMock

import pytest

from opik.rest_api.core.api_error import ApiError
from opik.runner.bridge_api import BridgeApiClient, BridgeCommand


class FakeResponse:
    def __init__(self, status_code, json_data=None, text=""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text
        self.headers = {}

    def json(self):
        if self._json_data is None:
            raise ValueError("No JSON")
        return self._json_data


@pytest.fixture
def mock_api():
    api = MagicMock()
    api._client_wrapper = MagicMock()
    api._client_wrapper.httpx_client = MagicMock()
    return api


@pytest.fixture
def client(mock_api):
    return BridgeApiClient(mock_api)


class TestNextBridgeCommands:
    def test_200__returns_batch(self, mock_api, client):
        mock_api._client_wrapper.httpx_client.request.return_value = FakeResponse(
            200,
            {
                "commands": [
                    {
                        "command_id": "cmd-1",
                        "type": "read_file",
                        "args": {"path": "test.py"},
                        "timeout_seconds": 10,
                        "submitted_at": "2026-04-01T10:00:00Z",
                    },
                    {
                        "command_id": "cmd-2",
                        "type": "list_files",
                        "args": {"pattern": "**/*.py"},
                        "timeout_seconds": 15,
                        "submitted_at": "2026-04-01T10:00:00.100Z",
                    },
                ]
            },
        )

        result = client.next_bridge_commands("r-1")
        assert len(result) == 2
        assert result[0].command_id == "cmd-1"
        assert result[0].type == "read_file"
        assert result[1].command_id == "cmd-2"

    def test_204__returns_empty(self, mock_api, client):
        mock_api._client_wrapper.httpx_client.request.return_value = FakeResponse(204)

        result = client.next_bridge_commands("r-1")
        assert result == []

    def test_410__raises(self, mock_api, client):
        mock_api._client_wrapper.httpx_client.request.return_value = FakeResponse(
            410, text="Runner evicted"
        )

        with pytest.raises(ApiError) as exc_info:
            client.next_bridge_commands("r-1")
        assert exc_info.value.status_code == 410


class TestReportBridgeResult:
    def test_200__ok(self, mock_api, client):
        mock_api._client_wrapper.httpx_client.request.return_value = FakeResponse(200)

        client.report_bridge_result(
            "r-1", "cmd-1", status="completed", result={"content": "hello"}
        )

    def test_409__raises(self, mock_api, client):
        mock_api._client_wrapper.httpx_client.request.return_value = FakeResponse(409)

        with pytest.raises(ApiError) as exc_info:
            client.report_bridge_result("r-1", "cmd-1", status="completed")
        assert exc_info.value.status_code == 409

    def test_404__raises(self, mock_api, client):
        mock_api._client_wrapper.httpx_client.request.return_value = FakeResponse(404)

        with pytest.raises(ApiError) as exc_info:
            client.report_bridge_result("r-1", "cmd-1", status="completed")
        assert exc_info.value.status_code == 404
