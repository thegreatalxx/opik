import os
from pathlib import Path

import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.search_files import SearchFilesHandler


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "agent.py").write_text(
        "import os\n\ndef hello():\n    pass\n\ndef world():\n    pass\n"
    )
    (tmp_path / "src" / "tools.py").write_text("def search_tool():\n    return 42\n")
    (tmp_path / "readme.txt").write_text("This is a readme\n")
    return tmp_path


@pytest.fixture
def handler(repo):
    return SearchFilesHandler(repo)


class TestSearchFiles:
    def test_search__regex_pattern__matches(self, repo, handler):
        result = handler.execute({"pattern": r"def \w+"}, timeout=30)
        assert result["total_matches"] >= 3
        assert any("hello" in m["content"] for m in result["matches"])

    def test_search__literal_string__matches(self, repo, handler):
        result = handler.execute({"pattern": "import os"}, timeout=30)
        assert result["total_matches"] >= 1
        assert result["matches"][0]["line"] == 1

    def test_search__context_lines(self, repo, handler):
        result = handler.execute({"pattern": "def hello"}, timeout=30)
        match = result["matches"][0]
        assert len(match["context_before"]) <= 3
        assert len(match["context_after"]) <= 3

    def test_search__long_line_truncated(self, repo, handler):
        long_line = "x" * 1000
        (repo / "long.py").write_text(f"# {long_line}\n")
        result = handler.execute({"pattern": "xxx"}, timeout=30)
        assert len(result["matches"][0]["content"]) <= 503  # 500 + "..."

    def test_search__respects_gitignore(self, repo, handler):
        os.system(f"cd {repo} && git init -q && git add -A && git commit -qm init")
        (repo / "ignored.py").write_text("def secret_func():\n    pass\n")
        (repo / ".gitignore").write_text("ignored.py\n")
        os.system(f"cd {repo} && git add .gitignore && git commit -qm ignore")

        result = handler.execute({"pattern": "secret_func"}, timeout=30)
        assert not any("ignored.py" in m["file"] for m in result["matches"])

    def test_search__glob_filter(self, repo, handler):
        result = handler.execute(
            {"pattern": "def", "glob": "*.py"}, timeout=30
        )
        for m in result["matches"]:
            assert m["file"].endswith(".py")

    def test_search__truncates_at_100_matches(self, repo, handler):
        lines = [f"match_line_{i}\n" for i in range(200)]
        (repo / "many.py").write_text("".join(lines))
        result = handler.execute({"pattern": "match_line_"}, timeout=30)
        assert len(result["matches"]) <= 100
        assert result["truncated"] is True

    def test_search__no_matches(self, repo, handler):
        result = handler.execute({"pattern": "zzzznotfound"}, timeout=30)
        assert result["matches"] == []
        assert result["total_matches"] == 0

    def test_search__binary_file_skipped(self, repo, handler):
        (repo / "bin.dat").write_bytes(b"def hello\x00world")
        result = handler.execute({"pattern": "def hello"}, timeout=30)
        assert not any("bin.dat" in m["file"] for m in result["matches"])

    def test_search__scoped_to_subdir(self, repo, handler):
        result = handler.execute(
            {"pattern": "def", "path": "src"}, timeout=30
        )
        for m in result["matches"]:
            assert m["file"].startswith("src/") or m["file"].startswith("src\\")

    def test_search__path_traversal__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute(
                {"pattern": "test", "path": "../../"}, timeout=30
            )
        assert exc_info.value.code == "path_traversal"
