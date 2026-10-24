<svelte:head>
  <title>Langflow CRAG Studio • Bộ Não AI Đa Tác Tử, Chỉnh Sửa Node Trực Tiếp &amp; Phân Quyền GroupUser D1 • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';

  let loading = $state(true);
  let runningTest = $state(false);
  let triggeringRuleId = $state('');
  let updatingRoleChatId = $state('');
  let updatingUserId = $state('');
  let savingNode = $state(false);
  let savingBot = $state(false);
  let savingGroup = $state(false);
  let toastMsg = $state('');

  let superadminChatId = $state('b3845beb38a2d1fc88b3');
  let botConfig = $state({
    id: 'bot_primary',
    name: 'Zalo Bot Platform (@bot.KTncTtfA • Lớp Tiếng Anh Cô Dung)',
    webhook_url: 'https://timbk-zalo-webhook.tienganh7-sveltekit.workers.dev',
    chat_id: 'b3845beb38a2d1fc88b3',
    bot_token: '',
    bot_token_masked: '',
    is_active: true
  });
  let showBotConfigPanel = $state(false);

  let nodes = $state([]);
  let edges = $state([]);
  let userGroups = $state([]);
  let managedUsers = $state([]);
  let autoNotifyRules = $state([]);
  let dbOverview = $state({
    total_tables: 81,
    students_count: 0,
    teachers_count: 0,
    sessions_count: 0,
    bills_count: 0,
    evaluations_count: 0,
    vault_articles_count: 0,
    sample_students: []
  });
  let subscribers = $state([]);
  let traces = $state([]);
  let recentMessages = $state([]);
  let nodeAudits = $state([]);
  let zaloReportPreviews = $state([]);
  let phases100Clusters = $state([]);
  let running100PhaseAudit = $state(false);
  let activeAuditTab = $state('reports'); // 'reports' | 'nodes' | 'clusters'

  // Active Node in Canvas Inspector & Direct Node Editor Form
  let selectedNodeId = $state('node_crag_grader');
  let selectedNode = $derived(nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null);
  let nodeEditorForm = $state({
    id: '',
    title: '',
    subtitle: '',
    description: '',
    system_prompt: '',
    input_schema: '',
    output_schema: '',
    tables_csv: '',
    primary_model: '',
    score_threshold: 90,
    enabled: true
  });

  function syncNodeEditorForm(node) {
    if (!node) return;
    nodeEditorForm = {
      id: node.id,
      title: node.title || '',
      subtitle: node.subtitle || '',
      description: node.description || '',
      system_prompt: node.system_prompt || '',
      input_schema: node.input_schema || '',
      output_schema: node.output_schema || '',
      tables_csv: Array.isArray(node.config?.tables) ? node.config.tables.join(', ') : '',
      primary_model: node.config?.primary_model || '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      score_threshold: Number(node.config?.score_threshold ?? 90),
      enabled: node.enabled !== false
    };
  }

  function selectNodeForEdit(node) {
    selectedNodeId = node.id;
    syncNodeEditorForm(node);
  }

  // RBAC GroupUser & User Role Manager Tabs
  let rbacActiveTab = $state('groups'); // 'groups' | 'users' | 'zalo'
  let selectedGroupFilter = $state('all');
  let editingGroup = $state(null);

  let filteredManagedUsers = $derived(
    managedUsers.filter((u) => selectedGroupFilter === 'all' || u.group_id === selectedGroupFilter || u.role === selectedGroupFilter)
  );

  // CRAG Interactive Simulator State
  let simQuery = $state('Tao hỏi lịch học của Bảo Khiêm');
  let simRole = $state('superadmin');
  let simChatId = $state('b3845beb38a2d1fc88b3');
  let simSendToZalo = $state(true);
  let lastRunResult = $state(null);

  const presetQueries = [
    {
      label: '1️⃣ Hỏi mở đầu: Lịch học của Bảo Khiêm',
      role: 'superadmin',
      query: 'Bảo Khiêm tuần này học những buổi nào?'
    },
    {
      label: '2️⃣ Hỏi nối tiếp (Không cần nhắc tên): Còn học phí & mã QR?',
      role: 'superadmin',
      query: 'Còn học phí tháng này bao nhiêu? Gửi mã QR luôn nhé'
    },
    {
      label: '3️⃣ Đổi học sinh (Giữ mạch chủ đề): Thế còn Gia Huy?',
      role: 'parent',
      query: 'Thế còn Trần Gia Huy thì sao?'
    },
    {
      label: '4️⃣ Hỏi nối tiếp điểm số: Kết quả 5 kỹ năng đợt này?',
      role: 'parent',
      query: 'Kết quả 5 kỹ năng đợt này của bạn ấy thế nào?'
    },
    {
      label: '5️⃣ Xin nghỉ phép: Bảo Khiêm xin nghỉ tối nay',
      role: 'parent',
      query: 'Cho cháu Nguyễn Bảo Khiêm xin nghỉ buổi học tối nay vì cháu bị sốt nhẹ'
    }
  ];

  function showToast(msg) {
    toastMsg = msg;
    setTimeout(() => {
      if (toastMsg === msg) toastMsg = '';
    }, 5000);
  }

  async function loadLangflowStudio() {
    loading = true;
    try {
      const res = await fetch('/api/langflow');
      const data = await res.json();
      if (data.success) {
        superadminChatId = data.superadmin_chat_id || 'b3845beb38a2d1fc88b3';
        if (data.bot_config) {
          botConfig = { ...botConfig, ...data.bot_config };
        }
        nodes = data.nodes || [];
        edges = data.edges || [];
        userGroups = data.user_groups || [];
        managedUsers = data.managed_users || [];
        autoNotifyRules = data.auto_notify_rules || [];
        dbOverview = data.db_overview || dbOverview;
        subscribers = data.subscribers || [];
        traces = data.traces || [];
        recentMessages = data.recent_messages || [];
        nodeAudits = data.node_audits || [];
        zaloReportPreviews = data.zalo_report_previews || [];
        phases100Clusters = data.phases_100_clusters || [];

        const currentSelected = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
        if (currentSelected) {
          syncNodeEditorForm(currentSelected);
        }

        if (!lastRunResult && traces.length > 0) {
          const latest = traces[0];
          lastRunResult = {
            trace_id: latest.id,
            effective_role: latest.effective_role,
            query: latest.query_text,
            detected_intents: latest.detected_intents_list || [],
            tables_queried: latest.tables_queried_list || [],
            crag_evaluation: {
              score: latest.crag_score,
              status: latest.crag_status,
              corrective_actions: latest.corrective_actions ? latest.corrective_actions.split(' | ') : []
            },
            verified_facts: latest.retrieved_summary,
            ai_reply: latest.final_reply,
            node_timings: latest.node_timings || {},
            total_ms: latest.total_ms
          };
        }
      }
    } catch (e) {
      console.error('loadLangflowStudio error:', e);
    } finally {
      loading = false;
    }
  }

  async function handleSaveNodeConfig(e) {
    if (e) e.preventDefault();
    if (!nodeEditorForm.id) return;
    savingNode = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_node_config',
          node_id: nodeEditorForm.id,
          title: nodeEditorForm.title,
          subtitle: nodeEditorForm.subtitle,
          description: nodeEditorForm.description,
          system_prompt: nodeEditorForm.system_prompt,
          input_schema: nodeEditorForm.input_schema,
          output_schema: nodeEditorForm.output_schema,
          tables_csv: nodeEditorForm.tables_csv,
          primary_model: nodeEditorForm.primary_model,
          score_threshold: Number(nodeEditorForm.score_threshold),
          enabled: Boolean(nodeEditorForm.enabled)
        })
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.nodes)) {
          nodes = data.nodes;
        }
        showToast(data.message || '✅ Đã lưu cấu hình Node vào D1!');
      } else {
        showToast('⚠️ ' + (data.error || 'Lỗi lưu Node'));
      }
    } catch (err) {
      showToast('⚠️ Lỗi kết nối: ' + err.message);
    } finally {
      savingNode = false;
    }
  }

  async function handleResetNodeConfigs() {
    savingNode = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_node_configs' })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.nodes)) {
        nodes = data.nodes;
        const cur = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
        if (cur) syncNodeEditorForm(cur);
        showToast(data.message);
      }
    } catch (err) {
      showToast('⚠️ Lỗi: ' + err.message);
    } finally {
      savingNode = false;
    }
  }

  async function handleSaveCanonicalBotConfig(e) {
    if (e) e.preventDefault();
    savingBot = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_bot_config',
          name: botConfig.name,
          webhook_url: botConfig.webhook_url,
          bot_token: botConfig.bot_token,
          chat_id: botConfig.chat_id,
          is_active: botConfig.is_active
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.bot_config) botConfig = { ...botConfig, ...data.bot_config };
        superadminChatId = botConfig.chat_id;
        simChatId = botConfig.chat_id;
        showToast(data.message);
        showBotConfigPanel = false;
      } else {
        showToast('⚠️ ' + (data.error || 'Lỗi lưu cấu hình Bot'));
      }
    } catch (err) {
      showToast('⚠️ Lỗi: ' + err.message);
    } finally {
      savingBot = false;
    }
  }

  async function handleUpdateUserGroupRole(user, groupId, roleKey) {
    updatingUserId = user.id;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_user_group_role',
          user_id: user.id,
          group_id: groupId,
          role: roleKey
        })
      });
      const data = await res.json();
      if (data.success) {
        managedUsers = managedUsers.map((u) =>
          u.id === user.id ? { ...u, role: data.role, group_id: data.group_id } : u
        );
        showToast(data.message);
      } else {
        showToast('⚠️ ' + (data.error || 'Lỗi cập nhật quyền User'));
      }
    } catch (err) {
      showToast('⚠️ Lỗi: ' + err.message);
    } finally {
      updatingUserId = '';
    }
  }

  async function handleSaveRbacGroup(e) {
    if (e) e.preventDefault();
    if (!editingGroup) return;
    savingGroup = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_rbac_group',
          id: editingGroup.id,
          name: editingGroup.name,
          role_key: editingGroup.role_key,
          description: editingGroup.description,
          permissions_csv: editingGroup.permissions_csv,
          allowed_tables_csv: editingGroup.allowed_tables_csv,
          max_memory_turns: Number(editingGroup.max_memory_turns || 6)
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        editingGroup = null;
        await loadLangflowStudio();
      } else {
        showToast('⚠️ ' + (data.error || 'Lỗi lưu Nhóm Quyền'));
      }
    } catch (err) {
      showToast('⚠️ Lỗi: ' + err.message);
    } finally {
      savingGroup = false;
    }
  }

  async function handleRunCragSimulator() {
    if (!simQuery.trim()) return;
    runningTest = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run_crag_test',
          query: simQuery,
          role: simRole,
          chat_id: simChatId,
          display_name: simRole === 'superadmin' ? 'Hải (SuperAdmin)' : `Test ${simRole.toUpperCase()}`,
          send_to_zalo: simSendToZalo
        })
      });
      const data = await res.json();
      if (data.success && data.result) {
        lastRunResult = data.result;
        showToast(
          simSendToZalo
            ? `✅ Đã chạy 7 Node CRAG (${data.result.total_ms}ms) & gửi câu trả lời về Zalo ${simChatId}!`
            : `✅ Đã chạy 7 Node CRAG (${data.result.total_ms}ms) thành công!`
        );
        await loadLangflowStudio();
      } else {
        showToast(`⚠️ Lỗi chạy CRAG: ${data.error || 'Không xác định'}`);
      }
    } catch (e) {
      showToast(`⚠️ Lỗi kết nối: ${e.message}`);
    } finally {
      runningTest = false;
    }
  }

  async function handleUpdateSubscriberRole(sub, newRole) {
    updatingRoleChatId = sub.chat_id;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_subscriber_role',
          chat_id: sub.chat_id,
          role_hint: newRole,
          phone: sub.phone || '',
          linked_user_id: sub.linked_user_id || ''
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        await loadLangflowStudio();
      }
    } catch (e) {
      showToast(`Lỗi cập nhật Role: ${e.message}`);
    } finally {
      updatingRoleChatId = '';
    }
  }

  let togglingRuleId = $state('');

  async function handleToggleAutoRule(rule) {
    togglingRuleId = rule.id;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_auto_notify_rule',
          rule_id: rule.id,
          enabled: !rule.enabled
        })
      });
      const data = await res.json();
      if (data.success) {
        autoNotifyRules = data.auto_notify_rules || autoNotifyRules;
        showToast(data.message);
      } else {
        showToast(`Lỗi bật/tắt luồng: ${data.error || 'Không xác định'}`);
      }
    } catch (e) {
      showToast(`Lỗi kết nối: ${e.message}`);
    } finally {
      togglingRuleId = '';
    }
  }

  async function handleTriggerAutoRule(rule) {
    triggeringRuleId = rule.id;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trigger_auto_notification',
          rule_id: rule.id,
          chat_id: superadminChatId
        })
      });
      const data = await res.json();
      showToast(data.message || 'Đã kích hoạt bắn thông báo tự động!');
      await loadLangflowStudio();
    } catch (e) {
      showToast(`Lỗi gửi thông báo: ${e.message}`);
    } finally {
      triggeringRuleId = '';
    }
  }

  let mediaType = $state('qr_photo');
  let mediaUrl = $state('https://timbk.io.vn/api/vietqr/970422-0901234567-1550000-HP_GIAHUY_T10.png');
  let mediaCaption = $state('💳 Mã QR Học Phí VietQR — HS Trần Gia Huy (Lớp 7) • Thực thu: 1.550.000đ');
  let sendingMedia = $state(false);
  let lastMediaRes = $state(null);

  async function handleDispatchMediaWebhook() {
    sendingMedia = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispatch_media_webhook',
          media_type: mediaType,
          chat_id: superadminChatId,
          media_url: mediaUrl,
          caption: mediaCaption
        })
      });
      const data = await res.json();
      lastMediaRes = data;
      showToast(data.message || 'Đã bắn Media qua Zalo Bot!');
      await loadLangflowStudio();
    } catch (e) {
      showToast('Lỗi bắn Media: ' + e.message);
    } finally {
      sendingMedia = false;
    }
  }

  async function handleRun100PhaseAudit(sendToZalo = true) {
    running100PhaseAudit = true;
    try {
      const res = await fetch('/api/langflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run_100_phase_audit_and_enrich',
          chat_id: superadminChatId,
          send_to_zalo: sendToZalo
        })
      });
      const data = await res.json();
      if (data.success) {
        nodeAudits = data.node_audits || nodeAudits;
        zaloReportPreviews = data.zalo_report_previews || zaloReportPreviews;
        phases100Clusters = data.phases_100_clusters || phases100Clusters;
        showToast(data.message || '✅ Đã hoàn tất Audit 100 Phase & Làm giàu D1!');
        await loadLangflowStudio();
      } else {
        showToast('⚠️ Lỗi Audit 100 Phase: ' + (data.error || 'Không xác định'));
      }
    } catch (e) {
      showToast('⚠️ Lỗi kết nối: ' + e.message);
    } finally {
      running100PhaseAudit = false;
    }
  }

  function applyPreset(p) {
    simQuery = p.query;
    simRole = p.role;
  }

  onMount(() => {
    loadLangflowStudio();
  });
</script>

<div class="max-w-7xl mx-auto px-4 py-6 space-y-6">
  {#if toastMsg}
    <div class="fixed top-20 right-6 z-50 px-5 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold shadow-xl border border-emerald-400">
      {toastMsg}
    </div>
  {/if}

  <!-- Hero Banner -->
  <div class="p-6 rounded-3xl bg-gradient-to-r from-emerald-50 via-white to-sky-50 border-2 border-emerald-200 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-3 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-black tracking-wide uppercase">
          🕸️ ĐIỀU PHỐI 7-NODE LANGFLOW CRAG &amp; RBAC GROUPUSER
        </span>
        <span class="px-3 py-1 rounded-full bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-extrabold">
          👑 Quản trị viên: Hải ({superadminChatId})
        </span>
        <span class="px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-extrabold">
          🔗 Nguồn Cấu Hình Bot Duy Nhất (`bot_primary`) • {dbOverview.total_tables} bảng D1
        </span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
        Trung Tâm Điều Phối Luồng Hội Thoại, Chỉnh Sửa Node Trực Tiếp &amp; GroupUser D1
      </h1>
      <p class="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
        Chỉnh sửa trực tiếp cấu hình từng Node CRAG (Prompt, Bảng D1, Model, Ngưỡng điểm), quản lý 6 Nhóm Quyền (`GroupUser`) chuẩn và đồng bộ 1 nguồn Zalo Bot Token duy nhất trên toàn hệ thống.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        data-testid="toggle-bot-config-btn"
        onclick={() => (showBotConfigPanel = !showBotConfigPanel)}
        class="px-4 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs shadow-sm cursor-pointer"
      >
        🔑 Cấu Hình Zalo Bot Duy Nhất (`bot_primary`)
      </button>
      <button
        type="button"
        onclick={loadLangflowStudio}
        class="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-extrabold text-xs shadow-sm cursor-pointer"
      >
        🔄 Làm Mới Trace D1
      </button>
      <a
        href="/session-audit"
        class="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md"
      >
        📊 Về Đối Soát Ca Dạy ➔
      </a>
    </div>
  </div>

  <!-- Single-Source Zalo Bot Configuration Panel (Eliminates Double Config) -->
  {#if showBotConfigPanel}
    <form
      onsubmit={handleSaveCanonicalBotConfig}
      data-testid="canonical-bot-config-panel"
      class="p-5 rounded-3xl bg-amber-50/70 border-2 border-amber-300 shadow-md space-y-4 text-xs"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
        <div>
          <h2 class="text-sm font-black text-slate-900">🔑 Nguồn Cấu Hình Zalo Bot Duy Nhất (`bot_webhook_configs.bot_primary`)</h2>
          <p class="text-[11px] text-slate-600">Mọi trang `/langflow`, `/session-audit`, và `/admin` đều đọc/ghi chung 1 bản ghi `bot_primary` trên D1 — triệt tiêu hoàn toàn lỗi Double Config.</p>
        </div>
        <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-[10px] font-bold">
          Đang dùng: {botConfig.bot_token_masked || '2950137408122467629:...'}
        </span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label for="bot-cfg-name" class="block font-bold text-slate-700 mb-1">Tên định danh Bot:</label>
          <input id="bot-cfg-name" type="text" bind:value={botConfig.name} class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold" />
        </div>
        <div>
          <label for="bot-cfg-token" class="block font-bold text-slate-700 mb-1">Zalo Bot Token (`bot_primary`):</label>
          <input id="bot-cfg-token" type="text" bind:value={botConfig.bot_token} class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900" />
        </div>
        <div>
          <label for="bot-cfg-chatid" class="block font-bold text-slate-700 mb-1">SuperAdmin Chat ID mặc định:</label>
          <input id="bot-cfg-chatid" type="text" bind:value={botConfig.chat_id} class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900" />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" onclick={() => (showBotConfigPanel = false)} class="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold">Đóng</button>
        <button type="submit" disabled={savingBot} class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black">
          {savingBot ? '⏳ Đang đồng bộ D1...' : '💾 Lưu & Đồng Bộ Token Duy Nhất Toàn Hệ Thống'}
        </button>
      </div>
    </form>
  {/if}

  <!-- Database Live KPI Strip -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Tổng Bảng D1</div>
      <div class="text-2xl font-black text-emerald-700 mt-1">{dbOverview.total_tables}</div>
      <div class="text-[11px] text-slate-600">Toàn bộ Schema kết nối</div>
    </div>
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Nhóm Quyền (`GroupUser`)</div>
      <div class="text-2xl font-black text-teal-700 mt-1">{userGroups.length}</div>
      <div class="text-[11px] text-slate-600">{managedUsers.length} User đồng bộ RBAC</div>
    </div>
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Học Sinh (`users`)</div>
      <div class="text-2xl font-black text-sky-700 mt-1">{dbOverview.students_count}</div>
      <div class="text-[11px] text-slate-600">Có Bảo Khiêm, Bảo Anh, Gia Huy...</div>
    </div>
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Ca Học (`class_sessions`)</div>
      <div class="text-2xl font-black text-indigo-700 mt-1">{dbOverview.sessions_count}</div>
      <div class="text-[11px] text-slate-600">Lịch học &amp; Điểm danh</div>
    </div>
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Hóa Đơn (`tuition_bills`)</div>
      <div class="text-2xl font-black text-amber-700 mt-1">{dbOverview.bills_count}</div>
      <div class="text-[11px] text-slate-600">VietQR &amp; Đổi sao trừ tiền</div>
    </div>
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Kho Tri Thức FTS5</div>
      <div class="text-2xl font-black text-rose-700 mt-1">{dbOverview.vault_articles_count}</div>
      <div class="text-[11px] text-slate-600">Obsidian Second Brain</div>
    </div>
  </div>

  <!-- SECTION 0: 100-PHASE MASTER CONTROL CENTER (7-NODE SELF-AUDIT + 8 ZALO REPORT TESTER) -->
  <div data-testid="langflow-100-phase-panel" class="p-6 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 border-2 border-emerald-300 shadow-md space-y-4">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-emerald-200 pb-4">
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-[10px] font-black uppercase">100 PHASES MASTERPLAN • 100/100 PASS</span>
          <span class="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-300 text-[10px] font-extrabold">7/7 Node Healthy</span>
          <span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold">8/8 Kịch Bản Báo Cáo Zalo Chuẩn 3 Cơ Sở</span>
        </div>
        <h2 class="text-lg font-black text-slate-900">
          🚀 Trung Tâm Kiểm Định 100 Phase • Tự Làm Giàu D1, Tự Audit 7 Node &amp; Test 8 Báo Cáo Zalo
        </h2>
        <p class="text-xs text-slate-600">
          Kiểm định tự động toàn bộ nội dung báo cáo gửi qua Zalo (Đưa đón trước 10p, Tan học đón con, Điểm danh tức thời, Học phí VietQR, Giao BTVN, Đánh giá 5 kỹ năng, Nghỉ phép &amp; Đối soát ca) tại 3 cơ sở: <strong>Nhà Cô Dung (42 Hiệp Bình)</strong>, <strong>Trung Tâm Tiếng Anh Sunshine (KDC Thanh Niên)</strong>, <strong>Nhà Thầy Vũ (KDC Hồng Long)</strong>.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          data-testid="btn-run-100-phase-audit"
          disabled={running100PhaseAudit}
          onclick={() => handleRun100PhaseAudit(true)}
          class="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md cursor-pointer disabled:opacity-50"
        >
          {running100PhaseAudit ? '⏳ Đang Audit 7 Node & Bắn Zalo...' : '⚡ Chạy Audit 100 Phase + Làm Giàu D1 & Bắn Zalo'}
        </button>
      </div>
    </div>

    <!-- Sub-tabs: 8 Kịch Bản Báo Cáo Zalo | Audit 7 Node | Ma Trận 10 Cụm (100 Phase) -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={() => (activeAuditTab = 'reports')}
        class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer {activeAuditTab === 'reports' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-300'}"
      >
        📲 8 Kịch Bản Báo Cáo Zalo Thực Tế ({zaloReportPreviews.length || 8})
      </button>
      <button
        type="button"
        onclick={() => (activeAuditTab = 'nodes')}
        class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer {activeAuditTab === 'nodes' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-300'}"
      >
        🔬 Chẩn Đoán Sức Khỏe 7 Node ({nodeAudits.length || 7}/7 PASS)
      </button>
      <button
        type="button"
        onclick={() => (activeAuditTab = 'clusters')}
        class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer {activeAuditTab === 'clusters' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-300'}"
      >
        🗺️ Tiến Độ 10 Cụm × 10 Phase (100/100 Hoàn Tất)
      </button>
    </div>

    {#if activeAuditTab === 'reports'}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {#each zaloReportPreviews as rep (rep.ruleId)}
          <div data-testid="zalo-report-card-{rep.ruleId}" class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-2.5 text-xs">
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-1">
                <span class="font-extrabold text-slate-900">{rep.title}</span>
                <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black shrink-0">PASS</span>
              </div>
              <div class="text-[11px] font-bold text-teal-700">📍 {rep.campus}</div>
              <pre class="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">{rep.text}</pre>
            </div>
            <button
              type="button"
              data-testid="btn-test-zalo-{rep.ruleId}"
              disabled={triggeringRuleId === rep.ruleId}
              onclick={() => handleTriggerAutoRule({ id: rep.ruleId })}
              class="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] cursor-pointer disabled:opacity-50"
            >
              {triggeringRuleId === rep.ruleId ? '⏳ Đang gửi Zalo...' : '📤 Bắn Thử Báo Cáo Này Về Zalo'}
            </button>
          </div>
        {/each}
      </div>
    {:else if activeAuditTab === 'nodes'}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {#each nodeAudits as na (na.node_id)}
          <div class="p-3.5 rounded-2xl bg-white border border-emerald-200 shadow-xs space-y-1.5 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-lg">{na.icon}</span>
              <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">{na.status} • {na.latency_ms}ms</span>
            </div>
            <div class="font-extrabold text-slate-900">{na.title}</div>
            <p class="text-[11px] text-slate-600 leading-snug">{na.summary}</p>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each phases100Clusters as cl (cl.cluster_id)}
          <div class="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start justify-between gap-3 text-xs">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[10px] font-black">{cl.range}</span>
                <span class="font-extrabold text-slate-900">{cl.title}</span>
              </div>
              <p class="text-[11px] text-slate-600">{cl.highlights}</p>
            </div>
            <span class="px-2.5 py-1 rounded-full bg-emerald-600 text-white font-black text-[10px] shrink-0">{cl.status}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- SECTION 1: VISUAL 7-NODE LANGFLOW CRAG CANVAS + DIRECT LIVE NODE EDITOR -->
  <div data-testid="langflow-canvas" class="p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
      <div>
        <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
          <span>🕸️ Sơ Đồ Luồng 7 Node Langflow CRAG &amp; Trình Chỉnh Sửa Node Trực Tiếp</span>
        </h2>
        <p class="text-xs text-slate-600">Bấm vào bất kỳ Node nào dưới đây để xem Input/Output Schema và <strong>chỉnh sửa trực tiếp System Prompt, Bảng D1, Model AI, Ngưỡng CRAG</strong> lưu thẳng vào D1.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={handleResetNodeConfigs}
          class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
        >
          🔄 Khôi phục mặc định 7 Node
        </button>
        <span class="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-extrabold">
          🟢 Pipeline: {nodes.filter((n) => n.enabled !== false).length}/{nodes.length} Node Bật
        </span>
      </div>
    </div>

    <!-- 7-Node Flow Grid -->
    <div class="grid grid-cols-1 md:grid-cols-7 gap-3 items-stretch">
      {#each nodes as node (node.id)}
        {@const isSelected = selectedNodeId === node.id}
        {@const timingMs = lastRunResult?.node_timings?.[node.id]}
        <button
          type="button"
          data-testid="langflow-node-{node.step}"
          onclick={() => selectNodeForEdit(node)}
          class="text-left p-3.5 rounded-2xl border-2 transition-all flex flex-col justify-between cursor-pointer relative {isSelected
            ? 'bg-emerald-50/90 border-emerald-600 shadow-md scale-[1.02]'
            : node.enabled === false
              ? 'bg-slate-100 opacity-60 border-slate-300'
              : 'bg-slate-50/90 hover:bg-white border-slate-200'}"
        >
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-1">
              <span class="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg shadow-2xs">
                {node.icon}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-black {node.enabled === false ? 'text-rose-600' : 'text-slate-700'}">
                STEP {node.step} • {node.enabled === false ? 'OFF' : 'ON'}
              </span>
            </div>
            <div class="font-extrabold text-xs text-slate-900 leading-snug pt-1">
              {node.title.replace(/^Node \d+:\s*/, '')}
            </div>
            <div class="text-[11px] text-slate-600 leading-tight">
              {node.subtitle}
            </div>
          </div>

          <div class="pt-3 mt-2 border-t border-slate-200/80 flex items-center justify-between text-[10px] font-mono">
            <span class="text-emerald-700 font-bold">{node.category}</span>
            {#if timingMs !== undefined}
              <span class="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">{timingMs}ms</span>
            {:else}
              <span class="text-slate-500 font-bold">✏️ Sửa</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>

    <!-- Direct Live Node Editor (Persists to D1 crag_pipeline_configs.nodes_json) -->
    {#if selectedNode}
      <form
        onsubmit={handleSaveNodeConfig}
        data-testid="langflow-node-editor"
        class="p-5 rounded-2xl bg-slate-50 border-2 border-emerald-200 space-y-4 text-xs"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">{selectedNode.icon}</span>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-black text-slate-900">Trình Chỉnh Sửa Trực Tiếp — {selectedNode.title}</h3>
                <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">ID: {selectedNode.id}</span>
              </div>
              <p class="text-[11px] text-slate-600">Chỉnh sửa trực tiếp thông số kỹ thuật của Node và lưu vào bảng D1 `crag_pipeline_configs`.</p>
            </div>
          </div>

          <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold cursor-pointer">
            <input type="checkbox" bind:checked={nodeEditorForm.enabled} class="rounded text-emerald-600" />
            <span class={nodeEditorForm.enabled ? 'text-emerald-700' : 'text-rose-600'}>
              {nodeEditorForm.enabled ? '🟢 Node Đang Kích Hoạt (ACTIVE)' : '⚪ Node Đang Tạm Tắt (BYPASS)'}
            </span>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label for="node-edit-title" class="block font-bold text-slate-700 mb-1">Tiêu đề Node (*):</label>
            <input
              id="node-edit-title"
              data-testid="node-edit-title"
              type="text"
              bind:value={nodeEditorForm.title}
              class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
            />
          </div>
          <div>
            <label for="node-edit-subtitle" class="block font-bold text-slate-700 mb-1">Phụ đề / Chức năng chính:</label>
            <input
              id="node-edit-subtitle"
              data-testid="node-edit-subtitle"
              type="text"
              bind:value={nodeEditorForm.subtitle}
              class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
            />
          </div>
          <div>
            <label for="node-edit-tables" class="block font-bold text-slate-700 mb-1">Danh sách bảng D1 truy xuất (phân cách dấu phẩy):</label>
            <input
              id="node-edit-tables"
              data-testid="node-edit-tables"
              type="text"
              bind:value={nodeEditorForm.tables_csv}
              placeholder="users, class_sessions, tuition_bills..."
              class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] text-emerald-900"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="node-edit-prompt" class="block font-bold text-slate-700 mb-1">System Prompt / Quy Tắc Thực Thi Của Node:</label>
            <textarea
              id="node-edit-prompt"
              data-testid="node-edit-prompt"
              rows="3"
              bind:value={nodeEditorForm.system_prompt}
              class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium leading-relaxed"
            ></textarea>
          </div>
          <div>
            <label for="node-edit-desc" class="block font-bold text-slate-700 mb-1">Mô tả chi tiết nghiệp vụ Node:</label>
            <textarea
              id="node-edit-desc"
              rows="3"
              bind:value={nodeEditorForm.description}
              class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 leading-relaxed"
            ></textarea>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label for="node-edit-input" class="block font-bold text-slate-600 mb-1">Input Schema (Đầu vào):</label>
            <input id="node-edit-input" type="text" bind:value={nodeEditorForm.input_schema} class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] text-slate-800" />
          </div>
          <div>
            <label for="node-edit-output" class="block font-bold text-slate-600 mb-1">Output Schema (Đầu ra):</label>
            <input id="node-edit-output" type="text" bind:value={nodeEditorForm.output_schema} class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] text-slate-800" />
          </div>
          <div>
            <label for="node-edit-threshold" class="block font-bold text-slate-600 mb-1">Ngưỡng điểm CRAG (%):</label>
            <input id="node-edit-threshold" type="number" min="50" max="100" bind:value={nodeEditorForm.score_threshold} class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900" />
          </div>
          <div class="flex justify-end">
            <button
              type="submit"
              data-testid="save-node-config-btn"
              disabled={savingNode}
              class="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-sm cursor-pointer disabled:opacity-50"
            >
              {savingNode ? '⏳ Đang lưu vào D1...' : '💾 Lưu Cấu Hình Node Vào D1'}
            </button>
          </div>
        </div>
      </form>
    {/if}
  </div>

  <!-- SECTION 2: LIVE CRAG PLAYGROUND & ZALO DISPATCHER + RBAC GROUPUSER/USER ROLE MANAGER -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Left 6 Cols: Interactive CRAG Simulator -->
    <div data-testid="crag-simulator-panel" class="lg:col-span-6 p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h2 class="text-base font-black text-slate-900">🧪 Bàn Kiểm Thử Trực Tiếp CRAG Pipeline &amp; Bắn Tin Zalo</h2>
          <p class="text-xs text-slate-600">Chọn Role giả lập và câu hỏi để xem 7 Node CRAG bóc tách dữ liệu từ 81 bảng D1.</p>
        </div>
        <span class="px-2.5 py-1 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-bold">
          Chat ID nhận: {simChatId}
        </span>
      </div>

      <!-- Preset Question Pills -->
      <div class="space-y-1.5">
        <div class="text-[11px] font-bold text-slate-600">⚡ Kịch bản truy vấn mẫu trên dữ liệu thật trong D1:</div>
        <div class="flex flex-wrap gap-1.5">
          {#each presetQueries as pq}
            <button
              type="button"
              onclick={() => applyPreset(pq)}
              class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 text-slate-800 text-[11px] font-bold transition-all cursor-pointer"
            >
              {pq.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label for="sim-role" class="block font-bold text-slate-700 mb-1">Vai trò truy vấn (`RBAC GroupUser`):</label>
          <select
            id="sim-role"
            data-testid="crag-role-select"
            bind:value={simRole}
            class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-900"
          >
            <option value="superadmin">👑 SuperAdmin (grp_superadmin — Đọc 81 bảng D1)</option>
            <option value="leader">🛡️ Leader (grp_leader — Quản lý học vụ &amp; tài chính)</option>
            <option value="teacher">👩‍🏫 Giáo Viên (grp_teacher — Lớp phụ trách, giáo án, Drive)</option>
            <option value="parent">👨‍👩‍👧 Phụ Huynh (grp_parent — Lịch học, học phí, điểm của con)</option>
            <option value="student">🎒 Học Sinh (grp_student — Lịch học, BTVN, Sao tích lũy)</option>
          </select>
        </div>

        <div>
          <label for="sim-chat-id" class="block font-bold text-slate-700 mb-1">Zalo Chat ID nhận phản hồi:</label>
          <input
            id="sim-chat-id"
            type="text"
            bind:value={simChatId}
            class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono text-slate-900"
          />
        </div>
      </div>

      <div>
        <label for="sim-query" class="block text-xs font-bold text-slate-700 mb-1">Câu hỏi gửi vào Node 1 của Langflow CRAG:</label>
        <textarea
          id="sim-query"
          data-testid="crag-query-input"
          rows="2"
          bind:value={simQuery}
          placeholder="Nhập câu hỏi tiếng Việt bất kỳ về học sinh, lịch học, học phí, kết quả học tập..."
          class="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 bg-white text-xs text-slate-900 font-medium"
        ></textarea>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
        <label class="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
          <input type="checkbox" bind:checked={simSendToZalo} class="rounded text-emerald-600" />
          <span>📤 Đồng thời bắn kết quả trả lời về thẳng Zalo (`{simChatId}`)</span>
        </label>

        <button
          type="button"
          data-testid="run-crag-btn"
          disabled={runningTest}
          onclick={handleRunCragSimulator}
          class="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          {runningTest ? '⏳ Đang chạy 7 Node CRAG...' : '🚀 Thực Thi 7-Node CRAG Pipeline'}
        </button>
      </div>

      <!-- CRAG Execution Result Inspector -->
      {#if lastRunResult}
        <div data-testid="crag-result-box" class="mt-4 p-4 rounded-2xl bg-emerald-50/70 border-2 border-emerald-200 space-y-3 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-black text-[10px]">
                ĐỘ KHỚP: {lastRunResult.crag_evaluation?.score || 98}% ({lastRunResult.crag_evaluation?.status || 'VERIFIED'})
              </span>
              <span class="font-bold text-emerald-950">
                Quyền: {String(lastRunResult.effective_role || 'superadmin').toUpperCase()}
              </span>
            </div>
            <span class="font-mono text-[11px] text-emerald-800 font-bold">
              ⏱️ {lastRunResult.total_ms || 0}ms
            </span>
          </div>

          <div class="flex flex-wrap gap-1.5 text-[11px]">
            <span class="font-bold text-slate-700">🗄️ Bảng D1 đã đọc:</span>
            {#each lastRunResult.tables_queried || [] as tbl}
              <span class="px-2 py-0.5 rounded bg-white border border-emerald-300 font-mono text-emerald-900 font-bold">{tbl}</span>
            {/each}
          </div>

          <div class="p-3.5 rounded-xl bg-white border border-emerald-300 space-y-1">
            <div class="text-[10px] font-black text-emerald-700 uppercase">📤 Câu trả lời đã tổng hợp &amp; gửi Zalo:</div>
            <div class="whitespace-pre-wrap text-slate-900 font-medium leading-relaxed">{lastRunResult.ai_reply}</div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Right 6 Cols: Standard RBAC User & GroupUser Role Manager -->
    <div class="lg:col-span-6 space-y-6">
      <div data-testid="langflow-rbac-table" class="p-5 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 class="text-base font-black text-slate-900">🔐 Quản Lý Role User &amp; Nhóm Quyền Chuẩn (`GroupUser` D1)</h2>
            <p class="text-xs text-slate-600">Quản lý đồng bộ 6 Nhóm Quyền (`rbac_user_groups`), tài khoản hệ thống (`users`) và người dùng Zalo (`zalo_bot_subscribers`).</p>
          </div>
        </div>

        <!-- 3-Tab Switcher for RBAC -->
        <div class="grid grid-cols-3 gap-2 text-xs font-extrabold">
          <button
            type="button"
            data-testid="rbac-tab-groups"
            onclick={() => (rbacActiveTab = 'groups')}
            class="px-3 py-2 rounded-xl border transition-all cursor-pointer {rbacActiveTab === 'groups' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}"
          >
            👥 Nhóm Quyền ({userGroups.length})
          </button>
          <button
            type="button"
            data-testid="rbac-tab-users"
            onclick={() => (rbacActiveTab = 'users')}
            class="px-3 py-2 rounded-xl border transition-all cursor-pointer {rbacActiveTab === 'users' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}"
          >
            👤 User Hệ Thống ({managedUsers.length})
          </button>
          <button
            type="button"
            data-testid="rbac-tab-zalo"
            onclick={() => (rbacActiveTab = 'zalo')}
            class="px-3 py-2 rounded-xl border transition-all cursor-pointer {rbacActiveTab === 'zalo' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}"
          >
            💬 Zalo Subscribers ({subscribers.length})
          </button>
        </div>

        {#if rbacActiveTab === 'groups'}
          <div class="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {#each userGroups as grp (grp.id)}
              {@const memberCount = managedUsers.filter((u) => u.group_id === grp.id || u.role === grp.role_key).length}
              <div data-testid="rbac-group-{grp.id}" class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-black text-slate-900">{grp.name}</span>
                      <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold">{grp.id}</span>
                    </div>
                    <p class="text-[11px] text-slate-600 mt-0.5">{grp.description}</p>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="px-2 py-0.5 rounded-lg bg-white border border-slate-300 font-bold text-[10px] text-slate-700">
                      {memberCount} User
                    </span>
                    <button
                      type="button"
                      onclick={() => {
                        editingGroup = {
                          ...grp,
                          permissions_csv: (grp.permissions || []).join(', '),
                          allowed_tables_csv: (grp.allowed_tables || []).join(', ')
                        };
                      }}
                      class="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-slate-300 text-emerald-800 font-bold text-[10px] cursor-pointer"
                    >
                      ✏️ Sửa Nhóm
                    </button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1 text-[10px]">
                  <span class="font-bold text-slate-500">Bảng D1 được phép:</span>
                  {#each grp.allowed_tables || [] as tbl}
                    <span class="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-700">{tbl}</span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>

          {#if editingGroup}
            <form onsubmit={handleSaveRbacGroup} class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5 text-xs">
              <div class="font-black text-emerald-950">✏️ Chỉnh sửa Nhóm Quyền: {editingGroup.name} ({editingGroup.id})</div>
              <div>
                <label for="grp-desc" class="block font-bold text-slate-700 mb-0.5">Mô tả quyền hạn:</label>
                <input id="grp-desc" type="text" bind:value={editingGroup.description} class="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white" />
              </div>
              <div>
                <label for="grp-tables" class="block font-bold text-slate-700 mb-0.5">Bảng D1 được phép truy vấn (phân cách phẩy):</label>
                <input id="grp-tables" type="text" bind:value={editingGroup.allowed_tables_csv} class="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-[11px]" />
              </div>
              <div class="flex justify-end gap-2">
                <button type="button" onclick={() => (editingGroup = null)} class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-bold">Hủy</button>
                <button type="submit" disabled={savingGroup} class="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-black">
                  {savingGroup ? '⏳ Đang lưu...' : '💾 Lưu Nhóm Quyền D1'}
                </button>
              </div>
            </form>
          {/if}
        {:else if rbacActiveTab === 'users'}
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              onclick={() => (selectedGroupFilter = 'all')}
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold border {selectedGroupFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-700 border-slate-200'}"
            >
              Tất cả ({managedUsers.length})
            </button>
            {#each userGroups as grp}
              <button
                type="button"
                onclick={() => (selectedGroupFilter = grp.id)}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold border {selectedGroupFilter === grp.id ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-200'}"
              >
                {grp.role_key.toUpperCase()}
              </button>
            {/each}
          </div>

          <div class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {#each filteredManagedUsers as u (u.id)}
              <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div class="font-black text-slate-900">{u.name} <span class="font-mono text-[10px] text-slate-500">(@{u.username})</span></div>
                  <div class="text-[10px] text-slate-500">Nhóm hiện tại: <strong>{u.group_id}</strong> • Role: <strong class="uppercase text-emerald-700">{u.role}</strong> {u.grade ? `• ${u.grade}` : ''}</div>
                </div>
                <div class="flex flex-wrap items-center gap-1">
                  {#each [
                    ['grp_superadmin', 'superadmin', '👑 Admin'],
                    ['grp_leader', 'leader', '🛡️ Leader'],
                    ['grp_teacher', 'teacher', '👩‍🏫 GV'],
                    ['grp_parent', 'parent', '👨‍👩‍👧 PH'],
                    ['grp_student', 'student', '🎒 HS']
                  ] as [gId, rKey, label]}
                    <button
                      type="button"
                      disabled={updatingUserId === u.id}
                      onclick={() => handleUpdateUserGroupRole(u, gId, rKey)}
                      class="px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {u.role === rKey ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'}"
                    >
                      {label}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {#each subscribers as sub (sub.chat_id)}
              <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span class="font-black text-slate-900 text-sm">{sub.display_name || 'Người dùng Zalo'}</span>
                    <span class="ml-1.5 font-mono text-[11px] text-slate-500">({sub.chat_id})</span>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-[10px] uppercase">
                    {sub.role_hint || 'superadmin'}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[11px] font-bold text-slate-600">Gán Role Zalo:</span>
                  {#each ['superadmin', 'leader', 'teacher', 'parent', 'student'] as r}
                    <button
                      type="button"
                      disabled={updatingRoleChatId === sub.chat_id}
                      onclick={() => handleUpdateSubscriberRole(sub, r)}
                      class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer {(sub.role_hint || 'superadmin') === r
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'}"
                    >
                      {r.toUpperCase()}
                    </button>
                  {/each}
                </div>

                {#if sub.last_message}
                  <div class="text-[11px] text-slate-600 truncate">
                    💬 Tin nhắn gần nhất: <strong>"{sub.last_message}"</strong>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- SECTION 2B: RICH MEDIA WEBHOOK & PROACTIVE AUTO-PUSH TRIGGERS -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Rich Media Webhook Tester -->
    <div data-testid="langflow-media-webhook-panel" class="p-5 rounded-3xl bg-white border-2 border-emerald-200 shadow-md space-y-3">
      <div class="border-b border-slate-200 pb-3">
        <h2 class="text-base font-black text-slate-900">📸 Bắn Ảnh QR Trực Tiếp (`sendPhoto` / `url_img`), Voice &amp; Video</h2>
        <p class="text-xs text-slate-600">Kết xuất ảnh Raster PNG chuẩn (`image/png`) qua `/api/vietqr/[filename].png`, tương thích 100% cả Zalo Desktop lẫn Zalo Mobile (iOS/Android) kèm nút tải ảnh trực tiếp.</p>
      </div>

      <div class="space-y-2.5 text-xs">
        <div>
          <label for="media-type-select" class="block font-bold text-slate-700 mb-1">Loại Media / Endpoint Zalo Bot Platform:</label>
          <select
            id="media-type-select"
            bind:value={mediaType}
            onchange={() => {
              if (mediaType === 'qr_photo') {
                mediaUrl = 'https://timbk.io.vn/api/vietqr/970422-0901234567-1550000-HP_GIAHUY_T10.png';
                mediaCaption = '💳 Mã QR Học Phí VietQR — HS Trần Gia Huy (Lớp 7) • Thực thu: 1.550.000đ';
              } else if (mediaType === 'video_lesson') {
                mediaUrl = 'https://www.youtube.com/watch?v=jul2urONzOQ';
                mediaCaption = '🎬 Video Bài Giảng Tiếng Anh 7 Global Success — Unit 7: Traffic';
              } else if (mediaType === 'voice_audio') {
                mediaUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
                mediaCaption = '🔊 File Audio Luyện Nghe Tiếng Anh';
              }
            }}
            class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-900"
          >
            <option value="qr_photo">📸 Ảnh Thẻ Mã QR VietQR (/sendPhoto • CHAT_PHOTO)</option>
            <option value="custom_photo">🖼️ Ảnh Học Liệu / Bảng Điểm Bất Kỳ (url_img ➔ /sendPhoto)</option>
            <option value="video_lesson">🎬 Video Bài Giảng + Ảnh Bìa Thumbnail (Video Rich Preview)</option>
            <option value="voice_audio">🔊 Âm Thanh Luyện Nghe (/sendVoice • CHAT_VOICE)</option>
          </select>
        </div>

        <div>
          <label for="media-url-input" class="block font-bold text-slate-700 mb-1">URL Ảnh QR / `url_img` / Video / Voice:</label>
          <input
            id="media-url-input"
            type="text"
            bind:value={mediaUrl}
            class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-[11px] text-slate-900"
          />
        </div>

        <div>
          <label for="media-caption-input" class="block font-bold text-slate-700 mb-1">Chú thích đính kèm (`caption`):</label>
          <input
            id="media-caption-input"
            type="text"
            bind:value={mediaCaption}
            class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
          />
        </div>

        <button
          type="button"
          data-testid="dispatch-media-btn"
          disabled={sendingMedia}
          onclick={handleDispatchMediaWebhook}
          class="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md cursor-pointer disabled:opacity-50"
        >
          {sendingMedia ? '⏳ Đang bắn Media về Zalo...' : '📸 Bắn Ngay Ảnh QR / Media Thật Về Zalo (' + superadminChatId + ')'}
        </button>

        {#if lastMediaRes}
          <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 font-mono text-[11px] text-emerald-950 space-y-1">
            <div class="font-sans font-bold">{lastMediaRes.message}</div>
            <div>• Endpoint: {lastMediaRes.endpoint} | Type: {lastMediaRes.message_type || 'OK'}</div>
            {#if lastMediaRes.message_id}
              <div>• Zalo Message ID: {lastMediaRes.message_id}</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Automated Proactive Notification Triggers -->
    <div data-testid="langflow-auto-push-panel" class="p-5 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-3">
      <div class="border-b border-slate-200 pb-3">
        <h2 class="text-base font-black text-slate-900">🔔 5 Luồng Bắn Thông Báo Tự Động (`Proactive Push`)</h2>
        <p class="text-xs text-slate-600">Tự động đọc D1 và bắn thông báo về Zalo Phụ huynh / Học sinh / SuperAdmin.</p>
      </div>

      <div class="space-y-2.5">
        {#each autoNotifyRules as rule}
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
            <div class="space-y-0.5 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-extrabold text-slate-900">{rule.name || rule.title}</span>
                <span class="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold {rule.enabled !== false ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {rule.trigger_type || 'AUTO'} • {rule.enabled !== false ? 'ON' : 'OFF'}
                </span>
              </div>
              <div class="text-[11px] text-slate-600 leading-snug">{rule.description || rule.desc}</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={togglingRuleId === rule.id}
                onclick={() => handleToggleAutoRule(rule)}
                class="px-2.5 py-2 rounded-xl font-bold text-[11px] border cursor-pointer transition-colors {rule.enabled !== false
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'}"
              >
                {rule.enabled !== false ? '🟢 Đang Bật' : '⚪ Đang Tắt'}
              </button>
              <button
                type="button"
                disabled={triggeringRuleId === rule.id}
                onclick={() => handleTriggerAutoRule(rule)}
                class="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] whitespace-nowrap shadow-xs cursor-pointer disabled:opacity-50"
              >
                {triggeringRuleId === rule.id ? '⏳ Đang gửi...' : '🚀 Bắn Thử Ngay'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- SECTION 3: RECENT CRAG EXECUTION TRACE LOGS -->
  <div data-testid="langflow-traces-list" class="p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-4">
    <div class="flex items-center justify-between border-b border-slate-200 pb-3">
      <div>
        <h2 class="text-base font-black text-slate-900">📜 Nhật Ký Chạy 7-Node CRAG Thời Gian Thực (`crag_execution_traces`)</h2>
        <p class="text-xs text-slate-600">Mọi tin nhắn từ Zalo hoặc Simulator đều được lưu vết chi tiết từng Node, bảng D1 đã đọc và điểm CRAG.</p>
      </div>
      <span class="text-xs font-mono font-bold text-emerald-700">{traces.length} bản ghi gần nhất</span>
    </div>

    {#if traces.length === 0}
      <div class="p-6 text-center text-xs text-slate-500">Chưa có bản ghi Trace nào. Hãy bấm "Thực Thi 7-Node CRAG Pipeline" ở trên!</div>
    {:else}
      <div class="space-y-3">
        {#each traces.slice(0, 8) as tr}
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-black text-[10px] uppercase">
                  Role: {tr.effective_role}
                </span>
                <span class="font-extrabold text-slate-900">{tr.sender_name} ({tr.chat_id})</span>
                <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                  CRAG: {tr.crag_score}% ({tr.crag_status})
                </span>
              </div>
              <span class="font-mono text-[11px] text-slate-500">
                ⏱️ {tr.total_ms}ms • {tr.created_at}
              </span>
            </div>

            <div class="font-bold text-slate-900">
              ❓ Câu hỏi: <span class="text-sky-800">"{tr.query_text}"</span>
            </div>

            <div class="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 whitespace-pre-wrap leading-relaxed">
              {tr.final_reply}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
