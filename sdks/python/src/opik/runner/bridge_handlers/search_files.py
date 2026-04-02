"""search_files bridge command handler."""

import fnmatch
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from . import CommandError
from .path_utils import is_binary, validate_path

LOGGER = logging.getLogger(__name__)

_MAX_MATCHES = 100
_MAX_BYTES = 512 * 1024
_MAX_LINE_CHARS = 500
_CONTEXT_LINES = 3


def _git_ls_files(repo_root: Path, subdir: Optional[Path] = None) -> Optional[Set[str]]:
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


def _truncate_line(line: str) -> str:
    if len(line) > _MAX_LINE_CHARS:
        return line[:_MAX_LINE_CHARS] + "..."
    return line


class SearchFilesHandler:
    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root

    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        pattern_str = args.get("pattern", "")
        glob_filter = args.get("glob", None)
        path_str = args.get("path", "")

        if not pattern_str:
            raise CommandError("match_not_found", "Empty search pattern")

        try:
            regex = re.compile(pattern_str)
        except re.error as e:
            raise CommandError("match_not_found", f"Invalid regex: {e}")

        if path_str:
            base = validate_path(path_str, self._repo_root)
            if not base.is_dir():
                raise CommandError("file_not_found", f"Not a directory: {path_str}")
        else:
            base = self._repo_root.resolve()

        git_files = _git_ls_files(self._repo_root, base)

        matches: List[Dict[str, Any]] = []
        total_bytes = 0
        truncated = False

        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if not d.startswith(".")]

            for fname in sorted(files):
                if len(matches) >= _MAX_MATCHES:
                    truncated = True
                    break

                fpath = Path(root) / fname
                try:
                    rel = str(fpath.relative_to(self._repo_root.resolve()))
                except ValueError:
                    continue

                if git_files is not None:
                    git_rel = str(fpath.relative_to(base)) if base != self._repo_root.resolve() else rel
                    if git_rel not in git_files and rel not in git_files:
                        continue

                if glob_filter and not fnmatch.fnmatch(fname, glob_filter):
                    if not fnmatch.fnmatch(rel, glob_filter):
                        continue

                if is_binary(fpath):
                    continue

                try:
                    content = fpath.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError):
                    continue

                lines = content.splitlines()
                for line_num, line in enumerate(lines):
                    if len(matches) >= _MAX_MATCHES:
                        truncated = True
                        break

                    if regex.search(line):
                        ctx_before = [
                            _truncate_line(lines[i])
                            for i in range(
                                max(0, line_num - _CONTEXT_LINES), line_num
                            )
                        ]
                        ctx_after = [
                            _truncate_line(lines[i])
                            for i in range(
                                line_num + 1,
                                min(len(lines), line_num + 1 + _CONTEXT_LINES),
                            )
                        ]

                        match_entry = {
                            "file": rel,
                            "line": line_num + 1,
                            "content": _truncate_line(line),
                            "context_before": ctx_before,
                            "context_after": ctx_after,
                        }

                        entry_size = len(str(match_entry).encode("utf-8"))
                        if total_bytes + entry_size > _MAX_BYTES:
                            truncated = True
                            break

                        total_bytes += entry_size
                        matches.append(match_entry)

            if truncated:
                break

        return {
            "matches": matches,
            "total_matches": len(matches),
            "truncated": truncated,
        }
