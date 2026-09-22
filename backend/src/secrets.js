// Encryption at rest for user-supplied secrets (AI provider API keys).
//
// Same scheme as googleDriveApp.js's encryptToken(): AES-256-GCM with
// IV + authTag + ciphertext packed into one base64 string. The key comes from
// AI_KEY_ENCRYPTION_KEY — 32 random bytes, base64:
//
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// There is deliberately no fallback key: without the env var, storing keys is
// refused rather than silently weakened.

import crypto from 'crypto';

function getKey() {
  const raw = process.env.AI_KEY_ENCRYPTION_KEY;
  if (!raw) {
    const err = new Error('AI connections are not configured on this server (AI_KEY_ENCRYPTION_KEY is missing)');
    err.code = 'AI_KEY_ENCRYPTION_KEY_MISSING';
    throw err;
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('AI_KEY_ENCRYPTION_KEY must decode to exactly 32 bytes (base64) for AES-256-GCM');
  }
  return key;
}

export function isSecretStoreConfigured() {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptSecret(cipherText) {
  const key = getKey();
  const raw = Buffer.from(cipherText, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** "sk-…abcd" style hint so users can tell their keys apart without exposing them. */
export function secretHint(plainText) {
  const s = String(plainText).trim();
  return s.length <= 8 ? '••••' : `${s.slice(0, 3)}…${s.slice(-4)}`;
}
