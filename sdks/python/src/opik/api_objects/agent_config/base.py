import dataclasses
import logging
import typing

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


class AgentConfig:
    """Base class for user-defined agent configurations.

    Subclass this and declare typed fields::

        class MyConfig(opik.AgentConfig):
            temperature: Annotated[float, "Sampling temperature"]
            model: str

    Instantiate directly for a plain dataclass (no server interaction)::

        cfg = MyConfig(temperature=0.5, model="gpt-4")
    """

    __opik_fields__: typing.ClassVar[typing.Dict[str, ConfigField]]

    _opik_project: typing.Optional[str]
    _opik_env: typing.Optional[str]
    _opik_mask_id: typing.Optional[str]
    _opik_manager: typing.Any
    _opik_blueprint_id: typing.Optional[str]

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
        cls.__opik_fields__ = fields

        original_init = cls.__init__

        def _wrapped_init(
            self: typing.Any, *args: typing.Any, **kwargs: typing.Any
        ) -> None:  # type: ignore[no-untyped-def]
            original_init(self, *args, **kwargs)
            object.__setattr__(self, "_opik_project", None)
            object.__setattr__(self, "_opik_env", None)
            object.__setattr__(self, "_opik_mask_id", None)
            object.__setattr__(self, "_opik_manager", None)
            object.__setattr__(self, "_opik_blueprint_id", None)

        cls.__init__ = _wrapped_init  # type: ignore[assignment]

    def __getattribute__(self, attr: str) -> typing.Any:
        if attr.startswith("_") or attr not in type(self).__opik_fields__:
            return object.__getattribute__(self, attr)

        if object.__getattribute__(self, "_opik_project") is None:
            return object.__getattribute__(self, attr)

        masked = self._get_masked_value(attr)
        if masked is not _MISSING:
            self._inject_trace_metadata(
                attr, value=masked, mask_id=get_active_config_mask()
            )
            return masked

        instance_cache = cache_mod.get_cached_config(
            object.__getattribute__(self, "_opik_project"),
            object.__getattribute__(self, "_opik_env"),
            object.__getattribute__(self, "_opik_mask_id"),
        )
        prefixed_key = type(self).__opik_fields__[attr].prefixed_key
        value = instance_cache.values.get(prefixed_key, _MISSING)
        self._inject_trace_metadata(
            attr,
            value=value,
            shared_cache=instance_cache,
            mask_id=object.__getattribute__(self, "_opik_mask_id"),
        )
        return value if value is not _MISSING else object.__getattribute__(self, attr)

    # ------------------------------------------------------------------
    # Blueprint management
    # ------------------------------------------------------------------

    def _extract_fields_with_values(self) -> typing.Dict[str, tuple]:
        result: typing.Dict[str, tuple] = {}
        for f_name, cf in type(self).__opik_fields__.items():
            value = object.__getattribute__(self, f_name)
            result[cf.prefixed_key] = (cf.py_type, value, cf.description)
        return result

    def _prefixed_field_types(self) -> typing.Dict[str, typing.Any]:
        return {
            cf.prefixed_key: cf.py_type for cf in type(self).__opik_fields__.values()
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
            object.__setattr__(self, "_opik_manager", manager)
            object.__setattr__(self, "_opik_blueprint_id", latest.id)
            return latest.name or ""

        bp = manager.create_blueprint(
            fields_with_values=fields_with_values,
            description=description,
            field_types=field_types,
        )
        object.__setattr__(self, "_opik_manager", manager)
        object.__setattr__(self, "_opik_blueprint_id", bp.id)
        return bp.name or ""

    def deploy_to(self, env: str) -> None:
        """Tag the current version with an environment name.

        Can be called after ``create_agent_config_version`` or
        ``get_agent_config``.

        Args:
            env: Environment name (e.g. ``"PROD"``).
        """
        manager = object.__getattribute__(self, "_opik_manager")
        blueprint_id = object.__getattribute__(self, "_opik_blueprint_id")
        if manager is None or blueprint_id is None:
            raise RuntimeError(
                "deploy_to() requires a prior call to "
                "create_agent_config_version() or get_agent_config()."
            )
        manager.tag_blueprint_with_env(env=env, blueprint_id=blueprint_id)

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
            cf.prefixed_key: cf.py_type for cf in cls.__opik_fields__.values()
        }

        if version is not None:
            bp = manager.get_blueprint(name=version, field_types=field_types)
        elif latest:
            bp = manager.get_blueprint(field_types=field_types)
        else:
            bp = manager.get_blueprint(env=env, field_types=field_types)

        if bp is None:
            return fallback

        kwargs: typing.Dict[str, typing.Any] = {}
        for f_name, cf in cls.__opik_fields__.items():
            bp_value = bp.get(cf.prefixed_key)
            if bp_value is not None:
                kwargs[f_name] = bp_value
            else:
                kwargs[f_name] = object.__getattribute__(fallback, f_name)

        instance = cls(**kwargs)

        resolved_env = None if (latest or version is not None) else env
        object.__setattr__(instance, "_opik_project", project_name)
        object.__setattr__(instance, "_opik_env", resolved_env)
        object.__setattr__(instance, "_opik_mask_id", None)
        object.__setattr__(instance, "_opik_manager", manager)
        object.__setattr__(instance, "_opik_blueprint_id", bp.id)

        shared_cache = cache_mod.init_cache_entry(
            project_name, resolved_env, None, field_types, manager
        )
        shared_cache.update(bp)

        return instance

    # ------------------------------------------------------------------
    # Cache / mask / trace helpers
    # ------------------------------------------------------------------

    def _get_masked_value(self, attr: str) -> typing.Any:
        context_mask = get_active_config_mask()
        if context_mask is None:
            return _MISSING

        try:
            manager = object.__getattribute__(self, "_opik_manager")
            if manager is None:
                return _MISSING

            prefixed_key = type(self).__opik_fields__[attr].prefixed_key
            project = object.__getattribute__(self, "_opik_project")
            env = object.__getattribute__(self, "_opik_env")
            mask_id = object.__getattribute__(self, "_opik_mask_id")

            base_cache = cache_mod.get_cached_config(project, env, mask_id)
            mask_cache = cache_mod.get_cached_config(project, env, context_mask)
            mask_cache.register_fields(base_cache.all_field_types)

            if not mask_cache.values:
                bp = manager.get_blueprint(
                    mask_id=context_mask,
                    env=env,
                    field_types=base_cache.all_field_types,
                )
                if bp is not None:
                    mask_cache.update(bp)

            if prefixed_key in mask_cache.values:
                return mask_cache.values[prefixed_key]
        except Exception:
            logger.debug("Failed to get masked config value", exc_info=True)

        return _MISSING

    def _inject_trace_metadata(
        self,
        attr: str,
        value: typing.Any = _MISSING,
        *,
        shared_cache: typing.Optional[cache_mod.SharedConfigCache] = None,
        mask_id: typing.Optional[str] = None,
    ) -> None:
        from opik import exceptions, opik_context

        try:
            project = object.__getattribute__(self, "_opik_project")
            env = object.__getattribute__(self, "_opik_env")
            inst_mask = object.__getattribute__(self, "_opik_mask_id")

            resolved_cache = (
                shared_cache
                if shared_cache is not None
                else cache_mod.get_cached_config(project, env, inst_mask)
            )

            config_field = type(self).__opik_fields__[attr]
            prefixed_key = config_field.prefixed_key

            if value is _MISSING:
                value = resolved_cache.values.get(prefixed_key, _MISSING)

            if value is not _MISSING:
                field_info: typing.Dict[str, typing.Any] = {
                    "value": type_helpers.python_value_to_metadata_value(
                        value, config_field.py_type
                    ),
                    "type": type_helpers.python_type_to_backend_type(
                        config_field.py_type
                    ),
                    **(
                        {"description": config_field.description}
                        if config_field.description is not None
                        else {}
                    ),
                }
                values = {prefixed_key: field_info}
            else:
                values = {}

            agent_config_metadata: typing.Dict[str, typing.Any] = {
                "blueprint_id": resolved_cache.blueprint_id,
            }
            if mask_id is not None:
                agent_config_metadata["_mask_id"] = mask_id
            agent_config_metadata["values"] = values

            opik_context.update_current_trace(
                metadata={"agent_configuration": agent_config_metadata}
            )
        except exceptions.OpikException:
            pass
        except Exception:
            logger.debug("Failed to inject config metadata into trace", exc_info=True)
