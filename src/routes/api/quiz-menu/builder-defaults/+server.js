import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../lib/server/auth.js';

export const prerender = false;

const ALLOWED_SOURCES = new Set(['upload', 'drive', 'question_bank', 'knowledge_vault']);
const ALLOWED_STATUSES = new Set(['draft', 'published']);
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao']);

const INITIAL_DEFAULTS = {
  source_type: 'upload',
  question_count: 10,
  time_limit_minutes: 15,
  grade_level: 7,
  difficulty: 'medium',
  type_mix: { multiple_choice: 10 },
  default_status: 'draft'
};

function parseJson(str, fallback) {
  if (typeof str !== 'string') return str || fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  const row = await db.prepare(`
    SELECT user_id, source_type, question_count, time_limit_minutes, grade_level, difficulty, type_mix_json, default_status, updated_at
    FROM quiz_builder_defaults
    WHERE user_id = ?
    LIMIT 1
  `).bind(auth.user.id).first();

  if (!row) {
    return json({ success: true, defaults: INITIAL_DEFAULTS, is_default: true });
  }

  return json({
    success: true,
    defaults: {
      source_type: row.source_type,
      question_count: Number(row.question_count || 10),
      time_limit_minutes: Number(row.time_limit_minutes || 15),
      grade_level: Number(row.grade_level || 7),
      difficulty: row.difficulty,
      type_mix: parseJson(row.type_mix_json, INITIAL_DEFAULTS.type_mix),
      default_status: row.default_status,
      updated_at: row.updated_at
    }
  });
}

export async function PUT({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'DatabaseUnavailable' }, { status: 500 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON' }, { status: 400 });
  }

  // Security check: Never store file bytes, binary arrays, or large data
  const payloadStr = JSON.stringify(body);
  if (payloadStr.includes('base64') || payloadStr.length > 10000) {
    return json({ success: false, error: 'PayloadTooLargeOrContainsFileBytes' }, { status: 400 });
  }

  const sourceType = String(body.source_type || 'upload');
  if (!ALLOWED_SOURCES.has(sourceType)) {
    return json({ success: false, error: 'InvalidSourceType', message: 'Nguồn không thuộc danh sách cho phép' }, { status: 400 });
  }

  const questionCount = Number(body.question_count ?? 10);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 200) {
    return json({ success: false, error: 'InvalidQuestionCount', message: 'Số câu hỏi phải từ 1 đến 200' }, { status: 400 });
  }

  const timeLimit = Number(body.time_limit_minutes ?? 15);
  if (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 180) {
    return json({ success: false, error: 'InvalidTimeLimit', message: 'Thời gian làm bài phải từ 1 đến 180 phút' }, { status: 400 });
  }

  const gradeLevel = Number(body.grade_level ?? 7);
  if (!Number.isInteger(gradeLevel) || gradeLevel < 0 || gradeLevel > 12) {
    return json({ success: false, error: 'InvalidGradeLevel', message: 'Khối lớp phải từ 0 đến 12' }, { status: 400 });
  }

  const difficulty = String(body.difficulty || 'medium');
  if (!ALLOWED_DIFFICULTIES.has(difficulty)) {
    return json({ success: false, error: 'InvalidDifficulty' }, { status: 400 });
  }

  const defaultStatus = String(body.default_status || 'draft');
  if (!ALLOWED_STATUSES.has(defaultStatus)) {
    return json({ success: false, error: 'InvalidDefaultStatus' }, { status: 400 });
  }

  let typeMixJson = '{}';
  if (body.type_mix && typeof body.type_mix === 'object') {
    typeMixJson = JSON.stringify(body.type_mix);
  }

  await db.prepare(`
    INSERT INTO quiz_builder_defaults (
      user_id, source_type, question_count, time_limit_minutes, grade_level, difficulty, type_mix_json, default_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_id) DO UPDATE SET
      source_type = excluded.source_type,
      question_count = excluded.question_count,
      time_limit_minutes = excluded.time_limit_minutes,
      grade_level = excluded.grade_level,
      difficulty = excluded.difficulty,
      type_mix_json = excluded.type_mix_json,
      default_status = excluded.default_status,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(auth.user.id, sourceType, questionCount, timeLimit, gradeLevel, difficulty, typeMixJson, defaultStatus).run();

  return json({
    success: true,
    defaults: {
      source_type: sourceType,
      question_count: questionCount,
      time_limit_minutes: timeLimit,
      grade_level: gradeLevel,
      difficulty,
      type_mix: parseJson(typeMixJson, {}),
      default_status: defaultStatus
    }
  });
}
