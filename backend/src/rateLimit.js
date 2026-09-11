import rateLimit from 'express-rate-limit';

// Shared factory so every rate-limited route in this feature area configures
// limiting the same way instead of re-deriving it — spam protection is a
// baseline requirement here, not an afterthought bolted onto one route.
export function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    // Rate-limited routes always run requireAuth first, so req.user is set;
    // key by user, not IP, so one user can't dodge the limit by rotating IPs
    // and one shared IP (office NAT, VPN) doesn't get punished collectively.
    keyGenerator: (req) => req.user?.id || req.ip,
  });
}
