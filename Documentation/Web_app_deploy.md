# Web app (apps/web): build and deploy

The web app is the Crowdly desktop app in the browser. It is a **stand-alone app at the root of its own domain**, called `<app domain>` below (for example `crowdlyapp.app`). It is never served under crowdly.cloud.

It talks to the shared Crowdly backend at **`api.<app domain>`**: an nginx server block on the VPS that proxies to the same backend crowdly.cloud uses. The domain isn't decided yet. It's a single GitHub repo variable, `WEBAPP_DOMAIN`, and nothing in the code depends on it.

| | URL | Served from |
|---|---|---|
| The app | `https://<app domain>/` | `/var/www/crowdly-webapp/` (static build) |
| Its API | `https://api.<app domain>/` | nginx → `http://127.0.0.1:4000` (the same `crowdly-backend` service) |
| The platform (unchanged) | `https://crowdly.cloud/` | `/var/www/crowdly/` and the same backend |

**Build:** `apps/web` reuses the platform's code from root `src/` (the `@/` alias) and the root `node_modules`, so it has no dependencies of its own. `.github/workflows/deploy.yml` builds it on every push to `alpha` with:

- `VITE_API_BASE_URL=https://api.<WEBAPP_DOMAIN>`
- `VITE_PLATFORM_URL=https://crowdly.cloud`

It is then rsynced to `/var/www/crowdly-webapp/`. **That deploy step is skipped while `WEBAPP_DOMAIN` is empty**, so nothing goes live until the steps below are done.

## One-time setup once the domain is chosen

### 1. DNS and certificates
Point A records for **both** `<app domain>` and `api.<app domain>` at the VPS. Then run:
```
sudo certbot --nginx -d <app domain> -d api.<app domain>
```

### 2. Web root
```
sudo mkdir -p /var/www/crowdly-webapp && sudo chown deploy:devs /var/www/crowdly-webapp
```

### 3. nginx: the app (`/etc/nginx/sites-available/<app domain>`)
```nginx
server {
    server_name <app domain>;
    root /var/www/crowdly-webapp;

    # Single-page app: every route is index.html.
    location / { try_files $uri $uri/ /index.html; }

    # Always revalidate the shell and the service worker so updates reach
    # people promptly (assets/ are content-hashed and can be cached).
    location = /index.html { add_header Cache-Control "no-cache"; }
    location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }

    # listen 443 ssl … (added by certbot)
}
```

### 4. nginx: its API (`/etc/nginx/sites-available/api.<app domain>`)
```nginx
server {
    server_name api.<app domain>;

    # Library books can be large (backend LIBRARY_MAX_FILE_BYTES, 300 MB).
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        # Live co-editing WebSocket (/crdt-sync).
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;  # keep idle co-editing sockets open
    }

    # listen 443 ssl … (added by certbot)
}
```
Enable both blocks (`ln -s` into `sites-enabled`), then run `sudo nginx -t && sudo systemctl reload nginx`.

### 5. Backend
Add the app's origin to `CORS_ORIGINS` in `/opt/crowdly-backend/backend/.env`, alongside the existing entries:
```
CORS_ORIGINS=https://crowdly.cloud,https://www.crowdly.cloud,https://<app domain>
```
Then run `sudo systemctl restart crowdly-backend`.

### 6. Turn on deploys
In GitHub, go to Settings → Variables and set `WEBAPP_DOMAIN=<app domain>`. Then push to `alpha`, or re-run the last deploy.

## How sign-in works
- The session cookie (`crowdly_session`, `SameSite=Lax`, `Secure`) is set by `api.<app domain>` when you log in on the web app.
- The app at `<app domain>` and its API at `api.<app domain>` are the same *site*. Browsers therefore send that cookie with the app's API calls, images and the `/crdt-sync` WebSocket. No backend auth changes are needed.
- Sign-in is **per domain**. crowdly.cloud and the web app each have their own session, with the same account.
- **Google Drive and GitHub:** connecting a Space for the first time still starts and finishes on crowdly.cloud, because the OAuth and GitHub App callbacks point there. The web app's sync panels link there for that step; after it, everything works in the web app.
- **If the API ever moves to a different registrable domain** (for example its own VPS under another name), a Lax cookie would stop being sent. That move needs either `SameSite=None; Secure` plus CSRF protection, or token-based auth. Not built yet.

## Local development
```bash
npm ci                          # at the repo root — installs everything
npm run dev --prefix backend    # API on :4000
npm run dev --prefix apps/web   # http://localhost:5173/
```
- The dev server serves the app at `/` and proxies everything else to the backend, so API calls are same-origin, as in the platform's dev setup.
- Page loads (`Accept: text/html`) always get the app, because some app routes share a path with API routes (`/shelves`).
- To use a different backend, set `WEBAPP_API_TARGET=http://localhost:4001`.
- Cookies are per host, not per port, so a login on the platform at `:8080` also works here.

## Checks
- `npm run typecheck --prefix apps/web`
- `npx eslint apps/web`
- `node apps/web/scripts/test-formats.ts`: the `.story`/`.screenplay`/`.comic`/`.master` parsers against the fixtures shared with the desktop app. It needs Node 22+.

## Moving to a separate VPS
If the web app or its API ever moves off the platform VPS, read `Data_sync_platform_webapp_separate_VPSes.md` first. It sets out the staged path and what has to change at each stage.
