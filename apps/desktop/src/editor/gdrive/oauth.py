"""Google OAuth for installed apps: loopback redirect + PKCE.

Flow: start a one-shot HTTP server on 127.0.0.1:<random port>, open Google's
consent page in the system browser with that as the redirect URI, wait for
Google to redirect back with ``?code=...``, then exchange the code for
tokens. ``sign_in`` blocks, so the UI runs it on a worker thread.

The OAuth client must be of type "Desktop app" in Google Cloud Console. Its
id/secret come from the ``CROWDLY_GOOGLE_CLIENT_ID`` /
``CROWDLY_GOOGLE_CLIENT_SECRET`` environment variables, or from
``editor/google_oauth_client.json`` (gitignored, bundled into the .app).
Google treats a desktop client's secret as non-confidential; PKCE is what
protects the code exchange.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
# Full `drive` scope so an existing folder (and its subfolders) can be picked.
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
SCOPES = f"{DRIVE_SCOPE} openid email"

CLIENT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "google_oauth_client.json"

SIGN_IN_TIMEOUT_SECONDS = 300

_SUCCESS_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Crowdly</title></head>
<body style="font-family:-apple-system,system-ui,sans-serif;text-align:center;padding-top:15vh">
<h2>{title}</h2><p>{body}</p></body></html>"""


class OAuthError(RuntimeError):
    pass


class MissingDriveScope(OAuthError):
    """Signed in, but the Drive permission wasn't granted on Google's consent screen."""


@dataclass
class ClientConfig:
    client_id: str
    client_secret: str


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str | None
    expires_in: int
    email: str | None = None


def load_client_config() -> ClientConfig | None:
    client_id = os.environ.get("CROWDLY_GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("CROWDLY_GOOGLE_CLIENT_SECRET")
    if client_id and client_secret:
        return ClientConfig(client_id, client_secret)
    try:
        raw = json.loads(CLIENT_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    # Accept both our flat {"client_id", "client_secret"} and the JSON Google
    # Cloud Console downloads ({"installed": {...}}).
    section = raw.get("installed", raw) if isinstance(raw, dict) else {}
    client_id = section.get("client_id")
    client_secret = section.get("client_secret")
    if isinstance(client_id, str) and isinstance(client_secret, str) and client_id and client_secret:
        return ClientConfig(client_id, client_secret)
    return None


def _post_form(url: str, fields: dict[str, str]) -> dict:
    req = Request(
        url,
        data=urlencode(fields).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise OAuthError(f"Google token request failed (HTTP {exc.code}): {detail}") from exc
    except OSError as exc:
        raise OAuthError(f"Could not reach Google: {exc}") from exc


def fetch_email(access_token: str) -> str | None:
    req = Request(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8")).get("email")
    except (OSError, ValueError):
        return None


def refresh_access_token(client: ClientConfig, refresh_token: str) -> TokenSet:
    data = _post_form(
        TOKEN_URL,
        {
            "client_id": client.client_id,
            "client_secret": client.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    return TokenSet(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token") or refresh_token,
        expires_in=int(data.get("expires_in", 3600)),
    )


def sign_in(client: ClientConfig, cancelled: Callable[[], bool] = lambda: False) -> TokenSet:
    """Run the full browser consent flow and return tokens. Blocks until done, cancelled or timed out."""

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(24)
    result: dict[str, str] = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server API
            query = parse_qs(urlparse(self.path).query)
            if "code" not in query and "error" not in query:
                self.send_response(404)
                self.end_headers()
                return
            if query.get("state", [""])[0] != state:
                result["error"] = "state_mismatch"
            elif "error" in query:
                result["error"] = query["error"][0]
            else:
                result["code"] = query["code"][0]
            ok = "code" in result
            page = _SUCCESS_PAGE.format(
                title="Connected to Google Drive" if ok else "Google Drive was not connected",
                body="You can close this tab and return to Crowdly." if ok else "You can close this tab and try again from Crowdly.",
            )
            body = page.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            done.set()

        def log_message(self, *args) -> None:  # silence default stderr logging
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    server.timeout = 0.5
    redirect_uri = f"http://127.0.0.1:{server.server_address[1]}"
    params = {
        "client_id": client.client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
    }
    try:
        webbrowser.open(f"{AUTH_URL}?{urlencode(params)}")
        waited = 0.0
        while not done.is_set():
            if cancelled():
                raise OAuthError("cancelled")
            if waited >= SIGN_IN_TIMEOUT_SECONDS:
                raise OAuthError("timed out waiting for Google sign-in")
            server.handle_request()
            waited += server.timeout
    finally:
        server.server_close()

    if "code" not in result:
        raise OAuthError(f"Google sign-in failed: {result.get('error', 'unknown error')}")

    data = _post_form(
        TOKEN_URL,
        {
            "client_id": client.client_id,
            "client_secret": client.client_secret,
            "code": result["code"],
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    access_token = data["access_token"]
    # Google's consent screen lets the user untick individual permissions;
    # without the Drive one every Drive call fails with 403, so refuse early.
    if DRIVE_SCOPE not in (data.get("scope") or "").split():
        raise MissingDriveScope("missing_drive_scope")
    return TokenSet(
        access_token=access_token,
        refresh_token=data.get("refresh_token"),
        expires_in=int(data.get("expires_in", 3600)),
        email=fetch_email(access_token),
    )
