const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
let token = null;
try {
  const config = fs.readFileSync(configPath, 'utf8');
  token = config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
} catch {}

const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

const sqlStatements = [
  // 1. CAMPUSES TABLE
  `CREATE TABLE IF NOT EXISTS campuses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL,
    hotline TEXT,
    manager_user_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,

  // 2. SEED DEFAULT CAMPUSES
  `INSERT OR IGNORE INTO campuses (id, name, short_code, address, hotline, manager_user_id) VALUES
    ('loc_codung', 'Nhà Cô Dung (Trụ Sở Chính)', 'CODUNG', 'Số 18, Ngõ 42, Phố Triều Khúc, Thanh Xuân, Hà Nội', '0912345678', 'user_msdung'),
    ('loc_sunshine', 'Trung Tâm Tiếng Anh Sunshine Academy', 'SUNSHINE', 'Tòa Sunshine Riverside, Phú Thượng, Tây Hồ, Hà Nội', '0987654321', 'user_teacher_quynh'),
    ('loc_thayvu', 'Trung Tâm Học Liệu & Luyện Thi Thầy Vũ', 'THAYVU', 'Số 105, Đường Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội', '0901234567', 'user_thayvu');`,

  // 3. HOMEWORK ASSIGNMENTS TABLE
  `CREATE TABLE IF NOT EXISTS homework_assignments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    teacher_name TEXT NOT NULL,
    campus_id TEXT NOT NULL DEFAULT 'loc_codung',
    skill_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    obsidian_note_id TEXT,
    obsidian_note_title TEXT,
    assigned_date TEXT NOT NULL,
    deadline_date TEXT NOT NULL,
    deadline_time TEXT NOT NULL,
    max_score REAL DEFAULT 10.0,
    star_reward_on_time INTEGER DEFAULT 50,
    status TEXT DEFAULT 'published',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_hw_session ON homework_assignments(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_hw_class ON homework_assignments(class_id);`,
  `CREATE INDEX IF NOT EXISTS idx_hw_campus ON homework_assignments(campus_id);`,

  // 4. HOMEWORK SUBMISSIONS TABLE
  `CREATE TABLE IF NOT EXISTS homework_submissions (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    submission_type TEXT NOT NULL,
    content_text TEXT,
    audio_url TEXT,
    attachments_json TEXT,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_on_time INTEGER DEFAULT 1,
    graded_by_teacher_id TEXT,
    graded_by_teacher_name TEXT,
    graded_at TEXT,
    score REAL,
    teacher_feedback TEXT,
    audio_feedback_url TEXT,
    stars_awarded INTEGER DEFAULT 0,
    star_awarded_reason TEXT,
    status TEXT DEFAULT 'submitted'
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_unique ON homework_submissions(assignment_id, student_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sub_student ON homework_submissions(student_id);`,

  // 5. LOCATION ACTIVITY STREAMS TABLE
  `CREATE TABLE IF NOT EXISTS location_activity_streams (
    id TEXT PRIMARY KEY,
    campus_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    reference_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS idx_stream_campus ON location_activity_streams(campus_id);`,
  `CREATE INDEX IF NOT EXISTS idx_stream_created ON location_activity_streams(created_at);`
];

async function run() {
  console.log('Migrating Homework, Campuses & Activity Streams to D1...');
  if (!token) {
    console.log('No token found in wrangler config. Schema script ready for local / API usage.');
    return;
  }
  for (const sql of sqlStatements) {
    try {
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
        console.warn('D1 Query notice:', data.errors);
      } else {
        console.log('OK:', sql.substring(0, 45).replace(/\n/g, ' '));
      }
    } catch (e) {
      console.warn('Fetch error:', e.message);
    }
  }
}

run().catch(console.error);
