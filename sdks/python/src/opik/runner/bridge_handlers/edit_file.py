"""edit_file bridge command handler."""

from pathlib import Path
from typing import Any, Dict, List

from . import CommandError
from .edit_utils import (
    apply_edits,
    detect_line_ending,
    find_match,
    fuzzy_normalize,
    generate_diff,
    normalize_to_lf,
    restore_line_ending,
    strip_bom,
    validate_edits,
)
from .path_utils import is_binary, validate_path


class EditFileHandler:
    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root

    def execute(self, args: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        path_str = args.get("path", "")
        edits = args.get("edits", [])

        if not edits:
            raise CommandError("no_change", "No edits provided")

        resolved = validate_path(path_str, self._repo_root)

        if not resolved.exists():
            raise CommandError("file_not_found", f"File not found: {path_str}")

        if not resolved.is_file():
            raise CommandError("file_not_found", f"Not a file: {path_str}")

        if is_binary(resolved):
            raise CommandError("binary_file", f"Binary file detected: {path_str}")

        try:
            raw_bytes = resolved.read_bytes()
            raw_content = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise CommandError("binary_file", f"Cannot decode as UTF-8: {path_str}")

        content_no_bom, bom = strip_bom(raw_content)
        line_ending = detect_line_ending(content_no_bom)
        content_lf = normalize_to_lf(content_no_bom)

        for edit in edits:
            old = edit.get("old_string", "")
            new = edit.get("new_string", "")
            if not old:
                raise CommandError("match_not_found", "Empty old_string in edit")
            if old == new:
                raise CommandError("no_change", "old_string equals new_string")

        # Tier 1: exact matching on LF-normalized content
        matches = []
        all_exact = True
        for edit in edits:
            old = normalize_to_lf(edit["old_string"])
            match = None
            try:
                first = content_lf.find(old)
                if first != -1:
                    second = content_lf.find(old, first + 1)
                    if second != -1:
                        count = content_lf.count(old)
                        raise CommandError(
                            "match_ambiguous",
                            f"Found {count} matches for the search string",
                        )
                    match = (first, len(old), False)
            except CommandError:
                raise

            if match is None:
                all_exact = False
                break
            matches.append((*match, normalize_to_lf(edit["new_string"])))

        # Tier 2: fuzzy matching if any exact match failed
        fuzzy_used = False
        if not all_exact:
            matches = []
            fuzzy_content = fuzzy_normalize(content_lf)
            for edit in edits:
                old_lf = normalize_to_lf(edit["old_string"])
                new_lf = normalize_to_lf(edit["new_string"])
                norm_old = fuzzy_normalize(old_lf)

                first = fuzzy_content.find(norm_old)
                if first == -1:
                    raise CommandError(
                        "match_not_found",
                        f"Could not find match for edit in {path_str}",
                    )
                second = fuzzy_content.find(norm_old, first + 1)
                if second != -1:
                    count = fuzzy_content.count(norm_old)
                    raise CommandError(
                        "match_ambiguous",
                        f"Found {count} fuzzy matches for the search string",
                    )
                matches.append((first, len(norm_old), True, new_lf))
                fuzzy_used = True

        match_tuples = [(m[0], m[1], m[3]) for m in matches]
        validate_edits([(m[0], m[1]) for m in matches])

        if fuzzy_used:
            new_content = apply_edits(fuzzy_normalize(content_lf), match_tuples)
        else:
            new_content = apply_edits(content_lf, match_tuples)

        if new_content == (fuzzy_normalize(content_lf) if fuzzy_used else content_lf):
            raise CommandError("no_change", "Edit produces identical content")

        new_content = restore_line_ending(new_content, line_ending)
        new_content = bom + new_content

        resolved.write_bytes(new_content.encode("utf-8"))

        rel_path = str(resolved.relative_to(self._repo_root.resolve()))
        diff = generate_diff(raw_content, new_content, rel_path)

        return {
            "diff": diff,
            "edits_applied": len(edits),
            "fuzzy_match_used": fuzzy_used,
        }
