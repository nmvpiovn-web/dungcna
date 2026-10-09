// src/routes/api/bot/zalo/+server.js
// RB-M3 (2026-09-30): HONEST Zalo bot — every action now reads/writes the real
// Cloudflare D1 database via platform.env.DB and reports the TRUE outcome.
// The old implementation called client-store functions (unifiedStore.js) whose
// save*() are no-ops on the server, yet returned success:true ("thành công giả").
// Choice (a) per fix plan: real D1, honest success/failure. No DB binding -> 503,
// never a fake success.
import { json } from '@sveltejs/kit';
import { formatParentReportCard } from '../../../../lib/unifiedStore.js';
import { verifyServiceSecret } from '../../../../lib/server/serviceAuth.js';
import { hashPassword } from '../../../../lib/server/auth.js';

export const prerender = false;

function newId(prefix) {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

const dbUnavailable = () =>
  json(
    {
      success: false,
      error: 'DatabaseUnavailable: Cloudflare D1 (DB) chưa khả dụng — thao tác bị từ chối, không ghi dữ liệu giả.'
    },
    { status: 503 }
  );

export async function POST({ request, platform }) {
  try {
    const serviceAuth = verifyServiceSecret(request, platform, 'ZALO_BOT_WEBHOOK_SECRET', 'x-zalo-webhook-secret');
    if (!serviceAuth.ok) return json({ success: false, error: serviceAuth.error }, { status: serviceAuth.status });

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      return json({ success: false, error: 'JSON không hợp lệ' }, { status: 400 });
    }
    const action = payload.action || 'info';
    const db = platform?.env?.DB;

    // 1. Add Student via Zalo Bot — real INSERT into D1 users
    if (action === 'add_student') {
      if (!db) return dbUnavailable();
      if (!payload.name || !payload.grade) {
        return json({ success: false, error: 'ValidationError: name và grade tường minh là bắt buộc.' }, { status: 400 });
      }
      const username = String(payload.phone || payload.parent_phone || '').trim() || `zalo_${Date.now()}`;
      const dupe = await db.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').bind(username).first();
      if (dupe) {
        return json({ success: false, error: `Tên đăng nhập/SĐT "${username}" đã tồn tại trong hệ thống.` }, { status: 409 });
      }
      const id = newId('usr');
      // Bot-created students get an unusable random password hash (never plaintext, never '123')
      const randomSecret = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const pwHash = await hashPassword(randomSecret + '_zalo_bot_unusable');
      const metadata = JSON.stringify({
        source: 'zalo_bot',
        school: payload.school || '',
        target: payload.target || '',
        parent_name: payload.parent_name || '',
        parent_phone: payload.parent_phone || '',
        parent_zalo_id: payload.parent_zalo_id || payload.zalo_user_id || '',
        class_id: payload.class_id || 'ZALO_BOT_CLASS'
      });
      await db
        .prepare(
          `INSERT INTO users (id, username, phone, email, name, role, status, metadata, grade, password, approval_status)
           VALUES (?, ?, ?, ?, ?, 'student', 'active', ?, ?, ?, 'approved')`
        )
        .bind(id, username, payload.phone || null, payload.email || null, payload.name, metadata, payload.grade, pwHash)
        .run();
      const created = await db
        .prepare('SELECT id, username, phone, email, name, role, status, grade, created_at FROM users WHERE id = ?')
        .bind(id)
        .first();
      return json({
        success: true,
        message: `🤖 [Bot Zalo] Đã thêm học sinh "${payload.name}" vào hệ thống thành công!`,
        student: created
      });
    }

    // 2. Remove Student via Zalo Bot — real DELETE from D1 users
    if (action === 'remove_student') {
      if (!db) return dbUnavailable();
      if (!payload.student_id) {
        return json({ success: false, error: 'ValidationError: student_id là bắt buộc.' }, { status: 400 });
      }
      const existing = await db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'student' LIMIT 1").bind(payload.student_id).first();
      if (!existing) {
        return json({ success: false, error: `Không tìm thấy học sinh có ID ${payload.student_id} trong hệ thống.` }, { status: 404 });
      }
      await db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").bind(payload.student_id).run();
      return json({
        success: true,
        message: `🤖 [Bot Zalo] Đã xóa học sinh "${existing.name}" (${payload.student_id}) khỏi hệ thống.`
      });
    }

    // 3. Evaluate Student — real INSERT into D1 student_evaluations
    if (action === 'evaluate_student') {
      if (!db) return dbUnavailable();
      const scoreFields = ['listening', 'reading', 'writing', 'speaking', 'grammar'];
      if (!payload.student_id || !payload.grade_level || scoreFields.some((field) => !Number.isFinite(Number(payload[field])))) {
        return json({ success: false, error: 'ValidationError: student_id, grade_level và toàn bộ điểm số là bắt buộc.' }, { status: 400 });
      }
      const student = await db.prepare('SELECT id, name FROM users WHERE id = ? LIMIT 1').bind(payload.student_id).first();
      if (!student) {
        return json({ success: false, error: `Không tìm thấy học sinh có ID ${payload.student_id} trong hệ thống.` }, { status: 404 });
      }
      const scores = scoreFields.map((f) => Number(payload[f]));
      const overall = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
      const id = newId('eval');
      await db
        .prepare(
          `INSERT INTO student_evaluations
           (id, student_id, student_name, teacher_id, teacher_name, grade_level,
            listening_score, reading_score, writing_score, speaking_score, grammar_vocab_score, overall_score,
            strengths, weaknesses, teacher_feedback, action_plan, recommended_materials,
            parent_name, parent_phone, parent_zalo_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          payload.student_id,
          payload.student_name || student.name,
          payload.teacher_id || 'usr_teach_zalo',
          payload.teacher_name || 'Giáo viên phụ trách',
          payload.grade_level,
          scores[0],
          scores[1],
          scores[2],
          scores[3],
          scores[4],
          overall,
          payload.strengths || 'Tiếp thu bài nhanh, thái độ học tập tích cực',
          payload.weaknesses || 'Cần chú ý cẩn thận hơn khi làm bài viết',
          payload.feedback || 'Em có nhiều tiến bộ trong quá trình học.',
          payload.action_plan || '1. Làm bài tập bổ trợ 15p hàng ngày.\n2. Luyện nghe nói phản xạ cuối tuần.',
          payload.materials || 'Tài liệu Tiếng Anh K12 chuẩn 2026',
          payload.parent_name || '',
          payload.parent_phone || '',
          payload.parent_zalo_id || ''
        )
        .run();
      const evaluation = await db.prepare('SELECT * FROM student_evaluations WHERE id = ?').bind(id).first();
      const reportCard = formatParentReportCard(evaluation);
      return json({
        success: true,
        message: '🤖 [Bot Zalo] Đã lưu đánh giá học sinh và trích xuất phiếu báo cáo phụ huynh thành công!',
        evaluation,
        zalo_message: reportCard
      });
    }

    // 4. Get Student Parent Report — real SELECT from D1 student_evaluations
    if (action === 'get_report') {
      if (!db) return dbUnavailable();
      if (!payload.student_id) {
        return json({ success: false, error: 'ValidationError: student_id là bắt buộc.' }, { status: 400 });
      }
      const latest = await db
        .prepare('SELECT * FROM student_evaluations WHERE student_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(payload.student_id)
        .first();
      if (!latest) {
        return json({ success: false, message: 'Chưa có dữ liệu đánh giá cho học sinh này' }, { status: 404 });
      }
      const card = formatParentReportCard(latest);
      return json({
        success: true,
        student_name: latest.student_name,
        evaluation: latest,
        zalo_message: card
      });
    }

    return json({
      success: true,
      service: 'Zalo Bot Management Endpoint',
      supported_actions: ['add_student', 'remove_student', 'evaluate_student', 'get_report']
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
