import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  time,
  primaryKey,
  unique,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* =========================================================
   ENUMS
   ========================================================= */

export const userRoleEnum = pgEnum('user_role', ['STUDENT', 'TEACHER', 'ADMIN']);
export type UserRoleEnum = (typeof userRoleEnum.enumValues)[number];

export const classTypeEnum = pgEnum('class_type', ['LANGUAGE', 'TECHNOLOGY']);
export type ClassTypeEnum = (typeof classTypeEnum.enumValues)[number];

export const audienceEnum = pgEnum('audience', ['ALL', 'LANGUAGE', 'TECHNOLOGY', 'CLASS']);

/* =========================================================
   USERS
   ========================================================= */

export const users = pgTable(
  'users',
  {
    firebaseUid: varchar('firebase_uid', {
      length: 128,
    }).primaryKey(),

    email: varchar('email', {
      length: 255,
    }).notNull(),

    name: varchar('name', {
      length: 255,
    }).notNull(),

    mobileNumber: varchar('mobile_number', {
      length: 10,
    }).notNull(),

    role: userRoleEnum('role').notNull().default('STUDENT'),

    languageClassId: uuid('language_class_id').references((): AnyPgColumn => classes.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    technologyClassId: uuid('technology_class_id').references((): AnyPgColumn => classes.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    year: varchar('year', {
      length: 20,
    }),

    enrollmentNumber: varchar('enrollment_number', {
      length: 100,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('users_language_class_idx').on(table.languageClassId),

    index('users_technology_class_idx').on(table.technologyClassId),

    index('users_role_idx').on(table.role),
  ],
);

/* =========================================================
   CLASSES
   ========================================================= */

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    name: varchar('name', {
      length: 100,
    }).notNull(),

    type: classTypeEnum('type').notNull(),

    mentorUid: varchar('mentor_uid', {
      length: 128,
    })
      .notNull()
      .references((): AnyPgColumn => users.firebaseUid, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('classes_name_type_unique').on(table.name, table.type),

    index('classes_mentor_idx').on(table.mentorUid),
  ],
);

/* =========================================================
   QUIZZES
   ========================================================= */

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: varchar('title', {
      length: 255,
    }).notNull(),

    audience: audienceEnum('audience').notNull(),

    targetYears: varchar('target_years', {
      length: 100,
    }),

    classId: uuid('class_id').references(() => classes.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    createdBy: varchar('created_by', {
      length: 128,
    })
      .notNull()
      .references(() => users.firebaseUid, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    startTime: timestamp('start_time', {
      withTimezone: true,
    }),

    enteringWindow: integer('entering_window').default(15),

    totalTime: integer('total_time').default(30).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quizzes_class_idx').on(table.classId),

    index('quizzes_created_by_idx').on(table.createdBy),

    index('quizzes_audience_idx').on(table.audience),

    check(
      'quiz_audience_class_consistency',
      sql`
        (
          ${table.audience} = 'CLASS'
          AND ${table.classId} IS NOT NULL
        )
        OR
        (
          ${table.audience} <> 'CLASS'
          AND ${table.classId} IS NULL
        )
      `,
    ),
  ],
);

/* =========================================================
   QUIZ QUESTIONS
   ========================================================= */

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    question: text('question').notNull(),

    optionA: text('option_a').notNull(),

    optionB: text('option_b').notNull(),

    optionC: text('option_c').notNull(),

    optionD: text('option_d').notNull(),

    correctOption: varchar('correct_option', {
      length: 1,
    }).notNull(),

    questionOrder: integer('question_order').notNull(),
  },
  (table) => [
    unique('quiz_questions_order_unique').on(table.quizId, table.questionOrder),

    index('quiz_questions_quiz_idx').on(table.quizId),

    check(
      'quiz_question_correct_option_check',
      sql`
        ${table.correctOption} IN ('A', 'B', 'C', 'D')
      `,
    ),

    check(
      'quiz_question_order_positive_check',
      sql`
        ${table.questionOrder} > 0
      `,
    ),
  ],
);

/* =========================================================
   QUIZ SUBMISSIONS
   ========================================================= */

export const quizSubmissions = pgTable(
  'quiz_submissions',
  {
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    studentUid: varchar('student_uid', {
      length: 128,
    })
      .notNull()
      .references(() => users.firebaseUid, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    score: integer('score').notNull(),

    totalQuestions: integer('total_questions').notNull(),

    clientSubmissionId: uuid('client_submission_id').notNull().unique(),

    startedAt: timestamp('started_at', {
      withTimezone: true,
    }),

    timeTakenSeconds: integer('time_taken_seconds'),

    status: varchar('status', {
      length: 20,
    })
      .default('COMPLETED')
      .notNull(),

    warningCount: integer('warning_count')
      .default(0)
      .notNull(),

    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'quiz_submissions_pk',
      columns: [table.quizId, table.studentUid],
    }),

    index('quiz_submissions_student_idx').on(table.studentUid),

    check('quiz_submission_score_non_negative', sql`${table.score} >= 0`),

    check('quiz_submission_total_questions_positive', sql`${table.totalQuestions} > 0`),

    check(
      'quiz_submission_score_valid',
      sql`
        ${table.score} <= ${table.totalQuestions}
      `,
    ),
  ],
);

/* =========================================================
   ASSIGNMENTS
   ========================================================= */

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: varchar('title', {
      length: 255,
    }).notNull(),

    description: text('description'),

    /*
     * Mentor is obtained through:
     *
     * assignments.classId
     *        ↓
     * classes.mentorUid
     */
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    createdBy: varchar('created_by', {
      length: 128,
    }),

    dueAt: timestamp('due_at', {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('assignments_class_idx').on(table.classId),

    index('assignments_due_at_idx').on(table.dueAt),
  ],
);

/* =========================================================
   ASSIGNMENT SUBMISSIONS
   ========================================================= */

export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    menteeUid: varchar('mentee_uid', {
      length: 128,
    })
      .notNull()
      .references(() => users.firebaseUid, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    submissionUrl: text('submission_url').notNull(),

    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'assignment_submissions_pk',
      columns: [table.assignmentId, table.menteeUid],
    }),

    index('assignment_submissions_mentee_idx').on(table.menteeUid),
  ],
);

/* =========================================================
   ANNOUNCEMENTS
   ========================================================= */

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: varchar('title', {
      length: 255,
    }).notNull(),

    content: text('content').notNull(),

    audience: audienceEnum('audience').notNull(),

    classId: uuid('class_id').references(() => classes.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    createdBy: varchar('created_by', {
      length: 128,
    })
      .notNull()
      .references(() => users.firebaseUid, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    tag: varchar('tag', {
      length: 50,
    })
      .default('GENERAL')
      .notNull(),

    targetScreen: varchar('target_screen', {
      length: 50,
    })
      .default('ANNOUNCEMENT')
      .notNull(),

    targetId: varchar('target_id', {
      length: 128,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('announcements_class_idx').on(table.classId),

    index('announcements_created_by_idx').on(table.createdBy),

    index('announcements_audience_idx').on(table.audience),

    check(
      'announcement_audience_class_consistency',
      sql`
        (
          ${table.audience} = 'CLASS'
          AND ${table.classId} IS NOT NULL
        )
        OR
        (
          ${table.audience} <> 'CLASS'
          AND ${table.classId} IS NULL
        )
      `,
    ),
  ],
);

/* =========================================================
   SCHEDULES
   ========================================================= */

export const schedules = pgTable(
  'schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    dayOfWeek: integer('day_of_week').notNull(),

    startTime: time('start_time').notNull(),

    endTime: time('end_time').notNull(),

    subject: varchar('subject', {
      length: 255,
    }).notNull(),

    room: varchar('room', {
      length: 100,
    }),

    teacherUid: varchar('teacher_uid', {
      length: 128,
    })
      .notNull()
      .references(() => users.firebaseUid, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('schedules_class_idx').on(table.classId),

    index('schedules_teacher_idx').on(table.teacherUid),

    index('schedules_day_idx').on(table.dayOfWeek),

    check(
      'schedule_day_of_week_check',
      sql`
        ${table.dayOfWeek} BETWEEN 0 AND 6
      `,
    ),

    check(
      'schedule_time_check',
      sql`
        ${table.endTime} > ${table.startTime}
      `,
    ),
  ],
);

/* =========================================================
   USER DEVICES (FCM PUSH NOTIFICATIONS)
   ========================================================= */

export const userDevices = pgTable(
  'user_devices',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: varchar('user_id', {
      length: 128,
    })
      .notNull()
      .references(() => users.firebaseUid, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    fcmToken: text('fcm_token').notNull().unique(),

    platform: varchar('platform', {
      length: 20,
    })
      .notNull()
      .default('ANDROID'),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('user_devices_user_id_idx').on(table.userId),
  ],
);

