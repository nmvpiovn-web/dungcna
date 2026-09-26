-- ============================================================================
-- MIGRATION 0002: CLOUDFLARE D1 FULL TEXT SEARCH (FTS5) SCHEMA & TRIGGERS
-- Target: SQLite / Cloudflare D1 Native FTS5 Engine
-- Idempotent: Can be executed multiple times without duplicate records
-- ============================================================================

-- 1. Create Virtual Table using FTS5 for Second Brain Knowledge Vault
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  title,
  content_markdown,
  tags,
  folder,
  tokenize = 'unicode61'
);

-- 2. Trigger on Insert: Keep knowledge_fts automatically in sync
CREATE TRIGGER IF NOT EXISTS trg_knowledge_vault_ai AFTER INSERT ON knowledge_vault BEGIN
  DELETE FROM knowledge_fts WHERE id = new.id;
  INSERT INTO knowledge_fts(id, title, content_markdown, tags, folder)
  VALUES (new.id, new.title, new.content_markdown, new.tags, new.folder);
END;

-- 3. Trigger on Delete: Remove from knowledge_fts
CREATE TRIGGER IF NOT EXISTS trg_knowledge_vault_ad AFTER DELETE ON knowledge_vault BEGIN
  DELETE FROM knowledge_fts WHERE id = old.id;
END;

-- 4. Trigger on Update: Refresh knowledge_fts content
CREATE TRIGGER IF NOT EXISTS trg_knowledge_vault_au AFTER UPDATE ON knowledge_vault BEGIN
  DELETE FROM knowledge_fts WHERE id = old.id;
  INSERT INTO knowledge_fts(id, title, content_markdown, tags, folder)
  VALUES (new.id, new.title, new.content_markdown, new.tags, new.folder);
END;

-- 5. Idempotent Backfill: Populate pre-existing notes from knowledge_vault into knowledge_fts
INSERT INTO knowledge_fts(id, title, content_markdown, tags, folder)
SELECT kv.id, kv.title, kv.content_markdown, kv.tags, kv.folder
FROM knowledge_vault kv
WHERE kv.id NOT IN (SELECT id FROM knowledge_fts);
