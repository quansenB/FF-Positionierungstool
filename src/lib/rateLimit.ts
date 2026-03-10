/**
 * Distributed rate limiter for /api/analyze via Upstash Redis.
 *
 * Shared across all Vercel serverless instances — no per-instance in-memory
 * state that could be bypassed by hitting different replicas.
 *
 * Fail-closed: if Redis is unavailable (e.g. free-tier exhausted, network
 * issue), requests are blocked with 429 rather than let through unthrottled.
 *
 * Required env vars (auto-injected by Vercel after linking the Upstash store):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let limiter: Ratelimit | null = null;

const redisUrl = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;

if (redisUrl && redisToken) {
  limiter = new Ratelimit({
    redis: new Redis({ url: redisUrl, token: redisToken }),
    limiter: Ratelimit.slidingWindow(5, '60 s'),
    prefix: 'rl:analyze',
  });
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  if (!limiter) {
    // Redis not configured — fail-closed.
    console.error('[rateLimit] No Redis configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    return { allowed: false, retryAfterMs: 60_000 };
  }

  try {
    const { success, reset } = await limiter.limit(ip);
    return {
      allowed: success,
      retryAfterMs: success ? 0 : Math.max(0, reset - Date.now()),
    };
  } catch (err) {
    // Redis unavailable — fail-closed to protect API costs.
    console.error('[rateLimit] Redis error, blocking request:', err);
    return { allowed: false, retryAfterMs: 60_000 };
  }
}
