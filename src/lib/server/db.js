import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.resolve(process.cwd(), 'data/tienganh7.db');
let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    dbInstance = new DatabaseSync(dbPath);
  }
  return dbInstance;
}

export function getAllUnits() {
  const db = getDb();
  return db.prepare('SELECT * FROM units ORDER BY id ASC').all();
}

export function getWords({ unitId, search, limit, shuffle } = {}) {
  const db = getDb();
  let query = `
    SELECT w.*, p.status, p.review_count, p.correct_count, p.wrong_count, p.last_reviewed
    FROM words w
    LEFT JOIN user_progress p ON w.id = p.word_id
    WHERE 1=1
  `;
  const params = [];

  if (unitId && unitId !== 'all') {
    query += ' AND w.unit_id = ?';
    params.push(unitId);
  }

  if (search && search.trim()) {
    query += ' AND (w.term LIKE ? OR w.meaning_vi LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  if (shuffle) {
    query += ' ORDER BY RANDOM()';
  } else {
    query += ' ORDER BY w.id ASC';
  }

  if (limit && Number(limit) > 0) {
    query += ' LIMIT ?';
    params.push(Number(limit));
  }

  return db.prepare(query).all(...params);
}

export function getWordById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT w.*, p.status, p.review_count, p.correct_count, p.wrong_count, p.last_reviewed
    FROM words w
    LEFT JOIN user_progress p ON w.id = p.word_id
    WHERE w.id = ?
  `).get(id);
}

export function updateWordProgress(wordId, isCorrect) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM user_progress WHERE word_id = ?').get(wordId);
  
  const now = new Date().toISOString();
  if (existing) {
    const newCorrect = existing.correct_count + (isCorrect ? 1 : 0);
    const newWrong = existing.wrong_count + (isCorrect ? 0 : 1);
    const newReview = existing.review_count + 1;
    let newStatus = existing.status;
    if (newCorrect >= 3 && newWrong === 0) {
      newStatus = 'mastered';
    } else if (newCorrect > 0 || newWrong > 0) {
      newStatus = 'learning';
    }

    db.prepare(`
      UPDATE user_progress
      SET status = ?, review_count = ?, correct_count = ?, wrong_count = ?, last_reviewed = ?
      WHERE word_id = ?
    `).run(newStatus, newReview, newCorrect, newWrong, now, wordId);

    return { word_id: wordId, status: newStatus, correct_count: newCorrect, wrong_count: newWrong };
  } else {
    const status = isCorrect ? 'learning' : 'learning';
    db.prepare(`
      INSERT INTO user_progress (word_id, status, review_count, correct_count, wrong_count, last_reviewed)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(wordId, status, isCorrect ? 1 : 0, isCorrect ? 0 : 1, now);
    return { word_id: wordId, status };
  }
}

export function setWordStatus(wordId, status) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM user_progress WHERE word_id = ?').get(wordId);
  const now = new Date().toISOString();
  if (existing) {
    db.prepare('UPDATE user_progress SET status = ?, last_reviewed = ? WHERE word_id = ?').run(status, now, wordId);
  } else {
    db.prepare('INSERT INTO user_progress (word_id, status, review_count, last_reviewed) VALUES (?, ?, 0, ?)')
      .run(wordId, status, now);
  }
  return { word_id: wordId, status };
}

export function getQuestions({ testId = 'TEST_01', section, unitId, limit } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM questions WHERE test_id = ?';
  const params = [testId];

  if (section && section !== 'all') {
    query += ' AND section = ?';
    params.push(section);
  }

  if (unitId && unitId !== 'all') {
    query += ' AND unit_id = ?';
    params.push(unitId);
  }

  query += ' ORDER BY qnum ASC';

  if (limit && Number(limit) > 0) {
    query += ' LIMIT ?';
    params.push(Number(limit));
  }

  return db.prepare(query).all(...params);
}

export function saveGameScore({ gameMode, playerName, score, timeSeconds, correctAnswers, totalQuestions }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO game_scores (game_mode, player_name, score, time_seconds, correct_answers, total_questions)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    gameMode,
    playerName || 'Học sinh',
    score,
    timeSeconds || 0,
    correctAnswers || 0,
    totalQuestions || 0
  );
  return { id: info.lastInsertRowid };
}

export function getLeaderboard(gameMode, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM game_scores
    WHERE game_mode = ?
    ORDER BY score DESC, time_seconds ASC
    LIMIT ?
  `).all(gameMode, limit);
}

export function getStats() {
  const db = getDb();
  const totalWords = db.prepare('SELECT COUNT(*) as count FROM words').get().count;
  const masteredWords = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE status = 'mastered'").get().count;
  const learningWords = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE status = 'learning'").get().count;
  const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
  const recentScores = db.prepare(`
    SELECT * FROM game_scores ORDER BY created_at DESC LIMIT 5
  `).all();

  return {
    totalWords,
    masteredWords,
    learningWords,
    newWords: Math.max(0, totalWords - masteredWords - learningWords),
    totalQuestions,
    recentScores
  };
}

export function addWord({ term, ipa, pos, meaning_vi, example_en, example_vi, unit_id, difficulty }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO words (term, ipa, pos, meaning_vi, example_en, example_vi, unit_id, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    term.trim(),
    ipa || '',
    pos || 'noun',
    meaning_vi.trim(),
    example_en || '',
    example_vi || '',
    unit_id || 'unit1',
    difficulty || 'medium'
  );
  db.prepare("INSERT INTO user_progress (word_id, status) VALUES (?, 'new')").run(result.lastInsertRowid);
  return { id: result.lastInsertRowid };
}
