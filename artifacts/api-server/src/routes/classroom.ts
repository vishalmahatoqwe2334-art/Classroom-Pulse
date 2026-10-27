import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  and,
  count,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import {
  AppUser,
  AttendanceRecord,
  CreateCourseBody,
  CreateCourseResponse,
  CreateSessionBody,
  CreateSessionResponse,
  CreateStudentBody,
  CreateStudentResponse,
  DashboardSummary,
  EndSessionParams,
  EndSessionResponse,
  GetAttendanceReportQueryParams,
  GetAttendanceReportResponse,
  GetCurrentUserResponse,
  GetDashboardSummaryResponse,
  GetSessionParams,
  GetSessionResponse,
  ListConsentsResponse,
  ListCoursesResponse,
  ListSessionsQueryParams,
  ListSessionsResponse,
  ListStudentsQueryParams,
  ListStudentsResponse,
  SessionDetail,
  UpdateAttendanceBody,
  UpdateAttendanceParams,
  UpdateAttendanceResponse,
  UpdateConsentBody,
  UpdateConsentParams,
  UpdateConsentResponse,
} from "@workspace/api-zod";
import {
  attendanceRecordsTable,
  auditLogsTable,
  classSessionsTable,
  consentRecordsTable,
  coursesTable,
  db,
  engagementObservationsTable,
  enrollmentsTable,
  notificationsTable,
  studentsTable,
  teachersTable,
  usersTable,
  type ClassSessionRecord,
  type UserRecord,
} from "@workspace/db";
import { getOrCreateAppUser, requireCourseOwner } from "../lib/current-user";

const router: IRouter = Router();

type AuthenticatedRequest = Request & { appUser: UserRecord };

const authenticate: RequestHandler = async (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const user = await getOrCreateAppUser(req);
    if (user.role === "student") {
      res.status(403).json({ error: "Staff access required" });
      return;
    }
    (req as AuthenticatedRequest).appUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

router.use(authenticate);

function currentUser(req: Request): UserRecord {
  return (req as AuthenticatedRequest).appUser;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function sessionSummary(session: ClassSessionRecord) {
  const [course] = await db
    .select({ name: coursesTable.name })
    .from(coursesTable)
    .where(eq(coursesTable.id, session.courseId))
    .limit(1);
  const [counts] = await db
    .select({
      enrolledCount: count(enrollmentsTable.id),
      presentCount: sql<number>`count(*) filter (where ${attendanceRecordsTable.status} = 'present' or ${attendanceRecordsTable.status} = 'late')`,
      reviewCount: sql<number>`count(*) filter (where ${attendanceRecordsTable.status} = 'unverified')`,
    })
    .from(enrollmentsTable)
    .leftJoin(
      attendanceRecordsTable,
      and(
        eq(attendanceRecordsTable.studentId, enrollmentsTable.studentId),
        eq(attendanceRecordsTable.sessionId, session.id),
      ),
    )
    .where(eq(enrollmentsTable.courseId, session.courseId));
  return {
    id: session.id,
    courseId: session.courseId,
    courseName: course?.name ?? "Course",
    room: session.room,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: iso(session.endedAt),
    enrolledCount: Number(counts?.enrolledCount ?? 0),
    presentCount: Number(counts?.presentCount ?? 0),
    reviewCount: Number(counts?.reviewCount ?? 0),
  };
}

async function addAuditEntry(
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
) {
  await db.insert(auditLogsTable).values({
    actorUserId: userId,
    action,
    entityType,
    entityId: String(entityId),
  });
}

router.get("/me", async (req, res): Promise<void> => {
  const user = currentUser(req);
  res.json(
    GetCurrentUserResponse.parse({
      id: user.clerkId,
      name: user.name,
      email: user.email,
      role: user.role,
    }),
  );
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const courses = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.ownerUserId, user.id));
  const students = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(eq(studentsTable.ownerUserId, user.id));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(start);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const sessions = await db
    .select()
    .from(classSessionsTable)
    .where(
      and(
        eq(classSessionsTable.teacherId, user.id),
        gte(classSessionsTable.startedAt, start),
        lt(classSessionsTable.startedAt, tomorrow),
      ),
    );
  const sessionIds = sessions.map((session) => session.id);
  const attendance = sessionIds.length
    ? await db
        .select({ status: attendanceRecordsTable.status })
        .from(attendanceRecordsTable)
        .where(inArray(attendanceRecordsTable.sessionId, sessionIds))
    : [];
  const recentSessions = await db
    .select()
    .from(classSessionsTable)
    .where(eq(classSessionsTable.teacherId, user.id))
    .orderBy(sql`${classSessionsTable.startedAt} desc`)
    .limit(5);
  const summary = {
    students: students.length,
    courses: courses.length,
    presentToday: attendance.filter((row) => row.status === "present").length,
    absentToday: attendance.filter((row) => row.status === "absent").length,
    lateToday: attendance.filter((row) => row.status === "late").length,
    needsReview: attendance.filter((row) => row.status === "unverified").length,
    recentSessions: await Promise.all(recentSessions.map(sessionSummary)),
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/courses", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const rows = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      code: coursesTable.code,
      room: coursesTable.room,
      schedule: coursesTable.schedule,
      studentCount: count(enrollmentsTable.id),
    })
    .from(coursesTable)
    .leftJoin(enrollmentsTable, eq(enrollmentsTable.courseId, coursesTable.id))
    .where(eq(coursesTable.ownerUserId, user.id))
    .groupBy(coursesTable.id)
    .orderBy(coursesTable.name);
  res.json(ListCoursesResponse.parse(rows.map((row) => ({ ...row, studentCount: Number(row.studentCount) }))));
});

router.post("/courses", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const body = CreateCourseBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(
      and(
        eq(coursesTable.ownerUserId, user.id),
        eq(coursesTable.code, body.data.code),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A course with this code already exists" });
    return;
  }
  const [teacher] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.userId, user.id))
    .limit(1);
  const [course] = await db
    .insert(coursesTable)
    .values({ ...body.data, ownerUserId: user.id, teacherId: teacher?.id ?? null })
    .returning();
  await addAuditEntry(user.id, "course.created", "course", course.id);
  res.status(201).json(
    CreateCourseResponse.parse({ ...course, studentCount: 0 }),
  );
});

router.get("/students", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const query = ListStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const where = query.data.courseId
    ? and(
        eq(studentsTable.ownerUserId, user.id),
        eq(enrollmentsTable.courseId, query.data.courseId),
      )
    : eq(studentsTable.ownerUserId, user.id);
  const rows = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      email: studentsTable.email,
      studentNumber: studentsTable.studentNumber,
      courseId: enrollmentsTable.courseId,
      faceAnalysis: consentRecordsTable.faceAnalysis,
      audioParticipation: consentRecordsTable.audioParticipation,
    })
    .from(studentsTable)
    .leftJoin(enrollmentsTable, eq(enrollmentsTable.studentId, studentsTable.id))
    .leftJoin(consentRecordsTable, eq(consentRecordsTable.studentId, studentsTable.id))
    .where(where)
    .orderBy(studentsTable.name);
  const grouped = new Map<number, (typeof rows)[number] & { courseIds: number[] }>();
  for (const row of rows) {
    const student = grouped.get(row.id) ?? {
      ...row,
      courseIds: [],
    };
    if (row.courseId !== null && !student.courseIds.includes(row.courseId)) {
      student.courseIds.push(row.courseId);
    }
    grouped.set(row.id, student);
  }
  res.json(
    ListStudentsResponse.parse(
      [...grouped.values()].map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        studentNumber: student.studentNumber,
        courseIds: student.courseIds,
        consentFace: student.faceAnalysis ?? false,
        consentAudio: student.audioParticipation ?? false,
      })),
    ),
  );
});

router.post("/students", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const body = CreateStudentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const courseIds = [...new Set(body.data.courseIds)];
  if (courseIds.length) {
    const ownedCourses = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(
        and(
          eq(coursesTable.ownerUserId, user.id),
          inArray(coursesTable.id, courseIds),
        ),
      );
    if (ownedCourses.length !== courseIds.length) {
      res.status(400).json({ error: "One or more selected courses are unavailable" });
      return;
    }
  }
  const [duplicate] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.ownerUserId, user.id),
        eq(studentsTable.studentNumber, body.data.studentNumber),
      ),
    )
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "A student with this number already exists" });
    return;
  }
  const student = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(studentsTable)
      .values({
        ownerUserId: user.id,
        name: body.data.name,
        email: body.data.email,
        studentNumber: body.data.studentNumber,
      })
      .returning();
    if (courseIds.length) {
      await tx.insert(enrollmentsTable).values(
        courseIds.map((courseId) => ({ courseId, studentId: created.id })),
      );
    }
    const [consent] = await tx
      .insert(consentRecordsTable)
      .values({ studentId: created.id, updatedByUserId: user.id })
      .returning();
    return { created, consent };
  });
  await addAuditEntry(user.id, "student.created", "student", student.created.id);
  res.status(201).json(
    CreateStudentResponse.parse({
      id: student.created.id,
      name: student.created.name,
      email: student.created.email,
      studentNumber: student.created.studentNumber,
      courseIds,
      consentFace: student.consent.faceAnalysis,
      consentAudio: student.consent.audioParticipation,
    }),
  );
});

router.get("/sessions", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const query = ListSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const sessions = await db
    .select()
    .from(classSessionsTable)
    .innerJoin(coursesTable, eq(coursesTable.id, classSessionsTable.courseId))
    .where(
      query.data.courseId
        ? and(
            eq(classSessionsTable.teacherId, user.id),
            eq(classSessionsTable.courseId, query.data.courseId),
          )
        : eq(classSessionsTable.teacherId, user.id),
    )
    .orderBy(sql`${classSessionsTable.startedAt} desc`);
  const summaries = await Promise.all(
    sessions.map((row) => sessionSummary(row.class_sessions)),
  );
  res.json(ListSessionsResponse.parse(summaries));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const body = CreateSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const course = await requireCourseOwner(body.data.courseId, user.id);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const session = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(classSessionsTable)
      .values({
        courseId: course.id,
        teacherId: user.id,
        room: body.data.room || course.room,
      })
      .returning();
    const students = await tx
      .select({ studentId: enrollmentsTable.studentId })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.courseId, course.id));
    if (students.length) {
      await tx.insert(attendanceRecordsTable).values(
        students.map(({ studentId }) => ({
          sessionId: created.id,
          studentId,
          status: "unverified" as const,
          method: "roster" as const,
        })),
      );
    }
    await tx.insert(auditLogsTable).values({
      actorUserId: user.id,
      action: "session.started",
      entityType: "class_session",
      entityId: String(created.id),
    });
    return created;
  });
  res.status(201).json(
    CreateSessionResponse.parse(await sessionSummary(session)),
  );
});

router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = currentUser(req);
  const [session] = await db
    .select()
    .from(classSessionsTable)
    .innerJoin(coursesTable, eq(coursesTable.id, classSessionsTable.courseId))
    .where(
      and(
        eq(classSessionsTable.id, params.data.sessionId),
        eq(coursesTable.ownerUserId, user.id),
      ),
    )
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const [attendance, observations] = await Promise.all([
    db
      .select({
        studentId: attendanceRecordsTable.studentId,
        studentName: studentsTable.name,
        studentNumber: studentsTable.studentNumber,
        status: attendanceRecordsTable.status,
        confidence: attendanceRecordsTable.confidence,
        updatedAt: attendanceRecordsTable.updatedAt,
        method: attendanceRecordsTable.method,
        note: attendanceRecordsTable.note,
      })
      .from(attendanceRecordsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, attendanceRecordsTable.studentId))
      .where(eq(attendanceRecordsTable.sessionId, session.class_sessions.id))
      .orderBy(studentsTable.name),
    db
      .select({
        label: engagementObservationsTable.label,
        value: engagementObservationsTable.value,
        observedAt: engagementObservationsTable.observedAt,
        dataQuality: engagementObservationsTable.dataQuality,
      })
      .from(engagementObservationsTable)
      .where(eq(engagementObservationsTable.sessionId, session.class_sessions.id))
      .orderBy(engagementObservationsTable.observedAt),
  ]);
  const response = {
    session: await sessionSummary(session.class_sessions),
    attendance: attendance.map((row) => ({
      ...row,
      confidence: row.confidence ?? null,
      updatedAt: row.updatedAt.toISOString(),
      note: row.note ?? null,
    })),
    observations: observations.map((row) => ({
      ...row,
      observedAt: row.observedAt.toISOString(),
    })),
  };
  res.json(GetSessionResponse.parse(response));
});

router.patch(
  "/sessions/:sessionId/attendance/:studentId",
  async (req, res): Promise<void> => {
    const params = UpdateAttendanceParams.safeParse(req.params);
    const body = UpdateAttendanceBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid attendance update" });
      return;
    }
    const user = currentUser(req);
    const [record] = await db
      .select({ attendance: attendanceRecordsTable, ownerUserId: coursesTable.ownerUserId })
      .from(attendanceRecordsTable)
      .innerJoin(classSessionsTable, eq(classSessionsTable.id, attendanceRecordsTable.sessionId))
      .innerJoin(coursesTable, eq(coursesTable.id, classSessionsTable.courseId))
      .where(
        and(
          eq(attendanceRecordsTable.sessionId, params.data.sessionId),
          eq(attendanceRecordsTable.studentId, params.data.studentId),
          eq(coursesTable.ownerUserId, user.id),
        ),
      )
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "Attendance record not found" });
      return;
    }
    const [updated] = await db
      .update(attendanceRecordsTable)
      .set({
        status: body.data.status,
        note: body.data.note ?? null,
        method: "manual",
        confidence: null,
        updatedByUserId: user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(attendanceRecordsTable.sessionId, params.data.sessionId),
          eq(attendanceRecordsTable.studentId, params.data.studentId),
        ),
      )
      .returning();
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, updated.studentId))
      .limit(1);
    await addAuditEntry(user.id, "attendance.corrected", "attendance", updated.id);
    res.json(
      UpdateAttendanceResponse.parse({
        studentId: updated.studentId,
        studentName: student?.name ?? "",
        studentNumber: student?.studentNumber ?? "",
        status: updated.status,
        confidence: updated.confidence,
        updatedAt: updated.updatedAt.toISOString(),
        method: updated.method,
        note: updated.note ?? null,
      }),
    );
  },
);

router.post("/sessions/:sessionId/end", async (req, res): Promise<void> => {
  const params = EndSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = currentUser(req);
  const [session] = await db
    .select()
    .from(classSessionsTable)
    .innerJoin(coursesTable, eq(coursesTable.id, classSessionsTable.courseId))
    .where(
      and(
        eq(classSessionsTable.id, params.data.sessionId),
        eq(coursesTable.ownerUserId, user.id),
      ),
    )
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const [ended] = await db
    .update(classSessionsTable)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(classSessionsTable.id, params.data.sessionId))
    .returning();
  await addAuditEntry(user.id, "session.ended", "class_session", ended.id);
  res.json(EndSessionResponse.parse(await sessionSummary(ended)));
});

router.get("/reports/attendance", async (req, res): Promise<void> => {
  const query = GetAttendanceReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = currentUser(req);
  const from = new Date(`${query.data.from}T00:00:00.000Z`);
  const until = new Date(`${query.data.to}T00:00:00.000Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  const filters = [
    eq(coursesTable.ownerUserId, user.id),
    gte(classSessionsTable.startedAt, from),
    lt(classSessionsTable.startedAt, until),
  ];
  if (query.data.courseId) {
    filters.push(eq(coursesTable.id, query.data.courseId));
  }
  const rows = await db
    .select({
      studentId: studentsTable.id,
      studentName: studentsTable.name,
      status: attendanceRecordsTable.status,
      sessionId: classSessionsTable.id,
    })
    .from(attendanceRecordsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, attendanceRecordsTable.studentId))
    .innerJoin(classSessionsTable, eq(classSessionsTable.id, attendanceRecordsTable.sessionId))
    .innerJoin(coursesTable, eq(coursesTable.id, classSessionsTable.courseId))
    .where(and(...filters));
  const grouped = new Map<number, { studentName: string; sessionIds: Set<number>; present: number; late: number; absent: number }>();
  for (const row of rows) {
    const entry = grouped.get(row.studentId) ?? {
      studentName: row.studentName,
      sessionIds: new Set<number>(),
      present: 0,
      late: 0,
      absent: 0,
    };
    entry.sessionIds.add(row.sessionId);
    if (row.status === "present") entry.present += 1;
    if (row.status === "late") entry.late += 1;
    if (row.status === "absent") entry.absent += 1;
    grouped.set(row.studentId, entry);
  }
  res.json(
    GetAttendanceReportResponse.parse(
      [...grouped.entries()].map(([studentId, row]) => {
        const sessions = row.sessionIds.size;
        return {
          studentId,
          studentName: row.studentName,
          sessions,
          present: row.present,
          late: row.late,
          absent: row.absent,
          attendanceRate: sessions ? Math.round(((row.present + row.late) / sessions) * 100) : 0,
          participationIndicator: null,
        };
      }),
    ),
  );
});

router.get("/privacy/consents", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const rows = await db
    .select({
      studentId: studentsTable.id,
      studentName: studentsTable.name,
      faceAnalysis: consentRecordsTable.faceAnalysis,
      audioParticipation: consentRecordsTable.audioParticipation,
      updatedAt: consentRecordsTable.updatedAt,
    })
    .from(studentsTable)
    .leftJoin(consentRecordsTable, eq(consentRecordsTable.studentId, studentsTable.id))
    .where(eq(studentsTable.ownerUserId, user.id))
    .orderBy(studentsTable.name);
  res.json(
    ListConsentsResponse.parse(
      rows.map((row) => ({
        studentId: row.studentId,
        studentName: row.studentName,
        faceAnalysis: row.faceAnalysis ?? false,
        audioParticipation: row.audioParticipation ?? false,
        updatedAt: row.updatedAt?.toISOString() ?? new Date(0).toISOString(),
      })),
    ),
  );
});

router.patch("/privacy/consents/:studentId", async (req, res): Promise<void> => {
  const params = UpdateConsentParams.safeParse(req.params);
  const body = UpdateConsentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid consent update" });
    return;
  }
  const user = currentUser(req);
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.id, params.data.studentId),
        eq(studentsTable.ownerUserId, user.id),
      ),
    )
    .limit(1);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const [consent] = await db
    .insert(consentRecordsTable)
    .values({
      studentId: student.id,
      faceAnalysis: body.data.faceAnalysis,
      audioParticipation: body.data.audioParticipation,
      updatedByUserId: user.id,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: consentRecordsTable.studentId,
      set: {
        faceAnalysis: body.data.faceAnalysis,
        audioParticipation: body.data.audioParticipation,
        updatedByUserId: user.id,
        updatedAt: new Date(),
      },
    })
    .returning();
  await addAuditEntry(user.id, "consent.updated", "student", student.id);
  res.json(
    UpdateConsentResponse.parse({
      studentId: student.id,
      studentName: student.name,
      faceAnalysis: consent.faceAnalysis,
      audioParticipation: consent.audioParticipation,
      updatedAt: consent.updatedAt.toISOString(),
    }),
  );
});

export default router;
