import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.edit_utils import (
    detect_line_ending,
    find_match,
    fuzzy_normalize,
    generate_diff,
    strip_bom,
)


class TestStripBom:
    def test_strip_bom__with_bom__returns_text_and_bom(self):
        text, bom = strip_bom("\ufeffhello")
        assert text == "hello"
        assert bom == "\ufeff"

    def test_strip_bom__without_bom__returns_text_and_empty(self):
        text, bom = strip_bom("hello")
        assert text == "hello"
        assert bom == ""


class TestDetectLineEnding:
    def test_detect_line_ending__crlf_first(self):
        assert detect_line_ending("a\r\nb\nc") == "\r\n"

    def test_detect_line_ending__lf_only(self):
        assert detect_line_ending("a\nb\n") == "\n"

    def test_detect_line_ending__no_newlines(self):
        assert detect_line_ending("abc") == "\n"


class TestFuzzyNormalize:
    def test_fuzzy_normalize__smart_quotes(self):
        result = fuzzy_normalize("\u201chello\u201d")
        assert result == '"hello"'

    def test_fuzzy_normalize__em_dash(self):
        result = fuzzy_normalize("a\u2014b")
        assert result == "a-b"

    def test_fuzzy_normalize__nbsp(self):
        result = fuzzy_normalize("a\u00a0b")
        assert result == "a b"

    def test_fuzzy_normalize__trailing_whitespace(self):
        result = fuzzy_normalize("hello   \n")
        assert result == "hello\n"

    def test_fuzzy_normalize__nfkc(self):
        # fi ligature -> "fi"
        result = fuzzy_normalize("\ufb01le")
        assert result == "file"


class TestFindMatch:
    def test_find_match__exact__returns_position(self):
        match = find_match("hello world", "world")
        assert match is not None
        assert match.start == 6
        assert match.length == 5
        assert match.fuzzy is False

    def test_find_match__fuzzy_fallback__returns_position(self):
        match = find_match("hello \u201cworld\u201d", '"world"')
        assert match is not None
        assert match.fuzzy is True

    def test_find_match__not_found__returns_none(self):
        match = find_match("hello world", "xyz")
        assert match is None

    def test_find_match__multiple__raises_with_count(self):
        with pytest.raises(CommandError) as exc_info:
            find_match("aaa", "a")
        assert exc_info.value.code == "match_ambiguous"
        assert "3" in exc_info.value.message


class TestGenerateDiff:
    def test_generate_diff__basic(self):
        old = "line1\nline2\nline3\n"
        new = "line1\nchanged\nline3\n"
        diff = generate_diff(old, new, "test.py")
        assert "--- a/test.py" in diff
        assert "+++ b/test.py" in diff
        assert "-line2" in diff
        assert "+changed" in diff

    def test_generate_diff__multiple_hunks(self):
        old_lines = [f"line{i}\n" for i in range(20)]
        new_lines = list(old_lines)
        new_lines[2] = "changed2\n"
        new_lines[17] = "changed17\n"
        diff = generate_diff("".join(old_lines), "".join(new_lines), "test.py")
        assert diff.count("@@") == 4  # 2 hunks, each with @@ ... @@
