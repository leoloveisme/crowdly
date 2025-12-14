# Re-writing the Crowdly Web Editor

This document translates the ideas from `Documentation/story page.pdf` into concrete, reviewable changes for the current Crowdly web app. It focuses on the Story page and the future "web editor" tab.

The goal is to separate **experiencing** stories from **(co-)creating** them, provide a minimal, intuitive editing UX, and prepare for replacing the current Aloha-based web editor with a richer, block-aware editor.

---

## 1. Current State (Story Page)

### 1.1 For not-logged-in users

- `/story/:story_id` currently shows:
  - A full-width text experience of the story (via `StoryContentTypeSelector` and chapter rendering).
  - Below that, the chapter editor and branching affordances are visible if the user is logged in; otherwise, the CRUD section shows a "Please log in" message.
- There is no clear visual or functional separation between:
  - The "experience" area (reading/browsing the story), and
  - The "(co-)creation" area (editing, contributing, branching).

### 1.2 For logged-in users (including admin/editor roles)

- Story title and chapter titles can be edited using inline controls.
- Paragraphs can offer a "Create Branch" button (already wired to a branch endpoint), but the UX is basic:
  - No hover-based context menu for story/chapter/paragraph.
  - No double-click navigation behavior.
  - No clear mode distinction between reading vs editing.
- There is an "Enable Editing Mode" concept in your screenshots, but the current Story page does not properly expose a clean read-vs-edit toggle.

### 1.3 Web editor tab / Aloha

- There is a separate "Web Editor" tab where Aloha Editor is embedded into an almost empty page.
- Aloha is not ideal for the final vision because it does not support many HTML elements (like `img`, etc.).
- However, its core idea (inline editing of content) is desirable.

---

## 2. UX Goals from the Story Page Document

From the PDF and your notes, the target UX for the Story page is:

1. **Two distinct layers:**
   - Top: "Experiencing" the story (reading, navigating, reacting, commenting).
   - Bottom: "(Co-)creating" the story (editing titles, chapters, paragraphs, branching, etc.).

2. **Toggle between layers:**
   - A button like **"I want to contribute to the story"** that reveals the (co-)creation portion.
   - A button **"Back to experiencing the story"** that returns to the reading-only view and hides the editing controls.
   - These should be clearly placed near the top of the story body, either
     - right upper corner, or
     - left upper corner
     of the central content area (we can support both with a design tweak, see section 3.1).

3. **Minimalistic editing UI:**
   - The (co-)creation section should be visually simple (like in your screenshot), not cluttered.
   - Titles and chapters should still feel like text, but with intuitive behaviors:
     - **Single click** on story title or chapter title: becomes editable inline.
     - **Hover with mouse / long-press on touch**: shows a small pop-up menu with controls
       - e.g. "Rename", "Clone", "Delete", "Open chapter", etc.
     - **Click away / tab away**: saves changes automatically.
     - **Double-click** on a title or chapter: navigates to a relevant location (for chapter, to `/story/:story_id/chapter/:chapter_id`).

4. **Paragraph interactions:**
   - Hovering a paragraph shows a control (e.g. a small button at the right margin) offering **"Create Branch"** (already conceptually present in the code).
   - On touch devices, long-press on a paragraph should open a similar small menu.
   - Creating a branch should:
     - Insert a new line / block below the paragraph,
     - Tag it as a branch,
     - Allow the contributor to enter text content there.

5. **Chapter-level navigation:**
   - Chapters can be opened as a separate page:
     - e.g. `/story/:story_id/chapter/:chapter_id` or similar.
   - This should be plumbed through the router and Story component.

6. **Role-based editing mode (admin/support):**
   - For users with roles such as `platform_admin` or `platform_supporter`, there should be an **"Enable Editing Mode"** button.
   - When enabled, these users can:
     - Translate UI elements of the Crowdly web platform (labels, headings) into multiple languages.
     - Contribute to stories and branches.
   - This connects to the existing language switch at the top of the platform.

7. **Web editor for advanced editing:**
   - In the "Web Editor" tab, Aloha is used as a prototype.
   - We need a better block-based editor that supports:
     - standard HTML elements (including `img`, lists, headings, etc.),
     - structured paragraph/branch blocks,
     - revision/history integration.

---

## 3. Proposed Story Page Changes (High-Level)

This section outlines specific, code-oriented changes to the Story page and related components, without yet applying them. You can review and approve these before implementation.

### 3.1 Separate "Experience" and "Contribute" areas

**Files involved:**

- `src/pages/Story.tsx`
- `src/components/ChapterEditor.tsx`
- Possibly small helper components for context menus.

**Proposed changes:**

1. **Introduce UI state for mode:**
   - In `Story.tsx`, add state:
     - `const [mode, setMode] = useState<'experience' | 'contribute'>('experience');`
   - For logged-out users:
     - Mode is always `experience`.
   - For logged-in users:
     - Show a toggle UI just under the header (but within the story container):
       - If `mode === 'experience'`: show `I want to contribute to the story` button.
       - If `mode === 'contribute'`: show `Back to experiencing the story` button.

2. **Layout:**
   - Keep the existing read/experience area (StoryContentTypeSelector + chapter read view) always visible.
   - Wrap the (co-)creation area (title editing controls, ChapterEditor, branch buttons) in a container that is only rendered when `mode === 'contribute'` **and** `user` is present.

3. **Placement of buttons:**
   - Place the toggle buttons inside the main `Story` content area, aligned to the right of the title row:
     - Example: right-top corner of the story content card.
   - On mobile, these can be a small pill-style button below the title.

Effect:

- For not-logged-in users, the page is purely an experience view.
- For logged-in users, editing controls are hidden by default and only appear after opting into contribution mode.

### 3.2 Title and chapter title interactions

**Files:** `src/pages/Story.tsx`, `src/components/ChapterEditor.tsx`.

**Goal:** unify title and chapter title interactions to support:

- Single-click to edit inline.
- Hover/long-press context menu.
- Double-click to navigate.
- Auto-save on blur or when user clicks away.

**Approach:**

1. **Reusable "EditableWithMenu" component**
   - Create a small component, e.g. `EditableWithMenu`, that wraps a text span and manages:
     - Internal `isEditing` and `value` state (or uses controlled props),
     - `onClick` → enter edit mode,
     - `onDoubleClick` → call `onNavigate()` callback if provided,
     - `onBlur` / `onKeyDown(Enter/Escape)` → call `onSave` or `onCancel`,
     - `onMouseEnter` / `onContextMenu` / long-press → open a small popover menu with actions.

2. **Story title:**
   - Replace the custom title editing logic in `Story.tsx` with `EditableWithMenu`.
   - Menu items:
     - `Rename` (same as entering edit mode),
     - `Clone story`,
     - `Make public/private`,
     - `Publish/Unpublish`,
     - `Delete story` (for authorized roles).

3. **Chapter titles:**
   - In `ChapterEditor` and in the chapter rendering loop in `Story.tsx`, wrap chapter titles in `EditableWithMenu`.
   - Menu items:
     - `Rename chapter`,
     - `Clone chapter` (adds a duplicate chapter under same story),
     - `Delete chapter`,
     - `Open chapter` (navigates to `/story/:story_id/chapter/:chapter_id`).

4. **Auto-save behavior:**
   - For story title:
     - On blur or pressing Enter, call existing `PATCH /story-titles/:id` logic.
   - For chapter titles:
     - On blur or pressing Enter, call existing `PATCH /chapters/:chapterId` with updated `chapterTitle`.

5. **Double-click navigation:**
   - For chapter titles, on double-click: `navigate(`/story/${story_id}/chapter/${chapter_id}`)`.
   - This route can render the same Story page but scrolled/focused on that chapter, or a simplified chapter-only view.

### 3.3 Paragraph interactions and branches

**Files:** `src/pages/Story.tsx`, `src/components/ParagraphBranchPopover.tsx`.

The current behavior is close to your target; we propose to refine it:

1. **Paragraph hover / long-press:**
   - Continue using `ParagraphBranchPopover` but adjust the trigger so it:
     - Appears as a subtle icon on paragraph hover (desktop),
     - Can be invoked by long-press on touch devices via `onTouchStart` + timeout.

2. **Branch creation UI:**
   - When the user chooses "Create Branch" from the popover:
     - Show a simple inline textarea below the paragraph.
     - Mark this inline editor visually as a "branch" (e.g. subtle border and label).
     - On save, call the existing `/paragraph-branches` endpoint.

3. **Branch management:**
   - Keep more advanced branch comparison/accept/reject logic in the "Branches" tab, as per your earlier spec; this can be expanded later.

### 3.4 Chapter-specific URLs

**Files:** `src/main.tsx` (router), `src/pages/Story.tsx`.

1. **Routing:**
   - Add a route: `/story/:story_id/chapter/:chapter_id` that points to the same `Story` page component.

2. **Behavior in Story page:**
   - When `chapter_id` is present in the URL params:
     - After loading chapters, scroll the page to the corresponding chapter.
     - Optionally highlight that chapter for a short time (e.g. background tint).

3. **Double-click navigation:**
   - Hook into this route from chapter title double-click as described above.

### 3.5 Role-based "Enable Editing Mode" and language support

**Files:** `src/pages/Story.tsx`, `src/contexts/AuthContext.tsx`, language-related components.

1. **Editing mode for privileged users:**
   - Add a toggle (e.g. a small button near the language switch or in the Story header) visible only to users with roles:
     - `platform_admin`, `platform_supporter`, `editor`, `chief_editor`.
   - Toggling it:
     - Enables editing of platform UI strings through an inline editor (similar to `EditableText`), so translations can be entered.
     - Automatically sets `mode = 'contribute'` for the Story page.

2. **Language awareness:**
   - Continue using the global language switch to determine which text variant to display.
   - In the future, integrate language into story title/chapter/paragraph revisions and branches (as hinted in your DB design).

---

## 4. Proposed Web Editor Rework

The existing "Web Editor" tab uses Aloha Editor in a minimal page. The vision is to replace this with a better, Crowdly-specific editor that:

- Treats **title**, **chapters**, **paragraphs**, and **branches** as first-class blocks.
- Supports standard HTML elements (`img`, lists, headings, etc.).
- Integrates tightly with revisions and branching.

### 4.1 Immediate steps (around Aloha)

**Files:** (Existing Web Editor page, likely `src/pages/WebEditor.tsx` or similar, and integration where Aloha is used.)

1. **Keep Aloha as a temporary prototype:**
   - Document its limitations in this markdown (see link you provided).
   - Use it only as a sandbox for experimenting with inline editing ideas.

2. **Do not expand Aloha usage further**
   - Instead of wiring new features into Aloha, use the Story page + chapter/paragraph editors as the main editors.

### 4.2 Medium-term plan: Build a custom block editor

**Target properties:**

- Represent a story as a hierarchy:
  - Story title
  - Episodes / Parts (optional)
  - Chapters
  - Paragraphs
  - Branches
- Support inline editing similar to Aloha but with full React control:
  - Each block is a React component with props and event handlers.
  - Editing changes trigger PATCH/POST requests to the backend and record revisions.
- Provide keyboard shortcuts and context menus for block-level operations (clone, delete, move, branch).

**Potential technology options:**

- Use a React-based rich text editor framework (e.g. Slate, ProseMirror, TipTap) and customize it to:
  - Treat paragraphs as separate nodes that map to `stories.paragraphs[]` entries.
  - Support branching as linked nodes with metadata pointing to paragraph IDs.

### 4.3 Long-term integration

- Replace the Aloha-based Web Editor tab with a **Story Editor** that:
  - Opens a story by ID.
  - Uses the same data structures and endpoints as the Story page (no duplication of logic).
  - Exposes advanced layout and comparison views for branches (e.g. multiple panes for branch comparison, as you described in the PDF).

---

## 5. Summary of Proposed Code Changes (for your review)

Before we touch the code, here is the concise list of proposed modifications:

1. **Story page modes:**
   - Add `mode = 'experience' | 'contribute'` and toggle buttons.
   - Hide the (co-)creation area unless `mode === 'contribute'` and user is logged in.

2. **Inline editing with context menus:**
   - Introduce `EditableWithMenu` component.
   - Use it for story title and chapter titles.
   - Enable click-to-edit, hover/long-press menu, double-click navigation, and auto-save on blur.

3. **Paragraph branch UX:**
   - Refine `ParagraphBranchPopover` to react to hover/long-press.
   - Add an inline branch editor block below paragraphs when creating a branch.

4. **Chapter-specific routing:**
   - Add `/story/:story_id/chapter/:chapter_id` route that focuses/highlights the chosen chapter.
   - Use double-click on chapter title to navigate to that route.

5. **Role-based editing mode:**
   - Add an "Enable Editing Mode" toggle for admin/support/editor roles.
   - Allow platform UI text translation in this mode and automatically enable `mode = 'contribute'` on the Story page.

6. **Web editor refactor plan:**
   - Keep Aloha only as a temporary prototype.
   - Design and later implement a React-based block editor tailored to Crowdly’s story/branch structure.

If you approve this plan, the next step will be to implement it in small, safe increments (starting with the Story page mode separation and inline editing improvements), verifying after each step that existing functionality (especially story viewing and profile story listing) remains intact.