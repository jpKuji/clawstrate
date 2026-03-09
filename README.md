# Clawstrate

Behavioral intelligence platform for the AI agent economy.

## Overview

Clawstrate monitors, classifies, and scores autonomous AI agents operating across decentralized platforms and blockchain registries. It ingests raw activity data from multiple sources, enriches it with LLM-driven classification, computes behavioral scores using graph analysis, detects coordination patterns, and distills everything into executive briefings -- all running as a serverless pipeline on Vercel.

The system answers a simple question: in an economy where AI agents act autonomously, how do you know which ones matter, what they're doing, and whether they're working together?

The dashboard surfaces agent profiles, topic intelligence, interaction networks, coordination alerts, and auto-generated narrative briefings updated every six hours.

## Architecture

```
Sources             Pipeline (serverless, cursor-based)              Dashboard
--------    ---------------------------------------------------    -----------

Moltbook  ─┐                                                      ┌─ Agent Profiles
            │    ┌────────┐   ┌────────┐   ┌─────────┐            │
RentAHuman ─┼──> │ Ingest │──>│ Enrich │──>│ Analyze │──┐         ├─ Topic Intelligence
            │    └────────┘   └────────┘   └─────────┘  │         │
ERC-4337  ─┤     fetch &       Claude       PageRank    │         ├─ Network Graph
            │    normalize     Haiku        + scoring    │         │
ERC-8004  ─┘                                            v         ├─ Coordination Alerts
                              ┌───────────┐   ┌──────────────┐    │
                              │ Aggregate │──>│ Coordination │──┐ ├─ Briefings (6h/weekly)
                              └───────────┘   └──────────────┘  │ │
                               daily stats     temporal +       │ └─ Search & Marketplace
                               + co-occur.     content clusters │
                                                                v
                                                          ┌──────────┐
                                                          │ Briefing │──> REST API ──> UI
                                                          └──────────┘
                                                           Claude Sonnet
                                                           narratives

  Orchestration: QStash scheduled jobs
  State: cursor-based watermarks (idempotent re-runs)
  Locking: Redis distributed locks (SET NX EX)
```

## Key Features

- **Multi-source ingestion** from forum platforms, marketplace APIs, and on-chain agent registries (ERC-4337/8004)
- **LLM-driven enrichment** classifying sentiment, originality, independence, and coordination signals per action
- **PageRank influence scoring** over 7-day interaction graphs with quality-weighted edges
- **Coordination detection** via temporal clustering, content similarity (Jaccard), and reply clique analysis
- **Semantic topic deduplication** using token-based hashing and LLM-assisted merge proposals
- **Auto-generated briefings** every 6 hours (Claude Sonnet) with cited agents, topics, and metrics
- **Interactive network visualization** with D3-force graph rendering
- **Full-text search** across agents, actions, and topics
- **Pipeline observability** with run history, stage logs, and telemetry endpoints

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix primitives |
| Data Viz | D3-force (network graphs), Recharts |
| Database | PostgreSQL (Neon serverless) + Drizzle ORM |
| AI | Claude Haiku (enrichment), Claude Sonnet (narratives) |
| Job Scheduling | QStash (Upstash) |
| Distributed Locking | Upstash Redis |
| Blockchain | Viem (ERC-4337/8004 contract reads) |
| Validation | Zod |
| Testing | Vitest, Testing Library |
| Deployment | Vercel (serverless functions) |

## Engineering Highlights

**Idempotent cursor-based pipeline** -- Each stage tracks a processing watermark in the database. Re-runs only process data newer than the last cursor, making the entire pipeline safe to retry without duplication or data loss.

**Budget-aware serverless execution** -- Every stage is designed to complete within Vercel's 300-second function timeout. Enrichment processes 30 actions per run, analysis uses chunked 500-item batch inserts, and coordination caps candidates at 40 per agent. The system does useful work in small, predictable increments.

**Distributed locking via Redis** -- Pipeline stages acquire exclusive locks using `SET NX EX` with ownership verification on release. Prevents concurrent execution of the same stage across multiple serverless invocations.

**Split pipeline architecture** -- Two execution modes: orchestrated (sequential ingest-then-enrich, default) and split (each stage on its own QStash schedule). Split mode enables independent scaling and avoids timeout cascades under load.

**Multi-standard blockchain ingestion** -- Reads ERC-4337 (account abstraction) and ERC-8004 agent registries across multiple chains, normalizes the data into the same schema used by platform sources, and extracts topics via LLM.

**Semantic topic deduplication** -- Normalizes topic names, extracts significant tokens (skipping stop words), generates order-insensitive hash signatures, then batches similar candidates through an LLM for merge proposals with confidence scores.

**PageRank with quality multipliers** -- Influence scores computed over interaction edges, weighted by engagement metrics and content quality signals from enrichment. Normalized to [0,1] against the network maximum.

**Coordination detection at three levels** -- Temporal (3+ agents on same topic within 2h), content-based (Jaccard distance on topic vectors), and structural (reply cliques with >80% internal interaction ratio).

## Screenshots

> Add screenshots of the dashboard, network graph, agent profiles, and briefings here.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (or [Neon](https://neon.tech) serverless)
- Upstash Redis instance
- Anthropic API key

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Redis (locking + caching)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Sources
MOLTBOOK_API_KEY=...

# Job scheduling (QStash)
QSTASH_TOKEN=...
QSTASH_URL=https://...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...

# Security
CRON_SECRET=...

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Install and Run

```bash
npm install
npm run dev
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with coverage |
| `npm run lint` | ESLint |
| `npm run pitch:build` | Build pitch deck artifacts |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── v1/                 # REST API (agents, topics, graph, search, onchain...)
│   │   └── cron/               # Pipeline stages (ingest, enrich, analyze, aggregate,
│   │                           #   coordination, briefing, onchain, topic-merges)
│   └── (pages)/                # Dashboard routes (agents, topics, network, briefings...)
│
├── lib/
│   ├── pipeline/               # Stage implementations, cursors, locking, orchestration
│   ├── onchain/                # ERC-4337/8004 contract integration
│   ├── sources/                # Platform adapters (Moltbook, RentAHuman)
│   ├── topics/                 # Semantic merge engine
│   ├── db/schema.ts            # Drizzle schema (30+ tables)
│   └── redis.ts                # Distributed lock primitives
│
├── components/                 # React UI (shadcn + custom dashboard components)
└── hooks/                      # Custom React hooks

drizzle/                        # Database migrations
content/pitch/                  # Pitch deck source content
```
