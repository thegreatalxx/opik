"""Tests for snapshot.py Python environment detection."""

import platform
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from opik.runner.snapshot import (
    _classify_env_manager,
    _detect_python_env,
    _find_venv_python,
    build_checklist,
)

IS_WINDOWS = platform.system().lower() == "windows"


# ── _find_venv_python ──────────────────────────────────────────────────


def test_find_venv_python_unix(tmp_path: Path) -> None:
    if IS_WINDOWS:
        pytest.skip("Unix-only test")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    python = bin_dir / "python"
    python.touch()
    python.chmod(0o755)
    assert _find_venv_python(tmp_path) == str(python)


def test_find_venv_python_windows(tmp_path: Path) -> None:
    if not IS_WINDOWS:
        pytest.skip("Windows-only test")
    scripts_dir = tmp_path / "Scripts"
    scripts_dir.mkdir()
    python = scripts_dir / "python.exe"
    python.touch()
    assert _find_venv_python(tmp_path) == str(python)


def test_find_venv_python_conda_windows_root(tmp_path: Path) -> None:
    """Conda on Windows places python.exe at the prefix root."""
    if not IS_WINDOWS:
        pytest.skip("Windows-only test")
    python = tmp_path / "python.exe"
    python.touch()
    assert _find_venv_python(tmp_path) == str(python)


def test_find_venv_python_missing(tmp_path: Path) -> None:
    assert _find_venv_python(tmp_path) is None


def test_find_venv_python_not_executable(tmp_path: Path) -> None:
    if IS_WINDOWS:
        pytest.skip("Executable bit not meaningful on Windows")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    python = bin_dir / "python"
    python.touch()
    python.chmod(0o644)
    assert _find_venv_python(tmp_path) is None


# ── _classify_env_manager ──────────────────────────────────────────────


def test_classify_uv_lock(tmp_path: Path) -> None:
    (tmp_path / "uv.lock").touch()
    assert _classify_env_manager(tmp_path) == "uv"


def test_classify_poetry_lock(tmp_path: Path) -> None:
    (tmp_path / "poetry.lock").touch()
    assert _classify_env_manager(tmp_path) == "poetry"


def test_classify_uv_pyproject(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "demo"\n\n[tool.uv]\ndev-dependencies = []\n'
    )
    assert _classify_env_manager(tmp_path) == "uv"


def test_classify_poetry_pyproject(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(
        '[tool.poetry]\nname = "demo"\nversion = "0.1.0"\n'
    )
    assert _classify_env_manager(tmp_path) == "poetry"


def test_classify_none(tmp_path: Path) -> None:
    assert _classify_env_manager(tmp_path) is None


def test_classify_uv_lock_takes_priority_over_poetry_pyproject(tmp_path: Path) -> None:
    """uv.lock is checked before poetry markers."""
    (tmp_path / "uv.lock").touch()
    (tmp_path / "pyproject.toml").write_text('[tool.poetry]\nname = "demo"\n')
    assert _classify_env_manager(tmp_path) == "uv"


# ── Helper to create a fake venv inside a project ─────────────────────


def _make_venv(project: Path, dirname: str = ".venv") -> Path:
    """Create a minimal fake venv under project/dirname with a python binary."""
    venv_dir = project / dirname
    if IS_WINDOWS:
        scripts = venv_dir / "Scripts"
        scripts.mkdir(parents=True)
        python = scripts / "python.exe"
        python.touch()
    else:
        bin_dir = venv_dir / "bin"
        bin_dir.mkdir(parents=True)
        python = bin_dir / "python"
        python.touch()
        python.chmod(0o755)
    return python


# ── _detect_python_env ─────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Remove env vars that influence detection so tests are isolated."""
    monkeypatch.delenv("VIRTUAL_ENV", raising=False)
    monkeypatch.delenv("CONDA_PREFIX", raising=False)
    monkeypatch.delenv("CONDA_DEFAULT_ENV", raising=False)


def test_detect_from_command_venv_python(tmp_path: Path) -> None:
    python = _make_venv(tmp_path)
    command = [str(python.relative_to(tmp_path)), "app.py"]
    result = _detect_python_env(tmp_path, command)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "venv"
    assert result["python_env_source"] == "command"


def test_detect_from_command_uv_project(tmp_path: Path) -> None:
    python = _make_venv(tmp_path)
    (tmp_path / "uv.lock").touch()
    command = [str(python.relative_to(tmp_path)), "app.py"]
    result = _detect_python_env(tmp_path, command)
    assert result["python_env_type"] == "uv"
    assert result["python_env_source"] == "command"


def test_detect_from_command_rejects_system_python(
    tmp_path: Path,
) -> None:
    """A system Python like /usr/bin/python must not be classified as venv."""
    if IS_WINDOWS:
        pytest.skip("Unix-only test")
    # Create a fake system Python *outside* the project directory
    project = tmp_path / "project"
    project.mkdir()
    fake_sys = tmp_path / "usr" / "bin"
    fake_sys.mkdir(parents=True)
    python = fake_sys / "python"
    python.touch()
    python.chmod(0o755)
    command = [str(python), "app.py"]
    with patch.object(sys, "prefix", "/usr"), patch.object(sys, "base_prefix", "/usr"):
        result = _detect_python_env(project, command)
    # Should NOT be "command" source — system python falls through
    assert result["python_env_source"] != "command"
    assert result["python_env_type"] == "system"


def test_detect_from_virtual_env_var(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    venv_dir = tmp_path / "myenv"
    python = _make_venv(tmp_path, "myenv")
    monkeypatch.setenv("VIRTUAL_ENV", str(venv_dir))
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "venv"
    assert result["python_env_source"] == "env_var"


def test_detect_from_virtual_env_with_poetry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    venv_dir = tmp_path / "myenv"
    python = _make_venv(tmp_path, "myenv")
    (tmp_path / "poetry.lock").touch()
    monkeypatch.setenv("VIRTUAL_ENV", str(venv_dir))
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "poetry"
    assert result["python_env_source"] == "env_var"


def test_detect_from_conda_prefix(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    conda_dir = tmp_path / "conda_env"
    python = _make_venv(tmp_path, "conda_env")
    monkeypatch.setenv("CONDA_PREFIX", str(conda_dir))
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "conda"
    assert result["python_env_source"] == "env_var"


def test_detect_uv_with_in_project_venv(tmp_path: Path) -> None:
    python = _make_venv(tmp_path)
    (tmp_path / "uv.lock").touch()
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "uv"
    assert result["python_env_source"] == "project_dir"


def test_detect_poetry_without_in_project_venv(tmp_path: Path) -> None:
    """Poetry with external venv — reports sys.executable but type=poetry."""
    (tmp_path / "poetry.lock").touch()
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == sys.executable
    assert result["python_env_type"] == "poetry"
    assert result["python_env_source"] == "project_dir"


def test_detect_from_project_dotvenv(tmp_path: Path) -> None:
    python = _make_venv(tmp_path, ".venv")
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "venv"
    assert result["python_env_source"] == "project_dir"


def test_detect_from_project_venv_dir(tmp_path: Path) -> None:
    python = _make_venv(tmp_path, "venv")
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(python)
    assert result["python_env_type"] == "venv"
    assert result["python_env_source"] == "project_dir"


def test_dotvenv_preferred_over_venv(tmp_path: Path) -> None:
    dotvenv_python = _make_venv(tmp_path, ".venv")
    _make_venv(tmp_path, "venv")
    result = _detect_python_env(tmp_path, None)
    assert result["python_executable"] == str(dotvenv_python)


def test_detect_conda_via_environment_yml(tmp_path: Path) -> None:
    (tmp_path / "environment.yml").touch()
    result = _detect_python_env(tmp_path, None)
    assert result["python_env_type"] == "conda"
    assert result["python_env_source"] == "project_dir"


def test_detect_conda_via_environment_yaml(tmp_path: Path) -> None:
    (tmp_path / "environment.yaml").touch()
    result = _detect_python_env(tmp_path, None)
    assert result["python_env_type"] == "conda"
    assert result["python_env_source"] == "project_dir"


def test_detect_daemon_venv(tmp_path: Path) -> None:
    """Daemon venv is accepted when sys.prefix is under repo_root."""
    daemon_prefix = str(tmp_path / "daemon_venv")
    with (
        patch.object(sys, "prefix", daemon_prefix),
        patch.object(sys, "base_prefix", "/usr"),
    ):
        result = _detect_python_env(tmp_path, None)
    assert result["python_env_type"] == "venv"
    assert result["python_env_source"] == "daemon"
    assert result["python_executable"] == sys.executable


def test_detect_daemon_venv_outside_repo_falls_through(tmp_path: Path) -> None:
    """Daemon venv outside repo_root (e.g. pipx, uv tool) is not a project env."""
    with (
        patch.object(sys, "prefix", "/home/user/.local/share/pipx/venvs/opik"),
        patch.object(sys, "base_prefix", "/usr"),
    ):
        result = _detect_python_env(tmp_path, None)
    # Should fall through to system, not claim "daemon" venv
    assert result["python_env_type"] == "system"
    assert result["python_env_source"] == "fallback"


def test_detect_system_fallback(tmp_path: Path) -> None:
    with patch.object(sys, "prefix", "/usr"), patch.object(sys, "base_prefix", "/usr"):
        result = _detect_python_env(tmp_path, None)
    assert result["python_env_type"] == "system"
    assert result["python_env_source"] == "fallback"
    assert result["python_executable"] == sys.executable


def test_build_checklist_includes_env_fields(tmp_path: Path) -> None:
    """build_checklist propagates env detection values correctly."""
    env_info = _detect_python_env(tmp_path, None)
    checklist = build_checklist(tmp_path, None)
    assert checklist["python_env_type"] == env_info["python_env_type"]
    assert checklist["python_env_source"] == env_info["python_env_source"]
    assert checklist["python_executable"] == env_info["python_executable"]
