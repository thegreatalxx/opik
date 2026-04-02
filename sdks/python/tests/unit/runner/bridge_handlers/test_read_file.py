from pathlib import Path

import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.read_file import ReadFileHandler


@pytest.fixture
def repo(tmp_path):
    return tmp_path


@pytest.fixture
def handler(repo):
    return ReadFileHandler(repo)


class TestReadFile:
    def test_read__small_file__returns_full_content(self, repo, handler):
        f = repo / "small.py"
        lines = [f"line {i}\n" for i in range(50)]
        f.write_text("".join(lines))

        result = handler.execute({"path": "small.py"}, timeout=10)
        assert result["total_lines"] == 50
        assert result["truncated"] is False
        assert "line 0" in result["content"]

    def test_read__large_file__truncates_by_lines(self, repo, handler):
        f = repo / "large.py"
        lines = [f"line {i}\n" for i in range(5000)]
        f.write_text("".join(lines))

        result = handler.execute({"path": "large.py"}, timeout=10)
        assert result["total_lines"] == 5000
        assert result["truncated"] is True
        assert result["shown_lines"] == 2000

    def test_read__large_file__truncates_by_bytes(self, repo, handler):
        f = repo / "big.txt"
        line = "x" * 1000 + "\n"
        f.write_text(line * 1000)

        result = handler.execute({"path": "big.txt"}, timeout=10)
        assert result["truncated"] is True
        assert len(result["content"].encode("utf-8")) <= 512 * 1024

    def test_read__offset_and_limit(self, repo, handler):
        f = repo / "indexed.py"
        lines = [f"line {i}\n" for i in range(200)]
        f.write_text("".join(lines))

        result = handler.execute(
            {"path": "indexed.py", "offset": 100, "limit": 50}, timeout=10
        )
        assert "line 100" in result["content"]
        assert "line 149" in result["content"]
        assert "line 99" not in result["content"]

    def test_read__offset_beyond_file__error(self, repo, handler):
        f = repo / "short.py"
        lines = [f"line {i}\n" for i in range(50)]
        f.write_text("".join(lines))

        with pytest.raises(CommandError) as exc_info:
            handler.execute({"path": "short.py", "offset": 9999}, timeout=10)
        assert exc_info.value.code == "invalid_offset"

    def test_read__binary__error(self, repo, handler):
        f = repo / "bin.dat"
        f.write_bytes(b"hello\x00world")

        with pytest.raises(CommandError) as exc_info:
            handler.execute({"path": "bin.dat"}, timeout=10)
        assert exc_info.value.code == "binary_file"

    def test_read__not_found__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute({"path": "nonexistent.py"}, timeout=10)
        assert exc_info.value.code == "file_not_found"

    def test_read__path_traversal__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute({"path": "../../etc/passwd"}, timeout=10)
        assert exc_info.value.code == "path_traversal"

    def test_read__utf8_content__preserved(self, repo, handler):
        f = repo / "unicode.py"
        content = "# Unicode: \u00e9\u00e8\u00ea\u00eb \u2603 \u2764\n"
        f.write_text(content)

        result = handler.execute({"path": "unicode.py"}, timeout=10)
        assert result["content"] == content

    def test_read__empty_file__returns_empty(self, repo, handler):
        f = repo / "empty.py"
        f.write_text("")

        result = handler.execute({"path": "empty.py"}, timeout=10)
        assert result["content"] == ""
        assert result["total_lines"] == 0
        assert result["truncated"] is False
