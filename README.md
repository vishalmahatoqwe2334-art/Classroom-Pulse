# Classroom Pulse

Classroom Pulse is a privacy-first workspace for teachers and administrators to manage classes, review attendance, and summarize classroom participation indicators.

## Current phase

This first phase provides Clerk sign-in, role-aware application profiles, course and student management, class sessions, manual attendance recording and correction, consent controls, attendance reports, and the PostgreSQL schema/API foundation.

Multimedia attendance processing, face matching, live audio/video analysis, and automatic engagement inference are **not implemented**. No raw video or audio is collected or stored. The UI and API treat attendance as a human-reviewed record; session indicators are stored separately and may be absent.

## Run locally

The Replit workspace provisions the PostgreSQL database and manages Clerk credentials. Do not put credentials in source control.

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

Run the web app through the managed `artifacts/classroom-pulse: web` workflow so its base path and proxy settings are provided automatically.

To grant administrator access, configure the comma-separated `ADMIN_EMAILS` environment variable in the workspace secrets/environment settings. Other new accounts default to the teacher role. Server-side routes enforce the role and ownership context; hiding a page in the client is not the authorization boundary.

## Main pages

- Dashboard — class totals, today's attendance, and recent sessions
- Attendance — start a class session, inspect the roster, and manually correct attendance
- Students and courses — maintain rosters, class details, and enrollment
- History and reports — review completed sessions and export date-filtered results
- Privacy — view or change optional face-analysis and audio-participation consent
- Sign-in and sign-up — Clerk-managed account flows

## API and database

The API contract is `lib/api-spec/openapi.yaml` (served under `/api`). Regenerate TypeScript/Zod clients after contract changes:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Database models are in `lib/db/src/schema/`. Push development schema changes with:

```sh
pnpm --filter @workspace/db run push
```

The schema includes users, teacher profiles, students, courses, enrollments, class sessions, attendance records, engagement observations, notifications, audit logs, and consent records.

## Privacy and model limitations

- Face-analysis and audio-participation consent are separate, optional controls and default to off.
- Attendance updates made by a teacher are labeled as manual; a confidence score is removed when a teacher corrects a record.
- No AI-generated engagement score is used to mark attendance or penalize a student.
- A missing or low-quality signal must be treated as insufficient data, not disengagement.
- Participation indicators are descriptive session observations only; they do not establish attention, understanding, emotion, or learning outcomes.
- Avoid collecting biometric templates, transcripts, or raw recordings unless the institution explicitly authorizes a future feature and establishes retention and access rules.
- Access is authenticated and records are scoped to the owning teacher's classes. Application roles are checked on the server.

Before enabling any future multimedia processing, obtain informed consent as required by the institution and applicable law, document retention/deletion periods, limit access, and provide a non-biometric manual alternative.

## Verification

```sh
pnpm run typecheck
```
