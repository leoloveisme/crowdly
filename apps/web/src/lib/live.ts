import { useCallback, useEffect, useRef, useState } from "react";
import { Repo, type DocHandle, type PeerId } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import * as Automerge from "@automerge/automerge";
import { API_BASE } from "./api";
import { ensureCrdtDoc } from "./story";

// Live co-editing: the browser joins the backend's automerge-repo over the
// /crdt-sync WebSocket (backend/src/crdt/repo.js — authenticated by the
// same session cookie, access checked per document). Chapter docs are
// { title, paragraphs[] } as seeded by backend/src/crdt/seeders.js; edits go
// in as character-level text splices (Automerge.updateText), so two people
// typing in the same paragraph merge instead of overwriting each other.
// Documents are also kept in IndexedDB, so they open offline.

export interface Presence {
  peer: string;
  name: string;
  color: string;
  paragraph: number | null;
  at: number;
}

interface ChapterDoc {
  title: string;
  paragraphs: string[];
}

let repo: Repo | null = null;
function getRepo(): Repo {
  if (!repo) {
    const origin = API_BASE || window.location.origin;
    const url = `${origin.replace(/^http/, "ws")}/crdt-sync`;
    repo = new Repo({
      network: [new BrowserWebSocketClientAdapter(url)],
      storage: new IndexedDBStorageAdapter("crowdly-web-app"),
      peerId: `web-${Math.random().toString(36).slice(2, 10)}` as PeerId,
      // Only share documents the server asks about; never announce our own.
      sharePolicy: async () => false,
    });
  }
  return repo;
}

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04"];
const colorFor = (s: string) => COLORS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];

function writeInto(d: ChapterDoc, value: ChapterDoc) {
  if (typeof d.title !== "string") d.title = value.title;
  else if (d.title !== value.title) Automerge.updateText(d, ["title"], value.title);
  if (!Array.isArray(d.paragraphs)) {
    d.paragraphs = value.paragraphs.slice();
    return;
  }
  while (d.paragraphs.length > value.paragraphs.length) d.paragraphs.splice(d.paragraphs.length - 1, 1);
  value.paragraphs.forEach((p, i) => {
    if (i >= d.paragraphs.length) d.paragraphs.splice(i, 0, p);
    else if (d.paragraphs[i] !== p) Automerge.updateText(d, ["paragraphs", i], p);
  });
}

const same = (a: ChapterDoc | undefined, b: ChapterDoc | undefined) =>
  !!a && !!b && a.title === b.title && a.paragraphs.length === b.paragraphs.length && a.paragraphs.every((p, i) => p === b.paragraphs[i]);

/**
 * Live session for one chapter. `onRemote` receives the merged value
 * whenever someone else's edit lands. `push` sends local edits (call it on
 * every change; it's cheap). Disabled → no socket, no-ops.
 */
export function useLiveChapter(
  chapterId: string | null,
  enabled: boolean,
  me: { id: string; email: string } | null,
  onRemote: (v: ChapterDoc) => void,
) {
  const [handle, setHandle] = useState<DocHandle<ChapterDoc> | null>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Presence[]>([]);
  const last = useRef<ChapterDoc | undefined>();
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  const paragraphRef = useRef<number | null>(null);

  useEffect(() => {
    setHandle(null);
    setPeers([]);
    setConnected(false);
    if (!enabled || !chapterId || !me) return;
    let cancelled = false;
    let h: DocHandle<ChapterDoc> | null = null;

    const onChange = ({ doc }: { doc: ChapterDoc }) => {
      const v = { title: doc.title ?? "", paragraphs: (doc.paragraphs ?? []).map((p) => p ?? "") };
      if (same(v, last.current)) return; // our own echo
      last.current = v;
      onRemoteRef.current(v);
    };
    const onEphemeral = ({ message }: { message: unknown }) => {
      const m = message as Partial<Presence> & { type?: string };
      if (m?.type !== "presence" || !m.peer) return;
      setPeers((ps) => [...ps.filter((p) => p.peer !== m.peer && Date.now() - p.at < 12_000), { peer: m.peer!, name: m.name ?? "", color: m.color ?? "#888", paragraph: m.paragraph ?? null, at: Date.now() }]);
    };

    (async () => {
      try {
        const key = await ensureCrdtDoc({ docType: "chapter", chapterId });
        const r = getRepo();
        h = await r.find<ChapterDoc>(key as never);
        if (cancelled) return;
        const d = h.doc();
        last.current = d ? { title: d.title ?? "", paragraphs: (d.paragraphs ?? []).map((p) => p ?? "") } : undefined;
        h.on("change", onChange);
        h.on("ephemeral-message", onEphemeral as never);
        setHandle(h);
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();

    // Presence heartbeat.
    const peerId = `${me.id}-${Math.random().toString(36).slice(2, 6)}`;
    const beat = setInterval(() => {
      h?.broadcast({ type: "presence", peer: peerId, name: me.email.split("@")[0], color: colorFor(me.id), paragraph: paragraphRef.current });
      setPeers((ps) => ps.filter((p) => Date.now() - p.at < 12_000));
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(beat);
      h?.off("change", onChange);
      h?.off("ephemeral-message", onEphemeral as never);
    };
  }, [chapterId, enabled, me]);

  const push = useCallback(
    (value: ChapterDoc) => {
      if (!handle || same(value, last.current)) return;
      last.current = value;
      handle.change((d) => writeInto(d, value), { message: JSON.stringify({ userId: me?.id, userName: me?.email, source: "web-app" }) });
    },
    [handle, me],
  );

  const setMyParagraph = useCallback((i: number | null) => {
    paragraphRef.current = i;
  }, []);

  return { connected: connected && !!handle, peers, push, setMyParagraph };
}
