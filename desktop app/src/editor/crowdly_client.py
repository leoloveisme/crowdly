"""Crowdly web client.

This client is tailored to the current Crowdly backend routes.

Given a full story URL like:
- http(s)://<host>[:port]/story/<story_id>

We fetch:
- GET {api_base}/story-titles/<story_id>         (optionally with ?userId=...)
- GET {api_base}/chapters?storyTitleId=<story_id>

Then we assemble a Markdown document:
- Story title
- Chapter titles
- Chapter paragraphs

The caller is expected to run network calls off the UI thread.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlparse, urlencode
import json
import re
import urllib.request
import urllib.error


@dataclass(frozen=True)
class CrowdlyStory:
    id: str
    title: str | None
    body: str
    body_format: str  # "markdown" | "html" | "unknown"
    updated_at: datetime | None
    source_url: str


class CrowdlyClientError(RuntimeError):
    def __init__(self, message: str, *, kind: str = "unknown", status_code: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code


def base_url_from_story_url(url: str) -> str:
    """Return scheme://host[:port] from a full story URL."""

    raw = (url or "").strip()
    if not re.match(r"^https?://", raw, flags=re.IGNORECASE):
        raise CrowdlyClientError("Please paste the full story URL.", kind="invalid_input")

    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise CrowdlyClientError("Invalid story URL.", kind="invalid_input")

    return f"{parsed.scheme}://{parsed.netloc}"


def api_base_url_from_story_url(url: str, *, backend_port: int = 4000) -> str:
    """Derive the API base URL from the story URL.

    Crowdly dev setup commonly serves the frontend on :8080 and the backend on
    :4000. The story URL is a frontend route, but API calls must go to the
    backend.

    Strategy:
    - If the story URL is localhost/127.0.0.1 on port 8080, use port 4000.
    - Otherwise, use the same origin (production can be same-host).
    """

    raw = (url or "").strip()
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise CrowdlyClientError("Invalid story URL.", kind="invalid_input")

    host = parsed.hostname or ""
    port = parsed.port

    if host in {"localhost", "127.0.0.1"} and port == 8080:
        return f"{parsed.scheme}://{host}:{backend_port}"

    return base_url_from_story_url(url)


class CrowdlyClient:
    """Minimal Crowdly client based on urllib (no external deps)."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout_seconds: float = 10.0,
        credentials: tuple[str, str] | None = None,
    ) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._credentials = credentials
        self._user_id: str | None = None

    def login(self) -> str:
        """Log in to Crowdly backend and return the user_id.

        Crowdly backend expects POST /auth/login with JSON {email, password}.
        """

        if self._credentials is None:
            raise CrowdlyClientError("Credentials are required.", kind="invalid_input")

        if self._user_id:
            return self._user_id

        email, password = self._credentials
        payload = {"email": email, "password": password}
        data = self._http_post_json(f"{self.base_url}/auth/login", payload)

        if not isinstance(data, dict) or not isinstance(data.get("id"), str):
            raise CrowdlyClientError("Unexpected login response.", kind="invalid_response")

        self._user_id = data["id"]
        return self._user_id

    @staticmethod
    def parse_story_id(value: str) -> str:
        """Parse a story id from a raw id or a Crowdly /story/{id} URL.

        Accepted forms:
        - "<uuid>"
        - "story/<uuid>"
        - "/story/<uuid>"
        - "https://host/story/<uuid>"
        """

        raw = (value or "").strip()
        if not raw:
            raise CrowdlyClientError("Story ID / URL is required.", kind="invalid_input")

        # Common shorthand users paste: "story/<id>" or "/story/<id>".
        m = re.search(r"(?:^|/)story/([^/?#]+)$", raw)
        if m and not re.match(r"^https?://", raw, flags=re.IGNORECASE):
            return m.group(1)

        # If it's a URL, extract the /story/{id} portion.
        if re.match(r"^https?://", raw, flags=re.IGNORECASE):
            parsed = urlparse(raw)
            path = parsed.path or ""
            m = re.search(r"/story/([^/?#]+)", path)
            if not m:
                raise CrowdlyClientError(
                    "Could not find '/story/{story_id}' in the provided URL.",
                    kind="invalid_input",
                )
            return m.group(1)

        # Otherwise treat it as a raw story id.
        # Keep it permissive but reject obvious whitespace.
        if any(ch.isspace() for ch in raw):
            raise CrowdlyClientError("Story ID must not contain spaces.", kind="invalid_input")
        return raw

    def fetch_story(self, story_url: str) -> CrowdlyStory:
        """Fetch a story from Crowdly backend and assemble a Markdown document."""

        if not self.base_url:
            raise CrowdlyClientError("Crowdly base URL is not configured.", kind="config")

        story_id = self.parse_story_id(story_url)

        user_id: str | None = None
        if self._credentials is not None:
            user_id = self.login()

        # Story title (visibility/access enforced here).
        title_url = f"{self.base_url}/story-titles/{story_id}"
        if user_id:
            title_url = title_url + "?" + urlencode({"userId": user_id})

        title_row = self._http_get_json(title_url)
        if not isinstance(title_row, dict):
            raise CrowdlyClientError("Unexpected story title response.", kind="invalid_response")

        story_title = title_row.get("title")
        if not isinstance(story_title, str) or not story_title.strip():
            story_title = "Untitled"

        updated_at: datetime | None = None
        updated_raw = title_row.get("updated_at") or title_row.get("updatedAt")
        if isinstance(updated_raw, str) and updated_raw:
            try:
                updated_at = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
            except Exception:
                updated_at = None

        # Chapters.
        chapters_url = f"{self.base_url}/chapters?" + urlencode({"storyTitleId": story_id})
        chapters = self._http_get_json(chapters_url)
        if not isinstance(chapters, list):
            raise CrowdlyClientError("Unexpected chapters response.", kind="invalid_response")

        md_parts: list[str] = [f"# {story_title}"]

        for ch in chapters:
            if not isinstance(ch, dict):
                continue
            ch_title = ch.get("chapter_title")
            if not isinstance(ch_title, str) or not ch_title.strip():
                ch_title = "Chapter"

            md_parts.append(f"\n## {ch_title}\n")

            paras = ch.get("paragraphs")
            if isinstance(paras, list):
                for p in paras:
                    if isinstance(p, str) and p.strip():
                        md_parts.append(p.strip())
                        md_parts.append("")

        body_md = "\n".join(md_parts).strip() + "\n"

        return CrowdlyStory(
            id=story_id,
            title=story_title,
            body=body_md,
            body_format="markdown",
            updated_at=updated_at,
            source_url=story_url,
        )

    # Internal helpers -------------------------------------------------

    def _http_post_json(self, url: str, payload: dict[str, Any]) -> Any:
        raw = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=raw,
            headers={
                "User-Agent": "crowdly-editor/0.1",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                content_type = (resp.headers.get_content_type() or "").lower()
                charset = resp.headers.get_content_charset() or "utf-8"
                body = resp.read().decode(charset, errors="replace")

                if "json" not in content_type:
                    raise CrowdlyClientError(
                        f"Expected JSON but got '{content_type}'.",
                        kind="invalid_response",
                    )

                return json.loads(body)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise CrowdlyClientError("Login failed.", kind="auth_failed", status_code=exc.code)
            raise CrowdlyClientError(
                "HTTP error (HTTP {code}).".format(code=exc.code),
                kind="http_error",
                status_code=exc.code,
            )
        except urllib.error.URLError as exc:
            raise CrowdlyClientError(f"Network error: {exc}", kind="network")

    def _http_get_json(self, url: str) -> Any:
        headers = {
            "User-Agent": "crowdly-editor/0.1",
            "Accept": "application/json",
        }

        req = urllib.request.Request(
            url,
            headers=headers,
            method="GET",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                content_type = (resp.headers.get_content_type() or "").lower()
                charset = resp.headers.get_content_charset() or "utf-8"
                raw_text = resp.read().decode(charset, errors="replace")

                # Be strict: if the endpoint returns HTML, it's not usable.
                if "json" not in content_type:
                    raise CrowdlyClientError(
                        f"Expected JSON from Crowdly backend but got '{content_type}'.",
                        kind="invalid_response",
                    )

                return json.loads(raw_text)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise CrowdlyClientError("Story not found (404).", kind="http_404", status_code=404)

            if exc.code == 403:
                # Backend returns 403 for private stories without userId, and for access denied.
                try:
                    body = exc.read().decode("utf-8", errors="replace")
                    data = json.loads(body)
                    msg = data.get("error") if isinstance(data, dict) else None
                except Exception:
                    msg = None

                if msg and "log" in msg.lower():
                    raise CrowdlyClientError("This story is private. Please login.", kind="auth_required", status_code=403)

                raise CrowdlyClientError(
                    msg or "You don't have access to the story.",
                    kind="access_denied",
                    status_code=403,
                )

            raise CrowdlyClientError(
                "HTTP error (HTTP {code}).".format(code=exc.code),
                kind="http_error",
                status_code=exc.code,
            )
        except urllib.error.URLError as exc:
            raise CrowdlyClientError(f"Network error: {exc}", kind="network")

