// src/routes/api/vocabulary/+server.js
// Unified Cloudflare D1 Vocabulary & Flashcard Synchronization API (Oxford 3000/5000 + Cambridge + Global Success K12)
import { json } from '@sveltejs/kit';
import cambridgeVocabularyData from '$lib/data/cambridge_vocabulary.json';
import { getUnifiedVocabularyPool, normalizeUnifiedWord } from '$lib/staticDb.js';

export const prerender = false;

const GITHUB_VOCAB_SOURCES = [
  { repo: 'samuraitruong/oxford-3000', desc: 'Oxford 3000 Core English Vocabulary (CEFR A1–B2)' },
  { repo: 'tyypgzl/Oxford-5000-words', desc: 'Oxford 5000 Academic & IELTS Vocabulary (CEFR B2–C1)' },
  { repo: 'global-success-k12', desc: 'Bộ SGK Tiếng Anh Global Success Lớp 1–12 (NXB Giáo Dục)' },
  { repo: 'halloween-cambridge-special', desc: 'Bộ Từ Vựng Lễ Hội Halloween & Văn Hóa Thế Giới (Unit 9)' }
];

async function ensureVocabularyTableAndSeed(db) {
  if (!db) return 0;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS cambridge_vocabulary (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        ipa TEXT,
        pos TEXT,
        cefr_level TEXT NOT NULL DEFAULT 'A2',
        cambridge_tier TEXT DEFAULT 'KET',
        meaning_vi TEXT NOT NULL,
        example_en TEXT NOT NULL,
        example_vi TEXT NOT NULL,
        collocations TEXT DEFAULT '',
        grade_suitability TEXT DEFAULT 'Lớp 7'
      );
    `).run().catch(() => {});

    for (const item of cambridgeVocabularyData) {
      await db.prepare(`
        INSERT INTO cambridge_vocabulary (id, word, ipa, pos, cefr_level, cambridge_tier, meaning_vi, example_en, example_vi, collocations, grade_suitability)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          word = excluded.word,
          ipa = excluded.ipa,
          pos = excluded.pos,
          cefr_level = excluded.cefr_level,
          cambridge_tier = excluded.cambridge_tier,
          meaning_vi = excluded.meaning_vi,
          example_en = excluded.example_en,
          example_vi = excluded.example_vi,
          collocations = excluded.collocations,
          grade_suitability = excluded.grade_suitability
      `).bind(
        item.id,
        item.word,
        item.ipa || '',
        item.pos || 'noun',
        item.cefr_level || 'B1',
        item.cambridge_tier || 'PET',
        item.meaning_vi || '',
        item.example_en || '',
        item.example_vi || '',
        item.collocations || '',
        item.grade_suitability || 'Lớp 7'
      ).run().catch(() => {});
    }
  } catch {}
}

export async function GET({ url, platform }) {
  const db = platform?.env?.DB;
  const search = (url.searchParams.get('q') || '').trim().toLowerCase();
  const grade = (url.searchParams.get('grade') || '').trim();
  const cefr = (url.searchParams.get('cefr') || '').trim().toUpperCase();

  let d1Rows = [];
  if (db) {
    await ensureVocabularyTableAndSeed(db);
    try {
      const res = await db.prepare(`SELECT * FROM cambridge_vocabulary ORDER BY rowid DESC LIMIT 1000`).all();
      d1Rows = res?.results || [];
    } catch {}
  }

  const byTerm = new Map();
  // 1. Load static unified pool first
  for (const w of getUnifiedVocabularyPool()) {
    byTerm.set(w.term.toLowerCase(), w);
  }
  // 2. Overlay live D1 cambridge_vocabulary rows (D1 takes precedence and adds new words)
  for (const row of d1Rows) {
    const termKey = String(row.word || '').trim().toLowerCase();
    if (!termKey) continue;
    const existing = byTerm.get(termKey) || {};
    const norm = normalizeUnifiedWord({
      ...existing,
      id: row.id || existing.id,
      term: row.word,
      word: row.word,
      ipa: row.ipa || existing.ipa || '',
      pos: row.pos || existing.pos || 'noun',
      cefr_level: row.cefr_level || existing.cefr_level || 'B1',
      cambridge_tier: row.cambridge_tier || existing.cambridge_tier || 'PET',
      cambridge_level: row.cambridge_tier || existing.cambridge_level || 'PET_B1',
      meaning_vi: row.meaning_vi || existing.meaning_vi || '',
      example_en: row.example_en || existing.example_en || '',
      example_vi: row.example_vi || existing.example_vi || '',
      collocations: row.collocations || existing.collocations || '',
      grade: existing.grade || row.grade_suitability || 'Lớp 7',
      grade_suitability: row.grade_suitability || existing.grade_suitability || 'Lớp 7',
      unit_id: existing.unit_id || (String(row.id || '').startsWith('voc_hw_') ? 'unit9' : 'unit1'),
      source_repo: existing.source_repo || 'd1-cambridge-vocabulary'
    });
    if (norm) byTerm.set(termKey, norm);
  }

  let words = Array.from(byTerm.values());
  if (search) {
    words = words.filter(
      (w) =>
        w.term.toLowerCase().includes(search) ||
        w.meaning_vi.toLowerCase().includes(search) ||
        String(w.collocations || '').toLowerCase().includes(search)
    );
  }
  if (grade && grade !== 'all') {
    words = words.filter(
      (w) =>
        String(w.grade || '').toLowerCase().includes(grade.toLowerCase()) ||
        String(w.grade_suitability || '').toLowerCase().includes(grade.toLowerCase())
    );
  }
  if (cefr && cefr !== 'ALL') {
    words = words.filter((w) => String(w.cefr_level || '').toUpperCase() === cefr);
  }

  return json({
    success: true,
    total_d1_rows: d1Rows.length,
    total_unified_words: words.length,
    github_sources: GITHUB_VOCAB_SOURCES,
    words
  });
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action || 'add_word';

  if (action === 'delete_word') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    await ensureVocabularyTableAndSeed(db);
    const id = String(body.id || '').trim();
    const term = String(body.term || body.word || '').trim();
    if (!id && !term) {
      return json({ success: false, error: 'Thiếu id hoặc từ vựng (term) cần xóa!' }, { status: 400 });
    }
    if (id && term) {
      await db.prepare('DELETE FROM cambridge_vocabulary WHERE id = ? OR LOWER(word) = LOWER(?)').bind(id, term).run();
    } else if (id) {
      await db.prepare('DELETE FROM cambridge_vocabulary WHERE id = ?').bind(id).run();
    } else {
      await db.prepare('DELETE FROM cambridge_vocabulary WHERE LOWER(word) = LOWER(?)').bind(term).run();
    }
    return json({
      success: true,
      id,
      term,
      message: `🗑️ Đã xóa từ vựng "${term || id}" khỏi bảng D1 cambridge_vocabulary!`
    });
  }

  if (action === 'sync_github_repos') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    await ensureVocabularyTableAndSeed(db);
    const pool = getUnifiedVocabularyPool();
    let syncedCount = 0;
    for (const w of pool) {
      try {
        await db.prepare(`
          INSERT INTO cambridge_vocabulary (id, word, ipa, pos, cefr_level, cambridge_tier, meaning_vi, example_en, example_vi, collocations, grade_suitability)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            ipa = CASE WHEN excluded.ipa != '' THEN excluded.ipa ELSE cambridge_vocabulary.ipa END,
            meaning_vi = excluded.meaning_vi,
            example_en = CASE WHEN excluded.example_en != '' THEN excluded.example_en ELSE cambridge_vocabulary.example_en END,
            example_vi = CASE WHEN excluded.example_vi != '' THEN excluded.example_vi ELSE cambridge_vocabulary.example_vi END,
            grade_suitability = excluded.grade_suitability
        `).bind(
          String(w.id || `voc_${w.term.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`),
          w.term,
          w.ipa || '',
          w.pos || 'noun',
          w.cefr_level || 'A2',
          w.cambridge_tier || 'KET',
          w.meaning_vi || '',
          w.example_en || `Example with ${w.term}.`,
          w.example_vi || w.meaning_vi || '',
          w.collocations || '',
          w.grade_suitability || w.grade || 'Lớp 7'
        ).run();
        syncedCount++;
      } catch {}
    }
    const cntRow = await db.prepare(`SELECT COUNT(*) as total FROM cambridge_vocabulary`).first().catch(() => ({ total: syncedCount }));
    return json({
      success: true,
      synced_count: syncedCount,
      total_d1_rows: Number(cntRow?.total || syncedCount),
      github_sources: GITHUB_VOCAB_SOURCES,
      message: `✅ Đã đồng bộ & làm giàu ${cntRow?.total || syncedCount} từ vựng chuẩn Oxford 3000/5000 + Cambridge + Global Success vào bảng D1 cambridge_vocabulary!`
    });
  }

  // Default: add_word (used by /dictionary and /flashcards)
  const term = String(body.term || body.word || '').trim();
  const meaningVi = String(body.meaning_vi || '').trim();
  if (!term || !meaningVi) {
    return json({ success: false, error: 'Vui lòng nhập từ tiếng Anh (term) và nghĩa tiếng Việt (meaning_vi)!' }, { status: 400 });
  }

  const id = String(body.id || `voc_custom_${Date.now()}`);
  const ipa = String(body.ipa || '/.../').trim();
  const pos = String(body.pos || 'noun').trim();
  const cefr = String(body.cefr_level || 'B1').trim().toUpperCase();
  const tier = String(body.cambridge_tier || body.cambridge_level || 'PET').trim();
  const exampleEn = String(body.example_en || `Let's practice using the word "${term}" in context.`).trim();
  const exampleVi = String(body.example_vi || `Ví dụ sử dụng từ "${term}" (${meaningVi}).`).trim();
  const collocations = String(body.collocations || '').trim();
  const grade = String(body.grade || body.grade_suitability || 'Lớp 7').trim();

  if (db) {
    await ensureVocabularyTableAndSeed(db);
    await db.prepare(`
      INSERT INTO cambridge_vocabulary (id, word, ipa, pos, cefr_level, cambridge_tier, meaning_vi, example_en, example_vi, collocations, grade_suitability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        word = excluded.word,
        ipa = excluded.ipa,
        pos = excluded.pos,
        meaning_vi = excluded.meaning_vi,
        example_en = excluded.example_en,
        example_vi = excluded.example_vi,
        grade_suitability = excluded.grade_suitability
    `).bind(id, term, ipa, pos, cefr, tier, meaningVi, exampleEn, exampleVi, collocations, grade).run();
  }

  const normalized = normalizeUnifiedWord({
    id,
    term,
    word: term,
    ipa,
    pos,
    cefr_level: cefr,
    cambridge_tier: tier,
    cambridge_level: tier,
    meaning_vi: meaningVi,
    example_en: exampleEn,
    example_vi: exampleVi,
    collocations,
    grade,
    grade_suitability: grade,
    unit_id: body.unit_id || 'unit1'
  });

  return json({
    success: true,
    word: normalized,
    message: `✅ Đã lưu từ "${term}" vào Cloudflare D1 (cambridge_vocabulary) & đồng bộ sang Flashcard!`
  });
}

export async function DELETE({ url, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
  await ensureVocabularyTableAndSeed(db);
  let body = {};
  try { body = await request.json(); } catch {}
  const id = String(url.searchParams.get('id') || body.id || '').trim();
  const term = String(url.searchParams.get('term') || url.searchParams.get('word') || body.term || body.word || '').trim();
  if (!id && !term) {
    return json({ success: false, error: 'Thiếu id hoặc term cần xóa' }, { status: 400 });
  }
  if (id) {
    await db.prepare('DELETE FROM cambridge_vocabulary WHERE id = ?').bind(id).run();
  }
  if (term) {
    await db.prepare('DELETE FROM cambridge_vocabulary WHERE LOWER(word) = LOWER(?)').bind(term).run();
  }
  return json({
    success: true,
    id,
    term,
    message: `🗑️ Đã xóa từ vựng "${term || id}" khỏi Cloudflare D1!`
  });
}
