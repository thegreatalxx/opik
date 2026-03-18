import dataclasses
import logging
import typing
import warnings

from opik.exceptions import AgentConfigNotFound
from . import type_helpers
from . import cache as cache_mod
from .context import get_active_config_mask

logger = logging.getLogger(__name__)

_MISSING = object()

T = typing.TypeVar("T", bound="AgentConfig")


class ConfigField(typing.NamedTuple):
    prefixed_key: str
    py_type: typing.Any
    description: typing.Optional[str]


@dataclasses.dataclass
class _OpikState:
    project: typing.Optional[str] = None
    env: typing.Optional[str] = None
    mask_id: typing.Optional[str] = None
    manager: typing.Any = None
    blueprint_id: typing.Optional[str] = None
    envs: typing.Optional[typing.List[str]] = None
    is_fallback: bool = True
    mask_mismatch_warned: bool = False


def _build_field_info(
    config_field: ConfigField, value: typing.Any
) -> typing.Dict[str, typing.Any]:
    info: typing.Dict[str, typing.Any] = {
        "value": type_helpers.python_value_to_metadata_value(
            value, config_field.py_type
        ),
        "type": type_helpers.python_type_to_backend_type(config_field.py_type),
    }
    if config_field.description is not None:
        info["description"] = config_field.description
    return info


class AgentConfig:
    """Base class for user-defined agent configurations.

    Subclass this and declare typed fields::

        class MyConfig(opik.AgentConfig):
            temperature: Annotated[float, "Sampling temperature"]
            model: str

    Instantiate directly for a plain dataclass (no server interaction)::

        cfg = MyConfig(temperature=0.5, model="gpt-4")
    """

    __field_metadata__: typing.ClassVar[typing.Dict[str, ConfigField]]

    _opik_state: _OpikState

    def __init_subclass__(cls, **kwargs: typing.Any) -> None:
        super().__init_subclass__(**kwargs)

        if not dataclasses.is_dataclass(cls):
            dataclasses.dataclass(cls)

        for f in dataclasses.fields(cls):  # type: ignore[arg-type]
            if (
                f.default is not dataclasses.MISSING
                or f.default_factory is not dataclasses.MISSING
            ):
                raise TypeError(
                    f"Opik AgentConfig does not support default values. "
                    f"Remove the default from field '{f.name}' in {cls.__name__}."
                )

        class_prefix = cls.__name__
        fields: typing.Dict[str, ConfigField] = {}
        for f_name, f_type, desc in type_helpers.extract_dataclass_fields(cls):
            fields[f_name] = ConfigField(
                prefixed_key=f"{class_prefix}.{f_name}",
                py_type=f_type,
                description=desc,
            )
        cls.__field_metadata__ = fields

    def __post_init__(self) -> None:
        object.__setattr__(self, "_opik_state", _OpikState())

    @property
    def _state(self) -> _OpikState:
        return object.__getattribute__(self, "_opik_state")

    @property
    def envs(self) -> typing.Optional[typing.List[str]]:
        """Environment tags associated with the resolved blueprint."""
        return self._state.envs

    @property
    def is_fallback(self) -> bool:
        """True if local fallback values are used because no backend blueprint was found."""
        return self._state.is_fallback

    def __getattribute__(self, attr: str) -> typing.Any:
        if attr not in type(self).__field_metadata__:
            return object.__getattribute__(self, attr)
        if self._state.project is None:
            return object.__getattribute__(self, attr)
        return self._resolve_field(attr)

    def _resolve_field(self, attr: str) -> typing.Any:
        state = self._state
        project = typing.cast(str, state.project)  # guarded by __getattribute__
        active_mask = get_active_config_mask()
        if (
            active_mask is not None
            and state.mask_id != active_mask
            and not state.mask_mismatch_warned
        ):
            state.mask_mismatch_warned = True
            warnings.warn(
                f"{type(self).__name__} was instantiated outside of an agent entrypoint "
                f"and will not receive config overrides. "
                f"Ensure get_agent_config() is called inside a function decorated with "
                f"@opik.track(entrypoint=True) to enable agent optimization.",
                stacklevel=2,
            )
        instance_cache = cache_mod.get_cached_config(project, state.env, state.mask_id)
        state.is_fallback = instance_cache.blueprint_id is None
        prefixed_key = type(self).__field_metadata__[attr].prefixed_key
        value = instance_cache.values.get(prefixed_key, _MISSING)
        self._inject_trace_metadata(attr, value=value, shared_cache=instance_cache)
        return value if value is not _MISSING else object.__getattribute__(self, attr)

    def _extract_fields_with_values(self) -> typing.Dict[str, tuple]:
        result: typing.Dict[str, tuple] = {}
        for f_name, cf in type(self).__field_metadata__.items():
            value = object.__getattribute__(self, f_name)
            result[cf.prefixed_key] = (cf.py_type, value, cf.description)
        return result

    def _prefixed_field_types(self) -> typing.Dict[str, typing.Any]:
        return {
            cf.prefixed_key: cf.py_type for cf in type(self).__field_metadata__.values()
        }

    def _matches_blueprint(
        self,
        blueprint: typing.Any,
        fields_with_values: typing.Dict[str, tuple],
    ) -> bool:
        bp_keys = set(blueprint.keys())
        local_keys = set(fields_with_values.keys())
        if bp_keys != local_keys:
            return False

        for key, (py_type, value, _desc) in fields_with_values.items():
            bp_value = blueprint.get(key)
            local_ser = type_helpers.python_value_to_backend_value(value, py_type)
            bp_ser = type_helpers.python_value_to_backend_value(bp_value, py_type)
            if local_ser != bp_ser:
                return False
        return True

    def _create_version(
        self,
        manager: typing.Any,
        description: typing.Optional[str],
    ) -> str:
        fields_with_values = self._extract_fields_with_values()
        field_types = self._prefixed_field_types()

        latest = manager.get_blueprint(field_types=field_types)

        if latest is not None and self._matches_blueprint(latest, fields_with_values):
            self._state.manager = manager
            self._state.blueprint_id = latest.id
            self._state.envs = latest.envs
            self._state.is_fallback = False
            return latest.name or ""

        bp = manager.create_blueprint(
            fields_with_values=fields_with_values,
            description=description,
            field_types=field_types,
        )
        self._state.manager = manager
        self._state.blueprint_id = bp.id
        self._state.envs = bp.envs
        self._state.is_fallback = False
        return bp.name or ""

    def deploy_to(self, env: str) -> None:
        """Tag the current version with an environment name.

        Can be called after ``create_agent_config_version`` or
        ``get_agent_config``.

        Args:
            env: Environment name (e.g. ``"PROD"``).
        """
        state = self._state
        if state.manager is None or state.blueprint_id is None:
            raise RuntimeError(
                "deploy_to() requires a prior call to "
                "create_agent_config_version() or get_agent_config()."
            )
        state.manager.tag_blueprint_with_env(env=env, blueprint_id=state.blueprint_id)

    @classmethod
    def _resolve_from_backend(
        cls: typing.Type[T],
        fallback: T,
        manager: typing.Any,
        project_name: str,
        *,
        env: typing.Optional[str],
        latest: bool,
        version: typing.Optional[str],
    ) -> T:
        field_types = {
            cf.prefixed_key: cf.py_type for cf in cls.__field_metadata__.values()
        }

        mask_id = get_active_config_mask()
        try:
            if version is not None:
                bp = manager.get_blueprint(
                    name=version, mask_id=mask_id, field_types=field_types
                )
                if bp is None:
                    raise AgentConfigNotFound(
                        f"No agent config blueprint found for version={version!r} in project {project_name!r}."
                    )
            elif latest:
                bp = manager.get_blueprint(mask_id=mask_id, field_types=field_types)
                if bp is None:
                    raise AgentConfigNotFound(
                        f"No agent config blueprint found in project {project_name!r}. "
                        f"Use create_agent_config_version() to publish one."
                    )
            else:
                bp = manager.get_blueprint(
                    env=env, mask_id=mask_id, field_types=field_types
                )
                if bp is None:
                    raise AgentConfigNotFound(
                        f"No agent config blueprint found for env={env!r} in project {project_name!r}. "
                        f"Use create_agent_config_version() and deploy_to({env!r}) to publish one."
                    )
        except AgentConfigNotFound:
            raise
        except Exception:
            logger.debug(
                "Failed to fetch agent config from backend, using fallback",
                exc_info=True,
            )
            return fallback

        kwargs: typing.Dict[str, typing.Any] = {}
        for f_name, cf in cls.__field_metadata__.items():
            if cf.prefixed_key in bp.keys():
                kwargs[f_name] = bp[cf.prefixed_key]
            else:
                kwargs[f_name] = object.__getattribute__(fallback, f_name)

        instance = cls(**kwargs)

        resolved_env = None if (latest or version is not None) else env
        state = instance._state
        state.project = project_name
        state.env = resolved_env
        state.mask_id = mask_id
        state.manager = manager
        state.blueprint_id = bp.id
        state.envs = bp.envs
        state.is_fallback = False

        shared_cache = cache_mod.init_cache_entry(
            project_name, resolved_env, mask_id, field_types, manager
        )
        shared_cache.update(bp)

        return instance

    def _inject_trace_metadata(
        self,
        attr: str,
        value: typing.Any = _MISSING,
        *,
        shared_cache: typing.Optional[cache_mod.SharedConfigCache] = None,
    ) -> None:
        from opik import exceptions, opik_context

        try:
            metadata = self._build_trace_metadata(attr, value, shared_cache)
            payload = {"agent_configuration": metadata}
            opik_context.update_current_trace(metadata=payload)
            opik_context.update_current_span(metadata=payload)
        except exceptions.OpikException:
            pass
        except Exception:
            logger.debug("Failed to inject config metadata into trace", exc_info=True)

    def _build_trace_metadata(
        self,
        attr: str,
        value: typing.Any,
        shared_cache: typing.Optional[cache_mod.SharedConfigCache],
    ) -> typing.Dict[str, typing.Any]:
        state = self._state
        project = typing.cast(
            str, state.project
        )  # guarded by _resolve_field caller chain
        resolved_cache = (
            shared_cache
            if shared_cache is not None
            else cache_mod.get_cached_config(project, state.env, state.mask_id)
        )

        config_field = type(self).__field_metadata__[attr]
        if value is _MISSING:
            value = resolved_cache.values.get(config_field.prefixed_key, _MISSING)

        values = (
            {config_field.prefixed_key: _build_field_info(config_field, value)}
            if value is not _MISSING
            else {}
        )

        result: typing.Dict[str, typing.Any] = {
            "blueprint_id": resolved_cache.blueprint_id,
        }
        if state.mask_id is not None:
            result["_mask_id"] = state.mask_id
        result["values"] = values
        return result
