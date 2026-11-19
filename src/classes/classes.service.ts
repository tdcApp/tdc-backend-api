import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { classChangeRequests, classes, users } from '../database/schema';
import type { GetClassesQueryDto } from './dto/get-classes-query.dto';
import type {
  CreateClassDto,
  CreateClassChangeRequestDto,
  ReviewClassChangeRequestDto,
  UpdateClassDto,
} from './dto/class-management.dto';

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
    const result = await this.databaseService.db
      .select({
        id: classes.id,
        name: classes.name,
        type: classes.type,
        mentorUid: classes.mentorUid,
        mentorName: users.name,
        mentorEmail: users.email,
        mentorPhone: users.mobileNumber,
        createdAt: classes.createdAt,
        updatedAt: classes.updatedAt,
        studentCount: sql<number>`COALESCE((
          SELECT count(*)::int FROM users
          WHERE users.language_class_id = ${classes.id}
             OR users.technology_class_id = ${classes.id}
        ), 0)`.as('student_count'),
      })
      .from(classes)
      .leftJoin(users, eq(classes.mentorUid, users.firebaseUid))
      .where(conditions);

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
      result = await this.databaseService.db
        .select({
          id: classes.id,
          name: classes.name,
          type: classes.type,
          mentorUid: classes.mentorUid,
          mentorName: users.name,
          mentorEmail: users.email,
          mentorPhone: users.mobileNumber,
          createdAt: classes.createdAt,
          updatedAt: classes.updatedAt,
        })
        .from(classes)
        .leftJoin(users, eq(classes.mentorUid, users.firebaseUid));
    } else if (user.role === 'TEACHER') {
      result = await this.databaseService.db
        .select({
          id: classes.id,
          name: classes.name,
          type: classes.type,
          mentorUid: classes.mentorUid,
          mentorName: users.name,
          mentorEmail: users.email,
          mentorPhone: users.mobileNumber,
          createdAt: classes.createdAt,
          updatedAt: classes.updatedAt,
        })
        .from(classes)
        .leftJoin(users, eq(classes.mentorUid, users.firebaseUid))
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
        .select({
          id: classes.id,
          name: classes.name,
          type: classes.type,
          mentorUid: classes.mentorUid,
          mentorName: users.name,
          mentorEmail: users.email,
          mentorPhone: users.mobileNumber,
          createdAt: classes.createdAt,
          updatedAt: classes.updatedAt,
        })
        .from(classes)
        .leftJoin(users, eq(classes.mentorUid, users.firebaseUid))
        .where(inArray(classes.id, enrolledIds));
    }

    if (result.length > 0) {
      await this.redisService.set(cacheKey, result, 1800);
    }
    return result;
  }

  async findStudentsForClass(classId: string) {
    const cacheKey = `classes:${classId}:students`;
    const cached = await this.redisService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.databaseService.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.languageClassId, classId),
          eq(users.technologyClassId, classId),
        ),
      );

    if (result) {
      await this.redisService.set(cacheKey, result, 600);
    }
    return result;
  }

  async createClass(dto: CreateClassDto) {
    const [mentor] = await this.databaseService.db
      .select({ firebaseUid: users.firebaseUid, role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, dto.mentorUid))
      .limit(1);

    if (!mentor) {
      throw new NotFoundException('Mentor user not found');
    }

    const [created] = await this.databaseService.db
      .insert(classes)
      .values({
        name: dto.name,
        type: dto.type,
        mentorUid: dto.mentorUid,
      })
      .returning();

    await this.invalidateClassCache();
    return created;
  }

  async updateClass(id: string, dto: UpdateClassDto) {
    const [existing] = await this.databaseService.db
      .select()
      .from(classes)
      .where(eq(classes.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    if (dto.mentorUid) {
      const [mentor] = await this.databaseService.db
        .select({ firebaseUid: users.firebaseUid })
        .from(users)
        .where(eq(users.firebaseUid, dto.mentorUid))
        .limit(1);

      if (!mentor) {
        throw new NotFoundException('Mentor user not found');
      }
    }

    const [updated] = await this.databaseService.db
      .update(classes)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.mentorUid !== undefined && { mentorUid: dto.mentorUid }),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, id))
      .returning();

    await this.invalidateClassCache();
    if (dto.mentorUid) {
      await this.redisService.del(`classes:user:${dto.mentorUid}`);
    }
    if (existing.mentorUid) {
      await this.redisService.del(`classes:user:${existing.mentorUid}`);
    }

    return updated;
  }

  async deleteClass(id: string) {
    const [existing] = await this.databaseService.db
      .select()
      .from(classes)
      .where(eq(classes.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const affectedStudents = await this.databaseService.db
      .select({ firebaseUid: users.firebaseUid })
      .from(users)
      .where(or(eq(users.languageClassId, id), eq(users.technologyClassId, id)));

    await this.databaseService.db
      .update(users)
      .set({ languageClassId: null, updatedAt: new Date() })
      .where(eq(users.languageClassId, id));

    await this.databaseService.db
      .update(users)
      .set({ technologyClassId: null, updatedAt: new Date() })
      .where(eq(users.technologyClassId, id));

    await this.databaseService.db
      .delete(classes)
      .where(eq(classes.id, id));

    await this.invalidateClassCache();
    if (existing.mentorUid) {
      await this.redisService.del(`classes:user:${existing.mentorUid}`);
    }
    for (const student of affectedStudents) {
      await this.redisService.del(`user:profile:${student.firebaseUid}`);
      await this.redisService.del(`classes:user:${student.firebaseUid}`);
    }

    return { message: 'Class deleted successfully' };
  }

  async createChangeRequest(studentUid: string, dto: CreateClassChangeRequestDto) {
    if (!dto.requestedLanguageClassId && !dto.requestedTechnologyClassId) {
      throw new BadRequestException('Please select at least one class to change');
    }

    const [existing] = await this.databaseService.db
      .select()
      .from(classChangeRequests)
      .where(
        and(
          eq(classChangeRequests.studentUid, studentUid),
          eq(classChangeRequests.status, 'PENDING'),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException('You already have a pending change request. Please wait for mentor/admin review.');
    }

    if (dto.requestedLanguageClassId) {
      const [lang] = await this.databaseService.db
        .select()
        .from(classes)
        .where(and(eq(classes.id, dto.requestedLanguageClassId), eq(classes.type, 'LANGUAGE')))
        .limit(1);
      if (!lang) {
        throw new BadRequestException('Invalid language class selected');
      }
    }

    if (dto.requestedTechnologyClassId) {
      const [tech] = await this.databaseService.db
        .select()
        .from(classes)
        .where(and(eq(classes.id, dto.requestedTechnologyClassId), eq(classes.type, 'TECHNOLOGY')))
        .limit(1);
      if (!tech) {
        throw new BadRequestException('Invalid technology class selected');
      }
    }

    const [created] = await this.databaseService.db
      .insert(classChangeRequests)
      .values({
        studentUid,
        requestedLanguageClassId: dto.requestedLanguageClassId ?? null,
        requestedTechnologyClassId: dto.requestedTechnologyClassId ?? null,
        reason: dto.reason ?? null,
        status: 'PENDING',
      })
      .returning();

    return created;
  }

  async findMyChangeRequest(studentUid: string) {
    const langClass = alias(classes, 'req_lang_class');
    const techClass = alias(classes, 'req_tech_class');

    const [request] = await this.databaseService.db
      .select({
        id: classChangeRequests.id,
        studentUid: classChangeRequests.studentUid,
        requestedLanguageClassId: classChangeRequests.requestedLanguageClassId,
        requestedLanguageClassName: langClass.name,
        requestedTechnologyClassId: classChangeRequests.requestedTechnologyClassId,
        requestedTechnologyClassName: techClass.name,
        reason: classChangeRequests.reason,
        status: classChangeRequests.status,
        reviewedBy: classChangeRequests.reviewedBy,
        reviewedAt: classChangeRequests.reviewedAt,
        createdAt: classChangeRequests.createdAt,
        updatedAt: classChangeRequests.updatedAt,
      })
      .from(classChangeRequests)
      .leftJoin(langClass, eq(classChangeRequests.requestedLanguageClassId, langClass.id))
      .leftJoin(techClass, eq(classChangeRequests.requestedTechnologyClassId, techClass.id))
      .where(eq(classChangeRequests.studentUid, studentUid))
      .orderBy(desc(classChangeRequests.createdAt))
      .limit(1);

    return request ?? null;
  }

  async findAllChangeRequests(status?: string) {
    const student = alias(users, 'student_user');
    const reviewer = alias(users, 'reviewer_user');
    const langClass = alias(classes, 'req_lang_class');
    const techClass = alias(classes, 'req_tech_class');
    const currLangClass = alias(classes, 'curr_lang_class');
    const currTechClass = alias(classes, 'curr_tech_class');

    const condition = status ? eq(classChangeRequests.status, status) : undefined;

    return this.databaseService.db
      .select({
        id: classChangeRequests.id,
        studentUid: classChangeRequests.studentUid,
        studentName: student.name,
        studentEmail: student.email,
        studentEnrollmentNumber: student.enrollmentNumber,
        studentYear: student.year,
        currentLanguageClassId: student.languageClassId,
        currentLanguageClassName: currLangClass.name,
        currentTechnologyClassId: student.technologyClassId,
        currentTechnologyClassName: currTechClass.name,
        requestedLanguageClassId: classChangeRequests.requestedLanguageClassId,
        requestedLanguageClassName: langClass.name,
        requestedTechnologyClassId: classChangeRequests.requestedTechnologyClassId,
        requestedTechnologyClassName: techClass.name,
        reason: classChangeRequests.reason,
        status: classChangeRequests.status,
        reviewedBy: classChangeRequests.reviewedBy,
        reviewerName: reviewer.name,
        reviewedAt: classChangeRequests.reviewedAt,
        createdAt: classChangeRequests.createdAt,
        updatedAt: classChangeRequests.updatedAt,
      })
      .from(classChangeRequests)
      .innerJoin(student, eq(classChangeRequests.studentUid, student.firebaseUid))
      .leftJoin(reviewer, eq(classChangeRequests.reviewedBy, reviewer.firebaseUid))
      .leftJoin(currLangClass, eq(student.languageClassId, currLangClass.id))
      .leftJoin(currTechClass, eq(student.technologyClassId, currTechClass.id))
      .leftJoin(langClass, eq(classChangeRequests.requestedLanguageClassId, langClass.id))
      .leftJoin(techClass, eq(classChangeRequests.requestedTechnologyClassId, techClass.id))
      .where(condition)
      .orderBy(desc(classChangeRequests.createdAt));
  }

  async reviewChangeRequest(id: string, reviewerUid: string, dto: ReviewClassChangeRequestDto) {
    const [request] = await this.databaseService.db
      .select()
      .from(classChangeRequests)
      .where(eq(classChangeRequests.id, id))
      .limit(1);

    if (!request) {
      throw new NotFoundException('Change request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Request has already been processed');
    }

    if (dto.status === 'APPROVED') {
      const updates: { languageClassId?: string; technologyClassId?: string; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (request.requestedLanguageClassId) {
        updates.languageClassId = request.requestedLanguageClassId;
      }
      if (request.requestedTechnologyClassId) {
        updates.technologyClassId = request.requestedTechnologyClassId;
      }

      await this.databaseService.db
        .update(users)
        .set(updates)
        .where(eq(users.firebaseUid, request.studentUid));

      await this.redisService.del(`user:profile:${request.studentUid}`);
      await this.redisService.del(`classes:user:${request.studentUid}`);
      await this.invalidateClassCache();
    }

    const [updated] = await this.databaseService.db
      .update(classChangeRequests)
      .set({
        status: dto.status,
        reviewedBy: reviewerUid,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classChangeRequests.id, id))
      .returning();

    return updated;
  }

  private async invalidateClassCache() {
    await this.redisService.del('classes:list:all');
    await this.redisService.del('classes:list:LANGUAGE');
    await this.redisService.del('classes:list:TECHNOLOGY');
  }
}
