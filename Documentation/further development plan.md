# Further Development Plan

This document outlines a detailed plan for evolving the Crowdly web app toward the collaborative, branching, versioned storytelling platform described in `crowdly web.md`. It is organized as:

1. Current state & goals
2. Backend data model and API roadmap
3. Frontend/UX changes
4. Auth, roles, and permissions (including visibility/private stories)
5. Mobile/networking robustness
6. Incremental implementation steps

Each section includes concrete code-change proposals with file-level pointers.

---

## 1. Current State & High-Level Goals

**Current (web) state**

- Vite + React frontend in `src/`.
- Local Node/Express backend in `backend/` talking to Postgres `crowdly`.
- Auth:
  - Local login against `local_users` + `user_roles` via `/auth/login` and `AuthContext`.
  - Registration wired to `/auth/register` and `local_users`.
- Story model (minimal, but working):
  - `story_title` table: `story_title_id`, `title`, `creator_id`, timestamps, and `visibility` (now added, default `public`).
  - `stories` table: chapters linked to `story_title_id`, plus `chapter_title`, `paragraphs` (array), etc.
  - `story_title_revisions` table storing title changes.
- Backend endpoints:
  - `/auth/login`, `/auth/register`.
  - Story creation & chapters: `/stories/template`, `/story-titles`, `/story-titles/:id`, `/story-title-revisions/:id`, `/chapters`, `/chapters/:id`, `/stories/newest`, `/users/:userId/stories`, `/paragraph-branches`.
- Frontend key pages:
  - `/new-story-template`: autosaves to create a story + first chapter.
  - `/story/:story_id`: editor/reader page wired to backend.
  - `/profile`: shows profile info + “Stories I’m creating/co‑creating”.
  - `/`: main page with “Newest” using backend.

**High-level goals from `crowdly web.md`**

- Stories are made of episodes/parts/chapters/paragraphs with **branching at paragraph level**.
- Everything is **revisioned** (story, chapter, paragraph, branches).
- Social layer: likes/dislikes/comments at story/chapter/paragraph.
- Collaborative: co‑writing, contributions tracked, translations per language.
- Privacy/visibility: public vs private stories; private visible only to allowed users.
- Good UX on web and mobile (android phone/tablet) with no Supabase dependency.

The following sections break down what to implement to move toward this vision.

---

## 2. Backend Data Model & API Roadmap

### 2.1. Data Model Extensions

**Goal:** Make the database reflect the versioned, branching, social storytelling model.

### 2.1.1. Visibility and Access Control

Already added:

- `story_title.visibility text NOT NULL DEFAULT 'public'`

**Planned additions:**

- A join table for per‑story access control (for future fine-grained permissions):

  ```sql
  CREATE TABLE IF NOT EXISTS story_access (
    story_title_id uuid REFERENCES story_title(story_title_id) ON DELETE CASCADE,
    user_id uuid REFERENCES local_users(id) ON DELETE CASCADE,
    role text NOT NULL, -- e.g. 'owner', 'co_author', 'viewer'
    PRIMARY KEY (story_title_id, user_id)
  );
  ```

**Concrete code changes:**

- Add migration SQL (you can keep it in a `db/migrations` folder or run manually for now).
- In backend, when creating a story (`/stories/template`):
  - Insert into `story_access` with role `owner` for `userId`.

  **File:** `backend/src/server.js`

  - Inside `app.post('/stories/template', ...)`, after inserting into `story_title`:

    ```js
    // After storyTitleRow is obtained
    await client.query(
      'INSERT INTO story_access (story_title_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [storyTitleRow.story_title_id, userId, 'owner'],
    );
    ```

### 2.1.2. Revisions for Chapters and Paragraphs

**Goal:** Mirror the existing `story_title_revisions` pattern for chapters and paragraphs.

Assuming these tables don’t yet exist, add them:

```sql
CREATE TABLE IF NOT EXISTS chapter_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
  prev_chapter_title text,
  new_chapter_title text NOT NULL,
  prev_paragraphs text[],
  new_paragraphs text[] NOT NULL,
  created_by uuid NOT NULL REFERENCES local_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_number integer NOT NULL,
  revision_reason text,
  language text DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS paragraph_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
  paragraph_index integer NOT NULL,
  prev_paragraph text,
  new_paragraph text NOT NULL,
  created_by uuid NOT NULL REFERENCES local_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_number integer NOT NULL,
  revision_reason text,
  language text DEFAULT 'en'
);
```

**Backend changes:**

- Add helper functions similar to `getNextStoryTitleRevisionNumber`:

  **File:** `backend/src/server.js`

  ```js
  async function getNextChapterRevisionNumber(chapterId) {
    const { rows } = await pool.query(
      'SELECT revision_number FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number DESC LIMIT 1',
      [chapterId],
    );
    if (rows.length === 0) return 1;
    return Number(rows[0].revision_number) + 1;
  }

  async function getNextParagraphRevisionNumber(chapterId, paragraphIndex) {
    const { rows } = await pool.query(
      'SELECT revision_number FROM paragraph_revisions WHERE chapter_id = $1 AND paragraph_index = $2 ORDER BY revision_number DESC LIMIT 1',
      [chapterId, paragraphIndex],
      [chapterId, paragraphIndex],
    );
    if (rows.length === 0) return 1;
    return Number(rows[0].revision_number) + 1;
  }
  ```

- When updating a chapter via `PATCH /chapters/:chapterId`:

  - Before running the UPDATE, fetch the existing row (`chapter_title`, `paragraphs`).
  - After updating, insert into `chapter_revisions`:

  ```js
  // In app.patch('/chapters/:chapterId', ...)
  const existingRes = await pool.query(
    'SELECT chapter_title, paragraphs FROM stories WHERE chapter_id = $1',
    [chapterId],
  );
  if (existingRes.rows.length === 0) {
    return res.status(404).json({ error: 'Chapter not found' });
  }
  const existing = existingRes.rows[0];

  // ... build and run UPDATE as already implemented ...

  const updated = await pool.query(sql, values);

  // After successful update
  const nextRev = await getNextChapterRevisionNumber(chapterId);
  await pool.query(
    `INSERT INTO chapter_revisions
       (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      chapterId,
      existing.chapter_title,
      chapterTitle !== undefined ? chapterTitle : existing.chapter_title,
      existing.paragraphs,
      paragraphs !== undefined ? paragraphs : existing.paragraphs,
      req.body.userId ?? null, // or derive from auth once you add auth middleware
      nextRev,
      'Chapter updated',
      'en',
    ],
  );
  ```

- For paragraph‑level revisions:
  - This can be done either during `PATCH /chapters/:chapterId` (diff per paragraph) or via a dedicated endpoint (e.g., `POST /paragraph-revisions`).
  - Initial version (cheaper): only record full chapter revisions; refine later.

**API for reading revisions:**

- Add endpoints:

  ```js
  app.get('/chapter-revisions/:chapterId', async (req, res) => {
    const { chapterId } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number ASC',
        [chapterId],
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /chapter-revisions/:chapterId] failed:', err);
      res.status(500).json({ error: 'Failed to fetch chapter revisions' });
    }
  });
  ```

  - Similar for `paragraph_revisions` once implemented.

### 2.1.3. Branches, Likes, Comments (Scaffolding)

**Branches (already partially implemented)**

- Confirm `paragraph_branches` table definition; ensure it includes:
  - `branch_id`, `chapter_id`, `parent_paragraph_index`, `parent_paragraph_text`, `branch_text`, `user_id`, `language`, `metadata`, timestamps.

**Likes / Dislikes / Comments**

Add tables:

```sql
CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES local_users(id) ON DELETE CASCADE,
  story_title_id uuid REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES stories(chapter_id) ON DELETE CASCADE,
  paragraph_index integer,
  reaction_type text NOT NULL, -- 'like' or 'dislike'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES local_users(id) ON DELETE CASCADE,
  story_title_id uuid REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES stories(chapter_id) ON DELETE CASCADE,
  paragraph_index integer,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE
);
```

**Initial APIs (MVP):**

- `POST /reactions` to like/dislike a paragraph/chapter/story.
- `GET /reactions?storyTitleId=...` to show reaction counts.
- `POST /comments` and `GET /comments?storyTitleId=...`.

These can be implemented later as dedicated tasks; this plan just defines their shape.

---

## 3. Frontend / UX Changes

### 3.1. New Story Template

**Goals:**

- Keep `/new-story-template` as a minimal, always‑same template page.
- Automatically create a new story with a unique ID on any change (title or body).
- Show Story ID and a link to `/story/<id>`.

**Concrete refinements:**

1. **Clarify autosave behavior and UI hints**

   - In `src/pages/NewStoryTemplate.tsx`:
     - Ensure `hasMeaningfulChange()` considers title, chapter title, and body.
     - Add a short helper text near the title and textarea explaining autosave behavior.

2. **Ensure visibility defaults to public**

   - When calling `/stories/template`, pass an explicit `visibility: 'public'` in the body and have backend ignore/override if not provided.

   **Backend change:**

   ```js
   // backend/src/server.js, in app.post('/stories/template'):
   const { title, chapterTitle, paragraphs, userId, visibility } = req.body ?? {};
   const storyVisibility = visibility || 'public';

   const insertTitle = await client.query(
     'INSERT INTO story_title (title, creator_id, visibility) VALUES ($1, $2, $3) RETURNING story_title_id, title, visibility',
     [title, userId, storyVisibility],
   );
   ```

   **Frontend change:**

   In `NewStoryTemplate.tsx` autosave `POST /stories/template`, include `visibility: 'public'` explicitly in the JSON body.

### 3.2. Story Page (`/story/:id`)

**Goals:**

- Full‑width chapter editor and auto‑growing paragraph textareas (already implemented in `ChapterEditor`).
- Add UI to show:
  - Story visibility: public/private.
  - Basic revision history (story + chapter).
  - Future: likes/comments/branches.

**Concrete changes:**

1. **Show visibility badge**

   **File:** `src/pages/Story.tsx`

   - After the story title, show a small badge:

   ```tsx
   {story && (
     <span className="ml-2 px-2 py-0.5 rounded-full text-xs border text-gray-600">
       {story.visibility === 'private' ? 'Private' : 'Public'}
     </span>
   )}
   ```

2. **Hook up chapter/paragraph revisions UI later**

   - Once backend `GET /chapter-revisions/:chapterId` exists, add a section in `Revisions` tab that:
     - Lists revisions per chapter.
     - Shows timestamp + who changed it.

### 3.3. Profile Page

**Goals:**

- Show stories user is creating/co‑creating (already added).
- In the future, allow toggling story visibility from profile (e.g. a per‑story visibility selector).

**Planned change (later):**

- Add a small dropdown or button near each story in the “Stories I’m creating / co‑creating” section to change `visibility` to `public/private` via `PATCH /story-titles/:id` with `visibility` field.

---

## 4. Auth, Roles, and Permissions

### 4.1. Roles

- Existing roles via `user_roles`: e.g. `platform_admin`, `editor`, `consumer`.
- Use roles to:
  - Allow admins/editors to delete stories.
  - Later, manage moderation (hide abusive content, etc.).

### 4.2. Visibility Enforcement

**Goal now:**

- Already: `/stories/newest` only lists `visibility = 'public'`.
- Next: enforce visibility on `/story-titles/:id` and `/chapters` when serving story content.

**Backend change:**

In `GET /story-titles/:storyTitleId`:

```js
app.get('/story-titles/:storyTitleId', async (req, res) => {
  const { storyTitleId } = req.params;
  const requesterId = req.query.userId || null; // optional
  try {
    const { rows } = await pool.query(
      'SELECT * FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }
    const story = rows[0];

    if (story.visibility === 'private') {
      // Check access
      const access = await pool.query(
        'SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2',
        [storyTitleId, requesterId],
      );
      if (access.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(story);
  } catch (err) {
    console.error('[GET /story-titles/:storyTitleId] failed:', err);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});
```

**Frontend change:**

- When fetching story for `/story/:id`, optionally include `userId` from `AuthContext` in query string.

  **File:** `src/pages/Story.tsx`

  ```ts
  const { user } = useAuth();

  const fetchStoryAndChapters = async () => {
    if (!story_id) return;
    setLoading(true);
    try {
      const url = new URL(`${API_BASE}/story-titles/${story_id}`);
      if (user?.id) url.searchParams.set('userId', user.id);
      const res = await fetch(url.toString());
      ...
  ```

- If the backend returns 403, show a friendly message instead of generic 404.

---

## 5. Mobile & Networking Robustness

We already changed `API_BASE` to derive from `window.location.hostname`, which fixes the biggest Android issue (calling `localhost` on the phone).

**Further improvements:**

1. **Use env override for production / reverse proxy**

   - In production, you may serve the backend behind the same host (e.g. `/api`).
   - Plan:
     - Set `VITE_API_BASE_URL=/api` in production.
     - In backend, mount routes under `/api` if desired.

2. **CORS**

   - Backend currently uses `app.use(cors());` which is permissive.
   - Later tighten as needed, but mobile is already unblocked.

3. **Error Handling UX**

   - Anywhere we use `error.message` in toasts (e.g., registration/login), map `TypeError: Failed to fetch` to a user‑friendly message, e.g. “Cannot reach server, check your connection or try again later.”

   Example adjustment in `RegisterForm.tsx`:

   ```ts
   } catch (error: any) {
     console.error("Registration error:", error);
     const msg = String(error?.message || '').includes('Failed to fetch')
       ? 'Cannot reach server. Please check your connection.'
       : error?.message || 'An unexpected error occurred';
     toast({
       title: "Registration failed",
       description: msg,
       variant: "destructive",
     });
   }
   ```

---

## 6. Incremental Implementation Steps

To make this reviewable and implementable, here’s a suggested sequence of PRs/commits:

### Step 1: Visibility & Access Control (Stories)

- [x] Add `visibility` column (done).
- [ ] Add `story_access` table.
- [ ] On `/stories/template` creation, insert `story_access` row for owner.
- [ ] Filter `/stories/newest` on `visibility = 'public'` (done).
- [ ] Enforce visibility in `GET /story-titles/:id` with optional `userId` param.
- [ ] Update `/story/:id` frontend to include `userId` when calling backend and handle 403 gracefully.

### Step 2: Chapter Revisions

- [ ] Add `chapter_revisions` table.
- [ ] Implement `getNextChapterRevisionNumber` helper.
- [ ] Extend `PATCH /chapters/:chapterId` to:
  - Fetch existing chapter.
  - Insert new revision row after successful update.
- [ ] Add `/chapter-revisions/:chapterId` endpoint.
- [ ] Add basic chapter revision list UI under the “Revisions” tab on `/story/:id`.

### Step 3: Paragraph Revisions (Optional v1)

- [ ] Add `paragraph_revisions` table.
- [ ] Add helper + endpoint for paragraph revisions.
- [ ] Wire paragraph edit flows to record revisions (either via chapter update or a dedicated paragraph endpoint).

### Step 4: Social Layer Scaffolding

- [ ] Add `reactions` and `comments` tables.
- [ ] Add simple `POST /reactions`, `GET /reactions`, `POST /comments`, `GET /comments`.
- [ ] Add minimal UI to like/dislike a story and leave a comment at story level.

### Step 5: Profile Enhancements

- [ ] In Profile, next to each story in “Stories I’m creating / co‑creating”, add a small badge for visibility and optionally a control to toggle it.
- [ ] Hook that up to `PATCH /story-titles/:id` including `visibility`.

### Step 6: UX & Error Handling Polish

- [ ] Replace raw `TypeError: Failed to fetch` toasts with friendly messages across:
  - `RegisterForm.tsx`
  - `AuthContext.tsx` signIn
  - Any other fetch wrappers.
- [ ] Add a minimal “connection issue” banner when API calls repeatedly fail.

---

This plan is structured so you can review and approve each logical block. Once you pick an area to start (e.g., “Visibility & Access Control”), I can generate concrete diffs for the relevant files following the above outline.
