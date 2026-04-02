from pathlib import Path

import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.write_file import WriteFileHandler


@pytest.fixture
def repo(tmp_path):
    return tmp_path


@pytest.fixture
def handler(repo):
    return WriteFileHandler(repo)


class TestWriteFile:
    def test_write__new_file__creates(self, repo, handler):
        result = handler.execute(
            {"path": "new.py", "content": "print('hello')\n"}, timeout=10
        )
        assert result["created"] is True
        assert result["diff"] == ""
        assert (repo / "new.py").read_text() == "print('hello')\n"

    def test_write__new_file__creates_parent_dirs(self, repo, handler):
        result = handler.execute(
            {"path": "deep/nested/dir/file.py", "content": "x\n"}, timeout=10
        )
        assert result["created"] is True
        assert (repo / "deep" / "nested" / "dir" / "file.py").exists()

    def test_write__existing_file__overwrites_with_diff(self, repo, handler):
        f = repo / "existing.py"
        f.write_text("old content\n")

        result = handler.execute(
            {"path": "existing.py", "content": "new content\n"}, timeout=10
        )
        assert result["created"] is False
        assert "old content" in result["diff"]
        assert "new content" in result["diff"]
        assert f.read_text() == "new content\n"

    def test_write__existing_file__diff_is_valid_unified(self, repo, handler):
        f = repo / "code.py"
        f.write_text("line1\nline2\nline3\n")

        result = handler.execute(
            {"path": "code.py", "content": "line1\nchanged\nline3\n"}, timeout=10
        )
        assert result["diff"].startswith("--- a/")
        assert "+++ b/" in result["diff"]
        assert "@@" in result["diff"]

    def test_write__path_traversal__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {"path": "../../etc/evil", "content": "bad"}, timeout=10
            )
        assert exc_info.value.code == "path_traversal"

    def test_write__sensitive_path__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute({"path": ".env", "content": "SECRET=x"}, timeout=10)
        assert exc_info.value.code == "sensitive_path"

    def test_write__content_matches_existing__no_change_diff(self, repo, handler):
        f = repo / "same.py"
        f.write_text("same content\n")

        result = handler.execute(
            {"path": "same.py", "content": "same content\n"}, timeout=10
        )
        assert result["diff"] == ""

    def test_write__bytes_written_correct(self, repo, handler):
        content = "hello \u00e9\u00e8\u00ea\n"
        result = handler.execute(
            {"path": "bytes.py", "content": content}, timeout=10
        )
        assert result["bytes_written"] == len(content.encode("utf-8"))
