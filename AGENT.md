# AGENT.md — AI Agent Onboarding & Technical Handbook

Welcome, AI Agent! This document serves as your primary context guide, architectural blueprint, code standard specification, and repository sitemap for working on the **Audio Streaming SaaS Backend**.

---

## 📌 Repository Overview & Purpose

This repository is a **scalable, multi-tenant Audio Streaming Backend Platform** built as a **Modular Monolith** in TypeScript / Node.js. It handles music/audio asset uploads, asynchronous FFmpeg transcoding to HLS format, fine-grained access control (FGA), tiered & metered billing with Stripe, transactional event queues via BullMQ, and batch engagement analytics flushing.

### Core Architectural Concepts

- **Modular Monolith Architecture**: Domain logic is separated into independent modules inside [`src/modules/`](src/modules).
- **Fine-Grained Authorization (ReBAC)**: Fine-grained permissions powered by [OpenFGA](fga/model.fga) (Artist delegation, private/public playlist & album visibility).
- **Transactional Outbox Pattern**: Asynchronous side-effects (FGA updates, S3 teardown, Auth0 user sync) use BullMQ workers to ensure eventual consistency without breaking transactional boundaries.
- **Audio Transcoding Pipeline**: Direct-to-S3 presigned upload workflow paired with an isolated FFmpeg audio transcoding container ([`audio-processing-container`](audio-processing-container)).
- **High-Throughput Batch Engagement**: Redis buffers stream/play counts and likes before batch flushing to PostgreSQL via the [`packages/engagement-bg-svc`](packages/engagement-bg-svc) service.
- **Tiered & Metered Stripe Billing**: Subscription management (`FREE`, `LITE`, `PRO`) alongside pay-as-you-go API key consumer metered billing.

---

## 📁 Repository Structure Map

```bash
.
├── src/                          # Main Express Application Source
│   ├── config/                   # Zod-validated environment config, Pino logger, system constants
│   ├── lib/                      # Infrastructure clients (Prisma, Auth0, OpenFGA, Stripe, Redis, S3)
│   ├── middleware/               # Auth, Metered Billing, Rate Limiting, Zod Validation, Error Handlers
│   ├── modules/                  # Domain-Driven Modules (Modular Monolith)
│   │   ├── album/                # Album lifecycle, tracklist reordering & publishing limits
│   │   ├── artist/               # Profiles, manager delegation & follower graphs
│   │   ├── payment/              # Stripe webhooks, checkout sessions & setup intents
│   │   ├── playlist/             # Playlist CRUD, capacity limits & re-sequencing
│   │   ├── search/               # Trigram index multi-entity search
│   │   ├── track/                # Audio uploads, stream links, likes & batch plays
│   │   └── user/                 # Profile lifecycle, Auth0 sync & API Key management
│   ├── queues/                   # BullMQ worker implementations & outbox event handlers
│   └── index.ts                  # Server entrypoint
├── auth0/                         # Auth0 Tenant Actions & User Sync Scripts
│   ├── actions/                  # Post-Registration & Post-Login Action handlers
│   └── README.md                 # Auth0 Secrets & Dashboard configuration guide
├── audio-processing-container/   # (Git Submodule) FFmpeg Audio Transcoding Service
├── packages/
│   └── engagement-bg-svc/        # Microservice: Redis-to-PostgreSQL Batch Engagement Flush
├── fga/                          # OpenFGA Authorization Model Spec (model.fga)
├── prisma/                       # PostgreSQL Database Schema & Migrations
├── docs/                         # Architectural & Infrastructure Docs (See docs/INDEX.md)
│   └── INDEX.md                  # Comprehensive Documentation Sitemap
├── docker-compose.yaml           # Local Services (PostgreSQL + Isolated Redis Instances)
├── vitest.config.ts              # Unit & Integration Test Configuration
└── package.json                  # Dependencies & Script Definitions
```

---

## 🛠️ Technology Stack

| Component                | Technology / Library                          | Description                                                  |
| :----------------------- | :-------------------------------------------- | :----------------------------------------------------------- |
| **Runtime & Language**   | Node.js (v20+), TypeScript (v5.9+)            | Strict TS compilation, ES Modules (`"type": "module"`)       |
| **HTTP Framework**       | Express.js (v5.2)                             | Route controllers, Zod validation middleware                 |
| **Database & ORM**       | PostgreSQL, Prisma ORM (`@prisma/adapter-pg`) | Type-safe queries & migration workflows                      |
| **Auth & Security**      | Auth0 (JWT), OpenFGA (`@openfga/sdk`)         | ReBAC authorization model ([`fga/model.fga`](fga/model.fga)) |
| **Queues & Cache**       | Redis (`ioredis`), BullMQ                     | Transactional outbox pattern & sliding window rate limiting  |
| **Storage & Processing** | AWS S3 SDK, FFmpeg Container                  | Presigned upload URLs & HLS audio transcoding                |
| **Billing & Payments**   | Stripe SDK                                    | Subscriptions & Metered Usage API                            |
| **Documentation**        | OpenAPI 3.0, Swagger UI                       | Schema generation via `@asteasolutions/zod-to-openapi`       |
| **Testing & Quality**    | Vitest, Supertest, Husky, Commitlint          | Automated pre-commit hooks and unit/integration tests        |

---

## ⚡ Development & Execution Commands

When building features, running tests, or inspecting the workspace, use these standard commands:

```bash
# Start main application in watch mode (tsx)
npm run dev

# Compile TypeScript to dist/
npm run build

# Start production build
npm run start

# Database migration & Prisma Client generation
npm run migrate
npm run gen

# Run unit and integration tests (Vitest)
npm run test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Prettier Code Formatting
npm run format

# Validate recent commits against Conventional Commits spec
npm run lint-commits
```

---

## 🤝 Code Conventions & Guardrails for AI Agents

When implementing modifications or writing new code in this codebase, adhere strictly to the following conventions:

### 1. Architectural Guardrails

- **Module Isolation**: Keep domain logic inside its respective module within [`src/modules/`](src/modules). Do not create tight direct cross-module couplings; leverage domain services or event queues where appropriate.
- **Outbox Pattern for External Side-Effects**: Database writes that trigger external changes (e.g. OpenFGA tuple updates, S3 file deletions) MUST use the Transactional Outbox pattern via BullMQ ([`src/queues/`](src/queues)) rather than executing direct asynchronous calls inside HTTP handler transactions.
- **Zod Schema Validation**: Request parameters, queries, and bodies must be validated using Zod schemas registered with `@asteasolutions/zod-to-openapi` to keep Swagger documentation (`/api-docs`) automatically in sync.

### 2. Git Commit Standards (Commitlint Enforced)

Commits MUST adhere strictly to Conventional Commits format (`<type>(<scope>): <subject>`):

- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- **Max Header Length**: **200 characters** (enforced by [`commitlint.config.js`](commitlint.config.js)).
- **Examples**:
  - `feat(track): add presigned upload S3 endpoint for raw flac files`
  - `fix(payment): resolve Stripe webhook idempotency header verification`

### 3. Testing Requirements

- Always run `npm run test` after editing code to ensure no regression was introduced.
- Tests are located in test files ending with `.test.ts` or `.spec.ts` using **Vitest** and **Supertest**.
- Do NOT patch tests by commenting out broken assertions or returning dummy fallbacks. Address the underlying contract violation.

---

## 📚 Technical Documentation

All module specifications, sequence flows, tier limit matrices, dynamic caching strategies, and infrastructure architecture documents are centralized in the documentation index:

👉 **[docs/INDEX.md](docs/INDEX.md)** — Complete Documentation Sitemap & Index
