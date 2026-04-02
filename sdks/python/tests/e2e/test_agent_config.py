import uuid
from typing import Annotated, Optional

import pytest
import opik
from opik import opik_context
from opik.api_objects.agent_config.cache import get_global_registry
from opik.api_objects.agent_config.config import AgentConfigManager
from opik.api_objects.agent_config.context import agent_config_context

from opik.api_objects.prompt.text.prompt import Prompt
from opik.api_objects.prompt.chat.chat_prompt import ChatPrompt
from opik.rest_api import core as rest_api_core
from . import verifiers
from ..testlib import ANY_DICT, ANY_BUT_NONE


def _unique_project_name() -> str:
    return f"e2e-agent-config-{str(uuid.uuid4())[:8]}"


@pytest.fixture(autouse=True)
def clear_caches_after_test():
    yield
    get_global_registry().clear()


@pytest.fixture
def project_name(opik_client: opik.Opik):
    name = _unique_project_name()
    yield name
    try:
        project_id = opik_client.rest_client.projects.retrieve_project(name=name).id
        opik_client.rest_client.projects.delete_project_by_id(project_id)
    except rest_api_core.ApiError:
        pass


def test_multi_class_and_field_removal_dedup__happyflow(
    opik_client: opik.Opik,
    project_name: str,
):
    """create_agent_config_version never overwrites an existing config.
    Once the first version exists, subsequent calls always defer to it."""

    class ConfigA(opik.AgentConfig):
        temperature: float
        model: str

    class ConfigB(opik.AgentConfig):
        retries: int

    # First publish creates v1.
    v1_name = opik_client.create_agent_config_version(
        ConfigA(temperature=0.5, model="gpt-4"), project_name=project_name
    )

    # Second publish with a different class defers to existing — no new version.
    v_after_b = opik_client.create_agent_config_version(
        ConfigB(retries=3), project_name=project_name
    )
    assert v_after_b == v1_name, (
        "existing config is authoritative — different class should be a no-op"
    )

    # Re-publishing ConfigA with the same values is also a no-op.
    get_global_registry().clear()
    v_a_again = opik_client.create_agent_config_version(
        ConfigA(temperature=0.5, model="gpt-4"), project_name=project_name
    )
    assert v_a_again == v1_name, "same values should be a no-op"

    # Publish ConfigA with the model field removed locally — still a no-op.
    class ConfigA(opik.AgentConfig):  # type: ignore[no-redef]
        temperature: float

    get_global_registry().clear()
    v_a_reduced = opik_client.create_agent_config_version(
        ConfigA(temperature=0.5), project_name=project_name
    )
    assert v_a_reduced == v1_name, "removing a field should be a no-op"

    # Confirm history has exactly 1 entry — no overwrites happened.
    project_id = opik_client.rest_client.projects.retrieve_project(name=project_name).id
    history = opik_client.rest_client.agent_configs.get_blueprint_history(
        project_id=project_id
    ).content
    assert len(history) == 1


def test_explicit_update_creates_new_version__happyflow(
    opik_client: opik.Opik,
    project_name: str,
):
    """create_agent_config_version seeds v1, then update_blueprint (the path the
    optimizer takes) creates v2.  Fetching latest must return v2 values while
    fetching v1 by name still returns the original values."""

    class MyConfig(opik.AgentConfig):
        temperature: float
        model: str

    # Seed v1 via create_agent_config_version.
    v1_name = opik_client.create_agent_config_version(
        MyConfig(temperature=0.5, model="gpt-4o-mini"), project_name=project_name
    )

    # Simulate what the optimizer does: fetch latest, tweak values, publish via
    # update_blueprint.
    get_global_registry().clear()
    manager = AgentConfigManager(
        project_name=project_name,
        rest_client_=opik_client.rest_client,
    )
    field_types = {"MyConfig.temperature": float, "MyConfig.model": str}
    v2_bp = manager.update_blueprint(
        fields_with_values={
            "MyConfig.temperature": (float, 0.2, None),
            "MyConfig.model": (str, "gpt-4o", None),
        },
        description="Optimized config",
        field_types=field_types,
    )
    assert v2_bp.name != v1_name

    # History should now have 2 entries.
    project_id = opik_client.rest_client.projects.retrieve_project(name=project_name).id
    history = opik_client.rest_client.agent_configs.get_blueprint_history(
        project_id=project_id
    ).content
    assert len(history) == 2

    # latest returns v2 values.
    get_global_registry().clear()

    @opik.track(project_name=project_name)
    def fetch_latest():
        return opik_client.get_agent_config(
            fallback=MyConfig(temperature=0.0, model="fallback"),
            project_name=project_name,
            latest=True,
        )

    latest = fetch_latest()
    assert latest.temperature == pytest.approx(0.2)
    assert latest.model == "gpt-4o"

    # v1 by name still returns original values.
    get_global_registry().clear()

    @opik.track(project_name=project_name)
    def fetch_v1():
        return opik_client.get_agent_config(
            fallback=MyConfig(temperature=0.0, model="fallback"),
            project_name=project_name,
            version=v1_name,
        )

    v1 = fetch_v1()
    assert v1.temperature == pytest.approx(0.5)
    assert v1.model == "gpt-4o-mini"

    # Re-running create_agent_config_version with defaults must NOT revert v2.
    get_global_registry().clear()
    v_after_restart = opik_client.create_agent_config_version(
        MyConfig(temperature=0.5, model="gpt-4o-mini"), project_name=project_name
    )
    assert v_after_restart == v2_bp.name, (
        "startup must not overwrite optimizer's version"
    )

    # Still 2 entries — no new version created.
    history = opik_client.rest_client.agent_configs.get_blueprint_history(
        project_id=project_id
    ).content
    assert len(history) == 2


def test_publish_version_and_retrieve__happyflow(
    opik_client: opik.Opik,
    project_name: str,
):
    """Core lifecycle: publish, dedup, retrieve by latest / version name / env.
    create_agent_config_version never overwrites — different values are a no-op."""

    class MyConfig(opik.AgentConfig):
        temperature: Annotated[float, "Sampling temperature"]
        model: str
        hint: Optional[str]

    # Publish v1 with hint=None and verify the version name comes back.
    v1_name = opik_client.create_agent_config_version(
        MyConfig(temperature=0.5, model="gpt-3.5", hint=None), project_name=project_name
    )
    assert isinstance(v1_name, str) and v1_name != ""

    # Backend auto-tags the first blueprint as "prod" — verify without any manual deploy_to.
    get_global_registry().clear()

    @opik.track(project_name=project_name)
    def fetch_auto_prod():
        return opik_client.get_agent_config(
            fallback=MyConfig(temperature=0.0, model="fallback", hint=None),
            project_name=project_name,
            env="prod",
        )

    auto_prod = fetch_auto_prod()
    assert auto_prod.temperature == pytest.approx(0.5)
    assert auto_prod.model == "gpt-3.5"

    # Publishing the same values again must be a no-op (1 entry in history).
    get_global_registry().clear()
    opik_client.create_agent_config_version(
        MyConfig(temperature=0.5, model="gpt-3.5", hint=None), project_name=project_name
    )
    project_id = opik_client.rest_client.projects.retrieve_project(name=project_name).id
    assert (
        len(
            opik_client.rest_client.agent_configs.get_blueprint_history(
                project_id=project_id
            ).content
        )
        == 1
    )

    # Publishing different values defers to existing — no new version created.
    get_global_registry().clear()
    v2_name = opik_client.create_agent_config_version(
        MyConfig(temperature=0.8, model="gpt-4", hint="use chain-of-thought"),
        project_name=project_name,
    )
    assert v2_name == v1_name, (
        "existing config is authoritative — different values should be a no-op"
    )

    # Still only 1 entry in history.
    assert (
        len(
            opik_client.rest_client.agent_configs.get_blueprint_history(
                project_id=project_id
            ).content
        )
        == 1
    )

    # latest=True returns v1 (the only version).
    get_global_registry().clear()

    @opik.track(project_name=project_name)
    def fetch_latest():
        return opik_client.get_agent_config(
            fallback=MyConfig(temperature=0.0, model="fallback", hint=None),
            project_name=project_name,
            latest=True,
        )

    latest = fetch_latest()
    assert latest.temperature == pytest.approx(0.5)
    assert latest.model == "gpt-3.5"
    assert latest.hint is None

    # version= by name returns v1.
    get_global_registry().clear()

    @opik.track(project_name=project_name)
    def fetch_by_name():
        return opik_client.get_agent_config(
            fallback=MyConfig(temperature=0.0, model="fallback", hint=None),
            project_name=project_name,
            version=v1_name,
        )

    by_name = fetch_by_name()
    assert by_name.temperature == pytest.approx(0.5)
    assert by_name.hint is None

    # env= fetch returns v1 (auto-tagged as prod).
    get_global_registry().clear()

    @opik.track(project_name=project_name)
    def fetch_by_env():
        return opik_client.get_agent_config(
            fallback=MyConfig(temperature=0.0, model="fallback", hint=None),
            project_name=project_name,
            env="prod",
        )

    by_env = fetch_by_env()
    assert by_env.temperature == pytest.approx(0.5)
    assert by_env.hint is None


def test_prompt_field_and_trace_metadata__happyflow(
    opik_client: opik.Opik,
    project_name: str,
):
    """Prompt-typed and ChatPrompt-typed fields survive the roundtrip with the correct
    class; field access inside a tracked function injects agent_configuration into
    trace and span metadata."""

    prompt_name = f"e2e-prompt-{uuid.uuid4().hex[:8]}"
    chat_prompt_name = f"e2e-chat-prompt-{uuid.uuid4().hex[:8]}"

    prompt_v1 = opik_client.create_prompt(name=prompt_name, prompt="Hello v1")
    chat_prompt_v1 = opik_client.create_chat_prompt(
        name=chat_prompt_name,
        messages=[{"role": "user", "content": "Hi v1"}],
    )

    class PromptConfig(opik.AgentConfig):
        system_prompt: Prompt
        chat_template: ChatPrompt
        temperature: float

    opik_client.create_agent_config_version(
        PromptConfig(
            system_prompt=prompt_v1,
            chat_template=chat_prompt_v1,
            temperature=0.3,
        ),
        project_name=project_name,
    )

    get_global_registry().clear()

    id_storage = {}

    @opik.track(project_name=project_name)
    def run():
        cfg = opik_client.get_agent_config(
            fallback=PromptConfig(
                system_prompt=prompt_v1,
                chat_template=chat_prompt_v1,
                temperature=0.0,
            ),
            project_name=project_name,
            latest=True,
        )
        id_storage["trace_id"] = opik_context.get_current_trace_data().id
        id_storage["span_id"] = opik_context.get_current_span_data().id
        id_storage["system_prompt"] = cfg.system_prompt
        id_storage["system_prompt_version_id"] = cfg.system_prompt.version_id
        id_storage["chat_template"] = cfg.chat_template
        id_storage["chat_template_version_id"] = cfg.chat_template.version_id
        _ = cfg.temperature
        return cfg

    run()
    opik.flush_tracker()

    # Prompt field roundtrip — must come back as Prompt, not ChatPrompt.
    assert isinstance(id_storage["system_prompt"], Prompt)
    assert not isinstance(id_storage["system_prompt"], ChatPrompt)
    assert id_storage["system_prompt_version_id"] == prompt_v1.version_id

    # ChatPrompt field roundtrip — must come back as ChatPrompt, not plain Prompt.
    assert isinstance(id_storage["chat_template"], ChatPrompt)
    assert id_storage["chat_template_version_id"] == chat_prompt_v1.version_id

    expected_meta = {
        "_blueprint_id": ANY_BUT_NONE,
        "blueprint_version": ANY_BUT_NONE,
        "values": ANY_DICT,
    }
    verifiers.verify_trace(
        opik_client=opik_client,
        trace_id=id_storage["trace_id"],
        metadata={"agent_configuration": ANY_DICT.containing(expected_meta)},
    )
    verifiers.verify_span(
        opik_client=opik_client,
        span_id=id_storage["span_id"],
        trace_id=id_storage["trace_id"],
        parent_span_id=None,
        metadata={"agent_configuration": ANY_DICT.containing(expected_meta)},
    )


def test_mask_overrides_config__happyflow(
    opik_client: opik.Opik,
    project_name: str,
):
    """A mask overrides selected fields while leaving untouched fields intact."""

    class MyConfig(opik.AgentConfig):
        temperature: float
        model: str

    opik_client.create_agent_config_version(
        MyConfig(temperature=0.5, model="gpt-4"), project_name=project_name
    )

    get_global_registry().clear()

    manager = AgentConfigManager(
        project_name=project_name,
        rest_client_=opik_client.rest_client,
    )
    mask_id = manager.create_mask(parameters={"MyConfig.temperature": 0.9})

    get_global_registry().clear()

    with agent_config_context(mask_id):

        @opik.track(project_name=project_name)
        def fetch_with_mask():
            return opik_client.get_agent_config(
                fallback=MyConfig(temperature=0.0, model="fallback"),
                project_name=project_name,
                latest=True,
            )

        result = fetch_with_mask()
        assert result.temperature == pytest.approx(0.9)
        assert result.model == "gpt-4"
