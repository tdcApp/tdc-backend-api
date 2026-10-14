import { relations } from 'drizzle-orm/relations';
import {
  users,
  classes,
  announcements,
  assignments,
  quizzes,
  quizQuestions,
  schedules,
  assignmentSubmissions,
  quizSubmissions,
} from './schema';

export const classesRelations = relations(classes, ({ one, many }) => ({
  user: one(users, {
    fields: [classes.mentorUid],
    references: [users.firebaseUid],
    relationName: 'classes_mentorUid_users_firebaseUid',
  }),
  announcements: many(announcements),
  users_languageClassId: many(users, {
    relationName: 'users_languageClassId_classes_id',
  }),
  users_technologyClassId: many(users, {
    relationName: 'users_technologyClassId_classes_id',
  }),
  assignments: many(assignments),
  quizzes: many(quizzes),
  schedules: many(schedules),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  classes: many(classes, {
    relationName: 'classes_mentorUid_users_firebaseUid',
  }),
  announcements: many(announcements),
  class_languageClassId: one(classes, {
    fields: [users.languageClassId],
    references: [classes.id],
    relationName: 'users_languageClassId_classes_id',
  }),
  class_technologyClassId: one(classes, {
    fields: [users.technologyClassId],
    references: [classes.id],
    relationName: 'users_technologyClassId_classes_id',
  }),
  quizzes: many(quizzes),
  schedules: many(schedules),
  assignmentSubmissions: many(assignmentSubmissions),
  quizSubmissions: many(quizSubmissions),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  class: one(classes, {
    fields: [announcements.classId],
    references: [classes.id],
  }),
  user: one(users, {
    fields: [announcements.createdBy],
    references: [users.firebaseUid],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  class: one(classes, {
    fields: [assignments.classId],
    references: [classes.id],
  }),
  assignmentSubmissions: many(assignmentSubmissions),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  class: one(classes, {
    fields: [quizzes.classId],
    references: [classes.id],
  }),
  user: one(users, {
    fields: [quizzes.createdBy],
    references: [users.firebaseUid],
  }),
  quizQuestions: many(quizQuestions),
  quizSubmissions: many(quizSubmissions),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizQuestions.quizId],
    references: [quizzes.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  class: one(classes, {
    fields: [schedules.classId],
    references: [classes.id],
  }),
  user: one(users, {
    fields: [schedules.teacherUid],
    references: [users.firebaseUid],
  }),
}));

export const assignmentSubmissionsRelations = relations(assignmentSubmissions, ({ one }) => ({
  assignment: one(assignments, {
    fields: [assignmentSubmissions.assignmentId],
    references: [assignments.id],
  }),
  user: one(users, {
    fields: [assignmentSubmissions.menteeUid],
    references: [users.firebaseUid],
  }),
}));

export const quizSubmissionsRelations = relations(quizSubmissions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizSubmissions.quizId],
    references: [quizzes.id],
  }),
  user: one(users, {
    fields: [quizSubmissions.studentUid],
    references: [users.firebaseUid],
  }),
}));
