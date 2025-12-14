"""Application settings for the distraction-free editor.

This module is GUI-agnostic and is responsible for loading and saving
user configuration such as the project space (library root) directory.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import json


CONFIG_DIR_NAME = "crowdly_editor"
CONFIG_FILE_NAME = "settings.json"


@dataclass
class Settings:
    """In-memory representation of user settings."""

    # Directory where the user's documents/library live. When ``None``, a
    # project space has not yet been selected.
    project_space: Path | None = None

    # Preferred interface language for the application, stored as a language
    # code (for example: "en", "ru", "ar", "zh-Hans", "zh-Hant", "ja").
    # At present this is only used to drive menu state; wiring up full
    # translations will be done in a later iteration.
    interface_language: str = "en"


def _get_config_dir() -> Path:
    """Return the directory where configuration files are stored."""

    home = Path.home()
    return home.joinpath(".config", CONFIG_DIR_NAME)


def _get_config_path() -> Path:
    return _get_config_dir().joinpath(CONFIG_FILE_NAME)


def load_settings() -> Settings:
    """Load settings from disk, returning defaults if none exist."""

    cfg_path = _get_config_path()
    if not cfg_path.is_file():
        return Settings()

    try:
        raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception:
        # Fall back to defaults if the file is unreadable or corrupted.
        return Settings()

    project_space_value = raw.get("project_space")
    project_space = Path(project_space_value) if project_space_value else None

    interface_language = raw.get("interface_language", "en")

    return Settings(
        project_space=project_space,
        interface_language=interface_language,
    )


def save_settings(settings: Settings) -> None:
    """Persist *settings* to disk as JSON."""

    cfg_dir = _get_config_dir()
    cfg_dir.mkdir(parents=True, exist_ok=True)

    data = asdict(settings)
    # Serialise Path objects to strings for JSON.
    if isinstance(data.get("project_space"), Path):
        data["project_space"] = str(data["project_space"])

    cfg_path = _get_config_path()
    cfg_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
