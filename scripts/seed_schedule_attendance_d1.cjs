const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

const classSessions = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/data/class_sessions.json'), 'utf8'));
const attendanceRecords = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/data/attendance_records.json'), 'utf8'));
const discussions = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/data/evaluation_discussions.json'), 'utf8'));
const teacherProfiles = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/data/teacher_profiles.json'), 'utf8'));

async function queryD1(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  return await res.json();
}

async function run() {
  console.log('Seeding schedule, attendance, discussions & staff to Cloudflare D1...');

  // 1. Seed class sessions
  for (const s of classSessions) {
    const sql = `INSERT INTO class_sessions (
      id, class_id, class_name, grade_level, subject_topic, teacher_id, teacher_name, teacher_role,
      assistant_teacher_id, assistant_teacher_name, location, day_of_week, day_name, start_time,
      end_time, notify_minutes_before, room_notes, status, student_ids
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET subject_topic = excluded.subject_topic, updated_at = CURRENT_TIMESTAMP;`;
    
    await queryD1(sql, [
      s.id, s.class_id, s.class_name, s.grade_level, s.subject_topic, s.teacher_id, s.teacher_name, s.teacher_role,
      s.assistant_teacher_id || '', s.assistant_teacher_name || '', s.location, s.day_of_week, s.day_name, s.start_time,
      s.end_time, s.notify_minutes_before || 10, s.room_notes || '', s.status || 'active', JSON.stringify(s.student_ids || [])
    ]);
  }
  console.log(`Seeded ${classSessions.length} class sessions!`);

  // 2. Seed attendance records
  for (const a of attendanceRecords) {
    const sql = `INSERT INTO attendance_records (
      id, session_id, session_date, student_id, student_name, class_id, status, notes,
      in_class_attitude, instant_stars_rewarded, marked_by_teacher_id, marked_by_teacher_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET in_class_attitude = excluded.in_class_attitude;`;

    await queryD1(sql, [
      a.id, a.session_id, a.session_date, a.student_id, a.student_name, a.class_id || '', a.status, a.notes || '',
      a.in_class_attitude || '', a.instant_stars_rewarded || 0, a.marked_by_teacher_id, a.marked_by_teacher_name
    ]);
  }
  console.log(`Seeded ${attendanceRecords.length} attendance records!`);

  // 3. Seed discussions
  for (const d of discussions) {
    const sql = `INSERT INTO evaluation_discussions (
      id, evaluation_id, author_id, author_name, author_role, author_avatar, author_badge, comment_type, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET content = excluded.content;`;

    await queryD1(sql, [
      d.id, d.evaluation_id, d.author_id, d.author_name, d.author_role, d.author_avatar || '', d.author_badge || '', d.comment_type || 'comment', d.content
    ]);
  }
  console.log(`Seeded ${discussions.length} evaluation discussions!`);

  // 4. Seed teacher profiles
  for (const p of teacherProfiles) {
    const sql = `INSERT INTO teacher_profiles (
      teacher_id, teacher_name, username, role_type, role_title, salary_type, base_salary_vnd,
      rate_per_session_vnd, total_sessions_taught, leader_rating, leader_appraisal, bonuses, private_reminders
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(teacher_id) DO UPDATE SET role_type = excluded.role_type, base_salary_vnd = excluded.base_salary_vnd;`;

    await queryD1(sql, [
      p.teacher_id, p.teacher_name, p.username, p.role_type, p.role_title, p.salary_type, p.base_salary_vnd || 0,
      p.rate_per_session_vnd || 0, p.total_sessions_taught || 0, p.leader_rating || 5.0, p.leader_appraisal || '',
      JSON.stringify(p.bonuses || []), JSON.stringify(p.private_reminders || [])
    ]);
  }
  console.log(`Seeded ${teacherProfiles.length} teacher profiles!`);

  console.log('All seeding to Cloudflare D1 completed successfully!');
}

run().catch(console.error);
