// AI provider adapters for bring-your-own-AI. Each user's own API key is
// passed in per call — nothing here is platform-paid.
//
// Capabilities:
//   translate — text AI: translateChapter() (paragraph-for-paragraph), and
//               storyboardComic() (comic scripts)
//   tts       — synthesizeSpeech(): text → audio buffer
//   image     — generateImage(): prompt → image buffer (comic frames)
//   video     — startVideo() / checkVideo() / downloadVideo(): async clip generation
//
// Anthropic goes through the official @anthropic-ai/sdk; the others are
// plain REST calls. Models / voices are configurable per connection
// (connection.settings); the defaults below are only starting points.

import Anthropic from '@anthropic-ai/sdk';
import dns from 'dns/promises';
import net from 'net';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    capabilities: ['translate'],
    defaults: { translate: { model: 'claude-opus-5' } },
  },
  openai: {
    label: 'OpenAI',
    capabilities: ['translate', 'tts', 'image', 'video'],
    defaults: {
      translate: { model: 'gpt-4.1' },
      tts: { model: 'gpt-4o-mini-tts', voice: 'alloy' },
      image: { model: 'gpt-image-1' },
      video: { model: 'sora-2' },
    },
  },
  openai_compatible: {
    label: 'OpenAI-compatible server',
    capabilities: ['translate'],
    defaults: { translate: { model: '' } },
    needsBaseUrl: true,
  },
  elevenlabs: {
    label: 'ElevenLabs',
    capabilities: ['tts'],
    defaults: { tts: { model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM' } },
  },
};

/** An error whose message is safe to show the user (never includes the key). */
export class ProviderError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

export function effectiveSettings(connection, capability) {
  const defaults = PROVIDERS[connection.provider]?.defaults?.[capability] ?? {};
  const own = connection.settings?.[capability] ?? {};
  const merged = { ...defaults };
  for (const [k, v] of Object.entries(own)) if (v) merged[k] = v;
  return merged;
}

// OpenAI's API root. AI_OPENAI_BASE_URL is a server-operator setting (e.g. a
// corporate proxy, or a local mock for testing) — never user-supplied.
const OPENAI_ROOT = () => (process.env.AI_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

const openAiBase = (connection) =>
  (connection.provider === 'openai_compatible' ? connection.base_url : OPENAI_ROOT()).replace(/\/+$/, '');

// --- SSRF guard for user-supplied server URLs (OpenAI-compatible) ---------
// A user-chosen URL must not let the Crowdly server reach its own machine or
// private network (localhost services, cloud metadata, LAN). Set
// AI_ALLOW_PRIVATE_BASE_URLS=true only for local development against a
// self-hosted model on localhost.

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

export async function assertPublicBaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProviderError('The server URL is not valid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ProviderError('The server URL must use http(s)');
  if (process.env.AI_ALLOW_PRIVATE_BASE_URLS === 'true') return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw new ProviderError(`Could not resolve ${host}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new ProviderError('The server URL must be a public address');
  }
}

/**
 * fetch() for provider calls. Network failures become retryable, user-safe
 * errors; user-supplied servers are checked and may not redirect.
 */
async function providerFetch(connection, url, init) {
  const label = PROVIDERS[connection.provider]?.label ?? 'AI provider';
  const guarded = connection.provider === 'openai_compatible';
  if (guarded) await assertPublicBaseUrl(url);
  try {
    return await fetch(url, guarded ? { ...init, redirect: 'error' } : init);
  } catch {
    throw new ProviderError(`${label}: could not reach the server`, { retryable: true });
  }
}

async function httpError(res, providerLabel) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.detail?.message || body?.message || '';
  } catch {
    // non-JSON error body
  }
  if (res.status === 401 || res.status === 403) {
    return new ProviderError(`${providerLabel}: the API key was rejected${detail ? ` (${detail})` : ''}`);
  }
  if (res.status === 429) return new ProviderError(`${providerLabel}: rate limit or quota reached`, { retryable: true });
  return new ProviderError(`${providerLabel}: request failed (${res.status})${detail ? ` — ${detail}` : ''}`, {
    retryable: res.status >= 500,
  });
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testConnection(connection, apiKey) {
  switch (connection.provider) {
    case 'anthropic': {
      const client = new Anthropic({ apiKey, maxRetries: 0 });
      try {
        await client.models.list({ limit: 1 });
      } catch (err) {
        throw anthropicError(err);
      }
      return;
    }
    case 'openai':
    case 'openai_compatible': {
      const res = await providerFetch(connection, `${openAiBase(connection)}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw await httpError(res, PROVIDERS[connection.provider].label);
      return;
    }
    case 'elevenlabs': {
      const res = await providerFetch(connection, 'https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
      if (!res.ok) throw await httpError(res, 'ElevenLabs');
      return;
    }
    default:
      throw new ProviderError('Unknown provider');
  }
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'paragraphs'],
  additionalProperties: false,
};

function translationInstructions(from, to, count) {
  return [
    `You are an experienced literary translator. Translate a chapter of a story from ${from} into ${to}.`,
    "Keep the author's meaning, tone, voice and style; keep names consistent; translate idioms naturally rather than word for word.",
    `The chapter is given as JSON with a title and ${count} paragraphs. Return the translated title and exactly ${count} paragraphs — one translated paragraph for each input paragraph, in the same order — so the translation stays aligned with the original. An empty input paragraph stays empty.`,
    'Return only the translation, with no notes or commentary.',
  ].join('\n');
}

function checkShape(result, count, providerLabel) {
  if (!result || typeof result.title !== 'string' || !Array.isArray(result.paragraphs)) {
    throw new ProviderError(`${providerLabel} returned an unexpected response`, { retryable: true });
  }
  if (result.paragraphs.length !== count) {
    throw new ProviderError(
      `${providerLabel} returned ${result.paragraphs.length} paragraphs instead of ${count}`,
      { retryable: true },
    );
  }
  return { title: result.title, paragraphs: result.paragraphs.map((p) => String(p ?? '')) };
}

function anthropicError(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('Anthropic: the API key was rejected');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError('Anthropic: rate limit reached — try again later', { retryable: true });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError(`Anthropic: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`Anthropic: request failed (${err.status ?? 'network'})`, { retryable: true });
  }
  return err;
}

/**
 * One request to a text AI that must answer with JSON matching `schema`.
 * Anthropic: official SDK, structured outputs (json_schema), server-side
 * fallbacks, streaming for long outputs. OpenAI / compatible: JSON mode with
 * the schema described in the instructions.
 */
async function anthropicJson(apiKey, model, system, userContent, schema) {
  const client = new Anthropic({ apiKey });
  let message;
  try {
    message = await client.beta.messages
      .stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: userContent }],
      })
      .finalMessage();
  } catch (err) {
    throw anthropicError(err);
  }
  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category;
    throw new ProviderError(`Claude declined this request${category ? ` (${category})` : ''}`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ProviderError('The text is too long to process in one pass');
  }
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError('Anthropic returned an unreadable response', { retryable: true });
  }
}

async function openAiJson(connection, apiKey, model, system, userContent, schemaHint) {
  const label = PROVIDERS[connection.provider].label;
  if (!model) throw new ProviderError(`${label}: set a model for text in your AI connection settings`);
  const res = await providerFetch(connection, `${openAiBase(connection)}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\nRespond with a JSON object: ${schemaHint}` },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) throw await httpError(res, label);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new ProviderError(`${label} returned an unreadable response`, { retryable: true });
  }
}

/** Structured JSON from whichever text AI the connection is. */
async function textJson(connection, apiKey, { system, user, schema, schemaHint }) {
  const { model } = effectiveSettings(connection, 'translate');
  return connection.provider === 'anthropic'
    ? anthropicJson(apiKey, model, system, user, schema)
    : openAiJson(connection, apiKey, model, system, user, schemaHint);
}

/** Paragraph batches small enough for one request each. */
function batchParagraphs(paragraphs, maxChars = 24000) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const p of paragraphs) {
    if (current.length > 0 && size + p.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += p.length;
  }
  if (current.length > 0 || batches.length === 0) batches.push(current);
  return batches;
}

/**
 * Translate a chapter: { title, paragraphs } → same shape, same paragraph
 * count. `from` / `to` are language names (e.g. "English", "Russian").
 */
export async function translateChapter(connection, apiKey, { title, paragraphs }, from, to) {
  const label = PROVIDERS[connection.provider].label;
  const run = async (input) =>
    checkShape(
      await textJson(connection, apiKey, {
        system: translationInstructions(from, to, input.paragraphs.length),
        user: JSON.stringify(input),
        schema: TRANSLATION_SCHEMA,
        schemaHint: '{"title": string, "paragraphs": string[]}',
      }),
      input.paragraphs.length,
      label,
    );

  const out = { title: '', paragraphs: [] };
  const batches = batchParagraphs(paragraphs);
  for (const [i, batch] of batches.entries()) {
    const result = await run({ title: i === 0 ? title : '', paragraphs: batch });
    if (i === 0) out.title = result.title;
    out.paragraphs.push(...result.paragraphs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text-to-speech
// ---------------------------------------------------------------------------

/** Text chunks under the providers' per-request limits, split on paragraph boundaries. */
function speechChunks(paragraphs, maxChars = 3500) {
  const chunks = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const p of paragraphs.map((x) => x.trim()).filter(Boolean)) {
    if (p.length > maxChars) {
      push();
      // Very long paragraph: split on sentence ends
      let rest = p;
      while (rest.length > maxChars) {
        const cut = Math.max(rest.lastIndexOf('. ', maxChars), rest.lastIndexOf(' ', maxChars));
        const at = cut > maxChars / 2 ? cut + 1 : maxChars;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      current = rest;
      continue;
    }
    if (current.length + p.length + 2 > maxChars) push();
    current += (current ? '\n\n' : '') + p;
  }
  push();
  return chunks;
}

async function speakOpenAi(connection, apiKey, settings, text) {
  const res = await providerFetch(connection, `${OPENAI_ROOT()}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model, voice: settings.voice, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw await httpError(res, 'OpenAI');
  return Buffer.from(await res.arrayBuffer());
}

async function speakElevenLabs(connection, apiKey, settings, text) {
  const res = await providerFetch(
    connection,
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.voice)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: settings.model }),
    },
  );
  if (!res.ok) throw await httpError(res, 'ElevenLabs');
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Narrate paragraphs → one MP3 buffer. Long chapters are synthesised in
 * chunks and the MP3 streams concatenated (valid for MP3 frame streams).
 */
export async function synthesizeSpeech(connection, apiKey, paragraphs, overrides = {}) {
  const settings = { ...effectiveSettings(connection, 'tts'), ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v)) };
  const speak =
    connection.provider === 'openai'
      ? (t) => speakOpenAi(connection, apiKey, settings, t)
      : connection.provider === 'elevenlabs'
      ? (t) => speakElevenLabs(connection, apiKey, settings, t)
      : null;
  if (!speak) throw new ProviderError('This connection cannot generate speech');
  const chunks = speechChunks(paragraphs);
  if (chunks.length === 0) throw new ProviderError('This chapter has no text to narrate');
  const parts = [];
  for (const chunk of chunks) parts.push(await speak(chunk));
  return { buffer: Buffer.concat(parts), mime: 'audio/mpeg', ext: '.mp3', model: settings.model, voice: settings.voice };
}

// ---------------------------------------------------------------------------
// Comics: storyboard (text AI) + frames (image AI)
// ---------------------------------------------------------------------------

const STORYBOARD_SCHEMA = {
  type: 'object',
  properties: {
    style_guide: { type: 'string' },
    frames: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          image_prompt: { type: 'string' },
          caption: { type: 'string' },
          bubbles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                style: { type: 'string', enum: ['bubble', 'box'] },
              },
              required: ['text', 'x', 'y', 'style'],
              additionalProperties: false,
            },
          },
          anchor_start: { type: 'integer' },
          anchor_end: { type: 'integer' },
        },
        required: ['image_prompt', 'caption', 'bubbles', 'anchor_start', 'anchor_end'],
        additionalProperties: false,
      },
    },
  },
  required: ['style_guide', 'frames'],
  additionalProperties: false,
};

/**
 * Turn a passage into a comic storyboard. `paragraphs` are
 * [{ index, text }] with the chapter's own paragraph indexes, which the
 * frames' anchors refer to. Captions and bubbles are in `language`; they are
 * rendered as text over the images, never drawn into them.
 */
export async function storyboardComic(connection, apiKey, { paragraphs, frameCount, style, language }) {
  const first = paragraphs[0]?.index ?? 0;
  const last = paragraphs[paragraphs.length - 1]?.index ?? first;
  const system = [
    `You are a comic artist's storyboard writer. Turn the story passage into exactly ${frameCount} comic frame(s), in reading order.`,
    'First write a short style_guide: the visual style and a consistent description of each recurring character and setting, so separately drawn frames look like one comic.',
    'For each frame: image_prompt describes only what is drawn (scene, characters, composition, mood) and must NOT ask for any text, letters, captions or speech bubbles in the image;',
    `caption is a short narration line; bubbles are what characters say or think (0-3 per frame), with x/y as the bubble centre in percent of the image (0-100), placed near the speaker and away from faces, style "bubble" for speech or "box" for narration;`,
    `anchor_start / anchor_end are the paragraph indexes (between ${first} and ${last}) the frame illustrates.`,
    `Write captions and bubbles in ${language}. Stay faithful to the passage; do not invent major events.`,
    style ? `Requested visual style: ${style}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const user = JSON.stringify({ paragraphs });
  const result = await textJson(connection, apiKey, {
    system,
    user,
    schema: STORYBOARD_SCHEMA,
    schemaHint:
      '{"style_guide": string, "frames": [{"image_prompt": string, "caption": string, "bubbles": [{"text": string, "x": number, "y": number, "style": "bubble"|"box"}], "anchor_start": integer, "anchor_end": integer}]}',
  });
  const label = PROVIDERS[connection.provider].label;
  if (!result || !Array.isArray(result.frames) || result.frames.length === 0) {
    throw new ProviderError(`${label} returned an unexpected storyboard`, { retryable: true });
  }
  const clampIndex = (n) => Math.min(last, Math.max(first, Number.isInteger(n) ? n : first));
  return {
    style_guide: String(result.style_guide ?? ''),
    frames: result.frames.slice(0, frameCount).map((f) => {
      const start = clampIndex(f.anchor_start);
      return {
        image_prompt: String(f.image_prompt ?? ''),
        caption: String(f.caption ?? ''),
        bubbles: (Array.isArray(f.bubbles) ? f.bubbles : []).slice(0, 4).map((b) => ({
          text: String(b.text ?? '').slice(0, 500),
          x: Math.min(95, Math.max(5, Number(b.x) || 50)),
          y: Math.min(95, Math.max(5, Number(b.y) || 15)),
          style: b.style === 'box' ? 'box' : 'bubble',
        })),
        anchor_start: start,
        anchor_end: Math.max(start, clampIndex(f.anchor_end)),
      };
    }),
  };
}

/** One image from a prompt → PNG buffer. */
export async function generateImage(connection, apiKey, prompt) {
  if (connection.provider !== 'openai') throw new ProviderError('This connection cannot generate images');
  const { model } = effectiveSettings(connection, 'image');
  const res = await providerFetch(connection, `${OPENAI_ROOT()}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
      // gpt-image models always return base64; DALL·E models need asking.
      ...(String(model).startsWith('dall-e') ? { response_format: 'b64_json' } : {}),
    }),
  });
  if (!res.ok) throw await httpError(res, 'OpenAI');
  const body = await res.json();
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError('OpenAI returned no image', { retryable: true });
  return { buffer: Buffer.from(b64, 'base64'), ext: '.png', mime: 'image/png', model };
}

// ---------------------------------------------------------------------------
// Video (experimental): submit, then poll
// ---------------------------------------------------------------------------

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export async function startVideo(connection, apiKey, { prompt, seconds }) {
  if (connection.provider !== 'openai') throw new ProviderError('This connection cannot generate video');
  const { model } = effectiveSettings(connection, 'video');
  const res = await providerFetch(connection, `${OPENAI_ROOT()}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, seconds: String(seconds), size: '1280x720' }),
  });
  if (!res.ok) throw await httpError(res, 'OpenAI');
  const body = await res.json();
  if (!body?.id) throw new ProviderError('OpenAI did not accept the video request', { retryable: true });
  return { providerJobId: body.id, model };
}

/** → { state: 'pending' | 'done' | 'failed', progress?, error? } */
export async function checkVideo(connection, apiKey, providerJobId) {
  const res = await providerFetch(connection, `${OPENAI_ROOT()}/videos/${encodeURIComponent(providerJobId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw await httpError(res, 'OpenAI');
  const body = await res.json();
  if (body.status === 'completed') return { state: 'done' };
  if (body.status === 'failed' || body.status === 'cancelled') {
    return { state: 'failed', error: body?.error?.message || 'The video could not be generated' };
  }
  return { state: 'pending', progress: typeof body.progress === 'number' ? body.progress : null };
}

export async function downloadVideo(connection, apiKey, providerJobId) {
  const res = await providerFetch(
    connection,
    `${OPENAI_ROOT()}/videos/${encodeURIComponent(providerJobId)}/content`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) throw await httpError(res, 'OpenAI');
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES) throw new ProviderError('The generated video is too large to store');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_VIDEO_BYTES) throw new ProviderError('The generated video is too large to store');
  return { buffer, ext: '.mp4', mime: res.headers.get('content-type') || 'video/mp4' };
}
