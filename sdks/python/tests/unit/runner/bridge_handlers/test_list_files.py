import os
import time
from pathlib import Path

import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.list_files import ListFilesHandler


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "agent.py").write_text("print('agent')")
    (tmp_path / "src" / "tools.py").write_text("print('tools')")
    (tmp_path / "readme.txt").write_text("readme")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "input.csv").write_text("a,b,c")
    return tmp_path


@pytest.fixture
def handler(repo):
    return ListFilesHandler(repo)


class TestListFiles:
    def test_list__matches_pattern(self, repo, handler):
        result = handler.execute({"pattern": "**/*.py"}, timeout=15)
        files = result["files"]
        assert any("agent.py" in f for f in files)
        assert any("tools.py" in f for f in files)
        assert not any("readme.txt" in f for f in files)

    def test_list__recursive_glob(self, repo, handler):
        (repo / "src" / "nested").mkdir()
        (repo / "src" / "nested" / "deep.py").write_text("x")
        result = handler.execute({"pattern": "**/*.py"}, timeout=15)
        assert any("deep.py" in f for f in result["files"])

    def test_list__respects_gitignore(self, repo, handler):
        os.system(f"cd {repo} && git init -q && git add -A && git commit -qm init")
        (repo / "ignored.pyc").write_text("compiled")
        (repo / ".gitignore").write_text("*.pyc\n")
        os.system(f"cd {repo} && git add .gitignore && git commit -qm ignore")

        result = handler.execute({"pattern": "**/*"}, timeout=15)
        assert not any("ignored.pyc" in f for f in result["files"])

    def test_list__sorted_by_mtime(self, repo, handler):
        (repo / "old.py").write_text("old")
        time.sleep(0.05)
        (repo / "new.py").write_text("new")

        result = handler.execute({"pattern": "*.py"}, timeout=15)
        files = result["files"]
        if len(files) >= 2:
            new_idx = next(i for i, f in enumerate(files) if "new.py" in f)
            old_idx = next(i for i, f in enumerate(files) if "old.py" in f)
            assert new_idx < old_idx

    def test_list__truncates_at_1000(self, repo, handler):
        bulk = repo / "bulk"
        bulk.mkdir()
        for i in range(1500):
            (bulk / f"file{i:04d}.txt").write_text(f"content {i}")

        result = handler.execute({"pattern": "**/*.txt"}, timeout=15)
        assert len(result["files"]) <= 1000
        assert result["truncated"] is True
        assert result["total"] == 1501  # 1500 + input.csv

    def test_list__relative_paths(self, repo, handler):
        result = handler.execute({"pattern": "**/*.py"}, timeout=15)
        for f in result["files"]:
            assert not f.startswith("/")

    def test_list__scoped_to_subdir(self, repo, handler):
        result = handler.execute({"pattern": "*.py", "path": "src"}, timeout=15)
        assert len(result["files"]) >= 2
        for f in result["files"]:
            assert f.startswith("src/") or f.startswith("src\\")

    def test_list__empty_result(self, repo, handler):
        result = handler.execute({"pattern": "*.xyz"}, timeout=15)
        assert result["files"] == []
        assert result["total"] == 0

    def test_list__path_traversal__error(self, repo, handler):
        with pytest.raises(CommandError) as exc_info:
            handler.execute({"pattern": "*", "path": "../../"}, timeout=15)
        assert exc_info.value.code == "path_traversal"
