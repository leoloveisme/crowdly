# Google Drive: OAuth setup (web platform + desktop app)

Crowdly connects to Google Drive in two independent ways:


|                 |Web platform                                                   |Desktop app                                                                   |
|-----------------|---------------------------------------------------------------|------------------------------------------------------------------------------|
|Who connects     |The owner of an existing Space on the platform                 |Anyone with a local Space (no Crowdly login needed)                           |
|OAuth client type|**Web application**                                            |**Desktop app**                                                               |
|Where tokens live|Backend DB, encrypted (`google_drive_accounts`)                |macOS Keychain (service "Crowdly Google Drive")                               |
|Who runs the sync|Backend (`backend/src/googleDriveSync.js`), webhook + 20-min poll|The app (`apps/desktop/src/editor/gdrive/`), every 60 s while open + after saves|

In both cases, one Drive folder **and all its subfolders** maps to one Space, and
each Space can use a different folder. If both sides changed a text file, it's
merged line by line against the last synced version. Overlapping edits and
binary files keep the Crowdly/local version, and Drive's version is saved next
to it as `name (conflict from Google Drive YYYY-MM-DD).ext`.

Both clients live in the **same Google Cloud project** and share the same consent
screen.

## 1\. Google Cloud project and Drive API

1.  Open <https://console.cloud.google.com/> and create a project, e.g.
    "Crowdly" (or pick an existing one).
2.  **APIs & Services → Library** → search for **Google Drive API** → **Enable**.

## 2\. OAuth consent screen

**APIs & Services → OAuth consent screen** (in the newer console: **Google Auth
Platform → Branding / Audience / Data access**):

1.  User type **External**. Leave the publishing status on **Testing**.
2.  App name **Crowdly**. Enter your email as the user support email and the
    developer contact.
3.  **Scopes / Data access**, add: - `https://www.googleapis.com/auth/drive`
    (restricted: "See, edit, create, and delete all of your Google Drive
    files") - `openid` \- `.../auth/userinfo.email`
4.  **Test users / Audience**: add your own Google address and every tester's
    address (up to 100). While in Testing mode, only these accounts can
    connect. Anyone else gets "Access blocked".

> In Testing mode Google expires refresh tokens after **7 days**, so you'll have
> to reconnect weekly. That goes away once the app is verified (step 7).

## 3\. Web application client (backend)

**APIs & Services → Credentials → Create credentials → OAuth client ID**:

- Application type: **Web application**, name "Crowdly web".
- **Authorized redirect URIs**:
- `http://localhost:4000/api/google-drive/oauth/callback` (local dev)
- `https://\<your production backend host>/api/google-drive/oauth/callback`

Copy the client ID and secret into `backend/.env` locally, and into the VPS
backend `.env`:

```
GOOGLE_OAUTH_CLIENT_ID=<client id>

GOOGLE_OAUTH_CLIENT_SECRET=<client secret>

GOOGLE_TOKEN_ENCRYPTION_KEY=<output of: openssl rand -base64 32>

BACKEND_BASE_URL=http://localhost:4000          # prod: https://<backend host>

FRONTEND_BASE_URL=http://localhost:8080         # prod: https://<frontend host>


```
- Use a **different** `GOOGLE_TOKEN_ENCRYPTION_KEY` for local and for production.
- Never change it once accounts are connected: stored tokens can't be decrypted
  with a new key, so users would have to reconnect.
- Restart the backend afterwards.

Push notifications from Drive (the webhook) only work when `BACKEND_BASE_URL` is
a public **HTTPS** URL. Locally, changes arrive through the 20-minute poll or the **
Sync now** button.

## 4\. Desktop app client

**Credentials → Create credentials → OAuth client ID**:

- Application type: **Desktop app**, name "Crowdly desktop". No redirect URI is
  needed, because the app uses a loopback address (`http://127.0.0.1:\<random
  port>`) with PKCE.
- Download the JSON (or copy the ID and secret) and save it as 
  `apps/desktop/src/editor/google_oauth_client.json`:

```json
{ "client_id": "YOUR-CLIENT-ID.apps.googleusercontent.com", "client_secret": "GOCSPX-YOUR-SECRET" }
```

Paste only the `{ … }` part (not the word `json`), and replace the placeholder values entirely: no `<`, `>` or `\` should be left around your ID and secret.

The downloaded Google format (`{"installed": {...}}`) works as-is too. - The
file is gitignored. The PyInstaller specs bundle it into `Crowdly.app`
automatically when it exists, so **rebuild the app** after adding it. - For
development runs you can instead set the `CROWDLY_GOOGLE_CLIENT_ID` and `
CROWDLY_GOOGLE_CLIENT_SECRET` environment variables.

Google considers a desktop client's secret non-confidential, so shipping it
inside the app is expected. The one-time PKCE code is what protects the sign-in.

## 5\. Using it

**Web:** 1. Open your Space. 2. Click **Connect Google Drive** (or **Use existing
Google Drive connection** if you've connected before) and go through Google
consent. 3. Browse to a folder, or use **Create folder here**, then click **
Connect this folder**. 4. Tick **Sync with Google Drive**.

**Sync now** and **Sync log** are next to the checkbox.

**Desktop:** 1. Make the Space active. 2. Go to **Settings → Connect → Google
Drive**. The browser opens for Google consent. 3. Back in the app, browse to a
folder (or click **New folder…**) and click **Connect this folder**.

The status bar shows `Drive: synced HH:MM`. Also under **Settings → Connect**
you'll find: - **Sync with Google Drive now** \- **Google Drive sync log** \- **
Disconnect Google Drive**, which can also sign you out of Google

Turn sync off without disconnecting via **Settings → Synchronisation with →
online storage → Google Drive**.

## 6\. Troubleshooting

- **"Access blocked: Crowdly has not completed the Google verification process"**
  : the Google account isn't in the test users list (step 2.4).
- `redirect_uri_mismatch` on the web: the redirect URI in step 3 must match `
  \<BACKEND_BASE_URL>/api/google-drive/oauth/callback` character for character.
- **Desktop says Google Drive isn't configured in this build**: `
  google_oauth_client.json` is missing. Add it (step 4) and rebuild.
- **macOS asks whether Crowdly may use the Keychain item**: this happens after a
  rebuild because the build's signature changed. Choose **Always Allow**.
- **Sync stopped after about a week**: in Testing mode refresh tokens expire
  after 7 days. Connect again.

## 7\. Before a public launch

The `drive` scope is **restricted**. To lift the 100-test-user limit and the
7-day token expiry, submit the app for **OAuth verification** (consent screen →
Publish app). Google requires the following, and the security assessment is
done by a third party and is paid: - a privacy policy URL - a homepage - a demo
video - a **security assessment**

The alternative is to switch to the narrower `drive.file` scope. That needs no
assessment, but the app could then only see folders it created itself, or ones
picked through Google's own Picker widget.

