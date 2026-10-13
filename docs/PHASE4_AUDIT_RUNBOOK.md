# Quiz & Schedule Phase 4: Production Audit & Safe Release Runbook

> **Scope:** Phase 4 UI & Schema Hardening (`agy/quiz-schedule-ui-e2e-phase4`)
> **Security & Compliance:** Zero credentials/tokens/secrets included. Read-only verification and release instructions for maintainers/DevOps.

---

## 1. Production Read-Only Evidence

### 1.1 Schedule Schema Dual-Support (`class_sessions`)
- **Repo Schema (`0001_initial_schema.sql`):**
  Defines `class_sessions` with columns `room` (`TEXT`) and `topic` (`TEXT`).
- **Production Schema Evidence:**
  The Cloudflare D1 production database uses `room_notes` and `subject_topic` instead of `room` and `topic`.
- **Phase 4 Solution:**
  Dual schedule schema resolution via `PRAGMA table_info(class_sessions)`:
  - Base columns required: `id`, `class_name`, `session_date`, `start_time`, `end_time`.
  - Dynamic pair resolution: accepts `room_notes` (preferred) or `room`, and `subject_topic` (preferred) or `topic`.
  - Dynamic read, write, conflict check, and ownership assertion use the exact detected column names.
  - Fail-closed (HTTP 500) if PRAGMA fails or neither column pair member exists.
  - `formatSessionRow` normalizes legacy `row.topic` and `row.room` to `subject_topic` and `room_notes` for client API consistency.

### 1.2 Pending Migrations (0018 – 0022)
The following migrations are present in the repository and pending deployment to production D1:
- `0018_knowledge_fts_triggers_backfill.sql`: FTS triggers and backfill for knowledge search.
- `0019_seed_public_quiz_catalog.sql`: Seed curated public quizzes for initial catalog.
- `0020_quiz_question_provenance.sql`: Provenance tracking columns for quiz questions.
- `0021_quiz_auto_builder_defaults.sql`: Auto-builder configuration and default thresholds.
- `0022_quiz_bundle_sync_phase3.sql`: Distributed sync locks and audit events for Google Drive sync.

### 1.3 Quiz Catalog Production State
- **Current Production State:** 3 draft quizzes, 0 published quizzes.
- **Client Behavior:**
  - When `schema_ready === false` (e.g. before migrations run), the UI displays diagnostic setup guidance.
  - When `schema_ready === true` and 0 published quizzes exist, the UI renders the true empty state (`data-testid="quiz-catalog-empty"`) without false setup warnings.
  - Dedicated `/api/quiz-menu/readiness` endpoint with WeakMap-isolated per-DB caching separates readiness checks from standard catalog queries.

---

## 2. Safe Production Release Order

> [!CAUTION]
> Antigravity CLI does **not** execute remote D1 migrations during pull request development. The steps below must be executed by DevOps or the repository maintainer during scheduled release windows.

### Step 1: Pre-Flight Read-Only Checks
```bash
# 1. Verify remote migration list
npx wrangler d1 migrations list DB --remote

# 2. Check class_sessions schema columns
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(class_sessions);"

# 3. Verify current quiz count and draft/published breakdown
npx wrangler d1 execute DB --remote --command "SELECT status, count(*) AS count FROM quizzes GROUP BY status;"
```

### Step 2: Apply Pending Migrations
Apply migrations sequentially up to `0022`:
```bash
npx wrangler d1 migrations apply DB --remote
```

### Step 3: Verify Post-Migration Schema
```bash
# Verify new lock and event tables from 0022
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quiz_bundle_sync_locks', 'quiz_bundle_sync_events');"

# Verify quiz question provenance column from 0020
npx wrangler d1 execute DB --remote --command "PRAGMA table_info(quiz_questions);"
```

### Step 4: Deploy Cloudflare Pages Application
Deploy the merged application code (`main` branch) to Cloudflare Pages.

### Step 5: Post-Deployment Smoke Validation
1. **Readiness Endpoint:** Query `/api/quiz-menu/readiness` as staff; verify `schema_ready: true`.
2. **Schedule Endpoints:** Verify `GET /api/schedule` and `POST /api/schedule` for session create/edit.
3. **Quiz Menu:**
   - Verify unauthenticated users see the true-empty or seeded catalog without setup warning banners.
   - Verify staff users can open the Create tab with Auto builder mode active and review-first flow default.
