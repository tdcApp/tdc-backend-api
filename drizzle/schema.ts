import {
  pgTable,
  type AnyPgColumn,
  index,
  foreignKey,
  unique,
  uuid,
  varchar,
  timestamp,
  check,
  text,
  integer,
  time,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const audience = pgEnum('audience', ['ALL', 'LANGUAGE', 'TECHNOLOGY', 'CLASS']);
export const classType = pgEnum('class_type', ['LANGUAGE', 'TECHNOLOGY']);
export const userRole = pgEnum('user_role', ['STUDENT', 'TEACHER', 'ADMIN']);

export const classes = pgTable(
  'classes',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    type: classType().notNull(),
    mentorUid: varchar('mentor_uid', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('classes_mentor_idx').using('btree', table.mentorUid.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.mentorUid],
      foreignColumns: [users.firebaseUid],
      name: 'classes_mentor_uid_users_firebase_uid_fk',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    unique('classes_name_type_unique').on(table.type, table.name),
  ],
);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: varchar({ length: 255 }).notNull(),
    content: text().notNull(),
    audience: audience().notNull(),
    classId: uuid('class_id'),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('announcements_audience_idx').using(
      'btree',
      table.audience.asc().nullsLast().op('enum_ops'),
    ),
    index('announcements_class_idx').using('btree', table.classId.asc().nullsLast().op('uuid_ops')),
    index('announcements_created_by_idx').using(
      'btree',
      table.createdBy.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classes.id],
      name: 'announcements_class_id_classes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.firebaseUid],
      name: 'announcements_created_by_users_firebase_uid_fk',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    check(
      'announcement_audience_class_consistency',
      sql`((audience = 'CLASS'::audience) AND (class_id IS NOT NULL)) OR ((audience <> 'CLASS'::audience) AND (class_id IS NULL))`,
    ),
  ],
);

export const users = pgTable(
  'users',
  {
    firebaseUid: varchar('firebase_uid', { length: 128 }).primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    role: userRole().default('STUDENT').notNull(),
    languageClassId: uuid('language_class_id'),
    technologyClassId: uuid('technology_class_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('users_language_class_idx').using(
      'btree',
      table.languageClassId.asc().nullsLast().op('uuid_ops'),
    ),
    index('users_role_idx').using('btree', table.role.asc().nullsLast().op('enum_ops')),
    index('users_technology_class_idx').using(
      'btree',
      table.technologyClassId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.languageClassId],
      foreignColumns: [classes.id],
      name: 'users_language_class_id_classes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.technologyClassId],
      foreignColumns: [classes.id],
      name: 'users_technology_class_id_classes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text(),
    classId: uuid('class_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('assignments_class_idx').using('btree', table.classId.asc().nullsLast().op('uuid_ops')),
    index('assignments_due_at_idx').using(
      'btree',
      table.dueAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classes.id],
      name: 'assignments_class_id_classes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    title: varchar({ length: 255 }).notNull(),
    audience: audience().notNull(),
    classId: uuid('class_id'),
    createdBy: varchar('created_by', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quizzes_audience_idx').using('btree', table.audience.asc().nullsLast().op('enum_ops')),
    index('quizzes_class_idx').using('btree', table.classId.asc().nullsLast().op('uuid_ops')),
    index('quizzes_created_by_idx').using(
      'btree',
      table.createdBy.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classes.id],
      name: 'quizzes_class_id_classes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.firebaseUid],
      name: 'quizzes_created_by_users_firebase_uid_fk',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    check(
      'quiz_audience_class_consistency',
      sql`((audience = 'CLASS'::audience) AND (class_id IS NOT NULL)) OR ((audience <> 'CLASS'::audience) AND (class_id IS NULL))`,
    ),
  ],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    quizId: uuid('quiz_id').notNull(),
    question: text().notNull(),
    optionA: text('option_a').notNull(),
    optionB: text('option_b').notNull(),
    optionC: text('option_c').notNull(),
    optionD: text('option_d').notNull(),
    correctOption: varchar('correct_option', { length: 1 }).notNull(),
    questionOrder: integer('question_order').notNull(),
  },
  (table) => [
    index('quiz_questions_quiz_idx').using('btree', table.quizId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_questions_quiz_id_quizzes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    unique('quiz_questions_order_unique').on(table.quizId, table.questionOrder),
    check(
      'quiz_question_correct_option_check',
      sql`(correct_option)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying, 'D'::character varying])::text[])`,
    ),
    check('quiz_question_order_positive_check', sql`question_order > 0`),
  ],
);

export const schedules = pgTable(
  'schedules',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    classId: uuid('class_id').notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    subject: varchar({ length: 255 }).notNull(),
    room: varchar({ length: 100 }),
    teacherUid: varchar('teacher_uid', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('schedules_class_idx').using('btree', table.classId.asc().nullsLast().op('uuid_ops')),
    index('schedules_day_idx').using('btree', table.dayOfWeek.asc().nullsLast().op('int4_ops')),
    index('schedules_teacher_idx').using(
      'btree',
      table.teacherUid.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classes.id],
      name: 'schedules_class_id_classes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.teacherUid],
      foreignColumns: [users.firebaseUid],
      name: 'schedules_teacher_uid_users_firebase_uid_fk',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    check('schedule_day_of_week_check', sql`(day_of_week >= 0) AND (day_of_week <= 6)`),
    check('schedule_time_check', sql`end_time > start_time`),
  ],
);

export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    assignmentId: uuid('assignment_id').notNull(),
    menteeUid: varchar('mentee_uid', { length: 128 }).notNull(),
    submissionUrl: text('submission_url').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('assignment_submissions_mentee_idx').using(
      'btree',
      table.menteeUid.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.assignmentId],
      foreignColumns: [assignments.id],
      name: 'assignment_submissions_assignment_id_assignments_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.menteeUid],
      foreignColumns: [users.firebaseUid],
      name: 'assignment_submissions_mentee_uid_users_firebase_uid_fk',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    primaryKey({
      columns: [table.menteeUid, table.assignmentId],
      name: 'assignment_submissions_pk',
    }),
  ],
);

export const quizSubmissions = pgTable(
  'quiz_submissions',
  {
    quizId: uuid('quiz_id').notNull(),
    studentUid: varchar('student_uid', { length: 128 }).notNull(),
    score: integer().notNull(),
    totalQuestions: integer('total_questions').notNull(),
    clientSubmissionId: uuid('client_submission_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quiz_submissions_student_idx').using(
      'btree',
      table.studentUid.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_submissions_quiz_id_quizzes_id_fk',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.studentUid],
      foreignColumns: [users.firebaseUid],
      name: 'quiz_submissions_student_uid_users_firebase_uid_fk',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    primaryKey({ columns: [table.studentUid, table.quizId], name: 'quiz_submissions_pk' }),
    unique('quiz_submissions_client_submission_id_unique').on(table.clientSubmissionId),
    check('quiz_submission_score_non_negative', sql`score >= 0`),
    check('quiz_submission_total_questions_positive', sql`total_questions > 0`),
    check('quiz_submission_score_valid', sql`score <= total_questions`),
  ],
);
