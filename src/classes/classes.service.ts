import { Injectable } from '@nestjs/common';
import { eq, inArray, or } from 'drizzle-orm';
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

  async findMyClasses(firebaseUid: string) {
    const cacheKey = `classes:user:${firebaseUid}`;
    const cached = await this.redisService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const [user] = await this.databaseService.db
      .select({
        role: users.role,
        languageClassId: users.languageClassId,
        technologyClassId: users.technologyClassId,
      })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      return [];
    }

    let result: any[] = [];

    if (user.role === 'ADMIN') {
      result = await this.databaseService.db.select().from(classes);
    } else if (user.role === 'TEACHER') {
      result = await this.databaseService.db
        .select()
        .from(classes)
        .where(eq(classes.mentorUid, firebaseUid));
    } else {
      // STUDENT: enrolled classes only
      const enrolledIds = [user.languageClassId, user.technologyClassId].filter(
        (id): id is string => id !== null,
      );

      if (enrolledIds.length === 0) {
        return [];
      }

      result = await this.databaseService.db
        .select()
        .from(classes)
        .where(inArray(classes.id, enrolledIds));
    }

    if (result.length > 0) {
      await this.redisService.set(cacheKey, result, 1800);
    }
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
