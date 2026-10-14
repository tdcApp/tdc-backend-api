import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, inArray, or } from 'drizzle-orm';
import { PostgresError } from 'postgres';
import { DatabaseService } from '../database/database.service';
import { classes, quizQuestions, quizSubmissions, quizzes, users } from '../database/schema';
import type { CreateQuizDto } from './dto/create-quiz.dto';
import type { SubmitQuizDto } from './dto/submit-quiz.dto';

@Injectable()
export class QuizzesService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Returns quizzes visible to the requesting user based on their role and class enrolment.
   *
   * - TEACHER/ADMIN  → sees all quizzes they created
   * - STUDENT        → sees quizzes where audience matches their class membership:
   *     ALL       → always visible
   *     LANGUAGE  → student must have a language_class_id
   *     TECHNOLOGY→ student must have a technology_class_id
   *     CLASS     → quiz.class_id must equal one of their class ids
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

    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      return this.databaseService.db
        .select()
        .from(quizzes)
        .where(eq(quizzes.createdBy, firebaseUid));
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

    return this.databaseService.db
      .select()
      .from(quizzes)
      .where(or(...audienceConditions));
  }

  /**
   * Returns quiz with questions.
   * For STUDENT: correct_option is stripped out.
   */
  async findOne(quizId: string, firebaseUid: string) {
    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      throw new ForbiddenException('TDC user profile not found');
    }

    const [quiz] = await this.databaseService.db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const questions = await this.databaseService.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.questionOrder);

    const isStudent = user.role === 'STUDENT';

    return {
      ...quiz,
      questions: questions.map((q) => ({
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

    return this.databaseService.db.transaction(async (tx) => {
      const [quiz] = await tx
        .insert(quizzes)
        .values({
          title: dto.title,
          audience: dto.audience,
          classId: dto.classId ?? null,
          createdBy: firebaseUid,
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

    if (existingByClientId) {
      return existingByClientId;
    }

    // Check for existing submission by (quizId, studentUid) — no retakes
    const [existingSubmission] = await this.databaseService.db
      .select()
      .from(quizSubmissions)
      .where(and(eq(quizSubmissions.quizId, quizId), eq(quizSubmissions.studentUid, firebaseUid)))
      .limit(1);

    if (existingSubmission) {
      throw new ConflictException('You have already submitted this quiz');
    }

    // Verify quiz exists
    const [quiz] = await this.databaseService.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Fetch all questions for server-side scoring
    const questions = await this.databaseService.db
      .select({ id: quizQuestions.id, correctOption: quizQuestions.correctOption })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));

    if (questions.length === 0) {
      throw new BadRequestException('Quiz has no questions');
    }

    // Build answer map
    const answerMap = new Map(dto.answers.map((a) => [a.questionId, a.selectedOption]));

    // Calculate score
    let score = 0;
    for (const q of questions) {
      const selected = answerMap.get(q.id);
      if (selected && selected === q.correctOption) {
        score++;
      }
    }

    try {
      const [submission] = await this.databaseService.db
        .insert(quizSubmissions)
        .values({
          quizId,
          studentUid: firebaseUid,
          score,
          totalQuestions: questions.length,
          clientSubmissionId: dto.clientSubmissionId,
        })
        .returning();

      return submission;
    } catch (error) {
      if (error instanceof PostgresError && error.code === '23505') {
        throw new ConflictException('You have already submitted this quiz');
      }
      throw error;
    }
  }

  async getSubmissions(quizId: string) {
    const [quiz] = await this.databaseService.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return this.databaseService.db
      .select()
      .from(quizSubmissions)
      .where(eq(quizSubmissions.quizId, quizId));
  }

  async getMySubmission(quizId: string, firebaseUid: string) {
    const [submission] = await this.databaseService.db
      .select()
      .from(quizSubmissions)
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

    if (user.role !== 'ADMIN' && quiz.createdBy !== firebaseUid) {
      throw new ForbiddenException('You can only delete your own quizzes');
    }

    await this.databaseService.db.delete(quizzes).where(eq(quizzes.id, quizId));
  }
}
