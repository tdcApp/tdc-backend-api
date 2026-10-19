import { Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { classes, users } from '../database/schema';
import type { GetClassesQueryDto } from './dto/get-classes-query.dto';

@Injectable()
export class ClassesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(query: GetClassesQueryDto) {
    const cacheKey = `classes:list:${query.type ?? 'all'}`;
    const cached = await this.redisService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const conditions = query.type ? eq(classes.type, query.type) : undefined;
    const result = await this.databaseService.db.select().from(classes).where(conditions);

    await this.redisService.set(cacheKey, result, 3600);
    return result;
  }

  findStudentsForClass(classId: string) {
    return this.databaseService.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.languageClassId, classId),
          eq(users.technologyClassId, classId),
        ),
      );
  }
}
