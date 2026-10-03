"""Local-first shelves for Discovery's My Library.

The store is a mirror of the account's shelves (backend/src/shelves.js) kept
in ``library/shelves.json``. The UI always reads and edits the mirror, so
shelves work without sync and without a connection; ``library.shelf_sync``
pushes the local changes and pulls the account's state whenever sync is on.

The public methods mirror ``LibrarySyncClient``'s shelf calls (same names,
same result shapes), with two differences:

- shelf ids are local ids (the account's id is kept as ``remote_id``);
- library books are referred to by their *local* library item id, so a book
  can go on a shelf before it has ever been uploaded.

Changes are tracked so they can be replayed: ``dirty`` shelves, ``deleted``
shelves and ``removed`` entries are tombstones until synced, new entries
have no ``remote_entry_id`` yet, and Favorite / Living / Lived changes wait
in ``status_pending``.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .store import KIND_CROWDLY, KIND_IMPORTED, LibraryItem, LocalLibrary

STATUS_KEYS = ("favorite", "living", "lived")
SYSTEM_TO_STATUS = {"favorites": "favorite", "living": "living", "lived": "lived"}
FINISHED_PERCENT = 98
DAY_SECONDS = 24 * 60 * 60


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def item_card(item: LibraryItem) -> dict:
    """Card dict for an item of the local library (see ui/discovery/cards.py)."""

    crowdly = item.kind == KIND_CROWDLY
    return {
        "key": f"local:{item.id}",
        "local_id": item.id,
        "type": "story" if crowdly else "library_item",
        "id": item.story_title_id if crowdly else item.remote_id,
        "title": item.title,
        "subtitle": None,
        "author": item.author,
        "language": item.language,
        "format": "story" if crowdly else item.format,
        "progress": float((item.position or {}).get("percent") or 0),
        "added_at": item.added_at,
        "last_read_at": item.last_opened_at,
    }


# -- smart rules (same vocabulary as backend/src/shelves.js) --------------------


def _progress_state(percent: float) -> str:
    if not percent or percent <= 0:
        return "unread"
    if percent >= FINISHED_PERCENT:
        return "finished"
    return "reading"


def _age_days(value: str | None) -> float | None:
    if not value:
        return None
    try:
        when = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - when).total_seconds() / DAY_SECONDS


def rule_matches(card: dict, rule: dict) -> bool:
    field, value = rule.get("field"), rule.get("value")
    if field == "source":
        return ("library" if card.get("type") == "library_item" else "crowdly") == value
    if field == "format":
        return card.get("format") == value
    if field == "language":
        return str(card.get("language") or "").lower().startswith(str(value).lower())
    if field == "title":
        return str(value).lower() in str(card.get("title") or "").lower()
    if field == "author":
        return str(value).lower() in str(card.get("author") or "").lower()
    if field == "status":
        return bool((card.get("status") or {}).get(value))
    if field == "progress":
        return _progress_state(float(card.get("progress") or 0)) == value
    if field == "added_within_days":
        age = _age_days(card.get("added_at"))
        return age is not None and age <= float(value)
    if field == "read_within_days":
        age = _age_days(card.get("last_read_at"))
        return age is not None and age <= float(value)
    return False


def evaluate_rules(cards: list[dict], rules: dict | None) -> list[dict]:
    rules = rules or {}
    rule_list = rules.get("rules") or []
    if not rule_list:
        return []
    if rules.get("match") == "any":
        return [c for c in cards if any(rule_matches(c, r) for r in rule_list)]
    return [c for c in cards if all(rule_matches(c, r) for r in rule_list)]


def sort_cards(cards: list[dict], sort: str) -> list[dict]:
    by_title = lambda c: (c.get("title") or "").lower()  # noqa: E731
    if sort == "title":
        return sorted(cards, key=by_title)
    if sort == "added":
        return sorted(cards, key=lambda c: c.get("added_at") or "", reverse=True)
    if sort == "progress":
        return sorted(cards, key=lambda c: (-float(c.get("progress") or 0), by_title(c)))
    if sort == "last_read":
        return sorted(cards, key=lambda c: c.get("last_read_at") or "", reverse=True)
    return cards


# -- the store ---------------------------------------------------------------------


class LocalShelfStore:
    def __init__(self, path: Path, library: LocalLibrary) -> None:
        self.path = path
        self.library = library
        self.lock = threading.RLock()
        # Called (on the thread that made the change) after every local edit.
        self.listeners: list[Callable[[], None]] = []
        self.data: dict[str, Any] = {}
        self.load()

    # -- persistence -----------------------------------------------------------

    def _empty(self) -> dict[str, Any]:
        return {
            "version": 1,
            "shelves": [],
            "order_dirty": False,
            # story id -> {"favorite": bool, "living": bool, "lived": bool, "title": str}
            "status": {},
            # "story:<id>" -> {"type", "id", "flags": {...}}
            "status_pending": {},
            # system shelf key -> cards last seen on the account
            "system_items": {},
        }

    def load(self) -> None:
        with self.lock:
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                if not isinstance(data, dict):
                    raise ValueError
            except Exception:
                data = self._empty()
                self._import_old_cache(data)
            for key, value in self._empty().items():
                data.setdefault(key, value)
            if not data["system_items"]:
                # Never synced yet: start Favorites / Living / Lived from the old cache.
                self._import_old_system_items(data)
            self.data = data

    def _import_old_cache(self, data: dict) -> None:
        """Start from the read-only cache earlier versions kept, if any."""

        cache = self.path.with_name("shelves-cache.json")
        try:
            old = json.loads(cache.read_text(encoding="utf-8"))
        except Exception:
            return
        items = old.get("items") or {}
        for position, shelf in enumerate(((old.get("shelves") or {}).get("custom")) or []):
            if not shelf.get("id"):
                continue
            entries = []
            for card in items.get(shelf["id"]) or []:
                entries.append(self._entry_from_account(card))
            data["shelves"].append(
                {
                    "id": str(uuid.uuid4()),
                    "remote_id": shelf["id"],
                    "name": shelf.get("name") or "",
                    "kind": shelf.get("kind") or "manual",
                    "rules": shelf.get("rules"),
                    "sort": shelf.get("sort") or "manual",
                    "position": position,
                    "dirty": False,
                    "deleted": False,
                    "order_dirty": False,
                    "entries": entries if shelf.get("kind") != "smart" else [],
                    "account_items": (items.get(shelf["id"]) or []) if shelf.get("kind") == "smart" else [],
                }
            )

    def _import_old_system_items(self, data: dict) -> None:
        try:
            old = json.loads(self.path.with_name("shelves-cache.json").read_text(encoding="utf-8"))
        except Exception:
            return
        items = old.get("items") or {}
        system = {key: items[key] for key in SYSTEM_TO_STATUS if isinstance(items.get(key), list)}
        if system:
            self.apply_system_items(data, system)

    @staticmethod
    def apply_system_items(data: dict, system: dict[str, list[dict]]) -> None:
        """Take the account's Favorites / Living / Lived (system shelf cards) as the status flags."""

        data["system_items"] = system
        status: dict[str, dict] = {}
        for key, flag in SYSTEM_TO_STATUS.items():
            for card in system.get(key) or []:
                if card.get("type") == "story" and card.get("id"):
                    entry = status.setdefault(card["id"], {"title": card.get("title") or ""})
                    entry[flag] = True
        for entry in status.values():
            for flag in SYSTEM_TO_STATUS.values():
                entry.setdefault(flag, False)
        # Keep titles of stories the account no longer flags (they may be on shelves).
        for story_id, old in (data.get("status") or {}).items():
            if story_id not in status:
                status[story_id] = {"title": old.get("title") or "", "favorite": False, "living": False, "lived": False}
        data["status"] = status

    def save(self) -> None:
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.path)

    def _changed(self) -> None:
        self.save()
        for listener in list(self.listeners):
            try:
                listener()
            except Exception:
                pass

    def has_pending_changes(self) -> bool:
        with self.lock:
            if self.data.get("order_dirty") or self.data.get("status_pending"):
                return True
            for shelf in self.data["shelves"]:
                if shelf.get("dirty") or shelf.get("deleted") or not shelf.get("remote_id") or shelf.get("order_dirty"):
                    return True
                for entry in shelf.get("entries") or []:
                    if entry.get("removed") or not entry.get("remote_entry_id"):
                        return True
            return False

    # -- helpers -------------------------------------------------------------------

    def _shelf(self, shelf_id: str) -> dict | None:
        return next(
            (s for s in self.data["shelves"] if s["id"] == shelf_id and not s.get("deleted")),
            None,
        )

    def _live_shelves(self) -> list[dict]:
        return sorted(
            (s for s in self.data["shelves"] if not s.get("deleted")),
            key=lambda s: (s.get("position", 0), s.get("name") or ""),
        )

    @staticmethod
    def _live_entries(shelf: dict) -> list[dict]:
        return sorted(
            (e for e in shelf.get("entries") or [] if not e.get("removed")),
            key=lambda e: e.get("position", 0),
        )

    def _entry_from_account(self, card: dict) -> dict:
        """Entry for an item the account has on a shelf."""

        item_type, item_id = card.get("type"), card.get("id")
        ref, remote_ref = item_id, None
        if item_type == "library_item":
            local = self.library.find_by_remote(item_id or "")
            ref, remote_ref = (local.id if local else None), item_id
        return {
            "entry_id": str(uuid.uuid4()),
            "type": item_type,
            "ref": ref,
            "remote_ref": remote_ref,
            "title": card.get("title") or "",
            "format": card.get("format"),
            "cover_url": card.get("cover_url"),
            "author": card.get("author") or "",
            "position": 0,
            "remote_entry_id": card.get("entry_id"),
            "added_at": card.get("added_at") or _now(),
            "removed": False,
        }

    def _status_of(self, story_id: str) -> dict:
        status = dict(self.data["status"].get(story_id) or {})
        pending = self.data["status_pending"].get(f"story:{story_id}")
        if pending:
            status.update(pending.get("flags") or {})
        return {k: bool(status.get(k)) for k in STATUS_KEYS}

    def _story_card(self, story_id: str, title: str = "", extra: dict | None = None) -> dict:
        local = self.library.find_story(story_id)
        card = item_card(local) if local is not None else {
            "key": f"story:{story_id}",
            "type": "story",
            "id": story_id,
            "title": title,
            "format": "story",
            "progress": 0,
        }
        if extra:
            for key, value in extra.items():
                if value and not card.get(key):
                    card[key] = value
        card["status"] = self._status_of(story_id)
        return card

    def _entry_card(self, entry: dict) -> dict | None:
        if entry["type"] == "library_item":
            local = self.library.get(entry.get("ref") or "")
            if local is not None:
                card = item_card(local)
            elif entry.get("remote_ref"):
                card = {
                    "key": f"library_item:{entry['remote_ref']}",
                    "type": "library_item",
                    "id": entry["remote_ref"],
                    "title": entry.get("title") or "",
                    "format": entry.get("format") or "epub",
                    "author": entry.get("author") or "",
                    "progress": 0,
                }
            else:
                return None  # the book was removed from the library
        elif entry["type"] == "story":
            card = self._story_card(entry["ref"], entry.get("title") or "", {"cover_url": entry.get("cover_url"), "author": entry.get("author")})
        else:
            card = {
                "key": f"screenplay:{entry['ref']}",
                "type": "screenplay",
                "id": entry["ref"],
                "title": entry.get("title") or "",
                "format": "screenplay",
                "progress": 0,
            }
        card["entry_id"] = entry["entry_id"]
        card["added_at"] = entry.get("added_at") or card.get("added_at")
        return card

    def _candidates(self) -> list[dict]:
        """Everything smart shelves can match on this computer."""

        cards: dict[str, dict] = {}
        for item in self.library.items():
            if item.kind == KIND_CROWDLY and item.story_title_id:
                cards[f"story:{item.story_title_id}"] = self._story_card(item.story_title_id, item.title)
            elif item.kind == KIND_IMPORTED:
                cards[f"local:{item.id}"] = item_card(item)
        for story_id, status in self.data["status"].items():
            key = f"story:{story_id}"
            if key not in cards:
                cards[key] = self._story_card(story_id, status.get("title") or "")
        return list(cards.values())

    # -- reading ---------------------------------------------------------------------

    def _system_cards(self, key: str) -> list[dict]:
        flag = SYSTEM_TO_STATUS[key]
        cards: dict[str, dict] = {}
        for card in self.data["system_items"].get(key) or []:
            if card.get("type") == "story" and card.get("id"):
                if self._status_of(card["id"]).get(flag):
                    cards[card["id"]] = self._story_card(card["id"], card.get("title") or "", card)
            elif card.get("type") == "screenplay":
                cards[f"sp:{card.get('id')}"] = dict(card)
        # Stories flagged on this computer but not seen on the account yet.
        for story_id, status in self.data["status"].items():
            if story_id not in cards and self._status_of(story_id).get(flag):
                cards[story_id] = self._story_card(story_id, status.get("title") or "")
        for pending in self.data["status_pending"].values():
            story_id = pending.get("id")
            if story_id and story_id not in cards and (pending.get("flags") or {}).get(flag):
                cards[story_id] = self._story_card(story_id, pending.get("title") or "")
        return list(cards.values())

    def list_shelves(self) -> dict:
        with self.lock:
            candidates = None
            custom = []
            for shelf in self._live_shelves():
                if shelf.get("kind") == "smart":
                    candidates = candidates if candidates is not None else self._candidates()
                    count = len(self._smart_cards(shelf, candidates))
                else:
                    count = sum(1 for e in self._live_entries(shelf) if self._entry_card(e) is not None)
                custom.append(
                    {
                        "id": shelf["id"],
                        "name": shelf.get("name") or "",
                        "kind": shelf.get("kind") or "manual",
                        "rules": shelf.get("rules"),
                        "sort": shelf.get("sort") or "manual",
                        "position": shelf.get("position", 0),
                        "count": count,
                    }
                )
            system = [{"key": k, "count": len(self._system_cards(k))} for k in SYSTEM_TO_STATUS]
            return {"system": system, "custom": custom}

    def _smart_cards(self, shelf: dict, candidates: list[dict]) -> list[dict]:
        cards = {c.get("key"): c for c in evaluate_rules(candidates, shelf.get("rules"))}
        # Matches the account found that aren't on this computer.
        for card in shelf.get("account_items") or []:
            local_key = None
            if card.get("type") == "library_item":
                local = self.library.find_by_remote(card.get("id") or "")
                local_key = f"local:{local.id}" if local else None
            elif card.get("type") == "story":
                local_key = f"story:{card.get('id')}"
            key = local_key or f"{card.get('type')}:{card.get('id')}"
            if key not in cards and not local_key:
                cards[key] = dict(card, key=key)
        return list(cards.values())

    def shelf_items(self, key: str) -> dict:
        with self.lock:
            if key in SYSTEM_TO_STATUS:
                return {"items": self._system_cards(key)}
            shelf = self._shelf(key)
            if shelf is None:
                return {"items": []}
            if shelf.get("kind") == "smart":
                cards = self._smart_cards(shelf, self._candidates())
            else:
                cards = [c for c in (self._entry_card(e) for e in self._live_entries(shelf)) if c is not None]
            return {"items": sort_cards(cards, shelf.get("sort") or "manual")}

    def membership(self, item_type: str, ref: str) -> dict:
        with self.lock:
            shelves = []
            for shelf in self._live_shelves():
                if shelf.get("kind") != "manual":
                    continue
                contains = any(e["type"] == item_type and e.get("ref") == ref for e in self._live_entries(shelf))
                shelves.append({"id": shelf["id"], "name": shelf.get("name") or "", "contains": contains})
            status = self._status_of(ref) if item_type == "story" else {k: False for k in STATUS_KEYS}
            return {"shelves": shelves, "status": status}

    # -- changes -----------------------------------------------------------------------

    def create_shelf(self, name: str, *, kind: str = "manual", rules: dict | None = None, sort: str | None = None) -> dict:
        with self.lock:
            position = max((s.get("position", 0) for s in self.data["shelves"]), default=-1) + 1
            shelf = {
                "id": str(uuid.uuid4()),
                "remote_id": None,
                "name": name.strip()[:100],
                "kind": "smart" if kind == "smart" else "manual",
                "rules": rules if kind == "smart" else None,
                "sort": sort or ("title" if kind == "smart" else "manual"),
                "position": position,
                "dirty": True,
                "deleted": False,
                "order_dirty": False,
                "entries": [],
                "account_items": [],
            }
            self.data["shelves"].append(shelf)
            self._changed()
            return {"id": shelf["id"], "name": shelf["name"], "kind": shelf["kind"]}

    def update_shelf(self, shelf_id: str, **changes: Any) -> dict:
        with self.lock:
            shelf = self._shelf(shelf_id)
            if shelf is None:
                return {}
            for key in ("name", "sort", "rules"):
                if key in changes and changes[key] is not None:
                    shelf[key] = changes[key]
            shelf["dirty"] = True
            self._changed()
            return {"id": shelf["id"], "name": shelf["name"]}

    def delete_shelf(self, shelf_id: str) -> None:
        with self.lock:
            shelf = self._shelf(shelf_id)
            if shelf is None:
                return
            if shelf.get("remote_id"):
                shelf["deleted"] = True
            else:
                self.data["shelves"].remove(shelf)
            self._changed()

    def reorder_shelves(self, ids: list[str]) -> None:
        with self.lock:
            order = {sid: i for i, sid in enumerate(ids)}
            for shelf in self.data["shelves"]:
                if shelf["id"] in order:
                    shelf["position"] = order[shelf["id"]]
            self.data["order_dirty"] = True
            self._changed()

    def add_to_shelf(self, shelf_id: str, item_type: str, ref: str, *, title: str = "") -> str | None:
        """Put an item on a manual shelf; books by their local library id."""

        with self.lock:
            shelf = self._shelf(shelf_id)
            if shelf is None or shelf.get("kind") != "manual" or not ref:
                return None
            for entry in shelf.get("entries") or []:
                if entry["type"] == item_type and entry.get("ref") == ref:
                    if entry.get("removed"):
                        entry["removed"] = False
                        self._changed()
                    return entry["entry_id"]
            if item_type == "library_item":
                local = self.library.get(ref)
                title = title or (local.title if local else "")
            elif item_type == "story" and title:
                self.data["status"].setdefault(ref, {}).setdefault("title", title)
            entry = {
                "entry_id": str(uuid.uuid4()),
                "type": item_type,
                "ref": ref,
                "remote_ref": None,
                "title": title,
                "position": max((e.get("position", 0) for e in shelf.get("entries") or []), default=-1) + 1,
                "remote_entry_id": None,
                "added_at": _now(),
                "removed": False,
            }
            shelf.setdefault("entries", []).append(entry)
            self._changed()
            return entry["entry_id"]

    def remove_from_shelf(self, shelf_id: str, item_id: str, item_type: str | None = None) -> None:
        """Remove by entry id, or by item ref when *item_type* is given."""

        with self.lock:
            shelf = self._shelf(shelf_id)
            if shelf is None:
                return
            for entry in list(shelf.get("entries") or []):
                hit = (
                    (entry["type"] == item_type and entry.get("ref") == item_id)
                    if item_type
                    else entry["entry_id"] == item_id
                )
                if not hit:
                    continue
                if entry.get("remote_entry_id"):
                    entry["removed"] = True
                else:
                    shelf["entries"].remove(entry)
            self._changed()

    def reorder_shelf_items(self, shelf_id: str, entry_ids: list[str]) -> None:
        with self.lock:
            shelf = self._shelf(shelf_id)
            if shelf is None:
                return
            order = {eid: i for i, eid in enumerate(entry_ids)}
            for entry in shelf.get("entries") or []:
                if entry["entry_id"] in order:
                    entry["position"] = order[entry["entry_id"]]
            shelf["order_dirty"] = True
            self._changed()

    def set_story_status(self, content_type: str, content_id: str, *, title: str = "", **flags: bool) -> dict:
        with self.lock:
            key = f"{content_type}:{content_id}"
            pending = self.data["status_pending"].setdefault(
                key, {"type": content_type, "id": content_id, "title": title, "flags": {}}
            )
            if title:
                pending["title"] = title
            pending["flags"].update({k: bool(v) for k, v in flags.items() if k in STATUS_KEYS})
            if content_type == "story" and title:
                self.data["status"].setdefault(content_id, {}).setdefault("title", title)
            self._changed()
            return self._status_of(content_id) if content_type == "story" else dict(pending["flags"])
