import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["admin", "teacher", "student"]);
export const sessionStatusEnum = pgEnum("session_status", ["live", "completed"]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "unverified",
]);
export const attendanceMethodEnum = pgEnum("attendance_method", [
  "manual",
  "visual-suggestion",
  "roster",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: varchar("clerk_id", { length: 255 }).notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("teacher"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const teachersTable = pgTable("teachers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studentsTable = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    studentNumber: varchar("student_number", { length: 80 }).notNull(),
    linkedUserId: integer("linked_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("students_owner_idx").on(table.ownerUserId),
    unique("students_owner_number_unique").on(table.ownerUserId, table.studentNumber),
  ],
);

export const coursesTable = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id").references(() => teachersTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    room: text("room").notNull().default(""),
    schedule: text("schedule").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("courses_owner_idx").on(table.ownerUserId),
    unique("courses_owner_code_unique").on(table.ownerUserId, table.code),
  ],
);

export const enrollmentsTable = pgTable(
  "enrollments",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("enrollments_course_student_unique").on(table.courseId, table.studentId),
    index("enrollments_student_idx").on(table.studentId),
  ],
);

export const classSessionsTable = pgTable(
  "class_sessions",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    room: text("room").notNull().default(""),
    status: sessionStatusEnum("status").notNull().default("live"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("class_sessions_course_started_idx").on(table.courseId, table.startedAt),
    index("class_sessions_status_idx").on(table.status),
  ],
);

export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => classSessionsTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull().default("unverified"),
    confidence: real("confidence"),
    method: attendanceMethodEnum("method").notNull().default("roster"),
    note: text("note"),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("attendance_session_student_unique").on(table.sessionId, table.studentId),
    index("attendance_student_marked_idx").on(table.studentId, table.markedAt),
  ],
);

export const engagementObservationsTable = pgTable(
  "engagement_observations",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => classSessionsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: real("value").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    dataQuality: varchar("data_quality", { length: 20 }).notNull().default("sufficient"),
  },
  (table) => [index("engagement_session_observed_idx").on(table.sessionId, table.observedAt)],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: varchar("kind", { length: 50 }).notNull().default("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt)],
);

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: text("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt)],
);

export const consentRecordsTable = pgTable(
  "consent_records",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }).unique(),
    faceAnalysis: boolean("face_analysis").notNull().default(false),
    audioParticipation: boolean("audio_participation").notNull().default(false),
    updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("consent_student_idx").on(table.studentId)],
);

export const courseInsertSchema = createInsertSchema(coursesTable).omit({
  id: true,
  createdAt: true,
});
export type CourseInputRecord = z.infer<typeof courseInsertSchema>;
export type UserRecord = typeof usersTable.$inferSelect;
export type StudentRecord = typeof studentsTable.$inferSelect;
export type CourseRecord = typeof coursesTable.$inferSelect;
export type ClassSessionRecord = typeof classSessionsTable.$inferSelect;

export const databaseRelations = {
  users: relations(usersTable, ({ many, one }) => ({
    teacher: one(teachersTable),
    courses: many(coursesTable),
    sessions: many(classSessionsTable),
  })),
  teachers: relations(teachersTable, ({ one }) => ({
    user: one(usersTable, { fields: [teachersTable.userId], references: [usersTable.id] }),
  })),
  students: relations(studentsTable, ({ many, one }) => ({
    enrollments: many(enrollmentsTable),
    consent: one(consentRecordsTable),
  })),
  courses: relations(coursesTable, ({ many, one }) => ({
    owner: one(usersTable, { fields: [coursesTable.ownerUserId], references: [usersTable.id] }),
    enrollments: many(enrollmentsTable),
    sessions: many(classSessionsTable),
  })),
  enrollments: relations(enrollmentsTable, ({ one }) => ({
    course: one(coursesTable, { fields: [enrollmentsTable.courseId], references: [coursesTable.id] }),
    student: one(studentsTable, { fields: [enrollmentsTable.studentId], references: [studentsTable.id] }),
  })),
};

export const latestAttendanceExpression = sql`max(${attendanceRecordsTable.updatedAt})`;
