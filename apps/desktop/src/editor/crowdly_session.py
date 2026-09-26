"""Remembered Crowdly login for the desktop app.

The user stays logged in across restarts until they explicitly log out. The
email is kept in settings.json (``Settings.remembered_login``); the password
lives in the OS keychain via ``keyring`` — never in settings.json. Keychain
failures are swallowed: without a keychain the app simply behaves as if the
user had logged out.
"""

from __future__ import annotations

import keyring
from keyring.errors import KeyringError

from .settings import Settings, save_settings

KEYRING_SERVICE = "Crowdly desktop login"


def save(settings: Settings, email: str, password: str) -> None:
    """Remember *email* / *password* until :func:`clear` is called."""

    if not email or not password:
        return
    try:
        keyring.set_password(KEYRING_SERVICE, email, password)
    except (KeyringError, Exception):
        return
    settings.remembered_login = email
    try:
        save_settings(settings)
    except Exception:
        pass


def load(settings: Settings) -> tuple[str, str] | None:
    """Return the remembered ``(email, password)``, or ``None`` if logged out."""

    email = settings.remembered_login
    if not email:
        return None
    try:
        password = keyring.get_password(KEYRING_SERVICE, email)
    except (KeyringError, Exception):
        return None
    if not password:
        return None
    return email, password


def clear(settings: Settings) -> None:
    """Forget the remembered login (explicit logout)."""

    email = settings.remembered_login
    if email:
        try:
            keyring.delete_password(KEYRING_SERVICE, email)
        except (KeyringError, Exception):
            pass
    settings.remembered_login = None
    try:
        save_settings(settings)
    except Exception:
        pass
