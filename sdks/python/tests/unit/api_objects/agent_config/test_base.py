import dataclasses
from typing import Annotated, Optional
from unittest import mock

import pytest

from opik.api_objects.agent_config.base import AgentConfig
from opik.api_objects.agent_config.config import AgentConfigManager
from opik.api_objects.opik_client import Opik
from opik.rest_api.types.agent_blueprint_public import AgentBlueprintPublic
from opik.rest_api.types.agent_config_value_public import AgentConfigValuePublic


# ---------------------------------------------------------------------------
# Base class tests
# ---------------------------------------------------------------------------


class TestAgentConfigBaseClass:
    def test_subclass__auto_converted_to_dataclass(self):
        class MyConfig(AgentConfig):
            temp: float
            name: str

        assert dataclasses.is_dataclass(MyConfig)

    def test_subclass__instance_fields_accessible(self):
        class MyConfig(AgentConfig):
            temp: float
            name: str

        instance = MyConfig(temp=0.8, name="agent")
        assert instance.temp == 0.8
        assert instance.name == "agent"

    def test_subclass__opik_fields_populated(self):
        class MyConfig(AgentConfig):
            temp: float
            name: str

        assert "temp" in MyConfig.__opik_fields__
        assert "name" in MyConfig.__opik_fields__
        assert MyConfig.__opik_fields__["temp"].prefixed_key == "MyConfig.temp"
        assert MyConfig.__opik_fields__["name"].prefixed_key == "MyConfig.name"

    def test_subclass__default_value__raises_type_error(self):
        with pytest.raises(TypeError, match="does not support default values"):

            class BadConfig(AgentConfig):
                temp: float = 0.5

    def test_subclass__default_factory__raises_type_error(self):
        with pytest.raises(TypeError, match="does not support default values"):

            class BadConfig(AgentConfig):
                items: list = dataclasses.field(default_factory=list)

    def test_subclass__annotated_types__description_extracted(self):
        class MyConfig(AgentConfig):
            temp: Annotated[float, "Sampling temperature"]
            name: str

        assert MyConfig.__opik_fields__["temp"].description == "Sampling temperature"
        assert MyConfig.__opik_fields__["name"].description is None

    def test_subclass__annotated_with_non_str_metadata__no_description(self):
        class MyConfig(AgentConfig):
            temp: Annotated[float, 42]

        assert MyConfig.__opik_fields__["temp"].description is None

    def test_subclass__optional_type__unwrapped(self):
        class MyConfig(AgentConfig):
            temp: Optional[float]

        cf = MyConfig.__opik_fields__["temp"]
        assert cf.py_type is float

    def test_subclass__isinstance_check(self):
        class MyConfig(AgentConfig):
            temp: float

        cfg = MyConfig(temp=0.5)
        assert isinstance(cfg, AgentConfig)
        assert isinstance(cfg, MyConfig)

    def test_base_class__has_no_opik_fields(self):
        assert (
            not hasattr(AgentConfig, "__opik_fields__")
            or AgentConfig.__opik_fields__ == {}
        )


# ---------------------------------------------------------------------------
# create_agent_config_version tests
# ---------------------------------------------------------------------------


class TestCreateAgentConfigVersion:
    def test_first_call__creates_blueprint_and_returns_version_name(
        self, mock_rest_client
    ):
        class MyConfig(AgentConfig):
            temp: float
            model_name: str

        cfg = MyConfig(temp=0.7, model_name="gpt-4")
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        mock_rest_client.agent_configs.get_blueprint_by_id.return_value = (
            AgentBlueprintPublic(
                id="bp-1",
                name="v1",
                type="blueprint",
                values=[
                    AgentConfigValuePublic(
                        key="MyConfig.temp", type="float", value="0.7"
                    ),
                    AgentConfigValuePublic(
                        key="MyConfig.model_name", type="string", value="gpt-4"
                    ),
                ],
            )
        )

        result = client.create_agent_config_version(cfg)

        mock_rest_client.agent_configs.create_agent_config.assert_called_once()
        assert result == "v1"

    def test_same_values__no_op_returns_existing_name(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        cfg = MyConfig(temp=0.7)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = (
            AgentBlueprintPublic(
                id="bp-1",
                name="v1",
                type="blueprint",
                values=[
                    AgentConfigValuePublic(
                        key="MyConfig.temp", type="float", value="0.7"
                    ),
                ],
            )
        )

        result = client.create_agent_config_version(cfg)

        mock_rest_client.agent_configs.create_agent_config.assert_not_called()
        assert result == "v1"

    def test_different_values__creates_new_version(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        cfg = MyConfig(temp=0.9)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = (
            AgentBlueprintPublic(
                id="bp-1",
                name="v1",
                type="blueprint",
                values=[
                    AgentConfigValuePublic(
                        key="MyConfig.temp", type="float", value="0.7"
                    ),
                ],
            )
        )
        mock_rest_client.agent_configs.get_blueprint_by_id.return_value = (
            AgentBlueprintPublic(
                id="bp-2",
                name="v2",
                type="blueprint",
                values=[
                    AgentConfigValuePublic(
                        key="MyConfig.temp", type="float", value="0.9"
                    ),
                ],
            )
        )

        result = client.create_agent_config_version(cfg)

        mock_rest_client.agent_configs.create_agent_config.assert_called_once()
        assert result == "v2"

    def test_non_agentconfig__raises_type_error(self, mock_rest_client):
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        with pytest.raises(TypeError, match="AgentConfig subclass"):
            client.create_agent_config_version("not a config")

    def test_base_agentconfig__raises_type_error(self, mock_rest_client):
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        with pytest.raises(TypeError, match="AgentConfig subclass"):
            client.create_agent_config_version(AgentConfig.__new__(AgentConfig))


# ---------------------------------------------------------------------------
# get_agent_config tests
# ---------------------------------------------------------------------------


class TestGetAgentConfig:
    def test_no_backend_config__returns_fallback(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        fallback = MyConfig(temp=0.5)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        result = client.get_agent_config(fallback=fallback)

        assert result.temp == 0.5

    def test_backend_values__returned_in_result(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float
            name: str

        fallback = MyConfig(temp=0.5, name="default")
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        bp = AgentBlueprintPublic(
            id="bp-1",
            type="blueprint",
            values=[
                AgentConfigValuePublic(key="MyConfig.temp", type="float", value="0.9"),
                AgentConfigValuePublic(
                    key="MyConfig.name", type="string", value="backend-model"
                ),
            ],
        )
        mock_rest_client.projects.retrieve_project.return_value = mock.Mock(id="proj-1")
        mock_rest_client.agent_configs.get_blueprint_by_env.side_effect = None
        mock_rest_client.agent_configs.get_blueprint_by_env.return_value = bp
        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = bp

        result = client.get_agent_config(fallback=fallback)

        assert result.temp == pytest.approx(0.9)
        assert result.name == "backend-model"

    def test_return_type__isinstance_of_user_class(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        fallback = MyConfig(temp=0.5)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        bp = AgentBlueprintPublic(
            id="bp-1",
            type="blueprint",
            values=[
                AgentConfigValuePublic(key="MyConfig.temp", type="float", value="0.8"),
            ],
        )
        mock_rest_client.projects.retrieve_project.return_value = mock.Mock(id="proj-1")
        mock_rest_client.agent_configs.get_blueprint_by_env.side_effect = None
        mock_rest_client.agent_configs.get_blueprint_by_env.return_value = bp
        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = bp

        result = client.get_agent_config(fallback=fallback)

        assert isinstance(result, MyConfig)
        assert isinstance(result, AgentConfig)

    def test_latest_flag__fetches_latest(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        fallback = MyConfig(temp=0.5)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        bp = AgentBlueprintPublic(
            id="bp-latest",
            type="blueprint",
            values=[
                AgentConfigValuePublic(key="MyConfig.temp", type="float", value="0.8"),
            ],
        )
        mock_rest_client.projects.retrieve_project.return_value = mock.Mock(id="proj-1")
        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = bp

        result = client.get_agent_config(fallback=fallback, latest=True)

        mock_rest_client.agent_configs.get_latest_blueprint.assert_called()
        assert result.temp == pytest.approx(0.8)

    def test_version_param__fetches_by_name(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        fallback = MyConfig(temp=0.5)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        bp = AgentBlueprintPublic(
            id="bp-v2",
            name="v2",
            type="blueprint",
            values=[
                AgentConfigValuePublic(key="MyConfig.temp", type="float", value="0.3"),
            ],
        )
        mock_rest_client.projects.retrieve_project.return_value = mock.Mock(id="proj-1")
        mock_rest_client.agent_configs.get_blueprint_by_name.return_value = bp
        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = bp

        result = client.get_agent_config(fallback=fallback, version="v2")

        mock_rest_client.agent_configs.get_blueprint_by_name.assert_called_with(
            project_id="proj-1", name="v2", mask_id=None
        )
        assert result.temp == pytest.approx(0.3)

    def test_env_param__fetches_by_env(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        fallback = MyConfig(temp=0.5)
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        bp = AgentBlueprintPublic(
            id="bp-staging",
            type="blueprint",
            values=[
                AgentConfigValuePublic(key="MyConfig.temp", type="float", value="0.6"),
            ],
        )
        mock_rest_client.projects.retrieve_project.return_value = mock.Mock(id="proj-1")
        mock_rest_client.agent_configs.get_blueprint_by_env.side_effect = None
        mock_rest_client.agent_configs.get_blueprint_by_env.return_value = bp

        result = client.get_agent_config(fallback=fallback, env="staging")

        mock_rest_client.agent_configs.get_blueprint_by_env.assert_called_with(
            env_name="staging",
            project_id="proj-1",
            mask_id=None,
        )
        assert result.temp == pytest.approx(0.6)

    def test_non_agentconfig__raises_type_error(self, mock_rest_client):
        client = Opik.__new__(Opik)
        client._rest_client = mock_rest_client
        client._project_name = "test-project"

        with pytest.raises(TypeError, match="AgentConfig subclass"):
            client.get_agent_config(fallback="not a config")


# ---------------------------------------------------------------------------
# Live instance tests
# ---------------------------------------------------------------------------


class TestLiveInstance:
    def test_live_instance__reads_from_cache(self, mock_rest_client):
        class MyConfig(AgentConfig):
            temp: float

        fallback = MyConfig(temp=0.5)
        manager = AgentConfigManager(
            project_name="test-project", rest_client_=mock_rest_client
        )

        bp = AgentBlueprintPublic(
            id="bp-1",
            type="blueprint",
            values=[
                AgentConfigValuePublic(key="MyConfig.temp", type="float", value="0.9"),
            ],
        )
        mock_rest_client.projects.retrieve_project.return_value = mock.Mock(id="proj-1")
        mock_rest_client.agent_configs.get_latest_blueprint.side_effect = None
        mock_rest_client.agent_configs.get_latest_blueprint.return_value = bp

        live = MyConfig._resolve_from_backend(
            fallback, manager, "test-project", env=None, latest=True, version=None
        )

        assert live.temp == pytest.approx(0.9)
        assert isinstance(live, MyConfig)
        assert isinstance(live, AgentConfig)

    def test_plain_instance__no_cache_intercept(self):
        class MyConfig(AgentConfig):
            temp: float

        cfg = MyConfig(temp=0.5)
        assert cfg.temp == 0.5
        assert cfg._opik_project is None
