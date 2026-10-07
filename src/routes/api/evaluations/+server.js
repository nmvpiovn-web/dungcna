import { json } from '@sveltejs/kit';
import { getAllEvaluations, getEvaluationsByStudent, saveEvaluation, formatParentReportCard, dispatchBotReport } from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Dữ liệu đánh giá chỉ dành cho staff.' }, { status: 403 });
  const studentId = url.searchParams.get('student_id');

  if (platform?.env?.DB) {
    try {
      let query = 'SELECT * FROM student_evaluations ORDER BY created_at DESC';
      let params = [];
      if (studentId) {
        query = 'SELECT * FROM student_evaluations WHERE student_id = ? ORDER BY created_at DESC';
        params = [studentId];
      }
      const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
      const evaluations = d1Res?.results || [];
      return json({ success: true, total: evaluations.length, evaluations, source: 'cloudflare_d1' });
    } catch (e) {
      console.error('D1 evaluations query error:', e);
      return json({ success: false, error: 'DatabaseError: Không thể đọc đánh giá.' }, { status: 503 });
    }
  }
  const localMock = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || (typeof process !== 'undefined' && process.env?.ENABLE_LOCAL_MOCK === 'true');
  if (!localMock) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
  const list = studentId ? getEvaluationsByStudent(studentId) : getAllEvaluations();
  return json({ success: true, total: list.length, evaluations: list, source: 'local_mock' });
}

export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
    if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: Chỉ staff được tạo đánh giá.' }, { status: 403 });
    const body = await request.json();
    if (!body.student_id || !body.student_name || !body.grade_level) {
      return json({ success: false, error: 'Thiếu student_id, student_name hoặc grade_level.' }, { status: 400 });
    }
    const localMock = platform?.env?.ENABLE_LOCAL_MOCK === 'true' || (typeof process !== 'undefined' && process.env?.ENABLE_LOCAL_MOCK === 'true');
    if (!platform?.env?.DB && !localMock) return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });
    // Prod D1 drift: ensure all INSERT columns exist. PRAGMA once, ALTER only missing.
    if (platform?.env?.DB) {
      const cols = [['teacher_id', 'TEXT'], ['teacher_name', 'TEXT'], ['grade_level', 'TEXT'],
        ['listening_score', 'REAL DEFAULT 0'], ['reading_score', 'REAL DEFAULT 0'], ['writing_score', 'REAL DEFAULT 0'],
        ['speaking_score', 'REAL DEFAULT 0'], ['grammar_vocab_score', 'REAL DEFAULT 0'], ['overall_score', 'REAL DEFAULT 0'],
        ['primary_aptitude', 'TEXT'], ['secondary_aptitude', 'TEXT'], ['strengths', 'TEXT'], ['weaknesses', 'TEXT'],
        ['teacher_feedback', 'TEXT'], ['action_plan', 'TEXT'], ['recommended_materials', 'TEXT'],
        ['parent_name', 'TEXT'], ['parent_phone', 'TEXT'], ['parent_zalo_id', 'TEXT']];
      let existing = new Set();
      try {
        const info = await platform.env.DB.prepare('PRAGMA table_info(student_evaluations)').all();
        existing = new Set((info?.results || []).map((r) => r.name));
      } catch { /* fall through */ }
      for (const [name, def] of cols) {
        if (existing.has(name)) continue;
        try { await platform.env.DB.prepare(`ALTER TABLE student_evaluations ADD COLUMN ${name} ${def}`).run(); }
        catch (e) { if (!/duplicate column name/i.test((e?.message || '') + ' ' + (e?.cause?.message || ''))) throw e; }
      }
    }
    const payloadToSave = {
      ...body,
      id: body.id,
      teacher_id: auth.user.id,
      teacher_name: auth.user.name || auth.user.username,
      teacher_feedback: body.teacher_feedback !== undefined ? body.teacher_feedback : (body.teacher_direct_feedback || ''),
      action_plan: body.action_plan !== undefined ? body.action_plan : ''
    };
    const saved = saveEvaluation(payloadToSave, auth.user);
    if (body.teacher_feedback !== undefined) saved.teacher_feedback = body.teacher_feedback;
    if (body.action_plan !== undefined) saved.action_plan = body.action_plan;
    const parentReport = formatParentReportCard(saved);

    if (platform?.env?.DB) {
      try {
        await platform.env.DB.prepare(`
          INSERT INTO student_evaluations (
            id, student_id, student_name, teacher_id, teacher_name, grade_level,
            listening_score, reading_score, writing_score, speaking_score, grammar_vocab_score,
            overall_score, primary_aptitude, secondary_aptitude, strengths, weaknesses,
            teacher_feedback, action_plan, recommended_materials, parent_name, parent_phone, parent_zalo_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            student_name = excluded.student_name,
            grade_level = excluded.grade_level,
            listening_score = excluded.listening_score,
            reading_score = excluded.reading_score,
            writing_score = excluded.writing_score,
            speaking_score = excluded.speaking_score,
            grammar_vocab_score = excluded.grammar_vocab_score,
            overall_score = excluded.overall_score,
            primary_aptitude = excluded.primary_aptitude,
            secondary_aptitude = excluded.secondary_aptitude,
            strengths = excluded.strengths,
            weaknesses = excluded.weaknesses,
            teacher_feedback = excluded.teacher_feedback,
            action_plan = excluded.action_plan,
            recommended_materials = excluded.recommended_materials,
            parent_name = excluded.parent_name,
            parent_phone = excluded.parent_phone,
            parent_zalo_id = excluded.parent_zalo_id,
            updated_at = CURRENT_TIMESTAMP;
        `).bind(
          saved.id || body.id,
          saved.student_id || body.student_id,
          saved.student_name || body.student_name,
          auth.user.id,
          auth.user.name || auth.user.username || '',
          saved.grade_level || body.grade_level || '',
          Number(saved.listening_score ?? body.listening_score ?? 0),
          Number(saved.reading_score ?? body.reading_score ?? 0),
          Number(saved.writing_score ?? body.writing_score ?? 0),
          Number(saved.speaking_score ?? body.speaking_score ?? 0),
          Number(saved.grammar_vocab_score ?? body.grammar_vocab_score ?? 0),
          Number(saved.overall_score ?? body.overall_score ?? 0),
          saved.primary_aptitude || body.primary_aptitude || 'General English',
          saved.secondary_aptitude || body.secondary_aptitude || '',
          saved.strengths || body.strengths || '',
          saved.weaknesses || body.weaknesses || '',
          saved.teacher_feedback || body.teacher_feedback || '',
          saved.action_plan || body.action_plan || '',
          saved.recommended_materials || body.recommended_materials || '',
          saved.parent_name || body.parent_name || '',
          saved.parent_phone || body.parent_phone || '',
          saved.parent_zalo_id || body.parent_zalo_id || ''
        ).run();
      } catch (d1Err) {
        console.error('D1 evaluation insert error:', d1Err);
        return json({ success: false, error: 'DatabaseError: Không thể lưu đánh giá.' }, { status: 503 });
      }
    }

    // Trigger webhook notification if parent report is generated
    dispatchBotReport('STUDENT_EVALUATION_CREATED', {
      student_id: saved.student_id,
      student_name: saved.student_name,
      teacher_name: saved.teacher_name,
      aptitude: saved.primary_aptitude,
      report_card: parentReport,
      parent_phone: saved.parent_phone,
      parent_zalo_id: saved.parent_zalo_id
    });

    return json({
      success: true,
      message: 'Lưu đánh giá học sinh thành công và đã chuẩn bị phiếu báo cáo phụ huynh!',
      evaluation: saved,
      report_card: parentReport
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
