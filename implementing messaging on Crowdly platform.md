# Implementing messaging on Crowdly

Plan for enabling friend requests and user-to-user messaging on Crowdly, with live
(push) UI in the header. Drafted by comparing against the Shameless project, which
already has a working like → mutual-match → gated-conversation pattern.

## Concept mapping (Shameless → Crowdly)

Shameless splits "can I message you" into two layers: anonymous one-sided intent
(`swipes`) and a revealed mutual state (`matches`), because a swipe shouldn't be
visible until it's reciprocated. Friend requests on Crowdly don't need that
anonymity — the addressee is meant to see who asked immediately — so this collapses
into one table with a status, closer to GitHub follow requests than Tinder swipes.

| Shameless | Crowdly equivalent | Why it differs |
|---|---|---|
| `swipes` (like/pass, one row per pair) | `friend_requests` (pending/accepted/declined) | No need to hide the request from the recipient, so no separate anonymous layer |
| `matches` (mutual, normalized pair) | *(folded into `friend_requests.status = 'accepted'`)* | One table can serve both "pending request" and "current friendship" — simpler, and "leaving undecided" is just not calling accept/decline, no extra state needed |
| `conversations` (lazy, gated by match) | `conversations` (lazy, gated by accepted friendship) | Same pattern, reused as-is |
| `messages`, `message_revisions` | `messages` (skip revisions for v1) | Edit history is a nice-to-have Shameless added later; not core to "enable messaging" |
| `conversation_reads` | `conversation_reads` | Reused as-is — directly answers the header's fake `messageCount` |
| *(none)* | `notifications` | New — generic feed for "X sent you a request" / "X accepted" so the bell isn't message-specific |
| *(none)* | `sessions` | New — required because Crowdly has no server-verified identity today |

The existing `"friends" | "selected"` visibility enum already sitting unused in
`src/pages/Profile.tsx` and `src/pages/PublicProfile.tsx` (`// TODO: once a
friends/relationship graph exists...`, around line 166 of `PublicProfile.tsx`)
becomes real once `friend_requests` exists — worth wiring as a fast follow, not
blocking.

## Pre-existing gap this plan addresses

Crowdly's backend has no server-side session/token verification today — routes
like `/auth/change-password` trust a `userId` passed directly in the request body.
For a friends/messaging feature that means, as built, anyone could spoof another
user's ID to send requests or messages as them. This plan adds a minimal
server-verified session as part of the work (see "Session auth" below) rather than
deferring it, since messaging raises the stakes of that gap considerably.

## New tables

Added as `ensureXTable()` calls in `backend/src/server.js`, matching the existing
`admin_messages` pattern already in that file.

```sql
-- Server-verified identity. Cookie-based (httpOnly, SameSite) so an
-- EventSource (SSE) connection can authenticate without custom headers.
sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references local_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
)

friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references local_users(id) on delete cascade,
  addressee_id uuid not null references local_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id != addressee_id)
)
-- unique on (least(requester_id,addressee_id), greatest(...)) so a request
-- can't exist in both directions at once — mirrors Shameless's matches
-- normalization trick, applied here to prevent duplicate/crossed requests.

conversations (
  id uuid primary key default gen_random_uuid(),
  friend_request_id uuid not null unique references friend_requests(id) on delete cascade,
  created_at timestamptz not null default now()
)

messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references local_users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
)

conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references local_users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
)

notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references local_users(id) on delete cascade,
  type text not null check (type in ('friend_request','friend_accept','message')),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
)
```

A `messages` insert is only valid when its conversation's `friend_requests.status =
'accepted'` — enforced in the route handler, same as Shameless gates on `matches`.

## Session auth

Right now `signIn` in `src/contexts/AuthContext.tsx` just stores the login response
in `localStorage`; the backend never re-verifies who's making a request. Minimum
viable fix:

- `POST /auth/login` also sets `Set-Cookie: session=<token>; HttpOnly; Secure;
  SameSite=Lax` (from the new `sessions` table), in addition to the existing JSON
  response the frontend already stores. `token` is `gen_random_uuid()` (122 bits
  of randomness) — acceptable entropy for a session identifier.
- `POST /auth/logout` deletes the row from `sessions` server-side (not just
  clearing the cookie client-side) so a stolen cookie can be invalidated.
- Sessions carry both an absolute expiry (`expires_at`, e.g. 30 days) and are
  pruned/rejected if idle past a shorter window (e.g. 7 days since last use) —
  checked in `requireAuth`.
- A small `requireAuth` Express middleware reads the cookie, looks up `sessions`,
  attaches `req.user`, 401s otherwise. Applied to every new friend/message/
  notification route.
- `app.use(cors())` needs `{ origin: <vite dev origin / prod origin>, credentials:
  true }` — currently wildcard with no credentials, which would silently drop the
  cookie. Origin must be an explicit allowlist, not `*`.
- Frontend fetches for the new endpoints need `credentials: 'include'`.
- Scope: only the *new* routes require this. Not retrofitting the rest of the
  8,000-line `server.js` — that's a much bigger, separate effort worth doing later
  but out of scope here.

## Live delivery: Server-Sent Events

Implemented as SSE, not a full WebSocket, because the only thing that needs to be
pushed is notification/message arrival — one direction, server → client. SSE runs
over plain HTTP (`GET /events`, `Content-Type: text/event-stream`), authenticates
via the same session cookie for free, needs no new dependency (no `socket.io`), and
degrades trivially (reconnect = new GET). A WebSocket would only pay for itself if
Crowdly later wants bidirectional live features (typing indicators, presence) —
easy to swap to later without touching the data model.

Backend keeps an in-memory map of `userId -> response stream` per connection; on
`POST /friends/requests`, `.../accept`, or `POST /messages`, it writes an event to
the recipient's open stream(s) if connected, in addition to the row landing in
`notifications`/`messages` (so a disconnected client still sees it on next load).

## Backend API surface

New Express routes, following the existing inline-in-`server.js` style:

```
POST   /friends/requests            { addresseeId }
GET    /friends/requests             -> { incoming: [...], outgoing: [...] }
POST   /friends/requests/:id/accept
POST   /friends/requests/:id/decline
DELETE /friends/requests/:id         (cancel an outgoing pending request)
DELETE /friends/:userId              (unfriend — sets status back to declined, keeps row for audit)
GET    /friends                      -> current friends list

GET    /conversations                -> list with last message + unread flag
GET    /conversations/:id/messages
POST   /conversations/:id/messages   { body }   (404s / 403s if not accepted friends)
POST   /conversations/:id/read

GET    /notifications
POST   /notifications/:id/read
GET    /notifications/unread-count

GET    /events                       (SSE stream, session-authenticated)
```

All list endpoints (`GET /friends`, `GET /friends/requests`, `GET /conversations`,
`GET /conversations/:id/messages`, `GET /notifications`) take `?limit=&cursor=`
and never return an unbounded collection — a friend list or message history has no
natural upper bound, so this isn't optional.

## Abuse prevention & spam protection

Not deferred to a follow-up — messaging is one of the highest-abuse surfaces a
platform can add, and "protected from spam" is a baseline expectation, not a
nice-to-have:

- Rate-limit `POST /friends/requests` per sender (e.g. N per hour) to stop
  request-flooding a user or the whole platform.
- Rate-limit `POST /conversations/:id/messages` per sender similarly, to stop a
  compromised or malicious account from flooding a friend's inbox.
- Once `A` declines `B`'s request, block `B` from immediately re-requesting `A`
  (cooldown window) rather than allowing instant re-sends.
- Reuse the existing `reports` concept from Shameless
  (`apps/api/migrations/006_reports.sql` — not yet present in Crowdly) as a model
  for a future "report this message" action; out of scope for v1 but the schema
  should not preclude adding a `reported_at`/`report_reason` trail on `messages`
  later.

## Frontend changes

- `AuthContext`: `signIn` unchanged in shape, but now relies on the cookie for API
  calls rather than trusting `localStorage` for authorization (localStorage stays
  for UI display of "who am I").
- New `src/lib/friendsApi.ts`, `src/lib/notificationsApi.ts` — thin fetch wrappers
  with `credentials: 'include'`.
- New `LiveUpdatesContext` (or a hook `useLiveEvents`) opening the `/events` SSE
  connection once per session, feeding notification/unread counts into context —
  this is what the header reads instead of its hardcoded `useState(3)`/
  `useState(5)`.
- New `src/pages/Friends.tsx`: tabs for **Friends**, **Requests**
  (incoming/outgoing), **Find people** (reuses the existing `SearchBox`/
  `search.tsx` module to look up users and fire `POST /friends/requests`). Route
  it at `/friends`.
- Rework `src/components/CommunicationsSection.tsx`: drop the fake
  `initialMessages`/`initialComments` arrays and the unrelated "Comments" tab,
  replace with a real conversation list + thread view backed by `/conversations`.
  This becomes what "Communications" in the header actually opens.
- `src/components/CrowdlyHeader.tsx`: wire the Bell to a real dropdown of
  `notifications` (accept/decline buttons inline for `friend_request` type), wire
  the message icon badge to live unread-conversation count, give the "Friends" and
  "Communications" `DropdownMenuItem`s real `<Link>`s instead of doing nothing. All
  new copy wrapped in `<EditableText>` per the project's mandatory checklist for
  static UI text.
- `PublicProfile.tsx` / `Profile.tsx`: swap the `if (mode === "friends") return
  false` stub for an actual friendship-status check against `/friends` — small,
  but closes out an existing TODO for free.

### Accessibility & interaction details

- The notification bell's badge count updates from SSE without a reload — good
  for the "minimal clicks/reloads" principle, but the update itself must also be
  announced to screen reader users via an `aria-live="polite"` region, not just a
  visual badge change.
- Accept/decline/cancel/unfriend controls must be reachable and operable by
  keyboard alone (they're rendered as real `<button>`s via shadcn's `Button`, so
  this should hold by default — verify focus order in the notification dropdown
  specifically, since it's a custom popover).
- Every mutating action (send request, accept, decline, send message) gives
  immediate feedback via the existing `useToast` hook already used elsewhere in
  the header — consistent with the rest of the app rather than introducing a new
  feedback pattern.
- **Unfriending is destructive and hard to undo gracefully** (the other party
  loses the conversation gate) — it gets a confirmation dialog (shadcn
  `AlertDialog`), not a bare click-to-delete button.
- Friends/Requests/Messages views each need explicit empty, loading, and error
  states (e.g. "No friend requests yet" / "Couldn't load messages, retry"), not
  just a blank panel while data is missing.

## Phased rollout

1. **Session auth** — `sessions` table, `requireAuth` middleware, cookie-based
   login, CORS credentials fix. Nothing user-visible yet; unblocks everything else
   safely.
2. **Friend requests** — `friend_requests` table + routes + `/friends` page
   (send/accept/decline/cancel/unfriend-with-confirmation/list), rate limiting on
   request creation from the start (not bolted on later).
3. **Messaging** — `conversations`/`messages`/`conversation_reads`, gated on
   accepted friendships; rework `CommunicationsSection`; rate limiting on message
   sending.
4. **Notifications + SSE** — `notifications` table, `/events` stream, wire the
   header bell and message badge live, with the `aria-live` announcement region.
5. **Follow-up (not blocking)**: wiring the `friends`-visibility enum in profile
   privacy settings, message reporting (modeled on Shameless's
   `006_reports.sql`), edit/delete history on messages.

## Testing strategy for this feature

Per the testing pyramid — many unit tests, fewer integration, a couple of E2E:

- **Unit**: friend-request state transitions (pending → accepted/declined,
  rejecting a duplicate/reverse-direction request, rejecting a self-request),
  message-gating logic (send blocked unless `status = 'accepted'`).
- **Integration**: request → accept → conversation-created → message-sent →
  read-tracking, run against a real (test) Postgres instance, not mocked —
  this is exactly the kind of DB-contract bug a mock would hide.
- **E2E**: one critical path — log in as two users, send a request, accept it,
  exchange a message, see it reflected live in the other session.
- Any bug found during manual testing gets a regression test added alongside the
  fix, not just a fix.

## Note on API versioning

The architecture guidance calls for versioned APIs (`/api/v1/...`). Crowdly's
existing ~8,000-line `server.js` has no versioning on any route today (`/auth/
login`, `/admin/users/:id/message`, etc.). Introducing `/api/v1/friends/...` for
just the new routes would make the API inconsistent rather than more disciplined,
so this plan matches the existing unversioned convention. Retrofitting the whole
API with versioning is a separate, larger decision worth raising on its own, not
something to slip in via this feature.
