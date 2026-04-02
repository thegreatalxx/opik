from pathlib import Path

import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.edit_file import EditFileHandler


@pytest.fixture
def repo(tmp_path):
    return tmp_path


@pytest.fixture
def handler(repo):
    return EditFileHandler(repo)


def _write(repo, name, content):
    f = repo / name
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")
    return f


class TestExactMatching:
    def test_edit__single_exact_match__applies(self, repo, handler):
        _write(repo, "a.py", "hello world\n")
        result = handler.execute(
            {
                "path": "a.py",
                "edits": [{"old_string": "hello", "new_string": "goodbye"}],
            },
            timeout=10,
        )
        assert result["edits_applied"] == 1
        assert "-hello" in result["diff"]
        assert "+goodbye" in result["diff"]
        assert (repo / "a.py").read_text() == "goodbye world\n"

    def test_edit__multi_edit__applies_all(self, repo, handler):
        _write(repo, "b.py", "aaa\nbbb\nccc\n")
        result = handler.execute(
            {
                "path": "b.py",
                "edits": [
                    {"old_string": "aaa", "new_string": "AAA"},
                    {"old_string": "ccc", "new_string": "CCC"},
                ],
            },
            timeout=10,
        )
        assert result["edits_applied"] == 2
        content = (repo / "b.py").read_text()
        assert "AAA" in content
        assert "CCC" in content
        assert "bbb" in content

    def test_edit__not_found__error(self, repo, handler):
        _write(repo, "c.py", "hello\n")
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "c.py",
                    "edits": [{"old_string": "xyz", "new_string": "abc"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "match_not_found"

    def test_edit__ambiguous__error(self, repo, handler):
        _write(repo, "d.py", "foo\nfoo\nfoo\n")
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "d.py",
                    "edits": [{"old_string": "foo", "new_string": "bar"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "match_ambiguous"

    def test_edit__overlap__error(self, repo, handler):
        _write(repo, "e.py", "abcdefgh\n")
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "e.py",
                    "edits": [
                        {"old_string": "abcde", "new_string": "ABCDE"},
                        {"old_string": "cdefg", "new_string": "CDEFG"},
                    ],
                },
                timeout=10,
            )
        assert exc_info.value.code == "edits_overlap"

    def test_edit__no_change__error(self, repo, handler):
        _write(repo, "f.py", "hello\n")
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "f.py",
                    "edits": [{"old_string": "hello", "new_string": "hello"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "no_change"


class TestBomHandling:
    def test_edit__bom_file__match_without_bom(self, repo, handler):
        _write(repo, "bom.py", "\ufeffhello world\n")
        result = handler.execute(
            {
                "path": "bom.py",
                "edits": [{"old_string": "hello", "new_string": "goodbye"}],
            },
            timeout=10,
        )
        assert result["edits_applied"] == 1

    def test_edit__bom_file__bom_preserved_after_edit(self, repo, handler):
        _write(repo, "bom2.py", "\ufeffhello\n")
        handler.execute(
            {
                "path": "bom2.py",
                "edits": [{"old_string": "hello", "new_string": "goodbye"}],
            },
            timeout=10,
        )
        content = (repo / "bom2.py").read_text()
        assert content.startswith("\ufeff")
        assert "goodbye" in content

    def test_edit__no_bom_file__no_bom_added(self, repo, handler):
        _write(repo, "nobom.py", "hello\n")
        handler.execute(
            {
                "path": "nobom.py",
                "edits": [{"old_string": "hello", "new_string": "goodbye"}],
            },
            timeout=10,
        )
        content = (repo / "nobom.py").read_text()
        assert not content.startswith("\ufeff")


class TestLineEndingHandling:
    def test_edit__crlf_file__match_with_lf(self, repo, handler):
        f = repo / "crlf.py"
        f.write_bytes(b"hello\r\nworld\r\n")
        result = handler.execute(
            {
                "path": "crlf.py",
                "edits": [{"old_string": "hello\nworld", "new_string": "goodbye\nworld"}],
            },
            timeout=10,
        )
        assert result["edits_applied"] == 1

    def test_edit__crlf_file__crlf_preserved_after_edit(self, repo, handler):
        f = repo / "crlf2.py"
        f.write_bytes(b"hello\r\nworld\r\n")
        handler.execute(
            {
                "path": "crlf2.py",
                "edits": [{"old_string": "hello", "new_string": "goodbye"}],
            },
            timeout=10,
        )
        raw = f.read_bytes()
        assert b"\r\n" in raw

    def test_edit__lf_file__lf_preserved(self, repo, handler):
        _write(repo, "lf.py", "hello\nworld\n")
        handler.execute(
            {
                "path": "lf.py",
                "edits": [{"old_string": "hello", "new_string": "goodbye"}],
            },
            timeout=10,
        )
        raw = (repo / "lf.py").read_bytes()
        assert b"\r\n" not in raw
        assert b"\n" in raw

    def test_edit__mixed_line_endings__detects_dominant(self, repo, handler):
        f = repo / "mixed.py"
        # CRLF appears first
        f.write_bytes(b"a\r\nb\nc\r\nd\r\n")
        handler.execute(
            {
                "path": "mixed.py",
                "edits": [{"old_string": "a", "new_string": "A"}],
            },
            timeout=10,
        )
        raw = f.read_bytes()
        assert raw.startswith(b"A\r\n")


class TestFuzzyMatching:
    def test_edit__smart_quotes__fuzzy_matches(self, repo, handler):
        _write(repo, "sq.py", 'x = \u201chello\u201d\n')
        result = handler.execute(
            {
                "path": "sq.py",
                "edits": [{"old_string": 'x = "hello"', "new_string": 'x = "goodbye"'}],
            },
            timeout=10,
        )
        assert result["fuzzy_match_used"] is True

    def test_edit__em_dash__fuzzy_matches(self, repo, handler):
        _write(repo, "dash.py", "a\u2014b\n")
        result = handler.execute(
            {
                "path": "dash.py",
                "edits": [{"old_string": "a-b", "new_string": "a_b"}],
            },
            timeout=10,
        )
        assert result["fuzzy_match_used"] is True

    def test_edit__nbsp__fuzzy_matches(self, repo, handler):
        _write(repo, "nbsp.py", "a\u00a0b\n")
        result = handler.execute(
            {
                "path": "nbsp.py",
                "edits": [{"old_string": "a b", "new_string": "a_b"}],
            },
            timeout=10,
        )
        assert result["fuzzy_match_used"] is True

    def test_edit__trailing_whitespace__fuzzy_matches(self, repo, handler):
        _write(repo, "ws.py", "hello   \nworld\n")
        result = handler.execute(
            {
                "path": "ws.py",
                "edits": [{"old_string": "hello\nworld", "new_string": "goodbye\nworld"}],
            },
            timeout=10,
        )
        assert result["fuzzy_match_used"] is True

    def test_edit__fuzzy_match__flagged_in_result(self, repo, handler):
        _write(repo, "flag.py", "\u201chello\u201d\n")
        result = handler.execute(
            {
                "path": "flag.py",
                "edits": [{"old_string": '"hello"', "new_string": '"goodbye"'}],
            },
            timeout=10,
        )
        assert result["fuzzy_match_used"] is True


class TestMultiEditOrdering:
    def test_edit__reverse_order_application(self, repo, handler):
        lines = [f"line{i}\n" for i in range(200)]
        _write(repo, "order.py", "".join(lines))
        result = handler.execute(
            {
                "path": "order.py",
                "edits": [
                    {"old_string": "line50", "new_string": "FIFTY"},
                    {"old_string": "line100", "new_string": "HUNDRED"},
                ],
            },
            timeout=10,
        )
        content = (repo / "order.py").read_text()
        assert "FIFTY" in content
        assert "HUNDRED" in content
        assert result["edits_applied"] == 2

    def test_edit__all_matched_against_original(self, repo, handler):
        _write(repo, "orig.py", "aaa\nbbb\n")
        result = handler.execute(
            {
                "path": "orig.py",
                "edits": [
                    {"old_string": "aaa", "new_string": "xxx"},
                    {"old_string": "bbb", "new_string": "yyy"},
                ],
            },
            timeout=10,
        )
        content = (repo / "orig.py").read_text()
        assert "xxx" in content
        assert "yyy" in content


class TestEdgeCases:
    def test_edit__binary_file__error(self, repo, handler):
        f = repo / "bin.dat"
        f.write_bytes(b"hello\x00world")
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "bin.dat",
                    "edits": [{"old_string": "hello", "new_string": "bye"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "binary_file"

    def test_edit__file_not_found__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "nope.py",
                    "edits": [{"old_string": "x", "new_string": "y"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "file_not_found"

    def test_edit__path_traversal__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "../../etc/passwd",
                    "edits": [{"old_string": "x", "new_string": "y"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "path_traversal"

    def test_edit__empty_old_string__error(self, repo, handler):
        _write(repo, "empty.py", "hello\n")
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {
                    "path": "empty.py",
                    "edits": [{"old_string": "", "new_string": "x"}],
                },
                timeout=10,
            )
        assert exc_info.value.code == "match_not_found"

    def test_edit__large_file__handles_ok(self, repo, handler):
        lines = [f"line {i}: content here\n" for i in range(10000)]
        _write(repo, "big.py", "".join(lines))
        result = handler.execute(
            {
                "path": "big.py",
                "edits": [{"old_string": "line 5000:", "new_string": "LINE 5000:"}],
            },
            timeout=10,
        )
        assert result["edits_applied"] == 1
