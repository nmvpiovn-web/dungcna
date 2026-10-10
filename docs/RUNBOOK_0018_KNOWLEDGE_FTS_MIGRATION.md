# Runbook: Migration 0018 Knowledge Vault FTS Triggers Repair & Backfill

> **CRITICAL OPERATIONAL GUARDRAIL:**
> **DO NOT apply this migration to remote production D1 during PR #27.**
> This runbook is provided for operator review, testing on local/fixture environments, and co-auditing with Codex before Phase 4 scheduled production execution.

---

## 1. Problem Statement & Baseline
- **Observed Production State (2026-10-10 Asia/Bangkok)**:
  - `SELECT count(*) FROM knowledge_vault` -> `5,670` rows.
  - `SELECT count(*) FROM knowledge_fts` -> `102` rows.
  - `SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'knowledge_vault'` -> `0` triggers.
- **Root Cause**:
  Triggers were omitted or dropped during prior schema migrations, preventing automatic synchronization from `knowledge_vault` to `knowledge_fts`. Additionally, 5,568 existing rows in `knowledge_vault` were never indexed into FTS.

---

## 2. Pre-Migration Verification (Dry Run / Production Audit)

Run the following queries to capture baseline counts prior to migration:

```bash
npx wrangler d1 execute DB --remote --command "
  SELECT 'vault_count' AS metric, COUNT(*) AS count FROM knowledge_vault
  UNION ALL
  SELECT 'fts_count' AS metric, COUNT(*) AS count FROM knowledge_fts
  UNION ALL
  SELECT 'missing_fts' AS metric, COUNT(*) AS count FROM knowledge_vault WHERE id NOT IN (SELECT id FROM knowledge_fts)
  UNION ALL
  SELECT 'trigger_count' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault';
"
```

**Expected Pre-Migration Counts**:
- `vault_count`: ~5,670
- `fts_count`: ~102
- `missing_fts`: ~5,568
- `trigger_count`: 0

---

## 3. Execution Procedure

When approved by Codex maintainer/auditor for Phase 4 deployment:

### Option A: Standard Migration Apply (Recommended)
```bash
npx wrangler d1 migrations apply DB --remote
```
Confirm that `0018_knowledge_fts_triggers_backfill.sql` is listed and applied.

### Option B: Direct Execution via File
```bash
npx wrangler d1 execute DB --remote --file=./migrations/0018_knowledge_fts_triggers_backfill.sql
```

---

## 4. Post-Migration Verification

Run the verification suite:

```bash
npx wrangler d1 execute DB --remote --command "
  SELECT 'vault_count' AS metric, COUNT(*) AS count FROM knowledge_vault
  UNION ALL
  SELECT 'fts_count' AS metric, COUNT(*) AS count FROM knowledge_fts
  UNION ALL
  SELECT 'missing_fts' AS metric, COUNT(*) AS count FROM knowledge_vault WHERE id NOT IN (SELECT id FROM knowledge_fts)
  UNION ALL
  SELECT 'trigger_count' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault';
"
```

**Expected Post-Migration Counts**:
- `vault_count`: ~5,670 (Unchanged — no data loss)
- `fts_count`: ~5,670 (Equal to vault_count)
- `missing_fts`: 0
- `trigger_count`: 3 (`trg_knowledge_vault_ai`, `trg_knowledge_vault_au`, `trg_knowledge_vault_ad`)

### Verify Trigger Names and Definitions:
```bash
npx wrangler d1 execute DB --remote --command "
  SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault';
"
```

### Trigger Liveness Test:
To verify runtime synchronization without polluting production:
```bash
# 1. Insert canary note
npx wrangler d1 execute DB --remote --command "
  INSERT INTO knowledge_vault (id, title, content_markdown, tags, folder)
  VALUES ('canary_fts_test', 'Canary Title', 'Canary Content FTS Test', 'test', 'system');
"

# 2. Verify canary exists in FTS
npx wrangler d1 execute DB --remote --command "
  SELECT id, title FROM knowledge_fts WHERE id = 'canary_fts_test';
"

# 3. Update canary note
npx wrangler d1 execute DB --remote --command "
  UPDATE knowledge_vault SET title = 'Canary Updated' WHERE id = 'canary_fts_test';
  SELECT id, title FROM knowledge_fts WHERE id = 'canary_fts_test';
"

# 4. Clean up canary note and confirm deletion in FTS
npx wrangler d1 execute DB --remote --command "
  DELETE FROM knowledge_vault WHERE id = 'canary_fts_test';
  SELECT COUNT(*) AS fts_canary_count FROM knowledge_fts WHERE id = 'canary_fts_test';
"
# Expected fts_canary_count: 0
```

---

## 5. Rollback Plan

If backfill performance causes execution timeout or issues:

```sql
-- 1. Drop created triggers
DROP TRIGGER IF EXISTS trg_knowledge_vault_ai;
DROP TRIGGER IF EXISTS trg_knowledge_vault_au;
DROP TRIGGER IF EXISTS trg_knowledge_vault_ad;

-- Note: The backfill simply inserted missing rows into knowledge_fts.
-- It did NOT mutate or delete any knowledge_vault records.
-- If resetting knowledge_fts to prior 102 state is strictly required:
-- DELETE FROM knowledge_fts WHERE id NOT IN (SELECT id FROM knowledge_fts_pre_backup);
```
