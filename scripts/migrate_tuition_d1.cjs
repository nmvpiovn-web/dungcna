const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

const sqlStatements = [
  `CREATE TABLE IF NOT EXISTS tuition_bills (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    age INTEGER DEFAULT 13,
    grade_level TEXT NOT NULL,
    program_name TEXT NOT NULL,
    billing_period TEXT NOT NULL,
    base_tuition_vnd INTEGER NOT NULL,
    attendance_total_sessions INTEGER DEFAULT 12,
    attendance_attended_sessions INTEGER DEFAULT 12,
    attendance_rate INTEGER DEFAULT 100,
    stars_available INTEGER DEFAULT 0,
    stars_deducted INTEGER DEFAULT 0,
    discount_vnd INTEGER DEFAULT 0,
    final_amount_vnd INTEGER NOT NULL,
    template_id INTEGER DEFAULT 1,
    bank_name TEXT DEFAULT 'MBBank',
    bank_account TEXT DEFAULT '0901234567',
    account_holder TEXT DEFAULT 'NGUYEN MINH VU',
    vietqr_url TEXT,
    growth_status TEXT DEFAULT 'breakthrough_growth',
    growth_percentage INTEGER DEFAULT 15,
    growth_notes TEXT,
    eval_listening REAL DEFAULT 8.0,
    eval_reading REAL DEFAULT 8.5,
    eval_writing REAL DEFAULT 7.5,
    eval_speaking REAL DEFAULT 8.0,
    eval_grammar REAL DEFAULT 8.5,
    test_score_15m REAL DEFAULT 8.5,
    test_score_45m REAL DEFAULT 9.0,
    superadmin_notes TEXT,
    status TEXT DEFAULT 'approved_by_superadmin',
    parent_name TEXT,
    parent_phone TEXT,
    parent_zalo_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS student_stars (
    student_id TEXT PRIMARY KEY,
    stars_balance INTEGER DEFAULT 0,
    total_earned_stars INTEGER DEFAULT 0,
    stars_redeemed INTEGER DEFAULT 0,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );`
];

async function run() {
  console.log('Adding tuition_bills and student_stars tables to Cloudflare D1...');
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
