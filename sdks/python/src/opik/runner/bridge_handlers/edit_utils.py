"""Edit matching utilities — BOM, line endings, fuzzy normalization, diff generation."""

import difflib
import re
import unicodedata
from dataclasses import dataclass
from typing import List, Optional

from . import CommandError

_SMART_DOUBLE_OPEN = "\u201c"
_SMART_DOUBLE_CLOSE = "\u201d"
_SMART_SINGLE_OPEN = "\u2018"
_SMART_SINGLE_CLOSE = "\u2019"
_EM_DASH = "\u2014"
_EN_DASH = "\u2013"
_MINUS_SIGN = "\u2212"
_NBSP = "\u00a0"
_THIN_SPACE = "\u2009"
_HAIR_SPACE = "\u200a"


def strip_bom(content: str) -> tuple:
    if content.startswith("\ufeff"):
        return content[1:], "\ufeff"
    return content, ""


def detect_line_ending(content: str) -> str:
    crlf = content.find("\r\n")
    lf = content.find("\n")
    if lf == -1:
        return "\n"
    if crlf == -1:
        return "\n"
    return "\r\n" if crlf <= lf else "\n"


def normalize_to_lf(content: str) -> str:
    return content.replace("\r\n", "\n")


def restore_line_ending(content: str, ending: str) -> str:
    if ending == "\r\n":
        return content.replace("\n", "\r\n")
    return content


def fuzzy_normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace(_SMART_DOUBLE_OPEN, '"').replace(_SMART_DOUBLE_CLOSE, '"')
    text = text.replace(_SMART_SINGLE_OPEN, "'").replace(_SMART_SINGLE_CLOSE, "'")
    text = text.replace(_EM_DASH, "-").replace(_EN_DASH, "-").replace(_MINUS_SIGN, "-")
    text = text.replace(_NBSP, " ").replace(_THIN_SPACE, " ").replace(_HAIR_SPACE, " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text


@dataclass
class MatchResult:
    start: int
    length: int
    fuzzy: bool


def find_match(content: str, old_string: str) -> Optional[MatchResult]:
    """Find old_string in content. Returns MatchResult or raises on ambiguous. Returns None if not found."""
    first = content.find(old_string)
    if first != -1:
        second = content.find(old_string, first + 1)
        if second != -1:
            count = content.count(old_string)
            raise CommandError(
                "match_ambiguous",
                f"Found {count} matches for the search string",
            )
        return MatchResult(start=first, length=len(old_string), fuzzy=False)

    norm_content = fuzzy_normalize(content)
    norm_old = fuzzy_normalize(old_string)
    first = norm_content.find(norm_old)
    if first != -1:
        second = norm_content.find(norm_old, first + 1)
        if second != -1:
            count = norm_content.count(norm_old)
            raise CommandError(
                "match_ambiguous",
                f"Found {count} fuzzy matches for the search string",
            )
        return MatchResult(start=first, length=len(norm_old), fuzzy=True)

    return None


def validate_edits(
    matches: List[tuple],
) -> None:
    """Validate that matches don't overlap. matches is list of (start, length, new_string)."""
    sorted_matches = sorted(matches, key=lambda m: m[0])
    for i in range(len(sorted_matches) - 1):
        end_a = sorted_matches[i][0] + sorted_matches[i][1]
        start_b = sorted_matches[i + 1][0]
        if end_a > start_b:
            raise CommandError("edits_overlap", "Two edits overlap in the file")


def apply_edits(content: str, matches: List[tuple]) -> str:
    """Apply edits in reverse order. matches is list of (start, length, new_string)."""
    sorted_matches = sorted(matches, key=lambda m: m[0], reverse=True)
    for start, length, new_string in sorted_matches:
        content = content[:start] + new_string + content[start + length:]
    return content


def generate_diff(old: str, new: str, path: str, context_lines: int = 4) -> str:
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=f"a/{path}",
        tofile=f"b/{path}",
        n=context_lines,
    )
    return "".join(diff)
