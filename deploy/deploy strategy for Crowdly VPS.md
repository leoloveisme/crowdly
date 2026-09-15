# Deploy strategy for Crowdly on the Hostinger VPS

Status: **plan only** — nothing in this doc has been executed except the nginx
stop-gap noted in Finding 1, which is already live.

## 1. Current state (as verified on 2026-08-15)

- **VPS**: Hostinger, Ubuntu, nginx 1.28.0, reachable at `crowdly.cloud`.
- **Backend**: systemd unit `crowdly-backend.service`, `User=lad`,
  `WorkingDirectory=/var/www/crowdly/backend`, `ExecStart=/usr/bin/node src/server.js`,
  `EnvironmentFile=/var/www/crowdly/backend/.env`. Enabled (survives reboot).
  Exposes `GET /health` which checks DB connectivity.
- **Database**: PostgreSQL, self-hosted on the same VPS.
- **Frontend**: Vite build, default `outDir` (`dist/`) — no override in
  `vite.config.ts`.
- **Web root**: nginx `root /var/www/crowdly;`, SPA fallback
  (`try_files $uri $uri/ /index.html;`), with explicit `location` blocks
  proxying specific API path prefixes (`/auth`, `/stories`, `/friends`, etc.)
  to `http://127.0.0.1:4000`.
- **Migrations**: the backend self-migrates on boot — 45 `ensure*Table()`
  calls in `server.js` run idempotent `CREATE TABLE IF NOT EXISTS` /
  `ADD COLUMN IF NOT EXISTS`-style statements every time the process starts.
  There is no separate migration-runner step; restarting the backend *is*
  the migration step.

### Finding 1 — source tree exposed via the web root (fixed, stop-gap)

`/var/www/crowdly` turned out to be the **full git checkout** — `.git/`,
`backend/` (including `.env` and `node_modules`), `supabase/` all live
inside nginx's document root. Only `.env` and `CLAUDE.md` happened to be
`chmod 660` (unreadable by `www-data`); everything else defaulted to
world-readable, so `.git/config`, `backend/src/server.js`, and
`backend/package.json` were all publicly servable (verified `200` before the
fix).

**Applied stop-gap** (live now): two `location` blocks added to
`/etc/nginx/sites-available/crowdly.cloud`, denying `/backend/` and all
dotfiles/dot-directories except `.well-known`. Verified: those paths now
`404`; homepage, static assets, and the `/health` proxy still `200`.

This is a patch, not a fix — the backend source and `.git` still physically
sit inside the web root, protected only by a URL-matching rule that a future
nginx edit could silently undo. **Phase 1 below removes the underlying
problem** rather than relying on the patch long-term. Keep the deny rules
anyway afterward (belt-and-suspenders, and they make `/backend/*` return a
clean `404` instead of the SPA shell).

## 2. Target architecture

Separate three things that currently overlap in one directory:

| Concern | Current location | Target location |
|---|---|---|
| Source checkout (`.git`, backend code, frontend source) | `/var/www/crowdly` | `/opt/crowdly-backend` — **outside** any nginx root |
| Nginx web root (built frontend only) | `/var/www/crowdly` (mixed with everything else) | `/var/www/crowdly` (unchanged path, but populated *only* from `dist/` output — never a raw checkout again) |
| Backend runtime (`WorkingDirectory`, `.env`) | `/var/www/crowdly/backend` | `/opt/crowdly-backend/backend` |

Nothing about nginx's `root` directive path needs to change — only what's
*inside* it. That keeps the existing `location` blocks (which all reference
`127.0.0.1:4000`, unaffected by any of this) working unmodified.

**Naming note**: `/opt/crowdly-backend` ends up holding a full clone of the
monorepo (single `git pull` target, simplest — no sparse-checkout
complexity), even though only its `backend/` subfolder actually runs as a
service. That's a deliberate simplification: since the frontend is built in
CI (Phase 2, not on the VPS), the root-level frontend source in that clone
is present but never installed/built there — mild clutter, no functional
downside. `/opt` (rather than a home directory) is the conventional Linux
location for application software that isn't tied to a specific user
account.

## 3. Phase 1 — one-time restructure (VPS session, manual + sudo)

Order matters: copy before touching anything live, verify the backend on
its new path before cleaning up the old one, keep the original in place
until everything is confirmed.

1. **Create the target directory under `/opt`, owned by `lad`** (`/opt` is
   root-owned by default; the systemd unit runs as `User=lad`, so it needs
   ownership here, not just read access):
   ```bash
   sudo mkdir -p /opt/crowdly-backend
   sudo chown lad:devs /opt/crowdly-backend
   ```
2. **Copy (not move) the current checkout into it.**
   Leaves `/var/www/crowdly` untouched and nginx serving normally throughout.
   ```bash
   cp -a /var/www/crowdly/. /opt/crowdly-backend/
   ```
3. **Point the systemd unit at the new location** (sudo, edit
   `/etc/systemd/system/crowdly-backend.service`):
   ```
   WorkingDirectory=/opt/crowdly-backend/backend
   EnvironmentFile=/opt/crowdly-backend/backend/.env
   ```
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart crowdly-backend
   sudo systemctl status crowdly-backend   # confirm active (running) from new path
   curl -s http://127.0.0.1:4000/health    # confirm {"status":"ok","db":"connected"}
   ```
   Brief restart blip (a few seconds of API downtime); frontend stays up
   throughout since nginx serves static files independently.
5. **Build the frontend from the new source checkout and repopulate the web
   root from the build output only** — not the raw checkout:
   ```bash
   cd /opt/crowdly-backend
   npm ci
   npm run build            # produces /opt/crowdly-backend/dist/
   rsync -a --delete /opt/crowdly-backend/dist/ /var/www/crowdly/
   ```
   `rsync --delete` makes `/var/www/crowdly` mirror `dist/` exactly —
   this is the step that removes `backend/`, `.git/`, `supabase/`, and
   everything else that doesn't belong in the web root. There will be a
   brief window where files are being added/removed; acceptable for this
   traffic level. (If it ever isn't, switch to build-to-temp-dir +
   atomic symlink swap — not needed yet.)
6. **Verify**, from outside:
   ```bash
   curl -I https://crowdly.cloud/                    # 200
   curl -I https://crowdly.cloud/backend/.env         # 404 (now for two independent reasons)
   curl -I https://crowdly.cloud/.git/config          # 404
   ```
   And check the site loads in a browser, including a login (confirms
   session cookie / API proxy still correct end-to-end).
7. **Only once everything above is confirmed**, the old checkout is already
   gone — step 5's `rsync --delete` transformed `/var/www/crowdly` in place
   into the frontend-only web root. Nothing further to delete;
   `/opt/crowdly-backend` is the one and only source checkout going forward.

After this phase: `/var/www/crowdly` = frontend build artifacts only, world
readable, no secrets, no `.git`. `/opt/crowdly-backend` = the real
checkout, not served by nginx at all, `.env` protected by not being in any
web root rather than by file permissions alone.

## 4. Phase 2 — GitHub Actions CI/CD (repo session, once Phase 1 is confirmed live)

Trigger: push to `alpha` (that's the branch you actually push production
code to today — `main` isn't wired to deploy anything right now. Revisit
if/when a `main`-gated release flow is introduced).

1. **Build job** (runs on GitHub's runner, not the VPS):
   - checkout, `npm ci`, `npm run build` → uploads `dist/` as an artifact.
   - Also worth adding `npm run lint` and `tsc --noEmit` as a gate before
     deploy — catches the kind of thing we'd otherwise only find in prod.
2. **Deploy job** (needs: build; runs after build succeeds):
   - downloads the `dist/` artifact
   - `rsync`s it to `/var/www/crowdly` on the VPS over SSH
     (`rsync -a --delete`, same as Phase 1 step 3, now automated)
   - separately, on the VPS side: `git pull` inside
     `/opt/crowdly-backend` (or `git fetch && git reset --hard
     origin/alpha` for a clean deploy), `npm ci --prefix backend`,
     `sudo systemctl restart crowdly-backend`
   - runs `curl -f http://127.0.0.1:4000/health` as a post-deploy check;
     fail the workflow (and ideally alert) if it doesn't return healthy
3. **Auth**: a dedicated deploy SSH key (not `lad`'s personal key),
   restricted if possible (`command=` forced-command in
   `authorized_keys`, or a limited sudoers entry scoped to exactly
   `systemctl restart crowdly-backend` and nothing else — avoids handing
   CI a general-purpose root-capable key).
4. **Secrets** live in GitHub Actions repo secrets
   (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`) — never in the workflow file,
   never in the repo. The VPS's own `.env` is never generated or touched
   by CI; it's provisioned once, by hand, and stays VPS-only.

## 5. Rollback

Because `/opt/crowdly-backend` is a real git checkout, rollback is:
```bash
cd /opt/crowdly-backend
git reset --hard <previous-good-sha>
npm ci --prefix backend
sudo systemctl restart crowdly-backend
npm run build && rsync -a --delete dist/ /var/www/crowdly/
```
Same sequence the deploy job runs, just pointed at an older commit — worth
scripting as a documented manual fallback even after Phase 2 automates the
happy path, in case CI itself is unavailable.

## 6. Database: local dev data vs. production data

The local Postgres (`crowdly` DB on the dev machine) and the VPS Postgres are,
and remain, **completely separate databases with no sync in either
direction**. Nothing in Phase 1 or Phase 2 changes that — worth stating
explicitly since it's easy to accidentally couple "deploy code" and "deploy
data" once CI is doing both a `git pull` and a service restart.

- **Deploy touches code, never data.** Phase 1's `rsync --delete` and
  `git pull`/`git reset --hard` only ever move `dist/` and source files.
  Neither phase runs `pg_dump`, `psql`, a seed script, or anything else
  against either database. The two Postgres instances stay wherever they
  are, with whatever's in them.
- **The only thing that touches the prod DB on every deploy is the 45
  `ensure*Table()` calls**, because they run on every backend boot
  (`systemctl restart crowdly-backend`) — which Phase 2 triggers on every
  push to `alpha`. That's fine *today* because every one of those functions
  is additive/idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
  EXISTS`. Run against a database with real rows in it, they either no-op
  or safely extend the schema — never touch existing data.
- **Hard constraint going forward**: keep it that way. A schema change that
  is genuinely destructive or data-moving — dropping/renaming a column,
  changing a type, backfilling a new `NOT NULL` — must **not** be added as
  just another line in an `ensure*Table()` function and left to auto-run on
  restart. Once the VPS DB has real user data, that kind of change needs to
  be a one-off: take a `pg_dump` backup first, then run it by hand (or via a
  reviewed one-time script) against the VPS DB specifically, separate from
  the normal deploy flow. Flag this explicitly whenever a future task
  touches the schema in a non-additive way.
- **Local test data never goes to prod.** If prod ever needs sample/QA data,
  it gets created by hand on prod (e.g. registering real test accounts
  through the live site) — never by exporting the local dev DB and
  importing it. The reverse (pulling prod data down to a laptop) is also
  out of scope here — real user data shouldn't casually land on a dev
  machine; if that's ever needed for debugging, it should be a deliberate,
  scoped, one-off decision, not a routine part of this workflow.
- **Backups are not yet in place** and should be, before the VPS DB holds
  real user content that matters: a scheduled `pg_dump` (e.g. nightly cron
  job on the VPS, writing to a path outside both `/var/www/crowdly` and
  `/opt/crowdly-backend` — ideally off-VPS storage entirely, since a backup
  that lives next to the thing it's backing up doesn't survive a disk
  failure). Worth doing as part of Phase 1 (or right after), independent of
  Phase 2's CI/CD work — not blocked on it.

## 7. Open decisions before Phase 2 is implemented

- Exact deploy user / SSH key scoping (new dedicated key vs. reusing `lad`'s).
- Whether `sudo systemctl restart crowdly-backend` should be passwordless
  for the deploy user via a scoped `/etc/sudoers.d/` entry (needed for
  unattended CI — `lad`'s interactive sudo won't work from a GitHub Actions
  runner).
- Whether lint/typecheck failures should block deploy (recommended: yes).
- Prod DB backup destination and cadence (e.g. nightly `pg_dump` to Hostinger
  object storage / S3-compatible bucket vs. some other off-VPS target) —
  needs deciding before real user data accumulates, not blocking Phase 2.
