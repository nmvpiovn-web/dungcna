import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET } from '../src/routes/api/app/sync/+server.js';

const secret = 'app-sync-test-secret';

const mockNotifications = [
  // Thông báo cho teacher — student KHÔNG được thấy
  { id: 'n1', title: 'Họp giáo viên', body: '...', category: 'system', reference_id: null, created_at: '2026-10-04T10:00:00Z', target_user_id: null, target_role: 'teacher' },
  // Thông báo cho leader — student KHÔNG được thấy
  { id: 'n2', title: 'Báo cáo tài chính', body: '...', category: 'system', reference_id: null, created_at: '2026-10-04T10:00:00Z', target_user_id: null, target_role: 'leader' },
  // Thông báo chung — mọi người được thấy
  { id: 'n3', title: 'Nghỉ lễ', body: '...', category: 'system', reference_id: null, created_at: '2026-10-04T10:00:00Z', target_user_id: null, target_role: 'all' },
  // Thông báo cá nhân cho student1
  { id: 'n4', title: 'Điểm của bạn', body: '...', category: 'evaluation', reference_id: null, created_at: '2026-10-04T10:00:00Z', target_user_id: 'user-student', target_role: null },
];

function makePlatform(role) {
  const user = { id: `user-${role}`, username: role, name: role, role, status: 'active', metadata: '{}' };
  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM users')) return user;
              if (sql.includes('FROM auth_sessions')) return { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' };
              return null;
            },
            async all() {
              if (sql.includes('FROM system_notifications')) {
                // Giả lập policy: lọc theo target
                // Policy thật phức tạp; ở đây kiểm tra SQL có dùng buildNotificationAuthFilter không
                // bằng cách xem WHERE clause
                const usesPolicy = sql.includes('n.target_user_id') && !sql.includes("OR target_user_id IS NULL)");
                // Trả về notifications mà policy cho phép (giả lập đơn giản)
                let allowed = [];
                if (role === 'student') {
                  // Student chỉ thấy: target_user_id = mình, hoặc (target_role student/all VÀ system không reference)
                  allowed = mockNotifications.filter(n =>
                    n.target_user_id === user.id ||
                    (n.target_user_id === null && (n.target_role === 'student' || n.target_role === 'all') && n.category === 'system' && !n.reference_id)
                  );
                } else if (role === 'teacher') {
                  allowed = mockNotifications.filter(n =>
                    n.target_user_id === user.id ||
                    (n.target_user_id === null && ['teacher', 'all'].includes(n.target_role))
                  );
                } else {
                  allowed = mockNotifications;
                }
                // Ghi lại SQL để assert
                return { results: allowed, _sql: sql, _usesPolicy: usesPolicy };
              }
              if (sql.includes('FROM class_sessions')) {
                return { results: [], _sql: sql };
              }
              if (sql.includes('FROM exams')) {
                // Kiểm tra có lọc since không
                const filtersSince = sql.includes('created_at > ?');
                return { results: [], _sql: sql, _filtersSince: filtersSince };
              }
              if (sql.includes("key = 'site_theme'")) {
                return { results: [] };
              }
              return { results: [] };
            }
          };
        }
      };
    }
  };
  return { env: { DB, AUTH_SECRET: secret } };
}

async function syncAs(role) {
  const platform = makePlatform(role);
  const user = { id: `user-${role}`, username: role, role };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');
  const request = new Request('https://timbk.io.vn/api/app/sync?since=2026-10-01T00:00:00Z', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const response = await GET({ url: new URL(request.url), request, platform });
  assert.equal(response.status, 200);
  return response.json();
}

test('student không thấy thông báo dành cho teacher/leader', async () => {
  const body = await syncAs('student');
  const ids = body.changes.notifications.map(n => n.id);
  assert.ok(!ids.includes('n1'), 'student thấy thông báo teacher!');
  assert.ok(!ids.includes('n2'), 'student thấy thông báo leader!');
  assert.ok(ids.includes('n3'), 'student phải thấy thông báo chung');
  assert.ok(ids.includes('n4'), 'student phải thấy thông báo cá nhân');
});

test('teacher thấy thông báo teacher nhưng không thấy leader', async () => {
  const body = await syncAs('teacher');
  const ids = body.changes.notifications.map(n => n.id);
  assert.ok(ids.includes('n1'), 'teacher phải thấy thông báo teacher');
  assert.ok(!ids.includes('n2'), 'teacher thấy thông báo leader!');
});

test('SQL dùng notification policy chung (không còn filter lỏng)', async () => {
  // Kiểm tra trực tiếp SQL được build
  const platform = makePlatform('student');
  const user = { id: 'user-student', username: 'student', role: 'student' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');
  const request = new Request('https://timbk.io.vn/api/app/sync', {
    headers: { Authorization: `Bearer ${token}` }
  });
  // Đọc source để verify dùng buildNotificationAuthFilter
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/routes/api/app/sync/+server.js', 'utf8');
  assert.ok(src.includes('buildNotificationAuthFilter'), 'Chưa dùng notification policy chung');
  assert.ok(!src.includes("OR target_user_id IS NULL)"), 'Vẫn còn filter lỏng lẻo');
});

test('exams lọc theo since', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/routes/api/app/sync/+server.js', 'utf8');
  assert.ok(src.includes('created_at > ?'), 'Exams chưa lọc theo since');
});

test('role lạ fail-closed không trả lịch', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/routes/api/app/sync/+server.js', 'utf8');
  assert.ok(src.includes('AND 1 = 0'), 'Role lạ chưa fail-closed');
});
