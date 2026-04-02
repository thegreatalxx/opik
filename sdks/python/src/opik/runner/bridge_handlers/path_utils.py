"""Shared path validation and repo-root scoping."""

import fnmatch
import os
from pathlib import Path

from . import CommandError

SENSITIVE_PATTERNS = [".env", "*.pem", "*.key", "*secret*", "*credential*"]


def validate_path(path: str, repo_root: Path) -> Path:
    """Resolve path relative to repo_root. Raises CommandError on traversal or sensitive file."""
    if ".." in path.split(os.sep):
        raise CommandError("path_traversal", f"Path contains '..': {path}")

    candidate = (repo_root / path).resolve()
    try:
        candidate.relative_to(repo_root.resolve())
    except ValueError:
        raise CommandError(
            "path_traversal",
            f"Path resolves outside repo root: {path}",
        )

    real = Path(os.path.realpath(candidate))
    try:
        real.relative_to(repo_root.resolve())
    except ValueError:
        raise CommandError(
            "path_traversal",
            f"Symlink resolves outside repo root: {path}",
        )

    basename = real.name
    for pattern in SENSITIVE_PATTERNS:
        if fnmatch.fnmatch(basename, pattern) or fnmatch.fnmatch(
            basename.lower(), pattern.lower()
        ):
            raise CommandError("sensitive_path", f"Sensitive file blocked: {path}")

    return real


def is_binary(path: Path) -> bool:
    """Check first 8KB for null bytes."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(8192)
        return b"\x00" in chunk
    except OSError:
        return False
