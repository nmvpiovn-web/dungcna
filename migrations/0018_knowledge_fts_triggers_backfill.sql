-- ============================================================================
-- MIGRATION 0018: KNOWLEDGE FTS TRIGGERS REPAIR & IDEMPOTENT BACKFILL
-- Target: SQLite / Cloudflare D1 Native FTS5 Engine
-- Idempotent: Can be safely executed multiple times without duplicates or data loss
-- ============================================================================

-- 1. Ensure triggers are clean and recreated properly
DROP TRIGGER IF EXISTS trg_knowledge_vault_ai;
DROP TRIGGER IF EXISTS trg_knowledge_vault_au;
DROP TRIGGER IF EXISTS trg_knowledge_vault_ad;

-- 2. Trigger on Insert: Keep knowledge_fts automatically in sync
CREATE TRIGGER trg_knowledge_vault_ai AFTER INSERT ON knowledge_vault BEGIN
  DELETE FROM knowledge_fts WHERE id = new.id;
  INSERT INTO knowledge_fts(id, title, content_markdown, tags, folder)
  VALUES (new.id, new.title, new.content_markdown, new.tags, new.folder);
END;

-- 3. Trigger on Delete: Remove from knowledge_fts
CREATE TRIGGER trg_knowledge_vault_ad AFTER DELETE ON knowledge_vault BEGIN
  DELETE FROM knowledge_fts WHERE id = old.id;
END;

-- 4. Trigger on Update: Refresh knowledge_fts content
CREATE TRIGGER trg_knowledge_vault_au AFTER UPDATE ON knowledge_vault BEGIN
  DELETE FROM knowledge_fts WHERE id = old.id;
  INSERT INTO knowledge_fts(id, title, content_markdown, tags, folder)
  VALUES (new.id, new.title, new.content_markdown, new.tags, new.folder);
END;

-- 5. Idempotent Backfill: Populate missing notes from knowledge_vault into knowledge_fts
-- Preserves existing 102 indexed records and inserts only rows currently missing
INSERT INTO knowledge_fts(id, title, content_markdown, tags, folder)
SELECT kv.id, kv.title, kv.content_markdown, kv.tags, kv.folder
FROM knowledge_vault kv
WHERE kv.id NOT IN (SELECT id FROM knowledge_fts);
