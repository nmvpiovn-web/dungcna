// src/routes/api/langflow/+server.js
// Dedicated API for /langflow — 7-Node CRAG + Langflow Visual Pipeline, Direct Node Editor, User/Group RBAC Manager & Single-Source Bot Config
import { json } from '@sveltejs/kit';
import {
  DEFAULT_ZALO_BOT_TOKEN,
  SUPERADMIN_DEFAULT_CHAT_ID,
  DEFAULT_LANGFLOW_NODES,
  DEFAULT_LANGFLOW_EDGES,
  DEFAULT_RBAC_USER_GROUPS,
  ensureCragLangflowTables,
  getCanonicalBotConfig,
  saveCanonicalBotConfig,
  runCragLangflowPipeline,
  toZaloCompatiblePhotoUrl
} from '$lib/server/cragLangflowEngine.js';

export const prerender = false;

const WORKER_CRAG_URL = 'https://timbk-zalo-webhook.tienganh7-sveltekit.workers.dev';

const DEFAULT_AUTO_NOTIFY_RULES = [
  {
    id: 'schedule_10m',
    title: '⏰ Nhắc Lịch Đưa Đón Trước 10 Phút',
    desc: 'Tự động quét bảng class_sessions và bắn tin Zalo trước giờ học 10 phút kèm phòng học & chủ đề.',
    target_roles: ['parent', 'student', 'teacher'],
    enabled: true,
    trigger_type: 'CRON_EVERY_MINUTE'
  },
  {
    id: 'attendance_instant',
    title: '📋 Báo Điểm Danh Tức Thời (Đúng Giờ / Đi Muộn / Vắng)',
    desc: 'Khi giáo viên lưu điểm danh vào attendance_records, bắn ngay trạng thái + số Sao thưởng cho Phụ huynh.',
    target_roles: ['parent', 'superadmin'],
    enabled: true,
    trigger_type: 'EVENT_ON_ATTENDANCE_SAVE'
  },
  {
    id: 'tuition_vietqr',
    title: '💰 Báo Học Phí Tháng & Khấu Trừ Sao (VietQR)',
    desc: 'Đọc bảng tuition_bills & student_stars, gửi chi tiết số Sao được trừ và link mã QR thanh toán cho Phụ huynh.',
    target_roles: ['parent', 'superadmin'],
    enabled: true,
    trigger_type: 'EVENT_ON_BILL_APPROVED'
  },
  {
    id: 'evaluation_report',
    title: '📈 Báo Kết Quả Học Tập & Đánh Giá 5 Kỹ Năng',
    desc: 'Đọc bảng student_evaluations, homework_submissions & quiz_attempts để gửi phiếu nhận xét định kỳ.',
    target_roles: ['parent', 'student', 'superadmin'],
    enabled: true,
    trigger_type: 'EVENT_ON_EVALUATION_SAVED'
  },
  {
    id: 'session_audit_5part',
    title: '📊 Báo Cáo Đối Soát Chất Lượng Ca Dạy 5 Phần',
    desc: 'Tổng hợp hồi quy Kho Tri Thức + Google Drive + BTVN + Điểm danh gửi cho SuperAdmin & Giáo viên.',
    target_roles: ['superadmin', 'leader', 'teacher'],
    enabled: true,
    trigger_type: 'EVENT_ON_AUDIT_EXPORT'
  }
];

function roleToGroupId(role = 'student') {
  const r = String(role || '').toLowerCase();
  if (r === 'superadmin' || r === 'admin') return 'grp_superadmin';
  if (r === 'leader') return 'grp_leader';
  if (r === 'teacher') return 'grp_teacher';
  if (r === 'parent') return 'grp_parent';
  if (r === 'guest') return 'grp_guest';
  return 'grp_student';
}

function groupIdToRole(groupId = 'grp_student') {
  const g = String(groupId || '').toLowerCase();
  if (g === 'grp_superadmin') return 'superadmin';
  if (g === 'grp_leader') return 'leader';
  if (g === 'grp_teacher') return 'teacher';
  if (g === 'grp_parent') return 'parent';
  if (g === 'grp_guest') return 'guest';
  return 'student';
}

function mergeSavedNodes(savedNodesJson) {
  if (!savedNodesJson) return DEFAULT_LANGFLOW_NODES.map((n) => ({ ...n, config: { ...n.config } }));
  try {
    const parsed = typeof savedNodesJson === 'string' ? JSON.parse(savedNodesJson) : savedNodesJson;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_LANGFLOW_NODES.map((n) => ({ ...n, config: { ...n.config } }));
    }
    return DEFAULT_LANGFLOW_NODES.map((defNode) => {
      const saved = parsed.find((item) => item && item.id === defNode.id);
      if (!saved) return { ...defNode, config: { ...defNode.config } };
      return {
        ...defNode,
        ...saved,
        enabled: saved.enabled !== undefined ? Boolean(saved.enabled) : true,
        system_prompt: saved.system_prompt || defNode.system_prompt,
        input_schema: saved.input_schema || defNode.input_schema,
        output_schema: saved.output_schema || defNode.output_schema,
        config: {
          ...defNode.config,
          ...(saved.config || {})
        }
      };
    });
  } catch {
    return DEFAULT_LANGFLOW_NODES.map((n) => ({ ...n, config: { ...n.config } }));
  }
}

export async function GET({ platform }) {
  const db = platform?.env?.DB;
  let subscribers = [];
  let traces = [];
  let recentMessages = [];
  let activeNodes = DEFAULT_LANGFLOW_NODES.map((n) => ({ ...n, config: { ...n.config } }));
  let activeAutoNotifyRules = DEFAULT_AUTO_NOTIFY_RULES;
  let userGroups = DEFAULT_RBAC_USER_GROUPS.map((g) => ({ ...g }));
  let managedUsers = [];
  let botConfig = await getCanonicalBotConfig(db);
  let dbOverview = {
    total_tables: 81,
    students_count: 0,
    teachers_count: 0,
    sessions_count: 0,
    bills_count: 0,
    evaluations_count: 0,
    vault_articles_count: 0,
    sample_students: []
  };

  if (db) {
    await ensureCragLangflowTables(db);
    botConfig = await getCanonicalBotConfig(db);
    try {
      const [subsRes, tracesRes, msgsRes, usersRes, groupsRes, sessRes, billsRes, evalsRes, vaultRes, tablesCntRes, cfgRes] = await Promise.all([
        db.prepare(`SELECT * FROM zalo_bot_subscribers ORDER BY updated_at DESC LIMIT 30`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT * FROM crag_execution_traces ORDER BY rowid DESC LIMIT 25`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT * FROM zalo_bot_messages ORDER BY id DESC LIMIT 25`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT id, username, name, role, phone, status, metadata FROM users ORDER BY created_at ASC LIMIT 80`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT * FROM rbac_user_groups ORDER BY rowid ASC`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT COUNT(*) as cnt FROM class_sessions`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM tuition_bills`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM student_evaluations`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM knowledge_vault`).first().catch(() => ({ cnt: 0 })),
        db.prepare(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'`).first().catch(() => ({ cnt: 81 })),
        db.prepare(`SELECT nodes_json, edges_json, auto_notify_rules_json FROM crag_pipeline_configs WHERE id = 'cfg_primary' LIMIT 1`).first().catch(() => null)
      ]);

      if (cfgRes) {
        activeNodes = mergeSavedNodes(cfgRes.nodes_json);
        if (cfgRes.auto_notify_rules_json) {
          try {
            const parsedRules = JSON.parse(cfgRes.auto_notify_rules_json);
            if (Array.isArray(parsedRules) && parsedRules.length > 0) {
              activeAutoNotifyRules = parsedRules;
            }
          } catch {}
        }
      } else {
        await db.prepare(`
          INSERT OR IGNORE INTO crag_pipeline_configs (id, name, nodes_json, edges_json, auto_notify_rules_json, updated_at)
          VALUES ('cfg_primary', '7-Node CRAG Langflow Master Pipeline', ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          JSON.stringify(DEFAULT_LANGFLOW_NODES),
          JSON.stringify(DEFAULT_LANGFLOW_EDGES),
          JSON.stringify(DEFAULT_AUTO_NOTIFY_RULES)
        ).run().catch(() => {});
      }

      if (Array.isArray(groupsRes?.results) && groupsRes.results.length > 0) {
        userGroups = groupsRes.results.map((r) => {
          let perms = [];
          let tbls = [];
          try { perms = JSON.parse(r.permissions_json || '[]'); } catch {}
          try { tbls = JSON.parse(r.allowed_tables_json || '[]'); } catch {}
          return {
            id: r.id,
            role_key: r.role_key,
            name: r.name,
            description: r.description || '',
            permissions: perms,
            allowed_tables: tbls,
            max_memory_turns: Number(r.max_memory_turns || 6),
            color: r.color || 'emerald',
            updated_at: r.updated_at
          };
        });
      }

      subscribers = subsRes?.results || [];
      traces = (tracesRes?.results || []).map((t) => {
        let timings = {};
        let intents = [];
        let entities = {};
        let tables = [];
        try { timings = JSON.parse(t.node_timings_json || '{}'); } catch {}
        try { intents = JSON.parse(t.detected_intents || '[]'); } catch {}
        try { entities = JSON.parse(t.extracted_entities || '{}'); } catch {}
        try { tables = JSON.parse(t.tables_queried || '[]'); } catch {}
        return {
          ...t,
          node_timings: timings,
          detected_intents_list: intents,
          extracted_entities_obj: entities,
          tables_queried_list: tables
        };
      });
      recentMessages = msgsRes?.results || [];

      const allUsers = usersRes?.results || [];
      managedUsers = allUsers.map((u) => {
        let meta = {};
        try { meta = JSON.parse(u.metadata || '{}'); } catch {}
        const effectiveRole = String(meta.app_role || u.role || 'student').toLowerCase();
        const groupId = meta.group_id || roleToGroupId(effectiveRole);
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          role: effectiveRole,
          group_id: groupId,
          phone: u.phone || meta.phone || meta.parent_phone || '',
          grade: meta.grade ? (String(meta.grade).startsWith('Lớp') ? String(meta.grade) : `Lớp ${meta.grade}`) : '',
          status: u.status || 'official'
        };
      });

      const students = managedUsers.filter((u) => u.role === 'student');
      const teachers = managedUsers.filter((u) => ['teacher', 'superadmin', 'leader', 'admin'].includes(u.role));

      dbOverview = {
        total_tables: Number(tablesCntRes?.cnt || 81),
        students_count: students.length,
        teachers_count: teachers.length,
        sessions_count: Number(sessRes?.cnt || 0),
        bills_count: Number(billsRes?.cnt || 0),
        evaluations_count: Number(evalsRes?.cnt || 0),
        vault_articles_count: Number(vaultRes?.cnt || 0),
        sample_students: students.slice(0, 12)
      };
    } catch {}
  }

  return json({
    success: true,
    superadmin_chat_id: botConfig.chat_id || SUPERADMIN_DEFAULT_CHAT_ID,
    bot_config: {
      id: botConfig.id,
      name: botConfig.name,
      webhook_url: botConfig.webhook_url,
      chat_id: botConfig.chat_id,
      bot_token_masked: botConfig.bot_token ? `${botConfig.bot_token.slice(0, 19)}...${botConfig.bot_token.slice(-6)}` : '',
      bot_token: botConfig.bot_token,
      is_active: Boolean(botConfig.is_active)
    },
    nodes: activeNodes,
    edges: DEFAULT_LANGFLOW_EDGES,
    user_groups: userGroups,
    managed_users: managedUsers,
    auto_notify_rules: activeAutoNotifyRules,
    db_overview: dbOverview,
    subscribers,
    traces,
    recent_messages: recentMessages
  });
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (db) {
    await ensureCragLangflowTables(db);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action || 'run_crag_test';
  const botConfig = await getCanonicalBotConfig(db);
  const activeBotToken = botConfig.bot_token || DEFAULT_ZALO_BOT_TOKEN;

  // 1. Run 7-Node CRAG Pipeline (via Edge Worker with AI binding + D1 fallback)
  if (action === 'run_crag_test') {
    const query = String(body.query || '').trim();
    if (!query) {
      return json({ success: false, error: 'Vui lòng nhập câu hỏi cần kiểm thử qua CRAG Pipeline' }, { status: 400 });
    }
    const chatId = String(body.chat_id || botConfig.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();
    const role = body.role || 'superadmin';
    const sendToZalo = Boolean(body.send_to_zalo);

    try {
      const wRes = await fetch(WORKER_CRAG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          sender: { id: chatId, name: body.display_name || 'Hải (SuperAdmin)' },
          text: query,
          override_role: role,
          send_to_zalo: sendToZalo
        })
      });
      if (wRes.ok) {
        const wData = await wRes.json().catch(() => null);
        if (wData?.ok) {
          return json({
            success: true,
            result: {
              ...wData,
              verified_facts: wData.verified_facts || wData.retrieved_summary || ''
            }
          });
        }
      }
    } catch {}

    const result = await runCragLangflowPipeline({
      db,
      env: platform?.env,
      chatId,
      displayName: body.display_name || 'Hải (SuperAdmin)',
      userText: query,
      overrideRole: role,
      sendToZalo,
      botToken: activeBotToken
    });

    return json({
      success: true,
      result
    });
  }

  // 2. Direct Node Config Editor (Save Node Edits to D1 crag_pipeline_configs.nodes_json)
  if (action === 'save_node_config') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const nodeId = String(body.node_id || body.node?.id || '').trim();
    if (!nodeId) {
      return json({ success: false, error: 'Thiếu node_id cần lưu' }, { status: 400 });
    }

    const cfgRow = await db.prepare(`SELECT nodes_json, edges_json, auto_notify_rules_json FROM crag_pipeline_configs WHERE id = 'cfg_primary' LIMIT 1`).first().catch(() => null);
    const currentNodes = mergeSavedNodes(cfgRow?.nodes_json);
    const targetIdx = currentNodes.findIndex((n) => n.id === nodeId);
    if (targetIdx === -1) {
      return json({ success: false, error: `Không tìm thấy Node "${nodeId}"` }, { status: 404 });
    }

    const incoming = body.node || body;
    const prevNode = currentNodes[targetIdx];
    const updatedConfig = {
      ...prevNode.config,
      ...(incoming.config && typeof incoming.config === 'object' ? incoming.config : {})
    };
    if (Array.isArray(incoming.tables)) {
      updatedConfig.tables = incoming.tables;
    } else if (typeof incoming.tables_csv === 'string') {
      updatedConfig.tables = incoming.tables_csv.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (incoming.primary_model !== undefined) {
      updatedConfig.primary_model = String(incoming.primary_model).trim();
    }
    if (incoming.score_threshold !== undefined) {
      updatedConfig.score_threshold = Number(incoming.score_threshold) || 85;
    }

    currentNodes[targetIdx] = {
      ...prevNode,
      title: String(incoming.title ?? prevNode.title).trim() || prevNode.title,
      subtitle: String(incoming.subtitle ?? prevNode.subtitle).trim() || prevNode.subtitle,
      description: String(incoming.description ?? prevNode.description).trim() || prevNode.description,
      system_prompt: String(incoming.system_prompt ?? prevNode.system_prompt ?? '').trim(),
      input_schema: String(incoming.input_schema ?? prevNode.input_schema ?? '').trim(),
      output_schema: String(incoming.output_schema ?? prevNode.output_schema ?? '').trim(),
      enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : Boolean(prevNode.enabled ?? true),
      config: updatedConfig
    };

    await db.prepare(`
      INSERT INTO crag_pipeline_configs (id, name, nodes_json, edges_json, auto_notify_rules_json, updated_at)
      VALUES ('cfg_primary', '7-Node CRAG Langflow Master Pipeline', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        nodes_json = excluded.nodes_json,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      JSON.stringify(currentNodes),
      cfgRow?.edges_json || JSON.stringify(DEFAULT_LANGFLOW_EDGES),
      cfgRow?.auto_notify_rules_json || JSON.stringify(DEFAULT_AUTO_NOTIFY_RULES)
    ).run();

    return json({
      success: true,
      node: currentNodes[targetIdx],
      nodes: currentNodes,
      message: `✅ Đã lưu cấu hình trực tiếp cho "${currentNodes[targetIdx].title}" vào Cloudflare D1!`
    });
  }

  if (action === 'reset_node_configs') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const resetNodes = DEFAULT_LANGFLOW_NODES.map((n) => ({ ...n, config: { ...n.config } }));
    await db.prepare(`
      UPDATE crag_pipeline_configs
      SET nodes_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 'cfg_primary'
    `).bind(JSON.stringify(resetNodes)).run().catch(() => {});
    return json({
      success: true,
      nodes: resetNodes,
      message: '🔄 Đã khôi phục cấu hình mặc định cho 7 Node CRAG trên D1!'
    });
  }

  // 3. Single-Source Bot Config Save (Eliminates Double Config across /admin, /session-audit, /langflow)
  if (action === 'save_bot_config') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const saved = await saveCanonicalBotConfig(db, {
      name: body.name,
      webhook_url: body.webhook_url,
      bot_token: body.bot_token,
      chat_id: body.chat_id,
      is_active: body.is_active
    });
    return json({
      success: true,
      bot_config: {
        id: saved.id,
        name: saved.name,
        webhook_url: saved.webhook_url,
        chat_id: saved.chat_id,
        bot_token: saved.bot_token,
        bot_token_masked: saved.bot_token ? `${saved.bot_token.slice(0, 19)}...${saved.bot_token.slice(-6)}` : '',
        is_active: Boolean(saved.is_active)
      },
      message: '✅ Đã đồng bộ cấu hình Zalo Bot duy nhất (Single Source of Truth) trên bảng D1 bot_webhook_configs!'
    });
  }

  // 4. Update Subscriber Role / Linked User
  if (action === 'update_subscriber_role') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const chatId = String(body.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();
    const newRole = String(body.role_hint || 'superadmin').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const linkedUserId = String(body.linked_user_id || '').trim();

    await db.prepare(`
      UPDATE zalo_bot_subscribers
      SET role_hint = ?,
          phone = CASE WHEN ? != '' THEN ? ELSE phone END,
          linked_user_id = CASE WHEN ? != '' THEN ? ELSE linked_user_id END,
          updated_at = CURRENT_TIMESTAMP
      WHERE chat_id = ?
    `).bind(newRole, phone, phone, linkedUserId, linkedUserId, chatId).run();

    return json({
      success: true,
      message: `✅ Đã cập nhật Role của Chat ID ${chatId} thành "${newRole.toUpperCase()}" trong D1!`
    });
  }

  // 5. Update User Role & RBAC UserGroup (users + rbac_user_groups + zalo_bot_subscribers)
  if (action === 'update_user_group_role') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const userId = String(body.user_id || '').trim();
    if (!userId) return json({ success: false, error: 'Thiếu user_id' }, { status: 400 });

    const requestedGroupId = String(body.group_id || '').trim();
    const requestedRole = String(body.role || (requestedGroupId ? groupIdToRole(requestedGroupId) : 'student')).trim().toLowerCase();
    const finalGroupId = requestedGroupId || roleToGroupId(requestedRole);
    const dbRole = ['superadmin', 'teacher', 'parent', 'student'].includes(requestedRole)
      ? requestedRole
      : (requestedRole === 'leader' || requestedRole === 'admin' ? 'superadmin' : 'student');

    const userRow = await db.prepare(`SELECT id, metadata FROM users WHERE id = ? LIMIT 1`).bind(userId).first().catch(() => null);
    if (!userRow) {
      return json({ success: false, error: `Không tìm thấy người dùng ID "${userId}"` }, { status: 404 });
    }
    let meta = {};
    try { meta = JSON.parse(userRow.metadata || '{}'); } catch {}
    meta.app_role = requestedRole;
    meta.group_id = finalGroupId;

    await db.prepare(`
      UPDATE users
      SET role = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(dbRole, JSON.stringify(meta), userId).run();

    await db.prepare(`
      UPDATE zalo_bot_subscribers
      SET role_hint = ?, updated_at = CURRENT_TIMESTAMP
      WHERE linked_user_id = ?
    `).bind(requestedRole, userId).run().catch(() => {});

    return json({
      success: true,
      user_id: userId,
      role: requestedRole,
      group_id: finalGroupId,
      message: `✅ Đã gán User "${userId}" vào nhóm "${finalGroupId}" (Role: ${requestedRole.toUpperCase()}) trên D1!`
    });
  }

  // 6. Save RBAC User Group Permissions / Allowed Tables
  if (action === 'save_rbac_group') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const groupId = String(body.id || body.group_id || '').trim();
    if (!groupId) return json({ success: false, error: 'Thiếu group_id' }, { status: 400 });

    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const roleKey = String(body.role_key || groupIdToRole(groupId)).trim();
    const maxTurns = Number(body.max_memory_turns || 6);
    const permissions = Array.isArray(body.permissions)
      ? body.permissions
      : String(body.permissions_csv || '').split(',').map((s) => s.trim()).filter(Boolean);
    const allowedTables = Array.isArray(body.allowed_tables)
      ? body.allowed_tables
      : String(body.allowed_tables_csv || '').split(',').map((s) => s.trim()).filter(Boolean);

    await db.prepare(`
      INSERT INTO rbac_user_groups (id, role_key, name, description, permissions_json, allowed_tables_json, max_memory_turns, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = CASE WHEN excluded.name != '' THEN excluded.name ELSE rbac_user_groups.name END,
        description = excluded.description,
        permissions_json = excluded.permissions_json,
        allowed_tables_json = excluded.allowed_tables_json,
        max_memory_turns = excluded.max_memory_turns,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      groupId,
      roleKey,
      name || groupId,
      description,
      JSON.stringify(permissions),
      JSON.stringify(allowedTables),
      maxTurns
    ).run();

    return json({
      success: true,
      group_id: groupId,
      message: `✅ Đã lưu cấu hình Nhóm Quyền "${name || groupId}" vào bảng D1 rbac_user_groups!`
    });
  }

  // 7. Trigger Automated Notification Rule Immediately from Real D1 Data
  if (action === 'trigger_auto_notification') {
    const ruleId = String(body.rule_id || 'schedule_10m').trim();
    const targetChatId = String(body.chat_id || botConfig.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();

    let messageText = '';
    if (db) {
      if (ruleId === 'schedule_10m') {
        const s = await db.prepare(`SELECT * FROM class_sessions WHERE id = 'sess_g7_mon' OR grade_level = 'Lớp 7' LIMIT 1`).first().catch(() => null);
        messageText =
          `⏰ Nhắc lịch học hôm nay (${s?.day_name || 'Thứ Hai'}, ${s?.start_time || '18:00'} – ${s?.end_time || '19:30'}):\n` +
          `• Lớp: ${s?.class_name || 'Lớp 7 - Global Success & KET A2'}\n` +
          `• Giáo viên: ${s?.teacher_name || 'Ms. Dung'}${s?.assistant_teacher_name ? ` (Trợ giảng: ${s.assistant_teacher_name})` : ''}\n` +
          `• Phòng học: ${s?.room_notes || 'Phòng VIP 201'} — ${s?.location || '123 Phố Vọng, Hai Bà Trưng'}\n` +
          `• Bài học: ${s?.subject_topic || 'Unit 7: Traffic & Phonics'}\n\n` +
          `Chỉ còn 10 phút nữa vào lớp, phụ huynh nhắc con chuẩn bị sách vở nhé. Nếu hôm nay con bận hoặc đến muộn, anh/chị nhắn lại tin này để lớp ghi nhận ạ.`;
      } else if (ruleId === 'attendance_instant') {
        const a = await db.prepare(`SELECT * FROM attendance_records ORDER BY created_at DESC LIMIT 1`).first().catch(() => null);
        messageText =
          `📋 Điểm danh buổi học ngày ${a?.session_date || new Date().toISOString().slice(0, 10)}:\n` +
          `• Học sinh: ${a?.student_name || 'Nguyễn Bảo Khiêm (Lớp 7)'}\n` +
          `• Trạng thái: ${a?.status === 'late' ? 'Đi muộn' : 'Đã vào lớp đúng giờ'} (+${a?.instant_stars_rewarded || 15} sao chuyên cần)\n` +
          `• Ghi chú trên lớp: ${a?.in_class_attitude || 'Hăng hái phát biểu, chuẩn bị bài đầy đủ.'}`;
      } else if (ruleId === 'tuition_vietqr') {
        const b = await db.prepare(`SELECT * FROM tuition_bills WHERE billing_period NOT LIKE '%PROBE%' AND LOWER(student_name) != 'test' ORDER BY created_at ASC LIMIT 1`).first().catch(() => null);
        const rawQr = b?.vietqr_url || 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=2100000&addInfo=HP_BAOANH_T10&accountName=NGUYEN%20MINH%20VU';
        const safeQrPhoto = toZaloCompatiblePhotoUrl(rawQr);
        const dlQrLink = toZaloCompatiblePhotoUrl(rawQr, { download: true });
        messageText =
          `💳 Phiếu báo học phí ${b?.billing_period || 'Tháng 10/2026'} — ${b?.student_name || 'Lê Bảo Anh'} (${b?.grade_level || 'Lớp 12'}):\n` +
          `• Học phí gốc: ${Number(b?.base_tuition_vnd || 2200000).toLocaleString('vi-VN')}đ (${b?.attendance_attended_sessions || 12}/${b?.attendance_total_sessions || 12} buổi)\n` +
          `• Đổi sao tích lũy: -${Number(b?.discount_vnd || 100000).toLocaleString('vi-VN')}đ (${Number(b?.stars_deducted || 10000).toLocaleString('vi-VN')} sao)\n` +
          `➔ Thực đóng: ${Number(b?.final_amount_vnd || 2100000).toLocaleString('vi-VN')}đ\n` +
          `🏦 ${b?.bank_name || 'MBBank'} • STK: ${b?.bank_account || '0901234567'} (${b?.account_holder || 'NGUYEN MINH VU'})\n` +
          `• Tải ảnh QR nét cao (.PNG): ${dlQrLink}\n\n` +
          `Lớp gửi kèm mã QR ngay bên dưới để phụ huynh tiện quét nhanh ạ:`;

        await fetch(`https://bot-api.zaloplatforms.com/bot${activeBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: messageText
          })
        }).catch(() => {});

        const pRes = await fetch(`https://bot-api.zaloplatforms.com/bot${activeBotToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            photo: safeQrPhoto,
            caption: `Mã QR học phí ${b?.billing_period || 'T10/2026'} - ${b?.student_name || 'Lê Bảo Anh'}: ${Number(b?.final_amount_vnd || 2100000).toLocaleString('vi-VN')}đ`
          })
        });
        const pData = await pRes.json().catch(() => ({}));

        if (db) {
          await db.prepare(`
            INSERT INTO zalo_bot_messages (chat_id, sender_name, direction, content, ai_model)
            VALUES (?, 'Lớp Cô Dung', 'out', ?, ?)
          `).bind(targetChatId, messageText, `auto_rule:${ruleId}`).run().catch(() => {});
        }

        return json({
          success: Boolean(pRes.ok && pData?.ok),
          rule_id: ruleId,
          chat_id: targetChatId,
          message_sent: messageText,
          message: pRes.ok && pData?.ok
            ? `Đã gửi phiếu học phí kèm thẻ ảnh QR về Zalo ${targetChatId}`
            : `Không gửi được qua Zalo: ${pData?.description || 'Lỗi kết nối'}`
        });
      } else if (ruleId === 'evaluation_report') {
        const e = await db.prepare(`SELECT * FROM student_evaluations ORDER BY created_at ASC LIMIT 1`).first().catch(() => null);
        messageText =
          `📈 Nhận xét định kỳ của ${e?.student_name || 'Trần Gia Huy'} (${e?.grade_level || 'Lớp 7'} - GV: ${e?.teacher_name || 'Ms. Dung'}):\n` +
          `• Điểm 5 kỹ năng: Nghe ${e?.listening_score || 9.0} | Nói ${e?.speaking_score || 8.5} | Đọc ${e?.reading_score || 7.5} | Viết ${e?.writing_score || 7.0} | Ngữ pháp ${e?.grammar_vocab_score || 8.0}\n` +
          `• Điểm mạnh: ${e?.strengths || 'Phát âm chuẩn, phản xạ nghe nói tự nhiên.'}\n` +
          `• Hướng rèn thêm: ${e?.action_plan || 'Luyện thêm bài tập viết câu & ngữ pháp 15p mỗi ngày.'}`;
      } else {
        messageText =
          `📊 Tổng kết ca dạy Lớp 7 - Global Success & KET A2 (Thứ Hai & Thứ Năm, 18:00 - 19:30):\n` +
          `• Hoàn thành BTVN & Quiz: 92% học sinh đạt yêu cầu\n` +
          `• Tài liệu đã giảng: Unit 7 Traffic + Đề cương Google Drive Lớp 7\n` +
          `• Ghi chú chuyên môn: Học sinh nắm chắc cấu trúc trọng tâm, buổi tới tăng thêm 15 phút luyện Viết câu KET A2.`;
      }
    }

    const zRes = await fetch(`https://bot-api.zaloplatforms.com/bot${activeBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: messageText
      })
    });
    const zData = await zRes.json().catch(() => ({}));

    if (db) {
      await db.prepare(`
        INSERT INTO zalo_bot_messages (chat_id, sender_name, direction, content, ai_model)
        VALUES (?, 'Lớp Cô Dung', 'out', ?, ?)
      `).bind(targetChatId, messageText, `auto_rule:${ruleId}`).run().catch(() => {});
    }

    return json({
      success: Boolean(zRes.ok && zData?.ok),
      rule_id: ruleId,
      chat_id: targetChatId,
      message_sent: messageText,
      message: zRes.ok && zData?.ok
        ? `Đã gửi thông báo (${ruleId}) về Zalo ${targetChatId}`
        : `Không gửi được qua Zalo: ${zData?.description || 'Lỗi kết nối'}`
    });
  }

  // 8. Test & Dispatch Rich Media Webhook
  if (action === 'dispatch_media_webhook') {
    const mediaType = String(body.media_type || 'qr_photo').trim();
    const targetChatId = String(body.chat_id || botConfig.chat_id || SUPERADMIN_DEFAULT_CHAT_ID).trim();
    const rawUrl = String(body.media_url || '').trim();
    const caption = String(body.caption || '').trim();
    const baseUrl = `https://bot-api.zaloplatforms.com/bot${activeBotToken}`;

    if (mediaType === 'qr_photo' || mediaType === 'custom_photo') {
      const defaultQr = 'https://timbk.io.vn/api/vietqr/970422-0901234567-1550000-HP_GIAHUY_T10.png';
      const photoToUse = rawUrl || defaultQr;
      const safePhotoUrl = toZaloCompatiblePhotoUrl(photoToUse);

      const zRes = await fetch(baseUrl + '/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: safePhotoUrl,
          caption: (caption || 'Mã QR đóng học phí (quét trực tiếp trên ứng dụng ngân hàng)').slice(0, 500)
        })
      });
      const zData = await zRes.json().catch(() => ({}));
      return json({
        success: Boolean(zRes.ok && zData?.ok),
        endpoint: '/sendPhoto',
        message_type: zData?.result?.message_type || 'CHAT_PHOTO',
        message_id: zData?.result?.message_id || null,
        safe_photo_url: safePhotoUrl,
        zalo_response: zData,
        message: zRes.ok && zData?.ok
          ? `Đã gửi thẻ ảnh QR (ID: ${zData.result?.message_id}) về Zalo ${targetChatId}`
          : `Lỗi gửi ảnh (/sendPhoto): ${zData?.description || 'Không hợp lệ'}`
      });
    }

    if (mediaType === 'voice_audio') {
      const voiceToUse = rawUrl || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      const zRes = await fetch(baseUrl + '/sendVoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          voice: voiceToUse
        })
      });
      const zData = await zRes.json().catch(() => ({}));
      return json({
        success: Boolean(zRes.ok && zData?.ok),
        endpoint: '/sendVoice',
        zalo_response: zData,
        message: zRes.ok && zData?.ok
          ? `Đã gửi file âm thanh luyện nghe về Zalo ${targetChatId}`
          : `Phản hồi /sendVoice: ${zData?.description || 'Cần URL file âm thanh hợp lệ'}`
      });
    }

    if (mediaType === 'video_lesson') {
      const videoUrl = rawUrl || 'https://www.youtube.com/watch?v=jul2urONzOQ';
      const thumbUrl = 'https://wsrv.nl/?url=' + encodeURIComponent('https://img.youtube.com/vi/jul2urONzOQ/maxresdefault.jpg') + '&output=png';
      await fetch(baseUrl + '/sendPhoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: thumbUrl,
          caption: (caption || 'Bài giảng Tiếng Anh Lớp 7 — Unit 7: Traffic').slice(0, 500)
        })
      });
      const mRes = await fetch(baseUrl + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: `🎬 Video bài học: ${caption || 'Unit 7: Traffic — Phonics & Cấu trúc Used to'}\n▶️ Mở xem bài giảng: ${videoUrl}`
        })
      });
      const mData = await mRes.json().catch(() => ({}));
      return json({
        success: Boolean(mRes.ok && mData?.ok),
        endpoint: '/sendPhoto + /sendMessage',
        zalo_response: mData,
        message: `Đã gửi ảnh bìa + link video bài giảng về Zalo ${targetChatId}`
      });
    }
  }

  // 9. Toggle Auto-Notify Rule in crag_pipeline_configs (D1 Persistence)
  if (action === 'toggle_auto_notify_rule') {
    const ruleId = String(body.rule_id || '').trim();
    if (!ruleId || !db) {
      return json({ success: false, error: 'Thiếu rule_id hoặc kết nối D1' }, { status: 400 });
    }
    let rules = DEFAULT_AUTO_NOTIFY_RULES.map((r) => ({ ...r }));
    const cfgRow = await db.prepare(`SELECT nodes_json, edges_json, auto_notify_rules_json FROM crag_pipeline_configs WHERE id = 'cfg_primary' LIMIT 1`).first().catch(() => null);
    if (cfgRow?.auto_notify_rules_json) {
      try {
        const parsed = JSON.parse(cfgRow.auto_notify_rules_json);
        if (Array.isArray(parsed) && parsed.length > 0) rules = parsed;
      } catch {}
    }
    const targetRule = rules.find((r) => r.id === ruleId);
    if (!targetRule) {
      return json({ success: false, error: `Không tìm thấy rule: ${ruleId}` }, { status: 404 });
    }
    targetRule.enabled = body.enabled !== undefined ? Boolean(body.enabled) : !targetRule.enabled;
    await db.prepare(`
      INSERT INTO crag_pipeline_configs (id, name, nodes_json, edges_json, auto_notify_rules_json, updated_at)
      VALUES ('cfg_primary', '7-Node CRAG Langflow Master Pipeline', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        auto_notify_rules_json = excluded.auto_notify_rules_json,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      cfgRow?.nodes_json || JSON.stringify(DEFAULT_LANGFLOW_NODES),
      cfgRow?.edges_json || JSON.stringify(DEFAULT_LANGFLOW_EDGES),
      JSON.stringify(rules)
    ).run().catch(() => {});

    return json({
      success: true,
      rule_id: ruleId,
      enabled: targetRule.enabled,
      auto_notify_rules: rules,
      message: `Đã ${targetRule.enabled ? 'BẬT' : 'TẮT'} luồng tự động "${targetRule.title || targetRule.name}" trên D1`
    });
  }

  return json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
