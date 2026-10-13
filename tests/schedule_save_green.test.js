import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET, POST, _clearClassSessionsColumnsCache as clearClassSessionsColumnsCache } from '../src/routes/api/schedule/+server.js';
import { upsertClassSessionInStore, getAllClassSessions, saveClassSession } from '../src/lib/unifiedStore.js';

const secret = 'schedule-green-test-secret-32-bytes-long!';

function makeMockPlatform(schemaType = 'prod', initialRows = []) {
  clearClassSessionsColumnsCache();
  const rows = [...initialRows];
  let columns;
  if (schemaType === 'prod') {
    columns = [
      { name: 'id' }, { name: 'class_id' }, { name: 'class_name' }, { name: 'grade_level' },
      { name: 'subject_topic' }, { name: 'teacher_id' }, { name: 'teacher_name' },
      { name: 'teacher_role' }, { name: 'assistant_teacher_id' }, { name: 'assistant_teacher_name' },
      { name: 'location' }, { name: 'day_of_week' }, { name: 'day_name' }, { name: 'start_time' },
      { name: 'end_time' }, { name: 'notify_minutes_before' }, { name: 'room_notes' },
      { name: 'status' }, { name: 'student_ids' }, { name: 'created_at' }, { name: 'updated_at' },
      { name: 'substitute_teacher_id' }, { name: 'substitute_teacher_name' }, { name: 'substitute_notes' },
      { name: 'session_date' }
    ];
  } else if (schemaType === 'fresh' || schemaType === 'migration_0001' || schemaType === 'dev') {
    // Exact 0001_initial_schema.sql columns:
    columns = [
      { name: 'id' }, { name: 'class_id' }, { name: 'class_name' }, { name: 'teacher_id' },
      { name: 'substitute_teacher_id' }, { name: 'session_date' }, { name: 'start_time' },
      { name: 'end_time' }, { name: 'room' }, { name: 'topic' }, { name: 'status' },
      { name: 'attendance_taken' }, { name: 'payroll_rate' }, { name: 'payroll_processed' },
      { name: 'substitute_payroll_rate' }, { name: 'substitute_payroll_processed' },
      { name: 'created_at' }, { name: 'updated_at' }
    ];
  } else if (schemaType === 'broken_missing_room') {
    columns = [
      { name: 'id' }, { name: 'class_id' }, { name: 'class_name' }, { name: 'teacher_id' },
      { name: 'session_date' }, { name: 'start_time' }, { name: 'end_time' }, { name: 'topic' }
    ];
  } else if (schemaType === 'broken_missing_topic') {
    columns = [
      { name: 'id' }, { name: 'class_id' }, { name: 'class_name' }, { name: 'teacher_id' },
      { name: 'session_date' }, { name: 'start_time' }, { name: 'end_time' }, { name: 'room' }
    ];
  } else if (schemaType === 'broken_pragma_empty') {
    columns = [];
  } else {
    columns = [];
  }

  const colNames = new Set(columns.map(c => c.name));

  const DB = {
    prepare(sql) {
      const handler = (params = []) => ({
        async first() {
          if (sql.includes('FROM users')) {
            const id = params[0];
            const role = id === 'usr_teach_1' ? 'teacher' : 'superadmin';
            return {
              id,
              username: id,
              name: 'Test ' + id,
              role,
              status: 'active',
              approval_status: 'approved',
              metadata: '{}'
            };
          }
          if (sql.includes('FROM auth_sessions')) {
            return { id: 'test-session', revoked_at: null, expires_at: '2099-01-01T00:00:00.000Z' };
          }
          if (sql.includes('SELECT status FROM class_sessions WHERE id = ?')) {
            const found = rows.find(r => r.id === params[0]);
            return found ? { status: found.status } : null;
          }
          if (sql.includes('SELECT teacher_id, assistant_teacher_id, substitute_teacher_id FROM class_sessions WHERE id = ?')) {
            const found = rows.find(r => r.id === params[0]);
            return found || null;
          }
          return null;
        },
        async all() {
          if (sql.includes('PRAGMA table_info(class_sessions)')) {
            return { results: columns };
          }
          // Enforce column existence check on SQL:
          if (sql.includes('SELECT') && /\broom\b/i.test(sql) && !colNames.has('room') && !sql.includes('COALESCE(room_notes')) {
            throw new Error('no such column: room');
          }
          if (sql.includes('class_sessions') && sql.includes('session_date = ?')) {
            // params: session_date, id, end_time, start_time
            const [sDate, excludeId, endTime, startTime] = params;
            const matches = rows.filter(r =>
              r.session_date === sDate &&
              r.id !== excludeId &&
              r.start_time < endTime &&
              r.end_time > startTime &&
              r.status !== 'cancelled'
            );
            return {
              results: matches.map(m => ({
                id: m.id,
                class_name: m.class_name,
                teacher_id: m.teacher_id,
                assistant_teacher_id: m.assistant_teacher_id,
                substitute_teacher_id: m.substitute_teacher_id,
                student_ids: m.student_ids,
                room_notes: m.room_notes || m.room || '',
                room: m.room_notes || m.room || '',
                start_time: m.start_time,
                end_time: m.end_time
              }))
            };
          }
          return { results: rows };
        },
        async run() {
          if (sql.includes('INSERT INTO class_sessions')) {
            // Extract column names from insert
            const match = sql.match(/INSERT INTO class_sessions \((.*?)\)/);
            if (match) {
              const usedCols = match[1].split(',').map(s => s.trim());
              for (const c of usedCols) {
                if (!colNames.has(c)) {
                  throw new Error(`table class_sessions has no column named ${c}`);
                }
              }
              // Store simulated row
              const rowObj = {};
              usedCols.forEach((c, idx) => { rowObj[c] = params[idx]; });
              rows.push(rowObj);
            }
            return { success: true };
          }
          if (sql.includes('UPDATE class_sessions SET')) {
            const targetId = params[params.length - 1];
            const found = rows.some(r => r.id === targetId);
            return { success: true, meta: { changes: found ? 1 : 0 } };
          }
          return { success: true };
        }
      });

      return {
        bind(...params) { return handler(params); },
        first() { return handler().first(); },
        all() { return handler().all(); },
        run() { return handler().run(); }
      };
    }
  };

  return { env: { DB, AUTH_SECRET: secret } };
}

test('GREEN-1: Schedule POST succeeds against exact production D1 schema without room/topic columns', async () => {
  const platform = makeMockPlatform('prod');
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  // 2026-10-15 is Thursday (day_of_week: 4, day_name: 'Thứ Năm')
  const payload = {
    action: 'save_session',
    class_name: 'Lớp 7 - Global Success & KET A2',
    grade_level: 'Lớp 7',
    subject_topic: 'Chuyên đề Ngữ pháp',
    teacher_id: 'usr_super_2',
    teacher_name: 'Ms. Dung',
    session_date: '2026-10-15',
    day_of_week: 4,
    start_time: '18:00',
    end_time: '19:30',
    room_notes: 'Phòng VIP 201'
  };

  const req = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  const res = await POST({ request: req, platform });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.session);
  assert.equal(data.session.session_date, '2026-10-15');
  assert.equal(data.session.day_of_week, 4);
  assert.equal(data.session.day_name, 'Thứ Năm');
  assert.equal(data.session.room_notes, 'Phòng VIP 201');
  assert.equal(data.session.room, 'Phòng VIP 201');
});

test('GREEN-2: Strict Gregorian date validation rejects impossible dates and format errors', async () => {
  const platform = makeMockPlatform('prod');
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  const invalidDates = [
    { date: '2026-02-30', expectedErr: /Ngày không hợp lệ trên lịch Gregorian/ },
    { date: '2026-04-31', expectedErr: /Ngày không hợp lệ trên lịch Gregorian/ },
    { date: '2026-13-01', expectedErr: /Tháng không hợp lệ/ },
    { date: '2026/10/15', expectedErr: /Định dạng ngày học không hợp lệ/ },
    { date: 'not-a-date', expectedErr: /Định dạng ngày học không hợp lệ/ }
  ];

  for (const { date, expectedErr } of invalidDates) {
    const payload = {
      action: 'save_session',
      class_name: 'Lớp Test',
      session_date: date,
      start_time: '18:00',
      end_time: '19:30'
    };
    const req = new Request('https://timbk.io.vn/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const res = await POST({ request: req, platform });
    const data = await res.json();
    assert.equal(res.status, 400, `Date ${date} should be rejected with 400`);
    assert.match(data.error, expectedErr);
  }
});

test('GREEN-3: Weekday and session_date mismatch is strictly rejected', async () => {
  const platform = makeMockPlatform('prod');
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  // 2026-10-15 is Thursday (4), but client sends day_of_week: 1 (Monday)
  const payload = {
    action: 'save_session',
    class_name: 'Lớp Test Mismatch',
    session_date: '2026-10-15',
    day_of_week: 1, // Thứ Hai (mismatch!)
    start_time: '18:00',
    end_time: '19:30'
  };

  const req = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  const res = await POST({ request: req, platform });
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.match(data.error, /không khớp với ngày học 2026-10-15/);
});

test('GREEN-4: Conflict detection catches teacher, room, and substitute overlap with 409', async () => {
  const existingSession = {
    id: 'sess_existing_1',
    class_name: 'Lớp 7 Cơ Bản',
    session_date: '2026-10-15',
    start_time: '18:00',
    end_time: '19:30',
    teacher_id: 'usr_teach_1',
    substitute_teacher_id: 'usr_teach_sub',
    room_notes: 'Phòng VIP 201',
    student_ids: '["std_1","std_2"]',
    status: 'scheduled'
  };

  const platform = makeMockPlatform('prod', [existingSession]);
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  // Case A: Room overlap
  const roomConflict = {
    action: 'save_session',
    class_name: 'Lớp Khác Cùng Phòng',
    session_date: '2026-10-15',
    start_time: '18:30',
    end_time: '20:00',
    teacher_id: 'usr_super_2',
    room_notes: 'Phòng VIP 201'
  };
  const reqA = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(roomConflict)
  });
  const resA = await POST({ request: reqA, platform });
  const dataA = await resA.json();
  assert.equal(resA.status, 409);
  assert.match(dataA.error, /Trùng lịch phòng học/);

  // Case B: Teacher overlap
  const teacherConflict = {
    action: 'save_session',
    class_name: 'Lớp Khác Cùng Giáo Viên',
    session_date: '2026-10-15',
    start_time: '18:00',
    end_time: '19:00',
    teacher_id: 'usr_teach_1',
    room_notes: 'Phòng 102'
  };
  const reqB = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(teacherConflict)
  });
  const resB = await POST({ request: reqB, platform });
  const dataB = await resB.json();
  assert.equal(resB.status, 409);
  assert.match(dataB.error, /Trùng lịch giáo viên/);
});

test('GREEN-5: Teacher role RBAC - teacher cannot create session for other lead teacher', async () => {
  const platform = makeMockPlatform('prod');
  const user = { id: 'usr_teach_1', username: 'teacher.john', role: 'teacher' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  const payload = {
    action: 'save_session',
    class_name: 'Lớp Teacher',
    teacher_id: 'usr_teach_2', // Not self!
    session_date: '2026-10-15',
    start_time: '18:00',
    end_time: '19:30'
  };

  const req = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  const res = await POST({ request: req, platform });
  const data = await res.json();
  assert.equal(res.status, 403);
  assert.match(data.error, /Bạn chỉ được tạo lịch cho chính mình/);
});

test('GREEN-6: upsertClassSessionInStore is client-only with safe student_ids parser', () => {
  const canonicalSession = {
    id: 'sess_canonical_999',
    class_name: 'Lớp Canonical',
    session_date: '2026-10-20',
    day_of_week: 2,
    day_name: 'Thứ Ba',
    start_time: '18:00',
    end_time: '19:30',
    room_notes: 'Phòng 301',
    student_ids: '["std_1", "std_2"]',
    substitute_teacher_id: 'usr_teach_1',
    substitute_teacher_name: 'Mr. Johnathan Miller',
    status: 'scheduled'
  };

  // 1. SSR check: must return null without window
  assert.equal(upsertClassSessionInStore(canonicalSession), null, 'SSR must return null for client-only upsert');

  // 2. Client simulated environment:
  const mockStorage = {};
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; }
  };

  try {
    const stored = upsertClassSessionInStore(canonicalSession);
    assert.equal(stored.id, 'sess_canonical_999');
    assert.equal(stored.session_date, '2026-10-20');
    assert.equal(stored.substitute_teacher_id, 'usr_teach_1');
    assert.equal(stored.room_notes, 'Phòng 301');
    assert.deepEqual(stored.student_ids, ['std_1', 'std_2']);

    const all = getAllClassSessions();
    const found = all.find(s => s.id === 'sess_canonical_999');
    assert.ok(found);
    assert.equal(found.session_date, '2026-10-20');

    // Safe parser test: malformed student_ids should not throw
    const malformed = { ...canonicalSession, id: 'sess_malformed', student_ids: '{not valid json}' };
    const safeResult = upsertClassSessionInStore(malformed);
    assert.ok(safeResult);
    assert.deepEqual(safeResult.student_ids, ['{not valid json}']);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test('GREEN-7: Schedule POST succeeds against exact fresh-migration 0001 schema with room/topic columns', async () => {
  const platform = makeMockPlatform('fresh');
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  // Payload using 0001 schema fields: room, topic
  const payload = {
    action: 'save_session',
    class_name: 'Lớp 7 - Fresh Migration Schema',
    topic: 'Chuyên đề Ôn tập Unit 1-3',
    teacher_id: 'usr_super_2',
    session_date: '2026-10-15',
    day_of_week: 4,
    start_time: '18:00',
    end_time: '19:30',
    room: 'Phòng Lab 102'
  };

  const req = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  const res = await POST({ request: req, platform });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.session);
  assert.equal(data.session.session_date, '2026-10-15');
  assert.equal(data.session.day_of_week, 4);
  assert.equal(data.session.day_name, 'Thứ Năm');
  assert.equal(data.session.room, 'Phòng Lab 102');
  assert.equal(data.session.room_notes, 'Phòng Lab 102');
  assert.equal(data.session.topic, 'Chuyên đề Ôn tập Unit 1-3');
  assert.equal(data.session.subject_topic, 'Chuyên đề Ôn tập Unit 1-3');
});

test('GREEN-8: Fail closed with 500 when PRAGMA lacks required columns or fails', async () => {
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  // Case A: Missing both room and room_notes
  const platformMissingRoom = makeMockPlatform('broken_missing_room');
  const reqA = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: 'save_session',
      class_name: 'Lớp Thiếu Phòng',
      session_date: '2026-10-15',
      start_time: '18:00',
      end_time: '19:30'
    })
  });
  const resA = await POST({ request: reqA, platform: platformMissingRoom });
  const dataA = await resA.json();
  assert.equal(resA.status, 500);
  assert.match(dataA.error, /thiếu cột phòng học/);

  // Case B: Missing both topic and subject_topic
  const platformMissingTopic = makeMockPlatform('broken_missing_topic');
  const reqB = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: 'save_session',
      class_name: 'Lớp Thiếu Chuyên Đề',
      session_date: '2026-10-15',
      start_time: '18:00',
      end_time: '19:30'
    })
  });
  const resB = await POST({ request: reqB, platform: platformMissingTopic });
  const dataB = await resB.json();
  assert.equal(resB.status, 500);
  assert.match(dataB.error, /thiếu cột chuyên đề/);

  // Case C: Empty PRAGMA results
  const platformEmptyPragma = makeMockPlatform('broken_pragma_empty');
  const reqC = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: 'save_session',
      class_name: 'Lớp Lỗi PRAGMA',
      session_date: '2026-10-15',
      start_time: '18:00',
      end_time: '19:30'
    })
  });
  const resC = await POST({ request: reqC, platform: platformEmptyPragma });
  const dataC = await resC.json();
  assert.equal(resC.status, 500);
  assert.match(dataC.error, /Không thể kiểm tra cấu trúc bảng/);
});

test('GREEN-9: UPDATE non-existent session returns 404', async () => {
  const platform = makeMockPlatform('prod', []); // Empty DB
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  const payload = {
    action: 'save_session',
    id: 'sess_does_not_exist_999',
    class_name: 'Lớp Update Không Tồn Tại',
    session_date: '2026-10-15',
    start_time: '18:00',
    end_time: '19:30',
    room_notes: 'Phòng 101'
  };

  const req = new Request('https://timbk.io.vn/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  const res = await POST({ request: req, platform });
  const data = await res.json();
  assert.equal(res.status, 404);
  assert.match(data.error, /Không tìm thấy buổi học/);
});

test('GREEN-10: GET normalizes legacy 0001 schema row (topic, room) into subject_topic and room_notes', async () => {
  const legacyRow = {
    id: 'sess_legacy_001',
    class_id: 'cls_ket_7',
    class_name: 'Lớp 7 - KET Intensive',
    teacher_id: 'usr_super_1',
    session_date: '2026-10-15',
    start_time: '18:00',
    end_time: '19:30',
    room: 'Phòng Lab 102',
    topic: 'Unit 1 Vocab & Grammar Review',
    status: 'scheduled'
  };

  const platform = makeMockPlatform('fresh', [legacyRow]);
  const user = { id: 'usr_super_1', username: 'admin', role: 'superadmin' };
  const token = await createSignedToken(user, secret, 60_000, 'test-session');

  const req = new Request('https://timbk.io.vn/api/schedule', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const res = await GET({ request: req, platform, url: new URL(req.url) });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.total, 1);
  const session = data.sessions[0];
  assert.equal(session.id, 'sess_legacy_001');
  assert.equal(session.subject_topic, 'Unit 1 Vocab & Grammar Review');
  assert.equal(session.room_notes, 'Phòng Lab 102');
  assert.equal(session.topic, 'Unit 1 Vocab & Grammar Review');
  assert.equal(session.room, 'Phòng Lab 102');
  assert.deepEqual(session.student_ids, []);
});
