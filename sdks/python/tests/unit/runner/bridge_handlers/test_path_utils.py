import os
import tempfile
from pathlib import Path

import pytest

from opik.runner.bridge_handlers import CommandError
from opik.runner.bridge_handlers.path_utils import is_binary, validate_path


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "agent.py").write_text("print('hello')")
    return tmp_path


class TestValidatePath:
    def test_validate__relative_path__resolves_to_repo_root(self, repo):
        result = validate_path("src/agent.py", repo)
        assert result == (repo / "src" / "agent.py").resolve()

    def test_validate__absolute_inside_repo__ok(self, repo):
        abs_path = str(repo / "src" / "agent.py")
        result = validate_path(abs_path, repo)
        assert result == (repo / "src" / "agent.py").resolve()

    def test_validate__dotdot_traversal__raises(self, repo):
        with pytest.raises(CommandError) as exc_info:
            validate_path("../../etc/passwd", repo)
        assert exc_info.value.code == "path_traversal"

    def test_validate__symlink_escape__raises(self, repo):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "secret.txt"
            target.write_text("secret")
            link = repo / "escape"
            link.symlink_to(target)

            with pytest.raises(CommandError) as exc_info:
                validate_path("escape", repo)
            assert exc_info.value.code == "path_traversal"

    def test_validate__symlink_inside_repo__ok(self, repo):
        link = repo / "link.py"
        link.symlink_to(repo / "src" / "agent.py")
        result = validate_path("link.py", repo)
        assert result == (repo / "src" / "agent.py").resolve()

    def test_validate__sensitive_env__raises(self, repo):
        (repo / ".env").write_text("SECRET=x")
        with pytest.raises(CommandError) as exc_info:
            validate_path(".env", repo)
        assert exc_info.value.code == "sensitive_path"

    def test_validate__sensitive_pem__raises(self, repo):
        (repo / "cert.pem").write_text("cert")
        with pytest.raises(CommandError) as exc_info:
            validate_path("cert.pem", repo)
        assert exc_info.value.code == "sensitive_path"

    def test_validate__sensitive_nested__raises(self, repo):
        (repo / "config").mkdir()
        (repo / "config" / "secrets.json").write_text("{}")
        with pytest.raises(CommandError) as exc_info:
            validate_path("config/secrets.json", repo)
        assert exc_info.value.code == "sensitive_path"


class TestIsBinary:
    def test_is_binary__text_file__false(self, repo):
        assert is_binary(repo / "src" / "agent.py") is False

    def test_is_binary__null_bytes__true(self, tmp_path):
        f = tmp_path / "bin.dat"
        f.write_bytes(b"hello\x00world")
        assert is_binary(f) is True

    def test_is_binary__empty_file__false(self, tmp_path):
        f = tmp_path / "empty"
        f.write_text("")
        assert is_binary(f) is False
