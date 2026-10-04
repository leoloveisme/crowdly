-- Public /support page: support requests ("Ask for help") and bug reports
-- ("Report a bug") share one table, told apart by `kind`. Submitted from the
-- web (src/modules/support/) or the desktop app's Help → Report a bug…;
-- triaged on the staff Support dashboard. Router: backend/src/support.js.
--
-- Bug-specific fields (area, expected/actual, severity, frequency, technical
-- details, opt-in console errors) live in `details` so new fields don't need
-- a migration each.

CREATE TABLE IF NOT EXISTS support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'request',
  user_id uuid REFERENCES local_users(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  subject text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  duplicate_of uuid REFERENCES support_requests(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'web',
  handled_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_requests_kind_check') THEN
    ALTER TABLE support_requests ADD CONSTRAINT support_requests_kind_check
      CHECK (kind IN ('request', 'bug'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_requests_category_check') THEN
    ALTER TABLE support_requests ADD CONSTRAINT support_requests_category_check
      CHECK (category IN ('account', 'stories', 'desktop_app', 'spaces_sync', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_requests_status_check') THEN
    ALTER TABLE support_requests ADD CONSTRAINT support_requests_status_check
      CHECK (status IN ('new', 'triaged', 'confirmed', 'in_progress', 'fixed', 'released',
                        'resolved', 'wont_fix', 'duplicate', 'closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_requests_source_check') THEN
    ALTER TABLE support_requests ADD CONSTRAINT support_requests_source_check
      CHECK (source IN ('web', 'desktop'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS support_requests_kind_status_idx
  ON support_requests (kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_user_idx
  ON support_requests (user_id, created_at DESC);

-- Screenshots attached to a bug report. Stored on disk under
-- backend/private-uploads/support/<request_id>/ — deliberately NOT under the
-- publicly served /uploads mount; streamed only to staff and the reporter.
CREATE TABLE IF NOT EXISTS support_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  filename text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  mime text NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_request_attachments_request_idx
  ON support_request_attachments (request_id);
