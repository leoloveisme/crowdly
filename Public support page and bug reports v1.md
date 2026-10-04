# Public /support page: help hub, support requests, bug reports

## Context
The footer's **Support** link points to `#`. `/support` already exists (`src/pages/Support.tsx`), but it's a staff-only "Support Dashboard": non-supporters are redirected to `/`, and its "Support Enquiries" tab is a placeholder.

Agreed scope:
- **One role-aware page.** Everyone gets the help hub: quick links, an FAQ, a **support request** form and a **"Report a bug"** form. Supporters/admins also get the dashboard, now backed by real data.
- **Bugs:** anyone can report one (captcha only when anonymous). Bugs go in the same table as support requests (`kind` column). Reports are private to staff and the reporter.
- **Bug v1 includes:** screenshot uploads, notifications when the status changes, opt-in console errors, and a desktop **Help → Report a bug…** menu item.

Delivered in three phases (A → B → C). Each phase can ship on its own.

---

## Phase A: role-aware /support with support requests

### A1. Migration `backend/migrations/0022_support_requests.sql` (idempotent, styled like `0021_collaboration_requests.sql`)
**Table `support_requests`:**
- `id uuid PK DEFAULT gen_random_uuid()`
- `kind text NOT NULL DEFAULT 'request'`: `'request' | 'bug'`
- `user_id uuid REFERENCES local_users(id) ON DELETE SET NULL`: null means anonymous
- `name text NOT NULL DEFAULT ''`, `email text NOT NULL`
- `category text NOT NULL DEFAULT 'other'`: `account | stories | desktop_app | spaces_sync | other`
- `subject text NOT NULL`, `message text NOT NULL`
- `details jsonb NOT NULL DEFAULT '{}'`: bug-specific fields (Phase B)
- `status text NOT NULL DEFAULT 'new'`
- `duplicate_of uuid REFERENCES support_requests(id) ON DELETE SET NULL`
- `source text NOT NULL DEFAULT 'web'`: `'web' | 'desktop'`
- `handled_by uuid REFERENCES local_users(id) ON DELETE SET NULL`
- `created_at`, `updated_at timestamptz NOT NULL DEFAULT now()`

**CHECK constraints** (in `DO $$ … pg_constraint … $$` guards):
- `kind`
- `status IN ('new','triaged','confirmed','in_progress','fixed','released','resolved','wont_fix','duplicate','closed')`. Requests use new / in_progress / resolved / closed. Bugs use the whole lifecycle.

**Indexes:** `(kind, status, created_at DESC)` and `(user_id, created_at DESC)`.

### A2. Backend router `backend/src/support.js`
Mounted with `app.use('/api', supportRouter)` in `server.js` next to the feedback router (~line 165).

**Shared helpers:**
- `verifyCaptcha`, exported from `backend/src/feedback.js` (no copy).
- Optional session user via `getSessionUser(req.cookies?.[SESSION_COOKIE_NAME])` (`sessions.js`).
- `isSupportStaff(userId)`: `user_roles` with role in `('platform_supporter','platform_admin')`, the same pattern as `isPlatformAdminOrEditor` in `server.js`.
- A small in-memory rate limit: 5 submissions per 10 minutes per IP or user.

**Endpoints:**
- `POST /api/support-requests` (public)
  - Validation: field checks like `feedback.js`, with caps (subject ≤ 200, message ≤ 5000).
  - Captcha is **required only when there's no session user**.
  - Inserts the row. If `isMailerConfigured()`, sends a non-fatal `sendSupportRequestEmail` (new, in `email.js`, modelled on `sendFeedbackEmail`) to `SUPPORT_TO_EMAIL || FEEDBACK_TO_EMAIL`.
  - Returns `{ ok, id }`.
- `GET /api/support-requests/mine` (requireAuth): the reporter's own items.
- `GET /api/support-requests?kind=&status=&category=&severity=` (staff only)
- `PATCH /api/support-requests/:id` (staff only): `{ status, duplicate_of? }`. Sets `updated_at` and `handled_by`.

**Notifications** (both on status change):
- Signed-in reporter: `createNotification(user_id, 'support_request_status', { id, kind, subject, status })`.
- Anonymous reporter: new `sendSupportStatusEmail` (non-fatal).

### A3. Frontend
**`src/pages/Support.tsx`** becomes the shell. It drops the redirect and uses the gradient/header/footer style of `Contact.tsx`.
- **Staff** (`hasRole("platform_supporter") || hasRole("platform_admin")`) get top-level Tabs: **Support dashboard** (default) | **Help & support**.
- **Others** see only Help & support.
- `?type=bug` opens the bug form directly; `?type=request` opens the request form.

**`src/modules/support/SupportHelpCenter.tsx`:**
1. Hero: "How can we help?"
2. Quick-link cards: Contact us, Send feedback, Suggest a feature, Apps & software, **Report a bug**.
3. FAQ in the shadcn `Accordion` (`src/components/ui/accordion.tsx`), driven by a const array like `AboutUs.tsx`'s `SECTIONS`. About 7 Q&As: account/alpha access, starting a story, branches & versions, desktop Discovery vs Creation, Spaces sync (GitHub / Google Drive), translating the UI, privacy & account deletion.
4. A switcher between "Ask for help" and "Report a bug" forms.
5. **"My requests & reports"** (signed-in users only): a list from `/mine` with status badges.

**`src/modules/support/SupportRequestForm.tsx`:**
- Name, email (prefilled), category, subject, message.
- Captcha only when logged out. The flow (`/api/captcha`, DOMPurify-sanitized SVG, refresh, toasts, thank-you state) follows `src/pages/Feedback.tsx`. That captcha block is extracted into a shared `src/components/CaptchaField.tsx`, used by both new forms. Feedback.tsx is left as it is.

**`src/modules/support/SupportDashboard.tsx`:**
- The existing tabs move here, keeping their `support-*` IDs.
- **Enquiries** is wired to `GET ?kind=request`, using React Query, with a status filter and per-row status Select → PATCH → invalidate.

**Elsewhere:**
- `CrowdlyHeader.tsx`: render the `support_request_status` notification ("Your bug report "…" is now Fixed"), linking to `/support`. Follows the existing `collaboration_request_decided` branch (~line 66).
- `CrowdlyFooter.tsx`: `footer-support` becomes `<Link to="/support">`.

---

## Phase B: "Report a bug"

### B1. `src/modules/support/BugReportForm.tsx`
**Fields the user fills in:**
- title (= `subject`)
- **area**: Web platform / Desktop app / Web editor / Other
- **steps to reproduce** (= `message`)
- **expected** and **actual**
- **severity**: Blocks me / Annoying / Cosmetic
- **frequency**: Always / Sometimes / Once
- **screenshots**: up to 3 images (PNG/JPEG/WEBP/GIF, ≤ 10 MB each) with thumbnail previews
- **"Include recent console errors"** checkbox, unchecked by default, with the captured lines shown as a preview so the user sees exactly what gets sent
- email (prefilled; required when anonymous)
- captcha when logged out

**Captured automatically** (shown in a collapsible "Technical details" block before sending):
- page URL: from `?from=`, otherwise `document.referrer`
- user agent, viewport, UI language, theme, timezone, timestamp
- build version: `import.meta.env.VITE_APP_VERSION`, injected via a `define` in `vite.config.ts` from `git rev-parse --short HEAD`, with `"dev"` as the fallback

Everything except subject and message goes in `details`.

### B2. Console error buffer: `src/lib/errorBuffer.ts`
- Installed once in `src/main.tsx`.
- Wraps `console.error` and listens to `window.onerror` / `unhandledrejection`.
- Keeps the last 20 entries in memory, each truncated to 500 characters.
- Nothing leaves the browser unless the box is ticked.

### B3. Attachments (private, **not** under the public `/uploads` static mount)
- Submission is `multipart/form-data` on the same `POST /api/support-requests`, parsed with multer (configured like `gallery.js`: same MIME allowlist, limit 3 files).
- Files are stored in `backend/private-uploads/support/<request_id>/`; add that to `.gitignore`.
- New table `support_request_attachments` (`id`, `request_id` FK ON DELETE CASCADE, `filename`, `mime`, `size`, `created_at`) in the same migration 0022.
- `GET /api/support-requests/:id/attachments/:attId` streams the file **only** to staff or the reporter.

### B4. Dashboard **Bugs** tab
- Filters: status, severity, area.
- Each row shows: severity badge, title, area, reporter, date.
- Expanded view: steps / expected / actual, technical details, console log, screenshot thumbnails (lightbox).
- Lifecycle Select (new → triaged → confirmed → in progress → fixed → released, plus won't fix / duplicate). Choosing duplicate prompts for the original report's ID.

### B5. Entry points
- Footer: add **"Report a bug"** under *Get in touch*, reusing the existing seed id `footer-bug`. It links to `/support?type=bug`.
- Header user menu: "Report a bug" → `/support?type=bug&from=<current path>`.

---

## Phase C: desktop "Help → Report a bug…"
- In `apps/desktop/src/editor/ui/main_window.py`, add a new **Help** menu (none exists today) with **"Report a bug…"**.
- **If signed in** (the `CrowdlyClient` session cookie jar exists): open a native `BugReportDialog` (new, `apps/desktop/src/editor/ui/bug_report_dialog.py`).
  - Same fields as the web form, plus an attach-screenshot file picker.
  - Auto details: app version (`importlib.metadata.version("crowdly-editor")`, falling back to the pyproject version), OS / platform, Qt version, current mode (Discovery/Creation), UI language.
  - Sends a multipart POST to `/api/support-requests` with `source='desktop'`. No captcha, because the user is authenticated. This needs a small multipart helper in `crowdly_client.py` next to `_http_post_json` (~line 711).
- **If not signed in:** open the browser at `https://…/support?type=bug&from=desktop&app_version=…&os=…`. The web form reads these into `details`, so anonymous desktop users still get captcha protection.
- **Mandatory menu checklist:** add `setTitle`/`setText` to `_retranslate_ui()`, and add `<message>` entries for "Help", "Report a bug…" and every dialog string in **all 8** `src/editor/i18n/editor_*.ts` files.

---

## Translations
- Seed `backend/scripts/data/interface-translations.seed.json` with `page_key: "/support"` entries (en/ru/de) for all new IDs, all prefixed `support-` (help center, FAQ, both forms, dashboard bug UI).
- Add a `/__layout__` entry for `footer-bug` and any new header strings.
- The 22 existing `/support` entries stay.

## Plan copy
Save this plan in the repo root as `Public support page and bug reports v1.md`.

## Verification
1. `npm run migrate --prefix backend`, then run the backend and frontend dev servers.
2. **Logged out** at `/support`:
   - FAQ works.
   - A support request with captcha creates a row.
   - `/support?type=bug` with 2 screenshots and console errors ticked: check `details` JSON, attachment rows and the files under `private-uploads/`.
   - The file URL returns 403 when logged out as someone else.
3. **Logged in** as a normal user:
   - Submitting needs no captcha.
   - "My requests & reports" lists the item.
   - `GET /api/support-requests` returns 403.
4. **As a platform_supporter:**
   - The dashboard is the default tab, and the Bugs/Enquiries tabs show the items.
   - Changing a status sends the reporter a live notification in the header (or an email for anonymous reports, if SMTP is configured).
   - Marking a duplicate links the original.
5. **Desktop:** `python -m editor` → Help → Report a bug…
   - Signed in: the native dialog submits a row with `source='desktop'`.
   - Signed out: the browser opens with diagnostics prefilled.
   - Switching the language at runtime retranslates the menu.
6. Run the seed script, switch to RU/DE and spot-check. Run `npm run lint` and `npx tsc --noEmit -p tsconfig.app.json`.
