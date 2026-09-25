const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

const sqlStatements = [
  `CREATE TABLE IF NOT EXISTS class_sessions (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    subject_topic TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    teacher_name TEXT NOT NULL,
    teacher_role TEXT NOT NULL,
    assistant_teacher_id TEXT,
    assistant_teacher_name TEXT,
    location TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    day_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notify_minutes_before INTEGER DEFAULT 10,
    room_notes TEXT,
    status TEXT DEFAULT 'active',
    student_ids TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sess_class ON class_sessions(class_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sess_teacher ON class_sessions(teacher_id);`,

  `CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    session_date TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    class_id TEXT,
    status TEXT NOT NULL, -- 'present' | 'absent_excused' | 'absent_unexcused' | 'late'
    notes TEXT,
    in_class_attitude TEXT,
    instant_stars_rewarded INTEGER DEFAULT 0,
    marked_by_teacher_id TEXT NOT NULL,
    marked_by_teacher_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_att_session ON attendance_records(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_att_student ON attendance_records(student_id);`,

  `CREATE TABLE IF NOT EXISTS evaluation_discussions (
    id TEXT PRIMARY KEY,
    evaluation_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    author_avatar TEXT,
    author_badge TEXT,
    comment_type TEXT DEFAULT 'comment', -- 'comment' | 'rebuttal' | 'inquiry' | 'leader_conclusion'
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_disc_eval ON evaluation_discussions(evaluation_id);`,

  `CREATE TABLE IF NOT EXISTS teacher_profiles (
    teacher_id TEXT PRIMARY KEY,
    teacher_name TEXT NOT NULL,
    username TEXT NOT NULL,
    role_type TEXT NOT NULL, -- 'lead' | 'native' | 'assistant_fixed' | 'assistant_temp'
    role_title TEXT NOT NULL,
    salary_type TEXT NOT NULL,
    base_salary_vnd REAL DEFAULT 0,
    rate_per_session_vnd REAL DEFAULT 0,
    total_sessions_taught INTEGER DEFAULT 0,
    leader_rating REAL DEFAULT 5.0,
    leader_appraisal TEXT,
    bonuses TEXT,
    private_reminders TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`
];

async function run() {
  console.log('Migrating Schedule, Attendance, Discussions & Staff to Cloudflare D1...');
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
      console.log('Success:', sql.substring(0, 50).replace(/\n/g, ' '));
    }
  }
  console.log('Migration complete!');
}

run().catch(console.error);
