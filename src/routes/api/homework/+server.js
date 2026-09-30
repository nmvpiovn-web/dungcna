import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

// Ensure tables exist on D1
async function ensureTables(db) {
  if (!db) return;
  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS homework_assignments (
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
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS homework_submissions (
          id TEXT PRIMARY KEY,
          assignment_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          submission_type TEXT NOT NULL,
          content_text TEXT,
          audio_url TEXT,
          handwritten_image_url TEXT,
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
          version INTEGER DEFAULT 1,
          grading_token TEXT,
          status TEXT DEFAULT 'submitted'
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS location_activity_streams (
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
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS class_enrollments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          class_id TEXT NOT NULL,
          enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active',
          UNIQUE(user_id, class_id)
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS system_notifications (
          id TEXT PRIMARY KEY,
          target_role TEXT,
          target_user_id TEXT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          category TEXT,
          reference_id TEXT,
          is_read INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS student_stars (
          student_id TEXT PRIMARY KEY,
          stars_balance INTEGER DEFAULT 0,
          total_earned_stars INTEGER DEFAULT 0,
          stars_redeemed INTEGER DEFAULT 0,
          star_debt INTEGER DEFAULT 0,
          last_updated TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS student_star_ledger (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          bill_id TEXT,
          reference_id TEXT,
          delta_stars INTEGER NOT NULL,
          amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          debt_delta INTEGER DEFAULT 0,
          debt_after INTEGER DEFAULT 0,
          action_type TEXT NOT NULL,
          reason TEXT,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    ]);

    // Backward-compatible schema migrations
    const migrations = [
      'ALTER TABLE homework_submissions ADD COLUMN version INTEGER DEFAULT 1;',
      'ALTER TABLE homework_submissions ADD COLUMN grading_token TEXT;',
      'ALTER TABLE student_stars ADD COLUMN star_debt INTEGER DEFAULT 0;',
      'ALTER TABLE student_star_ledger ADD COLUMN bill_id TEXT;',
      'ALTER TABLE student_star_ledger ADD COLUMN reference_id TEXT;',
      'ALTER TABLE student_star_ledger ADD COLUMN delta_stars INTEGER;',
      'ALTER TABLE student_star_ledger ADD COLUMN amount INTEGER;',
      'ALTER TABLE student_star_ledger ADD COLUMN balance_after INTEGER;',
      'ALTER TABLE student_star_ledger ADD COLUMN debt_delta INTEGER DEFAULT 0;',
      'ALTER TABLE student_star_ledger ADD COLUMN debt_after INTEGER DEFAULT 0;',
      'ALTER TABLE student_star_ledger ADD COLUMN reason TEXT;',
      'ALTER TABLE student_star_ledger ADD COLUMN note TEXT;'
    ];
    for (const mig of migrations) {
      try {
        await db.prepare(mig).run();
      } catch (migErr) {
        const msg = (migErr?.message || '').toLowerCase();
        if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
          throw migErr;
        }
      }
    }

    // Historical baseline reconciliation migration for legacy star_debt > 0
    // If student has star_debt > 0 from legacy schema, but student_star_ledger has no baseline or debt_after defaulted to 0,
    // insert an opening baseline entry so historical debt is never falsely attributed as a new transaction delta.
    // FAIL-CLOSED: Errors (triggers, constraints, I/O) are NOT swallowed, allowing calling handlers to abort write transactions cleanly.
    await db.prepare(`
      INSERT INTO student_star_ledger (
        id, student_id, bill_id, reference_id, delta_stars, amount, balance_after, debt_delta, debt_after, action_type, reason, note, created_at
      )
      SELECT
        'ledger_mig_base_' || s.student_id,
        s.student_id,
        NULL,
        'migration_baseline',
        0,
        0,
        s.stars_balance,
        0,
        s.star_debt,
        'migration_baseline',
        'Historical star debt baseline reconciliation',
        'Automated baseline reconciliation from legacy student_stars',
        s.last_updated
      FROM student_stars s
      WHERE s.star_debt > 0
        AND NOT EXISTS (
          SELECT 1 FROM student_star_ledger l
          WHERE l.student_id = s.student_id AND l.action_type = 'migration_baseline'
        )
        AND (
          NOT EXISTS (SELECT 1 FROM student_star_ledger l WHERE l.student_id = s.student_id)
          OR (SELECT COALESCE(debt_after, 0) FROM student_star_ledger l WHERE l.student_id = s.student_id ORDER BY rowid DESC LIMIT 1) = 0
        );
    `).run();
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('already exists') || msg.includes('duplicate column')) {
      return;
    }
    console.error('Homework tables ensureTables fail-closed error:', e);
    throw e;
  }
}

// In-Memory store for local development testing
let inMemoryAssignments = [
  {
    id: 'hw_demo_g7_writing',
    session_id: 'sess_g7_mon',
    class_id: 'cls_g7',
    class_name: 'Tiếng Anh Lớp 7 - Chuyên Sâu',
    teacher_id: 'user_teacher_quynh',
    teacher_name: 'Cô Như Quỳnh',
    campus_id: 'loc_codung',
    skill_type: 'writing',
    title: 'Viết Đoạn Văn Về Lợi Ích Của Năng Lượng Tái Tạo (Renewable Energy)',
    description: 'Viết từ 80-100 từ sử dụng các từ vựng đã học trong Unit 10: solar, wind power, footprint. Chú ý cấu trúc Will / Won\'t.',
    obsidian_note_id: 'UNIT_10_ENERGY_SOURCES',
    obsidian_note_title: 'Unit 10: Energy Sources & Environmental Impact',
    assigned_date: '2026-10-05',
    deadline_date: '2026-10-08',
    deadline_time: '18:00',
    max_score: 10.0,
    star_reward_on_time: 50,
    status: 'published',
    created_at: '2026-10-05T19:30:00Z'
  },
  {
    id: 'hw_demo_g7_speaking',
    session_id: 'sess_g7_wed',
    class_id: 'cls_g7',
    class_name: 'Tiếng Anh Lớp 7 - Chuyên Sâu',
    teacher_id: 'user_teacher_quynh',
    teacher_name: 'Cô Như Quỳnh',
    campus_id: 'loc_sunshine',
    skill_type: 'speaking',
    title: 'Luyện Phát Âm & Đọc To Đoạn Hội Thoại Về Du Lịch Tương Lai',
    description: 'Học sinh ghi âm trực tiếp bằng micro trên webapp: đọc to đoạn văn mẫu 1 phút, phát âm chuẩn đuôi /s/, /es/ và ngữ điệu câu hỏi.',
    obsidian_note_id: 'PHONICS_S_ES_ENDINGS',
    obsidian_note_title: 'Chuyên Đề Ngữ Âm: Quy Tắc Phát Âm Đuôi S/ES Chuẩn Oxford',
    assigned_date: '2026-10-06',
    deadline_date: '2026-10-09',
    deadline_time: '17:30',
    max_score: 10.0,
    star_reward_on_time: 100,
    status: 'published',
    created_at: '2026-10-06T19:30:00Z'
  }
];

let inMemorySubmissions = [
  {
    id: 'sub_demo_01',
    assignment_id: 'hw_demo_g7_writing',
    student_id: 'user_student_1',
    student_name: 'Nguyễn Minh Quân',
    submission_type: 'writing',
    content_text: 'In the future, we will use more solar energy and wind power to protect our planet. It does not cause carbon footprint and helps keep our air clean.',
    audio_url: null,
    attachments_json: '[]',
    submitted_at: '2026-10-07T14:20:00Z',
    is_on_time: 1,
    graded_by_teacher_id: 'user_teacher_quynh',
    graded_by_teacher_name: 'Cô Như Quỳnh',
    graded_at: '2026-10-07T16:00:00Z',
    score: 9.5,
    teacher_feedback: 'Bài viết rất tốt, dùng đúng từ vựng Unit 10 và cấu trúc ngữ pháp chuẩn xác. Tiếp tục phát huy nhé con!',
    audio_feedback_url: null,
    stars_awarded: 50,
    star_awarded_reason: 'Hoàn thành BTVN xuất sắc và đúng hạn',
    status: 'graded'
  }
];

export async function GET({ request, url, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const role = user.role;
  const skillFilter = url.searchParams.get('skill') || 'all';
  const campusFilter = url.searchParams.get('campus_id') || 'all';
  const assignmentId = url.searchParams.get('id');
  const requestedChildId = url.searchParams.get('child_id') || url.searchParams.get('student_id');

  const db = platform?.env?.DB;

  if (db) {
    try {
      await ensureTables(db);

      // Single assignment requested
      if (assignmentId) {
        const aRes = await db.prepare('SELECT * FROM homework_assignments WHERE id = ?').bind(assignmentId).first();
        if (!aRes) {
          return json({ success: false, error: 'Không tìm thấy bài tập' }, { status: 404 });
        }

        // Scope check for student: must be actively enrolled in assignment's class
        if (role === 'student') {
          const isEnrolled = await db.prepare(
            'SELECT 1 FROM class_enrollments WHERE user_id = ? AND class_id = ? AND status = \'active\' LIMIT 1'
          ).bind(user.id, aRes.class_id).first();
          if (!isEnrolled) {
            return json({ success: false, error: 'Forbidden: Bạn không có quyền truy cập bài tập của lớp này' }, { status: 403 });
          }
        }

        // Scope check for parent: must have a verified child actively enrolled in assignment's class
        if (role === 'parent') {
          const isEnrolled = await db.prepare(`
            SELECT 1 FROM class_enrollments ce
            JOIN parent_student_links psl ON psl.student_user_id = ce.user_id
            WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
              AND ce.class_id = ? AND ce.status = 'active' LIMIT 1
          `).bind(user.id, aRes.class_id).first();
          if (!isEnrolled) {
            return json({ success: false, error: 'Forbidden: Con bạn không thuộc lớp của bài tập này hoặc liên kết chưa được xác minh' }, { status: 403 });
          }
        }

        const sRes = await db.prepare('SELECT * FROM homework_submissions WHERE assignment_id = ?').bind(assignmentId).all();
        return json({ success: true, assignment: aRes, submissions: sRes.results || [] });
      }

      // Query assignments with filters and strict class scoping
      let sql = 'SELECT * FROM homework_assignments WHERE 1=1';
      let params = [];

      if (skillFilter !== 'all') {
        sql += ' AND skill_type = ?';
        params.push(skillFilter);
      }
      if (campusFilter !== 'all') {
        sql += ' AND campus_id = ?';
        params.push(campusFilter);
      }
      if (role === 'teacher') {
        sql += ' AND teacher_id = ?';
        params.push(user.id);
      } else if (role === 'student') {
        // Student only sees assignments of classes they are actively enrolled in
        sql += ` AND class_id IN (
          SELECT class_id FROM class_enrollments
          WHERE user_id = ? AND status = 'active'
        )`;
        params.push(user.id);
      } else if (role === 'parent') {
        // Parent only sees assignments of classes their verified children are actively enrolled in
        if (requestedChildId && requestedChildId !== 'all') {
          sql += ` AND class_id IN (
            SELECT ce.class_id FROM class_enrollments ce
            JOIN parent_student_links psl ON psl.student_user_id = ce.user_id
            WHERE psl.parent_user_id = ? AND psl.student_user_id = ?
              AND psl.verification_status = 'verified' AND ce.status = 'active'
          )`;
          params.push(user.id, requestedChildId);
        } else {
          sql += ` AND class_id IN (
            SELECT ce.class_id FROM class_enrollments ce
            JOIN parent_student_links psl ON psl.student_user_id = ce.user_id
            WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified' AND ce.status = 'active'
          )`;
          params.push(user.id);
        }
      }

      sql += ' ORDER BY created_at DESC LIMIT 100;';
      const assignmentsRes = await db.prepare(sql).bind(...params).all();
      const assignments = assignmentsRes.results || [];

      // Fetch submissions based on role
      let submissions = [];
      let linkedChildren = [];
      if (role === 'student') {
        const subRes = await db.prepare('SELECT * FROM homework_submissions WHERE student_id = ?').bind(user.id).all();
        submissions = subRes.results || [];
      } else if (role === 'parent') {
        const linksRes = await db.prepare(`
          SELECT psl.student_user_id, u.name as student_name, u.grade, u.avatar
          FROM parent_student_links psl
          LEFT JOIN users u ON psl.student_user_id = u.id
          WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
        `).bind(user.id).all();
        linkedChildren = linksRes.results || [];
        const studentIds = linkedChildren.map(r => r.student_user_id).filter(Boolean);

        if (studentIds.length === 0) {
          return json({ success: true, assignments, submissions: [], linked_children: [], total: assignments.length });
        }

        if (requestedChildId && requestedChildId !== 'all') {
          if (!studentIds.includes(requestedChildId)) {
            return json({ success: false, error: 'Forbidden: Quý phụ huynh chỉ có quyền xem bài tập của con em mình' }, { status: 403 });
          }
          const subRes = await db.prepare('SELECT * FROM homework_submissions WHERE student_id = ?').bind(requestedChildId).all();
          submissions = subRes.results || [];
        } else {
          const placeholders = studentIds.map(() => '?').join(',');
          const subRes = await db.prepare(`SELECT * FROM homework_submissions WHERE student_id IN (${placeholders})`).bind(...studentIds).all();
          submissions = subRes.results || [];
        }
      } else {
        // Teacher / Leader / Superadmin
        const subRes = await db.prepare('SELECT * FROM homework_submissions ORDER BY submitted_at DESC LIMIT 200').all();
        submissions = subRes.results || [];
      }

      return json({
        success: true,
        assignments,
        submissions,
        linked_children: linkedChildren,
        total: assignments.length
      });
    } catch (e) {
      console.error('Error fetching homework from D1:', e);
      return json({ success: false, error: 'DatabaseError: Lỗi khi truy vấn bài tập về nhà' }, { status: 503 });
    }
  }

  // Fail-Closed if no DB on production
  const isMockAllowed = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process?.env?.ENABLE_LOCAL_MOCK === 'true';
  if (!isMockAllowed) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng (Fail-Closed)' }, { status: 503 });
  }

  // Fallback in-memory handling ONLY for local mock dev
  let assignments = inMemoryAssignments;
  if (skillFilter !== 'all') assignments = assignments.filter(a => a.skill_type === skillFilter);
  if (campusFilter !== 'all') assignments = assignments.filter(a => a.campus_id === campusFilter);
  if (role === 'teacher') assignments = assignments.filter(a => a.teacher_id === user.id);

  let submissions = inMemorySubmissions;
  if (role === 'student') submissions = submissions.filter(s => s.student_id === user.id);
  else if (role === 'parent' && requestedChildId && requestedChildId !== 'all') {
    submissions = submissions.filter(s => s.student_id === requestedChildId);
  }

  return json({
    success: true,
    assignments,
    submissions,
    linked_children: [],
    total: assignments.length,
    source: 'local_mock'
  });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const isStaff = isStaffUser(user);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu JSON hợp lệ' }, { status: 400 });
  }

  const action = body.action || '';
  const db = platform?.env?.DB;

  // Fail-Closed requirement: DB is mandatory on production
  if (!db) {
    const isMockAllowed = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || process?.env?.ENABLE_LOCAL_MOCK === 'true';
    if (!isMockAllowed) {
      return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng (Fail-Closed)' }, { status: 503 });
    }
  }

  // ACTION 1: ASSIGN HOMEWORK (Teacher / Staff only)
  if (action === 'assign') {
    if (!isStaff) {
      return json({ success: false, error: 'Forbidden: Chỉ giáo viên hoặc quản lý mới có quyền giao BTVN' }, { status: 403 });
    }

    const {
      session_id,
      class_id,
      class_name,
      skill_type,
      title,
      description,
      obsidian_note_id,
      obsidian_note_title,
      campus_id = 'loc_codung',
      deadline_date: inputDeadlineDate,
      deadline_time: inputDeadlineTime = '18:00',
      max_score = 10.0,
      star_reward_on_time = 50
    } = body;

    if (!session_id || !class_id || !skill_type || !title) {
      return json({ success: false, error: 'Thiếu thông tin bắt buộc: session_id, class_id, skill_type, title' }, { status: 400 });
    }

    const validSkills = ['writing', 'reading', 'speaking'];
    if (!validSkills.includes(skill_type)) {
      return json({ success: false, error: `skill_type không hợp lệ. Phải là một trong: ${validSkills.join(', ')}` }, { status: 400 });
    }

    let finalDeadlineDate = inputDeadlineDate;
    let finalDeadlineTime = inputDeadlineTime;
    if (!finalDeadlineDate) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      finalDeadlineDate = d.toISOString().split('T')[0];
    }

    const assignmentId = body.id || `hw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAssignment = {
      id: assignmentId,
      session_id,
      class_id,
      class_name: class_name || class_id,
      teacher_id: user.id,
      teacher_name: user.name || user.username || 'Giáo viên',
      campus_id,
      skill_type,
      title: title.trim(),
      description: description ? description.trim() : '',
      obsidian_note_id: obsidian_note_id || null,
      obsidian_note_title: obsidian_note_title || null,
      assigned_date: new Date().toISOString().split('T')[0],
      deadline_date: finalDeadlineDate,
      deadline_time: finalDeadlineTime,
      max_score: Number(max_score) || 10.0,
      star_reward_on_time: Number(star_reward_on_time) || 50,
      status: 'published',
      created_at: new Date().toISOString()
    };

    if (db) {
      try {
        await ensureTables(db);

        // Fetch verified parents of students actively enrolled in this class
        const linksRes = await db.prepare(`
          SELECT DISTINCT psl.parent_user_id
          FROM parent_student_links psl
          JOIN class_enrollments ce ON ce.user_id = psl.student_user_id
          WHERE psl.verification_status = 'verified'
            AND psl.parent_user_id IS NOT NULL
            AND ce.class_id = ? AND ce.status = 'active';
        `).bind(class_id).all();

        const uniqueParents = [...new Set((linksRes.results || []).map(r => r.parent_user_id).filter(Boolean))];

        // Fetch students actively enrolled in this class
        const studentRes = await db.prepare(`
          SELECT user_id as id FROM class_enrollments
          WHERE class_id = ? AND status = 'active';
        `).bind(class_id).all();
        const classStudents = [...new Set((studentRes.results || []).map(r => r.id).filter(Boolean))];

        // Prepare atomic batch statements
        const batchStatements = [];

        // 1. Primary Assignment Insert
        batchStatements.push(
          db.prepare(`
            INSERT INTO homework_assignments (
              id, session_id, class_id, class_name, teacher_id, teacher_name, campus_id,
              skill_type, title, description, obsidian_note_id, obsidian_note_title,
              assigned_date, deadline_date, deadline_time, max_score, star_reward_on_time, status, created_at,
              due_date, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `).bind(
            newAssignment.id, newAssignment.session_id, newAssignment.class_id, newAssignment.class_name,
            newAssignment.teacher_id, newAssignment.teacher_name, newAssignment.campus_id,
            newAssignment.skill_type, newAssignment.title, newAssignment.description,
            newAssignment.obsidian_note_id, newAssignment.obsidian_note_title,
            newAssignment.assigned_date, newAssignment.deadline_date, newAssignment.deadline_time,
            newAssignment.max_score, newAssignment.star_reward_on_time, newAssignment.status, newAssignment.created_at,
            newAssignment.deadline_date, user.id
          )
        );

        // 2. Deterministic Parent Notifications
        const notifSkillMap = { writing: 'Viết', reading: 'Đọc hiểu', speaking: 'Nói' };
        const notifTitle = `📚 BTVN Mới (${notifSkillMap[skill_type] || skill_type}): ${title}`;
        const notifBody = `Giáo viên ${newAssignment.teacher_name} vừa giao BTVN lớp ${newAssignment.class_name}. Hạn nộp trước ${finalDeadlineTime} ngày ${finalDeadlineDate}.`;

        for (const parentId of uniqueParents) {
          const notifId = `notif_hw_${assignmentId}_p_${parentId}`;
          batchStatements.push(
            db.prepare(`
              INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
              VALUES (?, 'parent', ?, ?, ?, 'homework', ?)
              ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body;
            `).bind(notifId, parentId, notifTitle, notifBody, assignmentId)
          );
        }

        // 3. Deterministic Student Notifications
        for (const studentId of classStudents) {
          const notifIdStudent = `notif_hw_${assignmentId}_s_${studentId}`;
          batchStatements.push(
            db.prepare(`
              INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
              VALUES (?, 'student', ?, ?, ?, 'homework', ?)
              ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body;
            `).bind(notifIdStudent, studentId, `📚 BTVN Mới: ${title}`, `Giáo viên ${newAssignment.teacher_name} vừa giao BTVN lớp ${newAssignment.class_name}.`, assignmentId)
          );
        }

        // 4. Activity Stream Entry
        const streamId = `stm_${assignmentId}`;
        batchStatements.push(
          db.prepare(`
            INSERT INTO location_activity_streams (id, campus_id, actor_id, actor_name, actor_role, activity_type, title, detail, reference_id)
            VALUES (?, ?, ?, ?, 'teacher', 'homework_assigned', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title = excluded.title, detail = excluded.detail;
          `).bind(
            streamId, campus_id, user.id, user.name || user.username,
            `Giao BTVN: ${title}`,
            `Lớp ${newAssignment.class_name}`,
            assignmentId
          )
        );

        // Execute batch transaction atomically
        await db.batch(batchStatements);

      } catch (e) {
        console.error('Failed to save assignment to D1:', e);
        return json({
          success: false,
          error: `DatabaseError: Lỗi ghi bài tập vào cơ sở dữ liệu. ${e.message || ''}`.trim()
        }, { status: 503 });
      }
    }

    inMemoryAssignments.unshift(newAssignment);
    return json({ success: true, message: 'Đã giao bài tập về nhà thành công!', assignment: newAssignment });
  }

  // ACTION 2: SUBMIT HOMEWORK (Student)
  if (action === 'submit') {
    const { assignment_id, submission_type, content_text, audio_url, handwritten_image_url, attachments_json = '[]' } = body;
    if (!assignment_id || !submission_type) {
      return json({ success: false, error: 'Thiếu assignment_id hoặc submission_type' }, { status: 400 });
    }

    const validSubmissionTypes = ['writing', 'speaking', 'reading', 'handwritten'];
    if (!validSubmissionTypes.includes(submission_type)) {
      return json({ success: false, error: `submission_type không hợp lệ: ${submission_type}` }, { status: 400 });
    }

    let assignment = inMemoryAssignments.find(a => a.id === assignment_id);

    if (db) {
      try {
        const d1Assignment = await db.prepare('SELECT * FROM homework_assignments WHERE id = ?').bind(assignment_id).first();
        if (d1Assignment) assignment = d1Assignment;
      } catch {}
    }

    if (!assignment) {
      return json({ success: false, error: 'Không tìm thấy bài tập được chỉ định' }, { status: 404 });
    }

    // Authorization check: student must be actively enrolled in assignment's class
    if (db && user.role === 'student') {
      const isEnrolled = await db.prepare(`
        SELECT 1 FROM class_enrollments
        WHERE user_id = ? AND class_id = ? AND status = 'active' LIMIT 1;
      `).bind(user.id, assignment.class_id).first();
      if (!isEnrolled) {
        return json({ success: false, error: 'Forbidden: Bạn không thuộc lớp học của bài tập này' }, { status: 403 });
      }
    }

    // Check on-time submission
    let isOnTime = 1;
    const now = new Date();
    try {
      const deadlineStr = `${assignment.deadline_date}T${assignment.deadline_time || '23:59'}:00`;
      const deadline = new Date(deadlineStr);
      if (now > deadline) isOnTime = 0;
    } catch {}

    const submissionId = body.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const submissionRecord = {
      id: submissionId,
      assignment_id,
      student_id: user.id,
      student_name: user.name || user.username || 'Học viên',
      submission_type,
      content_text: content_text || null,
      audio_url: audio_url || null,
      handwritten_image_url: handwritten_image_url || null,
      attachments_json: typeof attachments_json === 'string' ? attachments_json : JSON.stringify(attachments_json),
      submitted_at: now.toISOString(),
      is_on_time: isOnTime,
      graded_by_teacher_id: null,
      graded_by_teacher_name: null,
      graded_at: null,
      score: null,
      teacher_feedback: null,
      audio_feedback_url: null,
      stars_awarded: 0,
      star_awarded_reason: null,
      status: 'submitted'
    };

    if (db) {
      try {
        await ensureTables(db);
        const batchStatements = [
          db.prepare(`
            INSERT INTO homework_submissions (
              id, assignment_id, student_id, student_name, submission_type,
              content_text, audio_url, handwritten_image_url, attachments_json,
              submitted_at, is_on_time, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              content_text = excluded.content_text,
              audio_url = excluded.audio_url,
              handwritten_image_url = excluded.handwritten_image_url,
              attachments_json = excluded.attachments_json,
              submitted_at = excluded.submitted_at,
              is_on_time = excluded.is_on_time;
          `).bind(
            submissionRecord.id, submissionRecord.assignment_id, submissionRecord.student_id,
            submissionRecord.student_name, submissionRecord.submission_type,
            submissionRecord.content_text, submissionRecord.audio_url, submissionRecord.handwritten_image_url,
            submissionRecord.attachments_json, submissionRecord.submitted_at, submissionRecord.is_on_time,
            submissionRecord.status
          ),
          db.prepare(`
            INSERT INTO location_activity_streams (id, campus_id, actor_id, actor_name, actor_role, activity_type, title, detail, reference_id)
            VALUES (?, ?, ?, ?, 'student', 'homework_submitted', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title = excluded.title, detail = excluded.detail;
          `).bind(
            `stm_sub_${submissionId}`, assignment.campus_id || 'loc_codung', user.id, user.name || user.username,
            `Nộp BTVN: ${assignment.title}`,
            `Kỹ năng: ${submission_type} • Trạng thái: ${isOnTime ? 'Đúng hạn' : 'Nộp muộn'}`,
            submissionId
          )
        ];

        await db.batch(batchStatements);

      } catch (e) {
        console.error('Failed to save submission to D1:', e);
        return json({
          success: false,
          error: `DatabaseError: Lỗi ghi bài nộp vào cơ sở dữ liệu. ${e.message || ''}`.trim()
        }, { status: 503 });
      }
    }

    const existingIdx = inMemorySubmissions.findIndex(s => s.assignment_id === assignment_id && s.student_id === user.id);
    if (existingIdx >= 0) inMemorySubmissions[existingIdx] = submissionRecord;
    else inMemorySubmissions.unshift(submissionRecord);

    return json({
      success: true,
      message: isOnTime ? 'Nộp bài thành công đúng hạn! Hãy chờ cô giáo chấm điểm nhé.' : 'Đã nộp bài (Nộp muộn hơn deadline). Hãy cố gắng nộp đúng hạn vào buổi tới con nhé!',
      submission: submissionRecord
    });
  }

  // ACTION 3: GRADE HOMEWORK (Teacher / Staff only)
  if (action === 'grade') {
    if (!isStaff) {
      return json({ success: false, error: 'Forbidden: Chỉ giáo viên mới có quyền chấm BTVN' }, { status: 403 });
    }

    const { submission_id, score, teacher_feedback, audio_feedback_url } = body;
    if (!submission_id || score === undefined || score === null) {
      return json({ success: false, error: 'Thiếu submission_id hoặc score' }, { status: 400 });
    }

    const numericScore = Math.max(0, Math.min(10.0, Number(score)));
    let submission = inMemorySubmissions.find(s => s.id === submission_id);

    if (db) {
      try {
        const d1S = await db.prepare('SELECT * FROM homework_submissions WHERE id = ?').bind(submission_id).first();
        if (d1S) submission = d1S;
      } catch {}
    }

    if (!submission) {
      return json({ success: false, error: 'Không tìm thấy bài nộp' }, { status: 404 });
    }

    // Idempotent retry check on already-committed state
    if (
      submission.status === 'graded' &&
      Number(submission.score) === numericScore &&
      (submission.teacher_feedback || '') === (teacher_feedback || '') &&
      submission.graded_by_teacher_id === user.id
    ) {
      return json({
        success: true,
        message: 'Bài tập đã được chấm điểm (kết quả đã ghi nhận trước đó).',
        submission
      });
    }

    // Star calculation rule:
    // score == 10.0 AND is_on_time == 1 -> 100 stars
    // score >= 8.5 AND is_on_time == 1 -> 50 stars
    // otherwise 0 stars
    let starsAwarded = 0;
    let starReason = '';

    if (submission.is_on_time === 1) {
      if (numericScore >= 10.0) {
        starsAwarded = 100;
        starReason = 'Thưởng đạt điểm tuyệt đối 10/10 & nộp bài đúng hạn';
      } else if (numericScore >= 8.5) {
        starsAwarded = 50;
        starReason = 'Thưởng đạt điểm giỏi (>=8.5) & nộp bài đúng hạn';
      }
    }

    // P1 Protection: Prevent double-awarding stars on regrade or retry!
    // Compute starDelta relative to any already-awarded stars
    const previousStars = Number(submission.stars_awarded || 0);
    const isRegrade = submission.status === 'graded';
    const starDelta = isRegrade ? (starsAwarded - previousStars) : starsAwarded;

    const currentVersion = Number(submission.version || 1);
    const newVersion = currentVersion + 1;

    const gradedAt = new Date().toISOString();
    const teacherName = user.name || user.username;
    if (typeof crypto === 'undefined' || !crypto.randomUUID) {
      return json({ success: false, error: 'Internal Server Error: Secure CSPRNG is required' }, { status: 500 });
    }
    const gradingToken = crypto.randomUUID();

    if (db) {
      try {
        await ensureTables(db);

        // Fetch current student stars snapshot for auditing & observability
        await db.prepare('SELECT stars_balance, total_earned_stars, stars_redeemed, star_debt FROM student_stars WHERE student_id = ?').bind(submission.student_id).first();

        // Optimistic Concurrency Control (CAS):
        // Atomic compare-and-swap incrementing version and writing unique grading_token
        let casSql;
        let casParams;
        if (isRegrade) {
          // Regrade / revision: verify previous version and status match snapshot
          casSql = `
            UPDATE homework_submissions
            SET graded_by_teacher_id = ?,
                graded_by_teacher_name = ?,
                graded_at = ?,
                score = ?,
                teacher_feedback = ?,
                audio_feedback_url = ?,
                stars_awarded = ?,
                star_awarded_reason = ?,
                version = ?,
                grading_token = ?,
                status = 'graded'
            WHERE id = ? AND (version = ? OR version IS NULL) AND status = 'graded';
          `;
          casParams = [
            user.id, teacherName, gradedAt, numericScore, teacher_feedback || '',
            audio_feedback_url || null, starsAwarded, starReason || null,
            newVersion, gradingToken, submission_id, currentVersion
          ];
        } else {
          // Initial grading: verify submission is in 'submitted' status and version matches snapshot
          casSql = `
            UPDATE homework_submissions
            SET graded_by_teacher_id = ?,
                graded_by_teacher_name = ?,
                graded_at = ?,
                score = ?,
                teacher_feedback = ?,
                audio_feedback_url = ?,
                stars_awarded = ?,
                star_awarded_reason = ?,
                version = ?,
                grading_token = ?,
                status = 'graded'
            WHERE id = ? AND (status = 'submitted' OR status IS NULL) AND (version = ? OR version IS NULL);
          `;
          casParams = [
            user.id, teacherName, gradedAt, numericScore, teacher_feedback || '',
            audio_feedback_url || null, starsAwarded, starReason || null,
            newVersion, gradingToken, submission_id, currentVersion
          ];
        }

        const batchStatements = [];

        // 1. CAS Update on homework_submissions (Statement 0 of atomic batch)
        batchStatements.push(
          db.prepare(casSql).bind(...casParams)
        );

        // 2. Adjust stars strictly by starDelta, conditional on this specific grading operation succeeding.
        // Uses SQL-level atomic delta math so that concurrent independent transactions are never overwritten!
        if (starDelta > 0) {
          batchStatements.push(
            db.prepare(`
              INSERT INTO student_stars (
                student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt, last_updated
              )
              SELECT ?, ?, ?, 0, 0, CURRENT_TIMESTAMP
              WHERE EXISTS (
                SELECT 1 FROM homework_submissions
                WHERE id = ? AND grading_token = ?
              )
              ON CONFLICT(student_id) DO UPDATE SET
                stars_balance = student_stars.stars_balance + (excluded.stars_balance - MIN(student_stars.star_debt, excluded.stars_balance)),
                star_debt = student_stars.star_debt - MIN(student_stars.star_debt, excluded.stars_balance),
                total_earned_stars = student_stars.total_earned_stars + excluded.total_earned_stars,
                last_updated = CURRENT_TIMESTAMP;
            `).bind(submission.student_id, starDelta, starDelta, submission_id, gradingToken)
          );
        } else if (starDelta < 0) {
          const reduction = Math.abs(starDelta);
          batchStatements.push(
            db.prepare(`
              INSERT INTO student_stars (
                student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt, last_updated
              )
              SELECT ?, 0, 0, 0, ?, CURRENT_TIMESTAMP
              WHERE EXISTS (
                SELECT 1 FROM homework_submissions
                WHERE id = ? AND grading_token = ?
              )
              ON CONFLICT(student_id) DO UPDATE SET
                stars_balance = MAX(0, student_stars.stars_balance - excluded.star_debt),
                star_debt = student_stars.star_debt + MAX(0, excluded.star_debt - student_stars.stars_balance),
                total_earned_stars = MAX(0, student_stars.total_earned_stars - excluded.star_debt),
                last_updated = CURRENT_TIMESTAMP;
            `).bind(submission.student_id, reduction, submission_id, gradingToken)
          );
        }

        // 3. Insert audit trail in student_star_ledger with unified schema (including debt_delta and debt_after), conditional on gradingToken
        if (starDelta !== 0) {
          const ledgerId = `ledger_hw_${submission_id}_${crypto.randomUUID()}`;
          const ledgerReason = starReason || (starDelta >= 0 ? 'Thưởng sao làm BTVN' : 'Điều chỉnh điểm BTVN');
          const ledgerAction = starDelta >= 0 ? 'homework_reward' : 'homework_adjustment';

          batchStatements.push(
            db.prepare(`
              INSERT INTO student_star_ledger (
                id, student_id, bill_id, reference_id, delta_stars, amount, balance_after, debt_delta, debt_after, action_type, reason, note
              )
              SELECT ?, ?, NULL, ?, ?, ?,
                     (SELECT stars_balance FROM student_stars WHERE student_id = ?),
                     (SELECT star_debt FROM student_stars WHERE student_id = ?) - COALESCE((SELECT debt_after FROM student_star_ledger WHERE student_id = ? ORDER BY rowid DESC LIMIT 1), (SELECT star_debt FROM student_stars WHERE student_id = ?)),
                     (SELECT star_debt FROM student_stars WHERE student_id = ?),
                     ?, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM homework_submissions
                WHERE id = ? AND grading_token = ?
              );
            `).bind(
              ledgerId, submission.student_id, submission_id,
              starDelta, starDelta,
              submission.student_id,
              submission.student_id,
              submission.student_id,
              submission.student_id,
              submission.student_id,
              ledgerAction,
              ledgerReason, ledgerReason,
              submission_id, gradingToken
            )
          );
        }

        // 4. Deterministic Student Notification, conditional on gradingToken
        const notifStudentId = `notif_grade_s_${submission_id}`;
        batchStatements.push(
          db.prepare(`
            INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
            SELECT ?, 'student', ?, ?, ?, 'homework', ?
            WHERE EXISTS (
              SELECT 1 FROM homework_submissions
              WHERE id = ? AND grading_token = ?
            )
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              body = excluded.body,
              is_read = 0;
          `).bind(
            notifStudentId, submission.student_id,
            `⭐ Kết Quả Chấm BTVN: ${numericScore} Điểm!`,
            `Cô ${teacherName} đã chấm bài tập của em: ${numericScore}/10 điểm. ${starsAwarded > 0 ? `Em được thưởng +${starsAwarded} sao! ` : ''}Lời cô: ${teacher_feedback || 'Rất đáng khen!'}`,
            submission_id,
            submission_id, gradingToken
          )
        );

        // 5. Deterministic Parent Notifications (Verified only), conditional on gradingToken
        const parentLinks = await db.prepare(`
          SELECT parent_user_id
          FROM parent_student_links
          WHERE student_user_id = ? AND verification_status = 'verified';
        `).bind(submission.student_id).all();

        for (const p of (parentLinks.results || [])) {
          if (!p.parent_user_id) continue;
          const notifParentId = `notif_grade_p_${submission_id}_${p.parent_user_id}`;
          batchStatements.push(
            db.prepare(`
              INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
              SELECT ?, 'parent', ?, ?, ?, 'homework', ?
              WHERE EXISTS (
                SELECT 1 FROM homework_submissions
                WHERE id = ? AND grading_token = ?
              )
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                is_read = 0;
            `).bind(
              notifParentId, p.parent_user_id,
              `📊 Báo Cáo Học Tập: Bé ${submission.student_name} đạt ${numericScore} Điểm`,
              `Cô giáo ${teacherName} vừa chấm BTVN của bé ${submission.student_name}: Điểm số ${numericScore}/10.${starsAwarded > 0 ? ` Bé nhận thêm +${starsAwarded} sao tích lũy học phí!` : ''} Nhận xét: "${teacher_feedback || 'Bé làm bài rất tốt.'}"`,
              submission_id,
              submission_id, gradingToken
            )
          );
        }

        // Execute entire grading operation atomically in a single batch
        const batchResults = await db.batch(batchStatements);

        const casChanges = Number(batchResults[0]?.meta?.changes || 0);
        if (casChanges === 0) {
          // Stale read or concurrent conflict!
          const current = await db.prepare('SELECT score, status, version, teacher_feedback, graded_by_teacher_id FROM homework_submissions WHERE id = ?').bind(submission_id).first();
          if (
            current &&
            current.status === 'graded' &&
            Number(current.score) === numericScore &&
            (current.teacher_feedback || '') === (teacher_feedback || '') &&
            current.graded_by_teacher_id === user.id
          ) {
            // True idempotent retry: exactly same teacher, score, and feedback already committed!
            return json({
              success: true,
              message: 'Bài tập đã được chấm điểm (kết quả đã ghi nhận trước đó).',
              submission: { ...submission, ...current }
            });
          }
          return json({
            success: false,
            error: 'Conflict: Trạng thái bài nộp đã bị thay đổi bởi thao tác khác (CAS race detected). Vui lòng tải lại trang.'
          }, { status: 409 });
        }

      } catch (e) {
        console.error('Failed to grade submission in D1:', e);
        return json({
          success: false,
          error: `DatabaseError: Lỗi chấm bài vào cơ sở dữ liệu. ${e.message || ''}`.trim()
        }, { status: 503 });
      }
    }

    submission.graded_by_teacher_id = user.id;
    submission.graded_by_teacher_name = teacherName;
    submission.graded_at = gradedAt;
    submission.score = numericScore;
    submission.teacher_feedback = teacher_feedback || '';
    submission.audio_feedback_url = audio_feedback_url || null;
    submission.stars_awarded = starsAwarded;
    submission.star_awarded_reason = starReason;
    submission.status = 'graded';
    submission.version = newVersion;

    return json({
      success: true,
      message: `Đã lưu kết quả chấm điểm ${numericScore}/10 thành công!`,
      submission
    });
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}
