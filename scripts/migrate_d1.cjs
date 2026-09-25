const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218'; // tienganh-pro-db

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin', 'teacher', 'student')),
  avatar TEXT,
  status TEXT DEFAULT 'active',
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  curriculum_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  grade INTEGER DEFAULT 0,
  format_type TEXT NOT NULL,
  skill_category TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_questions INTEGER DEFAULT 0,
  pass_percentage INTEGER DEFAULT 60,
  created_by TEXT,
  is_published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  skill TEXT NOT NULL,
  type TEXT NOT NULL,
  passage TEXT,
  prompt TEXT NOT NULL,
  audio_url TEXT,
  image_url TEXT,
  options_json TEXT,
  correct_answer TEXT,
  explanation TEXT,
  cambridge_level TEXT,
  rubric_json TEXT
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  format_type TEXT,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  answers_json TEXT NOT NULL,
  feedback_json TEXT,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  data_before TEXT,
  data_after TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  event_types TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  last_status INTEGER DEFAULT 200,
  last_triggered_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teaching_resources (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  grade_level TEXT,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  native_teacher_tips TEXT,
  keywords TEXT,
  downloads_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cambridge_vocabulary (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  ipa TEXT,
  pos TEXT,
  cefr_level TEXT NOT NULL,
  cambridge_tier TEXT,
  meaning_vi TEXT NOT NULL,
  example_en TEXT NOT NULL,
  example_vi TEXT NOT NULL,
  collocations TEXT,
  grade_suitability TEXT
);
`;

async function executeSql(sql) {
  // Cloudflare D1 query API handles statements or batch
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Executing ${statements.length} SQL statements on D1...`);

  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: s })
    });
    const data = await res.json();
    if (!data.success) {
      console.error(`Statement ${i + 1} failed:`, s.substring(0, 50), data.errors);
    } else {
      console.log(`[${i + 1}/${statements.length}] Success:`, s.substring(0, 40).replace(/\n/g, ' '));
    }
  }
}

executeSql(schemaSql).catch(console.error);
