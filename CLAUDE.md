# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Crowdly is a multi-creator, crowd-created entertainment platform combining features of YouTube, Audible, Netflix, Goodreads, GitHub, and Wattpad. It supports text, pictures, audio, and video content with versioning and branching of crowd-created stories.

The project consists of three applications:
- **Web platform** (React/TypeScript/Vite) - main frontend at root
- **Backend API** (Node.js/Express) - in `backend/`
- **Desktop app** (Python/PySide6) - in `apps/desktop app/`

## Development Commands

### Frontend (root directory)
```bash
npm run dev      # Start Vite dev server on :8080
npm run build    # Production build
npm run lint     # ESLint
```

### Backend (backend/)
```bash
npm run dev      # Start Express with nodemon on :4000
npm run start    # Production start
npm run create-admin  # Create admin user
```

### Desktop App (apps/desktop app/)
```bash
python -m venv .venv # Install virtual environment
source .venv/bin/activate # activate virtual environment
pip install -e .   # Install in development mode
python -m editor   # Run the editor
```

## Architecture

### Frontend Structure
- `src/components/` - React components, `ui/` contains shadcn/ui components
- `src/pages/` - Route page components
- `src/modules/` - Feature modules (stories, screenplays, etc.)
- `src/contexts/` - React contexts (AuthContext, EditableContentContext)
- `src/hooks/` - Custom hooks (useAuth, useEditableContent)
- Path alias: `@/` maps to `src/`

### Backend Structure
- `backend/src/server.js` - Main Express server with 60+ API routes
- `backend/src/db.js` - PostgreSQL connection pool
- `backend/src/auth.js` - bcrypt authentication functions

### Key Patterns
- **Vite Proxy**: Frontend proxies `/auth`, `/stories`, `/screenplays`, etc. to backend :4000
- **CRDT Versioning**: Automerge-based collaborative editing stored in `crdt_documents` and `crdt_changes` tables
- **Multi-language**: Content supports 13+ languages via `locales` table and EditableContentContext
- **User Roles**: 8 roles (consumer, author, editor, chief_editor, producer, contributor, platform_admin, platform_supporter)

### Database (PostgreSQL)
Key tables:
- `local_users` - User accounts with bcrypt hashes
- `story_title` / `stories` - Story metadata and chapters with paragraph arrays
- `screenplay_title` / `screenplay_scene` / `screenplay_block` - Screenplay structure
- `crdt_documents` / `crdt_changes` - Version control
- `story_access` / `screenplay_access` - Fine-grained permissions
- `creative_spaces` / `creative_space_items` - User content collections

### Desktop-Web Sync
Desktop app syncs screenplays with backend via `POST /screenplays/:id/sync-desktop`

## Environment Variables

### Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:4000
```

### Backend (.env)
```
DATABASE_URL=postgres://user:pass@localhost:5432/crowdly
PORT=4000
```

## Tech Stack

**Frontend**: React 18, TypeScript, Vite, React Router v6, shadcn/ui + Radix UI, Tailwind CSS, React Query v5, React Hook Form, Zod

**Backend**: Node.js (ES Modules), Express, PostgreSQL (pg), bcryptjs, CORS

**Desktop**: Python 3.10+, PySide6 (Qt), psycopg2, python-docx, pdfminer, ebooklib

## Desktop App — Mandatory Checklist for Menu Changes

Whenever you add, rename, or modify a menu item or action in the desktop app (`apps/desktop app/`), you **must** also:

1. **Update `_retranslate_ui()`** in `main_window.py` — add a `setText()` / `setTitle()` call for the new or changed action/menu so the text is refreshed when the user switches language at runtime.
2. **Update ALL `.ts` translation files** in `src/editor/i18n/` — add the corresponding `<message>` entry with the source string and a proper translation for every language file (`editor_en.ts`, `editor_ru.ts`, `editor_ar.ts`, `editor_zh-Hans.ts`, `editor_zh-Hant.ts`, `editor_ja.ts`, `editor_kr.ts`, `editor_pt.ts`).

Skipping either step causes partial/broken translations at runtime. Treat this as a mandatory part of any menu change, not a separate task.
