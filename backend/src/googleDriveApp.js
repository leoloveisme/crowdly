// Low-level Google Drive OAuth + API client: builds the consent URL,
// exchanges/refreshes OAuth tokens, and wraps the handful of Drive REST
// calls the sync connector needs (folder listing, change polling, file
// content read/write, push-notification channel registration). No SDK
// dependency — same plain `fetch` approach githubApp.js already uses for
// GitHub. This module never touches the database; googleDriveSync.js owns
// persistence (encrypted tokens, per-space/account state) and calls back
// into the functions here.
//
// Config lives entirely in env vars (see backend/.env.example):
//   GOOGLE_OAUTH_CLIENT_ID      - OAuth 2.0 Web application client id
//   GOOGLE_OAUTH_CLIENT_SECRET  - OAuth 2.0 client secret
//   GOOGLE_OAUTH_REDIRECT_URI   - optional override; defaults to
//                                 <BACKEND_BASE_URL>/api/google-drive/oauth/callback
//   GOOGLE_TOKEN_ENCRYPTION_KEY - 32 random bytes, base64 — encrypts stored
//                                 refresh tokens at rest (AES-256-GCM)
//   BACKEND_BASE_URL            - public backend URL; also the base for the
//                                 Drive push-notification channel address

import crypto from 'crypto';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
}

function getRedirectUri() {
  const backendBase = process.env.BACKEND_BASE_URL || 'http://localhost:4000';
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${backendBase}/api/google-drive/oauth/callback`;
}

function getEncryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is not configured');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64) for AES-256-GCM');
  }
  return key;
}

/** AES-256-GCM, IV+authTag+ciphertext packed into one base64 string — refresh tokens are long-lived and must never sit in the DB in plaintext (unlike GitHub's short-lived, memory-only cached installation tokens). */
export function encryptToken(plainText) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptToken(cipherText) {
  const key = getEncryptionKey();
  const raw = Buffer.from(cipherText, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** Consent URL for the "Connect Google Drive" UI action. `state` round-trips through Google back to /api/google-drive/oauth/callback so it can tell which Space/user initiated the connect. Broad `drive` scope (not the narrower `drive.file`) is required because folder selection is a plain dropdown, not the Google Picker widget — see plan notes. */
export function buildAuthUrl(state) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: DRIVE_SCOPE,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status} ${res.statusText}): ${body}`);
  }
  return res.json(); // { access_token, refresh_token, expires_in, scope, token_type }
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google token refresh failed (${res.status} ${res.statusText}): ${body}`);
  }
  return res.json(); // { access_token, expires_in, scope, token_type } — Google usually doesn't rotate the refresh token.
}

export async function fetchUserEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.email || null;
}

async function driveRequest(token, url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

/** Folders visible to this account, for the "pick a folder" dropdown (one page, up to 100 — same Phase‑1 limit as GitHub's repo picker). */
export async function listFolders({ token, pageSize = 100 }) {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id,name)',
    pageSize: String(pageSize),
  });
  const res = await driveRequest(token, `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  if (!res.ok) throw new Error(`Google Drive folder list failed (${res.status} ${res.statusText})`);
  const data = await res.json();
  return (data.files || []).map((f) => ({ id: f.id, name: f.name }));
}

/** Direct (non-recursive) children of a folder that aren't themselves folders — Phase‑1 sync is flat, matching the "pick one folder" UX; subfolder recursion is a known follow-up, same spirit as GitHub Phase 1 not handling giant repos. */
export async function listFilesInFolder({ token, folderId, pageSize = 1000 }) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id,name,md5Checksum,mimeType)',
    pageSize: String(pageSize),
  });
  const res = await driveRequest(token, `https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  if (!res.ok) throw new Error(`Google Drive file list failed (${res.status} ${res.statusText})`);
  const data = await res.json();
  return data.files || [];
}

export async function getStartPageToken({ token }) {
  const res = await driveRequest(token, 'https://www.googleapis.com/drive/v3/changes/startPageToken');
  if (!res.ok) throw new Error(`Google Drive startPageToken failed (${res.status} ${res.statusText})`);
  const data = await res.json();
  return data.startPageToken;
}

/** Account-wide change page (Drive has no "watch this folder" mode — see plan notes); callers filter by `file.parents`. */
export async function listChangesSince({ token, pageToken }) {
  const params = new URLSearchParams({
    pageToken,
    spaces: 'drive',
    fields: 'newStartPageToken,nextPageToken,changes(fileId,removed,file(id,name,parents,modifiedTime,md5Checksum,mimeType,trashed))',
    pageSize: '100',
  });
  const res = await driveRequest(token, `https://www.googleapis.com/drive/v3/changes?${params.toString()}`);
  if (!res.ok) throw new Error(`Google Drive changes list failed (${res.status} ${res.statusText})`);
  return res.json();
}

/** Current metadata for one file — used before a push, to detect an unseen concurrent Drive-side change (mirrors githubApp.js's fetchFileMeta). Returns null on 404. */
export async function getFileMeta({ token, fileId }) {
  const params = new URLSearchParams({ fields: 'id,name,parents,modifiedTime,md5Checksum,mimeType,trashed' });
  const res = await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Drive file meta fetch failed (${res.status} ${res.statusText})`);
  return res.json();
}

export async function getFileContent({ token, fileId }) {
  const res = await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(`Google Drive file download failed (${res.status} ${res.statusText}) for ${fileId}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Creates (no fileId) or updates (fileId given) a file's content. Create uses a multipart upload to set name+parent in one call; update is a plain media upload (Drive keeps the existing name/parent). */
export async function putFileContent({ token, fileId, folderId, name, buffer, mimeType }) {
  const contentType = mimeType || 'application/octet-stream';

  if (fileId) {
    const res = await driveRequest(
      token,
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,md5Checksum`,
      { method: 'PATCH', headers: { 'Content-Type': contentType }, body: buffer },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google Drive file update failed (${res.status} ${res.statusText}): ${body}`);
    }
    const data = await res.json();
    return { fileId: data.id, md5Checksum: data.md5Checksum || null };
  }

  const boundary = `crowdly-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: folderId ? [folderId] : undefined });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await driveRequest(
    token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Google Drive file create failed (${res.status} ${res.statusText}): ${errBody}`);
  }
  const data = await res.json();
  return { fileId: data.id, md5Checksum: data.md5Checksum || null };
}

/** Registers an account-wide push-notification channel (expires in ~24h max, must be renewed — see googleDriveSync.js's renewal sweep). */
export async function watchChanges({ token, pageToken, channelId, address, expirationMs }) {
  const res = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/changes/watch?pageToken=${encodeURIComponent(pageToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channelId, type: 'web_hook', address, expiration: String(expirationMs) }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Drive watch registration failed (${res.status} ${res.statusText}): ${body}`);
  }
  const data = await res.json();
  return { resourceId: data.resourceId, expiration: data.expiration ? Number(data.expiration) : null };
}

export async function stopChannel({ token, channelId, resourceId }) {
  const res = await driveRequest(token, 'https://www.googleapis.com/drive/v3/channels/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    console.error(`[googleDriveApp] channel stop failed (${res.status} ${res.statusText}): ${body}`);
  }
}
