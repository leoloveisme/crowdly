# Crowdly for Android (`apps/android`)

The native Android app: native Kotlin with Jetpack Compose. It covers the same features as the web app (`apps/web`) and talks to the same backend and routes as the platform, the web app and the desktop app.

## Build and run

You need the Android SDK (`~/Library/Android/sdk`) and a JDK 17+. Android Studio's bundled one works:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd apps/android
./gradlew :core:test                 # file formats, branch sync, folder sync rules (JVM)
./gradlew :app:lintDebug             # Android lint
./gradlew :app:installDebug          # build and install on a connected phone or emulator
python3 scripts/check-translations.py   # run from the repo root: every interface string is in the seed
```

**Which backend:**
- Both debug and release builds talk to the production API, **`https://api.crowdly.cloud`** (see below).
- For a local backend, pass its address: `./gradlew :app:installDebug -Pcrowdly.server=http://10.0.2.2:4000` (the Mac, seen from the emulator). On a phone, use the Mac's LAN address, or `adb reverse tcp:4000 tcp:4000` with `http://localhost:4000`.
- The address can also be changed on the sign-in screen and in Settings. The "Open the platform" links follow it: `api.<domain>` → `<domain>`, and `:4000` → `:8080`.

### The production API host: api.crowdly.cloud

crowdly.cloud's nginx forwards only some paths to the backend. Several paths the app uses (`/library`, `/shelves`, `/discover`, `/crdt`, `/crdt-sync`, `/reading`, `/me`) aren't among them, and some are also web pages. So the app uses its own host that proxies everything to the same `crowdly-backend`. This is the same pattern as the web app's `api.<app domain>` (`Web_app_deploy.md` §4). One-time setup on the VPS:

```
# DNS: A record api.crowdly.cloud → the VPS (same IP as crowdly.cloud)
sudo certbot --nginx -d api.crowdly.cloud

# /etc/nginx/sites-available/api.crowdly.cloud
server {
    server_name api.crowdly.cloud;
    client_max_body_size 300m;          # comic pages, audiobooks, library uploads
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;     # /crdt-sync WebSocket (live co-editing)
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
    # certbot adds the listen 443 ssl / certificate lines
}

sudo ln -s /etc/nginx/sites-available/api.crowdly.cloud /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl -s https://api.crowdly.cloud/health
```

**Until the deploy:** production must also run the bearer-token sign-in (commit `2e5fc8ef`, on `dev` until it's merged into `alpha`). Before that, sign-in in the app says "This server doesn't support the Android app yet". Before the DNS record exists, it says the server can't be reached.

## Sign-in

`POST /auth/login` with `client: "android"` returns the session token. The app sends it as `Authorization: Bearer <token>` (`backend/src/sessions.js` `sessionTokenFrom`) and keeps it encrypted with an Android Keystore key. See `docs/mobile-crdt-spec.md` §5.

## Layout

| Module / package | What it holds |
|---|---|
| `core` (pure Kotlin, JVM tests) | `formats/`: `.story/.screenplay/.comic/.master` parsers and writers, a port of `apps/web/src/formats`. `sync/`: branch sync (port of `apps/desktop/src/editor/branch_sync.py`) and the folder-sync rules. `text/`: Markdown blocks, word diff, the 25 revision-compare layouts. `export/`: HTML, text, Fountain, FDX. |
| `app/net` | `Api` (OkHttp, bearer token, offline outbox, `getCached` for offline reads) and lenient JSON readers |
| `app/data` | `Repo` (every route, mirroring `apps/web/src/lib`), `Discovery` (library, shelves, reading data), `WorkIo` (works ⇄ format docs, export), `Session`, `Prefs`, `Db` (SQLite: outbox, cache, per-file sync state), `Outbox` |
| `app/sync` | `Syncer` (folder ⇄ Space sync; file ⇄ Crowdly work sync), `LocalFiles` (Storage Access Framework), `OutboxWorker` (WorkManager), `LiveSession` (live co-editing) |
| `app/i18n` | `AppText` / `tr`: translatable interface text under page key `/__android__`; translators long-press labels to translate them |
| `app/reader` | Reader content (works, editions, EPUB, PDF, text, audio), `ReaderAudioService` (background playback) |
| `app/ui` | Compose screens: `create/` (home, story, screenplay, comic editors and their panels), `spaces/`, `discover/`, `reader/`, `local/`, `more/` |
| `live/` | `bridge.ts`, the automerge-repo client for live co-editing, built into `app/src/main/assets/live/bridge.js` by `live/build.sh` |

## Parity with the web app

| Web app (`apps/web`) | Android |
|---|---|
| Creation home: works, Spaces, New, Open by link, Import | Create tab |
| Story editor: chapters, Markdown, autosave, image, branches, comments, review, formats & translations, editions, metadata, "I want to change this", revisions, find/replace, export | Story editor (Markdown with preview; the panels open as sheets) |
| Screenplay editor: scenes, typed elements, Enter → next type, element branches, suggestions, editions, outline | Screenplay editor ("next element" button in the bottom bar) |
| Comic editor: issues, pages, text layers, alternatives, RTL | Comic editor (adds camera capture) |
| Spaces: file tree, file editor, `.master`, GitHub / Drive sync | Spaces screens (the first GitHub / Drive connect opens the platform) |
| Local folder (File System Access API) | Files on this phone (Storage Access Framework), plus "Sync with Crowdly" for single files, like the desktop |
| Discovery, Library, Shelves, Reader | Discover, Library, Shelves tabs, Reader (EPUB, PDF, text, audiobooks in the background) |
| Offline outbox, live co-editing, presence | Same: outbox flushed by WorkManager; live sessions through `LiveSession` |
| Settings, Help, report a bug | More and Settings (bug reports carry source `android`, area `android_app`) |
| Interface translations (`EditableText`) | `AppText`, page key `/__android__`, 406 strings in the seed with ru and de |

## Live co-editing

There is no native Automerge build for Android: automerge-java's arm64 library needs glibc. So `LiveSession` runs the web app's automerge-repo client in a hidden WebView whose page origin is the API server, with the session cookie set, and that page joins `/crdt-sync` like a browser. Details are in `docs/mobile-crdt-spec.md` §8.

To rebuild the bridge after an Automerge upgrade, run `npm ci` at the repo root, then `apps/android/live/build.sh`, and commit `bridge.js`.

## Releases

- **CI:** `.github/workflows/android.yml` runs on pushes to `dev`/`alpha` and on pull requests that touch the app. It runs the tests, lint, the translation check and a debug build, and keeps the APK as an artifact.
- **Release builds:** `.github/workflows/android-release.yml` runs when you push a tag like `android-v0.2.0` or use "Run workflow". It builds the signed APK and the Play Store bundle (`.aab`) and keeps both as artifacts. The version code is the run number, and the version name comes from the tag.
- **Signing:** create an upload keystore once (`keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias crowdly`), then set these repo secrets:
  - `ANDROID_KEYSTORE_BASE64` (from `base64 -i upload.jks`)
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`

  The repo variable `ANDROID_API_URL` overrides the API host release builds use (default `https://api.crowdly.cloud`). Keep the keystore out of the repo (`*.jks` is ignored).
- **Try a release build locally:** `./gradlew :app:assembleRelease -Pcrowdly.debugSignRelease` signs it with the debug key so it installs.

### Play Store checklist

1. Create the app in the Play Console with package `cloud.crowdly.app` and enrol in Play App Signing. Your keystore becomes the upload key.
2. Upload the `.aab` from the release workflow to an internal-testing track first.
3. Store listing: name "Crowdly", short and full description, phone screenshots (the Create, Story editor, Discover and Reader screens), and the icon (`res/drawable/ic_launcher_foreground.xml` on `#1E1B4B`).
4. Privacy policy URL: the platform's privacy page.
5. Data safety:
   - **Collected:** email and account id, plus the user's own content (stories, files, highlights, reading positions).
   - **Shared:** nothing with third parties.
   - **Stored on the phone:** the session token, encrypted.
   - **AI:** if the user connects their own AI provider, AI jobs send that content to it from the server.
6. Content rating questionnaire. Crowdly hosts user-generated content, so answer "users can interact and share content".
7. Permissions to declare:
   - foreground service for media playback (audiobooks);
   - notifications (playback controls).

   The camera is used only through the system camera app, so the app needs no camera permission.

## Rules for changes

- **New screens or text:** use `AppText(id, english)` / `tr(id, english)` with ids `android-…`. Add them with ru and de to `backend/scripts/data/interface-translations.seed.json` (page key `/__android__`), and run `scripts/check-translations.py`. Don't put values computed at runtime inside the English text: concatenate them outside `tr()`.
- **Format or sync changes:** change `:core` together with `apps/web/src/formats` and `apps/desktop`, and keep the shared fixtures passing in all three.
- **New features:** every Crowdly product gets them, including this app (see the cross-product parity rule).
