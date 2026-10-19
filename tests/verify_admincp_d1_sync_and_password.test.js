import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { POST as tokenPost } from '../src/routes/api/auth/token/+server.js';
import { POST as changePasswordPost } from '../src/routes/api/auth/change-password/+server.js';
import { GET as adminUsersGet, POST as adminUsersPost } from '../src/routes/api/admincp/users/+server.js';
import { GET as studentsGet } from '../src/routes/api/students/+server.js';
import { GET as teachersStaffGet } from '../src/routes/api/teachers/staff/+server.js';
import { GET as parentsChildrenGet } from '../src/routes/api/parents/children/+server.js';
import { POST as schedulePost } from '../src/routes/api/schedule/+server.js';
import { GET as attendanceGet, POST as attendancePost } from '../src/routes/api/attendance/+server.js';
import { POST as tuitionPost } from '../src/routes/api/tuition/+server.js';
import { hashPassword } from '../src/lib/server/auth.js';

function createD1Adapter(sqliteDb) {
	return {
		prepare(sql) {
			let boundArgs = [];
			return {
				bind(...args) {
					boundArgs = args;
					return this;
				},
				async first() {
					return sqliteDb.prepare(sql).get(...boundArgs) || null;
				},
				async all() {
					return { results: sqliteDb.prepare(sql).all(...boundArgs) };
				},
				async run() {
					const info = sqliteDb.prepare(sql).run(...boundArgs);
					return {
						success: true,
						meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) }
					};
				}
			};
		},
		async batch(statements) {
			sqliteDb.exec('BEGIN TRANSACTION');
			try {
				const out = [];
				for (const s of statements) {
					out.push(await s.run());
				}
				sqliteDb.exec('COMMIT');
				return out;
			} catch (e) {
				sqliteDb.exec('ROLLBACK');
				throw e;
			}
		}
	};
}

async function createTestPlatform() {
	const sqlite = new DatabaseSync(':memory:');
	const migrationsDir = path.resolve('migrations');
	for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
		const sqlText = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
		try {
			sqlite.exec(sqlText);
		} catch {
			for (const stmt of sqlText.split(';').map((s) => s.trim()).filter(Boolean)) {
				try {
					sqlite.exec(stmt + ';');
				} catch {
					// ignore duplicate column in incremental ALTER TABLE migrations
				}
			}
		}
	}

	const adminPass = await hashPassword('AdminOldPass#2026');
	const studentPass = await hashPassword('StudentOldPass#2026');

	// Deliberately insert empty string '' into metadata to reproduce and verify fix for SQLite json_remove crash!
	sqlite.prepare(`
		INSERT OR REPLACE INTO users (
			id, username, email, name, role, status, approval_status,
			password, metadata
		) VALUES (?, ?, ?, ?, ?, 'active', 'approved', ?, '')
	`).run(
		'usr_leader_sync',
		'leader_sync',
		'leader_sync@tienganh.local',
		'Cô Dung Leader',
		'leader',
		adminPass
	);

	sqlite.prepare(`
		INSERT OR REPLACE INTO users (
			id, username, email, name, role, grade, status, approval_status,
			password, metadata
		) VALUES (?, ?, ?, ?, ?, 'Lớp 7', 'active', 'official', ?, '{"must_change_password":true}')
	`).run(
		'usr_student_sync',
		'student_sync',
		'student_sync@tienganh.local',
		'Học Sinh Test Đổi MK',
		'student',
		studentPass
	);

	return {
		sqlite,
		platform: { env: { DB: createD1Adapter(sqlite), AUTH_SECRET: 'testsecret_d1_sync' } }
	};
}

function makeEvent({ url = 'https://timbk.io.vn/api/test', method = 'GET', token = null, body = undefined, platform }) {
	const headers = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers['content-type'] = 'application/json';
	const parsedUrl = new URL(url);
	return {
		request: new Request(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined
		}),
		url: parsedUrl,
		platform,
		cookies: {
			set: () => {},
			get: () => null,
			delete: () => {}
		},
		getClientAddress: () => '127.0.0.1'
	};
}

async function loginUser(platform, username, password) {
	const res = await tokenPost(
		makeEvent({
			url: 'https://timbk.io.vn/api/auth/token',
			method: 'POST',
			body: { username, password },
			platform
		})
	);
	const data = await res.json();
	return { status: res.status, data };
}

describe('AdminCP Multi-Role Business Consolidation, Password Change & D1 Endpoint Synchronization', () => {
	it('1. Allows any user (student/leader) to change their own password even when metadata is empty string or malformed JSON', async () => {
		const { platform } = await createTestPlatform();

		// Student logs in with initial password
		const initialLogin = await loginUser(platform, 'student_sync', 'StudentOldPass#2026');
		assert.equal(initialLogin.status, 200);
		assert.equal(initialLogin.data.user.metadata.includes('must_change_password'), true);
		const studentToken = initialLogin.data.token;

		// Student changes their own password via /api/auth/change-password
		const changeRes = await changePasswordPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/auth/change-password',
				method: 'POST',
				token: studentToken,
				body: {
					old_password: 'StudentOldPass#2026',
					new_password: 'StudentNewStrong#2026'
				},
				platform
			})
		);
		const changeData = await changeRes.json();
		assert.equal(changeRes.status, 200);
		assert.equal(changeData.success, true);

		// Old password must fail
		const oldLogin = await loginUser(platform, 'student_sync', 'StudentOldPass#2026');
		assert.equal(oldLogin.status, 401);

		// New password must succeed and clear must_change_password
		const newLogin = await loginUser(platform, 'student_sync', 'StudentNewStrong#2026');
		assert.equal(newLogin.status, 200);
		assert.equal(newLogin.data.user.metadata.includes('must_change_password'), false);

		// Leader (who has metadata = '') also changes their own password without SQLite json_remove 500 error!
		const leaderLogin = await loginUser(platform, 'leader_sync', 'AdminOldPass#2026');
		assert.equal(leaderLogin.status, 200);
		const leaderChangeRes = await changePasswordPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/auth/change-password',
				method: 'POST',
				token: leaderLogin.data.token,
				body: {
					old_password: 'AdminOldPass#2026',
					new_password: 'AdminNewPass#2026'
				},
				platform
			})
		);
		assert.equal(leaderChangeRes.status, 200);
		const leaderRelogin = await loginUser(platform, 'leader_sync', 'AdminNewPass#2026');
		assert.equal(leaderRelogin.status, 200);
	});

	it('2. Allows Leader/Admin to reset any user password from AdminCP and change their own password', async () => {
		const { platform } = await createTestPlatform();

		const leaderLogin = await loginUser(platform, 'leader_sync', 'AdminOldPass#2026');
		assert.equal(leaderLogin.status, 200);
		const leaderToken = leaderLogin.data.token;

		// Leader resets student password via /api/admincp/users (action: reset_password)
		const resetRes = await adminUsersPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/admincp/users',
				method: 'POST',
				token: leaderToken,
				body: {
					action: 'reset_password',
					userId: 'usr_student_sync',
					newPassword: 'ResetByAdmin#2026',
					mustChangePassword: false
				},
				platform
			})
		);
		const resetData = await resetRes.json();
		assert.equal(resetRes.status, 200);
		assert.equal(resetData.success, true);

		// Student logs in with the Admin-reset password
		const studentLogin = await loginUser(platform, 'student_sync', 'ResetByAdmin#2026');
		assert.equal(studentLogin.status, 200);
		assert.equal(Boolean(studentLogin.data.user.must_change_password), false);

		// Leader also resets student password via /api/auth/change-password (target_user_id)
		const resetViaAuthRes = await changePasswordPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/auth/change-password',
				method: 'POST',
				token: leaderToken,
				body: {
					target_user_id: 'usr_student_sync',
					new_password: 'ResetViaAuthEndpoint#2026'
				},
				platform
			})
		);
		assert.equal(resetViaAuthRes.status, 200);

		const studentLogin2 = await loginUser(platform, 'student_sync', 'ResetViaAuthEndpoint#2026');
		assert.equal(studentLogin2.status, 200);
	});

	it('3. Synchronizes multi-role user creation, teacher profiles, student stars, parent links, schedule, attendance, and tuition across D1 endpoints', async () => {
		const { platform } = await createTestPlatform();
		const leaderLogin = await loginUser(platform, 'leader_sync', 'AdminOldPass#2026');
		const leaderToken = leaderLogin.data.token;

		// 3A. Create a new Student in AdminCP with 500 initial stars
		const createStudentRes = await adminUsersPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/admincp/users',
				method: 'POST',
				token: leaderToken,
				body: {
					action: 'create_user',
					username: 'hs_moi_d1',
					name: 'Nguyễn Minh Khôi D1',
					role: 'student',
					grade: 'Lớp 8',
					class_id: 'cls_8a_d1',
					password: 'HsPassword#2026',
					initial_stars: 500
				},
				platform
			})
		);
		const createStudentData = await createStudentRes.json();
		assert.ok(createStudentRes.status === 200 || createStudentRes.status === 201);
		assert.equal(createStudentData.success, true);
		const newStudentId = createStudentData.user.id;

		// Verify student is returned in GET /api/students with stars_balance = 500
		const stuListRes = await studentsGet(
			makeEvent({
				url: 'https://timbk.io.vn/api/students',
				method: 'GET',
				token: leaderToken,
				platform
			})
		);
		const stuListData = await stuListRes.json();
		assert.equal(stuListData.success, true);
		const syncedStudent = stuListData.students.find((s) => s.id === newStudentId);
		assert.ok(syncedStudent);
		assert.equal(syncedStudent.name, 'Nguyễn Minh Khôi D1');
		assert.equal(syncedStudent.stars_balance, 500);

		// 3B. Create a new Teacher in AdminCP and verify automatic sync with GET /api/teachers/staff
		const createTeacherRes = await adminUsersPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/admincp/users',
				method: 'POST',
				token: leaderToken,
				body: {
					action: 'create_user',
					username: 'gv_moi_d1',
					name: 'Cô Lan Anh IELTS',
					role: 'teacher',
					tier: 'senior_teacher',
					hourly_rate_vnd: 250000,
					specialization: 'IELTS 7.5 & Giao tiếp',
					password: 'GvPassword#2026'
				},
				platform
			})
		);
		const createTeacherData = await createTeacherRes.json();
		assert.ok(createTeacherRes.status === 200 || createTeacherRes.status === 201);
		const newTeacherId = createTeacherData.user.id;

		const staffRes = await teachersStaffGet(
			makeEvent({
				url: 'https://timbk.io.vn/api/teachers/staff',
				method: 'GET',
				token: leaderToken,
				platform
			})
		);
		const staffData = await staffRes.json();
		assert.equal(staffData.success, true);
		const syncedTeacher = staffData.teachers.find((t) => t.id === newTeacherId);
		assert.ok(syncedTeacher);
		assert.equal(syncedTeacher.hourly_rate_vnd, 250000);

		// Verify newly created Teacher can log in and call staff endpoints
		const teacherLogin = await loginUser(platform, 'gv_moi_d1', 'GvPassword#2026');
		assert.equal(teacherLogin.status, 200);
		const teacherToken = teacherLogin.data.token;

		// 3C. Create a Parent and link to Student in AdminCP -> verify GET /api/parents/children
		const createParentRes = await adminUsersPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/admincp/users',
				method: 'POST',
				token: leaderToken,
				body: {
					action: 'create_user',
					username: 'ph_moi_d1',
					name: 'Phụ Huynh Minh Khôi',
					role: 'parent',
					linked_student_id: newStudentId,
					password: 'PhPassword#2026'
				},
				platform
			})
		);
		assert.ok(createParentRes.status === 200 || createParentRes.status === 201);

		const parentLogin = await loginUser(platform, 'ph_moi_d1', 'PhPassword#2026');
		assert.equal(parentLogin.status, 200);
		const parentToken = parentLogin.data.token;

		const childrenRes = await parentsChildrenGet(
			makeEvent({
				url: 'https://timbk.io.vn/api/parents/children',
				method: 'GET',
				token: parentToken,
				platform
			})
		);
		const childrenData = await childrenRes.json();
		assert.equal(childrenData.success, true);
		assert.equal(childrenData.children.some((c) => c.id === newStudentId && c.is_verified === true), true);

		// 3D. Create a Schedule Session & Record Attendance via Teacher token -> verify sync
		const schedCreateRes = await schedulePost(
			makeEvent({
				url: 'https://timbk.io.vn/api/schedule',
				method: 'POST',
				token: leaderToken,
				body: {
					class_id: 'cls_8a_d1',
					class_name: 'Lớp 8A Chuyên Anh D1',
					grade_level: 'Lớp 8',
					teacher_id: newTeacherId,
					teacher_name: 'Cô Lan Anh IELTS',
					day_of_week: 'Thứ 3',
					session_date: '2026-10-20',
					start_time: '18:00',
					end_time: '19:30',
					room_name: 'Phòng 201',
					topic: 'Unit 4: Past Continuous & Reading'
				},
				platform
			})
		);
		const schedCreateData = await schedCreateRes.json();
		assert.equal(schedCreateRes.status, 200);
		assert.equal(schedCreateData.success, true);
		const sessionId = schedCreateData.session.id;

		// Teacher records roll-call attendance on D1
		const attPostRes = await attendancePost(
			makeEvent({
				url: 'https://timbk.io.vn/api/attendance',
				method: 'POST',
				token: teacherToken,
				body: {
					session_id: sessionId,
					class_id: 'cls_8a_d1',
					attendance_date: '2026-10-20',
					records: [
						{ student_id: newStudentId, status: 'present', note: 'Đi học đúng giờ, phát biểu sôi nổi' }
					]
				},
				platform
			})
		);
		const attPostData = await attPostRes.json();
		assert.equal(attPostRes.status, 200);
		assert.equal(attPostData.success, true);

		const attGetRes = await attendanceGet(
			makeEvent({
				url: `https://timbk.io.vn/api/attendance?session_id=${sessionId}`,
				method: 'GET',
				token: leaderToken,
				platform
			})
		);
		const attGetData = await attGetRes.json();
		assert.equal(attGetData.records.length, 1);
		assert.equal(attGetData.records[0].student_id, newStudentId);
		assert.equal(attGetData.records[0].status, 'present');

		// 3E. Issue Tuition Invoice with Star Deduction on D1 -> verify student star balance & invoice list
		const tuitionCreateRes = await tuitionPost(
			makeEvent({
				url: 'https://timbk.io.vn/api/tuition',
				method: 'POST',
				token: leaderToken,
				body: {
					student_id: newStudentId,
					billing_period: '2026-10',
					base_tuition_vnd: 1800000,
					stars_deducted: 200,
					notes: 'Trừ 200 sao tích lũy D1'
				},
				platform
			})
		);
		const tuitionCreateData = await tuitionCreateRes.json();
		assert.equal(tuitionCreateRes.status, 200);
		assert.equal(tuitionCreateData.success, true);

		// Verify GET /api/admincp/users reflects the updated star balance (500 - 200 = 300)
		const adminUsersRes = await adminUsersGet(
			makeEvent({
				url: 'https://timbk.io.vn/api/admincp/users',
				method: 'GET',
				token: leaderToken,
				platform
			})
		);
		const adminUsersData = await adminUsersRes.json();
		assert.equal(adminUsersData.success, true);
		const enrichedStu = adminUsersData.users.find((u) => u.id === newStudentId);
		assert.equal(enrichedStu.stars_balance, 300);
	});
});
