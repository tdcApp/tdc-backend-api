import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { PostgresError } from 'postgres';
import { DatabaseService } from '../database/database.service';
import { assignments, assignmentSubmissions, classes, users } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { SubmitAssignmentDto } from './dto/submit-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Returns assignments relevant to the requesting user.
   * - TEACHER/ADMIN → assignments for classes they mentor
   * - STUDENT       → assignments for their enrolled classes
   */
  async findForUser(firebaseUid: string) {
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
      throw new ForbiddenException('TDC user profile not found');
    }

    if (user.role === 'ADMIN' || user.role === 'TEACHER') {
      return this.databaseService.db
        .select()
        .from(assignments);
    }

    // Student sees assignments for their enrolled classes
    const classIds = [user.languageClassId, user.technologyClassId].filter(
      (id): id is string => id !== null,
    );

    if (classIds.length === 0) {
      return [];
    }

    return this.databaseService.db
      .select()
      .from(assignments)
      .where(inArray(assignments.classId, classIds));
  }

  async findOne(assignmentId: string) {
    const [assignment] = await this.databaseService.db
      .select()
      .from(assignments)
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

  async getSubmissions(assignmentId: string) {
    const [assignment] = await this.databaseService.db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
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
