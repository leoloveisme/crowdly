// Real-time CRDT collaboration core: an automerge-repo Repo wired to
// Postgres for storage and to `ws` for the live sync transport, plus the
// authorization, revision-history, and restore helpers built on top of it.
//
// This module owns *mechanism* (Repo, WebSocket upgrade handling, doc
// authorization, history/restore). server.js owns the REST endpoints and
// table bootstrapping that call into it.

import { WebSocketServer } from 'ws';
import { Repo } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import * as Automerge from '@automerge/automerge';
import { parse as parseCookieHeader } from 'cookie';
import { PostgresStorageAdapter } from './postgresStorageAdapter.js';

export const CRDT_WS_PATH = '/crdt-sync';

/**
 * Builds the Repo + WebSocket server adapter. Call once at startup.
 *
 * `authorizeDocAccess` is invoked as automerge-repo's `sharePolicy` for
 * every (peerId, documentId) pair a peer tries to sync. `peerId` here is
 * client-supplied inside the automerge-repo "join" message, so it cannot be
 * trusted as an identity on its own — we resolve it back to the actual
 * authenticated WebSocket connection via `wsAdapter.sockets[peerId]`
 * (populated by the adapter itself only for connections it manages) and
 * read the `crowdlyUser` we attached during the HTTP upgrade handshake in
 * `attachCrdtWebSocketServer` below. A peer can only ever "claim" a peerId
 * that resolves back to its own authenticated socket, so this can't be
 * spoofed by sending an arbitrary peerId string.
 */
export function createCrdtRepo({ pool, authorizeDocAccess }) {
  const wss = new WebSocketServer({ noServer: true });
  const wsAdapter = new NodeWSServerAdapter(wss);

  const repo = new Repo({
    network: [wsAdapter],
    storage: new PostgresStorageAdapter(pool),
    peerId: 'crowdly-server',
    sharePolicy: async (peerId, documentId) => {
      if (!documentId) return false;
      try {
        return await authorizeDocAccess(peerId, documentId, wsAdapter);
      } catch (err) {
        console.error('[crdt] sharePolicy check failed:', err);
        return false;
      }
    },
  });

  return { repo, wss, wsAdapter };
}

/**
 * Wires the CRDT WebSocket upgrade path onto an existing http.Server.
 * Authenticates using the same session cookie the rest of the backend
 * already relies on (see sessions.js) — there is no bearer-token flow in
 * this backend yet, so native/mobile clients will need one added
 * separately (flagged in docs/mobile-crdt-spec.md).
 */
export function attachCrdtWebSocketServer(httpServer, { wss, getSessionUser }) {
  httpServer.on('upgrade', async (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://internal').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== CRDT_WS_PATH) {
      // No other upgrade-handled paths exist on this server today; destroy
      // rather than leave the socket hanging.
      socket.destroy();
      return;
    }

    let user = null;
    try {
      const cookies = parseCookieHeader(req.headers.cookie || '');
      user = await getSessionUser(cookies.crowdly_session);
    } catch (err) {
      console.error('[crdt] WS auth check failed:', err);
    }

    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Stamped before automerge-repo's own 'connection' listener (added
      // once, at startup, in createCrdtRepo) runs — see the sharePolicy
      // comment above for why this is safe to trust later.
      ws.crowdlyUser = user;
      wss.emit('connection', ws, req);
    });
  });
}

/** Default authorizeDocAccess: gate sync on story_access/screenplay_access. */
export async function authorizeDocAccess(peerId, documentId, wsAdapter, pool) {
  const socket = wsAdapter.sockets[String(peerId)];
  const user = socket && socket.crowdlyUser;
  if (!user) return false;

  const { rows } = await pool.query(
    'SELECT story_title_id, screenplay_id FROM crdt_documents WHERE doc_key = $1',
    [documentId],
  );
  if (rows.length === 0) {
    // Not catalogued yet — nothing to protect. Real access control happens
    // at doc-creation time in POST /crdt/docs/ensure, which checks
    // story_access/screenplay_access before a doc_key is ever minted for a
    // chapter/scene the requester doesn't have access to.
    return true;
  }

  const { story_title_id: storyTitleId, screenplay_id: screenplayId } = rows[0];
  if (storyTitleId) {
    const { rows: access } = await pool.query(
      'SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2 LIMIT 1',
      [storyTitleId, user.id],
    );
    return access.length > 0;
  }
  if (screenplayId) {
    const { rows: access } = await pool.query(
      'SELECT 1 FROM screenplay_access WHERE screenplay_id = $1 AND user_id = $2 LIMIT 1',
      [screenplayId, user.id],
    );
    return access.length > 0;
  }
  return false;
}

/** Encodes {userId, userName} into a change's `message` so history/restore can attribute it without decoding Automerge actor ids into app users. */
export function changeAttribution(user, source) {
  return JSON.stringify({
    userId: user?.id ?? null,
    userName: user?.email ?? user?.name ?? null,
    ...(source ? { source } : {}),
  });
}

function parseAttribution(message) {
  if (!message) return { userId: null, userName: null };
  try {
    const parsed = JSON.parse(message);
    return { userId: parsed?.userId ?? null, userName: parsed?.userName ?? null };
  } catch {
    return { userId: null, userName: null };
  }
}

/**
 * Groups a document's raw per-change Automerge history into revision-list
 * entries (consecutive changes by the same author within `gapMs` collapse
 * into one entry) — raw per-keystroke changes are too granular for a
 * human-facing revision list. Mirrors the shape RevisionComparison.tsx
 * already expects (see src/types/revisions.ts).
 */
export function buildRevisionHistory(doc, { gapMs = 2 * 60 * 1000 } = {}) {
  const states = Automerge.getHistory(doc); // [{ change: DecodedChange, snapshot }]
  const groups = [];

  for (const { change, snapshot } of states) {
    const attribution = parseAttribution(change.message);
    const last = groups[groups.length - 1];
    const sameActor = last && last.actor === change.actor;
    const withinGap = last && (change.time - last.lastTime) * 1000 <= gapMs;

    if (last && sameActor && withinGap) {
      last.snapshot = snapshot;
      last.heads = [change.hash];
      last.lastTime = change.time;
      last.changeCount += 1;
      // Prefer the most recent non-null attribution in the group — e.g. the
      // repo.create() call that starts a doc has no message (unattributed),
      // but an immediately-following attributed change should still label
      // the whole group, not lose to the earlier anonymous one.
      if (attribution.userId != null) {
        last.userId = attribution.userId;
        last.userName = attribution.userName;
      }
    } else {
      groups.push({
        actor: change.actor,
        userId: attribution.userId,
        userName: attribution.userName,
        lastTime: change.time,
        heads: [change.hash],
        snapshot,
        changeCount: 1,
      });
    }
  }

  return groups.map((g, i) => ({
    revisionNumber: i + 1,
    heads: g.heads,
    createdAt: new Date(g.lastTime * 1000).toISOString(),
    createdBy: g.userId,
    createdByName: g.userName,
    changeCount: g.changeCount,
    snapshot: g.snapshot,
  }));
}

/**
 * Restores a live DocHandle's content to match its historical value at
 * `toHeads`, expressed as a new forward change — never a truncation, so
 * full history (including everything after `toHeads`) stays intact and a
 * restore can itself be undone by restoring again.
 *
 * Automerge 3.x treats every plain JS string as CRDT text by default (no
 * more explicit `Text` wrapper class), so every string field in these docs
 * is already char-level mergeable. Restoring a string field therefore uses
 * `Automerge.updateText(root, path, newText)`, which diffs old vs. new
 * content itself and applies the result as real splice ops — a normal,
 * mergeable edit, not a wholesale replace — rather than us hand-rolling a
 * delete-all/insert-all.
 */
export function restoreHandleToHeads(handle, toHeads, user) {
  const liveDoc = handle.doc();
  const historicalDoc = Automerge.view(liveDoc, toHeads);
  const message = changeAttribution(user);

  handle.change((draft) => {
    restoreValueInPlace(draft, draft, historicalDoc, []);
  }, { message, time: Math.floor(Date.now() / 1000) });
}

/**
 * Applies `newValue` to a live DocHandle as a single change, field-by-field
 * (same text-preserving logic as restoreHandleToHeads, just against an
 * arbitrary new value instead of a historical view). This is the "desktop
 * stays reconstruct-and-resend" sync path: the desktop app has no native
 * CRDT of its own (no maintained Automerge binding for Python — see
 * apps/desktop's plan notes), so instead of keystroke-level operational
 * merge it posts its current full content on each sync, and the backend
 * folds that in as one attributed changeset — still fully mergeable text
 * going forward, just coarser for that one sync than a live editor's
 * character-by-character changes would be.
 */
export function applyContentToHandle(handle, newValue, user, extraMessage) {
  const message = changeAttribution(user, extraMessage);
  handle.change((draft) => {
    restoreValueInPlace(draft, draft, newValue, []);
  }, { message, time: Math.floor(Date.now() / 1000) });
}

/**
 * Recursively overwrites `live` (a subtree of the change-callback draft
 * rooted at `root`) to match `historical`'s value at the given `path`
 * (absolute, from `root` — required by Automerge.updateText's path-based
 * API). String fields go through updateText (diff-based splice); list
 * length changes use the draft's own insertAt/deleteAt; everything else is
 * a plain assignment.
 */
function restoreValueInPlace(root, live, historical, path) {
  if (historical == null || typeof historical !== 'object') {
    return; // caller assigns scalars directly (see the per-key/per-index loops below)
  }

  if (Array.isArray(historical)) {
    while (live.length > historical.length) live.deleteAt(live.length - 1);
    for (let i = 0; i < historical.length; i++) {
      const historicalItem = historical[i];
      if (i >= live.length) {
        live.insertAt(i, typeof historicalItem === 'string'
          ? historicalItem
          : (historicalItem && typeof historicalItem === 'object' ? {} : historicalItem));
      }
      const itemPath = [...path, i];
      if (typeof historicalItem === 'string') {
        if (live[i] !== historicalItem) Automerge.updateText(root, itemPath, historicalItem);
      } else if (historicalItem && typeof historicalItem === 'object') {
        restoreValueInPlace(root, live[i], historicalItem, itemPath);
      } else if (live[i] !== historicalItem) {
        live[i] = historicalItem;
      }
    }
    return;
  }

  // Plain object / map.
  for (const key of Object.keys(historical)) {
    const historicalValue = historical[key];
    const liveValue = live[key];
    const keyPath = [...path, key];
    if (typeof historicalValue === 'string') {
      if (liveValue !== historicalValue) Automerge.updateText(root, keyPath, historicalValue);
    } else if (historicalValue && typeof historicalValue === 'object') {
      if (liveValue == null || typeof liveValue !== 'object') {
        live[key] = Array.isArray(historicalValue) ? [] : {};
      }
      restoreValueInPlace(root, live[key], historicalValue, keyPath);
    } else if (liveValue !== historicalValue) {
      live[key] = historicalValue;
    }
  }
}
