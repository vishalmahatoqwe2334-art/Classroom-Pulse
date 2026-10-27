import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import {
  coursesTable,
  db,
  teachersTable,
  usersTable,
  type UserRecord,
} from "@workspace/db";

export async function getOrCreateAppUser(req: Request): Promise<UserRecord> {
  const clerkUserId = getAuth(req).userId;
  if (!clerkUserId) {
    throw new Error("Authentication required");
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${clerkUserId}@unverified.invalid`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email;
  const metadataRole = clerkUser.publicMetadata.role;
  const configuredAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const requestedRole =
    metadataRole === "admin" || metadataRole === "student" || metadataRole === "teacher"
      ? metadataRole
      : configuredAdmins.includes(email.toLowerCase())
        ? "admin"
        : "teacher";

  const [user] = await db
    .insert(usersTable)
    .values({ clerkId: clerkUserId, name, email, role: requestedRole })
    .onConflictDoUpdate({
      target: usersTable.clerkId,
      set: {
        name,
        email,
        ...(configuredAdmins.includes(email.toLowerCase())
          ? { role: "admin" as const }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (user.role === "teacher") {
    await db
      .insert(teachersTable)
      .values({ userId: user.id })
      .onConflictDoNothing({ target: teachersTable.userId });
  }

  return user;
}

export async function requireCourseOwner(courseId: number, userId: number) {
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  if (!course || course.ownerUserId !== userId) return null;
  return course;
}
