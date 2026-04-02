"""list_files bridge command handler."""

import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from . import CommandError
from .path_utils import validate_path

LOGGER = logging.getLogger(__name__)

_MAX_ENTRIES = 1000
_MAX_BYTES = 512 * 1024


def _git_ls_files(repo_root: Path, subdir: Optional[Path] = None) -> Optional[Set[str]]:
    """Get tracked + untracked-but-not-ignored files via git. Returns None if not a git repo."""
    try:
        target = subdir or repo_root
        tracked = subprocess.run(
            ["git", "ls-files"],
            cwd=str(target),
            capture_output=True,
            text=True,
            timeout=10,
        )
        if tracked.returncode != 0:
            return None

        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=str(target),
            capture_output=True,
            text=True,
            timeout=10,
        )

        files = set()
        for line in tracked.stdout.splitlines():
            if line.strip():
                files.add(line.strip())
        for line in untracked.stdout.splitlines():
            if line.strip():
                files.add(line.strip())
        return files
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


class ListFilesHandler:
    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root

    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        pattern = args.get("pattern", "**/*")
        path_str = args.get("path", "")

        if path_str:
            base = validate_path(path_str, self._repo_root)
            if not base.is_dir():
                raise CommandError("file_not_found", f"Not a directory: {path_str}")
        else:
            base = self._repo_root.resolve()

        git_files = _git_ls_files(self._repo_root, base)

        matched: List[tuple] = []
        for p in base.glob(pattern):
            if not p.is_file():
                continue
            try:
                rel = str(p.relative_to(self._repo_root.resolve()))
            except ValueError:
                continue

            if git_files is not None:
                git_rel = str(p.relative_to(base)) if base != self._repo_root.resolve() else rel
                if git_rel not in git_files and rel not in git_files:
                    continue

            try:
                mtime = p.stat().st_mtime
            except OSError:
                mtime = 0
            matched.append((rel, mtime))

        matched.sort(key=lambda x: x[1], reverse=True)

        total = len(matched)
        truncated = total > _MAX_ENTRIES

        entries = [m[0] for m in matched[:_MAX_ENTRIES]]

        result_str = "\n".join(entries)
        if len(result_str.encode("utf-8")) > _MAX_BYTES:
            byte_count = 0
            cut_at = 0
            for i, e in enumerate(entries):
                line_bytes = len((e + "\n").encode("utf-8"))
                if byte_count + line_bytes > _MAX_BYTES:
                    cut_at = i
                    break
                byte_count += line_bytes
            else:
                cut_at = len(entries)
            entries = entries[:cut_at]
            truncated = True

        return {
            "files": entries,
            "total": total,
            "truncated": truncated,
        }
