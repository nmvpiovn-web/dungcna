-- ============================================================================
-- MIGRATION 0002: CLOUDFLARE D1 FULL TEXT SEARCH (FTS5) SCHEMA & TRIGGERS
-- Target: SQLite / Cloudflare D1 Native FTS5 Engine
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
