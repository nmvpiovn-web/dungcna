// src/routes/api/session-audit/+server.js
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../lib/server/auth.js';
import { listQuizDriveFiles } from '../../../lib/server/quizDrive.js';

export const prerender = false;

const DEFAULT_ZALO_BOT_TOKEN = '2267052943606876676:BohTEeIARkSRcUEqfZLDnvxEjSwPVyNSujkIEWeAYRXoCCljFJwYXhhkDbGIUVwd';

function isZaloBotPlatformToken(token) {
  return /^\d{15,22}:[A-Za-z0-9_-]{30,}$/.test(String(token || '').trim());
}

async function inspectZaloBotPlatform(botToken) {
  const clean = String(botToken || '').trim();
  if (!clean) return { ok: false, error: 'Missing token' };
  const baseUrl = `https://bot-api.zaloplatforms.com/bot${clean}`;
  try {
    const [meRes, whRes] = await Promise.all([
      fetch(`${baseUrl}/getMe`),
      fetch(`${baseUrl}/getWebhookInfo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).catch(() => null)
    ]);
    const meData = await meRes.json().catch(() => ({}));
    const whData = whRes ? await whRes.json().catch(() => ({})) : {};
    if (meRes.ok && meData?.ok && meData?.result) {
      return {
        ok: true,
        status: meRes.status,
        bot: meData.result,
        webhook: whData?.result || null
      };
    }
    return {
      ok: false,
      status: meRes.status,
      error: meData?.description || 'Không xác thực được Zalo Bot Token'
    };
  } catch (err) {
    return { ok: false, status: 500, error: err.message };
  }
}

async function ensureSessionAuditSchema(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS session_quality_audits (
      session_id TEXT PRIMARY KEY,
      class_id TEXT,
      vault_article_id TEXT,
      vault_article_title TEXT,
      drive_file_id TEXT,
      drive_file_name TEXT,
      drive_file_url TEXT,
      lesson_plan_content TEXT,
      manual_suitability_pct REAL,
      effectiveness_rating TEXT DEFAULT 'good',
      effectiveness_notes TEXT,
      parent_interaction_notes TEXT,
      internal_interaction_notes TEXT,
      roadmap_recommendation TEXT,
      audit_status TEXT DEFAULT 'reviewed',
      updated_by TEXT,
      updated_by_name TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS bot_webhook_configs (
      id TEXT PRIMARY KEY,
      provider TEXT DEFAULT 'zalo_bot_platform',
      name TEXT,
      webhook_url TEXT,
      bot_token TEXT,
      chat_id TEXT,
      is_active INTEGER DEFAULT 1,
      last_status INTEGER,
      last_dispatched_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS zalo_bot_subscribers (
      chat_id TEXT PRIMARY KEY,
      display_name TEXT,
      role_hint TEXT DEFAULT 'parent_or_teacher',
      last_message TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  // Ensure primary Zalo Bot Platform config is seeded and active
  await db.prepare(`
    INSERT INTO bot_webhook_configs (id, provider, name, webhook_url, bot_token, chat_id, is_active, last_status, updated_at)
    VALUES ('bot_primary', 'zalo_bot_platform', 'Zalo Bot Platform (Bot giá cả • bot.ynKabJAc)', 'https://bot-api.zaloplatforms.com', ?, '', 1, 200, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      provider = CASE WHEN bot_webhook_configs.bot_token IS NULL OR bot_webhook_configs.bot_token = '' THEN 'zalo_bot_platform' ELSE bot_webhook_configs.provider END,
      bot_token = CASE WHEN bot_webhook_configs.bot_token IS NULL OR bot_webhook_configs.bot_token = '' THEN excluded.bot_token ELSE bot_webhook_configs.bot_token END;
  `).bind(DEFAULT_ZALO_BOT_TOKEN).run().catch(() => {});
}

function safeJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function deriveAutoRoadmap({ overallPct, hwFulfillmentPct, quizMasteryPct, rollCallStatus, lateCount, absentCount, hasMaterial }) {
  const steps = [];
  if (!hasMaterial) {
    steps.push('📎 Gắn ngay bài học chuẩn từ Kho Tri Thức (Obsidian Vault) hoặc đề cương Google Drive vào ca học để đồng bộ giáo án.');
  }
  if (rollCallStatus === 'unmarked') {
    steps.push('📋 Giáo viên cần hoàn tất Điểm danh & Sổ đầu bài ngay trong 15 phút đầu ca học.');
  } else if (rollCallStatus === 'incomplete') {
    steps.push('⚠️ Sổ điểm danh chưa khớp đủ sĩ số lớp — cần rà soát các học sinh chưa được tích trạng thái.');
  }
  if (lateCount > 0 || absentCount > 0) {
    steps.push(`⏰ Có ${lateCount} HS đi muộn và ${absentCount} HS vắng mặt: Kích hoạt nhắc lịch phụ huynh trước 15 phút và gửi phiếu bài tập bù từ Kho Tri Thức.`);
  }
  if (hwFulfillmentPct !== null && hwFulfillmentPct < 75) {
    steps.push(`📚 Tỷ lệ đáp ứng BTVN đang ở mức ${hwFulfillmentPct}% (< 75%): Giảm 20% độ khó tự luận, chuyển sang giao kèm Đề Quiz tương tác 10 câu để tăng tỷ lệ hoàn thành.`);
  }
  if (quizMasteryPct !== null && quizMasteryPct < 70) {
    steps.push(`🧩 Điểm làm đề Quiz đạt ${quizMasteryPct}%: Cần dành 15 phút đầu buổi tiếp theo chữa các câu sai trọng tâm và ôn lại chuyên đề ngữ pháp trong Kho Tri Thức.`);
  }
  if (steps.length === 0) {
    if (overallPct >= 85) {
      steps.push('🌟 Ca dạy đạt chuẩn Xuất sắc (≥ 85%): Duy trì giáo án hiện tại, có thể nâng cấp thêm 20% câu hỏi vận dụng cao (HSG / IELTS / Cambridge) từ Ngân hàng câu hỏi D1.');
    } else {
      steps.push('✅ Duy trì theo dõi định kỳ tỷ lệ hoàn thành BTVN & Quiz sau mỗi buổi học.');
    }
  }
  return steps.join('\n');
}

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ giáo viên và ban điều hành mới có quyền truy cập bộ đối soát ca dạy' }, { status: 403 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Cần kết nối Cloudflare D1' }, { status: 503 });
  }

  try {
    await ensureSessionAuditSchema(db);

    const filterSessionId = url.searchParams.get('session_id')?.trim() || '';
    const filterClassId = url.searchParams.get('class_id')?.trim() || '';
    const filterTeacherId = url.searchParams.get('teacher_id')?.trim() || '';
    const includeCatalog = url.searchParams.get('include_catalog') !== '0';
    const isMgr = isManager(auth.user);

    // 1. Load class_sessions
    let sessSql = `SELECT * FROM class_sessions WHERE (status IS NULL OR status != 'inactive')`;
    const sessParams = [];
    if (filterSessionId) {
      sessSql += ` AND id = ?`;
      sessParams.push(filterSessionId);
    }
    if (filterClassId && filterClassId !== 'all') {
      sessSql += ` AND class_id = ?`;
      sessParams.push(filterClassId);
    }
    if (!isMgr) {
      sessSql += ` AND (teacher_id = ? OR assistant_teacher_id = ? OR substitute_teacher_id = ?)`;
      sessParams.push(auth.user.id, auth.user.id, auth.user.id);
    } else if (filterTeacherId && filterTeacherId !== 'all') {
      sessSql += ` AND (teacher_id = ? OR assistant_teacher_id = ? OR substitute_teacher_id = ?)`;
      sessParams.push(filterTeacherId, filterTeacherId, filterTeacherId);
    }
    sessSql += ` ORDER BY session_date DESC, day_of_week ASC, start_time ASC LIMIT 200`;

    const sessionsRes = await db.prepare(sessSql).bind(...sessParams).all();
    const rawSessions = sessionsRes?.results || [];

    // 2. Load enrollments, attendance, homeworks, submissions, quizzes, quiz_attempts, audits, vault, notifications
    const [
      enrollmentsRes,
      attendanceRes,
      hwAssignRes,
      hwSubRes,
      quizzesRes,
      quizAttemptsRes,
      auditsRes,
      vaultRes,
      notifsRes,
      botConfigsRes
    ] = await Promise.all([
      db.prepare(`SELECT class_id, user_id, status FROM class_enrollments WHERE status = 'active'`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT * FROM attendance_records ORDER BY session_date DESC, created_at DESC LIMIT 2000`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT * FROM homework_assignments WHERE status IN ('published', 'active') ORDER BY created_at DESC LIMIT 500`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT * FROM homework_submissions ORDER BY submitted_at DESC LIMIT 2000`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT id, title, description, time_limit_minutes, status, creator_name, updated_at FROM quizzes WHERE status = 'published' ORDER BY updated_at DESC LIMIT 200`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT * FROM quiz_attempts WHERE status IN ('submitted', 'graded', 'review_pending') ORDER BY submitted_at DESC LIMIT 2000`).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT * FROM session_quality_audits`).all().catch(() => ({ results: [] })),
      db.prepare(`
        SELECT id, title, category, folder, tags, SUBSTR(content_markdown, 1, 600) AS preview
        FROM knowledge_vault
        WHERE (status IN ('active', 'published') OR status IS NULL)
          AND (category IS NULL OR category != 'drive_folder')
          AND title NOT LIKE '📁%'
        ORDER BY id ASC LIMIT 120
      `).all().catch(() => ({ results: [] })),
      db.prepare(`SELECT id, target_role, target_user_id, title, body, category, reference_id, created_at FROM system_notifications ORDER BY created_at DESC LIMIT 200`).all().catch(() => ({ results: [] })),
      db.prepare(`
        SELECT id, provider, name, webhook_url, chat_id, is_active, last_status, last_dispatched_at, updated_at,
               CASE WHEN bot_token IS NOT NULL AND bot_token != '' THEN 1 ELSE 0 END AS has_token,
               CASE WHEN bot_token IS NOT NULL AND LENGTH(bot_token) > 16 THEN SUBSTR(bot_token, 1, 19) || ':***' ELSE '' END AS masked_token
        FROM bot_webhook_configs
        ORDER BY updated_at DESC
      `).all().catch(() => ({ results: [] }))
    ]);

    let driveFiles = [];
    if (includeCatalog) {
      try {
        driveFiles = await listQuizDriveFiles(platform);
      } catch {
        driveFiles = [];
      }
    }

    const enrollments = enrollmentsRes?.results || [];
    const attendanceList = attendanceRes?.results || [];
    const hwAssignments = hwAssignRes?.results || [];
    const hwSubmissions = hwSubRes?.results || [];
    const quizzes = quizzesRes?.results || [];
    const quizAttempts = quizAttemptsRes?.results || [];
    const audits = auditsRes?.results || [];
    const vaultArticles = vaultRes?.results || [];
    const notifications = notifsRes?.results || [];
    const botConfigs = botConfigsRes?.results || [];

    const auditBySessionId = new Map(audits.map(a => [a.session_id, a]));
    const vaultById = new Map(vaultArticles.map(v => [v.id, v]));
    const quizById = new Map(quizzes.map(q => [q.id, q]));

    // Group enrollments by class_id
    const enrolledByClass = new Map();
    for (const e of enrollments) {
      if (!enrolledByClass.has(e.class_id)) enrolledByClass.set(e.class_id, new Set());
      enrolledByClass.get(e.class_id).add(e.user_id);
    }

    // Group submissions by assignment_id
    const subsByAssignment = new Map();
    for (const sub of hwSubmissions) {
      if (!subsByAssignment.has(sub.assignment_id)) subsByAssignment.set(sub.assignment_id, []);
      subsByAssignment.get(sub.assignment_id).push(sub);
    }

    // Group quiz attempts by quiz_id
    const attemptsByQuiz = new Map();
    for (const att of quizAttempts) {
      if (!attemptsByQuiz.has(att.quiz_id)) attemptsByQuiz.set(att.quiz_id, []);
      const maxS = Number(att.max_score ?? att.total_points ?? 0);
      const earnedS = Number(att.final_score ?? att.auto_score ?? att.score ?? 0);
      const computedPct = att.percentage !== undefined && att.percentage !== null && Number.isFinite(Number(att.percentage))
        ? Number(att.percentage)
        : (maxS > 0 ? Math.round((earnedS / maxS) * 100) : 0);
      attemptsByQuiz.get(att.quiz_id).push({ ...att, computed_pct: computedPct });
    }

    const sessionReports = rawSessions.map(sess => {
      const sessionStudentIds = safeJsonArray(sess.student_ids);
      const classEnrolledSet = new Set([
        ...sessionStudentIds,
        ...(enrolledByClass.get(sess.class_id) || [])
      ]);
      const enrolledCount = classEnrolledSet.size;

      // Attendance for this session
      const sessAtt = attendanceList.filter(r => r.session_id === sess.id);
      // Use latest date if multiple dates exist, or session_date
      const targetAttDate = sess.session_date || (sessAtt[0]?.session_date ?? '');
      const dateScopedAtt = targetAttDate
        ? sessAtt.filter(r => r.session_date === targetAttDate)
        : sessAtt;
      const activeAtt = dateScopedAtt.length > 0 ? dateScopedAtt : sessAtt;

      // Deduplicate by student_id for latest status
      const attByStudent = new Map();
      for (const rec of activeAtt) {
        if (!attByStudent.has(rec.student_id)) {
          attByStudent.set(rec.student_id, rec);
        }
      }
      const uniqueAtt = Array.from(attByStudent.values());
      const markedCount = uniqueAtt.length;
      const presentCount = uniqueAtt.filter(r => r.status === 'present').length;
      const lateCount = uniqueAtt.filter(r => r.status === 'late').length;
      const absentExcusedCount = uniqueAtt.filter(r => r.status === 'absent_excused').length;
      const absentUnexcusedCount = uniqueAtt.filter(r => r.status === 'absent_unexcused').length;
      const totalAbsentCount = absentExcusedCount + absentUnexcusedCount;

      let rollCallStatus = 'unmarked';
      if (markedCount > 0) {
        if (enrolledCount > 0 && markedCount < enrolledCount) {
          rollCallStatus = 'incomplete';
        } else {
          rollCallStatus = 'complete';
        }
      }

      const attendancePunctualityPct = markedCount > 0
        ? Math.round(((presentCount * 100 + lateCount * 70 + absentExcusedCount * 30) / (markedCount * 100)) * 100)
        : null;

      // Homeworks linked to this session (or fallback to class_id)
      const directHws = hwAssignments.filter(h => h.session_id === sess.id);
      const classHws = directHws.length > 0
        ? directHws
        : hwAssignments.filter(h => h.class_id && h.class_id === sess.class_id);

      let totalExpectedHwSubmissions = 0;
      let totalActualHwSubmissions = 0;
      let totalHwScorePctAcc = 0;
      let totalGradedHwCount = 0;
      const linkedQuizIds = new Set();

      const linkedHomeworks = classHws.map(hw => {
        if (hw.source_quiz_id) linkedQuizIds.add(hw.source_quiz_id);
        const subs = subsByAssignment.get(hw.id) || [];
        const uniqueStudentSubs = new Map();
        for (const s of subs) {
          if (!uniqueStudentSubs.has(s.student_id)) uniqueStudentSubs.set(s.student_id, s);
        }
        const subList = Array.from(uniqueStudentSubs.values());
        const maxScore = Number(hw.max_score) > 0 ? Number(hw.max_score) : 10;
        const gradedSubs = subList.filter(s => s.score !== null && s.score !== undefined && Number.isFinite(Number(s.score)));
        const avgScore = gradedSubs.length > 0
          ? Number((gradedSubs.reduce((a, b) => a + Number(b.score), 0) / gradedSubs.length).toFixed(1))
          : null;

        const denom = Math.max(enrolledCount, subList.length, 1);
        totalExpectedHwSubmissions += denom;
        totalActualHwSubmissions += Math.min(subList.length, denom);

        for (const gs of gradedSubs) {
          totalHwScorePctAcc += Math.min(100, Math.max(0, (Number(gs.score) / maxScore) * 100));
          totalGradedHwCount++;
        }

        return {
          id: hw.id,
          title: hw.title,
          skill_type: hw.skill_type || 'general',
          session_id: hw.session_id,
          source_quiz_id: hw.source_quiz_id || null,
          obsidian_note_id: hw.obsidian_note_id || null,
          obsidian_note_title: hw.obsidian_note_title || null,
          due_date: hw.due_date || hw.deadline_date || '',
          submissions_count: subList.length,
          expected_count: denom,
          submission_rate_pct: Math.round((Math.min(subList.length, denom) / denom) * 100),
          avg_score: avgScore,
          max_score: maxScore
        };
      });

      const hwSubmissionRatePct = totalExpectedHwSubmissions > 0
        ? Math.round((totalActualHwSubmissions / totalExpectedHwSubmissions) * 100)
        : null;
      const hwQualityScorePct = totalGradedHwCount > 0
        ? Math.round(totalHwScorePctAcc / totalGradedHwCount)
        : null;

      let homeworkFulfillmentPct = null;
      if (hwSubmissionRatePct !== null && hwQualityScorePct !== null) {
        homeworkFulfillmentPct = Math.round(hwSubmissionRatePct * 0.5 + hwQualityScorePct * 0.5);
      } else if (hwSubmissionRatePct !== null) {
        homeworkFulfillmentPct = hwSubmissionRatePct;
      } else if (hwQualityScorePct !== null) {
        homeworkFulfillmentPct = hwQualityScorePct;
      }

      // Quizzes linked via homework or matching grade
      const linkedQuizzes = Array.from(linkedQuizIds).map(qid => {
        const q = quizById.get(qid);
        const atts = attemptsByQuiz.get(qid) || [];
        const avgPct = atts.length > 0
          ? Math.round(atts.reduce((acc, a) => acc + (Number(a.computed_pct) || 0), 0) / atts.length)
          : null;
        return {
          id: qid,
          title: q?.title || `Đề Quiz (${qid})`,
          time_limit_minutes: q?.time_limit_minutes || 15,
          attempts_count: atts.length,
          avg_pct: avgPct
        };
      });

      let quizMasteryPct = null;
      const quizzesWithAttempts = linkedQuizzes.filter(q => q.avg_pct !== null);
      if (quizzesWithAttempts.length > 0) {
        quizMasteryPct = Math.round(
          quizzesWithAttempts.reduce((acc, q) => acc + q.avg_pct, 0) / quizzesWithAttempts.length
        );
      }

      // Stored audit record & material resolution
      const audit = auditBySessionId.get(sess.id) || null;
      const hwWithNote = classHws.find(h => h.obsidian_note_id || h.obsidian_note_title);

      // Auto-match a vault article if none explicitly saved
      let resolvedVaultId = audit?.vault_article_id || hwWithNote?.obsidian_note_id || '';
      let resolvedVaultTitle = audit?.vault_article_title || hwWithNote?.obsidian_note_title || '';
      let resolvedVaultPreview = '';

      if (resolvedVaultId && vaultById.has(resolvedVaultId)) {
        const v = vaultById.get(resolvedVaultId);
        resolvedVaultTitle = resolvedVaultTitle || v.title;
        resolvedVaultPreview = v.preview || '';
      } else if (!resolvedVaultId && vaultArticles.length > 0) {
        const topicLower = String(sess.subject_topic || sess.topic || '').toLowerCase();
        const gradeLower = String(sess.grade_level || '').toLowerCase();
        const matched = vaultArticles.find(v =>
          (topicLower && String(v.title || '').toLowerCase().includes(topicLower.slice(0, 12))) ||
          (gradeLower && String(v.category || '').toLowerCase().includes(gradeLower))
        );
        if (matched) {
          resolvedVaultId = matched.id;
          resolvedVaultTitle = matched.title;
          resolvedVaultPreview = matched.preview || '';
        }
      }

      const resolvedDriveId = audit?.drive_file_id || '';
      const resolvedDriveName = audit?.drive_file_name || '';
      const resolvedDriveUrl = audit?.drive_file_url || '';
      const hasMaterial = Boolean(resolvedVaultId || resolvedVaultTitle || resolvedDriveId || resolvedDriveName);

      const manualSuitabilityPct = (audit?.manual_suitability_pct !== null && audit?.manual_suitability_pct !== undefined && Number.isFinite(Number(audit.manual_suitability_pct)))
        ? Math.min(100, Math.max(0, Math.round(Number(audit.manual_suitability_pct))))
        : null;

      // Compute Overall Suitability % combining Objective (Homework, Quiz, Attendance) + Manual Evaluation
      const componentWeights = [];
      if (homeworkFulfillmentPct !== null) componentWeights.push({ val: homeworkFulfillmentPct, weight: 0.35 });
      if (quizMasteryPct !== null) componentWeights.push({ val: quizMasteryPct, weight: 0.30 });
      if (attendancePunctualityPct !== null) componentWeights.push({ val: attendancePunctualityPct, weight: 0.15 });
      if (manualSuitabilityPct !== null) componentWeights.push({ val: manualSuitabilityPct, weight: 0.20 });

      let overallSuitabilityPct = 80; // baseline when session is newly scheduled
      if (componentWeights.length > 0) {
        const totalW = componentWeights.reduce((a, b) => a + b.weight, 0);
        overallSuitabilityPct = Math.round(
          componentWeights.reduce((a, b) => a + b.val * b.weight, 0) / totalW
        );
      }

      const qualityTier = overallSuitabilityPct >= 85
        ? 'excellent'
        : overallSuitabilityPct >= 70
        ? 'good'
        : overallSuitabilityPct >= 50
        ? 'needs_improvement'
        : 'critical';

      // Notifications & Parent / Internal Interactions related to this session or class
      const relatedNotifs = notifications.filter(n =>
        n.reference_id === sess.id ||
        (sess.class_name && String(n.body || '').includes(sess.class_name)) ||
        (sess.id && String(n.body || '').includes(sess.id))
      );

      const lessonPlanContent = audit?.lesson_plan_content ||
        `Chuyên đề: ${sess.subject_topic || sess.topic || 'Ngữ pháp & Giao tiếp trọng tâm'}\n` +
        (resolvedVaultTitle ? `Tài liệu Kho Tri Thức: ${resolvedVaultTitle}\n` : '') +
        (resolvedDriveName ? `Tài liệu Google Drive: ${resolvedDriveName}\n` : '') +
        (resolvedVaultPreview ? `Tóm tắt nội dung: ${resolvedVaultPreview.slice(0, 240)}...` : '');

      const autoRoadmap = deriveAutoRoadmap({
        overallPct: overallSuitabilityPct,
        hwFulfillmentPct: homeworkFulfillmentPct,
        quizMasteryPct,
        rollCallStatus,
        lateCount,
        absentCount: totalAbsentCount,
        hasMaterial
      });

      const roadmapRecommendation = audit?.roadmap_recommendation || autoRoadmap;
      const effectivenessNotes = audit?.effectiveness_notes ||
        `Độ phù hợp tổng hợp đạt ${overallSuitabilityPct}%. ` +
        (homeworkFulfillmentPct !== null ? `BTVN đáp ứng ${homeworkFulfillmentPct}%. ` : 'Chưa có bài nộp BTVN. ') +
        (quizMasteryPct !== null ? `Điểm Quiz đạt ${quizMasteryPct}%.` : 'Chưa có lượt nộp Quiz.');

      const parentInteractionNotes = audit?.parent_interaction_notes ||
        `Đã cấu hình nhắc lịch đưa đón trước ${sess.notify_minutes_before || 10} phút. ` +
        `Ghi nhận ${relatedNotifs.length} thông báo hệ thống liên quan đến lớp "${sess.class_name}". ` +
        (lateCount + totalAbsentCount > 0
          ? `Cần liên hệ phụ huynh của ${lateCount} HS đi muộn và ${totalAbsentCount} HS vắng mặt.`
          : '100% học sinh điểm danh có mặt đúng giờ, phụ huynh phối hợp tốt.');

      const internalInteractionNotes = audit?.internal_interaction_notes ||
        `GV chính: ${sess.teacher_name || 'Chưa phân công'}` +
        (sess.assistant_teacher_name ? ` • Trợ giảng: ${sess.assistant_teacher_name}` : '') +
        (sess.substitute_teacher_name ? ` • GV dạy thay: ${sess.substitute_teacher_name}` : '') +
        `. Phối hợp kiểm soát sổ đầu bài và chấm chữa BTVN trên Cpanel.`;

      return {
        session: {
          id: sess.id,
          class_id: sess.class_id || 'cls_g7',
          class_name: sess.class_name,
          grade_level: sess.grade_level || 'Lớp 7',
          subject_topic: sess.subject_topic || sess.topic || '',
          teacher_id: sess.teacher_id,
          teacher_name: sess.teacher_name,
          assistant_teacher_id: sess.assistant_teacher_id,
          assistant_teacher_name: sess.assistant_teacher_name,
          substitute_teacher_id: sess.substitute_teacher_id,
          substitute_teacher_name: sess.substitute_teacher_name,
          day_of_week: sess.day_of_week,
          day_name: sess.day_name,
          session_date: sess.session_date || '',
          start_time: sess.start_time,
          end_time: sess.end_time,
          location: sess.location || '',
          room_notes: sess.room_notes || sess.room || '',
          notify_minutes_before: sess.notify_minutes_before || 10,
          student_ids: sessionStudentIds
        },
        materials: {
          has_material: hasMaterial,
          vault_article_id: resolvedVaultId,
          vault_article_title: resolvedVaultTitle,
          drive_file_id: resolvedDriveId,
          drive_file_name: resolvedDriveName,
          drive_file_url: resolvedDriveUrl,
          lesson_plan_content: lessonPlanContent,
          linked_homeworks: linkedHomeworks,
          linked_quizzes: linkedQuizzes
        },
        metrics: {
          enrolled_count: enrolledCount,
          marked_count: markedCount,
          present_count: presentCount,
          late_count: lateCount,
          absent_excused_count: absentExcusedCount,
          absent_unexcused_count: absentUnexcusedCount,
          total_absent_count: totalAbsentCount,
          roll_call_status: rollCallStatus, // 'complete' | 'incomplete' | 'unmarked'
          attendance_punctuality_pct: attendancePunctualityPct,
          hw_submission_rate_pct: hwSubmissionRatePct,
          hw_quality_score_pct: hwQualityScorePct,
          homework_fulfillment_pct: homeworkFulfillmentPct,
          quiz_mastery_pct: quizMasteryPct,
          manual_suitability_pct: manualSuitabilityPct,
          overall_suitability_pct: overallSuitabilityPct,
          quality_tier: qualityTier
        },
        dossier: {
          homework_and_quiz_fulfillment: {
            homework_fulfillment_pct: homeworkFulfillmentPct,
            quiz_mastery_pct: quizMasteryPct,
            overall_suitability_pct: overallSuitabilityPct,
            homeworks_count: linkedHomeworks.length,
            quizzes_count: linkedQuizzes.length
          },
          lesson_plan_and_materials: {
            vault_article_id: resolvedVaultId,
            vault_article_title: resolvedVaultTitle,
            drive_file_id: resolvedDriveId,
            drive_file_name: resolvedDriveName,
            drive_file_url: resolvedDriveUrl,
            lesson_plan_content: lessonPlanContent
          },
          effectiveness_evaluation: {
            rating: audit?.effectiveness_rating || qualityTier,
            manual_suitability_pct: manualSuitabilityPct,
            overall_suitability_pct: overallSuitabilityPct,
            notes: effectivenessNotes
          },
          parent_interaction: {
            notifications_sent_count: relatedNotifs.length,
            notify_minutes_before: sess.notify_minutes_before || 10,
            late_students: uniqueAtt.filter(r => r.status === 'late').map(r => r.student_name),
            absent_students: uniqueAtt.filter(r => r.status === 'absent_excused' || r.status === 'absent_unexcused').map(r => r.student_name),
            notes: parentInteractionNotes
          },
          internal_interaction_and_roadmap: {
            lead_teacher: sess.teacher_name,
            assistant_teacher: sess.assistant_teacher_name || '',
            substitute_teacher: sess.substitute_teacher_name || '',
            internal_notes: internalInteractionNotes,
            roadmap_recommendation: roadmapRecommendation,
            audit_status: audit?.audit_status || 'auto_tracked',
            updated_by_name: audit?.updated_by_name || 'Hệ thống đối soát tự động',
            updated_at: audit?.updated_at || null
          }
        },
        attendance_students: uniqueAtt.map(r => ({
          student_id: r.student_id,
          student_name: r.student_name,
          status: r.status,
          in_class_attitude: r.in_class_attitude,
          instant_stars_rewarded: r.instant_stars_rewarded,
          session_date: r.session_date
        }))
      };
    });

    // Global summary KPIs across all returned sessions
    const totalSessions = sessionReports.length;
    const rollCallCompleteCount = sessionReports.filter(r => r.metrics.roll_call_status === 'complete').length;
    const rollCallIncompleteCount = sessionReports.filter(r => r.metrics.roll_call_status === 'incomplete').length;
    const rollCallUnmarkedCount = sessionReports.filter(r => r.metrics.roll_call_status === 'unmarked').length;
    const sessionsWithLateCount = sessionReports.filter(r => r.metrics.late_count > 0).length;
    const sessionsWithAbsentCount = sessionReports.filter(r => r.metrics.total_absent_count > 0).length;
    const sessionsWithMaterialCount = sessionReports.filter(r => r.materials.has_material).length;
    const avgOverallSuitabilityPct = totalSessions > 0
      ? Math.round(sessionReports.reduce((acc, r) => acc + r.metrics.overall_suitability_pct, 0) / totalSessions)
      : 0;

    return json({
      success: true,
      summary: {
        total_sessions: totalSessions,
        roll_call_complete_count: rollCallCompleteCount,
        roll_call_incomplete_count: rollCallIncompleteCount,
        roll_call_unmarked_count: rollCallUnmarkedCount,
        sessions_with_late_count: sessionsWithLateCount,
        sessions_with_absent_count: sessionsWithAbsentCount,
        sessions_with_material_count: sessionsWithMaterialCount,
        avg_overall_suitability_pct: avgOverallSuitabilityPct
      },
      sessions: sessionReports,
      catalogs: includeCatalog ? {
        vault_articles: vaultArticles.map(v => ({
          id: v.id,
          title: v.title,
          category: v.category,
          folder: v.folder
        })),
        drive_files: driveFiles.map(f => ({
          id: f.id,
          name: f.name,
          title_vi: f.title_vi || f.name,
          webViewLink: f.webViewLink || ''
        })),
        quizzes: quizzes.map(q => ({
          id: q.id,
          title: q.title,
          time_limit_minutes: q.time_limit_minutes
        })),
        bot_configs: botConfigs
      } : undefined
    });
  } catch (err) {
    console.error('GET /api/session-audit error:', err);
    return json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable' }, { status: 503 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
  }

  try {
    await ensureSessionAuditSchema(db);
    const action = body.action || 'save_audit';

    if (action === 'save_audit') {
      const sessionId = String(body.session_id || '').trim();
      if (!sessionId) {
        return json({ success: false, error: 'Thiếu session_id cần đối soát' }, { status: 400 });
      }

      const sess = await db.prepare(`SELECT id, class_id, class_name, teacher_id, assistant_teacher_id, substitute_teacher_id FROM class_sessions WHERE id = ? LIMIT 1`).bind(sessionId).first();
      if (!sess) {
        return json({ success: false, error: 'Không tìm thấy ca học trong cơ sở dữ liệu D1' }, { status: 404 });
      }

      if (!isManager(auth.user)) {
        const mine = [sess.teacher_id, sess.assistant_teacher_id, sess.substitute_teacher_id].filter(Boolean).includes(auth.user.id);
        if (!mine) {
          return json({ success: false, error: 'Forbidden: Bạn chỉ được cập nhật hồ sơ đối soát của ca học mình phụ trách' }, { status: 403 });
        }
      }

      const manualPctRaw = body.manual_suitability_pct;
      const manualPct = (manualPctRaw !== null && manualPctRaw !== undefined && String(manualPctRaw).trim() !== '' && Number.isFinite(Number(manualPctRaw)))
        ? Math.min(100, Math.max(0, Number(manualPctRaw)))
        : null;

      const vaultArticleId = String(body.vault_article_id ?? '').trim();
      let vaultArticleTitle = String(body.vault_article_title ?? '').trim();
      if (vaultArticleId && !vaultArticleTitle) {
        const vRow = await db.prepare(`SELECT title FROM knowledge_vault WHERE id = ? LIMIT 1`).bind(vaultArticleId).first().catch(() => null);
        if (vRow?.title) vaultArticleTitle = vRow.title;
      }

      const driveFileId = String(body.drive_file_id ?? '').trim();
      const driveFileName = String(body.drive_file_name ?? '').trim();
      const driveFileUrl = String(body.drive_file_url ?? '').trim();
      const lessonPlanContent = String(body.lesson_plan_content ?? '').trim();
      const effectivenessRating = String(body.effectiveness_rating || 'good').trim();
      const effectivenessNotes = String(body.effectiveness_notes ?? '').trim();
      const parentInteractionNotes = String(body.parent_interaction_notes ?? '').trim();
      const internalInteractionNotes = String(body.internal_interaction_notes ?? '').trim();
      const roadmapRecommendation = String(body.roadmap_recommendation ?? '').trim();
      const auditStatus = String(body.audit_status || 'reviewed').trim();
      const operatorName = auth.user.name || auth.user.username || 'Giáo viên / Quản lý';

      await db.prepare(`
        INSERT INTO session_quality_audits (
          session_id, class_id, vault_article_id, vault_article_title,
          drive_file_id, drive_file_name, drive_file_url, lesson_plan_content,
          manual_suitability_pct, effectiveness_rating, effectiveness_notes,
          parent_interaction_notes, internal_interaction_notes, roadmap_recommendation,
          audit_status, updated_by, updated_by_name, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id) DO UPDATE SET
          class_id = excluded.class_id,
          vault_article_id = excluded.vault_article_id,
          vault_article_title = excluded.vault_article_title,
          drive_file_id = excluded.drive_file_id,
          drive_file_name = excluded.drive_file_name,
          drive_file_url = excluded.drive_file_url,
          lesson_plan_content = excluded.lesson_plan_content,
          manual_suitability_pct = excluded.manual_suitability_pct,
          effectiveness_rating = excluded.effectiveness_rating,
          effectiveness_notes = excluded.effectiveness_notes,
          parent_interaction_notes = excluded.parent_interaction_notes,
          internal_interaction_notes = excluded.internal_interaction_notes,
          roadmap_recommendation = excluded.roadmap_recommendation,
          audit_status = excluded.audit_status,
          updated_by = excluded.updated_by,
          updated_by_name = excluded.updated_by_name,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(
        sessionId,
        sess.class_id || 'cls_g7',
        vaultArticleId,
        vaultArticleTitle,
        driveFileId,
        driveFileName,
        driveFileUrl,
        lessonPlanContent,
        manualPct,
        effectivenessRating,
        effectivenessNotes,
        parentInteractionNotes,
        internalInteractionNotes,
        roadmapRecommendation,
        auditStatus,
        auth.user.id,
        operatorName
      ).run();

      // Optionally notify teacher/parents if requested
      if (body.notify_internal && sess.teacher_id) {
        const notifId = `notif_audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.prepare(`
          INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id, is_read)
          VALUES (?, 'teacher', ?, ?, ?, 'schedule', ?, 0)
        `).bind(
          notifId,
          sess.teacher_id,
          `📊 Đối soát chất lượng ca dạy: ${sess.class_name}`,
          `[${operatorName}] đã cập nhật đánh giá & lộ trình nâng cấp ca học "${sess.class_name}": ${roadmapRecommendation || effectivenessNotes || 'Đã duyệt giáo án & tài liệu.'}`,
          sessionId
        ).run().catch(() => {});
      }

      const savedAudit = await db.prepare(`SELECT * FROM session_quality_audits WHERE session_id = ? LIMIT 1`).bind(sessionId).first();
      return json({
        success: true,
        message: `Đã lưu hồ sơ đối soát & tài liệu cho ca học "${sess.class_name}" vào Cloudflare D1!`,
        audit: savedAudit
      });
    }

    if (action === 'save_bot_config') {
      const id = String(body.id || 'bot_primary').trim();
      let botToken = String(body.bot_token || '').trim();
      let provider = String(body.provider || 'zalo_bot_platform').trim();
      if (isZaloBotPlatformToken(botToken)) {
        provider = 'zalo_bot_platform';
      }
      let name = String(body.name || 'Zalo Bot Platform Gateway').trim();
      let webhookUrl = String(body.webhook_url || 'https://bot-api.zaloplatforms.com').trim();
      const chatId = String(body.chat_id || '').trim();
      const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;

      // Read existing token if user didn't re-type it
      if (!botToken) {
        const existing = await db.prepare(`SELECT bot_token FROM bot_webhook_configs WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
        botToken = existing?.bot_token || DEFAULT_ZALO_BOT_TOKEN;
      }

      let verification = null;
      let statusCode = 200;
      if (isZaloBotPlatformToken(botToken) || provider === 'zalo_bot_platform') {
        verification = await inspectZaloBotPlatform(botToken);
        if (verification.ok && verification.bot) {
          name = `Zalo Bot: ${verification.bot.display_name} (@${verification.bot.account_name})`;
          if (verification.webhook?.url) {
            webhookUrl = verification.webhook.url;
          }
          statusCode = 200;
        } else {
          statusCode = verification.status || 401;
        }
      }

      await db.prepare(`
        INSERT INTO bot_webhook_configs (id, provider, name, webhook_url, bot_token, chat_id, is_active, last_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          provider = excluded.provider,
          name = excluded.name,
          webhook_url = excluded.webhook_url,
          bot_token = CASE WHEN excluded.bot_token != '' THEN excluded.bot_token ELSE bot_webhook_configs.bot_token END,
          chat_id = excluded.chat_id,
          is_active = excluded.is_active,
          last_status = excluded.last_status,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(id, provider, name, webhookUrl, botToken, chatId, isActive, statusCode).run();

      return json({
        success: true,
        verified: verification ? verification.ok : true,
        bot_profile: verification?.bot || null,
        webhook_info: verification?.webhook || null,
        message: verification?.ok
          ? `✅ Đã kết nối & lưu thành công Zalo Bot "${verification.bot.display_name}" (@${verification.bot.account_name} • ID: ${verification.bot.id}) trên Cloudflare D1!`
          : 'Đã lưu cấu hình Bot API Token & Webhook trên Cloudflare D1!'
      });
    }

    if (action === 'verify_bot_config') {
      const id = String(body.id || 'bot_primary').trim();
      const existing = await db.prepare(`SELECT * FROM bot_webhook_configs WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      const tokenToVerify = String(body.bot_token || existing?.bot_token || DEFAULT_ZALO_BOT_TOKEN).trim();
      const inspection = await inspectZaloBotPlatform(tokenToVerify);
      const subsRes = await db.prepare(`SELECT * FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 20`).all().catch(() => ({ results: [] }));

      if (inspection.ok && inspection.bot) {
        await db.prepare(`
          UPDATE bot_webhook_configs
          SET provider = 'zalo_bot_platform',
              name = ?,
              bot_token = ?,
              webhook_url = COALESCE(?, webhook_url),
              last_status = 200,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          `Zalo Bot: ${inspection.bot.display_name} (@${inspection.bot.account_name})`,
          tokenToVerify,
          inspection.webhook?.url || 'https://bot-api.zaloplatforms.com',
          id
        ).run().catch(() => {});
      }

      return json({
        success: inspection.ok,
        verified: inspection.ok,
        bot_profile: inspection.bot || null,
        webhook_info: inspection.webhook || null,
        subscribers: subsRes?.results || [],
        chat_id: existing?.chat_id || '',
        message: inspection.ok
          ? `✅ Token hợp lệ! Kết nối thành công với Zalo Bot "${inspection.bot.display_name}" (@${inspection.bot.account_name}, ID: ${inspection.bot.id}, Loại: ${inspection.bot.account_type}).`
          : `❌ Lỗi xác thực Token: ${inspection.error}`
      });
    }

    if (action === 'dispatch_bot_message') {
      const messageText = String(body.message || '').trim();
      if (!messageText) {
        return json({ success: false, error: 'Thiếu nội dung tin nhắn cần gửi' }, { status: 400 });
      }

      const configsRes = await db.prepare(`SELECT * FROM bot_webhook_configs WHERE is_active = 1`).all().catch(() => ({ results: [] }));
      const configs = configsRes?.results || [];
      const subsRes = await db.prepare(`SELECT chat_id FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 20`).all().catch(() => ({ results: [] }));
      const subscriberIds = (subsRes?.results || []).map(r => r.chat_id).filter(Boolean);

      const dispatchLogs = [];
      for (const cfg of configs) {
        const effectiveToken = cfg.bot_token || DEFAULT_ZALO_BOT_TOKEN;
        if (!cfg.webhook_url && !effectiveToken) continue;

        try {
          if (cfg.provider === 'zalo_bot_platform' || isZaloBotPlatformToken(effectiveToken)) {
            const inspection = await inspectZaloBotPlatform(effectiveToken);
            const targetChatIds = [...new Set([body.chat_id, cfg.chat_id, ...subscriberIds].map(x => String(x || '').trim()).filter(Boolean))];
            let sentCount = 0;
            let lastHttpStatus = inspection.ok ? 200 : 401;

            for (const cid of targetChatIds) {
              const sendRes = await fetch(`https://bot-api.zaloplatforms.com/bot${effectiveToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: cid, text: messageText.slice(0, 1900) })
              });
              const sendJson = await sendRes.json().catch(() => ({}));
              lastHttpStatus = sendRes.status;
              if (sendRes.ok && sendJson?.ok) sentCount++;
            }

            // Also relay event payload to configured Zalo Bot webhook endpoint (e.g., grokbot-box-1.tail2facc5.ts.net/zalo)
            const relayUrl = inspection.webhook?.url || (cfg.webhook_url && !cfg.webhook_url.includes('bot-api.zaloplatforms.com') ? cfg.webhook_url : '');
            let relayOk = false;
            if (relayUrl && relayUrl.startsWith('https://')) {
              try {
                const relayCtrl = new AbortController();
                const relayTimer = setTimeout(() => relayCtrl.abort(), 2500);
                const relayRes = await fetch(relayUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: relayCtrl.signal,
                  body: JSON.stringify({
                    event_name: body.event_type || 'SYSTEM_NOTIFICATION',
                    bot: inspection.bot || { id: '2267052943606876676', account_name: 'bot.ynKabJAc', display_name: 'Bot giá cả' },
                    message: { text: messageText.slice(0, 1900) },
                    timestamp: new Date().toISOString()
                  })
                });
                clearTimeout(relayTimer);
                relayOk = relayRes.ok;
              } catch {}
            }

            await db.prepare(`UPDATE bot_webhook_configs SET last_status = ?, last_dispatched_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(lastHttpStatus, cfg.id).run();
            dispatchLogs.push({
              id: cfg.id,
              name: inspection.bot ? `Zalo Bot: ${inspection.bot.display_name} (@${inspection.bot.account_name})` : cfg.name,
              provider: 'zalo_bot_platform',
              bot_id: inspection.bot?.id || null,
              webhook_url: relayUrl || inspection.webhook?.url || null,
              webhook_relayed: relayOk,
              sent_to_chats: sentCount,
              target_chat_ids: targetChatIds,
              status: lastHttpStatus,
              ok: inspection.ok,
              note: targetChatIds.length > 0
                ? `Đã gửi trực tiếp qua sendMessage tới ${sentCount}/${targetChatIds.length} chat_id.`
                : relayOk
                  ? `Đã xác thực Token (getMe 200 OK) & phát bản tin tới Webhook ${relayUrl}!`
                  : `Đã xác thực Token Zalo Bot (getMe 200 OK • ID: ${inspection.bot?.id || '2267052943606876676'}). Nhập chat_id người nhận hoặc nhắn tin vào @${inspection.bot?.account_name || 'bot.ynKabJAc'} để nhận tin trực tiếp.`
            });
            continue;
          }

          let targetUrl = cfg.webhook_url;
          let payload = {
            event: body.event_type || 'SESSION_AUDIT_REPORT',
            message: messageText,
            chat_id: cfg.chat_id || undefined,
            timestamp: new Date().toISOString()
          };
          const headers = { 'Content-Type': 'application/json' };
          if (cfg.provider === 'telegram_bot' && effectiveToken && cfg.chat_id) {
            targetUrl = `https://api.telegram.org/bot${effectiveToken}/sendMessage`;
            payload = { chat_id: cfg.chat_id, text: messageText };
          } else if (effectiveToken) {
            headers['Authorization'] = `Bearer ${effectiveToken}`;
            headers['access_token'] = effectiveToken;
          }

          if (targetUrl && targetUrl.startsWith('https://')) {
            const resp = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            });
            await db.prepare(`UPDATE bot_webhook_configs SET last_status = ?, last_dispatched_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(resp.status, cfg.id).run();
            dispatchLogs.push({ id: cfg.id, name: cfg.name, status: resp.status, ok: resp.ok });
          }
        } catch (err) {
          dispatchLogs.push({ id: cfg.id, name: cfg.name, error: err.message, ok: false });
        }
      }

      const firstZaloLog = dispatchLogs.find(l => l.provider === 'zalo_bot_platform');
      return json({
        success: true,
        message: firstZaloLog
          ? `✅ Kết nối thành công ${firstZaloLog.name}! ${firstZaloLog.note}`
          : dispatchLogs.length > 0
            ? `Đã thực thi bắn tin nhắn qua ${dispatchLogs.length} kênh Bot Server-side!`
            : 'Đã ghi nhận bản tin nội bộ.',
        dispatch_logs: dispatchLogs
      });
    }

    return json({ success: false, error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('POST /api/session-audit error:', err);
    return json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
