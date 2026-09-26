# Deploy artifacts

Draft artifacts for Phase 1 and Phase 2 of `deploy strategy for Crowdly
VPS.md` (repo root). Everything in this folder is inert — nothing here
runs, is referenced by the app, or is picked up by GitHub automatically.
It's here to be read and reviewed before any of it is adopted.

## What's in here

- **`github-actions-deploy.yml`** — the Phase 2 CI/CD workflow. Only takes
  effect once moved to `.github/workflows/` in the repo, and only after the
  prerequisites listed at the top of the file exist on the VPS (restructured
  paths, a dedicated deploy SSH key, passwordless sudo for the restart, and
  four repo secrets).
- **`nginx-crowdly.cloud.conf`** — the Phase 1 target-state nginx config:
  web root serving only the built frontend, API requests proxied to the
  backend by path prefix, generated from the actual route list in
  `vite.config.ts` / `backend/src/server.js` rather than from memory of the
  old config. Meant to be diffed against, not blindly copied over, the real
  `/etc/nginx/sites-available/crowdly.cloud`.
- **`crowdly-backend.service`** — the Phase 1 target-state systemd unit,
  pointed at `/opt/crowdly-backend/backend` instead of
  `/var/www/crowdly/backend`. Same caveat: reconcile against the live unit
  file rather than overwriting it, since this is reconstructed from what we
  confirmed via `systemctl status`, not a verified full copy.

## Sequencing

These assume Phase 1 (the one-time VPS restructure) happens first, by hand,
following the runbook in the strategy doc — none of this is meant to skip
that. Once Phase 1 is live and confirmed working:

1. Diff `nginx-crowdly.cloud.conf` and `crowdly-backend.service` against
   the real files on the VPS; apply just the path changes, keep everything
   else the live files already have.
2. Set up the four things Phase 2 needs (see the comment block at the top
   of `github-actions-deploy.yml`): dedicated deploy key, scoped
   passwordless sudo, repo secrets.
3. Only then move `github-actions-deploy.yml` into
   `.github/workflows/deploy.yml` — that's the one action that actually
   turns any of this on.

## The scoped sudoers line Phase 2 needs

CI can't type a sudo password interactively, so the deploy user needs to
run exactly one command passwordless — nothing broader. As root on the VPS
(`visudo -f /etc/sudoers.d/crowdly-deploy`), replace `deployuser` with
whatever the actual `VPS_USER` secret ends up being:

```
deployuser ALL=(root) NOPASSWD: /usr/bin/systemctl restart crowdly-backend
```

That's the entire privilege being granted — restart that one service, no
other sudo access.

## Still open (from Section 7 of the strategy doc)

- Whether the deploy user is a new dedicated account or reuses `lad`.
- Whether lint/typecheck failures should block deploy — the workflow here
  assumes yes (both run before the deploy job can start).
- Prod DB backup cadence/destination — unrelated to these files, doesn't
  block adopting them, but worth doing before real user data piles up.
