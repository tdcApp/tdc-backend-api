import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, inArray, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { announcements, classes, users } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  private async getUserProfile(firebaseUid: string) {
    const userCacheKey = `user:profile:${firebaseUid}`;
    let user = await this.redisService.get<any>(userCacheKey);

    if (!user || typeof user.name !== 'string') {
      const [dbUser] = await this.databaseService.db
        .select()
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      if (dbUser) {
        user = dbUser;
        await this.redisService.set(userCacheKey, user, 300);
      }
    }

    return user ?? null;
  }

  /**
   * Returns announcements visible to the requesting user.
   *
   * - TEACHER/ADMIN  → all announcements they created
   * - STUDENT        → filtered by audience:
   *     ALL       → always visible
   *     LANGUAGE  → student has a language_class_id
   *     TECHNOLOGY→ student has a technology_class_id
   *     CLASS     → announcement.class_id is one of their class ids
   */
  async findForUser(firebaseUid: string) {
    const user = await this.getUserProfile(firebaseUid);

    if (!user) {
      throw new ForbiddenException('TDC user profile not found');
    }

    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      return this.databaseService.db
        .select()
        .from(announcements)
        .orderBy(announcements.createdAt);
    }

    // Student audience filter
    const audienceConditions = [eq(announcements.audience, 'ALL')];

    if (user.languageClassId) {
      audienceConditions.push(eq(announcements.audience, 'LANGUAGE'));
    }

    if (user.technologyClassId) {
      audienceConditions.push(eq(announcements.audience, 'TECHNOLOGY'));
    }

    const classIds = [user.languageClassId, user.technologyClassId].filter(
      (id): id is string => id !== null,
    );

    if (classIds.length > 0) {
      audienceConditions.push(
        and(eq(announcements.audience, 'CLASS'), inArray(announcements.classId, classIds))!,
      );
    }

    return this.databaseService.db
      .select()
      .from(announcements)
      .where(or(...audienceConditions))
      .orderBy(announcements.createdAt);
  }

  async findOne(announcementId: string) {
    const [announcement] = await this.databaseService.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    return announcement;
  }

  async create(firebaseUid: string, dto: CreateAnnouncementDto) {
    if (dto.audience === 'CLASS' && !dto.classId) {
      throw new BadRequestException('classId is required when audience is CLASS');
    }

    if (dto.audience !== 'CLASS' && dto.classId) {
      throw new BadRequestException('classId must only be set when audience is CLASS');
    }

    if (dto.classId) {
      const [classRecord] = await this.databaseService.db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.id, dto.classId))
        .limit(1);

      if (!classRecord) {
        throw new NotFoundException('Class not found');
      }
    }

    const normalizedTag = (dto.tag || 'GENERAL').toUpperCase();
    const normalizedTargetScreen = (
      dto.targetScreen ||
      (normalizedTag === 'QUIZ'
        ? 'QUIZ'
        : normalizedTag === 'ASSIGNMENT'
          ? 'ASSIGNMENT'
          : normalizedTag === 'SCHEDULE'
            ? 'SCHEDULE'
            : 'ANNOUNCEMENT')
    ).toUpperCase();

    const [announcement] = await this.databaseService.db
      .insert(announcements)
      .values({
        title: dto.title,
        content: dto.content,
        audience: dto.audience,
        classId: dto.classId ?? null,
        tag: normalizedTag,
        targetScreen: normalizedTargetScreen,
        targetId: dto.targetId ?? null,
        createdBy: firebaseUid,
      })
      .returning();

    const tagEmoji =
      normalizedTag === 'QUIZ'
        ? '📝'
        : normalizedTag === 'ASSIGNMENT'
          ? '📚'
          : normalizedTag === 'SCHEDULE'
            ? '📅'
            : normalizedTag === 'URGENT'
              ? '🚨'
              : '📢';

    void this.notificationsService.sendToAudience(
      dto.audience,
      dto.classId,
      `${tagEmoji} ${dto.title}`,
      dto.content.length > 100 ? `${dto.content.substring(0, 97)}...` : dto.content,
      {
        type: normalizedTargetScreen,
        id: dto.targetId || (normalizedTargetScreen === 'ANNOUNCEMENT' ? announcement.id : ''),
        tag: normalizedTag,
        announcementId: announcement.id,
      },
    );

    return announcement;
  }

  async deleteAnnouncement(announcementId: string, firebaseUid: string) {
    const [announcement] = await this.databaseService.db
      .select({ id: announcements.id, createdBy: announcements.createdBy })
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException();
    }

    // Admin and Teacher can delete any announcement
    if (user.role !== 'ADMIN' && user.role !== 'TEACHER' && announcement.createdBy !== firebaseUid) {
      throw new ForbiddenException('You can only delete your own announcements');
    }

    await this.databaseService.db.delete(announcements).where(eq(announcements.id, announcementId));
  }
}
