# Enhancement of the desktop app v8: where the desktop downloads live on the VPS

> Approved 2026-10-04.

## Context

`crowdly_discovery.app` and `crowdly_creation.app` exist only on the Mac, in `apps/desktop/dist/`. The `/software` page shows "Download - coming soon" because `DESKTOP_DOWNLOADS` in `src/pages/CrowdlySoftware.tsx` is `null`. The user wants a VPS location that a deploy script can fill.

Three facts decide the answer:

1. **The web root is not an option.** `deploy.yml` runs `rsync -az --delete dist/ …:/var/www/crowdly/` on every push to `alpha`. Anything uploaded into `/var/www/crowdly` would be deleted by the next deploy.
2. **A `.app` is a folder.** It can't be downloaded as-is; it has to be packed into one file (`.zip` or `.dmg`).
3. **The Linux runner can't build Mac apps.** The existing deploy job runs on `ubuntu-latest`, and PyInstaller can't build a macOS app there. It needs a macOS runner, and a ~612 MB build shouldn't run on every web deploy.

## Recommendation

### Path on the VPS: `/var/www/crowdly-downloads/`
- It sits next to the web root, not inside it, so `rsync --delete` never touches it.
- The same `deploy` user can write to it (owner `deploy`, group `devs`, as for `/var/www/crowdly`).
- Layout, with one folder per version and stable "latest" names for the website:
  ```
  /var/www/crowdly-downloads/desktop/
    0.1.0/crowdly-discovery-0.1.0-macos-arm64.zip
    0.1.0/crowdly-creation-0.1.0-macos-arm64.zip
    0.1.0/SHA256SUMS
    crowdly-discovery-macos-arm64.zip  -> 0.1.0/…   (symlink, switched after upload)
    crowdly-creation-macos-arm64.zip   -> 0.1.0/…
  ```
- Public URLs:
  - `https://crowdly.cloud/downloads/desktop/crowdly-discovery-macos-arm64.zip`
  - `https://crowdly.cloud/downloads/desktop/crowdly-creation-macos-arm64.zip`

  The `-macos-arm64` suffix leaves room for Intel Mac, Windows and Linux builds later.
- **nginx (one-time, by hand, with sudo):**
  ```nginx
  location /downloads/ {
      alias /var/www/crowdly-downloads/;
      autoindex off;
      add_header Cache-Control "public, max-age=300";
      add_header X-Content-Type-Options nosniff;
  }
  ```
  No React route uses `/downloads`, so there is no clash with the SPA fallback.

### Packaging
- Use `ditto -c -k --keepParent crowdly_discovery.app crowdly-discovery-0.1.0-macos-arm64.zip`. `ditto` keeps the app's symlinks and signature; a plain `zip` breaks them. A `.dmg` can come later.
- **Note:** the apps are only ad-hoc signed and not notarized. A copy downloaded from the web shows "can't be opened" or "damaged" in macOS. Testers need right-click → Open, or `xattr -dr com.apple.quarantine`. Notarization needs an Apple Developer account and is a separate step; until then the `/software` page says this next to the button.

### Deploy script: new workflow `.github/workflows/desktop-release.yml`
- **Trigger:** a `desktop-v*` tag (e.g. `desktop-v0.1.0`) or a manual "Run workflow". It does not run on every `alpha` push.
- **Runner:** `macos-14` (Apple Silicon).
- **Steps:**
  1. Set up Python 3.12 and `pip install -e apps/desktop pyinstaller`.
  2. `apps/desktop/build-downloads.sh`, which builds both apps and compiles the `.qm` files.
  3. Rename to `crowdly_discovery.app` / `crowdly_creation.app`, then `ditto` both into zips and write `SHA256SUMS`.
  4. Use the same secrets and the same SSH-key steps as `deploy.yml` (`VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_PORT`).
  5. `rsync` into `/var/www/crowdly-downloads/desktop/<version>/`. The version comes from `apps/desktop/pyproject.toml`.
  6. Over SSH, switch the two "latest" symlinks with `ln -sfn`, then `curl -fsSI` both public URLs as a health check.
- **Same script locally:** a small `apps/desktop/upload-downloads.sh` does steps 3, 5 and 6, so a build made on the Mac can be uploaded by hand. The workflow calls this script too, so the logic lives in one place.

### Website
- In `CrowdlySoftware.tsx`, set `DESKTOP_DOWNLOADS` to the two stable `/downloads/desktop/…` URLs, so the buttons never need changing per version.
- Add an `EditableText` note about right-click → Open for macOS, plus seed entries (en/ru/de) in `interface-translations.seed.json`.
- Ships with the next `alpha` deploy.

### Docs
- Update item 5 of `To_be_done_on_VPS.md` with these steps:
  - `sudo mkdir -p /var/www/crowdly-downloads/desktop`
  - `sudo chown -R deploy:devs …` and `chmod 2775`
  - add the nginx `location`, then `sudo nginx -t && sudo systemctl reload nginx`
  - include the folder in backups (optional; builds can be rebuilt)

## Critical files
- new: `.github/workflows/desktop-release.yml`, `apps/desktop/upload-downloads.sh`
- `apps/desktop/build-downloads.sh` (reused unchanged)
- `src/pages/CrowdlySoftware.tsx`, `backend/scripts/data/interface-translations.seed.json`
- `To_be_done_on_VPS.md`

## Verification
1. **On the VPS (one-time, user):** create the folder and add the nginx block. Check that `curl -I https://crowdly.cloud/downloads/` returns 403/404, not the SPA's `index.html`.
2. **Locally:** `./upload-downloads.sh` uploads the builds already in `dist/`. Both `/downloads/desktop/…zip` URLs return 200 with `Content-Type: application/zip`, and the `SHA256SUMS` match.
3. **Mac check:** download one zip, unzip it, `codesign --verify --deep` passes, and it opens with right-click → Open.
4. **Workflow:** push the tag `desktop-v0.1.0`. The run builds, uploads and health-checks; then make sure the normal `alpha` deploy still leaves `/var/www/crowdly-downloads` untouched.
5. **Web page:** after the next `alpha` deploy, the `/software` Download buttons work.
