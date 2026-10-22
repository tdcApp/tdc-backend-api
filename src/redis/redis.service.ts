import { Injectable, Logger } from '@nestjs/common';

interface MemoryCacheEntry {
  value: any;
  expiresAt: number;
}

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly memoryRateLimit = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    this.logger.log('High-performance in-memory cache and rate limiter initialized.');
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;
    this.memoryCache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.memoryCache.delete(key);
  }

  async delPrefix(prefix: string): Promise<void> {
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Rate limits an action for a key using in-memory token bucket.
   * Runs in micro-seconds with zero network overhead.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
    const rateLimitKey = `rl:${key}`;
    const now = Date.now();
    const existing = this.memoryRateLimit.get(rateLimitKey);

    if (!existing || now > existing.resetAt) {
      this.memoryRateLimit.set(rateLimitKey, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      });
      return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
    }

    existing.count += 1;
    const remainingSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    if (existing.count > limit) {
      return { allowed: false, remaining: 0, resetSeconds: remainingSeconds };
    }

    return { allowed: true, remaining: limit - existing.count, resetSeconds: remainingSeconds };
  }
}

