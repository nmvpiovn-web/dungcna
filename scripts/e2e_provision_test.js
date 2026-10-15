import { execFileSync } from 'child_process';
import crypto from 'crypto';
import { hashPassword } from '../src/lib/server/auth.js';

// 1. Generate secure credentials according to provision_account specs
const recId = 'rec_1791618285933_u9t1';
const candidateName = 'E2E Teacher 20261010 1115';
const phone = '0391010157';
const email = 'e2e.teacher.20261010.1115@example.test';
const randSuffix = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
const username = `gv_${Date.now().toString(36)}_${randSuffix}`;

const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
const randBytes = new Uint8Array(12);
crypto.getRandomValues(randBytes);
const tempPassword = Array.from(randBytes).map(b => charset[b % charset.length]).join('');
const passwordHash = await hashPassword(tempPassword);

const userId = `user_${crypto.randomUUID()}`;
const profileId = `tp_${crypto.randomUUID()}`;

console.log('Generated Provision Data:');
console.log({
  userId,
  username,
  tempPassword,
  passwordHash: passwordHash.substring(0, 20) + '...'
});

// Run atomic batch insertion via wrangler d1
const meta = JSON.stringify({
  must_change_password: true,
  provisioned_from: recId,
  provisioned_by: 'usr_super_1',
  provisioned_at: new Date().toISOString()
}).replace(/'/g, "''");

const sql = `
INSERT INTO users (id, username, password, name, phone, email, role, status, metadata, created_at, approval_status)
VALUES ('${userId}', '${username}', '${passwordHash}', '${candidateName}', '${phone}', '${email}', 'teacher', 'active', '${meta}', CURRENT_TIMESTAMP, 'approved');

INSERT INTO teacher_profiles (id, teacher_id, user_id, bio, degree, specialty, created_at)
VALUES ('${profileId}', '${userId}', '${userId}', 'Ứng viên từ recruitment ${recId}', 'lead', 'Ngữ Pháp & Luyện Thi', CURRENT_TIMESTAMP);

UPDATE teacher_recruitment SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = '${recId}' AND status = 'accepted';

INSERT INTO audit_logs (id, actor_id, actor_role, action, details, created_at)
VALUES ('audit_${crypto.randomUUID()}', 'usr_super_1', 'superadmin', 'provision_teacher_account', '{"recruitment_id":"${recId}","username":"${username}","user_id":"${userId}"}', CURRENT_TIMESTAMP);
`;

console.log('SQL to execute:');
console.log(sql);
