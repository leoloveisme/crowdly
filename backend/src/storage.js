// Media file storage: S3-compatible object storage when configured, local
// disk (backend/uploads, served at /uploads) otherwise.
//
// Works with any S3-compatible service — Cloudflare R2, AWS S3, Backblaze B2,
// MinIO — configured by env vars (see backend/.env.example):
//
//   S3_BUCKET              bucket name (setting this turns object storage on)
//   S3_PUBLIC_BASE_URL     public URL of the bucket / CDN, e.g. https://media.crowdly.cloud
//   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
//   S3_REGION              e.g. auto (R2), us-east-1 (AWS)
//   S3_ENDPOINT            e.g. https://<account>.r2.cloudflarestorage.com (omit for AWS)
//   S3_FORCE_PATH_STYLE    true for MinIO / most self-hosted servers
//
// Object keys mirror the local layout ("media/<storyId>/<uuid>.mp3",
// "gallery/<storyId>/<uuid>.png"), so a file's key is the part of its local
// URL after "/uploads/" — which is what the migration script relies on.

import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

let client = null;

export function isObjectStorageConfigured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_PUBLIC_BASE_URL);
}

function s3() {
  if (!isObjectStorageConfigured()) throw new Error('Object storage is not configured');
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }
  return client;
}

const bucket = () => process.env.S3_BUCKET;
const publicBase = () => String(process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

export const publicUrlForKey = (key) => `${publicBase()}/${key}`;

/** A fresh object key: "<folder>/<storyId>/<uuid><ext>". */
export function newKey(folder, storyTitleId, ext) {
  return `${folder}/${storyTitleId}/${randomUUID()}${ext}`;
}

/** The storage key behind a stored file's URL, or null for anything else. */
export function keyForUrl(url) {
  if (!url) return null;
  if (url.startsWith('/uploads/')) return url.slice('/uploads/'.length);
  const base = publicBase();
  if (base && url.startsWith(`${base}/`)) return url.slice(base.length + 1);
  return null;
}

/**
 * Store a buffer (server-generated files: AI audio/images/video) and return
 * its public URL — bucket when configured, local disk otherwise.
 */
export async function storeBuffer(key, buffer, contentType) {
  if (isObjectStorageConfigured()) {
    await s3().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: contentType }),
    );
    return publicUrlForKey(key);
  }
  const filePath = path.join(LOCAL_UPLOADS_ROOT, key);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/${key}`;
}

/**
 * Hand a file multer already wrote to local disk over to object storage (when
 * configured): upload it, delete the local copy, return the public URL.
 * Without object storage the local file stays and its /uploads URL is returned.
 */
export async function adoptLocalFile(localPath, contentType) {
  const key = path.relative(LOCAL_UPLOADS_ROOT, localPath).split(path.sep).join('/');
  if (key.startsWith('..')) throw new Error('File is outside the uploads folder');
  if (!isObjectStorageConfigured()) return `/uploads/${key}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
      ContentLength: (await fs.promises.stat(localPath)).size,
    }),
  );
  await fs.promises.unlink(localPath).catch(() => {});
  return publicUrlForKey(key);
}

/** Delete a stored file by its URL (local or bucket). Best effort. */
export async function removeStoredFile(url) {
  const key = keyForUrl(url);
  if (!key || key.includes('..')) return;
  if (url.startsWith('/uploads/')) {
    await fs.promises.unlink(path.join(LOCAL_UPLOADS_ROOT, key)).catch(() => {});
    return;
  }
  if (isObjectStorageConfigured()) {
    await s3()
      .send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
      .catch((err) => console.error('[storage] delete failed:', key, err.message));
  }
}

// ---------------------------------------------------------------------------
// Direct browser → bucket uploads (large files)
// ---------------------------------------------------------------------------

/**
 * A short-lived presigned PUT URL for one object. The browser must send the
 * same Content-Type. Size can't be enforced by a presigned PUT, so the
 * "complete" step checks it with headObject() and deletes oversized objects.
 */
export async function presignUpload(key, contentType, expiresInSeconds = 900) {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
  return { url, method: 'PUT', headers: { 'Content-Type': contentType } };
}

/** { size, contentType } of an uploaded object, or null if it doesn't exist. */
export async function headObject(key) {
  try {
    const out = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: Number(out.ContentLength ?? 0), contentType: out.ContentType ?? '' };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
    throw err;
  }
}

export async function deleteObjectKey(key) {
  await s3()
    .send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
    .catch(() => {});
}

// Raw access for the migration script.
export async function putLocalFileToKey(localPath, key, contentType) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
      ContentLength: (await fs.promises.stat(localPath)).size,
    }),
  );
  return publicUrlForKey(key);
}
