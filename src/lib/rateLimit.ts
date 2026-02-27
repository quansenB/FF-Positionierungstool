/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Protects costly endpoints (e.g. /api/analyze) from spam.
 *
 * NOTE: This is process-local. In multi-replica deployments, switch to
 * a shared store (e.g. Upstash Redis via @upstash/ratelimit).
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Periodically evict expired entries to avoid memory growth.
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key);
  });
}, 5 * 60_000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * @param identifier  Usually the client IP address.
 * @param maxRequests Maximum allowed requests per window.
 * @param windowMs    Duration of the sliding window in milliseconds.
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 5,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    retryAfterMs: 0,
  };
}
