"""Local-first shelves: the store on this computer and its sync with the account."""

import uuid

from editor.library.shelf_store import LocalShelfStore
from editor.library.shelf_sync import sync_shelves
from editor.library.store import LocalLibrary


def _library(tmp_path):
    library = LocalLibrary(tmp_path / "lib")
    book = tmp_path / "Book.md"
    book.write_text("# Moby\n\nCall me Ishmael.\n", encoding="utf-8")
    return library, library.add_file(book)


def test_offline_changes_survive_a_restart(tmp_path):
    library, book = _library(tmp_path)
    store = LocalShelfStore(tmp_path / "shelves.json", library)
    summer = store.create_shelf("Summer")["id"]
    winter = store.create_shelf("Winter")["id"]
    store.add_to_shelf(summer, "library_item", book.id)
    store.add_to_shelf(summer, "story", "s1", title="A story")
    store.add_to_shelf(winter, "story", "s2")
    store.remove_from_shelf(winter, "s2", "story")
    entries = [e["entry_id"] for e in store.data["shelves"][0]["entries"]]
    store.reorder_shelf_items(summer, list(reversed(entries)))
    store.reorder_shelves([winter, summer])
    store.set_story_status("story", "s1", title="A story", favorite=True)

    again = LocalShelfStore(tmp_path / "shelves.json", library)
    listing = again.list_shelves()
    assert [s["name"] for s in sorted(listing["custom"], key=lambda s: s["position"])] == ["Winter", "Summer"]
    assert [c["title"] for c in again.shelf_items(summer)["items"]] == ["A story", "Moby"]
    assert again.shelf_items(winter)["items"] == []
    assert {s["key"]: s["count"] for s in listing["system"]}["favorites"] == 1
    assert again.has_pending_changes()


def test_smart_shelves_are_evaluated_locally(tmp_path):
    library, book = _library(tmp_path)
    store = LocalShelfStore(tmp_path / "shelves.json", library)
    unread = store.create_shelf(
        "Unread", kind="smart", rules={"match": "all", "rules": [{"field": "progress", "op": "is", "value": "unread"}]}
    )["id"]
    assert [c["title"] for c in store.shelf_items(unread)["items"]] == ["Moby"]
    library.update_position(book.id, 40.0, {"text_pos": 3})
    assert store.shelf_items(unread)["items"] == []


class FakeAccount:
    """Just enough of LibrarySyncClient's shelf calls, kept in memory."""

    def __init__(self):
        self.user_id = "u1"
        self.shelves = {}  # id -> {name, kind, rules, sort, position, items: [{entry_id, type, id, title}]}
        self.status = {}
        self.calls = []

    def login(self):
        pass

    def list_shelves(self):
        return {"system": [], "custom": [
            {"id": sid, "name": s["name"], "kind": s["kind"], "rules": s["rules"], "sort": s["sort"],
             "position": s["position"]} for sid, s in self.shelves.items()]}

    def shelf_items(self, key):
        if key in self.shelves:
            return {"items": [{"type": i["type"], "id": i["id"], "title": i["title"], "entry_id": i["entry_id"]}
                              for i in self.shelves[key]["items"]]}
        flag = {"favorites": "favorite", "living": "living", "lived": "lived"}[key]
        return {"items": [{"type": "story", "id": sid, "title": ""} for sid, f in self.status.items() if f.get(flag)]}

    def create_shelf(self, name, *, kind="manual", rules=None, sort=None):
        sid = str(uuid.uuid4())
        self.shelves[sid] = {"name": name, "kind": kind, "rules": rules, "sort": sort or "manual",
                             "position": len(self.shelves), "items": []}
        self.calls.append(("create", name))
        return {"id": sid}

    def update_shelf(self, shelf_id, **changes):
        self.shelves[shelf_id].update({k: v for k, v in changes.items() if v is not None})
        return {}

    def delete_shelf(self, shelf_id):
        self.calls.append(("delete", shelf_id))
        self.shelves.pop(shelf_id, None)

    def add_to_shelf(self, shelf_id, item_type, item_id):
        entry_id = str(uuid.uuid4())
        self.shelves[shelf_id]["items"].append({"entry_id": entry_id, "type": item_type, "id": item_id, "title": ""})
        self.calls.append(("add", item_type, item_id))
        return entry_id

    def remove_from_shelf(self, shelf_id, entry_id):
        items = self.shelves[shelf_id]["items"]
        self.shelves[shelf_id]["items"] = [i for i in items if i["entry_id"] != entry_id]
        self.calls.append(("remove", entry_id))

    def reorder_shelf_items(self, shelf_id, entry_ids):
        order = {e: n for n, e in enumerate(entry_ids)}
        self.shelves[shelf_id]["items"].sort(key=lambda i: order.get(i["entry_id"], 0))

    def reorder_shelves(self, ids):
        for n, sid in enumerate(ids):
            self.shelves[sid]["position"] = n

    def set_story_status(self, content_type, content_id, **flags):
        self.status.setdefault(content_id, {}).update(flags)
        return {}


def test_sync_pushes_offline_work_and_pulls_web_shelves(tmp_path):
    library, book = _library(tmp_path)
    store = LocalShelfStore(tmp_path / "shelves.json", library)
    summer = store.create_shelf("Summer")["id"]
    store.add_to_shelf(summer, "library_item", book.id)
    store.add_to_shelf(summer, "story", "s1", title="A story")
    store.set_story_status("story", "s1", title="A story", favorite=True)
    account = FakeAccount()

    # The book isn't uploaded yet: the shelf and the story go now, the book waits.
    report = sync_shelves(store, account)
    assert not report.errors
    remote = store.data["shelves"][0]["remote_id"]
    assert [i["type"] for i in account.shelves[remote]["items"]] == ["story"]
    assert account.status["s1"]["favorite"] is True
    assert [c["title"] for c in store.shelf_items(summer)["items"]] == ["Moby", "A story"]

    # Once the library sync has uploaded the book, it reaches the shelf by its account id.
    book.remote_id = "remote-book"
    sync_shelves(store, account)
    assert ("add", "library_item", "remote-book") in account.calls
    assert not store.has_pending_changes()

    # Removed offline, then synced: the account loses it too.
    store.remove_from_shelf(summer, "s1", "story")
    sync_shelves(store, account)
    assert [i["id"] for i in account.shelves[remote]["items"]] == ["remote-book"]

    # A shelf made on the web shows up; one deleted locally is deleted remotely.
    web = account.create_shelf("From the web")["id"]
    sync_shelves(store, account)
    assert {s["name"] for s in store.list_shelves()["custom"]} == {"Summer", "From the web"}
    store.delete_shelf(summer)
    sync_shelves(store, account)
    assert ("delete", remote) in account.calls
    assert [s["id"] for s in store.list_shelves()["custom"]] == [web]


def test_old_cache_seeds_shelves_and_favorites(tmp_path):
    import json

    library = LocalLibrary(tmp_path / "lib")
    (tmp_path / "shelves-cache.json").write_text(json.dumps({
        "shelves": {"custom": [{"id": "r1", "name": "sci-fi", "kind": "manual", "sort": "manual"}]},
        "items": {
            "favorites": [{"type": "story", "id": "s1", "title": "Loved"}],
            "living": [{"type": "story", "id": "s1", "title": "Loved"}, {"type": "story", "id": "s2", "title": "Read"}],
            "lived": [],
            "r1": [{"type": "story", "id": "s2", "title": "Read", "entry_id": "e1"}],
        },
    }), encoding="utf-8")
    store = LocalShelfStore(tmp_path / "shelves.json", library)
    counts = {s["key"]: s["count"] for s in store.list_shelves()["system"]}
    assert counts == {"favorites": 1, "living": 2, "lived": 0}
    assert [s["name"] for s in store.list_shelves()["custom"]] == ["sci-fi"]
    assert store.membership("story", "s1")["status"]["favorite"] is True
    assert not store.has_pending_changes()  # mirrors the account, nothing to send

    # A shelves.json made before this import existed gets the flags once too.
    store.data["system_items"] = {}
    store.data["status"] = {}
    store.save()
    again = LocalShelfStore(tmp_path / "shelves.json", library)
    assert {s["key"]: s["count"] for s in again.list_shelves()["system"]}["living"] == 2
