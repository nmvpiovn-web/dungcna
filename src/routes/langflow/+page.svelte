<svelte:head>
  <title>Langflow CRAG Studio • Bộ Não AI Đa Tác Tử &amp; Phân Quyền D1 • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';

  let loading = $state(true);
  let runningTest = $state(false);
  let triggeringRuleId = $state('');
  let updatingRoleChatId = $state('');
  let toastMsg = $state('');

  let superadminChatId = $state('b3845beb38a2d1fc88b3');
  let nodes = $state([]);
  let edges = $state([]);
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

  // Active Node in Canvas Inspector
  let selectedNodeId = $state('node_crag_grader');
  let selectedNode = $derived(nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null);

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
        nodes = data.nodes || [];
        edges = data.edges || [];
        autoNotifyRules = data.auto_notify_rules || [];
        dbOverview = data.db_overview || dbOverview;
        subscribers = data.subscribers || [];
        traces = data.traces || [];
        recentMessages = data.recent_messages || [];
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
  let mediaUrl = $state('https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=1550000&addInfo=HP_GIAHUY_T10&accountName=NGUYEN%20MINH%20VU');
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
          🕸️ ĐIỀU PHỐI LUỒNG DỮ LIỆU &amp; HỘI THOẠI ZALO
        </span>
        <span class="px-3 py-1 rounded-full bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-extrabold">
          👑 Quản trị viên: Hải ({superadminChatId})
        </span>
        <span class="px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-extrabold">
          🔗 Giữ mạch hội thoại đa lượt • {dbOverview.total_tables} bảng dữ liệu
        </span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
        Trung Tâm Điều Phối Luồng Hội Thoại &amp; Dữ Liệu Zalo
      </h1>
      <p class="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
        Tự động ghi nhớ học sinh và chủ đề đang trao đổi giữa các tin nhắn liên tiếp, trả lời ngắn gọn đúng trọng tâm như người thật nhắn Zalo và gửi trực tiếp thẻ ảnh QR học phí.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
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

  <!-- Database Live KPI Strip -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Tổng Bảng D1</div>
      <div class="text-2xl font-black text-emerald-700 mt-1">{dbOverview.total_tables}</div>
      <div class="text-[11px] text-slate-600">Toàn bộ Schema kết nối</div>
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
      <div class="text-[11px] font-bold text-slate-500 uppercase">Phiếu Đánh Giá 5 Kỹ Năng</div>
      <div class="text-2xl font-black text-purple-700 mt-1">{dbOverview.evaluations_count}</div>
      <div class="text-[11px] text-slate-600">Nghe • Nói • Đọc • Viết • Ngữ pháp</div>
    </div>
    <div class="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
      <div class="text-[11px] font-bold text-slate-500 uppercase">Kho Tri Thức FTS5</div>
      <div class="text-2xl font-black text-rose-700 mt-1">{dbOverview.vault_articles_count}</div>
      <div class="text-[11px] text-slate-600">Obsidian Second Brain</div>
    </div>
  </div>

  <!-- SECTION 1: VISUAL 7-NODE LANGFLOW CRAG CANVAS -->
  <div data-testid="langflow-canvas" class="p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
      <div>
        <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
          <span>🕸️ Sơ Đồ Luồng 7 Node Langflow CRAG (Visual Pipeline Canvas)</span>
        </h2>
        <p class="text-xs text-slate-600">Bấm vào từng Node để kiểm tra cấu hình RBAC, danh sách bảng D1 truy xuất và thời gian xử lý thực tế (ms).</p>
      </div>
      <span class="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-extrabold">
        🟢 Trạng thái Pipeline: ACTIVE 24/7
      </span>
    </div>

    <!-- 7-Node Flow Grid -->
    <div class="grid grid-cols-1 md:grid-cols-7 gap-3 items-stretch">
      {#each nodes as node, idx}
        {@const isSelected = selectedNodeId === node.id}
        {@const timingMs = lastRunResult?.node_timings?.[node.id]}
        <button
          type="button"
          data-testid="langflow-node-{node.step}"
          onclick={() => (selectedNodeId = node.id)}
          class="text-left p-3.5 rounded-2xl border-2 transition-all flex flex-col justify-between cursor-pointer relative {isSelected
            ? 'bg-emerald-50/90 border-emerald-600 shadow-md scale-[1.02]'
            : 'bg-slate-50/90 hover:bg-white border-slate-200'}"
        >
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-1">
              <span class="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg shadow-2xs">
                {node.icon}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-black text-slate-700">
                STEP {node.step}
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
              <span class="text-slate-400">Ready</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>

    <!-- Selected Node Inspector -->
    {#if selectedNode}
      <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
        <div class="lg:col-span-2 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xl">{selectedNode.icon}</span>
            <h3 class="text-sm font-black text-slate-900">{selectedNode.title} — {selectedNode.subtitle}</h3>
          </div>
          <p class="text-slate-700 leading-relaxed">{selectedNode.description}</p>
        </div>
        <div class="p-3 rounded-xl bg-white border border-slate-200 font-mono text-[11px] text-slate-800 overflow-x-auto">
          <div class="font-sans font-bold text-slate-500 uppercase text-[10px] mb-1">Cấu hình Node (JSON Config):</div>
          <pre class="whitespace-pre-wrap">{JSON.stringify(selectedNode.config, null, 2)}</pre>
        </div>
      </div>
    {/if}
  </div>

  <!-- SECTION 2: LIVE CRAG PLAYGROUND & ZALO DISPATCHER + RBAC ROLE MANAGER -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Left 7 Cols: Interactive CRAG Simulator -->
    <div data-testid="crag-simulator-panel" class="lg:col-span-7 p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-4">
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
          <label for="sim-role" class="block font-bold text-slate-700 mb-1">Vai trò truy vấn (`RBAC Role Sandbox`):</label>
          <select
            id="sim-role"
            data-testid="crag-role-select"
            bind:value={simRole}
            class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-900"
          >
            <option value="superadmin">👑 SuperAdmin (Hải / Cô Dung — Đọc toàn bộ 81 bảng D1)</option>
            <option value="parent">👨‍👩‍👧 Phụ Huynh (Chỉ xem lịch học, học phí, điểm của con)</option>
            <option value="teacher">👩‍🏫 Giáo Viên (Xem lớp phụ trách, điểm danh, giáo án, Drive)</option>
            <option value="student">🎒 Học Sinh (Xem lịch học, BTVN, Sao tích lũy, tra từ vựng)</option>
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
              {#if lastRunResult.session_continuity?.carried_over_student || lastRunResult.session_continuity?.carried_over_intent}
                <span class="px-2.5 py-0.5 rounded-full bg-sky-600 text-white font-bold text-[10px]">
                  🔗 Đã nối mạch từ câu trước
                </span>
              {/if}
            </div>
            <span class="font-mono text-[11px] text-emerald-800 font-bold">
              ⏱️ {lastRunResult.total_ms || 0}ms
            </span>
          </div>

          {#if lastRunResult.crag_evaluation?.corrective_actions?.length}
            <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11px]">
              <strong>🔗 Xử lý ngữ cảnh &amp; nối mạch:</strong>
              {lastRunResult.crag_evaluation.corrective_actions.join(' • ')}
            </div>
          {/if}

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

          {#if lastRunResult.verified_facts}
            <details class="text-[11px] text-slate-700">
              <summary class="font-bold cursor-pointer text-emerald-800">🔍 Xem toàn bộ Dữ liệu Thật trích xuất từ D1 (Verified SQL Context)</summary>
              <pre class="mt-2 p-3 rounded-xl bg-white border border-slate-200 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">{lastRunResult.verified_facts}</pre>
            </details>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Right 5 Cols: Subscriber Role Manager & Auto-Push Notification Rules -->
    <div class="lg:col-span-5 space-y-6">
      <!-- Subscriber Role Manager -->
      <div data-testid="langflow-rbac-table" class="p-5 rounded-3xl bg-white border-2 border-slate-200 shadow-md space-y-3">
        <div class="border-b border-slate-200 pb-3">
          <h2 class="text-base font-black text-slate-900">🔐 Quản Lý Role Người Dùng Zalo (`zalo_bot_subscribers`)</h2>
          <p class="text-xs text-slate-600">Đổi Role trực tiếp tại đây hoặc nhắn <code class="font-mono text-emerald-700">/role parent|student|teacher|superadmin</code> trên Zalo.</p>
        </div>

        <div class="space-y-2.5">
          {#each subscribers as sub}
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

              <div class="flex items-center gap-2">
                <span class="text-[11px] font-bold text-slate-600">Gán Role:</span>
                {#each ['superadmin', 'parent', 'teacher', 'student'] as r}
                  <button
                    type="button"
                    disabled={updatingRoleChatId === sub.chat_id}
                    onclick={() => handleUpdateSubscriberRole(sub, r)}
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer {(sub.role_hint || 'superadmin') === r
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
      </div>


      <!-- Rich Media Webhook Tester (sendPhoto / url_img / sendVoice / Video) -->
      <div data-testid="langflow-media-webhook-panel" class="p-5 rounded-3xl bg-white border-2 border-emerald-200 shadow-md space-y-3">
        <div class="border-b border-slate-200 pb-3">
          <h2 class="text-base font-black text-slate-900">📸 Bắn Ảnh QR Trực Tiếp (`sendPhoto` / `url_img`), Voice &amp; Video</h2>
          <p class="text-xs text-slate-600">Tự động qua proxy PNG chuẩn Zalo (`wsrv.nl`) để khắc phục lỗi chặn `Java/17` (424) của `img.vietqr.io`, gửi thẳng ảnh thẻ QR thật (`CHAT_PHOTO`) vào khung chat Zalo.</p>
        </div>

        <div class="space-y-2.5 text-xs">
          <div>
            <label for="media-type-select" class="block font-bold text-slate-700 mb-1">Loại Media / Endpoint Zalo Bot Platform:</label>
            <select
              id="media-type-select"
              bind:value={mediaType}
              onchange={() => {
                if (mediaType === 'qr_photo') {
                  mediaUrl = 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=1550000&addInfo=HP_GIAHUY_T10&accountName=NGUYEN%20MINH%20VU';
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
              <div class="space-y-0.5">
                <div class="font-extrabold text-slate-900">{rule.title}</div>
                <div class="text-[11px] text-slate-600 leading-snug">{rule.desc}</div>
              </div>
              <button
                type="button"
                disabled={triggeringRuleId === rule.id}
                onclick={() => handleTriggerAutoRule(rule)}
                class="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] whitespace-nowrap shadow-xs cursor-pointer disabled:opacity-50"
              >
                {triggeringRuleId === rule.id ? '⏳ Đang gửi...' : '🚀 Bắn Thử Ngay'}
              </button>
            </div>
          {/each}
        </div>
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

            {#if tr.corrective_actions}
              <div class="text-[11px] text-amber-900 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200">
                ⚖️ <strong>Hành động tự sửa CRAG:</strong> {tr.corrective_actions}
              </div>
            {/if}

            <div class="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 whitespace-pre-wrap leading-relaxed">
              {tr.final_reply}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
