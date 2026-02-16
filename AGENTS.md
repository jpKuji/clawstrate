# AGENTS.md

Project guide for AI coding agents working in this repository.

## 1) Goal of this codebase

Clawstrate is a Next.js application for agent-economy intelligence.
It ingests platform activity, enriches it with AI analysis, stores results in Postgres, and serves dashboards + API endpoints.

## 2) Communication style (important)

- Use plain language. Avoid unnecessary CS jargon.
- When a concept is complex, explain it in simple words and with concrete examples.
- If you ask questions, make sure the user can understand exactly what each choice means.
- Prefer practical, step-by-step guidance over abstract theory.

## 3) Stack and key architecture

- Framework: Next.js App Router (`src/app`)
- Language: TypeScript (`strict: true`)
- UI: React 19 + Tailwind CSS 4 + Radix/shadcn-style components
- DB: Postgres + Drizzle ORM (`src/lib/db`, migrations in `drizzle/`)
- Jobs/Pipeline: cron routes in `src/app/api/cron/*` and pipeline logic in `src/lib/pipeline/*`
- Tests: Vitest (+ Testing Library for React components)

## 4) Important directories

- `src/app`: routes, pages, API handlers
- `src/components`: UI and feature components
- `src/lib/pipeline`: ingest -> aggregate -> enrich -> analyze -> coordination -> briefing flow
- `src/lib/db`: database schema and access
- `src/lib/sources`: source adapters (e.g. Moltbook, RentAHuman)
- `scripts`: operational scripts (topic merges, pitch pack, setup helpers)
- `content/pitch`: source-of-truth pitch content
- `public/pitch`: generated pitch artifacts (built from content + code)

## 5) Local workflow

1. Install dependencies: `npm install`
2. Set env vars in `.env.local`
3. Start dev server: `npm run dev`

Note: `npm run dev` and `npm run build` run `pitch:build` first.

## 6) Commands to know

- `npm run dev`: build pitch pack, then start Next.js dev server
- `npm run build`: build pitch pack, then production build
- `npm run start`: run production server
- `npm run lint`: ESLint
- `npm run test`: run all tests once
- `npm run test:watch`: test watch mode
- `npm run test:coverage`: coverage run
- `npm run pitch:build`: generate files under `public/pitch`
- `npm run pitch:verify`: verify pitch contract files

## 7) Environment variables (names only)

Never commit real secrets. Keep values in `.env.local`.

Core keys used by this repo:

- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ANTHROPIC_API_KEY`
- `MOLTBOOK_API_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_BASE_URL`
- `QSTASH_TOKEN`
- `QSTASH_URL`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

Optional/source tuning keys seen in code:

- `AUTO_TOPIC_MERGE`
- `RENTAHUMAN_BOUNTIES_MAX`
- `RENTAHUMAN_ASSIGNMENT_BOUNTY_MAX`
- `RENTAHUMAN_BOUNTIES_STATUS`

## 8) Rules for safe changes

- Make minimal, targeted edits.
- Keep existing patterns and naming style.
- Do not expose or print secret values.
- Do not manually edit generated artifacts unless necessary.
- If you modify pitch source or pitch contract code, run `npm run pitch:build` and `npm run pitch:verify`.
- If you modify DB schema, create/update Drizzle migration files in `drizzle/`.
- If you modify pipeline or API behavior, run relevant tests before finishing.

## 9) Testing expectations

- For small changes: run focused tests first.
- Before handoff (when possible): run at least `npm run test` and `npm run lint`.
- If full test/lint is too heavy, run the closest targeted tests and clearly state what was not run.

## 10) Definition of done for agent tasks

A task is complete when:

- requested code changes are implemented,
- related tests/checks are run (or explicitly skipped with reason),
- docs/comments are updated when needed,
- and the final explanation is short, clear, and understandable for a self-taught developer.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.
