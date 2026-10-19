import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!options) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { uid: string } }>();
    const res = http.getResponse<Response>();

    const userUid = req.user?.uid;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = userUid ? `uid_${userUid}` : `ip_${ip}`;
    const actionKey = `${context.getClass().name}_${context.getHandler().name}_${identifier}`;

    const { allowed, remaining, resetSeconds } = await this.redisService.checkRateLimit(
      actionKey,
      options.limit,
      options.windowSeconds,
    );

    if (res && res.setHeader) {
      res.setHeader('X-RateLimit-Limit', options.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
      res.setHeader('X-RateLimit-Reset', resetSeconds);
    }

    if (!allowed) {
      if (res && res.setHeader) {
        res.setHeader('Retry-After', resetSeconds);
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many submissions. Please wait ${resetSeconds}s before trying again.`,
          retryAfter: resetSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
