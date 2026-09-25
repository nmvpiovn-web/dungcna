const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

const sqlStatements = [
  `CREATE TABLE IF NOT EXISTS student_evaluations (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    teacher_name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    listening_score REAL DEFAULT 0,
    reading_score REAL DEFAULT 0,
    writing_score REAL DEFAULT 0,
    speaking_score REAL DEFAULT 0,
    grammar_vocab_score REAL DEFAULT 0,
    primary_aptitude TEXT NOT NULL, -- 'listening_speaking' | 'reading_writing' | 'analytical_grammar' | 'polyglot_gifted' | 'foundational_reinforce'
    aptitude_description TEXT,
    strengths TEXT,
    weaknesses TEXT,
    teacher_feedback TEXT NOT NULL,
    action_plan TEXT NOT NULL,
    recommended_materials TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    parent_zalo_id TEXT,
    report_status TEXT DEFAULT 'ready_to_send', -- 'ready_to_send' | 'sent_to_parent' | 'admin_reviewed'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_eval_student ON student_evaluations(student_id);`,
  `CREATE INDEX IF NOT EXISTS idx_eval_teacher ON student_evaluations(teacher_id);`
];

async function run() {
  console.log('Adding student_evaluations table to Cloudflare D1...');
  for (const sql of sqlStatements) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql })
    });
    const data = await res.json();
    if (!data.success) {
      console.error('Error executing SQL:', data.errors);
    } else {
      console.log('Success:', sql.substring(0, 45).replace(/\n/g, ' '));
    }
  }
}

run().catch(console.error);
