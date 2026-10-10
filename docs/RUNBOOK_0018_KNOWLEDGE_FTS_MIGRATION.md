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

## 2. Migration Ledger Inspection (CRITICAL: Do Not Blind-Apply)

Before running any migration, inspect the D1 migration ledger to verify which migrations are already applied and which are pending:

```bash
npx wrangler d1 migrations list DB --remote
```

**Ledger Checklist**:
- Verify `0017_users_approval_status.sql` is marked as applied.
- Note pending migrations: `0018_knowledge_fts_triggers_backfill.sql`, `0019_seed_public_quiz_catalog.sql`, `0020_quiz_question_provenance.sql`.
- **WARNING**: Running `wrangler d1 migrations apply DB --remote` will execute ALL pending migrations sequentially. If you only intend to apply migration 0018 in an isolated deployment step, use **Option B (Direct File Execution)** below or ensure the team has authorized all pending migrations in the batch.

---

## 3. Pre-Migration Backup & Dry-Run Verification

### Step 3.1: Create Explicit Backup Table
To guarantee a 100% reversible operation, create a snapshot of the current 102 `knowledge_fts` rows:

```bash
npx wrangler d1 execute DB --remote --command "
  CREATE TABLE IF NOT EXISTS knowledge_fts_pre_backup AS SELECT * FROM knowledge_fts;
  SELECT 'backup_created' AS status, COUNT(*) AS backup_row_count FROM knowledge_fts_pre_backup;
"
```
*Expected output: `backup_row_count = 102`*.

### Step 3.2: Capture Baseline Counts (Dry Run / Pre-Count)
Run the following query (using `NOT EXISTS` to remain immune to `NULL` semantics):

```bash
npx wrangler d1 execute DB --remote --command "
  SELECT 'vault_count' AS metric, COUNT(*) AS count FROM knowledge_vault
  UNION ALL
  SELECT 'fts_count' AS metric, COUNT(*) AS count FROM knowledge_fts
  UNION ALL
  SELECT 'missing_fts' AS metric, COUNT(*) AS count FROM knowledge_vault kv WHERE NOT EXISTS (SELECT 1 FROM knowledge_fts fts WHERE fts.id = kv.id)
  UNION ALL
  SELECT 'trigger_count' AS metric, COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault';
"
```

**Expected Baseline Counts**:
- `vault_count`: ~5,670
- `fts_count`: ~102
- `missing_fts`: ~5,568
- `trigger_count`: 0

---

## 4. Execution Procedure

When approved by Codex maintainer/auditor for Phase 4 deployment:

### Option A: Direct Execution via File (Recommended for Isolated Migration 0018)
```bash
npx wrangler d1 execute DB --remote --file=./migrations/0018_knowledge_fts_triggers_backfill.sql
```

### Option B: Batch Migration Apply (When applying full ledger 0018-0020)
```bash
npx wrangler d1 migrations apply DB --remote
```

---

## 5. Post-Migration Verification

Run the verification suite:

```bash
npx wrangler d1 execute DB --remote --command "
  SELECT 'vault_count' AS metric, COUNT(*) AS count FROM knowledge_vault
  UNION ALL
  SELECT 'fts_count' AS metric, COUNT(*) AS count FROM knowledge_fts
  UNION ALL
  SELECT 'missing_fts' AS metric, COUNT(*) AS count FROM knowledge_vault kv WHERE NOT EXISTS (SELECT 1 FROM knowledge_fts fts WHERE fts.id = kv.id)
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
Verify runtime synchronization with a temporary canary record:
```bash
# 1. Insert canary note
npx wrangler d1 execute DB --remote --command "
  INSERT INTO knowledge_vault (id, title, content_markdown, tags, folder)
  VALUES ('canary_fts_test', 'Canary Title', 'Canary Content FTS Test', 'test', 'system');
"

# 2. Verify canary automatically exists in FTS via trigger
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

## 6. Rollback Plan

If backfill execution fails, times out, or produces unexpected state:

### Step 6.1: Drop Created Triggers
```sql
DROP TRIGGER IF EXISTS trg_knowledge_vault_ai;
DROP TRIGGER IF EXISTS trg_knowledge_vault_au;
DROP TRIGGER IF EXISTS trg_knowledge_vault_ad;
```

### Step 6.2: Restore FTS from Backup Table
If `knowledge_fts_pre_backup` was created in Step 3.1:
```sql
-- Remove newly backfilled rows that were not in the pre-migration snapshot
DELETE FROM knowledge_fts
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_fts_pre_backup bkp WHERE bkp.id = knowledge_fts.id
);

-- Verify count returned to original 102
SELECT COUNT(*) AS fts_restored_count FROM knowledge_fts;
```

### Step 6.3: Clean Up Backup Table (After Verification)
```sql
DROP TABLE IF EXISTS knowledge_fts_pre_backup;
```
