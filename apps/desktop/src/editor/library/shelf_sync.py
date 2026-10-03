"""Sync the local shelf mirror (``shelf_store``) with the user's account.

Runs after ``sync.sync_library`` (so books already have their account ids)
whenever "Synchronisation with web platform" is on.

1. Push what changed on this computer, in an order the server can follow:
   deleted shelves, new shelves, renamed / re-sorted shelves, items added or
   removed (books that aren't uploaded yet wait for the next run), item order,
   Favorite / Living / Lived changes, shelf order.
2. Pull the account's shelves: shelves without local changes take the
   account's state, so shelves made on the web or another device appear and
   shelves deleted elsewhere disappear.

Network calls happen outside the store's lock; each step re-checks the
store, so the reader can keep using shelves while a sync runs.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .shelf_store import SYSTEM_TO_STATUS, LocalShelfStore
from .sync import LibrarySyncClient, LibrarySyncError


@dataclass
class ShelfSyncReport:
    pushed: int = 0
    pulled: int = 0
    errors: list[str] = field(default_factory=list)


def _remote_ref(store: LocalShelfStore, entry: dict) -> str | None:
    if entry["type"] == "library_item":
        local = store.library.get(entry.get("ref") or "")
        if local is not None and local.remote_id:
            return local.remote_id
        return entry.get("remote_ref")
    return entry.get("ref")


def push(store: LocalShelfStore, client: LibrarySyncClient, report: ShelfSyncReport) -> None:
    with store.lock:
        shelves = [dict(s, entries=[dict(e) for e in s.get("entries") or []]) for s in store.data["shelves"]]

    for snapshot in shelves:
        shelf_id = snapshot["id"]
        try:
            # Deleted on this computer.
            if snapshot.get("deleted"):
                if snapshot.get("remote_id"):
                    try:
                        client.delete_shelf(snapshot["remote_id"])
                    except LibrarySyncError as exc:
                        if exc.status != 404:
                            raise
                with store.lock:
                    store.data["shelves"] = [s for s in store.data["shelves"] if s["id"] != shelf_id]
                report.pushed += 1
                continue

            remote_id = snapshot.get("remote_id")
            if not remote_id:
                created = client.create_shelf(
                    snapshot.get("name") or "",
                    kind=snapshot.get("kind") or "manual",
                    rules=snapshot.get("rules") if snapshot.get("kind") == "smart" else None,
                    sort=snapshot.get("sort"),
                )
                remote_id = created.get("id")
                with store.lock:
                    live = store._shelf(shelf_id)
                    if live is not None:
                        live["remote_id"] = remote_id
                        # Still dirty only if it changed while it was being created.
                        live["dirty"] = any(live.get(k) != snapshot.get(k) for k in ("name", "sort", "rules"))
                report.pushed += 1
            elif snapshot.get("dirty"):
                changes = {"name": snapshot.get("name"), "sort": snapshot.get("sort")}
                if snapshot.get("kind") == "smart" and snapshot.get("rules"):
                    changes["rules"] = snapshot.get("rules")
                client.update_shelf(remote_id, **changes)
                with store.lock:
                    live = store._shelf(shelf_id)
                    if live is not None and all(live.get(k) == snapshot.get(k) for k in ("name", "sort", "rules")):
                        live["dirty"] = False
                report.pushed += 1

            if snapshot.get("kind") != "manual" or not remote_id:
                continue

            # Items.
            for entry in snapshot["entries"]:
                if entry.get("removed"):
                    if entry.get("remote_entry_id"):
                        try:
                            client.remove_from_shelf(remote_id, entry["remote_entry_id"])
                        except LibrarySyncError as exc:
                            if exc.status != 404:
                                raise
                    with store.lock:
                        live = store._shelf(shelf_id)
                        if live is not None:
                            live["entries"] = [
                                e for e in live.get("entries") or []
                                if not (e["entry_id"] == entry["entry_id"] and e.get("removed"))
                            ]
                    report.pushed += 1
                elif not entry.get("remote_entry_id"):
                    ref = _remote_ref(store, entry)
                    if not ref:
                        continue  # the book isn't uploaded yet
                    remote_entry = client.add_to_shelf(remote_id, entry["type"], ref)
                    with store.lock:
                        live = store._shelf(shelf_id)
                        for e in (live or {}).get("entries") or []:
                            if e["entry_id"] == entry["entry_id"]:
                                e["remote_entry_id"] = remote_entry
                    report.pushed += 1

            if snapshot.get("order_dirty"):
                with store.lock:
                    live = store._shelf(shelf_id)
                    entries = store._live_entries(live) if live else []
                    order = [e.get("remote_entry_id") for e in entries]
                if order and all(order):
                    client.reorder_shelf_items(remote_id, order)
                    with store.lock:
                        live = store._shelf(shelf_id)
                        if live is not None:
                            live["order_dirty"] = False
        except LibrarySyncError as exc:
            report.errors.append(f"{snapshot.get('name')}: {exc}")
        finally:
            store.save()

    # Favorite / Living / Lived chosen while offline.
    with store.lock:
        pending = dict(store.data["status_pending"])
    for key, change in pending.items():
        try:
            flags = change.get("flags") or {}
            client.set_story_status(change.get("type") or "story", change.get("id"), **flags)
            with store.lock:
                if store.data["status_pending"].get(key, {}).get("flags") == flags:
                    store.data["status_pending"].pop(key, None)
                    if change.get("type") == "story":
                        status = store.data["status"].setdefault(change["id"], {})
                        status.update(flags)
                        if change.get("title"):
                            status.setdefault("title", change["title"])
            report.pushed += 1
        except LibrarySyncError as exc:
            report.errors.append(str(exc))
    store.save()

    # Shelf order.
    with store.lock:
        order_dirty = store.data.get("order_dirty")
        ids = [s.get("remote_id") for s in store._live_shelves()]
    if order_dirty and ids and all(ids):
        try:
            client.reorder_shelves(ids)
            with store.lock:
                store.data["order_dirty"] = False
            store.save()
        except LibrarySyncError as exc:
            report.errors.append(str(exc))


def pull(store: LocalShelfStore, client: LibrarySyncClient, report: ShelfSyncReport) -> None:
    listing = client.list_shelves()
    remote_shelves = {s["id"]: s for s in listing.get("custom") or [] if s.get("id")}
    items = {sid: client.shelf_items(sid).get("items") or [] for sid in remote_shelves}
    system = {key: client.shelf_items(key).get("items") or [] for key in SYSTEM_TO_STATUS}

    with store.lock:
        local_by_remote = {s.get("remote_id"): s for s in store.data["shelves"] if s.get("remote_id")}
        kept: list[dict] = []
        for shelf in store.data["shelves"]:
            remote_id = shelf.get("remote_id")
            if remote_id and remote_id not in remote_shelves and not shelf.get("dirty") and not _has_local_item_changes(shelf):
                continue  # deleted on the web or another device
            kept.append(shelf)
        store.data["shelves"] = kept

        for remote_id, remote in remote_shelves.items():
            local = local_by_remote.get(remote_id)
            if local is not None and local not in kept:
                continue
            if local is None:
                local = {
                    "id": remote_id,  # stable and unique; the account id doubles as the local id
                    "remote_id": remote_id,
                    "deleted": False,
                    "order_dirty": False,
                    "entries": [],
                    "account_items": [],
                }
                kept.append(local)
            if local.get("deleted"):
                continue
            if not local.get("dirty"):
                local.update(
                    name=remote.get("name") or "",
                    kind=remote.get("kind") or "manual",
                    rules=remote.get("rules"),
                    sort=remote.get("sort") or "manual",
                    position=remote.get("position", 0),
                    dirty=False,
                )
            if local.get("kind") == "smart":
                local["account_items"] = items.get(remote_id) or []
                local["entries"] = []
            elif not _has_local_item_changes(local):
                entries = []
                for position, card in enumerate(items.get(remote_id) or []):
                    entry = store._entry_from_account(card)
                    entry["position"] = position
                    entries.append(entry)
                local["entries"] = entries
                local["order_dirty"] = False
            report.pulled += 1

        store.apply_system_items(store.data, system)
    store.save()


def _has_local_item_changes(shelf: dict) -> bool:
    if shelf.get("order_dirty"):
        return True
    return any(e.get("removed") or not e.get("remote_entry_id") for e in shelf.get("entries") or [])


def sync_shelves(store: LocalShelfStore, client: LibrarySyncClient) -> ShelfSyncReport:
    report = ShelfSyncReport()
    if client.user_id is None:
        client.login()
    push(store, client, report)
    try:
        pull(store, client, report)
    except LibrarySyncError as exc:
        report.errors.append(str(exc))
    return report
