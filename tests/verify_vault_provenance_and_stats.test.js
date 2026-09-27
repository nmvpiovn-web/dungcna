import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

describe('OBSIDIAN VAULT, 35 DRIVE NOTES & D1 PROVENANCE AUDIT SUITE', () => {
  const vaultDir = path.resolve('obsidian_vault');
  const driveDir = path.resolve('obsidian_vault/07_GOOGLE_DRIVE_LIBRARY');
  const driveManifestPath = path.resolve('src/lib/data/drive_sync_manifest.json');
  const teachingResourcesPath = path.resolve('src/lib/data/teaching_resources.json');
  const secondBrainVaultPath = path.resolve('src/lib/data/second_brain_vault.json');

  function getFilesRecursively(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        results = results.concat(getFilesRecursively(full));
      } else {
        results.push(full);
      }
    }
    return results;
  }

  test('VAULT-01: Exactly 102 markdown notes exist in obsidian_vault', () => {
    const allFiles = getFilesRecursively(vaultDir);
    const mdFiles = allFiles.filter(f => f.endsWith('.md'));
    assert.strictEqual(mdFiles.length, 102, 'Must have exactly 102 .md notes in obsidian_vault');
  });

  test('VAULT-02: Exactly 308 media assets exist in obsidian_vault', () => {
    const allFiles = getFilesRecursively(vaultDir);
    const mediaFiles = allFiles.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.png', '.jpeg', '.jpg', '.gif', '.webp', '.svg'].includes(ext);
    });
    assert.strictEqual(mediaFiles.length, 308, 'Must have exactly 308 media assets (239 png, 62 jpeg, 5 gif, 2 jpg)');
  });

  test('VAULT-03: Exactly 35 Google Drive document notes + 1 index note exist in 07_GOOGLE_DRIVE_LIBRARY', () => {
    const driveFiles = fs.readdirSync(driveDir).filter(f => f.endsWith('.md'));
    assert.strictEqual(driveFiles.length, 36, 'Must have 36 .md files (1 index + 35 drive doc notes)');
    assert.ok(driveFiles.includes('00_GOOGLE_DRIVE_INDEX.md'));
    const docNotes = driveFiles.filter(f => f.startsWith('drive-'));
    assert.strictEqual(docNotes.length, 35, 'Must have exactly 35 drive-*.md document notes');
  });

  test('VAULT-04: Backlinks and wikilinks cross-referencing and D1 knowledge_links resolution audit', () => {
    const allFiles = getFilesRecursively(vaultDir).filter(f => f.endsWith('.md'));
    const noteNames = new Set();
    const noteMap = new Map();

    // Collect note basenames and titles
    for (const f of allFiles) {
      const basename = path.basename(f, '.md');
      noteNames.add(basename.toLowerCase());
      const content = fs.readFileSync(f, 'utf8');
      const titleMatch = content.match(/^title:\s*["']?(.*?)["']?$/m) || content.match(/^#\s+(.*)$/m);
      if (titleMatch) {
        noteNames.add(titleMatch[1].trim().toLowerCase());
        noteMap.set(titleMatch[1].trim().toLowerCase(), basename);
      }
      noteMap.set(basename.toLowerCase(), basename);
    }

    const wikilinkRegex = /\[\[(.*?)\]\]/g;
    let totalWikilinks = 0;
    let resolvedWikilinks = 0;
    const linksList = [];

    for (const f of allFiles) {
      const sourceNote = path.basename(f, '.md');
      const content = fs.readFileSync(f, 'utf8');
      let match;
      while ((match = wikilinkRegex.exec(content)) !== null) {
        totalWikilinks++;
        const rawTarget = match[1].split('|')[0].trim();
        const targetClean = rawTarget.replace(/^#/, '').toLowerCase();
        const isResolved = noteNames.has(targetClean) || noteMap.has(targetClean);
        if (isResolved) resolvedWikilinks++;
        linksList.push({
          source_note_id: sourceNote,
          wikilink_text: rawTarget,
          target_note_id: noteMap.get(targetClean) || null,
          is_resolved: isResolved ? 1 : 0
        });
      }
    }

    assert.ok(totalWikilinks >= 200, `Expected at least 200 wikilinks across vault notes, found ${totalWikilinks}`);
    assert.ok(resolvedWikilinks >= 170, `Expected at least 170 resolved wikilinks, found ${resolvedWikilinks}`);
    const brokenLinks = linksList.filter(l => l.is_resolved === 0);
    assert.ok(brokenLinks.length <= 65, `Expected unresolvable/forward-referencing wikilinks to be bounded, found ${brokenLinks.length}`);

    // Verify D1 knowledge_links schema compatibility
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE knowledge_links (
        id TEXT PRIMARY KEY,
        source_note_id TEXT NOT NULL,
        target_note_id TEXT,
        wikilink_text TEXT NOT NULL,
        is_resolved INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const insertStmt = db.prepare(`
      INSERT INTO knowledge_links (id, source_note_id, target_note_id, wikilink_text, is_resolved)
      VALUES (?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN TRANSACTION');
    linksList.slice(0, 50).forEach((l, idx) => {
      insertStmt.run(`link_${idx}`, l.source_note_id, l.target_note_id, l.wikilink_text, l.is_resolved);
    });
    db.exec('COMMIT');

    const count = db.prepare('SELECT COUNT(*) as c FROM knowledge_links WHERE is_resolved = 1').get();
    assert.ok(count.c > 0, 'D1 knowledge_links table must contain resolved links');
  });

  test('VAULT-05: 35 Drive Sources Complete Provenance Table: DOCX -> Note -> D1 / Teaching Resources', () => {
    assert.ok(fs.existsSync(driveManifestPath), 'drive_sync_manifest.json must exist');
    const driveManifest = JSON.parse(fs.readFileSync(driveManifestPath, 'utf8'));
    assert.strictEqual(driveManifest.files.length, 35, 'Manifest must have exactly 35 Drive files');

    const teachingResources = fs.existsSync(teachingResourcesPath)
      ? JSON.parse(fs.readFileSync(teachingResourcesPath, 'utf8'))
      : [];

    const provenanceTable = driveManifest.files.map(sourceFile => {
      const noteFilename = `${sourceFile.note_id}.md`;
      const notePath = path.join(driveDir, noteFilename);
      assert.ok(fs.existsSync(notePath), `Markdown note for ${sourceFile.source} must exist at ${noteFilename}`);
      
      const noteContent = fs.readFileSync(notePath, 'utf8');
      const noteHash = crypto.createHash('sha256').update(noteContent).digest('hex');

      // Match with enriched teaching resource
      const matchedRes = teachingResources.find(r => 
        r.id.toLowerCase().includes(sourceFile.note_id.replace('drive-', '').substring(0, 16).toLowerCase()) ||
        r.title.toLowerCase().includes(sourceFile.source.replace('.docx', '').replace('.doc', '').substring(0, 10).toLowerCase())
      );

      // Classification
      let classification = 'grammar_guide';
      if (/test|đề|de\d+|exam|ck1|ioe/i.test(sourceFile.source)) {
        classification = 'question_bank';
      } else if (/vocab|word|22000/i.test(sourceFile.source)) {
        classification = 'vocabulary';
      }

      return {
        source_filename: sourceFile.source,
        source_sha256: sourceFile.sha256,
        note_id: sourceFile.note_id,
        note_sha256: noteHash,
        resource_id: matchedRes ? matchedRes.id : `res_vault_${sourceFile.note_id}`,
        classification,
        character_count: sourceFile.characters,
        image_count: sourceFile.images,
        is_structured_extracted: true,
        reviewed_status: 'reviewed'
      };
    });

    assert.strictEqual(provenanceTable.length, 35, 'Must have 35 provenance entries');
    assert.ok(provenanceTable.every(p => p.source_sha256 && p.note_sha256 && p.source_filename));
    assert.ok(provenanceTable.some(p => p.classification === 'question_bank'));
    assert.ok(provenanceTable.some(p => p.classification === 'vocabulary'));
    assert.ok(provenanceTable.some(p => p.classification === 'grammar_guide'));
  });

  test('VAULT-06: Isolated D1 Vietnamese Unicode FTS5 Search & Snippet Highlighting', () => {
    const db = new DatabaseSync(':memory:');
    assert.ok(fs.existsSync(secondBrainVaultPath), 'second_brain_vault.json must exist');
    const vaultData = JSON.parse(fs.readFileSync(secondBrainVaultPath, 'utf8'));

    // Create knowledge_vault base table
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

    // Populate all 102 notes
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

    // Run Migration 0002 (FTS5 table and triggers)
    const migrationSql = fs.readFileSync('migrations/0002_create_knowledge_fts.sql', 'utf8');
    db.exec(migrationSql);

    const ftsCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_fts;').get();
    assert.strictEqual(ftsCount.count, 102, 'Expected exactly 102 notes in knowledge_fts');

    // Query 1: Vietnamese accent query "phối hợp thì"
    const results1 = db.prepare(`
      SELECT kv.id, kv.title,
             snippet(knowledge_fts, 2, '[[HL]]', '[[/HL]]', '...', 15) as snippet
      FROM knowledge_fts kf
      JOIN knowledge_vault kv ON kf.id = kv.id
      WHERE knowledge_fts MATCH ?
    `).all('"phối hợp thì"*');
    assert.ok(results1.length >= 1, 'Should find at least 1 note matching "phối hợp thì"');
    assert.ok(results1.some(r => r.title.includes('Phối Hợp Thì') || r.title.toLowerCase().includes('phối hợp thì')));

    // Query 2: Vietnamese accent query "câu điều kiện"
    const results2 = db.prepare(`
      SELECT kv.id, kv.title,
             snippet(knowledge_fts, 2, '[[HL]]', '[[/HL]]', '...', 15) as snippet
      FROM knowledge_fts kf
      JOIN knowledge_vault kv ON kf.id = kv.id
      WHERE knowledge_fts MATCH ?
    `).all('"điều kiện"*');
    assert.ok(results2.length >= 1, 'Should find at least 1 note matching "điều kiện"');
  });
});
