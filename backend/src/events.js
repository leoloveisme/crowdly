// Server-Sent Events hub for live notification/message push. In-memory,
// single-process only — this is the one file that would need to change
// (e.g. to a Redis pub/sub relay) if the backend is ever horizontally
// scaled to multiple instances; everything else calls pushEventToUser()
// and doesn't know or care how delivery works.
const clientsByUser = new Map(); // userId -> Set<res>

function registerClient(userId, res) {
  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
  clientsByUser.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clientsByUser.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientsByUser.delete(userId);
}

export function pushEventToUser(userId, event) {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}

// GET /events — requires requireAuth to have already set req.user.
export function eventsHandler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  registerClient(req.user.id, res);
  res.write(': connected\n\n');

  // Keeps intermediate proxies (nginx etc.) from treating an idle SSE
  // connection as dead and closing it.
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(req.user.id, res);
  });
}
