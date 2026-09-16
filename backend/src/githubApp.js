// Low-level GitHub App client: mints installation access tokens (JWT signed
// with the App's private key, exchanged for a short-lived installation
// token, cached until near expiry) and wraps the handful of GitHub REST API
// calls the sync connector needs (tree listing, blob fetch, content write,
// webhook signature verification). No SDK dependency — same plain `fetch`
// approach scripts/lib/happybeingsSource.js already uses for the public,
// unauthenticated read-only path this supersedes for live sync.
//
// Config lives entirely in env vars (see backend/.env.example):
//   GITHUB_APP_ID              - numeric App id
//   GITHUB_APP_PRIVATE_KEY     - PEM private key (newlines may be escaped as \n)
//   GITHUB_WEBHOOK_SECRET      - shared secret GitHub signs webhook payloads with
//   GITHUB_APP_SLUG            - optional, used to build the "Connect GitHub" install URL

import crypto from 'crypto';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function isGithubAppConfigured() {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

function getPrivateKey() {
  return (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

/** Short-lived (10 min) App-level JWT used only to mint installation tokens below — never sent to a repo API directly. */
function signAppJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getPrivateKey();
  if (!appId || !privateKey) {
    throw new Error('GitHub App is not configured (GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY missing)');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: appId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  const encodedSignature = signature
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${signingInput}.${encodedSignature}`;
}

// installationId -> { token, expiresAt }. Module-scoped cache; fine for a
// single backend process, mirrors the in-memory-only pattern the desktop
// app's own sync flags already use for similarly short-lived state.
const installationTokenCache = new Map();

export async function getInstallationToken(installationId) {
  const key = String(installationId);
  const cached = installationTokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }

  const jwt = signAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${key}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to mint GitHub installation token (${res.status} ${res.statusText})`);
  }
  const data = await res.json();
  const token = data.token;
  const expiresAt = new Date(data.expires_at).getTime();
  installationTokenCache.set(key, { token, expiresAt });
  return token;
}

async function githubRequest(token, url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
}

export function parseRepoFullName(full) {
  const [owner, repo] = String(full || '').split('/');
  return { owner: owner || null, repo: repo || null };
}

/** Full recursive tree listing (one API call), each blob entry carrying its own content sha — the per-file loop guard/change-detection unit used throughout githubSync.js. */
export async function fetchRepoTree({ token, owner, repo, branch }) {
  const res = await githubRequest(
    token,
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!res.ok) {
    throw new Error(`GitHub tree fetch failed (${res.status} ${res.statusText}) for ${owner}/${repo}@${branch}`);
  }
  const data = await res.json();
  if (data.truncated) {
    throw new Error('GitHub tree response was truncated — repo has grown too large for a single recursive listing.');
  }
  return {
    sha: data.sha,
    paths: data.tree
      .filter((entry) => entry.type === 'blob')
      .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size })),
  };
}

/** Fetches a blob's raw bytes directly by sha (from a tree entry) — avoids a second path-based lookup. */
export async function fetchBlobContent({ token, owner, repo, sha }) {
  const res = await githubRequest(token, `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`);
  if (!res.ok) {
    throw new Error(`GitHub blob fetch failed (${res.status} ${res.statusText}) for sha ${sha}`);
  }
  const data = await res.json();
  return Buffer.from(data.content, data.encoding || 'base64');
}

/** Contents API lookup by path — used before a push, to get the file's current blob sha (required by the write call below) and detect an unseen concurrent GitHub-side change. Returns null on 404 (file doesn't exist yet on GitHub). */
export async function fetchFileMeta({ token, owner, repo, filePath, branch }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?ref=${encodeURIComponent(branch)}`;
  const res = await githubRequest(token, url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub content lookup failed (${res.status} ${res.statusText}) for ${filePath}`);
  }
  const data = await res.json();
  return { sha: data.sha };
}

/** Creates or updates a file via the Contents API (one commit per call). `sha` is the file's current blob sha for an update, or omitted to create a new file. */
export async function putFileContent({ token, owner, repo, filePath, branch, buffer, sha, message }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const body = {
    message: message || `Crowdly sync: update ${filePath}`,
    content: buffer.toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await githubRequest(token, url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`GitHub content update failed (${res.status} ${res.statusText}) for ${filePath}: ${errBody}`);
  }
  const data = await res.json();
  return { commitSha: data.commit?.sha || null, contentSha: data.content?.sha || null };
}

/** Repos an installation has access to (one page, up to 100) — used to let the owner pick which repo to connect instead of auto-selecting the first one. */
export async function fetchInstallationRepos({ token, page = 1, perPage = 100 }) {
  const res = await githubRequest(
    token,
    `https://api.github.com/installation/repositories?per_page=${perPage}&page=${page}`,
  );
  if (!res.ok) {
    throw new Error(`GitHub installation repo list failed (${res.status} ${res.statusText})`);
  }
  const data = await res.json();
  return {
    repositories: (data.repositories || []).map((r) => ({
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
    })),
    totalCount: data.total_count ?? data.repositories?.length ?? 0,
  };
}

/** Constant-time HMAC-SHA256 verification of GitHub's X-Hub-Signature-256 header against the raw request body. */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(String(signatureHeader));
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

/** Install URL for the "Connect GitHub" UI action. `state` round-trips through GitHub back to /api/github/install/callback so it can tell which Space/user initiated the install. */
export function buildInstallUrl(state) {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return null;
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
}
