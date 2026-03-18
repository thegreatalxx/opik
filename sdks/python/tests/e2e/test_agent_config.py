import uuid
from typing import Annotated

import pytest
import opik
from opik.api_objects.agent_config.cache import _registry

from opik.api_objects.prompt.text.prompt import Prompt
from opik.rest_api import core as rest_api_core


def _unique_project_name() -> str:
    return f"e2e-agent-config-{str(uuid.uuid4())[:8]}"


@pytest.fixture(autouse=True)
def clear_caches_after_test():
    yield
    _registry.clear()


@pytest.fixture
def project_name(opik_client: opik.Opik):
    name = _unique_project_name()
    yield name
    try:
        project_id = opik_client.rest_client.projects.retrieve_project(name=name).id
        opik_client.rest_client.projects.delete_project_by_id(project_id)
    except rest_api_core.ApiError:
        pass


# ---------------------------------------------------------------------------
# create_agent_config_version tests
# ---------------------------------------------------------------------------


def test_create_agent_config_version__first_call__writes_config(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float
        model_name: str

    cfg = MyConfig(temperature=0.7, model_name="gpt-4")
    opik_client.create_agent_config_version(cfg, project_name=project_name)

    result = opik_client.get_agent_config(
        fallback=cfg, project_name=project_name, latest=True
    )
    assert result.temperature == pytest.approx(0.7)
    assert result.model_name == "gpt-4"


def test_create_agent_config_version__duplicate__no_op(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float

    cfg = MyConfig(temperature=0.5)
    opik_client.create_agent_config_version(cfg, project_name=project_name)

    _registry.clear()

    opik_client.create_agent_config_version(cfg, project_name=project_name)

    project_id = opik_client.rest_client.projects.retrieve_project(name=project_name).id
    history = opik_client.rest_client.agent_configs.get_blueprint_history(
        project_id=project_id
    )
    assert len(history.content) == 1


def test_create_agent_config_version__different_values__new_version(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float

    opik_client.create_agent_config_version(
        MyConfig(temperature=0.5), project_name=project_name
    )

    _registry.clear()

    opik_client.create_agent_config_version(
        MyConfig(temperature=0.8), project_name=project_name
    )

    result = opik_client.get_agent_config(
        fallback=MyConfig(temperature=0.0),
        project_name=project_name,
        latest=True,
    )
    assert result.temperature == pytest.approx(0.8)


# ---------------------------------------------------------------------------
# get_agent_config tests
# ---------------------------------------------------------------------------


def test_get_agent_config__no_backend__returns_fallback(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float

    fallback = MyConfig(temperature=0.99)
    result = opik_client.get_agent_config(
        fallback=fallback, project_name=project_name, latest=True
    )
    assert result.temperature == pytest.approx(0.99)


def test_get_agent_config__backend_values__override_fallback(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float
        model: str

    opik_client.create_agent_config_version(
        MyConfig(temperature=0.3, model="gpt-3.5"), project_name=project_name
    )

    _registry.clear()

    result = opik_client.get_agent_config(
        fallback=MyConfig(temperature=0.99, model="fallback"),
        project_name=project_name,
        latest=True,
    )
    assert result.temperature == pytest.approx(0.3)
    assert result.model == "gpt-3.5"


def test_get_agent_config__env_tag__fetches_correct_version(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float

    cfg = MyConfig(temperature=0.4)
    opik_client.create_agent_config_version(cfg, project_name=project_name)
    cfg.deploy_to("PROD")

    opik_client.create_agent_config_version(
        MyConfig(temperature=0.9), project_name=project_name
    )

    _registry.clear()

    result = opik_client.get_agent_config(
        fallback=MyConfig(temperature=0.0),
        project_name=project_name,
        env="PROD",
    )
    assert result.temperature == pytest.approx(0.4)


def test_get_agent_config__version_param__fetches_by_name(
    opik_client: opik.Opik,
    project_name: str,
):
    class MyConfig(opik.AgentConfig):
        temperature: float

    cfg_v1 = MyConfig(temperature=0.1)
    first_version = opik_client.create_agent_config_version(
        cfg_v1, project_name=project_name
    )
    assert isinstance(first_version, str)
    assert first_version != ""

    cfg_v2 = MyConfig(temperature=0.9)
    second_version = opik_client.create_agent_config_version(
        cfg_v2, project_name=project_name
    )
    assert second_version != first_version

    _registry.clear()

    result = opik_client.get_agent_config(
        fallback=MyConfig(temperature=0.0),
        project_name=project_name,
        version=first_version,
    )
    assert result.temperature == pytest.approx(0.1)


# ---------------------------------------------------------------------------
# Annotated descriptions
# ---------------------------------------------------------------------------


def test_annotated_descriptions__sent_to_backend(
    opik_client: opik.Opik,
    project_name: str,
):
    class AnnotatedConfig(opik.AgentConfig):
        model: Annotated[str, "The LLM model identifier"]
        temperature: Annotated[float, "Sampling temperature"]
        max_tokens: int

    cfg = AnnotatedConfig(model="gpt-4o", temperature=0.7, max_tokens=512)
    opik_client.create_agent_config_version(cfg, project_name=project_name)

    project_id = opik_client.rest_client.projects.retrieve_project(name=project_name).id
    bp = opik_client.rest_client.agent_configs.get_latest_blueprint(
        project_id=project_id
    )

    raw_values = {v.key: v for v in bp.values}

    assert raw_values["AnnotatedConfig.model"].description == "The LLM model identifier"
    assert (
        raw_values["AnnotatedConfig.temperature"].description == "Sampling temperature"
    )
    assert raw_values["AnnotatedConfig.max_tokens"].description is None


# ---------------------------------------------------------------------------
# Prompt fields
# ---------------------------------------------------------------------------


def test_prompt_field__roundtrip(
    opik_client: opik.Opik,
    project_name: str,
):
    prompt_name = f"e2e-prompt-{uuid.uuid4().hex[:8]}"
    prompt_v1 = opik_client.create_prompt(name=prompt_name, prompt="Hello v1")

    class PromptConfig(opik.AgentConfig):
        system_prompt: Prompt

    cfg = PromptConfig(system_prompt=prompt_v1)
    opik_client.create_agent_config_version(cfg, project_name=project_name)

    _registry.clear()

    result = opik_client.get_agent_config(
        fallback=PromptConfig(system_prompt=prompt_v1),
        project_name=project_name,
        latest=True,
    )
    assert isinstance(result.system_prompt, Prompt)
    assert result.system_prompt.version_id == prompt_v1.version_id
