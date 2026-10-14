import 'reflect-metadata';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from './users/dto/create-user.dto';
import { CreateScheduleDto } from './schedules/dto/create-schedule.dto';
import { CreateQuizDto } from './quizzes/dto/create-quiz.dto';
import {
  users,
  classes,
  quizzes,
  quizQuestions,
  quizSubmissions,
  assignments,
  assignmentSubmissions,
  announcements,
  schedules,
} from './database/schema';

describe('ERD Alignment and Schema Verification', () => {
  describe('1. Table Existence', () => {
    it('should define all 9 tables from the ERD', () => {
      const tableConfigs = [
        getTableConfig(users),
        getTableConfig(classes),
        getTableConfig(quizzes),
        getTableConfig(quizQuestions),
        getTableConfig(quizSubmissions),
        getTableConfig(assignments),
        getTableConfig(assignmentSubmissions),
        getTableConfig(announcements),
        getTableConfig(schedules),
      ];

      const tableNames = tableConfigs.map((c) => c.name);
      expect(tableNames).toEqual([
        'users',
        'classes',
        'quizzes',
        'quiz_questions',
        'quiz_submissions',
        'assignments',
        'assignment_submissions',
        'announcements',
        'schedules',
      ]);
    });
  });

  describe('2. Table Columns and Types Alignment', () => {
    describe('users table', () => {
      it('should match ERD specification for users', () => {
        const columns = getTableColumns(users);

        // ERD: firebase_uid varchar(128) PK
        expect(columns.firebaseUid.name).toBe('firebase_uid');
        expect(columns.firebaseUid.primary).toBe(true);
        expect(columns.firebaseUid.dataType).toBe('string');
        expect(columns.firebaseUid.columnType).toBe('PgVarchar');

        // ERD: email varchar(255) NOT NULL
        expect(columns.email.name).toBe('email');
        expect(columns.email.notNull).toBe(true);

        // ERD: name varchar(255) NOT NULL
        expect(columns.name.name).toBe('name');
        expect(columns.name.notNull).toBe(true);

        // ERD: role varchar(20) NOT NULL
        expect(columns.role.name).toBe('role');
        expect(columns.role.notNull).toBe(true);

        // ERD: mobile_number varchar(10) NOT NULL
        expect(columns.mobileNumber.name).toBe('mobile_number');
        expect(columns.mobileNumber.notNull).toBe(true);

        // ERD: language_class_id uuid FK
        expect(columns.languageClassId.name).toBe('language_class_id');
        expect(columns.languageClassId.dataType).toBe('string');

        // ERD: technology_class_id uuid FK
        expect(columns.technologyClassId.name).toBe('technology_class_id');
        expect(columns.technologyClassId.dataType).toBe('string');

        // ERD: created_at timestamp NOT NULL
        expect(columns.createdAt.name).toBe('created_at');
        expect(columns.createdAt.notNull).toBe(true);

        // ERD: updated_at timestamp NOT NULL
        expect(columns.updatedAt.name).toBe('updated_at');
        expect(columns.updatedAt.notNull).toBe(true);
      });
    });

    describe('classes table', () => {
      it('should match ERD specification for classes', () => {
        const columns = getTableColumns(classes);

        // ERD: id uuid PK
        expect(columns.id.name).toBe('id');
        expect(columns.id.primary).toBe(true);

        // ERD: name varchar(100) NOT NULL
        expect(columns.name.name).toBe('name');
        expect(columns.name.notNull).toBe(true);

        // ERD: type varchar(20) NOT NULL
        expect(columns.type.name).toBe('type');
        expect(columns.type.notNull).toBe(true);

        // ERD: mentor_uid varchar(128) FK NOT NULL
        expect(columns.mentorUid.name).toBe('mentor_uid');
        expect(columns.mentorUid.notNull).toBe(true);

        // ERD: created_at timestamp NOT NULL
        expect(columns.createdAt.name).toBe('created_at');
        expect(columns.createdAt.notNull).toBe(true);

        // ERD: updated_at timestamp NOT NULL
        expect(columns.updatedAt.name).toBe('updated_at');
        expect(columns.updatedAt.notNull).toBe(true);
      });
    });

    describe('quizzes table', () => {
      it('should match ERD specification for quizzes', () => {
        const columns = getTableColumns(quizzes);

        // ERD: id uuid PK
        expect(columns.id.name).toBe('id');
        expect(columns.id.primary).toBe(true);

        // ERD: title varchar(255) NOT NULL
        expect(columns.title.name).toBe('title');
        expect(columns.title.notNull).toBe(true);

        // ERD: audience varchar(20) NOT NULL
        expect(columns.audience.name).toBe('audience');
        expect(columns.audience.notNull).toBe(true);

        // ERD: class_id uuid FK
        expect(columns.classId.name).toBe('class_id');
        expect(columns.classId.notNull).toBe(false);

        // ERD: created_by varchar(128) FK NOT NULL
        expect(columns.createdBy.name).toBe('created_by');
        expect(columns.createdBy.notNull).toBe(true);

        // ERD: created_at timestamp NOT NULL
        expect(columns.createdAt.name).toBe('created_at');
        expect(columns.createdAt.notNull).toBe(true);

        // ERD: updated_at timestamp NOT NULL
        expect(columns.updatedAt.name).toBe('updated_at');
        expect(columns.updatedAt.notNull).toBe(true);
      });
    });

    describe('quiz_questions table', () => {
      it('should match ERD specification for quiz_questions', () => {
        const columns = getTableColumns(quizQuestions);

        // ERD: id uuid PK
        expect(columns.id.name).toBe('id');
        expect(columns.id.primary).toBe(true);

        // ERD: quiz_id uuid FK NOT NULL
        expect(columns.quizId.name).toBe('quiz_id');
        expect(columns.quizId.notNull).toBe(true);

        // ERD: question text NOT NULL
        expect(columns.question.name).toBe('question');
        expect(columns.question.notNull).toBe(true);

        // ERD: option_a text NOT NULL
        expect(columns.optionA.name).toBe('option_a');
        expect(columns.optionA.notNull).toBe(true);

        // ERD: option_b text NOT NULL
        expect(columns.optionB.name).toBe('option_b');
        expect(columns.optionB.notNull).toBe(true);

        // ERD: option_c text NOT NULL
        expect(columns.optionC.name).toBe('option_c');
        expect(columns.optionC.notNull).toBe(true);

        // ERD: option_d text NOT NULL
        expect(columns.optionD.name).toBe('option_d');
        expect(columns.optionD.notNull).toBe(true);

        // ERD: correct_option varchar(1) NOT NULL
        expect(columns.correctOption.name).toBe('correct_option');
        expect(columns.correctOption.notNull).toBe(true);

        // ERD: question_order integer NOT NULL
        expect(columns.questionOrder.name).toBe('question_order');
        expect(columns.questionOrder.notNull).toBe(true);
      });
    });

    describe('quiz_submissions table', () => {
      it('should match ERD specification for quiz_submissions', () => {
        const columns = getTableColumns(quizSubmissions);

        // ERD: quiz_id uuid PK, FK
        expect(columns.quizId.name).toBe('quiz_id');
        expect(columns.quizId.notNull).toBe(true);

        // ERD: student_uid varchar(128) PK, FK
        expect(columns.studentUid.name).toBe('student_uid');
        expect(columns.studentUid.notNull).toBe(true);

        // ERD: score integer NOT NULL
        expect(columns.score.name).toBe('score');
        expect(columns.score.notNull).toBe(true);

        // ERD: total_questions integer NOT NULL
        expect(columns.totalQuestions.name).toBe('total_questions');
        expect(columns.totalQuestions.notNull).toBe(true);

        // ERD: client_submission_id uuid UNIQUE NOT NULL
        expect(columns.clientSubmissionId.name).toBe('client_submission_id');
        expect(columns.clientSubmissionId.notNull).toBe(true);
        expect(columns.clientSubmissionId.isUnique).toBe(true);

        // ERD: submitted_at timestamp NOT NULL
        expect(columns.submittedAt.name).toBe('submitted_at');
        expect(columns.submittedAt.notNull).toBe(true);

        // Composite PK: (quiz_id, student_uid)
        const config = getTableConfig(quizSubmissions);
        expect(config.primaryKeys.length).toBe(1);
        expect(config.primaryKeys[0].columns.map((c) => c.name)).toEqual([
          'quiz_id',
          'student_uid',
        ]);
      });
    });

    describe('assignments table', () => {
      it('should match ERD specification for assignments', () => {
        const columns = getTableColumns(assignments);

        // ERD: id uuid PK
        expect(columns.id.name).toBe('id');
        expect(columns.id.primary).toBe(true);

        // ERD: title varchar(255) NOT NULL
        expect(columns.title.name).toBe('title');
        expect(columns.title.notNull).toBe(true);

        // ERD: description text
        expect(columns.description.name).toBe('description');
        expect(columns.description.notNull).toBe(false);

        // ERD: class_id uuid FK NOT NULL
        expect(columns.classId.name).toBe('class_id');
        expect(columns.classId.notNull).toBe(true);

        // ERD: due_at timestamp NOT NULL
        expect(columns.dueAt.name).toBe('due_at');
        expect(columns.dueAt.notNull).toBe(true);

        // ERD: created_at timestamp NOT NULL
        expect(columns.createdAt.name).toBe('created_at');
        expect(columns.createdAt.notNull).toBe(true);

        // ERD: updated_at timestamp NOT NULL
        expect(columns.updatedAt.name).toBe('updated_at');
        expect(columns.updatedAt.notNull).toBe(true);
      });
    });

    describe('assignment_submissions table', () => {
      it('should match ERD specification for assignment_submissions', () => {
        const columns = getTableColumns(assignmentSubmissions);

        // ERD: assignment_id uuid PK, FK
        expect(columns.assignmentId.name).toBe('assignment_id');
        expect(columns.assignmentId.notNull).toBe(true);

        // ERD: mentee_uid varchar(128) PK, FK
        expect(columns.menteeUid.name).toBe('mentee_uid');
        expect(columns.menteeUid.notNull).toBe(true);

        // ERD: submission_url text NOT NULL
        expect(columns.submissionUrl.name).toBe('submission_url');
        expect(columns.submissionUrl.notNull).toBe(true);

        // ERD: submitted_at timestamp NOT NULL
        expect(columns.submittedAt.name).toBe('submitted_at');
        expect(columns.submittedAt.notNull).toBe(true);

        // Composite PK: (assignment_id, mentee_uid)
        const config = getTableConfig(assignmentSubmissions);
        expect(config.primaryKeys.length).toBe(1);
        expect(config.primaryKeys[0].columns.map((c) => c.name)).toEqual([
          'assignment_id',
          'mentee_uid',
        ]);
      });
    });

    describe('announcements table', () => {
      it('should match ERD specification for announcements', () => {
        const columns = getTableColumns(announcements);

        // ERD: id uuid PK
        expect(columns.id.name).toBe('id');
        expect(columns.id.primary).toBe(true);

        // ERD: title varchar(255) NOT NULL
        expect(columns.title.name).toBe('title');
        expect(columns.title.notNull).toBe(true);

        // ERD: content text NOT NULL
        expect(columns.content.name).toBe('content');
        expect(columns.content.notNull).toBe(true);

        // ERD: audience varchar(20) NOT NULL
        expect(columns.audience.name).toBe('audience');
        expect(columns.audience.notNull).toBe(true);

        // ERD: class_id uuid FK
        expect(columns.classId.name).toBe('class_id');
        expect(columns.classId.notNull).toBe(false);

        // ERD: created_by varchar(128) FK NOT NULL
        expect(columns.createdBy.name).toBe('created_by');
        expect(columns.createdBy.notNull).toBe(true);

        // ERD: created_at timestamp NOT NULL
        expect(columns.createdAt.name).toBe('created_at');
        expect(columns.createdAt.notNull).toBe(true);

        // ERD: updated_at timestamp NOT NULL
        expect(columns.updatedAt.name).toBe('updated_at');
        expect(columns.updatedAt.notNull).toBe(true);
      });
    });

    describe('schedules table', () => {
      it('should match ERD specification for schedules', () => {
        const columns = getTableColumns(schedules);

        // ERD: id uuid PK
        expect(columns.id.name).toBe('id');
        expect(columns.id.primary).toBe(true);

        // ERD: class_id uuid FK NOT NULL
        expect(columns.classId.name).toBe('class_id');
        expect(columns.classId.notNull).toBe(true);

        // ERD: day_of_week integer NOT NULL
        expect(columns.dayOfWeek.name).toBe('day_of_week');
        expect(columns.dayOfWeek.notNull).toBe(true);

        // ERD: start_time time NOT NULL
        expect(columns.startTime.name).toBe('start_time');
        expect(columns.startTime.notNull).toBe(true);

        // ERD: end_time time NOT NULL
        expect(columns.endTime.name).toBe('end_time');
        expect(columns.endTime.notNull).toBe(true);

        // ERD: subject varchar(255) NOT NULL
        expect(columns.subject.name).toBe('subject');
        expect(columns.subject.notNull).toBe(true);

        // ERD: room varchar(100)
        expect(columns.room.name).toBe('room');
        expect(columns.room.notNull).toBe(false);

        // ERD: teacher_uid varchar(128) FK NOT NULL
        expect(columns.teacherUid.name).toBe('teacher_uid');
        expect(columns.teacherUid.notNull).toBe(true);

        // ERD: created_at timestamp NOT NULL
        expect(columns.createdAt.name).toBe('created_at');
        expect(columns.createdAt.notNull).toBe(true);

        // ERD: updated_at timestamp NOT NULL
        expect(columns.updatedAt.name).toBe('updated_at');
        expect(columns.updatedAt.notNull).toBe(true);
      });
    });
  });

  describe('3. Foreign Key Relationships Alignment', () => {
    function findFk(table: Parameters<typeof getTableConfig>[0], sourceColName: string) {
      const fks = getTableConfig(table).foreignKeys;
      for (const fk of fks) {
        const ref = fk.reference();
        if (ref.columns.some((c) => c.name === sourceColName)) {
          return {
            sourceColumn: sourceColName,
            targetTable: getTableConfig(ref.foreignTable).name,
            targetColumn: ref.foreignColumns[0]?.name,
          };
        }
      }
      return undefined;
    }

    it('1. users.language_class_id > classes.id', () => {
      const fk = findFk(users, 'language_class_id');
      expect(fk).toEqual({
        sourceColumn: 'language_class_id',
        targetTable: 'classes',
        targetColumn: 'id',
      });
    });

    it('2. users.technology_class_id > classes.id', () => {
      const fk = findFk(users, 'technology_class_id');
      expect(fk).toEqual({
        sourceColumn: 'technology_class_id',
        targetTable: 'classes',
        targetColumn: 'id',
      });
    });

    it('3. classes.mentor_uid > users.firebase_uid', () => {
      const fk = findFk(classes, 'mentor_uid');
      expect(fk).toEqual({
        sourceColumn: 'mentor_uid',
        targetTable: 'users',
        targetColumn: 'firebase_uid',
      });
    });

    it('4. quizzes.class_id > classes.id', () => {
      const fk = findFk(quizzes, 'class_id');
      expect(fk).toEqual({
        sourceColumn: 'class_id',
        targetTable: 'classes',
        targetColumn: 'id',
      });
    });

    it('5. quizzes.created_by > users.firebase_uid', () => {
      const fk = findFk(quizzes, 'created_by');
      expect(fk).toEqual({
        sourceColumn: 'created_by',
        targetTable: 'users',
        targetColumn: 'firebase_uid',
      });
    });

    it('6. quiz_questions.quiz_id > quizzes.id', () => {
      const fk = findFk(quizQuestions, 'quiz_id');
      expect(fk).toEqual({
        sourceColumn: 'quiz_id',
        targetTable: 'quizzes',
        targetColumn: 'id',
      });
    });

    it('7. quiz_submissions.quiz_id > quizzes.id', () => {
      const fk = findFk(quizSubmissions, 'quiz_id');
      expect(fk).toEqual({
        sourceColumn: 'quiz_id',
        targetTable: 'quizzes',
        targetColumn: 'id',
      });
    });

    it('8. quiz_submissions.student_uid > users.firebase_uid', () => {
      const fk = findFk(quizSubmissions, 'student_uid');
      expect(fk).toEqual({
        sourceColumn: 'student_uid',
        targetTable: 'users',
        targetColumn: 'firebase_uid',
      });
    });

    it('9. assignments.class_id > classes.id', () => {
      const fk = findFk(assignments, 'class_id');
      expect(fk).toEqual({
        sourceColumn: 'class_id',
        targetTable: 'classes',
        targetColumn: 'id',
      });
    });

    it('10. assignment_submissions.assignment_id > assignments.id', () => {
      const fk = findFk(assignmentSubmissions, 'assignment_id');
      expect(fk).toEqual({
        sourceColumn: 'assignment_id',
        targetTable: 'assignments',
        targetColumn: 'id',
      });
    });

    it('11. assignment_submissions.mentee_uid > users.firebase_uid', () => {
      const fk = findFk(assignmentSubmissions, 'mentee_uid');
      expect(fk).toEqual({
        sourceColumn: 'mentee_uid',
        targetTable: 'users',
        targetColumn: 'firebase_uid',
      });
    });

    it('12. announcements.class_id > classes.id', () => {
      const fk = findFk(announcements, 'class_id');
      expect(fk).toEqual({
        sourceColumn: 'class_id',
        targetTable: 'classes',
        targetColumn: 'id',
      });
    });

    it('13. announcements.created_by > users.firebase_uid', () => {
      const fk = findFk(announcements, 'created_by');
      expect(fk).toEqual({
        sourceColumn: 'created_by',
        targetTable: 'users',
        targetColumn: 'firebase_uid',
      });
    });

    it('14. schedules.class_id > classes.id', () => {
      const fk = findFk(schedules, 'class_id');
      expect(fk).toEqual({
        sourceColumn: 'class_id',
        targetTable: 'classes',
        targetColumn: 'id',
      });
    });

    it('15. schedules.teacher_uid > users.firebase_uid', () => {
      const fk = findFk(schedules, 'teacher_uid');
      expect(fk).toEqual({
        sourceColumn: 'teacher_uid',
        targetTable: 'users',
        targetColumn: 'firebase_uid',
      });
    });
  });

  describe('4. Integrity Constraints & Business Rules Alignment', () => {
    it('classes: unique constraint on (name, type)', () => {
      const config = getTableConfig(classes);
      const uniqueNameType = config.uniqueConstraints.find(
        (u) => u.name === 'classes_name_type_unique',
      );
      expect(uniqueNameType).toBeDefined();
    });

    it('quiz_questions: unique constraint on (quiz_id, question_order)', () => {
      const config = getTableConfig(quizQuestions);
      const uniqueOrder = config.uniqueConstraints.find(
        (u) => u.name === 'quiz_questions_order_unique',
      );
      expect(uniqueOrder).toBeDefined();
    });

    it('quiz_questions: check constraint for correct_option IN (A, B, C, D)', () => {
      const config = getTableConfig(quizQuestions);
      const correctOptionCheck = config.checks.find(
        (c) => c.name === 'quiz_question_correct_option_check',
      );
      expect(correctOptionCheck).toBeDefined();
    });

    it('quiz_questions: check constraint for question_order > 0', () => {
      const config = getTableConfig(quizQuestions);
      const orderCheck = config.checks.find((c) => c.name === 'quiz_question_order_positive_check');
      expect(orderCheck).toBeDefined();
    });

    it('quiz_submissions: check constraints for score and total_questions', () => {
      const config = getTableConfig(quizSubmissions);
      const nonNegativeScore = config.checks.find(
        (c) => c.name === 'quiz_submission_score_non_negative',
      );
      const positiveQuestions = config.checks.find(
        (c) => c.name === 'quiz_submission_total_questions_positive',
      );
      const validScore = config.checks.find((c) => c.name === 'quiz_submission_score_valid');

      expect(nonNegativeScore).toBeDefined();
      expect(positiveQuestions).toBeDefined();
      expect(validScore).toBeDefined();
    });

    it('quizzes: consistency check between audience and class_id', () => {
      const config = getTableConfig(quizzes);
      const consistencyCheck = config.checks.find(
        (c) => c.name === 'quiz_audience_class_consistency',
      );
      expect(consistencyCheck).toBeDefined();
    });

    it('announcements: consistency check between audience and class_id', () => {
      const config = getTableConfig(announcements);
      const consistencyCheck = config.checks.find(
        (c) => c.name === 'announcement_audience_class_consistency',
      );
      expect(consistencyCheck).toBeDefined();
    });

    it('schedules: check constraints for day_of_week BETWEEN 0 AND 6 and end_time > start_time', () => {
      const config = getTableConfig(schedules);
      const dayCheck = config.checks.find((c) => c.name === 'schedule_day_of_week_check');
      const timeCheck = config.checks.find((c) => c.name === 'schedule_time_check');

      expect(dayCheck).toBeDefined();
      expect(timeCheck).toBeDefined();
    });
  });

  describe('5. DTO Validation Alignment', () => {
    it('CreateUserDto validates 10-digit mobile number and UUID class IDs', async () => {
      const invalidDto = plainToInstance(CreateUserDto, {
        name: 'A',
        mobileNumber: '12345',
        languageClassId: 'invalid-uuid',
        technologyClassId: 'invalid-uuid',
      });
      const errors = await validate(invalidDto);
      expect(errors.length).toBeGreaterThan(0);

      const validDto = plainToInstance(CreateUserDto, {
        name: 'John Doe',
        mobileNumber: '9876543210',
        languageClassId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        technologyClassId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);
    });

    it('CreateScheduleDto validates HH:mm time format and day of week 0-6', async () => {
      const invalidDto = plainToInstance(CreateScheduleDto, {
        classId: 'not-uuid',
        dayOfWeek: 7, // out of range
        startTime: '25:00', // invalid time
        endTime: '12:00',
        subject: '',
      });
      const errors = await validate(invalidDto);
      expect(errors.length).toBeGreaterThan(0);

      const validDto = plainToInstance(CreateScheduleDto, {
        classId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        dayOfWeek: 2,
        startTime: '10:00',
        endTime: '11:30',
        subject: 'TypeScript Deep Dive',
      });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);
    });

    it('CreateQuizDto validates questions and options', async () => {
      const validDto = plainToInstance(CreateQuizDto, {
        title: 'Weekly Tech Quiz',
        audience: 'ALL',
        questions: [
          {
            question: 'What is TypeScript?',
            optionA: 'Typed superset of JS',
            optionB: 'A database',
            optionC: 'An operating system',
            optionD: 'A styling framework',
            correctOption: 'A',
          },
        ],
      });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);
    });
  });
});
