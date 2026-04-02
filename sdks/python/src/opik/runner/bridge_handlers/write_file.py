"""write_file bridge command handler."""

from pathlib import Path
from typing import Any, Dict

from . import CommandError
from .edit_utils import generate_diff
from .path_utils import validate_path


class WriteFileHandler:
    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root

    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        path_str = args.get("path", "")
        content = args.get("content", "")

        resolved = validate_path(path_str, self._repo_root)

        old_content = None
        created = True
        if resolved.exists() and resolved.is_file():
            created = False
            try:
                old_content = resolved.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                old_content = None

        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")
        bytes_written = len(content.encode("utf-8"))

        rel_path = str(resolved.relative_to(self._repo_root.resolve()))

        diff = ""
        if not created and old_content is not None:
            diff = generate_diff(old_content, content, rel_path)

        return {
            "bytes_written": bytes_written,
            "created": created,
            "diff": diff,
        }
