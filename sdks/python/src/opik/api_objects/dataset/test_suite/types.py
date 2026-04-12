"""Type definitions for test suite."""

from __future__ import annotations

from typing import Any, Dict, List, TypedDict

from typing_extensions import Required

from ..execution_policy import ExecutionPolicy
from .test_suite_result import TestSuiteResult, ItemResult

__all__ = ["TestSuiteItem", "TestSuiteResult", "ItemResult"]


class TestSuiteItem(TypedDict, total=False):
    """A test case item to add to a test suite."""

    data: Required[Dict[str, Any]]
    assertions: List[str]
    description: str
    execution_policy: ExecutionPolicy
