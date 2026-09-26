import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

describe('D1 FTS5 SCHEMA MIGRATION & FULL-TEXT SEARCH AUDIT SUITE', () => {
  let db;

  before(() => {
    db = new DatabaseSync(':memory:');

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

    // 2. Execute Migration 0002
    const migrationSql = fs.readFileSync('migrations/0002_create_knowledge_fts.sql', 'utf8');
    db.exec(migrationSql);
  });

  test('FTS5-01: Virtual table knowledge_fts exists and triggers are active', () => {
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts';
    `).get();
    assert.ok(tableCheck, 'knowledge_fts virtual table must exist in sqlite_master');

    const triggerCheck = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_knowledge_vault_%';
    `).all();
    assert.strictEqual(triggerCheck.length, 3, 'Expected 3 auto-sync triggers (insert, delete, update)');
  });

  test('FTS5-02: Insert into knowledge_vault automatically synchronizes to knowledge_fts', () => {
    db.exec(`
      INSERT INTO knowledge_vault (id, title, folder, category, tags, content_markdown, source_path, status, updated_at)
      VALUES (
        'note_present_simple',
        'Thì Hiện Tại Đơn (Present Simple)',
        'Grammar/Tenses',
        'grammar',
        '["grammar", "present_simple", "tense"]',
        'Thì hiện tại đơn diễn tả một hành động lặp đi lặp lại hoặc một chân lý hiển nhiên trong tự nhiên.',
        '01-Grammar/Present-Simple.md',
        'active',
        '2026-09-27'
      );
    `);

    const ftsRow = db.prepare('SELECT id, title, content_markdown FROM knowledge_fts WHERE id = ?').get('note_present_simple');
    assert.ok(ftsRow, 'knowledge_fts must contain the inserted note');
    assert.strictEqual(ftsRow.title, 'Thì Hiện Tại Đơn (Present Simple)');
  });

  test('FTS5-03: Vietnamese Unicode MATCH query & snippet() highlighting', () => {
    const searchRes = db.prepare(`
      SELECT kv.id, kv.title,
             snippet(knowledge_fts, 2, '[[HL]]', '[[/HL]]', '...', 10) as snippet
      FROM knowledge_fts kf
      JOIN knowledge_vault kv ON kf.id = kv.id
      WHERE knowledge_fts MATCH ?
    `).all('"chân lý hiển nhiên"*');

    assert.strictEqual(searchRes.length, 1, 'Should find exactly 1 matching note');
    assert.strictEqual(searchRes[0].id, 'note_present_simple');
    assert.ok(searchRes[0].snippet.includes('[[HL]]'), 'Snippet must contain highlight start tag');
    assert.ok(searchRes[0].snippet.includes('[[/HL]]'), 'Snippet must contain highlight end tag');
  });

  test('FTS5-04: Update in knowledge_vault automatically updates knowledge_fts', () => {
    db.exec(`
      UPDATE knowledge_vault 
      SET content_markdown = 'Nội dung cập nhật: Diễn tả thói quen hàng ngày và lịch trình cố định.'
      WHERE id = 'note_present_simple';
    `);

    const oldMatch = db.prepare('SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?').all('"chân lý hiển nhiên"');
    assert.strictEqual(oldMatch.length, 0, 'Old keywords must no longer match after update');

    const newMatch = db.prepare('SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?').all('"lịch trình cố định"');
    assert.strictEqual(newMatch.length, 1, 'New keywords must match after update');
  });

  test('FTS5-05: Delete in knowledge_vault automatically removes from knowledge_fts', () => {
    db.exec("DELETE FROM knowledge_vault WHERE id = 'note_present_simple';");
    const count = db.prepare('SELECT COUNT(*) as c FROM knowledge_fts WHERE id = ?').get('note_present_simple');
    assert.strictEqual(count.c, 0, 'Record must be completely removed from knowledge_fts');
  });

  test('FTS5-06: Robustness when virtual table is absent (Fallback LIKE test)', () => {
    const isolatedDb = new DatabaseSync(':memory:');
    isolatedDb.exec(`
      CREATE TABLE knowledge_vault (
        id TEXT PRIMARY KEY,
        title TEXT,
        folder TEXT,
        category TEXT,
        tags TEXT,
        content_markdown TEXT,
        updated_at TEXT
      );
      INSERT INTO knowledge_vault VALUES ('dummy_1', 'Câu Bị Động', 'Grammar', 'grammar', '[]', 'Passive voice structure', '2026-09-27');
    `);

    // Simulate handler try/catch fallback:
    let searchSuccess = false;
    let fallbackUsed = false;
    let results = [];

    try {
      results = isolatedDb.prepare(`
        SELECT kv.id, kv.title
        FROM knowledge_fts kf
        JOIN knowledge_vault kv ON kf.id = kv.id
        WHERE knowledge_fts MATCH ?
      `).all('Passive');
      searchSuccess = true;
    } catch (err) {
      // Caught schema error -> fallback to SQL LIKE
      fallbackUsed = true;
      results = isolatedDb.prepare(`
        SELECT id, title
        FROM knowledge_vault
        WHERE title LIKE ? OR content_markdown LIKE ?
      `).all('%Passive%', '%Passive%');
    }

    assert.strictEqual(fallbackUsed, true, 'Fallback LIKE must activate if knowledge_fts table is missing');
    assert.strictEqual(results.length, 1, 'Fallback LIKE must return the matching record');
  });
});
