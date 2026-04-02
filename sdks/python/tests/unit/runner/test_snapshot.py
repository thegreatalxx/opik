import json
import os
import subprocess
from pathlib import Path

import pytest

from opik.runner.snapshot import build_checklist


@pytest.fixture
def repo(tmp_path):
    return tmp_path


def _git_init(repo):
    subprocess.run(["git", "init", "-q"], cwd=str(repo), check=True)
    subprocess.run(["git", "add", "-A"], cwd=str(repo), check=True)
    subprocess.run(
        ["git", "commit", "-qm", "init", "--allow-empty"],
        cwd=str(repo),
        check=True,
        env={**os.environ, "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "t@t",
             "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "t@t"},
    )


class TestFileTree:
    def test_tree__lists_files_and_dirs(self, repo):
        (repo / "src").mkdir()
        (repo / "src" / "agent.py").write_text("pass")
        (repo / "main.py").write_text("pass")

        result = build_checklist(repo, ["python", "main.py"])
        tree = result["file_tree"]
        assert "main.py" in tree
        assert "src/" in tree
        assert "src/agent.py" in tree

    def test_tree__respects_gitignore(self, repo):
        (repo / "keep.py").write_text("pass")
        (repo / "ignored.pyc").write_text("compiled")
        (repo / ".gitignore").write_text("*.pyc\n")
        _git_init(repo)
        subprocess.run(["git", "add", "-A"], cwd=str(repo), check=True)
        subprocess.run(
            ["git", "commit", "-qm", "files"],
            cwd=str(repo),
            env={**os.environ, "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "t@t",
                 "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "t@t"},
        )

        result = build_checklist(repo, ["python", "main.py"])
        assert "ignored.pyc" not in result["file_tree"]
        assert "keep.py" in result["file_tree"]

    def test_tree__excludes_dotgit(self, repo):
        (repo / "main.py").write_text("pass")
        _git_init(repo)
        subprocess.run(["git", "add", "-A"], cwd=str(repo), check=True)
        subprocess.run(
            ["git", "commit", "-qm", "files"],
            cwd=str(repo),
            env={**os.environ, "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "t@t",
                 "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "t@t"},
        )

        result = build_checklist(repo, ["python", "main.py"])
        assert ".git/" not in result["file_tree"]
        assert ".git" not in result["file_tree"]

    def test_tree__sorted_alphabetically(self, repo):
        (repo / "c.py").write_text("pass")
        (repo / "a.py").write_text("pass")
        (repo / "b.py").write_text("pass")

        result = build_checklist(repo, ["python", "main.py"])
        lines = [l for l in result["file_tree"].splitlines() if l.endswith(".py")]
        assert lines == sorted(lines)

    def test_tree__capped_at_1000(self, repo):
        for i in range(1500):
            (repo / f"file{i:04d}.py").write_text("pass")

        result = build_checklist(repo, ["python", "main.py"])
        lines = result["file_tree"].splitlines()
        assert len(lines) <= 1001  # 1000 + truncation message
        assert "[truncated:" in lines[-1]

    def test_tree__empty_repo(self, repo):
        result = build_checklist(repo, ["python", "main.py"])
        assert result["file_tree"] == ""

    def test_tree__nested_structure(self, repo):
        (repo / "src").mkdir()
        (repo / "src" / "sub").mkdir()
        (repo / "src" / "sub" / "deep.py").write_text("pass")

        result = build_checklist(repo, ["python", "main.py"])
        assert "src/" in result["file_tree"]
        assert "src/sub/" in result["file_tree"]
        assert "src/sub/deep.py" in result["file_tree"]


class TestInstrumentation:
    def test_python_import_opik__detected(self, repo):
        (repo / "app.py").write_text("import opik\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert result["instrumentation"]["tracing"] is True
        assert any(result["instrumentation"].values())

    def test_python_from_opik__detected(self, repo):
        (repo / "app.py").write_text("from opik import track\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert result["instrumentation"]["tracing"] is True

    def test_python_decorator__detected(self, repo):
        (repo / "app.py").write_text("@opik.track\ndef foo(): pass\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert result["instrumentation"]["tracing"] is True

    def test_python_entrypoint__detected(self, repo):
        (repo / "app.py").write_text('@opik.track(entrypoint=True, name="foo")\ndef foo(): pass\n')
        result = build_checklist(repo, ["python", "app.py"])
        assert result["instrumentation"]["entrypoint"] is True

    def test_python_agent_config__detected(self, repo):
        (repo / "app.py").write_text("from opik import AgentConfig\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert result["instrumentation"]["configuration"] is True

    def test_typescript_import__detected(self, repo):
        (repo / "index.ts").write_text('import { Opik } from "opik"\n')
        result = build_checklist(repo, ["node", "index.ts"])
        assert result["instrumentation"]["tracing"] is True

    def test_no_opik__not_instrumented(self, repo):
        (repo / "app.py").write_text("print('hello')\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert result["instrumentation"]["tracing"] is False
        assert result["instrumentation"]["entrypoint"] is False
        assert result["instrumentation"]["configuration"] is False
        assert not any(result["instrumentation"].values())
        assert result["instrumentation_matches"] == []

    def test_respects_gitignore(self, repo):
        (repo / "app.py").write_text("import opik\n")
        (repo / "ignored.py").write_text("import opik\n")
        (repo / ".gitignore").write_text("ignored.py\n")
        _git_init(repo)
        subprocess.run(["git", "add", "-A"], cwd=str(repo), check=True)
        subprocess.run(
            ["git", "commit", "-qm", "files"],
            cwd=str(repo),
            env={**os.environ, "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "t@t",
                 "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "t@t"},
        )

        result = build_checklist(repo, ["python", "app.py"])
        assert not any("ignored.py" in m for m in result["instrumentation_matches"])

    def test_skips_binary(self, repo):
        (repo / "bin.py").write_bytes(b"import opik\x00\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert not any("bin.py" in m for m in result["instrumentation_matches"])

    def test_capped_at_50_matches(self, repo):
        lines = "\n".join([f"import opik  # line {i}" for i in range(100)])
        for i in range(100):
            (repo / f"mod{i:03d}.py").write_text(f"import opik  # {i}\n")

        result = build_checklist(repo, ["python", "app.py"])
        assert len(result["instrumentation_matches"]) <= 50

    def test_match_format(self, repo):
        (repo / "app.py").write_text("import opik\n")
        result = build_checklist(repo, ["python", "app.py"])
        match = result["instrumentation_matches"][0]
        parts = match.split(":", 2)
        assert len(parts) == 3
        assert parts[0] == "app.py"
        assert parts[1] == "1"
        assert "import opik" in parts[2]

    def test_only_searches_code_files(self, repo):
        (repo / "notes.txt").write_text("import opik\n")
        (repo / "app.py").write_text("print('no opik here')\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert not any("notes.txt" in m for m in result["instrumentation_matches"])


class TestFullPayload:
    def test_snapshot__complete(self, repo):
        (repo / "app.py").write_text("import opik\n@opik.track(entrypoint=True)\ndef main(): pass\n")
        result = build_checklist(repo, ["python", "app.py"])

        assert "command" in result
        assert "file_tree" in result
        assert "instrumentation" in result
        assert "instrumentation_matches" in result
        assert isinstance(result["instrumentation"]["tracing"], bool)
        assert isinstance(result["instrumentation"]["entrypoint"], bool)
        assert isinstance(result["instrumentation"]["configuration"], bool)
        assert isinstance(result["instrumentation_matches"], list)

    def test_snapshot__total_size_capped(self, repo):
        for i in range(500):
            (repo / f"file{i:04d}.py").write_text("import opik\n" * 10)

        result = build_checklist(repo, ["python", "app.py"])
        payload = json.dumps(result)
        assert len(payload.encode("utf-8")) < 200 * 1024

    def test_snapshot__command_included(self, repo):
        result = build_checklist(repo, ["python", "app.py"])
        assert result["command"] == "python app.py"

    def test_snapshot__likely_instrumented_field(self, repo):
        (repo / "app.py").write_text("import opik\n")
        result = build_checklist(repo, ["python", "app.py"])
        assert any(result["instrumentation"].values())
