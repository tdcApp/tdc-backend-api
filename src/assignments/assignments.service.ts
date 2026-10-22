import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { PostgresError } from 'postgres';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { assignments, assignmentSubmissions, classes, users } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { SubmitAssignmentDto } from './dto/submit-assignment.dto';

@Injectable()
export class AssignmentsService {
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
   * Returns assignments relevant to the requesting user.
   * - TEACHER/ADMIN → assignments for classes they mentor (with submissionCount)
   * - STUDENT       → assignments for their enrolled classes (with isSubmitted, submissionUrl, submittedAt)
   */
  async findForUser(firebaseUid: string) {
    const user = await this.getUserProfile(firebaseUid);

    if (!user) {
      throw new ForbiddenException('TDC user profile not found');
    }

    const selectFields = {
      id: assignments.id,
      title: assignments.title,
      description: assignments.description,
      classId: assignments.classId,
      createdBy: assignments.createdBy,
      dueAt: assignments.dueAt,
      createdAt: assignments.createdAt,
      updatedAt: assignments.updatedAt,
      createdByName: sql<string>`CASE WHEN ${users.role} = 'ADMIN' THEN 'ADMIN' WHEN ${users.name} IS NOT NULL THEN ${users.name} ELSE 'Teacher' END`,
      creatorRole: users.role,
    };

    if (user.role === 'ADMIN' || user.role === 'TEACHER') {
      return this.databaseService.db
        .select({
          ...selectFields,
          submissionCount: sql<number>`(SELECT COUNT(*)::int FROM ${assignmentSubmissions} WHERE ${assignmentSubmissions.assignmentId} = ${assignments.id})`,
        })
        .from(assignments)
        .leftJoin(classes, eq(assignments.classId, classes.id))
        .leftJoin(
          users,
          eq(users.firebaseUid, sql`COALESCE(${assignments.createdBy}, ${classes.mentorUid})`),
        )
        .orderBy(assignments.createdAt);
    }

    // Student sees assignments for their enrolled classes
    const classIds = [user.languageClassId, user.technologyClassId].filter(
      (id): id is string => id !== null,
    );

    if (classIds.length === 0) {
      return [];
    }

    return this.databaseService.db
      .select({
        ...selectFields,
        isSubmitted: sql<boolean>`CASE WHEN ${assignmentSubmissions.submittedAt} IS NOT NULL THEN true ELSE false END`,
        submissionUrl: assignmentSubmissions.submissionUrl,
        submittedAt: assignmentSubmissions.submittedAt,
      })
      .from(assignments)
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .leftJoin(
        users,
        eq(users.firebaseUid, sql`COALESCE(${assignments.createdBy}, ${classes.mentorUid})`),
      )
      .leftJoin(
        assignmentSubmissions,
        and(
          eq(assignments.id, assignmentSubmissions.assignmentId),
          eq(assignmentSubmissions.menteeUid, firebaseUid),
        ),
      )
      .where(inArray(assignments.classId, classIds))
      .orderBy(assignments.createdAt);
  }

  async findOne(assignmentId: string) {
    const [assignment] = await this.databaseService.db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        classId: assignments.classId,
        createdBy: assignments.createdBy,
        dueAt: assignments.dueAt,
        createdAt: assignments.createdAt,
        updatedAt: assignments.updatedAt,
        createdByName: sql<string>`CASE WHEN ${users.role} = 'ADMIN' THEN 'ADMIN' WHEN ${users.name} IS NOT NULL THEN ${users.name} ELSE 'Teacher' END`,
        creatorRole: users.role,
      })
      .from(assignments)
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .leftJoin(
        users,
        eq(users.firebaseUid, sql`COALESCE(${assignments.createdBy}, ${classes.mentorUid})`),
      )
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async create(firebaseUid: string, dto: CreateAssignmentDto) {
    // Verify class exists
    const [classRecord] = await this.databaseService.db
      .select({ id: classes.id, mentorUid: classes.mentorUid })
      .from(classes)
      .where(eq(classes.id, dto.classId))
      .limit(1);

    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (user && user.role !== 'ADMIN' && user.role !== 'TEACHER' && classRecord.mentorUid !== firebaseUid) {
      throw new ForbiddenException('You can only create assignments for classes you mentor');
    }

    const [assignment] = await this.databaseService.db
      .insert(assignments)
      .values({
        title: dto.title,
        description: dto.description ?? null,
        classId: dto.classId,
        createdBy: firebaseUid,
        dueAt: new Date(dto.dueAt),
      })
      .returning();

    void this.notificationsService.sendToClass(
      dto.classId,
      'New Assignment Posted! 📋',
      `Assignment: "${dto.title}" is now available.`,
      { type: 'ASSIGNMENT', id: assignment.id },
    );

    return assignment;
  }

  /**
   * Submits an assignment for a student. One submission per student per assignment.
   */
  async submit(assignmentId: string, firebaseUid: string, dto: SubmitAssignmentDto) {
    const [assignment] = await this.databaseService.db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    try {
      const [submission] = await this.databaseService.db
        .insert(assignmentSubmissions)
        .values({
          assignmentId,
          menteeUid: firebaseUid,
          submissionUrl: dto.submissionUrl,
        })
        .returning();

      return submission;
    } catch (error) {
      if (error instanceof PostgresError && error.code === '23505') {
        throw new ConflictException('You have already submitted this assignment');
      }
      throw error;
    }
  }

  async getSubmissions(assignmentId: string, page?: string, limit?: string) {
    const [assignment] = await this.databaseService.db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (page !== undefined) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit || '30', 10) || 30);
      const offset = (pageNum - 1) * limitNum;

      const [countResult] = await this.databaseService.db
        .select({ count: count() })
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.assignmentId, assignmentId));

      const total = Number(countResult?.count || 0);

      const data = await this.databaseService.db
        .select({
          assignmentId: assignmentSubmissions.assignmentId,
          menteeUid: assignmentSubmissions.menteeUid,
          submissionUrl: assignmentSubmissions.submissionUrl,
          submittedAt: assignmentSubmissions.submittedAt,
          studentName: users.name,
          studentEmail: users.email,
        })
        .from(assignmentSubmissions)
        .leftJoin(users, eq(assignmentSubmissions.menteeUid, users.firebaseUid))
        .where(eq(assignmentSubmissions.assignmentId, assignmentId))
        .limit(limitNum)
        .offset(offset);

      return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    }

    return this.databaseService.db
      .select({
        assignmentId: assignmentSubmissions.assignmentId,
        menteeUid: assignmentSubmissions.menteeUid,
        submissionUrl: assignmentSubmissions.submissionUrl,
        submittedAt: assignmentSubmissions.submittedAt,
        studentName: users.name,
        studentEmail: users.email,
      })
      .from(assignmentSubmissions)
      .leftJoin(users, eq(assignmentSubmissions.menteeUid, users.firebaseUid))
      .where(eq(assignmentSubmissions.assignmentId, assignmentId));
  }

  async getMySubmission(assignmentId: string, firebaseUid: string) {
    const [submission] = await this.databaseService.db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.menteeUid, firebaseUid),
        ),
      )
      .limit(1);

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }

  async deleteAssignment(assignmentId: string, firebaseUid: string) {
    const [assignment] = await this.databaseService.db
      .select({ id: assignments.id, classId: assignments.classId })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException();
    }

    // Admin and Teacher can delete any assignment
    if (user.role !== 'ADMIN' && user.role !== 'TEACHER') {
      const [classRecord] = await this.databaseService.db
        .select({ mentorUid: classes.mentorUid })
        .from(classes)
        .where(eq(classes.id, assignment.classId))
        .limit(1);

      if (!classRecord || classRecord.mentorUid !== firebaseUid) {
        throw new ForbiddenException('You can only delete assignments for your own classes');
      }
    }

    await this.databaseService.db.delete(assignments).where(eq(assignments.id, assignmentId));
  }
}
