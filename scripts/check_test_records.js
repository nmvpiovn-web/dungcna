import { execSync } from 'child_process';

const testUserId = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548';
const testRecId = 'rec_1791618285933_u9t1';
const testUsername = 'gv_mv24qlsx_ad720ebc';

// Query in groups of 4 compound SELECTs (well under SQLite limit)
const queries = [
  `SELECT 'users' as tbl, count(*) as cnt FROM users WHERE id = '${testUserId}' OR username = '${testUsername}' UNION ALL SELECT 'teacher_profiles', count(*) FROM teacher_profiles WHERE user_id = '${testUserId}' OR teacher_id = '${testUserId}' UNION ALL SELECT 'teacher_recruitment', count(*) FROM teacher_recruitment WHERE id = '${testRecId}' UNION ALL SELECT 'auth_sessions', count(*) FROM auth_sessions WHERE user_id = '${testUserId}'`,
  `SELECT 'audit_logs' as tbl, count(*) as cnt FROM audit_logs WHERE details LIKE '%${testUserId}%' OR details LIKE '%${testRecId}%' OR details LIKE '%${testUsername}%' UNION ALL SELECT 'system_notifications', count(*) FROM system_notifications WHERE user_id = '${testUserId}' UNION ALL SELECT 'system_notification_reads', count(*) FROM system_notification_reads WHERE user_id = '${testUserId}' UNION ALL SELECT 'role_switch_sessions', count(*) FROM role_switch_sessions WHERE user_id = '${testUserId}'`,
  `SELECT 'class_sessions' as tbl, count(*) as cnt FROM class_sessions WHERE teacher_id = '${testUserId}' UNION ALL SELECT 'teacher_payrolls', count(*) FROM teacher_payrolls WHERE teacher_id = '${testUserId}' UNION ALL SELECT 'teacher_leave_requests', count(*) FROM teacher_leave_requests WHERE teacher_id = '${testUserId}' UNION ALL SELECT 'teacher_salary_advances', count(*) FROM teacher_salary_advances WHERE teacher_id = '${testUserId}'`
];

const counts = {};

for (const sql of queries) {
  const out = execSync(`npx wrangler d1 execute tienganh-pro-db --remote --command "${sql}"`, { encoding: 'utf8' });
  const jsonStart = out.indexOf('[');
  if (jsonStart !== -1) {
    const data = JSON.parse(out.substring(jsonStart));
    const rows = data[0]?.results || [];
    for (const r of rows) {
      counts[r.tbl] = r.cnt;
    }
  }
}

console.log('Test record counts:', JSON.stringify(counts, null, 2));
