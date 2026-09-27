import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('OBSIDIAN VAULT, 35 DRIVE NOTES & 308 MEDIA PROVENANCE AUDIT SUITE', () => {
  const vaultDir = path.resolve('obsidian_vault');
  const driveDir = path.resolve('obsidian_vault/07_GOOGLE_DRIVE_LIBRARY');

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

  test('VAULT-04: Backlinks and wikilinks cross-referencing audit', () => {
    const allFiles = getFilesRecursively(vaultDir).filter(f => f.endsWith('.md'));
    let totalWikilinks = 0;
    const wikilinkRegex = /\[\[(.*?)\]\]/g;
    for (const f of allFiles) {
      const content = fs.readFileSync(f, 'utf8');
      const matches = content.match(wikilinkRegex);
      if (matches) totalWikilinks += matches.length;
    }
    assert.ok(totalWikilinks >= 200, `Expected at least 200 wikilinks across vault notes, found ${totalWikilinks}`);
  });

  test('VAULT-05: 35 Drive notes provenance table with SHA-256 and classification', () => {
    const docNotes = fs.readdirSync(driveDir).filter(f => f.startsWith('drive-') && f.endsWith('.md'));
    assert.strictEqual(docNotes.length, 35);
    
    const provenanceList = docNotes.map(filename => {
      const fullPath = path.join(driveDir, filename);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      // Extract title from YAML frontmatter or first H1
      const titleMatch = content.match(/^title:\s*["']?(.*?)["']?$/m) || content.match(/^#\s+(.*)$/m);
      const title = titleMatch ? titleMatch[1] : filename;
      
      // Determine content classification
      let classification = 'grammar_guide';
      if (/test|đề|de\d+|exam|ck1/i.test(filename) || /câu\s*\d+/i.test(content)) {
        classification = 'question_bank';
      } else if (/vocab|word/i.test(filename)) {
        classification = 'vocabulary';
      }

      return { filename, hash, title, classification };
    });

    assert.strictEqual(provenanceList.length, 35);
    assert.ok(provenanceList.some(p => p.classification === 'question_bank'));
    assert.ok(provenanceList.some(p => p.classification === 'vocabulary'));
    assert.ok(provenanceList.some(p => p.classification === 'grammar_guide'));
  });
});
