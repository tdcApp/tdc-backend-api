import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

interface MemoryCacheEntry {
  value: any;
  expiresAt: number;
}

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis | null = null;
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly memoryRateLimit = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('UPSTASH_REDIS_REST_URL');
    const token = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN');

    if (url && token && !url.includes('your_upstash') && !token.includes('your_upstash')) {
      try {
        this.redis = new Redis({ url, token });
        this.logger.log('Upstash Redis initialized successfully');
      } catch (err) {
        this.logger.warn(`Failed to initialize Upstash Redis, falling back to memory: ${(err as Error).message}`);
        this.redis = null;
      }
    } else {
      this.logger.log('Upstash Redis credentials not configured. Using in-memory fallback.');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const data = await this.redis.get<T>(key);
        return data;
      } catch (err) {
        this.logger.warn(`Redis GET failed for key "${key}": ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (this.redis) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.redis.set(key, value, { ex: ttlSeconds });
        } else {
          await this.redis.set(key, value);
        }
        return;
      } catch (err) {
        this.logger.warn(`Redis SET failed for key "${key}": ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;
    this.memoryCache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.logger.warn(`Redis DEL failed for key "${key}": ${(err as Error).message}`);
      }
    }
    this.memoryCache.delete(key);
  }

  async delPrefix(prefix: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys && keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (err) {
        this.logger.warn(`Redis delPrefix failed for prefix "${prefix}": ${(err as Error).message}`);
      }
    }

    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Rate limits an action for a key.
   * @param key Identifier for the rate limit (e.g. `quiz_sub:<quizId>:<uid>`)
   * @param limit Max allowed requests in the time window
   * @param windowSeconds Window length in seconds
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
    const rateLimitKey = `rl:${key}`;

    if (this.redis) {
      try {
        const current = await this.redis.incr(rateLimitKey);
        if (current === 1) {
          await this.redis.expire(rateLimitKey, windowSeconds);
        }
        const ttl = await this.redis.ttl(rateLimitKey);
        const resetSeconds = ttl > 0 ? ttl : windowSeconds;

        if (current > limit) {
          return { allowed: false, remaining: 0, resetSeconds };
        }
        return { allowed: true, remaining: limit - current, resetSeconds };
      } catch (err) {
        this.logger.warn(`Redis rate limit check failed: ${(err as Error).message}`);
      }
    }

    // In-memory rate limiting fallback
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
