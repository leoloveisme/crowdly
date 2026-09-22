-- Bring-your-own AI: users connect their own AI providers (their own API
-- keys, billed to their own accounts) and use them for machine-translation
-- drafts and text-to-speech narration. Work runs as background jobs.

-- === Connections ===
CREATE TABLE IF NOT EXISTS user_ai_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  label text,
  -- AES-256-GCM (backend/src/secrets.js); never returned to clients
  encrypted_api_key text NOT NULL,
  key_hint text,
  base_url text,
  -- capabilities this connection is used for: 'translate', 'tts'
  capabilities text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- per-capability model / voice overrides, e.g. {"translate": {"model": "..."}, "tts": {"model": "...", "voice": "..."}}
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ai_connections_provider_check') THEN
    ALTER TABLE user_ai_connections
      ADD CONSTRAINT user_ai_connections_provider_check
      CHECK (provider IN ('anthropic', 'openai', 'openai_compatible', 'elevenlabs'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_ai_connections_user_idx ON user_ai_connections (user_id);

-- === Background jobs ===
CREATE TABLE IF NOT EXISTS ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES user_ai_connections(id) ON DELETE SET NULL,
  kind text NOT NULL,
  story_title_id uuid REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES stories(chapter_id) ON DELETE CASCADE,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  error text,
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_kind_check') THEN
    ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_kind_check CHECK (kind IN ('translate_chapter', 'tts_chapter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_status_check') THEN
    ALTER TABLE ai_jobs
      ADD CONSTRAINT ai_jobs_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_jobs_queue_idx ON ai_jobs (status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS ai_jobs_story_idx ON ai_jobs (story_title_id, created_at DESC);

-- === "AI draft" marker on chapters ===
-- Set by a translation job; cleared automatically the first time a human
-- changes the chapter's text or title (see trigger below).
ALTER TABLE stories ADD COLUMN IF NOT EXISTS ai_draft boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION stories_clear_ai_draft() RETURNS trigger AS $$
BEGIN
  IF (NEW.chapter_title IS DISTINCT FROM OLD.chapter_title OR NEW.paragraphs IS DISTINCT FROM OLD.paragraphs)
     AND NEW.ai_draft IS NOT DISTINCT FROM OLD.ai_draft THEN
    NEW.ai_draft := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'stories_clear_ai_draft_trg') THEN
    CREATE TRIGGER stories_clear_ai_draft_trg
      BEFORE UPDATE ON stories
      FOR EACH ROW EXECUTE FUNCTION stories_clear_ai_draft();
  END IF;
END $$;
