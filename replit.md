# Classroom Pulse

A privacy-first attendance and classroom participation workspace for teachers and administrators.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/classroom-pulse` — React web application
- `artifacts/api-server/src/routes` — authenticated API routes
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema` — PostgreSQL/Drizzle schema
- `README.md` — setup, current scope, and privacy limitations

## Architecture decisions

- Clerk provides sign-in; the app stores its own role and scoped classroom records.
- Attendance corrections are explicitly manual and clear any AI confidence score.
- Optional visual/audio consent defaults to off; no raw recordings are stored.
- Participation observations are separate from attendance and are not measures of learning or emotion.

## Product

Teachers can organize courses and students, run sessions, review/correct attendance, configure optional processing consent, and export reports. Multimedia processing is a later phase and is not active in this version.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
