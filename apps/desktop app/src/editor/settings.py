"""Application settings for the distraction-free editor.

This module is GUI-agnostic and is responsible for loading and saving
user configuration such as the project space (library root) directory.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from pathlib import Path
import json
import uuid


CONFIG_DIR_NAME = "crowdly_editor"
CONFIG_FILE_NAME = "settings.json"


@dataclass
class Settings:
    """In-memory representation of user settings."""

    # Directory where the user's documents/library live. When ``None``, a
    # project space has not yet been selected.
    project_space: Path | None = None

    # Known project spaces that the user can quickly switch between.
    spaces: list[Path] = field(default_factory=list)

    # Preferred interface language for the application, stored as a language
    # code (for example: "en", "ru", "ar", "zh-Hans", "zh-Hant", "ja").
    # At present this is only used to drive menu state; wiring up full
    # translations will be done in a later iteration.
    interface_language: str = "en"

    # Base URL for the Crowdly web platform.
    # Example: "https://crowdly.example"
    crowdly_base_url: str | None = None

    # Stable identifier for this desktop installation, used for versioning
    # payloads and CRDT-style update streams.
    device_id: str | None = None

    # Per-project-space synchronisation state. Keys are absolute local
    # project-space paths (as strings), values are small dictionaries with
    # fields such as ``remote_space_id`` and ``last_pull_at`` (ISO
    # timestamps). This is used to optimise Space sync payloads and support
    # multi-device scenarios.
    space_sync_state: dict[str, dict[str, str]] = field(default_factory=dict)


def _get_config_dir() -> Path:
    """Return the directory where configuration files are stored."""

    home = Path.home()
    return home.joinpath(".config", CONFIG_DIR_NAME)


def _get_config_path() -> Path:
    return _get_config_dir().joinpath(CONFIG_FILE_NAME)


def load_settings() -> Settings:
    """Load settings from disk, returning defaults if none exist.

    When loading an existing configuration that predates the device_id
    field we transparently generate and persist a new UUID.
    """

    cfg_path = _get_config_path()
    if not cfg_path.is_file():
        settings = Settings()
        settings.device_id = str(uuid.uuid4())
        save_settings(settings)
        return settings

    try:
        raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception:
        # Fall back to defaults if the file is unreadable or corrupted.
        settings = Settings()
        settings.device_id = str(uuid.uuid4())
        save_settings(settings)
        return settings

    project_space_value = raw.get("project_space")
    project_space = Path(project_space_value) if project_space_value else None

    spaces_raw = raw.get("spaces") or []
    spaces: list[Path] = []
    if isinstance(spaces_raw, list):
        for value in spaces_raw:
            if not value:
                continue
            try:
                spaces.append(Path(value))
            except TypeError:
                continue

    interface_language = raw.get("interface_language", "en")
    crowdly_base_url = raw.get("crowdly_base_url")
    device_id = raw.get("device_id") or str(uuid.uuid4())

    raw_state = raw.get("space_sync_state") or {}
    space_sync_state: dict[str, dict[str, str]] = {}
    if isinstance(raw_state, dict):
        for key, value in raw_state.items():
            if not isinstance(key, str) or not isinstance(value, dict):
                continue
            cleaned: dict[str, str] = {}
            for k2, v2 in value.items():
                if isinstance(k2, str) and isinstance(v2, str):
                    cleaned[k2] = v2
            space_sync_state[key] = cleaned

    settings = Settings(
        project_space=project_space,
        spaces=spaces,
        interface_language=interface_language,
        crowdly_base_url=crowdly_base_url,
        device_id=device_id,
        space_sync_state=space_sync_state,
    )

    # Ensure device_id is persisted for older configs.
    try:
        save_settings(settings)
    except Exception:
        pass

    return settings


def save_settings(settings: Settings) -> None:
    """Persist *settings* to disk as JSON."""

    cfg_dir = _get_config_dir()
    cfg_dir.mkdir(parents=True, exist_ok=True)

    data = asdict(settings)
    # Serialise Path objects to strings for JSON.
    if isinstance(data.get("project_space"), Path):
        data["project_space"] = str(data["project_space"])

    spaces_value = data.get("spaces")
    if isinstance(spaces_value, list):
        data["spaces"] = [str(p) for p in spaces_value]

    # Normalise empty strings.
    if not data.get("crowdly_base_url"):
        data["crowdly_base_url"] = None

    # Always ensure a device_id exists for versioning.
    if not data.get("device_id"):
        data["device_id"] = str(uuid.uuid4())

    cfg_path = _get_config_path()
    cfg_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
