"""read_file bridge command handler."""

from pathlib import Path
from typing import Any, Dict

from . import CommandError
from .path_utils import is_binary, validate_path

_MAX_LINES = 2000
_MAX_BYTES = 512 * 1024


class ReadFileHandler:
    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root

    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        path_str = args.get("path", "")
        offset = args.get("offset", 0)
        limit = args.get("limit", _MAX_LINES)

        resolved = validate_path(path_str, self._repo_root)

        if not resolved.exists():
            raise CommandError("file_not_found", f"File not found: {path_str}")

        if not resolved.is_file():
            raise CommandError("file_not_found", f"Not a file: {path_str}")

        if is_binary(resolved):
            raise CommandError(
                "binary_file", f"Binary file detected: {path_str}"
            )

        try:
            content = resolved.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise CommandError(
                "binary_file", f"Cannot decode as UTF-8: {path_str}"
            )

        all_lines = content.splitlines(keepends=True)
        total_lines = len(all_lines)

        if offset >= total_lines and total_lines > 0:
            raise CommandError(
                "invalid_offset",
                f"Offset {offset} beyond file length ({total_lines} lines)",
            )

        effective_limit = min(limit, _MAX_LINES)
        selected = all_lines[offset : offset + effective_limit]

        result_content = "".join(selected)
        truncated = False

        if len(result_content.encode("utf-8")) > _MAX_BYTES:
            byte_count = 0
            cut_at = 0
            for i, line in enumerate(selected):
                line_bytes = len(line.encode("utf-8"))
                if byte_count + line_bytes > _MAX_BYTES:
                    cut_at = i
                    break
                byte_count += line_bytes
            else:
                cut_at = len(selected)
            selected = selected[:cut_at]
            result_content = "".join(selected)
            truncated = True

        if offset + len(selected) < total_lines:
            truncated = True

        result: Dict[str, Any] = {
            "content": result_content,
            "total_lines": total_lines,
            "truncated": truncated,
            "encoding": "utf-8",
        }
        if truncated:
            result["shown_lines"] = len(selected)
            result["offset"] = offset
        return result
