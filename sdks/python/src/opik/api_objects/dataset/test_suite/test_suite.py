"""
Test Suite API for regression testing LLM applications.

Test Suites are pre-configured regression test suites that let you
validate that prompt changes, model updates, or code modifications don't
break existing functionality.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from opik.api_objects import opik_client as opik_client_module
    from opik.evaluation.suite_evaluators.llm_judge import LLMJudge

from opik import id_helpers
from opik import exceptions as opik_exceptions
from opik.api_objects.prompt import base_prompt
from opik.api_objects.dataset import dataset, dataset_item
from . import types as suite_types
from .report_processors import displayer, file_writer
from .. import validators, execution_policy, rest_operations


LOGGER = logging.getLogger(__name__)

LLMTask = Callable[[Dict[str, Any]], Any]


def _evaluators_equal(a: List[LLMJudge], b: List[LLMJudge]) -> bool:
    """Compare two lists of LLMJudge evaluators by their assertion sets."""
    a_assertions = sorted(assertion for e in a for assertion in e.assertions)
    b_assertions = sorted(assertion for e in b for assertion in e.assertions)
    return a_assertions == b_assertions


def validate_task_result(
    result: Any,
    input_data: Any = None,
) -> Dict[str, Any]:
    """Normalise the value returned by a task function into a result dict.

    If *result* is already a :class:`dict`, it is returned as-is (the
    supported keys are ``"input"`` and ``"output"``).

    For any other type the value is wrapped automatically::

        {"output": result}

    When *input_data* is also provided the wrapper becomes::

        {"input": input_data, "output": result}

    Args:
        result: Value returned by the task callable.
        input_data: Optional input that was passed to the task. Included in
            the wrapper dict as ``"input"`` when *result* is not a dict.

    Returns:
        A dict suitable for use as an experiment trace result.
    """
    if isinstance(result, dict):
        missing = {"input", "output"} - result.keys()
        if missing:
            raise ValueError(
                f"The task function must return a dict with 'input' and "
                f"'output' keys, but the returned dict is missing: "
                f"{missing}. Got keys: {set(result.keys())}. "
                f"Example: return {{'input': data, 'output': response}}"
            )
        return result

    wrapped: Dict[str, Any] = {"output": result}
    if input_data is not None:
        wrapped["input"] = input_data
    return wrapped


class TestSuite:
    """
    A pre-configured regression test suite for LLM applications.

    Test Suites let you:
    - Define test cases with inputs and context
    - Configure assertions that will be checked by an LLM
    - Run tests against any task function

    Suite-level assertions and execution policy are stored in the dataset's
    metadata and read by the evaluation engine when running the suite.

    Example:
        >>> import opik
        >>>
        >>> client = opik.Opik()
        >>>
        >>> suite = client.create_test_suite(
        ...     name="Refund Policy Tests",
        ...     description="Regression tests for refund scenarios",
        ...     global_assertions=[
        ...         "Response does not contain hallucinated information",
        ...         "Response is helpful to the user",
        ...     ],
        ... )
        >>>
        >>> suite.insert([
        ...     {
        ...         "data": {"user_input": "How do I get a refund?", "user_tier": "premium"},
        ...         "assertions": ["Response is polite"],
        ...     },
        ... ])
        >>>
        >>> results = opik.run_tests(test_suite=suite, task=my_llm_function)
    """

    def __init__(
        self,
        name: str,
        dataset_: dataset.Dataset,
        client: Optional["opik_client_module.Opik"] = None,
    ):
        """
        Internal constructor — not part of the public API.

        Use :meth:`opik.Opik.create_test_suite` or
        :meth:`opik.Opik.get_or_create_test_suite` instead.
        """
        self._name = name
        self._dataset = dataset_
        self._client = client

    @property
    def id(self) -> str:
        """The ID of the test suite."""
        return self._dataset.id

    @property
    def name(self) -> str:
        """The name of the test suite."""
        return self._name

    @property
    def description(self) -> Optional[str]:
        """The description of the test suite."""
        return self._dataset.description

    @property
    def project_name(self) -> Optional[str]:
        """The project name associated with the test suite."""
        return self._dataset.project_name

    def get_tags(self) -> List[str]:
        """
        Get the tags for the suite.

        Returns:
            List of tag strings.
        """
        return self._dataset.get_tags()

    def get_current_version_name(self) -> Optional[str]:
        """
        Get the current version name of the test suite.

        Returns:
            The current version name (e.g., 'v1', 'v2'), or None if
            no version exists.
        """
        return self._dataset.get_current_version_name()

    def get_version_info(
        self,
    ) -> Optional[Any]:
        """
        Get version information for the current (latest) version.

        Returns:
            DatasetVersionPublic containing the current version's metadata,
            or None if no version exists yet.
        """
        return self._dataset.get_version_info()

    def get_version_view(self, version_name: str) -> Any:
        """
        Get a read-only view of a specific version.

        Args:
            version_name: The version name (e.g., 'v1', 'v2').

        Returns:
            A read-only DatasetVersion object for accessing the specified
            version's items and metadata.

        Raises:
            opik.exceptions.DatasetVersionNotFound: If the version does not
                exist.
        """
        return self._dataset.get_version_view(version_name)

    def get_items(
        self,
        nb_samples: Optional[int] = None,
        filter_string: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve suite items as a list of dictionaries.

        Each item dict has keys:
        - "id": the dataset item ID (str)
        - "data": the test case data (dict)
        - "description": optional item description (str or None)
        - "assertions": list of assertion strings (or empty list)
        - "execution_policy": ExecutionPolicyItem or None

        Args:
            nb_samples: Maximum number of items to retrieve.
                If None, all items are returned.
            filter_string: Optional OQL filter string to filter items.

        Returns:
            A list of item dictionaries.
        """
        from opik.evaluation.suite_evaluators import llm_judge
        from opik.evaluation.suite_evaluators.llm_judge import config as llm_judge_config

        result = []
        for item in self._dataset.__internal_api__stream_items_as_dataclasses__(
            nb_samples=nb_samples,
            filter_string=filter_string,
        ):
            item_assertions: List[str] = []
            if item.evaluators:
                for e in item.evaluators:
                    if e.type == "llm_judge":
                        cfg = llm_judge_config.LLMJudgeConfig(**e.config)
                        judge = llm_judge.LLMJudge.from_config(cfg)
                        item_assertions.extend(judge.assertions)

            result.append(
                {
                    "id": item.id,
                    "data": item.get_content(),
                    "description": item.description,
                    "assertions": item_assertions,
                    "execution_policy": item.execution_policy,
                }
            )
        return result

    def update(
        self,
        *,
        global_execution_policy: Optional[execution_policy.ExecutionPolicy] = None,
        global_assertions: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
    ) -> None:
        """
        Update the suite-level assertions, execution policy, and/or tags.

        Supports partial updates: any parameter not provided will retain
        its current value. If the new values are identical to the current
        values, no new version is created.

        Args:
            global_execution_policy: New execution policy for the suite.
                If not provided, the current policy is kept.
            global_assertions: New suite-level assertions. Each string
                describes an expected behavior that will be checked by an
                LLM. If not provided, the current assertions are kept.
            tags: Tags for the suite.

        Raises:
            ValueError: If nothing to update is provided.
        """
        if global_execution_policy is not None:
            validators.validate_execution_policy(global_execution_policy)

        resolved = validators.resolve_evaluators(
            global_assertions, None, "suite-level assertions"
        )

        if resolved is None and global_execution_policy is None and tags is None:
            raise ValueError(
                "At least one of 'global_assertions', "
                "'global_execution_policy', or 'tags' must be provided."
            )

        if tags is not None:
            self._dataset._rest_client.datasets.update_dataset(
                id=self._dataset.id,
                name=self._name,
                tags=tags,
            )

        has_version_updates = resolved is not None or global_execution_policy is not None
        if has_version_updates:
            version_info = self._dataset.get_version_info()
            if version_info is None:
                raise RuntimeError(
                    f"Cannot update test suite '{self._name}': "
                    "no version info found. Add at least one item first."
                )

            current_evaluators = self._dataset.get_evaluators()
            current_policy = self.get_execution_policy()

            new_evaluators = resolved if resolved is not None else current_evaluators
            new_policy = global_execution_policy if global_execution_policy is not None else current_policy

            if _evaluators_equal(new_evaluators, current_evaluators) and new_policy == current_policy:
                return

            change_parts: List[str] = []
            if resolved is not None:
                change_parts.append("assertions")
            if global_execution_policy is not None:
                change_parts.append("execution policy")

            rest_operations.update_test_suite_dataset(
                rest_client=self._dataset._rest_client,
                dataset_id=self._dataset.id,
                base_version_id=version_info.id,
                evaluators=new_evaluators,
                exec_policy=new_policy,
                change_description=f"Updated {' and '.join(change_parts)} via SDK",
            )

    def delete(self, items_ids: List[str]) -> None:
        """
        Delete items from the test suite by their IDs.

        Args:
            items_ids: List of item IDs to delete.
        """
        self._dataset.delete(items_ids)

    def clear(self) -> None:
        """
        Delete all items from the test suite.
        """
        item_ids = [
            item.id
            for item in self._dataset.__internal_api__stream_items_as_dataclasses__()
            if item.id is not None
        ]
        if item_ids:
            self._dataset.delete(item_ids)

    def get_execution_policy(self) -> execution_policy.ExecutionPolicy:
        """
        Get the suite-level execution policy.

        Returns:
            ExecutionPolicy dict with runs_per_item and pass_threshold.
        """
        return self._dataset.get_execution_policy()

    def get_assertions(self) -> List[str]:
        """
        Get the suite-level assertions.

        Returns:
            List of assertion strings.
        """
        evaluators = self._dataset.get_evaluators()
        assertions: List[str] = []
        for evaluator in evaluators:
            assertions.extend(evaluator.assertions)
        return assertions

    def update_items(
        self,
        items: List[Dict[str, Any]],
    ) -> None:
        """
        Update existing items in the test suite.

        Each item dict must include an ``"id"`` key identifying the item to
        update.  The remaining keys (``"data"``, ``"assertions"``,
        ``"description"``, ``"execution_policy"``) replace the previous values.

        Args:
            items: List of item dicts to update. Each must contain ``"id"``.

        Raises:
            DatasetItemUpdateOperationRequiresItemId: If any item is missing
                an ``"id"`` key.
        """
        for item in items:
            if "id" not in item:
                raise opik_exceptions.DatasetItemUpdateOperationRequiresItemId(
                    "Missing id for test suite item to update: %s", item
                )

        self.insert(items)

    def insert(
        self,
        items: List[suite_types.TestSuiteItem],
    ) -> None:
        """
        Insert test cases into the test suite.

        Args:
            items: List of test case items to add.

        Example:
            >>> suite.insert([
            ...     {"data": {"question": "How do I get a refund?"}},
            ...     {
            ...         "data": {"question": "Is my account hacked?"},
            ...         "assertions": ["Response treats the concern with urgency"],
            ...         "execution_policy": {"runs_per_item": 5, "pass_threshold": 4},
            ...     },
            ... ])
        """
        validators.validate_suite_items(items)

        ds_items: List[dataset_item.DatasetItem] = []
        for item in items:
            evaluators = validators.resolve_evaluators(
                item.get("assertions"), None, "item-level assertions"
            )

            evaluator_items = None
            if evaluators:
                evaluator_items = [
                    dataset_item.EvaluatorItem(
                        name=e.name,
                        type="llm_judge",
                        config=e.to_config().model_dump(by_alias=True),
                    )
                    for e in evaluators
                ]

            ep = item.get("execution_policy")
            execution_policy_item = None
            if ep:
                execution_policy_item = dataset_item.ExecutionPolicyItem(
                    runs_per_item=ep.get("runs_per_item"),
                    pass_threshold=ep.get("pass_threshold"),
                )

            ds_items.append(
                dataset_item.DatasetItem(
                    id=item.get("id", id_helpers.generate_id()),
                    description=item.get("description"),
                    evaluators=evaluator_items,
                    execution_policy=execution_policy_item,
                    **item["data"],
                )
            )

        self._dataset.__internal_api__insert_items_as_dataclasses__(ds_items)

    def __internal_api__run_optimization_suite__(
        self,
        task: LLMTask,
        *,
        experiment_name_prefix: Optional[str] = None,
        experiment_name: Optional[str] = None,
        project_name: Optional[str] = None,
        experiment_config: Optional[Dict[str, Any]] = None,
        prompts: Optional[List[base_prompt.BasePrompt]] = None,
        experiment_tags: Optional[List[str]] = None,
        verbose: int = 2,
        worker_threads: int = 16,
        model: Optional[str] = None,
        optimization_id: Optional[str] = None,
        experiment_type: Optional[str] = None,
        dataset_item_ids: Optional[List[str]] = None,
        dataset_filter_string: Optional[str] = None,
        client: Optional[opik_client_module.Opik] = None,
        generate_report: bool = True,
        report_output_path: Optional[str] = None,
    ) -> suite_types.TestSuiteResult:
        """
        Internal entry point used by the optimizer framework.
        """
        from opik.evaluation.evaluator import __internal_api__run_test_suite__

        return __internal_api__run_test_suite__(
            suite_dataset=self._dataset,
            task=task,
            client=client,
            dataset_item_ids=dataset_item_ids,
            dataset_filter_string=dataset_filter_string,
            experiment_name_prefix=experiment_name_prefix,
            experiment_name=experiment_name,
            project_name=project_name,
            experiment_config=experiment_config,
            prompts=prompts,
            experiment_tags=experiment_tags,
            verbose=verbose,
            task_threads=worker_threads,
            evaluator_model=model,
            optimization_id=optimization_id,
            experiment_type=experiment_type,
            generate_report=generate_report,
            report_output_path=report_output_path,
        )
