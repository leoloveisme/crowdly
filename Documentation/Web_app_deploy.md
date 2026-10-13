# Web app (apps/web): build and deploy

The web app is the desktop app in the browser. It is built from `apps/web/`. It shares the platform's toolkit and code from root `src/` through the `@/` alias, and uses the root `node_modules`, so it has no dependencies of its own.

It is served in two places:

| URL | Built with | Web root on the VPS | Talks to the API at |
|---|---|---|---|
| `https://crowdly.cloud/editor/` | `npm run build --prefix apps/web` (base `/editor/`) | `/var/www/crowdly/editor/` (inside the platform's web root) | the same origin |
| `https://editor.crowdly.cloud/` | `EDITOR_BASE=/ VITE_API_BASE_URL=https://crowdly.cloud` | `/var/www/crowdly-editor/` | `https://crowdly.cloud` (cross-origin, same site) |

Both builds are made by `.github/workflows/deploy.yml` on every push to `alpha`. The subdomain build and its rsync only run once the GitHub repo variable `EDITOR_SUBDOMAIN_ENABLED` is set to `true`.

## One-time VPS setup

### 1. nginx: `/editor/` SPA fallback (crowdly.cloud server block)
Add this location, otherwise deep links like `/editor/story/…` fall through to the platform's `index.html`:

```nginx
location /editor/ {
    try_files $uri $uri/ /editor/index.html;
}
# Service worker must not be cached, so updates reach users promptly.
location = /editor/sw.js {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}
```

### 2. editor.crowdly.cloud (when you want the subdomain)
- Point a DNS A record at the VPS, then run `sudo certbot --nginx -d editor.crowdly.cloud`.
- Create the web root, writable by the deploy user's group:
  ```
  sudo mkdir -p /var/www/crowdly-editor && sudo chown deploy:devs /var/www/crowdly-editor
  ```
- Add an nginx server block:
  ```nginx
  server {
      server_name editor.crowdly.cloud;
      root /var/www/crowdly-editor;
      location / { try_files $uri $uri/ /index.html; }
      location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
      # listen 443 ssl … (added by certbot)
  }
  ```
- Backend: add the origin to `CORS_ORIGINS` in `/opt/crowdly-backend/backend/.env`, for example `CORS_ORIGINS=https://crowdly.cloud,https://www.crowdly.cloud,https://editor.crowdly.cloud`. Then run `sudo systemctl restart crowdly-backend`.
- GitHub → Settings → Variables: set `EDITOR_SUBDOMAIN_ENABLED=true`.

### Why login just works on both
The session cookie (`crowdly_session`, `SameSite=Lax`) belongs to `crowdly.cloud`.
- `crowdly.cloud/editor` is the same origin, so the cookie is simply sent.
- `editor.crowdly.cloud` sends credentialed requests to `crowdly.cloud`. Both are the same *site*, so browsers still send a Lax cookie with them, including the `/crdt-sync` WebSocket.

### Later: a separate domain or VPS (still to be decided)
A different registrable domain would be cross-site, so a Lax cookie would stop being sent. That would need either `SameSite=None; Secure` plus a CSRF token, or token-based auth for the web app (the mobile CRDT spec already mentions token auth for native clients).

## Local development

```bash
npm ci                      # at the repo root — installs everything
npm run dev --prefix backend
npm run dev --prefix apps/web   # http://localhost:5173/editor/
```
The dev server proxies every non-`/editor` path (the API and the `/crdt-sync` WebSocket) to `localhost:4000`. Cookies are per host, not per port, so a login on the platform at `:8080` also works here.
