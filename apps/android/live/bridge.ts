// Live co-editing for the Android app: the same automerge-repo client the
// web app runs (apps/web/src/lib/live.ts), bundled into
// app/src/main/assets/live/bridge.js and run in a hidden WebView whose page
// origin is the API server, so the /crdt-sync WebSocket carries the session
// cookie the app sets. No native Automerge build exists for Android (the JNI
// library is glibc-only), so this is how the phone joins the same real-time
// session as the platform, the web app and the desktop.
//
// Kotlin calls window.crowdlyLive.open/push/presence/close; the bridge
// answers through the CrowdlyAndroid JavaScript interface.
import { Repo, type DocHandle, type PeerId } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import * as Automerge from "@automerge/automerge";

interface ChapterDoc {
  title: string;
  paragraphs: string[];
}

declare const CrowdlyAndroid: {
  onRemote(json: string): void;
  onPeers(json: string): void;
  onState(connected: boolean): void;
  log(msg: string): void;
};

let repo: Repo | null = null;
let handle: DocHandle<ChapterDoc> | null = null;
let last: ChapterDoc | undefined;
let me: { id: string; name: string; color: string; peer: string } | null = null;
let paragraph: number | null = null;
let beat: ReturnType<typeof setInterval> | undefined;
let peers: { peer: string; name: string; color: string; paragraph: number | null; at: number }[] = [];

const value = (d: ChapterDoc | undefined): ChapterDoc => ({ title: d?.title ?? "", paragraphs: (d?.paragraphs ?? []).map((p) => p ?? "") });
const same = (a?: ChapterDoc, b?: ChapterDoc) =>
  !!a && !!b && a.title === b.title && a.paragraphs.length === b.paragraphs.length && a.paragraphs.every((p, i) => p === b.paragraphs[i]);

// Character-level splices, so two people typing in one paragraph merge.
function writeInto(d: ChapterDoc, v: ChapterDoc) {
  if (typeof d.title !== "string") d.title = v.title;
  else if (d.title !== v.title) Automerge.updateText(d, ["title"], v.title);
  if (!Array.isArray(d.paragraphs)) {
    d.paragraphs = v.paragraphs.slice();
    return;
  }
  while (d.paragraphs.length > v.paragraphs.length) d.paragraphs.splice(d.paragraphs.length - 1, 1);
  v.paragraphs.forEach((p, i) => {
    if (i >= d.paragraphs.length) d.paragraphs.splice(i, 0, p);
    else if (d.paragraphs[i] !== p) Automerge.updateText(d, ["paragraphs", i], p);
  });
}

const onChange = ({ doc }: { doc: ChapterDoc }) => {
  const v = value(doc);
  if (same(v, last)) return; // our own echo
  last = v;
  CrowdlyAndroid.onRemote(JSON.stringify(v));
};

const onEphemeral = ({ message }: { message: unknown }) => {
  const m = message as { type?: string; peer?: string; name?: string; color?: string; paragraph?: number | null };
  if (m?.type !== "presence" || !m.peer || m.peer === me?.peer) return;
  peers = [...peers.filter((p) => p.peer !== m.peer && Date.now() - p.at < 12_000), { peer: m.peer, name: m.name ?? "", color: m.color ?? "#888", paragraph: m.paragraph ?? null, at: Date.now() }];
  CrowdlyAndroid.onPeers(JSON.stringify(peers));
};

function close() {
  if (beat) clearInterval(beat);
  handle?.off("change", onChange);
  handle?.off("ephemeral-message", onEphemeral as never);
  handle = null;
  peers = [];
  CrowdlyAndroid.onPeers("[]");
  CrowdlyAndroid.onState(false);
}

async function open(origin: string, docKey: string, user: { id: string; name: string; color: string }) {
  close();
  try {
    if (!repo) {
      repo = new Repo({
        network: [new BrowserWebSocketClientAdapter(`${origin.replace(/^http/, "ws")}/crdt-sync`)],
        peerId: `android-${Math.random().toString(36).slice(2, 10)}` as PeerId,
        // Only share documents the server asks about; never announce our own.
        sharePolicy: async () => false,
      });
    }
    me = { ...user, peer: `${user.id}-${Math.random().toString(36).slice(2, 6)}` };
    const h = await repo.find<ChapterDoc>(docKey as never);
    handle = h;
    last = value(h.doc());
    h.on("change", onChange);
    h.on("ephemeral-message", onEphemeral as never);
    CrowdlyAndroid.onState(true);
    CrowdlyAndroid.onRemote(JSON.stringify(last));
    beat = setInterval(() => {
      handle?.broadcast({ type: "presence", peer: me!.peer, name: me!.name, color: me!.color, paragraph });
      const before = peers.length;
      peers = peers.filter((p) => Date.now() - p.at < 12_000);
      if (peers.length !== before) CrowdlyAndroid.onPeers(JSON.stringify(peers));
    }, 3000);
  } catch (err) {
    CrowdlyAndroid.log(String(err));
    CrowdlyAndroid.onState(false);
  }
}

function push(json: string) {
  const v = JSON.parse(json) as ChapterDoc;
  if (!handle || same(v, last)) return;
  last = v;
  handle.change((d) => writeInto(d, v), { message: JSON.stringify({ userId: me?.id, userName: me?.name, source: "android-app" }) });
}

(window as unknown as { crowdlyLive: unknown }).crowdlyLive = {
  open: (origin: string, docKey: string, user: string) => open(origin, docKey, JSON.parse(user)),
  push,
  presence: (p: number | null) => {
    paragraph = p;
  },
  close,
};
CrowdlyAndroid.log("bridge ready");
