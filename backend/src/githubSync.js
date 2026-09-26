// Phase 1 of the GitHub <-> Crowdly connector: file-level bidirectional sync
// between a GitHub repo and one creative space's `creative_space_items`
// content. Owns the new schema, the pull (GitHub -> Crowdly) and push
// (Crowdly -> GitHub) logic, the webhook event handlers, and the slow
// polling fallback. server.js owns the REST endpoints and wires them to the
// functions here; creativeSpaceFiles.js's upload/edit routes call
// scheduleGithubPush() after a user-initiated content change.
//
// Loop guard: creative_space_items.github_blob_sha records the GitHub blob
// sha we last pulled or pushed for that item. A tree entry whose sha already
// matches is either unchanged or the echo of our own last push — either way,
// nothing to do. This is per-file (git blob shas), not the repo-wide tree
// sha, so one changed file doesn't force-refetch every tracked file.

import fs from 'fs';
import path from 'path';
import * as Automerge from '@automerge/automerge';
import { pool } from './db.js';
import {
  getInstallationToken,
  parseRepoFullName,
  fetchRepoTree,
  fetchBlobContent,
  fetchFileMeta,
  putFileContent,
} from './githubApp.js';
import { storeItemContent, guessMimeType, CREATIVE_SPACE_FILES_ROOT, MAX_UPLOAD_BYTES } from './creativeSpaceFiles.js';
import { applyContentToHandle } from './crdt/repo.js';
import { stripLeadingTitleLine, splitParagraphs } from '../scripts/lib/happybeingsSource.js';

export async function ensureGithubSyncTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_installations (
        installation_id bigint PRIMARY KEY,
        account_login   text,
        connected_by    text,
        connected_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_installation_id bigint');
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_repo text');
    await pool.query("ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_branch text NOT NULL DEFAULT 'master'");
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_sync_enabled boolean NOT NULL DEFAULT false');
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_last_commit_sha text');

    // Per-item loop guard (see module header) — separate from the
    // metadata-manifest `hash` column, which the desktop/web snapshot sync
    // protocol (POST /creative-spaces/:spaceId/sync) already owns.
    await pool.query('ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS github_blob_sha text');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_sync_log (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id      uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
        direction     text NOT NULL,
        level         text NOT NULL DEFAULT 'info',
        message       text NOT NULL,
        relative_path text,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS github_sync_log_space_idx ON github_sync_log(space_id, created_at DESC)');

    console.log('[init] ensured GitHub sync tables/columns exist');
  } catch (err) {
    console.error('[init] failed to ensure GitHub sync tables:', err);
  }
}

// Phase 2: chapter <-> markdown links. Kept as its own table/columns rather
// than folding into creative_space_items — a linked chapter is a CRDT
// document (versioned, mergeable), not a file blob, and the two need
// different loop-guard/apply logic (see part 3/4 of Phase 2 in the plan).
export async function ensureGithubContentLinksTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_content_links (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id        uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
        relative_path   text NOT NULL,
        doc_type        text NOT NULL DEFAULT 'chapter',
        entity_id       uuid NOT NULL,
        doc_key         text NOT NULL,
        github_blob_sha text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        created_by      text
      )
    `);
    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS github_content_links_space_path_idx ON github_content_links(space_id, relative_path)',
    );
    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS github_content_links_doc_key_idx ON github_content_links(doc_key)',
    );
    console.log('[init] ensured github_content_links table exists');
  } catch (err) {
    console.error('[init] failed to ensure github_content_links table:', err);
  }
}

async function logSync(spaceId, direction, level, message, relativePath = null) {
  try {
    await pool.query(
      'INSERT INTO github_sync_log (space_id, direction, level, message, relative_path) VALUES ($1, $2, $3, $4, $5)',
      [spaceId, direction, level, message, relativePath],
    );
  } catch (err) {
    console.error('[githubSync] failed to write sync log:', err);
  }
}

export async function recentSyncLog(spaceId, limit = 20) {
  const { rows } = await pool.query(
    'SELECT direction, level, message, relative_path, created_at FROM github_sync_log WHERE space_id = $1 ORDER BY created_at DESC LIMIT $2',
    [spaceId, limit],
  );
  return rows;
}

// Paths we never auto-import as new items, even though GitHub's tree lists
// them like any other blob: internal/tool-generated dotfiles and dotfolders
// (.github/, .crowdly/, .obsidian/, etc.) that were never meant to become
// visible Crowdly content.
function isSyncExcludedPath(relativePath) {
  return relativePath.split('/').some((segment) => segment.startsWith('.'));
}

/**
 * Creates a new creative_space_items row (and any missing ancestor folder
 * rows) for a GitHub path that isn't tracked yet, then fills in its content —
 * the counterpart to the itemStale branch below, which only ever updates a
 * row that already exists. Never touches github_content_links: a path only
 * becomes a linked chapter through the explicit /github-sync/link action.
 */
async function createItemFromGithub(space, entry, token, owner, repo) {
  if (isSyncExcludedPath(entry.path)) return false;
  if (typeof entry.size === 'number' && entry.size > MAX_UPLOAD_BYTES) {
    await logSync(space.id, 'pull', 'warning', `Skipped ${entry.path}: file exceeds the size limit`, entry.path);
    return false;
  }

  const visibility = space.visibility || 'private';
  const segments = entry.path.split('/');

  try {
    let ancestor = '';
    for (const segment of segments.slice(0, -1)) {
      ancestor = ancestor ? `${ancestor}/${segment}` : segment;
      await pool.query(
        `INSERT INTO creative_space_items (space_id, relative_path, name, kind, visibility, published, updated_by)
         VALUES ($1, $2, $3, 'folder', $4, false, 'github-sync')
         ON CONFLICT (space_id, relative_path) DO NOTHING`,
        [space.id, ancestor, segment, visibility],
      );
    }

    const buffer = await fetchBlobContent({ token, owner, repo, sha: entry.sha });
    const name = segments[segments.length - 1];
    const mimeType = guessMimeType(name);

    const { rows } = await pool.query(
      `INSERT INTO creative_space_items (space_id, relative_path, name, kind, mime_type, visibility, published, updated_by)
       VALUES ($1, $2, $3, 'file', $4, $5, false, 'github-sync')
       ON CONFLICT (space_id, relative_path) DO NOTHING
       RETURNING *`,
      [space.id, entry.path, name, mimeType, visibility],
    );
    const item = rows[0];
    if (!item) return false; // lost a race with a concurrent sync; the next pull pass will treat it as an update.

    await storeItemContent({ spaceId: space.id, itemId: item.id, buffer, mimeType, updatedBy: 'github-sync' });
    await pool.query('UPDATE creative_space_items SET github_blob_sha = $1 WHERE id = $2', [entry.sha, item.id]);
    await logSync(space.id, 'pull', 'info', `Created ${entry.path} from GitHub`, entry.path);
    return true;
  } catch (err) {
    console.error('[githubSync] create-from-pull failed for', entry.path, err);
    await logSync(space.id, 'pull', 'error', `Failed to create ${entry.path}: ${err.message}`, entry.path);
    return false;
  }
}

/**
 * Diffs the GitHub tree against tracked creative_space_items and pulls only
 * the files whose blob sha actually changed. `candidatePaths` (a Set), when
 * given, additionally restricts which paths are considered — used by the
 * webhook handler to skip content fetches for files the push event didn't
 * touch. One tree API call either way; content is fetched per-changed-file.
 */
async function pullChangedPaths(space, token, owner, repo, branch, candidatePaths) {
  const itemsRes = await pool.query(
    "SELECT * FROM creative_space_items WHERE space_id = $1 AND deleted = false AND kind = 'file'",
    [space.id],
  );
  const itemsByPath = new Map(itemsRes.rows.map((item) => [item.relative_path, item]));

  const linksRes = await pool.query('SELECT * FROM github_content_links WHERE space_id = $1', [space.id]);
  const linksByPath = new Map(linksRes.rows.map((link) => [link.relative_path, link]));

  const tree = await fetchRepoTree({ token, owner, repo, branch });
  let pulled = 0;

  for (const entry of tree.paths) {
    if (candidatePaths && !candidatePaths.has(entry.path)) continue;
    const item = itemsByPath.get(entry.path);
    const link = linksByPath.get(entry.path);
    if (!item && !link) {
      if (await createItemFromGithub(space, entry, token, owner, repo)) pulled += 1;
      continue;
    }

    const itemStale = item && item.github_blob_sha !== entry.sha;
    const linkStale = link && link.github_blob_sha !== entry.sha;
    if (!itemStale && !linkStale) continue; // unchanged, or the echo of our own last push.

    let buffer;
    try {
      buffer = await fetchBlobContent({ token, owner, repo, sha: entry.sha });
    } catch (err) {
      console.error('[githubSync] pull fetch failed for', entry.path, err);
      await logSync(space.id, 'pull', 'error', `Failed to fetch ${entry.path}: ${err.message}`, entry.path);
      continue;
    }

    if (itemStale) {
      try {
        await storeItemContent({
          spaceId: space.id,
          itemId: item.id,
          buffer,
          mimeType: item.mime_type || guessMimeType(item.name),
          updatedBy: 'github-sync',
        });
        await pool.query('UPDATE creative_space_items SET github_blob_sha = $1 WHERE id = $2', [entry.sha, item.id]);
        pulled += 1;
        await logSync(space.id, 'pull', 'info', `Pulled ${entry.path} from GitHub`, entry.path);
      } catch (err) {
        console.error('[githubSync] pull failed for', entry.path, err);
        await logSync(space.id, 'pull', 'error', `Failed to pull ${entry.path}: ${err.message}`, entry.path);
      }
    }

    if (linkStale) {
      try {
        await pullChapterFromGithub(link, buffer);
        await pool.query('UPDATE github_content_links SET github_blob_sha = $1 WHERE id = $2', [entry.sha, link.id]);
        pulled += 1;
        await logSync(space.id, 'pull', 'info', `Pulled chapter update for ${entry.path} from GitHub`, entry.path);
      } catch (err) {
        console.error('[githubSync] chapter pull failed for', entry.path, err);
        await logSync(space.id, 'pull', 'error', `Failed to pull chapter ${entry.path}: ${err.message}`, entry.path);
      }
    }
  }

  await pool.query(
    'UPDATE creative_spaces SET github_last_commit_sha = $1, last_synced_at = now() WHERE id = $2',
    [tree.sha, space.id],
  );

  return { pulled, treeSha: tree.sha };
}

/** Entry point for both the poll loop and the webhook handler. */
export async function runSpaceSync(spaceId, { candidatePaths = null } = {}) {
  const { rows } = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
  const space = rows[0];
  if (!space) return { skipped: true, reason: 'not_found' };
  if (!space.github_sync_enabled || !space.github_installation_id || !space.github_repo) {
    return { skipped: true, reason: 'not_connected' };
  }

  const { owner, repo } = parseRepoFullName(space.github_repo);
  if (!owner || !repo) return { skipped: true, reason: 'invalid_repo' };
  const branch = space.github_branch || 'master';

  try {
    const token = await getInstallationToken(space.github_installation_id);
    return await pullChangedPaths(space, token, owner, repo, branch, candidatePaths);
  } catch (err) {
    console.error('[githubSync] sync failed for space', spaceId, err);
    await logSync(spaceId, 'pull', 'error', `Sync failed: ${err.message}`);
    throw err;
  }
}

// --- Push path (Crowdly -> GitHub) ---------------------------------------

const PUSH_DEBOUNCE_MS = 1500;
const pushTimers = new Map(); // itemId -> Timeout, debounces rapid consecutive edits to the same item.

/** Called by creativeSpaceFiles.js after a user-initiated content write. No-op (cheaply) when the Space has no GitHub sync configured/enabled. */
export function scheduleGithubPush(spaceId, itemId) {
  const existing = pushTimers.get(itemId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pushTimers.delete(itemId);
    pushItemToGithub(spaceId, itemId).catch((err) => {
      console.error('[githubSync] push failed for item', itemId, err);
    });
  }, PUSH_DEBOUNCE_MS);
  pushTimers.set(itemId, timer);
}

async function pushItemToGithub(spaceId, itemId) {
  const spaceRes = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
  const space = spaceRes.rows[0];
  if (!space || !space.github_sync_enabled || !space.github_installation_id || !space.github_repo) return;

  const itemRes = await pool.query(
    "SELECT * FROM creative_space_items WHERE id = $1 AND space_id = $2 AND deleted = false AND kind = 'file'",
    [itemId, spaceId],
  );
  const item = itemRes.rows[0];
  if (!item || !item.storage_path) return;

  const { owner, repo } = parseRepoFullName(space.github_repo);
  if (!owner || !repo) return;
  const branch = space.github_branch || 'master';

  let buffer;
  try {
    buffer = fs.readFileSync(path.join(CREATIVE_SPACE_FILES_ROOT, item.storage_path));
  } catch (err) {
    console.error('[githubSync] could not read local file for push', item.relative_path, err);
    await logSync(spaceId, 'push', 'error', `Could not read local content for ${item.relative_path}: ${err.message}`, item.relative_path);
    return;
  }

  const token = await getInstallationToken(space.github_installation_id);

  let remote = null;
  try {
    remote = await fetchFileMeta({ token, owner, repo, filePath: item.relative_path, branch });
  } catch (err) {
    console.error('[githubSync] failed to look up remote file before push', item.relative_path, err);
    await logSync(spaceId, 'push', 'error', `Failed to check GitHub before push for ${item.relative_path}: ${err.message}`, item.relative_path);
    return;
  }

  // If GitHub already has a blob sha we haven't seen (via a prior pull), pushing now would silently clobber a GitHub-side edit we don't know about yet — defer to the next pull/poll instead.
  if (remote && item.github_blob_sha && remote.sha !== item.github_blob_sha) {
    await logSync(
      spaceId,
      'push',
      'warn',
      `Skipped push for ${item.relative_path}: GitHub has changes not yet pulled into Crowdly`,
      item.relative_path,
    );
    return;
  }

  try {
    const result = await putFileContent({
      token,
      owner,
      repo,
      filePath: item.relative_path,
      branch,
      buffer,
      sha: remote ? remote.sha : undefined,
      message: `Crowdly sync: update ${item.relative_path}`,
    });
    await pool.query('UPDATE creative_space_items SET github_blob_sha = $1 WHERE id = $2', [
      result.contentSha,
      itemId,
    ]);
    await pool.query('UPDATE creative_spaces SET github_last_commit_sha = $1, last_synced_at = now() WHERE id = $2', [
      result.commitSha,
      spaceId,
    ]);
    await logSync(spaceId, 'push', 'info', `Pushed ${item.relative_path} to GitHub`, item.relative_path);
  } catch (err) {
    console.error('[githubSync] push failed for', item.relative_path, err);
    await logSync(spaceId, 'push', 'error', `Failed to push ${item.relative_path}: ${err.message}`, item.relative_path);
  }
}

// --- Webhook handling -------------------------------------------------

async function handleInstallationEvent(payload) {
  const installation = payload.installation;
  if (!installation?.id) return;
  try {
    await pool.query(
      `INSERT INTO github_installations (installation_id, account_login)
       VALUES ($1, $2)
       ON CONFLICT (installation_id) DO UPDATE SET account_login = EXCLUDED.account_login`,
      [installation.id, installation.account?.login || null],
    );
  } catch (err) {
    console.error('[githubSync] failed to record installation event:', err);
  }
}

async function handlePushEvent(payload) {
  const repoFullName = payload.repository?.full_name;
  const ref = payload.ref;
  if (!repoFullName || !ref || !ref.startsWith('refs/heads/')) return;
  const branch = ref.slice('refs/heads/'.length);

  const { rows } = await pool.query(
    'SELECT id FROM creative_spaces WHERE github_sync_enabled = true AND github_repo = $1 AND github_branch = $2',
    [repoFullName, branch],
  );
  if (rows.length === 0) return;

  const changedPaths = new Set();
  for (const commit of payload.commits || []) {
    for (const p of [...(commit.added || []), ...(commit.modified || [])]) changedPaths.add(p);
  }

  for (const row of rows) {
    try {
      await runSpaceSync(row.id, { candidatePaths: changedPaths.size > 0 ? changedPaths : null });
    } catch (err) {
      console.error('[githubSync] webhook-triggered sync failed for space', row.id, err);
    }
  }
}

/** Dispatches a verified webhook event. Called from the async tail of POST /api/github/webhook, after the request has already been ack'd. */
export async function handleGithubWebhookEvent(eventName, payload) {
  if (eventName === 'installation' || eventName === 'installation_repositories') {
    await handleInstallationEvent(payload);
    return;
  }
  if (eventName === 'push') {
    await handlePushEvent(payload);
  }
}

// --- Phase 2: CRDT-backed chapter sync -----------------------------------
// Scope: doc_type 'chapter' (novel paragraphs) only — see the plan for why
// 'scene' (screenplay/Fountain-shaped content) isn't handled here.

const GITHUB_SYNC_ACTOR = { id: 'github-sync', email: 'github-sync@crowdly.internal' };

// Set once via initGithubCrdtLinks() at server startup — module-scoped so
// both the pull path above (pullChapterFromGithub) and the push listeners
// below can reach it without server.js threading it through every call.
let phase2CrdtRepo = null;

function chapterToMarkdown({ title, paragraphs }) {
  return `# ${title || ''}\n\n${(paragraphs || []).filter(Boolean).join('\n\n')}\n`;
}

/** True if the doc's most recent change was one of our own pulls (see applyContentToHandle's 'github' extraMessage below) — distinguishes that from a real user edit so the push listener doesn't echo it straight back to GitHub. */
function lastChangeWasFromGithub(doc) {
  const history = Automerge.getHistory(doc);
  if (history.length === 0) return false;
  const lastMessage = history[history.length - 1].change.message;
  if (!lastMessage) return false;
  try {
    return JSON.parse(lastMessage)?.source === 'github';
  } catch {
    return false;
  }
}

/** Folds parsed markdown into a linked chapter's CRDT doc as one attributed change (Phase 1's pull path writes bytes directly; this instead goes through applyContentToHandle so the change is a normal, mergeable, restorable revision — see crdt/repo.js). */
async function pullChapterFromGithub(link, buffer) {
  if (!phase2CrdtRepo) throw new Error('CRDT repo is not yet initialized');

  const { title: parsedTitle, body } = stripLeadingTitleLine(buffer.toString('utf8'));
  const paragraphs = splitParagraphs(body);

  const handle = await phase2CrdtRepo.find(link.doc_key);
  await handle.whenReady();
  const current = handle.doc();
  if (!current) throw new Error(`CRDT doc ${link.doc_key} not found`);

  const newValue = { ...current, title: parsedTitle || current.title, paragraphs };
  applyContentToHandle(handle, newValue, GITHUB_SYNC_ACTOR, 'github');
}

const contentLinkPushTimers = new Map(); // link id -> Timeout, same debounce shape as Phase 1's pushTimers.

async function pushLinkedChapterToGithub(linkId) {
  const { rows } = await pool.query('SELECT * FROM github_content_links WHERE id = $1', [linkId]);
  const link = rows[0];
  if (!link || !phase2CrdtRepo) return;

  const spaceRes = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [link.space_id]);
  const space = spaceRes.rows[0];
  if (!space || !space.github_sync_enabled || !space.github_installation_id || !space.github_repo) return;

  const { owner, repo } = parseRepoFullName(space.github_repo);
  if (!owner || !repo) return;
  const branch = space.github_branch || 'master';

  const handle = await phase2CrdtRepo.find(link.doc_key);
  await handle.whenReady();
  const doc = handle.doc();
  if (!doc) return;

  const buffer = Buffer.from(chapterToMarkdown(doc), 'utf8');
  const token = await getInstallationToken(space.github_installation_id);

  let remote = null;
  try {
    remote = await fetchFileMeta({ token, owner, repo, filePath: link.relative_path, branch });
  } catch (err) {
    console.error('[githubSync] failed to look up remote file before chapter push', link.relative_path, err);
    await logSync(space.id, 'push', 'error', `Failed to check GitHub before pushing ${link.relative_path}: ${err.message}`, link.relative_path);
    return;
  }

  // Same conflict guard as Phase 1's file push: don't clobber a GitHub-side edit we haven't pulled yet.
  if (remote && link.github_blob_sha && remote.sha !== link.github_blob_sha) {
    await logSync(
      space.id,
      'push',
      'warn',
      `Skipped push for ${link.relative_path}: GitHub has changes not yet pulled into Crowdly`,
      link.relative_path,
    );
    return;
  }

  try {
    const result = await putFileContent({
      token,
      owner,
      repo,
      filePath: link.relative_path,
      branch,
      buffer,
      sha: remote ? remote.sha : undefined,
      message: `Crowdly sync: update ${link.relative_path}`,
    });
    await pool.query('UPDATE github_content_links SET github_blob_sha = $1 WHERE id = $2', [result.contentSha, linkId]);
    await pool.query('UPDATE creative_spaces SET github_last_commit_sha = $1, last_synced_at = now() WHERE id = $2', [
      result.commitSha,
      space.id,
    ]);
    await logSync(space.id, 'push', 'info', `Pushed chapter update for ${link.relative_path} to GitHub`, link.relative_path);
  } catch (err) {
    console.error('[githubSync] chapter push failed for', link.relative_path, err);
    await logSync(space.id, 'push', 'error', `Failed to push chapter ${link.relative_path}: ${err.message}`, link.relative_path);
  }
}

/** Wires a live automerge-repo 'change' listener for one linked doc — fires on any change to that doc (ours or a live editor's), debounces, and skips echoing our own pulls back to GitHub via lastChangeWasFromGithub. Called both at startup (initGithubCrdtLinks, for every existing link) and immediately when a new link is created, so pushes work without a restart. */
async function attachContentLinkListener(link) {
  if (!phase2CrdtRepo) return;
  try {
    const handle = await phase2CrdtRepo.find(link.doc_key);
    await handle.whenReady();
    handle.on('change', ({ doc }) => {
      if (lastChangeWasFromGithub(doc)) return;
      const existing = contentLinkPushTimers.get(link.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        contentLinkPushTimers.delete(link.id);
        pushLinkedChapterToGithub(link.id).catch((err) => {
          console.error('[githubSync] chapter push failed for link', link.id, err);
        });
      }, PUSH_DEBOUNCE_MS);
      contentLinkPushTimers.set(link.id, timer);
    });
  } catch (err) {
    console.error('[githubSync] failed to attach change listener for link', link.id, err);
  }
}

/** Call once at server startup, right after crdtRepo is created (see server.js). Attaches a push listener for every existing chapter link. */
export async function initGithubCrdtLinks(crdtRepoInstance) {
  phase2CrdtRepo = crdtRepoInstance;
  try {
    const { rows } = await pool.query('SELECT * FROM github_content_links');
    for (const link of rows) {
      await attachContentLinkListener(link);
    }
    console.log(`[init] attached GitHub sync change listeners for ${rows.length} linked chapter(s)`);
  } catch (err) {
    console.error('[init] failed to attach GitHub content-link listeners:', err);
  }
}

/** Creates (or repoints) a chapter <-> markdown-path link and starts listening for pushes on it immediately. `docKey` must already exist (server.js's link route mints/reuses it the same way POST /crdt/docs/ensure does). */
export async function createGithubContentLink({ spaceId, relativePath, entityId, docKey, userId }) {
  const { rows } = await pool.query(
    `INSERT INTO github_content_links (space_id, relative_path, doc_type, entity_id, doc_key, created_by)
     VALUES ($1, $2, 'chapter', $3, $4, $5)
     ON CONFLICT (space_id, relative_path)
       DO UPDATE SET entity_id = EXCLUDED.entity_id, doc_key = EXCLUDED.doc_key, github_blob_sha = NULL
     RETURNING *`,
    [spaceId, relativePath, entityId, docKey, userId || null],
  );
  const link = rows[0];
  await attachContentLinkListener(link);
  return link;
}

export async function listGithubContentLinks(spaceId) {
  const { rows } = await pool.query(
    'SELECT * FROM github_content_links WHERE space_id = $1 ORDER BY created_at ASC',
    [spaceId],
  );
  return rows;
}

// --- Polling fallback ---------------------------------------------------

const POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 min — self-heals missed webhook deliveries; also the only trigger available for a local/dev backend GitHub can't reach.

export function startGithubPollingLoop() {
  setInterval(async () => {
    let rows;
    try {
      ({ rows } = await pool.query(
        'SELECT id FROM creative_spaces WHERE github_sync_enabled = true AND github_installation_id IS NOT NULL',
      ));
    } catch (err) {
      console.error('[githubSync] poll query failed:', err);
      return;
    }
    for (const row of rows) {
      try {
        await runSpaceSync(row.id);
      } catch {
        // Already logged (console + github_sync_log) inside runSpaceSync — one space's failure shouldn't stop the rest of the poll cycle.
      }
    }
  }, POLL_INTERVAL_MS);
  console.log(`[init] GitHub sync poll loop started (every ${Math.round(POLL_INTERVAL_MS / 60000)} min)`);
}
