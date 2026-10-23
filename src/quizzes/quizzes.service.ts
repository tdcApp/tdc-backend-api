import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { PostgresError } from 'postgres';
import { DatabaseService } from '../database/database.service';
import { classes, quizQuestions, quizSubmissions, quizzes, users } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../redis/redis.service';
import type { CreateQuizDto } from './dto/create-quiz.dto';
import type { SubmitQuizDto } from './dto/submit-quiz.dto';

@Injectable()
export class QuizzesService {
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
   * Returns quizzes visible to the requesting user based on their role and class enrolment.
   *
   * - TEACHER/ADMIN  → sees all quizzes with questionCount, submissionCount, and avgScore
   * - STUDENT        → sees quizzes where audience matches their class membership
   */
  async findForUser(firebaseUid: string) {
    const user = await this.getUserProfile(firebaseUid);

    if (!user) {
      throw new ForbiddenException('TDC user profile not found');
    }

    if (user.role === 'ADMIN' || user.role === 'TEACHER') {
      return this.databaseService.db
        .select({
          id: quizzes.id,
          title: quizzes.title,
          audience: quizzes.audience,
          targetYears: quizzes.targetYears,
          classId: quizzes.classId,
          createdBy: quizzes.createdBy,
          createdAt: quizzes.createdAt,
          updatedAt: quizzes.updatedAt,
          startTime: quizzes.startTime,
          enteringWindow: quizzes.enteringWindow,
          totalTime: quizzes.totalTime,
          isSubmitted: sql<boolean>`false`,
          createdByName: sql<string>`CASE WHEN ${users.role} = 'ADMIN' THEN 'ADMIN' WHEN ${users.name} IS NOT NULL THEN ${users.name} ELSE 'Teacher' END`,
          creatorRole: users.role,
          questionCount: sql<number>`(SELECT COUNT(*)::int FROM ${quizQuestions} WHERE ${quizQuestions.quizId} = ${quizzes.id})`,
          submissionCount: sql<number>`(SELECT COUNT(*)::int FROM ${quizSubmissions} WHERE ${quizSubmissions.quizId} = ${quizzes.id})`,
          avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(${quizSubmissions.score})::numeric, 1)::float FROM ${quizSubmissions} WHERE ${quizSubmissions.quizId} = ${quizzes.id}), 0)`,
        })
        .from(quizzes)
        .leftJoin(users, eq(users.firebaseUid, quizzes.createdBy))
        .orderBy(quizzes.createdAt);
    }

    // Build audience filter for students
    const audienceConditions = [eq(quizzes.audience, 'ALL')];

    if (user.languageClassId) {
      audienceConditions.push(eq(quizzes.audience, 'LANGUAGE'));
    }

    if (user.technologyClassId) {
      audienceConditions.push(eq(quizzes.audience, 'TECHNOLOGY'));
    }

    const classIds = [user.languageClassId, user.technologyClassId].filter(
      (id): id is string => id !== null,
    );

    if (classIds.length > 0) {
      audienceConditions.push(
        and(eq(quizzes.audience, 'CLASS'), inArray(quizzes.classId, classIds))!,
      );
    }

    // Academic year condition: accessible if targetYears is NULL/empty/ALL, or matches student's year
    const yearCondition = or(
      isNull(quizzes.targetYears),
      eq(quizzes.targetYears, ''),
      eq(quizzes.targetYears, 'ALL'),
      user.year ? sql`position(${user.year} in ${quizzes.targetYears}) > 0` : sql`false`,
    );

    return this.databaseService.db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        audience: quizzes.audience,
        targetYears: quizzes.targetYears,
        classId: quizzes.classId,
        createdBy: quizzes.createdBy,
        createdAt: quizzes.createdAt,
        updatedAt: quizzes.updatedAt,
        startTime: quizzes.startTime,
        enteringWindow: quizzes.enteringWindow,
        totalTime: quizzes.totalTime,
        isSubmitted: sql<boolean>`CASE 
          WHEN ${quizSubmissions.status} = 'COMPLETED' OR ${quizSubmissions.status} = 'DISQUALIFIED' THEN true 
          WHEN ${quizSubmissions.status} = 'IN_PROGRESS' AND (${quizSubmissions.warningCount} >= 3 OR (${quizSubmissions.startedAt} + (${quizzes.totalTime} || ' minutes')::interval) < NOW()) THEN true
          ELSE false 
        END`,
        hasActiveAttempt: sql<boolean>`CASE 
          WHEN ${quizSubmissions.status} = 'IN_PROGRESS' AND (${quizSubmissions.warningCount} < 3 AND (${quizSubmissions.startedAt} + (${quizzes.totalTime} || ' minutes')::interval) >= NOW()) THEN true 
          ELSE false 
        END`,
        createdByName: sql<string>`CASE WHEN ${users.role} = 'ADMIN' THEN 'ADMIN' WHEN ${users.name} IS NOT NULL THEN ${users.name} ELSE 'Teacher' END`,
        creatorRole: users.role,
        questionCount: sql<number>`(SELECT COUNT(*)::int FROM ${quizQuestions} WHERE ${quizQuestions.quizId} = ${quizzes.id})`,
      })
      .from(quizzes)
      .leftJoin(users, eq(users.firebaseUid, quizzes.createdBy))
      .leftJoin(
        quizSubmissions,
        and(
          eq(quizzes.id, quizSubmissions.quizId),
          eq(quizSubmissions.studentUid, firebaseUid),
        ),
      )
      .where(and(or(...audienceConditions), yearCondition))
      .orderBy(quizzes.createdAt);
  }

  /**
   * Returns quiz with questions.
   * For STUDENT: correct_option is stripped out.
   */
  async findOne(quizId: string, firebaseUid: string) {
    const user = await this.getUserProfile(firebaseUid);

    if (!user) {
      throw new ForbiddenException('TDC user profile not found');
    }

    const [quiz] = await this.databaseService.db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        audience: quizzes.audience,
        targetYears: quizzes.targetYears,
        classId: quizzes.classId,
        createdBy: quizzes.createdBy,
        createdAt: quizzes.createdAt,
        updatedAt: quizzes.updatedAt,
        startTime: quizzes.startTime,
        enteringWindow: quizzes.enteringWindow,
        totalTime: quizzes.totalTime,
        createdByName: sql<string>`CASE WHEN ${users.role} = 'ADMIN' THEN 'ADMIN' WHEN ${users.name} IS NOT NULL THEN ${users.name} ELSE 'Teacher' END`,
        creatorRole: users.role,
      })
      .from(quizzes)
      .leftJoin(users, eq(users.firebaseUid, quizzes.createdBy))
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const isStudent = user.role === 'STUDENT';
    if (isStudent && quiz.targetYears && quiz.targetYears !== 'ALL' && quiz.targetYears.trim() !== '') {
      if (!user.year || !quiz.targetYears.includes(user.year)) {
        throw new ForbiddenException('This quiz is not available for your academic year');
      }
    }

    if (isStudent && quiz.startTime) {
      const now = Date.now();
      const startMs = new Date(quiz.startTime).getTime();
      if (now < startMs) {
        throw new ForbiddenException(
          `This quiz is scheduled to start at ${new Date(quiz.startTime).toISOString()}. Questions cannot be accessed before the scheduled start time.`,
        );
      }
    }

    const questions = await this.databaseService.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.questionOrder);

    const orderedQuestions = isStudent
      ? this.seededShuffle(questions, `${quizId}_${firebaseUid}`)
      : questions;

    let isSubmitted = false;
    let activeAttempt: {
      startedAt: string;
      warningCount: number;
      remainingSeconds: number;
      isDisqualified: boolean;
    } | null = null;

    if (isStudent) {
      const [existingSubmission] = await this.databaseService.db
        .select({
          status: quizSubmissions.status,
          startedAt: quizSubmissions.startedAt,
          warningCount: quizSubmissions.warningCount,
          submittedAt: quizSubmissions.submittedAt,
        })
        .from(quizSubmissions)
        .where(
          and(
            eq(quizSubmissions.quizId, quizId),
            eq(quizSubmissions.studentUid, firebaseUid),
          ),
        )
        .limit(1);

      if (existingSubmission) {
        if (existingSubmission.status === 'COMPLETED' || existingSubmission.status === 'DISQUALIFIED') {
          isSubmitted = true;
        } else if (existingSubmission.status === 'IN_PROGRESS') {
          const now = Date.now();
          const startedTime = existingSubmission.startedAt ? new Date(existingSubmission.startedAt).getTime() : now;
          const totalSeconds = (quiz.totalTime || 30) * 60;
          const elapsedSeconds = Math.floor((now - startedTime) / 1000);
          const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

          if (remainingSeconds <= 0 || (existingSubmission.warningCount ?? 0) >= 3) {
            isSubmitted = true;
            await this.databaseService.db
              .update(quizSubmissions)
              .set({
                status: (existingSubmission.warningCount ?? 0) >= 3 ? 'DISQUALIFIED' : 'COMPLETED',
                submittedAt: new Date(startedTime + totalSeconds * 1000),
              })
              .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)));
          } else {
            isSubmitted = false;
            activeAttempt = {
              startedAt: existingSubmission.startedAt ? new Date(existingSubmission.startedAt).toISOString() : new Date().toISOString(),
              warningCount: existingSubmission.warningCount ?? 0,
              remainingSeconds,
              isDisqualified: false,
            };
          }
        }
      } else if (quiz.startTime) {
        const now = Date.now();
        const startMs = new Date(quiz.startTime).getTime();
        const windowMs = (quiz.enteringWindow ?? 15) * 60 * 1000;
        if (now > startMs + windowMs) {
          throw new ForbiddenException(
            'The entry window for this quiz has closed. You can no longer join this quiz.',
          );
        }
      }
    }

    return {
      ...quiz,
      isSubmitted,
      activeAttempt,
      questions: orderedQuestions.map((q) => ({
        id: q.id,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        questionOrder: q.questionOrder,
        // Only expose correct answer to teachers/admins
        ...(isStudent ? {} : { correctOption: q.correctOption }),
      })),
    };
  }

  /**
   * Creates a quiz and its questions in a single transaction.
   */
  async create(firebaseUid: string, dto: CreateQuizDto) {
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

    const result = await this.databaseService.db.transaction(async (tx) => {
      const [quiz] = await tx
        .insert(quizzes)
        .values({
          title: dto.title,
          audience: dto.audience,
          targetYears: dto.targetYears ?? null,
          classId: dto.classId ?? null,
          createdBy: firebaseUid,
          startTime: dto.startTime ? new Date(dto.startTime) : null,
          enteringWindow: dto.enteringWindow ?? 15,
          totalTime: dto.totalTime ?? 30,
        })
        .returning();

      const questionRows = dto.questions.map((q, index) => ({
        quizId: quiz.id,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctOption: q.correctOption,
        questionOrder: index + 1,
      }));

      const insertedQuestions = await tx.insert(quizQuestions).values(questionRows).returning();

      return { ...quiz, questions: insertedQuestions };
    });

    void this.notificationsService.sendToAudience(
      dto.audience,
      dto.classId,
      'New Quiz Available! 📝',
      `Quiz "${dto.title}" has been published.`,
      { type: 'QUIZ', id: result.id },
    );

    return result;
  }

  /**
   * Starts or resumes a quiz attempt for a student.
   * If already started: applies Strike +1, calculates remaining time, resumes or disqualifies on Strike 3.
   * If fresh: creates IN_PROGRESS record in database.
   */
  async startQuiz(quizId: string, firebaseUid: string) {
    const [quiz] = await this.databaseService.db
      .select({
        id: quizzes.id,
        totalTime: quizzes.totalTime,
        startTime: quizzes.startTime,
        enteringWindow: quizzes.enteringWindow,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (quiz.startTime) {
      const now = Date.now();
      const startMs = new Date(quiz.startTime).getTime();
      if (now < startMs) {
        throw new ForbiddenException(
          `This quiz is scheduled to start at ${new Date(quiz.startTime).toISOString()}. You cannot start it yet.`,
        );
      }
    }

    const totalSeconds = (quiz.totalTime || 30) * 60;

    const [existing] = await this.databaseService.db
      .select()
      .from(quizSubmissions)
      .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)))
      .limit(1);

    if (quiz.startTime && !existing) {
      const now = Date.now();
      const startMs = new Date(quiz.startTime).getTime();
      const windowMs = (quiz.enteringWindow ?? 15) * 60 * 1000;
      if (now > startMs + windowMs) {
        throw new ForbiddenException(
          'The entry window for this quiz has closed. You can no longer start this quiz.',
        );
      }
    }

    if (existing) {
      if (existing.status === 'COMPLETED' || existing.status === 'DISQUALIFIED') {
        throw new ConflictException('You have already submitted this quiz');
      }

      // Resume attempt in progress: Apply Strike +1 for having left!
      const now = Date.now();
      const startedTime = existing.startedAt ? new Date(existing.startedAt).getTime() : now;
      const elapsedSeconds = Math.floor((now - startedTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      const newWarningCount = (existing.warningCount || 0) + 1;

      if (remainingSeconds <= 0 || newWarningCount >= 3) {
        const finalStatus = newWarningCount >= 3 ? 'DISQUALIFIED' : 'COMPLETED';
        await this.databaseService.db
          .update(quizSubmissions)
          .set({ status: finalStatus, warningCount: newWarningCount, submittedAt: new Date() })
          .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)));

        return {
          status: finalStatus,
          isDisqualified: newWarningCount >= 3,
          isExpired: remainingSeconds <= 0,
          warningCount: newWarningCount,
          remainingSeconds: 0,
          isResume: true,
        };
      }

      await this.databaseService.db
        .update(quizSubmissions)
        .set({ warningCount: newWarningCount })
        .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)));

      return {
        status: 'IN_PROGRESS',
        isResume: true,
        startedAt: existing.startedAt ? new Date(existing.startedAt).toISOString() : new Date().toISOString(),
        warningCount: newWarningCount,
        remainingSeconds,
        isDisqualified: false,
        isExpired: false,
      };
    }

    // Brand new attempt: insert IN_PROGRESS record
    const [questionsCount] = await this.databaseService.db
      .select({ count: count() })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));

    const startedAt = new Date();
    const [newSub] = await this.databaseService.db
      .insert(quizSubmissions)
      .values({
        quizId,
        studentUid: firebaseUid,
        score: 0,
        totalQuestions: Number(questionsCount?.count || 0),
        clientSubmissionId: randomUUID(),
        startedAt,
        status: 'IN_PROGRESS',
        warningCount: 0,
      })
      .returning();

    return {
      status: 'IN_PROGRESS',
      isResume: false,
      startedAt: startedAt.toISOString(),
      warningCount: 0,
      remainingSeconds: totalSeconds,
      isDisqualified: false,
      isExpired: false,
    };
  }

  async recordStrike(quizId: string, firebaseUid: string) {
    const [existing] = await this.databaseService.db
      .select()
      .from(quizSubmissions)
      .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)))
      .limit(1);

    if (!existing || existing.status !== 'IN_PROGRESS') {
      return { warningCount: existing?.warningCount ?? 0, isDisqualified: existing?.status === 'DISQUALIFIED' };
    }

    const newWarningCount = (existing.warningCount || 0) + 1;
    const isDisqualified = newWarningCount >= 3;

    await this.databaseService.db
      .update(quizSubmissions)
      .set({
        warningCount: newWarningCount,
        status: isDisqualified ? 'DISQUALIFIED' : 'IN_PROGRESS',
        ...(isDisqualified ? { submittedAt: new Date(), score: 0 } : {}),
      })
      .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)));

    return {
      warningCount: newWarningCount,
      isDisqualified,
    };
  }

  /**
   * Submits a quiz for a student. Score is calculated server-side.
   * Idempotent: if clientSubmissionId already exists, return the existing record.
   */
  async submit(quizId: string, firebaseUid: string, dto: SubmitQuizDto) {
    // Idempotency check: return existing submission if clientSubmissionId is reused
    const [existingByClientId] = await this.databaseService.db
      .select()
      .from(quizSubmissions)
      .where(eq(quizSubmissions.clientSubmissionId, dto.clientSubmissionId))
      .limit(1);

    if (existingByClientId && (existingByClientId.status === 'COMPLETED' || existingByClientId.status === 'DISQUALIFIED')) {
      return existingByClientId;
    }

    // Check for existing submission by (quizId, studentUid)
    const [existingSubmission] = await this.databaseService.db
      .select()
      .from(quizSubmissions)
      .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)))
      .limit(1);

    if (existingSubmission && (existingSubmission.status === 'COMPLETED' || existingSubmission.status === 'DISQUALIFIED')) {
      throw new ConflictException('You have already submitted this quiz');
    }

    // Verify quiz exists and check academic year eligibility
    const user = await this.getUserProfile(firebaseUid);

    const [quiz] = await this.databaseService.db
      .select({ id: quizzes.id, targetYears: quizzes.targetYears })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (user?.role === 'STUDENT' && quiz.targetYears && quiz.targetYears !== 'ALL' && quiz.targetYears.trim() !== '') {
      if (!user.year || !quiz.targetYears.includes(user.year)) {
        throw new ForbiddenException('This quiz is not available for your academic year');
      }
    }

    // Fetch all questions for server-side scoring directly from database
    const questions = await this.databaseService.db
      .select({ id: quizQuestions.id, correctOption: quizQuestions.correctOption })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));

    if (questions.length === 0) {
      throw new BadRequestException('Quiz has no questions');
    }

    const isDisqualified = Boolean(dto.isDisqualified || dto.is_disqualified);

    // Build answer map
    const answers = dto.answers || [];
    const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedOption?.trim()?.toUpperCase()]));

    // Calculate score
    let score = 0;
    for (const q of questions) {
      const selected = answerMap.get(q.id);
      if (selected && selected === q.correctOption?.trim()?.toUpperCase()) {
        score++;
      }
    }

    const startedAt = (dto.startedAt || dto.started_at) ? new Date((dto.startedAt || dto.started_at)!) : null;
    const submittedAt = new Date();
    let timeTakenSeconds = dto.timeTakenSeconds ?? dto.time_taken_seconds;
    const effectiveStartedAt = existingSubmission?.startedAt || startedAt;
    if (timeTakenSeconds === undefined && effectiveStartedAt) {
      timeTakenSeconds = Math.max(0, Math.round((submittedAt.getTime() - new Date(effectiveStartedAt).getTime()) / 1000));
    }

    const finalStatus = isDisqualified ? 'DISQUALIFIED' : 'COMPLETED';

    try {
      if (existingSubmission) {
        const [submission] = await this.databaseService.db
          .update(quizSubmissions)
          .set({
            score: isDisqualified ? 0 : score,
            totalQuestions: questions.length,
            status: finalStatus,
            submittedAt,
            timeTakenSeconds: timeTakenSeconds ?? null,
          })
          .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)))
          .returning();

        return submission;
      } else {
        const [submission] = await this.databaseService.db
          .insert(quizSubmissions)
          .values({
            quizId,
            studentUid: firebaseUid,
            score: isDisqualified ? 0 : score,
            totalQuestions: questions.length,
            clientSubmissionId: dto.clientSubmissionId,
            startedAt,
            submittedAt,
            timeTakenSeconds: timeTakenSeconds ?? null,
            status: finalStatus,
            warningCount: 0,
          })
          .returning();

        return submission;
      }
    } catch (error) {
      if (error instanceof PostgresError && error.code === '23505') {
        throw new ConflictException('You have already submitted this quiz');
      }
      throw error;
    }
  }

  async getSubmissions(quizId: string, page?: string, limit?: string) {
    const [quiz] = await this.databaseService.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (page !== undefined) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit || '30', 10) || 30);
      const offset = (pageNum - 1) * limitNum;

      const [countResult] = await this.databaseService.db
        .select({ count: count() })
        .from(quizSubmissions)
        .where(
          and(
            eq(quizSubmissions.quizId, quizId),
            or(eq(quizSubmissions.status, 'COMPLETED'), eq(quizSubmissions.status, 'DISQUALIFIED')),
          ),
        );

      const total = Number(countResult?.count || 0);

      const data = await this.databaseService.db
        .select({
          quizId: quizSubmissions.quizId,
          studentUid: quizSubmissions.studentUid,
          score: quizSubmissions.score,
          totalQuestions: quizSubmissions.totalQuestions,
          clientSubmissionId: quizSubmissions.clientSubmissionId,
          startedAt: quizSubmissions.startedAt,
          submittedAt: quizSubmissions.submittedAt,
          timeTakenSeconds: quizSubmissions.timeTakenSeconds,
          status: quizSubmissions.status,
          studentName: users.name,
          studentEmail: users.email,
          studentEnrollment: users.enrollmentNumber,
          enrollmentNumber: users.enrollmentNumber,
        })
        .from(quizSubmissions)
        .leftJoin(users, eq(quizSubmissions.studentUid, users.firebaseUid))
        .where(
          and(
            eq(quizSubmissions.quizId, quizId),
            or(eq(quizSubmissions.status, 'COMPLETED'), eq(quizSubmissions.status, 'DISQUALIFIED')),
          ),
        )
        .orderBy(
          sql`${quizSubmissions.score} DESC`,
          sql`${quizSubmissions.submittedAt} ASC`,
          sql`${quizSubmissions.timeTakenSeconds} ASC NULLS LAST`
        )
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
        quizId: quizSubmissions.quizId,
        studentUid: quizSubmissions.studentUid,
        score: quizSubmissions.score,
        totalQuestions: quizSubmissions.totalQuestions,
        clientSubmissionId: quizSubmissions.clientSubmissionId,
        startedAt: quizSubmissions.startedAt,
        submittedAt: quizSubmissions.submittedAt,
        timeTakenSeconds: quizSubmissions.timeTakenSeconds,
        status: quizSubmissions.status,
        studentName: users.name,
        studentEmail: users.email,
        studentEnrollment: users.enrollmentNumber,
        enrollmentNumber: users.enrollmentNumber,
      })
      .from(quizSubmissions)
      .leftJoin(users, eq(quizSubmissions.studentUid, users.firebaseUid))
      .where(
        and(
          eq(quizSubmissions.quizId, quizId),
          or(eq(quizSubmissions.status, 'COMPLETED'), eq(quizSubmissions.status, 'DISQUALIFIED')),
        ),
      )
      .orderBy(
        sql`${quizSubmissions.score} DESC`,
        sql`${quizSubmissions.submittedAt} ASC`,
        sql`${quizSubmissions.timeTakenSeconds} ASC NULLS LAST`
      );
  }

  async getMySubmission(quizId: string, firebaseUid: string) {
    const [submission] = await this.databaseService.db
      .select({
        quizId: quizSubmissions.quizId,
        studentUid: quizSubmissions.studentUid,
        score: quizSubmissions.score,
        totalQuestions: quizSubmissions.totalQuestions,
        clientSubmissionId: quizSubmissions.clientSubmissionId,
        startedAt: quizSubmissions.startedAt,
        submittedAt: quizSubmissions.submittedAt,
        timeTakenSeconds: quizSubmissions.timeTakenSeconds,
        studentName: users.name,
        studentEmail: users.email,
      })
      .from(quizSubmissions)
      .leftJoin(users, eq(quizSubmissions.studentUid, users.firebaseUid))
      .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)))
      .limit(1);

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }

  async deleteQuiz(quizId: string, firebaseUid: string) {
    const [quiz] = await this.databaseService.db
      .select({ id: quizzes.id, createdBy: quizzes.createdBy })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Only the creator can delete their own quiz (unless admin)
    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.role !== 'ADMIN' && user.role !== 'TEACHER' && quiz.createdBy !== firebaseUid) {
      throw new ForbiddenException('You can only delete your own quizzes');
    }

    await this.databaseService.db.delete(quizzes).where(eq(quizzes.id, quizId));
    await this.redisService.del(`quiz:questions:${quizId}`);
  }

  /**
   * Deterministic Mulberry32 Fisher-Yates shuffle seeded with a unique string.
   */
  private seededShuffle<T>(array: T[], seedStr: string): T[] {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) {
      seed = (seed << 5) - seed + seedStr.charCodeAt(i);
      seed |= 0;
    }
    const random = () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

