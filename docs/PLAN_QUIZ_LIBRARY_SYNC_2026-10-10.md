# Master Plan: Quiz Library Sync & Production Unification (2026-10-10)

## 1. Executive Summary & Production Baseline (2026-10-10 Asia/Bangkok)

An in-depth production database and API audit of Cloudflare D1 (`tienganh-pro-db` / `a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218`) and the web application identified the following system baseline:
- `GET /api/quiz-menu` returned `HTTP 200` with `quizzes: []`.
- D1 table counts: `quizzes = 2` (both in `draft` status), `quiz_questions = 0`, `quiz_bundles = 0`, `quiz_attempts = 0`, `homework_assignments = 0`.
- `question_bank = 1375` rows, 100% `published`, spanning Grades 1–12 and IELTS with structured cognitive levels and skill categories.
- `knowledge_vault = 5670` records, but `knowledge_fts = 102` (5,568 missing FTS entries). Crucially, **no database triggers** currently exist on `knowledge_vault` in production, meaning new knowledge notes do not sync to FTS.
- `drive_file_index = 1000`, `drive_sync_logs = 150`, recent sync logs completed with incremental scanning. However, there are no linked bundles in production and no bridge between the Question Bank / Knowledge Vault and the Quiz Builder UI.
- PWA/Mobile Navigation: Public user-facing "Học" was replaced with "Quiz" (`/quiz-menu`) in PR #26 (commit `5c7d2f9`). Issue #22 finalized and isolated test records cleaned.

## 2. Multi-Phase Roadmap

```
+-------------------------------------------------------------------------------+
| Phase 1 (PR #27): Data Integrity + Question Bank Bridge + Usable Catalog      |
|  - Migration 0018: Safe FTS Triggers + Idempotent Backfill (Runbook)          |
|  - Staff Question Bank Facets / Search API (No answer leak)                   |
|  - Staff Quiz Import API (Deterministic, Deduplicated, RBAC)                  |
|  - Public Catalog Seed (13 published quizzes, Grades 1-12 + IELTS)            |
|  - UI "Kho câu hỏi D1" Panel with preview & import + Navy/Dark Blue purge     |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Phase 2 (Next PR): Knowledge Vault + FTS Search / Import / AI Quiz Gen        |
|  - Connect 5,670 Knowledge Vault items to Quiz authoring                      |
|  - Full-text search & snippet extraction across vault topics                  |
|  - Auto-draft quiz generator from Vault lesson summaries                      |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Phase 3 (Next PR): Google Drive / Docs / DOCX Production E2E + Observability  |
|  - End-to-end sync between Google Docs lesson notes and Quiz Bundles          |
|  - 3-way synchronization (DOCX printable, Quiz interactive, Homework draft)   |
|  - Conflict resolution & sync health metrics                                  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Phase 4: Production Rollout, Regression Verification, Mobile/PWA Audit        |
|  - Run migration 0018 on remote D1 following strict operator runbook          |
|  - Seed remote D1 public catalog                                              |
|  - End-to-end mobile/PWA audit at 320px / 360px                               |
+-------------------------------------------------------------------------------+
```

---

### Phase 1 (PR #27): Data Integrity + Question Bank Bridge + Usable Catalog (Active)
1. **Safe FTS Recovery**:
   - Migration `migrations/0018_knowledge_fts_triggers_backfill.sql`: recreate 3 triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE`) on `knowledge_vault` and execute idempotent backfill (`WHERE id NOT IN (SELECT id FROM knowledge_fts)`).
   - Operator runbook: `docs/RUNBOOK_0018_KNOWLEDGE_FTS_MIGRATION.md` detailing pre-count, isolated execution, post-count verification, and rollback. **No remote D1 execution during this PR.**
2. **Question Bank Bridge API**:
   - `GET /api/quiz-menu/question-bank`: Staff-only facets, count, and paginated search. Strict exclusion of `correct_answer` and `explanation` from listing mode to prevent client leakage.
   - `POST /api/quiz-menu/[id]/import-questions`: Staff-only batch import from `question_bank` into draft quiz with RBAC (teacher own quiz, admin/leader all), validation, deduplication, deterministic order.
3. **Public Catalog Baseline**:
   - Seed migration `migrations/0019_seed_public_quiz_catalog.sql` creating 1 published quiz per grade (Grades 1–12 + IELTS = 13 quizzes) with 10–15 questions each.
   - Strict guest/student isolation: `GET /api/quiz-menu/[id]` redacts answers for non-staff; student homework assignment isolation preserved.
4. **UI Integration & Theme Overhaul**:
   - Add "Kho câu hỏi D1" source panel to `/quiz-menu` (Tab "Tạo Quiz") with live counters, multi-faceted filtering, question preview (no answer leakage outside teacher review mode), and responsive layout (320px/360px).
   - Purge navy/dark blue theme remnants (`#17283d`, `#0f172a`, etc.) in favor of ivory/white base, emerald/jade primary, coral/amber CTA/reward, and lavender accents.

---

### Phase 2: Knowledge Vault + FTS Search / Import / Generate
- Connect `knowledge_vault` (5,670 curated lesson notes) directly to the quiz editor.
- Search knowledge vault via `knowledge_fts` by keyword, topic, grade, grammar structure.
- One-click quiz generation from knowledge vault articles with source provenance citation.

---

### Phase 3: Google Drive / Docs / DOCX Production E2E + Sync Observability
- Seamless Drive import and continuous sync for 1,000 indexed files.
- Bi-directional sync validation: DOCX canonical lesson document <-> Interactive Quiz <-> Student Homework assignment.
- Observability dashboard: sync lag, conflict detection, automatic reconciliation.

---

### Phase 4: Production Rollout, Regression Verification, Mobile/PWA Audit
- Execute operator runbook for `0018` and `0019` against production D1.
- Full regression test across student, parent, teacher, and guest flows.
- Strict visual and tactile audit across 320px, 360px, 768px, and 1080px viewports.
