const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE question_bank (
    id TEXT PRIMARY KEY,
    curriculum_id TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    topic TEXT NOT NULL,
    cognitive_level TEXT NOT NULL,
    question_type TEXT NOT NULL,
    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_option_id TEXT NOT NULL,
    explanation TEXT,
    reading_passage TEXT,
    source_ref TEXT,
    status TEXT DEFAULT 'published',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO question_bank (
    id, curriculum_id, grade_level, topic, cognitive_level, question_type,
    question_text, options_json, correct_option_id, status
  ) VALUES (
    'old', 'curr', 'lop_7', 'phonics', 'nhan_biet', 'multiple_choice',
    'q', '[]', 'A', 'published'
  );
`);
db.exec(fs.readFileSync('artifacts/deploy-v6.2/production_schema_delta.sql', 'utf8'));
db.exec(fs.readFileSync('artifacts/deploy-v6.2/production_question_seed.sql', 'utf8'));
console.log(JSON.stringify({
  count: db.prepare('SELECT COUNT(*) AS n FROM question_bank').get().n,
  oldSkill: db.prepare("SELECT skill_category FROM question_bank WHERE id = 'old'").get().skill_category,
  authTable: db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'auth_sessions'").get().n,
  transactionTable: db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'tuition_transactions'").get().n
}));
