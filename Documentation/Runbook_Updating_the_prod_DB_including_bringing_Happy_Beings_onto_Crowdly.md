# Runbook: Updating the prod DB, including bringing Happy Beings onto Crowdly

## Context

`alpha` is the live prod branch — pushing to it triggers `.github/workflows/deploy.yml`, which rsyncs the built frontend to the VPS and, on the backend, does `git reset --hard origin/alpha` + `systemctl restart crowdly-backend`. There is **no separate migration tool**: schema changes are applied by ~42 idempotent `ensure*Table`/`ensure*Column()` functions in `backend/src/server.js` that run automatically every time the backend boots (i.e., on every deploy).

Right now the working tree has two things entangled together in uncommitted changes to `backend/src/server.js`:
1. A **security fix** — screenplays currently have no visibility check at all on prod (`checkScreenplayAccess`), plus a session-lookup crash-on-malformed-cookie fix in `sessions.js`.
2. The **Creative Space file-storage feature** — new `creativeSpaceFiles.js` router + `storage_path`/`mime_type`/`hash`/`updated_by` columns on `creative_space_items` — which the Happy Beings **backfill** script hard-depends on (it throws without those columns).

Correction to the deploy-strategy doc's claim of "no backups exist": automated backups for all live VPS products, Crowdly included, are actually managed centrally from `/opt/noshamemedia` (repo `leoloveisme/noshamemedia_tech`), separate from this repo's own `deploy/` docs — those docs are just stale on this point. So step 1 below is a verification step, not a from-scratch manual backup.

Per your decision: ship both together in one deploy. The Happy Beings owner account will stay as the script's placeholder (`leolove@example.com`) for now — you'll swap it to a real prod email yourself later, so the import doesn't need to block on that.

## Alternate path: full DB replace instead of running the import scripts on prod

You confirmed: prod's DB is otherwise untouched (no new registrations, no invitations sent/received) since your local dev DB diverged from it, so instead of running the Happy Beings scripts against prod live, you can just replace prod's database wholesale with your local one — which already has everything (full Happy Beings import: 7 stories, 1 screenplay, 541 space items; the `storage_path`/`mime_type`/`hash`/`updated_by` columns already applied; 10 users, all seed/test/admin/translator accounts).

**Caveat found while checking this**: prod is running **PostgreSQL 16.11** (confirmed from the `backup.sql` dump header, which is itself a snapshot already pulled from prod on 2026-09-11 and already contains a pre-existing "Happy Beings" space + file item — a full replace overwrites that too, which you've confirmed is fine). Your local dev DB is **PostgreSQL 18.4**. A dump taken with an 18.4 `pg_dump` isn't officially supported for restoring onto a 16.x server. You chose to upgrade prod to PG18 first rather than downgrade the dump.

### 0. Pre-flight safety check (do this on the VPS, right before cutover)
Since I have no direct access to prod, verify these yourself immediately before proceeding, as close to the cutover as possible:
```bash
sudo -u postgres psql crowdly -c "SELECT count(*) FROM local_users;"
sudo -u postgres psql crowdly -c "SELECT count(*) FROM alpha_invitations;"
sudo -u postgres psql crowdly -c "SELECT max(created_at) FROM local_users;"
```
Compare against what you expect from the point your local DB was last in sync with prod. If anything's changed, stop and reconcile before wiping.

### 1. Confirm/trigger a fresh backup
Via the existing automated backup system (`/opt/noshamemedia`, `leoloveisme/noshamemedia_tech`) — confirm Crowdly is in scope and note where the dump lands. This is your rollback point for both the Postgres upgrade and the DB replace.

### 2. Upgrade prod's PostgreSQL 16 → 18 (run on the VPS; Ubuntu 24.04)
```bash
# Stop the app so nothing writes mid-upgrade
sudo systemctl stop crowdly-backend

# Add the official PostgreSQL apt repo (Ubuntu 24.04's own repos only ship up to PG16)
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt update

# Install PG18 alongside the running PG16 cluster (does not touch it yet)
sudo apt install -y postgresql-18

# Confirm both clusters are registered before upgrading
pg_lsclusters
# expect something like:
#   16  main  5432  online  postgres  ...
#   18  main  5433  online  postgres  ...

# Upgrade the 16 cluster to 18 in place (creates the new cluster from 16's data;
# stops the old cluster on success but does not delete it yet)
sudo pg_upgradecluster 16 main

# Verify
pg_lsclusters
sudo -u postgres psql -c "SELECT version();"
```
`pg_lsclusters` after the upgrade will show the new PG18 cluster — check which port it landed on (commonly 5433, since 5432 was held by the old cluster during upgrade). Once you've confirmed the upgraded data looks right:
```bash
# Remove the now-unused PG16 cluster/packages
sudo pg_dropcluster 16 main   # only if pg_upgradecluster left it registered but stopped
sudo apt purge -y postgresql-16

# If PG18 isn't already on 5432, move it there to match the app's existing DATABASE_URL
sudo pg_conftool 18 main set port 5432
sudo systemctl restart postgresql@18-main
```
Don't start `crowdly-backend` again yet — the DB is about to be replaced anyway in the next step.

### 3. Dump your local DB (on your machine, now PG-version-matched to prod)
```bash
pg_dump "postgres://lad:****@localhost:5432/crowdly" -Fc --no-owner --no-privileges \
  -f ~/crowdly-full-$(date +%Y%m%d-%H%M).dump
scp ~/crowdly-full-*.dump <vps-host>:~/
```
`--no-owner --no-privileges` avoids failures from your local mac role names not existing on the VPS.

### 4. Full replace on prod (on the VPS)
```bash
sudo -u postgres dropdb crowdly
sudo -u postgres createdb crowdly -O lad
sudo -u postgres pg_restore -d crowdly --no-owner --no-privileges ~/crowdly-full-*.dump
```
(Adjust the DB owner role `lad` if prod uses a different one — check `backend/.env`'s `DATABASE_URL` on the VPS.)

### 5. Deploy the pending code so it matches the data you just restored
The restored DB already has the `storage_path` etc. columns, but prod is still running the *old* backend code, which doesn't know about the new `creativeSpaceFiles.js` router or the screenplay-privacy fix. Push the commit from step 2 of the original plan (below) to `alpha` so `deploy.yml` ships it, or if it's already pushed, just:
```bash
sudo systemctl start crowdly-backend
curl -f http://127.0.0.1:4000/health
```

### 6. Verify
- Happy Beings space and its stories/screenplay load correctly on the live site.
- A private/unlisted screenplay correctly 403s for a logged-out/unrelated user.
- `local_users`/`alpha_invitations` counts on prod now match your local source exactly.
- Tail `journalctl -u crowdly-backend -f` briefly for errors.

## Original path: run the import scripts against prod directly (kept for reference)

### 1. Confirm the existing automated backup covers Crowdly, then trigger/verify a fresh one
Automated backups already run from `/opt/noshamemedia` (`leoloveisme/noshamemedia_tech`) for all live VPS products. Before touching prod:
- Check that repo's backup job/config to confirm the Crowdly Postgres DB is in scope (not just the other products) and note where dumps land (local path and/or off-box destination).
- Trigger (or just confirm the schedule will catch) a fresh backup dated right before this change, so you have a clean rollback point — `git reset --hard <prev-sha>` only rolls back code, not data.
- If for any reason Crowdly turns out not to be covered by that job, fall back to a manual one-off: `pg_dump "$DATABASE_URL" -Fc -f ~/backups/crowdly-$(date +%Y%m%d-%H%M).dump`.

### 2. Commit the entangled changes as one deploy
On a branch off current `alpha` (or directly if that's your workflow), stage and commit:
- `backend/src/server.js` (security fix + Space router registration + `storage_path` column)
- `backend/src/sessions.js`
- `src/modules/screenplay template.tsx`
- `src/pages/CreativeSpacePage.tsx`
- `backend/src/creativeSpaceFiles.js` (currently untracked — must be added, it's what `server.js` imports)
- `backend/package.json` (happybeings npm scripts)
- the new `backend/scripts/*happybeings*` + `backend/scripts/lib/happybeingsSource.js` files

Push to `alpha`. `deploy.yml` builds, rsyncs the frontend, and restarts `crowdly-backend` on the VPS.

### 3. Let the ensure-functions apply schema on restart
No manual `ALTER TABLE` needed — `ensureCreativeSpaceItemsTable()` (and whatever ensure-function `creativeSpaceFiles.js` adds for `mime_type`/`hash`/`updated_by`) runs automatically on the backend's boot, which the deploy already triggers. Confirm it worked:
```
curl -f http://127.0.0.1:4000/health   # on the VPS — deploy.yml already does this post-deploy
```
Then spot-check the column landed:
```
psql "$DATABASE_URL" -c "\d creative_space_items"
```

### 4. Create the prerequisite prod rows
The scripts don't create the owning user or the Space itself:
- Confirm/create the `local_users` row for `leolove@example.com` (or whatever the account ends up being — the import script warns but proceeds even without a Space, but the **backfill** script throws if the Space row is missing).
- Create the "Happy Beings" `creative_spaces` row **through the app itself** (UI or its API), not raw SQL — that keeps its id/defaults consistent with how the rest of the app expects a Space to look.

### 5. Run the scripts on the VPS itself, in this order
Run these **on the VPS**, from `/opt/crowdly-backend/backend`, so they use the real prod `.env`/`DATABASE_URL` and hit the already-running local backend rather than crossing the network:

```
# Phase 0 — read-only sanity check
npm run audit-happybeings -- --email leolove@example.com --space "Happy Beings"

# Phase 1 — actually create story/screenplay titles via the HTTP API (idempotent, skips existing titles)
npm run import-happybeings -- --apply --email leolove@example.com --space "Happy Beings" --base-url http://127.0.0.1:4000

# Phase 2 — structural QA of what just got imported
npm run review-happybeings -- --email leolove@example.com --space "Happy Beings"

# Part B — attach real file bytes into creative_space_items (needs step 3's columns)
node scripts/backfill-happybeings-space-content.js --apply --email leolove@example.com --space "Happy Beings"
```

Notes:
- `import-happybeings.js` talks to GitHub's **unauthenticated** REST API (`leoloveisme/happybeings` repo) — watch for rate-limit errors on a large import; re-running is safe since it skips titles that already exist.
- None of these scripts use DB transactions — a mid-run failure just leaves a partial import, which is naturally resumable (re-run skips what's already there).
- Always dry-run first (omit `--apply`) to preview before touching prod state.

### 6. Manually publish
There's no `publish-happybeings.js` — `review-happybeings-import.js` explicitly expects this to be a manual step. For each story/screenplay that passed review, flip `visibility`/`published` via the existing Story/Screenplay settings UI or the corresponding `PATCH` endpoint.

### 7. Verify end-to-end
- Load the Happy Beings Space page and a couple of imported stories/screenplays on the live site.
- Confirm a private/unlisted screenplay now correctly 403s for a logged-out or unrelated user (the security fix from step 2).
- Tail `journalctl -u crowdly-backend -f` briefly during/after the import for unexpected errors.
- Re-run `audit-happybeings-space.js` (read-only) afterward as a final confirmation of end state.

## Note
`deploy/deploy strategy for Crowdly VPS.md` §6 says backups "are not yet in place" — that's outdated. Worth a follow-up edit to that doc so it doesn't mislead the next person, but not a blocker here.
