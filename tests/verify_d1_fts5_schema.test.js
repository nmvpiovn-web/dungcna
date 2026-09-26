import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

describe('D1 FTS5 SCHEMA MIGRATION, IDEMPOTENCY & BACKFILL AUDIT SUITE', () => {
  let db;
  let vaultData;

  before(() => {
    db = new DatabaseSync(':memory:');
    vaultData = JSON.parse(fs.readFileSync('src/lib/data/second_brain_vault.json', 'utf8'));

    // 1. Create base knowledge_vault table
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_vault (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        folder TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT,
        content_markdown TEXT,
        source_path TEXT,
        source_hash TEXT,
        status TEXT DEFAULT 'active',
        updated_at TEXT
      );
    `);

    // 2. Pre-populate all 102 existing notes from second_brain_vault.json
    const insertStmt = db.prepare(`
      INSERT INTO knowledge_vault (id, title, folder, category, tags, content_markdown, source_path, source_hash, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    db.exec('BEGIN TRANSACTION');
    vaultData.notes.forEach(note => {
      insertStmt.run(
        note.id,
        note.title,
        note.folder || 'Default',
        note.category || 'General',
        JSON.stringify(note.tags || []),
        note.content || note.raw || note.title,
        note.source_path || null,
        note.source_hash || null,
        'active',
        note.updated_at || '2026-09-27'
      );
    });
    db.exec('COMMIT');
  });

  test('FTS5-01: First execution of Migration 0002 creates virtual table, triggers, and backfills exactly 102 notes', () => {
    const migrationSql = fs.readFileSync('migrations/0002_create_knowledge_fts.sql', 'utf8');
    db.exec(migrationSql);

    const ftsCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_fts;').get();
    assert.strictEqual(ftsCount.count, 102, 'Expected exactly 102 notes backfilled into knowledge_fts');

    const triggerCount = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_knowledge_vault_%';").get();
    assert.strictEqual(triggerCount.c, 3, 'Expected 3 auto-sync triggers');
  });

  test('FTS5-02: Idempotency Check: Running Migration 0002 a SECOND time produces ZERO duplicate records', () => {
    const migrationSql = fs.readFileSync('migrations/0002_create_knowledge_fts.sql', 'utf8');
    // Run migration again
    db.exec(migrationSql);

    const ftsCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_fts;').get();
    assert.strictEqual(ftsCount.count, 102, 'Count must remain exactly 102 after re-running migration; NO duplicates!');
  });

  test('FTS5-03: Vietnamese Unicode MATCH query on real Drive notes & snippet() highlighting', () => {
    // Search for "phối hợp thì" which exists in the Google Drive imported notes
    const results = db.prepare(`
      SELECT kv.id, kv.title,
             snippet(knowledge_fts, 2, '[[HL]]', '[[/HL]]', '...', 15) as snippet
      FROM knowledge_fts kf
      JOIN knowledge_vault kv ON kf.id = kv.id
      WHERE knowledge_fts MATCH ?
    `).all('"phối hợp thì"*');

    assert.ok(results.length >= 1, 'Should find at least 1 note matching "phối hợp thì"');
    const hasMatch = results.some(r => r.title.toLowerCase().includes('phối hợp thì') || r.snippet.toLowerCase().includes('phối hợp thì'));
    assert.ok(hasMatch, 'At least one result must contain phối hợp thì in title or content snippet');
  });

  test('FTS5-04: Auto-sync Insert Trigger: Inserting a new 103rd note automatically updates knowledge_fts', () => {
    db.exec(`
      INSERT INTO knowledge_vault (id, title, folder, category, tags, content_markdown, status, updated_at)
      VALUES (
        'note_103_modal_verbs',
        'Động Từ Khuyết Thiếu (Modal Verbs: Must, Should, Ought to)',
        '02_GRAMMAR',
        'grammar',
        '["modal_verbs", "grammar"]',
        'Động từ khuyết thiếu dùng để diễn tả nghĩa vụ bắt buộc, lời khuyên và khả năng xảy ra.',
        'active',
        '2026-09-27'
      );
    `);

    const ftsCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_fts;').get();
    assert.strictEqual(ftsCount.count, 103, 'Count in knowledge_fts must automatically increase to 103');

    const searchMatch = db.prepare('SELECT id, title FROM knowledge_fts WHERE knowledge_fts MATCH ?;').all('"nghĩa vụ bắt buộc"');
    assert.strictEqual(searchMatch.length, 1);
    assert.strictEqual(searchMatch[0].id, 'note_103_modal_verbs');
  });

  test('FTS5-05: Auto-sync Update Trigger: Updating content reflects in search index immediately', () => {
    db.exec(`
      UPDATE knowledge_vault 
      SET content_markdown = 'Nội dung cập nhật: Diễn đạt sự suy đoán chắc chắn ở quá khứ (Must have + PII).'
      WHERE id = 'note_103_modal_verbs';
    `);

    const oldMatch = db.prepare('SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?;').all('"nghĩa vụ bắt buộc"');
    assert.strictEqual(oldMatch.length, 0, 'Old keywords must no longer match');

    const newMatch = db.prepare('SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?;').all('"suy đoán chắc chắn"');
    assert.strictEqual(newMatch.length, 1, 'New keywords must match immediately');
  });

  test('FTS5-06: Auto-sync Delete Trigger: Deleting from knowledge_vault removes from knowledge_fts', () => {
    db.exec("DELETE FROM knowledge_vault WHERE id = 'note_103_modal_verbs';");
    const count = db.prepare("SELECT COUNT(*) as c FROM knowledge_fts WHERE id = 'note_103_modal_verbs';").get();
    assert.strictEqual(count.c, 0, 'Deleted note must not exist in knowledge_fts');
  });
});
