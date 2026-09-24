"""Google account credentials for the desktop app.

One Google account per desktop user. The refresh token (long-lived) lives in
the OS keychain via ``keyring`` — never in settings.json. Access tokens are
short-lived and kept only in memory.
"""

from __future__ import annotations

import json
import threading
import time

import keyring
from keyring.errors import KeyringError

from . import oauth

KEYRING_SERVICE = "Crowdly Google Drive"
KEYRING_USER = "default"
_REFRESH_SKEW_SECONDS = 60


class NotSignedIn(RuntimeError):
    pass


class GoogleAccount:
    """Holds the signed-in Google account and hands out valid access tokens (thread-safe)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._access_token: str | None = None
        self._expires_at = 0.0

    # --- persisted part ----------------------------------------------------

    def _load(self) -> dict | None:
        try:
            raw = keyring.get_password(KEYRING_SERVICE, KEYRING_USER)
        except KeyringError:
            return None
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except ValueError:
            return None
        return data if isinstance(data, dict) and data.get("refresh_token") else None

    def is_signed_in(self) -> bool:
        return self._load() is not None

    def email(self) -> str | None:
        data = self._load()
        return data.get("email") if data else None

    def store(self, tokens: oauth.TokenSet) -> None:
        refresh_token = tokens.refresh_token or (self._load() or {}).get("refresh_token")
        if not refresh_token:
            raise oauth.OAuthError("Google did not return a refresh token; please try connecting again.")
        keyring.set_password(
            KEYRING_SERVICE,
            KEYRING_USER,
            json.dumps({"refresh_token": refresh_token, "email": tokens.email}),
        )
        with self._lock:
            self._access_token = tokens.access_token
            self._expires_at = time.time() + tokens.expires_in

    def sign_out(self) -> None:
        with self._lock:
            self._access_token = None
            self._expires_at = 0.0
        try:
            keyring.delete_password(KEYRING_SERVICE, KEYRING_USER)
        except KeyringError:
            pass

    # --- access tokens -----------------------------------------------------

    def access_token(self) -> str:
        with self._lock:
            if self._access_token and self._expires_at - time.time() > _REFRESH_SKEW_SECONDS:
                return self._access_token
            data = self._load()
            if not data:
                raise NotSignedIn("Not signed in to Google Drive.")
            client = oauth.load_client_config()
            if client is None:
                raise NotSignedIn("Google Drive is not configured in this build.")
            refreshed = oauth.refresh_access_token(client, data["refresh_token"])
            self._access_token = refreshed.access_token
            self._expires_at = time.time() + refreshed.expires_in
            return self._access_token
