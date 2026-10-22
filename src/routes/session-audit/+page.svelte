<svelte:head>
  <title>Đối Soát Chất Lượng Ca Dạy &amp; Hồi Quy Học Liệu • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getAuthToken, verifySessionWithServer, isSuperAdmin } from '$lib/unifiedStore';

  let currentUser = $state(null);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state('');
  let toastMsg = $state('');

  let summary = $state({
    total_sessions: 0,
    roll_call_complete_count: 0,
    roll_call_incomplete_count: 0,
    roll_call_unmarked_count: 0,
    sessions_with_late_count: 0,
    sessions_with_absent_count: 0,
    sessions_with_material_count: 0,
    avg_overall_suitability_pct: 0
  });

  let sessionReports = $state([]);
  let catalogs = $state({
    vault_articles: [],
    drive_files: [],
    quizzes: [],
    bot_configs: []
  });

  // Filters
  let searchQuery = $state('');
  let attendanceStatusFilter = $state('all'); // 'all' | 'complete' | 'incomplete' | 'unmarked' | 'has_late' | 'has_absent'
  let materialFilter = $state('all'); // 'all' | 'has_material' | 'missing_material' | 'has_vault' | 'has_drive' | 'has_quiz'
  let suitabilityFilter = $state('all'); // 'all' | 'excellent' | 'good' | 'needs_improvement'

  // Selected Session for Deep Audit & Editing
  let selectedSessionId = $state('');
  let activeInspectorTab = $state('materials'); // 'materials' | 'summary' | 'interactions' | 'all'
  let editForm = $state({
    session_id: '',
    vault_article_id: '',
    vault_article_title: '',
    drive_file_id: '',
    drive_file_name: '',
    drive_file_url: '',
    lesson_plan_content: '',
    manual_suitability_pct: 85,
    effectiveness_rating: 'good',
    effectiveness_notes: '',
    parent_interaction_notes: '',
    internal_interaction_notes: '',
    roadmap_recommendation: '',
    audit_status: 'reviewed',
    notify_internal: true
  });

  // Export Dossier Modal
  let showExportModal = $state(false);
  let exportedMarkdown = $state('');

  // Bot Webhook Config Modal (Single Source of Truth: D1 bot_webhook_configs id='bot_primary')
  let showBotConfigModal = $state(false);
  let botForm = $state({
    id: 'bot_primary',
    provider: 'zalo_bot_platform',
    name: 'Zalo Bot Platform (@bot.KTncTtfA • Lớp Tiếng Anh Cô Dung)',
    webhook_url: 'https://timbk-zalo-webhook.tienganh7-sveltekit.workers.dev',
    bot_token: '',
    chat_id: 'b3845beb38a2d1fc88b3',
    deepseek_api_key: '',
    ai_enabled: true,
    is_active: true
  });
  let savingBot = $state(false);
  let verifyingBot = $state(false);
  let botVerification = $state(null);

  let selectedReport = $derived(
    sessionReports.find(r => r.session.id === selectedSessionId) || sessionReports[0] || null
  );

  let filteredReports = $derived.by(() => {
    return sessionReports.filter(item => {
      const s = item.session;
      const m = item.metrics;
      const mat = item.materials;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${s.class_name} ${s.subject_topic} ${s.teacher_name} ${mat.vault_article_title} ${mat.drive_file_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (attendanceStatusFilter === 'complete' && m.roll_call_status !== 'complete') return false;
      if (attendanceStatusFilter === 'incomplete' && m.roll_call_status !== 'incomplete') return false;
      if (attendanceStatusFilter === 'unmarked' && m.roll_call_status !== 'unmarked') return false;
      if (attendanceStatusFilter === 'has_late' && !(m.late_count > 0)) return false;
      if (attendanceStatusFilter === 'has_absent' && !(m.total_absent_count > 0)) return false;

      if (materialFilter === 'has_material' && !mat.has_material) return false;
      if (materialFilter === 'missing_material' && mat.has_material) return false;
      if (materialFilter === 'has_vault' && !mat.vault_article_id && !mat.vault_article_title) return false;
      if (materialFilter === 'has_drive' && !mat.drive_file_id && !mat.drive_file_name) return false;
      if (materialFilter === 'has_quiz' && (!mat.linked_quizzes || mat.linked_quizzes.length === 0)) return false;

      if (suitabilityFilter === 'excellent' && m.overall_suitability_pct < 85) return false;
      if (suitabilityFilter === 'good' && (m.overall_suitability_pct < 70 || m.overall_suitability_pct >= 85)) return false;
      if (suitabilityFilter === 'needs_improvement' && m.overall_suitability_pct >= 70) return false;

      return true;
    });
  });

  function showToast(msg) {
    toastMsg = msg;
    setTimeout(() => {
      if (toastMsg === msg) toastMsg = '';
    }, 4500);
  }

  function populateFormFromReport(rep) {
    if (!rep) return;
    selectedSessionId = rep.session.id;
    editForm = {
      session_id: rep.session.id,
      vault_article_id: rep.materials.vault_article_id || '',
      vault_article_title: rep.materials.vault_article_title || '',
      drive_file_id: rep.materials.drive_file_id || '',
      drive_file_name: rep.materials.drive_file_name || '',
      drive_file_url: rep.materials.drive_file_url || '',
      lesson_plan_content: rep.materials.lesson_plan_content || '',
      manual_suitability_pct: rep.metrics.manual_suitability_pct ?? rep.metrics.overall_suitability_pct ?? 85,
      effectiveness_rating: rep.dossier.effectiveness_evaluation.rating || 'good',
      effectiveness_notes: rep.dossier.effectiveness_evaluation.notes || '',
      parent_interaction_notes: rep.dossier.parent_interaction.notes || '',
      internal_interaction_notes: rep.dossier.internal_interaction_and_roadmap.internal_notes || '',
      roadmap_recommendation: rep.dossier.internal_interaction_and_roadmap.roadmap_recommendation || '',
      audit_status: rep.dossier.internal_interaction_and_roadmap.audit_status || 'reviewed',
      notify_internal: true
    };
  }

  function handleSelectVaultArticle(e) {
    const vid = e.currentTarget.value;
    editForm.vault_article_id = vid;
    const found = catalogs.vault_articles.find(v => v.id === vid);
    if (found) {
      editForm.vault_article_title = found.title;
      if (!editForm.lesson_plan_content.includes(found.title)) {
        editForm.lesson_plan_content = `[Kho Tri Thức: ${found.title}]\n${editForm.lesson_plan_content}`.trim();
      }
    }
  }

  function handleSelectDriveFile(e) {
    const fid = e.currentTarget.value;
    editForm.drive_file_id = fid;
    const found = catalogs.drive_files.find(f => f.id === fid);
    if (found) {
      editForm.drive_file_name = found.title_vi || found.name;
      editForm.drive_file_url = found.webViewLink || '';
    }
  }

  async function loadAuditData() {
    loading = true;
    errorMsg = '';
    try {
      currentUser = getCurrentUser();
      const token = getAuthToken();
      if (!currentUser && token) {
        await verifySessionWithServer();
        currentUser = getCurrentUser();
      }

      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/session-audit', {
        headers,
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Không thể tải dữ liệu đối soát (HTTP ${res.status})`);
      }

      summary = data.summary || summary;
      sessionReports = data.sessions || [];
      if (data.catalogs) {
        catalogs = {
          vault_articles: data.catalogs.vault_articles || [],
          drive_files: data.catalogs.drive_files || [],
          quizzes: data.catalogs.quizzes || [],
          bot_configs: data.catalogs.bot_configs || []
        };
        if (catalogs.bot_configs.length > 0) {
          const cfg = catalogs.bot_configs[0];
          botForm = {
            id: cfg.id || 'bot_primary',
            provider: cfg.provider || 'zalo_webhook',
            name: cfg.name || 'Cổng Bot Zalo / Telegram Trung Tâm Cô Dung',
            webhook_url: cfg.webhook_url || '',
            bot_token: '',
            chat_id: cfg.chat_id || '',
            is_active: Boolean(cfg.is_active)
          };
        }
      }

      const requestedId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('session_id')
        : null;

      if (requestedId && sessionReports.some(r => r.session.id === requestedId)) {
        populateFormFromReport(sessionReports.find(r => r.session.id === requestedId));
      } else if (selectedSessionId && sessionReports.some(r => r.session.id === selectedSessionId)) {
        populateFormFromReport(sessionReports.find(r => r.session.id === selectedSessionId));
      } else if (sessionReports.length > 0) {
        populateFormFromReport(sessionReports[0]);
      }
    } catch (err) {
      errorMsg = err.message || 'Lỗi kết nối máy chủ';
    } finally {
      loading = false;
    }
  }

  async function handleSaveAudit() {
    if (!editForm.session_id) return;
    saving = true;
    errorMsg = '';
    try {
      const token = getAuthToken();
      const res = await fetch('/api/session-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_audit',
          ...editForm
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi lưu đối soát ca dạy');
      }
      showToast(`✅ ${data.message}`);
      await loadAuditData();
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  function buildSessionDossierMarkdown(rep) {
    if (!rep) return '';
    const s = rep.session;
    const m = rep.metrics;
    const d = rep.dossier;
    const mat = rep.materials;

    const hwLines = mat.linked_homeworks.length > 0
      ? mat.linked_homeworks.map(h => `  - **${h.title}** (${h.skill_type}): Đã nộp ${h.submissions_count}/${h.expected_count} HS (${h.submission_rate_pct}%) • Điểm TB: ${h.avg_score !== null ? h.avg_score + '/' + h.max_score : 'Chưa chấm'}`).join('\n')
      : '  - Chưa có bài tập về nhà riêng cho ca này.';

    const quizLines = mat.linked_quizzes.length > 0
      ? mat.linked_quizzes.map(q => `  - **${q.title}** (${q.time_limit_minutes} phút): ${q.attempts_count} lượt nộp • Tỷ lệ đúng TB: ${q.avg_pct !== null ? q.avg_pct + '%' : 'Chưa có lượt làm'}`).join('\n')
      : '  - Chưa gắn đề Quiz trực tuyến.';

    return `# HỒ SƠ ĐỐI SOÁT CHẤT LƯỢNG CA DẠY & LỘ TRÌNH SƯ PHẠM
**Lớp học:** ${s.class_name} (${s.grade_level})
**Mã ca học:** \`${s.id}\` • **Thời gian:** ${s.day_name} (${s.session_date || 'Lịch tuần'}) ${s.start_time} – ${s.end_time}
**Giáo viên phụ trách:** ${s.teacher_name} ${s.assistant_teacher_name ? `• Trợ giảng: ${s.assistant_teacher_name}` : ''}
**Địa điểm / Phòng học:** ${s.location} (${s.room_notes || 'Phòng tiêu chuẩn'})

---

## 1. TỶ LỆ BÀI TẬP ĐÁP ỨNG, KẾT QUẢ QUIZ/TEST & CHUYÊN CẦN
- **Chỉ số Phù Hợp & Đáp Ứng Tổng Hợp:** **${m.overall_suitability_pct}%** (${m.quality_tier.toUpperCase()})
- **Trạng thái Điểm danh ca học:** ${m.roll_call_status === 'complete' ? `ĐÃ ĐIỂM DANH ĐỦ (${m.marked_count}/${m.enrolled_count} HS)` : m.roll_call_status === 'incomplete' ? `ĐIỂM DANH THIẾU (${m.marked_count}/${m.enrolled_count} HS)` : 'CHƯA ĐIỂM DANH'}
  - Đúng giờ (\`present\`): **${m.present_count}** HS | Đi muộn (\`late\`): **${m.late_count}** HS | Vắng có phép: **${m.absent_excused_count}** HS | Vắng không phép: **${m.absent_unexcused_count}** HS
- **Tỷ lệ Bài tập về nhà đáp ứng:** **${m.homework_fulfillment_pct !== null ? m.homework_fulfillment_pct + '%' : 'Chưa có dữ liệu nộp bài'}**
${hwLines}
- **Tỷ lệ Làm bài Quiz / Kiểm tra đạt chuẩn:** **${m.quiz_mastery_pct !== null ? m.quiz_mastery_pct + '%' : 'Chưa có lượt làm Quiz'}**
${quizLines}

---

## 2. NỘI DUNG GIÁO ÁN & TÀI LIỆU SỬ DỤNG (KHO TRI THỨC & GOOGLE DRIVE)
- **Chủ đề trọng tâm:** ${s.subject_topic}
- **Bài học Kho Tri Thức (Obsidian Vault):** ${mat.vault_article_title || 'Chưa gắn bài học cụ thể'} ${mat.vault_article_id ? `(\`${mat.vault_article_id}\`)` : ''}
- **Tài liệu Google Drive Storage:** ${mat.drive_file_name || 'Chưa gắn tệp Drive'} ${mat.drive_file_url ? `(${mat.drive_file_url})` : ''}
- **Chi tiết Nội dung Giáo án:**
${editForm.lesson_plan_content || mat.lesson_plan_content}

---

## 3. ĐÁNH GIÁ HIỆU QUẢ GIẢNG DẠY & ĐỘ PHÙ HỢP HỌC LIỆU
- **Đánh giá độ phù hợp thủ công (GV/Leader):** **${editForm.manual_suitability_pct}%**
- **Xếp loại hiệu quả:** \`${editForm.effectiveness_rating}\`
- **Nhận xét chuyên môn:**
${editForm.effectiveness_notes || d.effectiveness_evaluation.notes}

---

## 4. TƯƠNG TÁC PHỤ HUYNH (ZALO / THÔNG BÁO ĐƯA ĐÓN & HỌC TẬP)
- **Cấu hình nhắc lịch trước giờ học:** ${s.notify_minutes_before || 10} phút (${d.parent_interaction.notifications_sent_count} thông báo hệ thống đã ghi nhận)
- **Học sinh cần lưu ý với phụ huynh:**
  - Đi muộn: ${d.parent_interaction.late_students.length > 0 ? d.parent_interaction.late_students.join(', ') : 'Không có'}
  - Vắng mặt: ${d.parent_interaction.absent_students.length > 0 ? d.parent_interaction.absent_students.join(', ') : 'Không có'}
- **Nhật ký trao đổi phụ huynh:**
${editForm.parent_interaction_notes || d.parent_interaction.notes}

---

## 5. TƯƠNG TÁC NỘI BỘ & LỘ TRÌNH NÂNG CẤP CHẤT LƯỢNG CA DẠY
- **Phối hợp nội bộ (GV Chính - Trợ giảng - Leader Cô Dung):**
${editForm.internal_interaction_notes || d.internal_interaction_and_roadmap.internal_notes}
- **Lộ trình điều chỉnh & Đề xuất nâng cấp buổi tiếp theo:**
${editForm.roadmap_recommendation || d.internal_interaction_and_roadmap.roadmap_recommendation}
`;
  }

  function handleOpenExportModal() {
    if (!selectedReport) return;
    exportedMarkdown = buildSessionDossierMarkdown(selectedReport);
    showExportModal = true;
  }

  async function handleCopyDossier() {
    try {
      await navigator.clipboard.writeText(exportedMarkdown);
      showToast('✅ Đã sao chép toàn bộ Hồ sơ đối soát ca học vào bộ nhớ tạm!');
    } catch {
      showToast('Đã sẵn sàng nội dung báo cáo để sao chép.');
    }
  }

  async function handleDispatchDossierToBot() {
    if (!exportedMarkdown) return;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/session-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'dispatch_bot_message',
          event_type: 'SESSION_QUALITY_DOSSIER',
          message: exportedMarkdown
        })
      });
      const data = await res.json().catch(() => ({}));
      showToast(data.message || 'Đã gửi báo cáo qua Bot!');
    } catch (err) {
      showToast('Lỗi gửi Bot: ' + err.message);
    }
  }

  async function handleSaveBotConfig() {
    savingBot = true;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/session-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_bot_config',
          ...botForm
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể lưu cấu hình Bot');
      }
      if (data.bot_profile) {
        botVerification = data;
      }
      showToast(data.message);
      await loadAuditData();
      showBotConfigModal = false;
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      savingBot = false;
    }
  }

  async function handleVerifyBotToken() {
    verifyingBot = true;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/session-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          action: 'verify_bot_config',
          id: botForm.id,
          bot_token: botForm.bot_token
        })
      });
      const data = await res.json().catch(() => ({}));
      botVerification = data;
      if (data.message) showToast(data.message);
      await loadAuditData();
    } catch (err) {
      showToast('Lỗi kiểm tra Bot: ' + err.message);
    } finally {
      verifyingBot = false;
    }
  }

  onMount(() => {
    loadAuditData();
  });
</script>

<div class="space-y-6 pb-12">
  {#if toastMsg}
    <div class="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-sm">
      <span>{toastMsg}</span>
      <button onclick={() => toastMsg = ''} class="text-emerald-700 hover:text-emerald-950 font-black">✕</button>
    </div>
  {/if}

  {#if errorMsg}
    <div class="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
      ⚠️ {errorMsg}
    </div>
  {/if}

  <!-- Compact Duolingo-Style Tactile Workspace Header + KPI Strip -->
  <div class="rounded-2xl bg-white border-2 border-b-[3px] border-stone-200 p-4 sm:p-5 text-slate-900 shadow-xs space-y-4">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
            STUDIO BÀI GIẢNG &amp; TỔNG KẾT CA DẠY
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Link Bài Giảng ↔ Google Drive ↔ Nguồn Dán ↔ Kho Tri Thức ↔ Tổng Kết Ca
          </span>
          {#if catalogs.bot_configs?.[0]}
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              🟢 {catalogs.bot_configs[0].name || 'Bot Zalo Đã Kết Nối'}
            </span>
          {/if}
        </div>
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900">
          Quản Lý Bài Giảng (Link • Drive • Nguồn Dán) &amp; Tổng Kết Chất Lượng Ca Dạy 📊
        </h1>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <a
          href="/schedule"
          class="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-900 border-2 border-b-[3px] border-stone-300 text-xs font-extrabold transition-all"
        >
          📅 Thời Khóa Biểu
        </a>
        <a
          href="/cpanel/teacher"
          class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white border-2 border-b-[3px] border-indigo-800 text-xs font-extrabold transition-all"
        >
          👩‍🏫 Sổ Giáo Viên &amp; Giao BTVN
        </a>
        <button
          type="button"
          data-testid="open-bot-config-btn"
          onclick={() => { showBotConfigModal = true; handleVerifyBotToken(); }}
          class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 border-2 border-b-[3px] border-amber-700 text-xs font-extrabold transition-all"
        >
          🤖 Cấu Hình Bot Zalo
        </button>
      </div>
    </div>

    <!-- Compact Tactile KPI Strip -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3 border-t border-stone-200">
      <div class="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
        <div class="text-[10px] text-emerald-900 font-bold uppercase">Độ Phù Hợp TB</div>
        <div class="text-xl font-black text-emerald-700">{summary.avg_overall_suitability_pct}%</div>
        <div class="text-[10px] text-emerald-800">{summary.total_sessions} ca học</div>
      </div>
      <div class="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200">
        <div class="text-[10px] text-teal-900 font-bold uppercase">Điểm Danh ĐỦ</div>
        <div class="text-xl font-black text-teal-700">{summary.roll_call_complete_count}</div>
        <div class="text-[10px] text-teal-800">Thiếu: {summary.roll_call_incomplete_count} • Chưa: {summary.roll_call_unmarked_count}</div>
      </div>
      <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
        <div class="text-[10px] text-amber-900 font-bold uppercase">Ca Đi Muộn</div>
        <div class="text-xl font-black text-amber-700">{summary.sessions_with_late_count}</div>
        <div class="text-[10px] text-amber-800">Nhắc trước 10p</div>
      </div>
      <div class="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
        <div class="text-[10px] text-rose-900 font-bold uppercase">Ca Vắng Mặt</div>
        <div class="text-xl font-black text-rose-700">{summary.sessions_with_absent_count}</div>
        <div class="text-[10px] text-rose-800">Gửi bài bù từ Kho</div>
      </div>
      <div class="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
        <div class="text-[10px] text-indigo-900 font-bold uppercase">Đã Gắn Bài Giảng</div>
        <div class="text-xl font-black text-indigo-700">{summary.sessions_with_material_count}/{summary.total_sessions}</div>
        <div class="text-[10px] text-indigo-800">Link • Drive • Kho</div>
      </div>
      <div class="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
        <div class="text-[10px] text-stone-700 font-bold uppercase">Kho Học Liệu</div>
        <div class="text-xl font-black text-emerald-700">{catalogs.vault_articles.length + catalogs.drive_files.length}</div>
        <div class="text-[10px] text-stone-600">{catalogs.quizzes.length} đề Quiz</div>
      </div>
    </div>
  </div>

  <!-- Filter Bar -->
  <div class="rounded-xl bg-white border border-slate-200 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
    <div>
      <label for="audit-search" class="block font-bold text-slate-600 mb-1">🔍 Tìm kiếm ca học / tài liệu:</label>
      <input
        id="audit-search"
        type="text"
        bind:value={searchQuery}
        placeholder="Tên lớp, chủ đề, giáo viên, bài học..."
        class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 focus:outline-none focus:border-emerald-500"
      />
    </div>

    <div>
      <label for="audit-att-filter" class="block font-bold text-slate-600 mb-1">📋 Lọc trạng thái điểm danh &amp; đi muộn:</label>
      <select
        id="audit-att-filter"
        bind:value={attendanceStatusFilter}
        class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:border-emerald-500"
      >
        <option value="all">Tất cả trạng thái ({sessionReports.length})</option>
        <option value="complete">✅ Đã điểm danh ĐỦ sĩ số</option>
        <option value="incomplete">⚠️ Điểm danh CHƯA ĐỦ sĩ số</option>
        <option value="unmarked">⏳ Chưa điểm danh</option>
        <option value="has_late">⏱️ Có học sinh Đi muộn (late)</option>
        <option value="has_absent">❌ Có học sinh Vắng mặt (absent)</option>
      </select>
    </div>

    <div>
      <label for="audit-mat-filter" class="block font-bold text-slate-600 mb-1">📚 Lọc nguồn học liệu &amp; đề Quiz:</label>
      <select
        id="audit-mat-filter"
        bind:value={materialFilter}
        class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:border-emerald-500"
      >
        <option value="all">Tất cả nguồn tài liệu</option>
        <option value="has_material">✓ Đã gắn giáo án (Vault / Drive)</option>
        <option value="missing_material">⚠️ Chưa gắn tài liệu chuẩn</option>
        <option value="has_vault">🧠 Dùng Kho Tri Thức Obsidian</option>
        <option value="has_drive">📁 Dùng Tài liệu Google Drive</option>
        <option value="has_quiz">🧩 Đã gắn Đề Quiz trực tuyến</option>
      </select>
    </div>

    <div>
      <label for="audit-suit-filter" class="block font-bold text-slate-600 mb-1">🎯 Lọc tỷ lệ % phù hợp &amp; hiệu quả:</label>
      <select
        id="audit-suit-filter"
        bind:value={suitabilityFilter}
        class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:border-emerald-500"
      >
        <option value="all">Mọi mức độ phù hợp</option>
        <option value="excellent">🌟 Xuất sắc (≥ 85% phù hợp)</option>
        <option value="good">👍 Đạt chuẩn (70% – 84%)</option>
        <option value="needs_improvement">🔧 Cần điều chỉnh giáo án (&lt; 70%)</option>
      </select>
    </div>
  </div>

  {#if loading}
    <div class="p-12 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500 font-semibold">
      ⏳ Đang tổng hợp dữ liệu hồi quy từ Kho Tri Thức, Drive, Thời Khóa Biểu, Điểm Danh, BTVN &amp; Quiz...
    </div>
  {:else}
    <!-- Master-Detail Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left Column: Sessions List (5 cols) -->
      <div class="lg:col-span-5 space-y-3 pr-1">
        <div class="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
          <span>DANH SÁCH CA HỌC ĐỐI SOÁT ({filteredReports.length})</span>
          <button
            type="button"
            onclick={loadAuditData}
            class="text-emerald-700 hover:underline"
          >
            🔄 Làm mới D1
          </button>
        </div>

        {#if filteredReports.length === 0}
          <div class="p-8 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-500">
            Không có ca học nào khớp với bộ lọc hiện tại.
          </div>
        {:else}
          {#each filteredReports as item (item.session.id)}
            {@const s = item.session}
            {@const m = item.metrics}
            {@const mat = item.materials}
            {@const isSelected = selectedReport?.session?.id === s.id}
            <button
              type="button"
              onclick={() => populateFormFromReport(item)}
              class="w-full text-left p-4 rounded-xl border transition-all space-y-2.5 {isSelected ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {s.grade_level} • {s.day_name} ({s.start_time}–{s.end_time})
                </span>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black {m.overall_suitability_pct >= 85 ? 'bg-emerald-600 text-white' : m.overall_suitability_pct >= 70 ? 'bg-teal-600 text-white' : 'bg-amber-500 text-white'}">
                  🎯 {m.overall_suitability_pct}% phù hợp
                </span>
              </div>

              <div>
                <div class="font-bold text-sm text-slate-900">{s.class_name}</div>
                <div class="text-xs text-slate-600">📖 {s.subject_topic}</div>
                <div class="text-[11px] text-slate-500 mt-0.5">👩‍🏫 {s.teacher_name} {s.assistant_teacher_name ? `& ${s.assistant_teacher_name}` : ''}</div>
              </div>

              <!-- Material Badges -->
              <div class="flex flex-wrap items-center gap-1.5 text-[10px]">
                {#if mat.drive_file_url}
                  <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold break-words">
                    🔗 Link Bài Giảng
                  </span>
                {/if}
                {#if mat.vault_article_title}
                  <span class="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-semibold break-words">
                    🧠 {mat.vault_article_title}
                  </span>
                {/if}
                {#if mat.drive_file_name}
                  <span class="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-semibold break-words">
                    📁 {mat.drive_file_name}
                  </span>
                {/if}
                {#if !mat.vault_article_title && !mat.drive_file_name && !mat.drive_file_url}
                  <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                    ⚠️ Chưa gắn tài liệu Kho/Drive/Link
                  </span>
                {/if}
              </div>

              <!-- Attendance & Homework/Quiz Pills -->
              <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-bold">
                <div class="flex items-center gap-1">
                  {#if m.roll_call_status === 'complete'}
                    <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">✅ Đủ ({m.marked_count}/{m.enrolled_count || m.marked_count})</span>
                  {:else if m.roll_call_status === 'incomplete'}
                    <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800">⚠️ Thiếu ({m.marked_count}/{m.enrolled_count})</span>
                  {:else}
                    <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600">⏳ Chưa điểm danh</span>
                  {/if}
                  {#if m.late_count > 0}
                    <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">⏱️ Muộn: {m.late_count}</span>
                  {/if}
                  {#if m.total_absent_count > 0}
                    <span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">✕ Vắng: {m.total_absent_count}</span>
                  {/if}
                </div>

                <div class="flex items-center gap-1.5 text-slate-600">
                  <span>📚 BTVN: {m.homework_fulfillment_pct !== null ? `${m.homework_fulfillment_pct}%` : '—'}</span>
                  <span>•</span>
                  <span>🧩 Quiz: {m.quiz_mastery_pct !== null ? `${m.quiz_mastery_pct}%` : '—'}</span>
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- Right Column: Deep Session Inspector, Material Linker & 5-Part Dossier (7 cols) -->
      <div class="lg:col-span-7">
        {#if selectedReport}
          {@const s = selectedReport.session}
          {@const m = selectedReport.metrics}
          {@const mat = selectedReport.materials}
          <div class="rounded-2xl bg-white border-2 border-b-[3px] border-stone-200 p-5 shadow-xs space-y-4">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                    STUDIO CA HỌC &amp; TỔNG KẾT
                  </span>
                  <span class="text-xs font-mono text-slate-500">{s.id} • {s.day_name} ({s.start_time}–{s.end_time})</span>
                </div>
                <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">{s.class_name}</h2>
                <p class="text-xs text-slate-600">Chủ đề: <strong>{s.subject_topic}</strong> • GV: <strong>{s.teacher_name}</strong></p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="export-session-dossier-btn"
                  onclick={handleOpenExportModal}
                  class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white border-2 border-b-[3px] border-indigo-800 text-xs font-extrabold shadow-xs transition-all"
                >
                  📄 Xuất Báo Cáo Ca Học (5 Mục)
                </button>
              </div>
            </div>

            <!-- Compact 4-KPI Strip -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <div class="text-[10px] font-bold text-emerald-800 uppercase">🎯 Độ Phù Hợp</div>
                <div class="text-xl font-black text-emerald-700">{m.overall_suitability_pct}%</div>
                <div class="text-[10px] text-emerald-700">Tổng hợp Ca dạy</div>
              </div>

              <div class="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                <div class="text-[10px] font-bold text-indigo-800 uppercase">📚 BTVN Đáp Ứng</div>
                <div class="text-xl font-black text-indigo-700">
                  {m.homework_fulfillment_pct !== null ? `${m.homework_fulfillment_pct}%` : 'Chưa nộp'}
                </div>
                <div class="text-[10px] text-indigo-700">{mat.linked_homeworks.length} bài tập</div>
              </div>

              <div class="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                <div class="text-[10px] font-bold text-purple-800 uppercase">🧩 Đề Quiz</div>
                <div class="text-xl font-black text-purple-700">
                  {m.quiz_mastery_pct !== null ? `${m.quiz_mastery_pct}%` : 'Chưa làm'}
                </div>
                <div class="text-[10px] text-purple-700">{mat.linked_quizzes.length} đề liên kết</div>
              </div>

              <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                <div class="text-[10px] font-bold text-amber-900 uppercase">📋 Điểm Danh</div>
                <div class="text-sm font-black text-amber-800 mt-0.5">
                  {m.present_count} Đúng • {m.late_count} Muộn
                </div>
                <div class="text-[10px] text-amber-800">
                  Vắng: {m.total_absent_count} ({m.marked_count}/{m.enrolled_count})
                </div>
              </div>
            </div>

            <!-- Duolingo Tactile Inspector Tabs (Progressive Disclosure to eliminate noisy vertical stacking) -->
            <div data-testid="inspector-workspace-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-extrabold">
              <button
                type="button"
                onclick={() => activeInspectorTab = 'materials'}
                class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeInspectorTab === 'materials' ? 'bg-indigo-600 border-indigo-800 text-white' : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-indigo-300'}"
              >
                <span>📚</span>
                <span class="truncate">1. Bài Giảng (Link/Drive)</span>
              </button>
              <button
                type="button"
                onclick={() => activeInspectorTab = 'summary'}
                class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeInspectorTab === 'summary' ? 'bg-emerald-600 border-emerald-800 text-white' : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-emerald-300'}"
              >
                <span>📊</span>
                <span class="truncate">2. Tổng Kết Ca Dạy</span>
              </button>
              <button
                type="button"
                onclick={() => activeInspectorTab = 'interactions'}
                class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeInspectorTab === 'interactions' ? 'bg-amber-500 border-amber-700 text-stone-950' : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-amber-300'}"
              >
                <span>💬</span>
                <span class="truncate">3. Phụ Huynh &amp; Lộ Trình</span>
              </button>
              <button
                type="button"
                onclick={() => activeInspectorTab = 'all'}
                class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeInspectorTab === 'all' ? 'bg-stone-900 border-stone-950 text-white' : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-stone-400'}"
              >
                <span>👁️</span>
                <span class="truncate">Mở Tất Cả (5 Mục)</span>
              </button>
            </div>

            <!-- Section 2 (Tab 1): Material Selection (Link Bài Giảng + Google Drive + Kho Tri Thức + Nguồn Dán Thêm) -->
            <div class:hidden={activeInspectorTab !== 'materials' && activeInspectorTab !== 'all'} class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-extrabold text-slate-900">1. Học Liệu Ca Học: Link Bài Giảng • Google Drive • Kho Tri Thức • Nguồn Dán Thêm</h3>
                <a
                  href="/cpanel/teacher?session_id={encodeURIComponent(s.id)}&amp;class_id={encodeURIComponent(s.class_id)}"
                  class="text-xs font-bold text-indigo-600 hover:underline"
                >
                  ➕ Giao thêm BTVN / Quiz cho ca này →
                </a>
              </div>

              <!-- Link Bài Giảng Trực Tiếp -->
              <div class="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5 text-xs">
                <div class="flex items-center justify-between gap-2">
                  <label for="audit-drive-url" class="font-extrabold text-indigo-950">
                    🔗 Link Bài Giảng Trực Tiếp (Google Docs/Slides, Canva, PDF, Video...):
                  </label>
                  {#if editForm.drive_file_url}
                    <a
                      href={editForm.drive_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px]"
                    >
                      ↗ Mở Link Bài Giảng
                    </a>
                  {/if}
                </div>
                <input
                  id="audit-drive-url"
                  type="url"
                  bind:value={editForm.drive_file_url}
                  placeholder="Dán link bài giảng trực tiếp (https://docs.google.com/presentation/... hoặc Canva/Drive)"
                  class="w-full px-3 py-2 rounded-lg border border-indigo-300 bg-white text-slate-900 font-medium"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label for="audit-vault-select" class="block font-bold text-slate-700 mb-1">🧠 Bài học từ Kho Tri Thức (Obsidian Vault):</label>
                  <select
                    id="audit-vault-select"
                    value={editForm.vault_article_id}
                    onchange={handleSelectVaultArticle}
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    <option value="">-- Chọn chuyên đề từ Kho Tri Thức ({catalogs.vault_articles.length}) --</option>
                    {#each catalogs.vault_articles as v}
                      <option value={v.id}>{v.title} ({v.category || 'Chuyên đề'})</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <label for="audit-drive-select" class="block font-bold text-slate-700 mb-1">📁 Đề cương / File từ Google Drive Storage:</label>
                  <select
                    id="audit-drive-select"
                    value={editForm.drive_file_id}
                    onchange={handleSelectDriveFile}
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    <option value="">-- Chọn tài liệu Drive ({catalogs.drive_files.length}) --</option>
                    {#each catalogs.drive_files as f}
                      <option value={f.id}>{f.title_vi || f.name}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label for="audit-vault-title" class="block font-bold text-slate-600 mb-1">Tên giáo án / tài liệu chính sử dụng trong ca:</label>
                  <input
                    id="audit-vault-title"
                    type="text"
                    bind:value={editForm.vault_article_title}
                    placeholder="VD: Unit 7 Traffic - Ngữ pháp & Từ vựng trọng tâm..."
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label for="audit-drive-name" class="block font-bold text-slate-600 mb-1">Tên file Drive / Phiếu bài tập in kèm:</label>
                  <input
                    id="audit-drive-name"
                    type="text"
                    bind:value={editForm.drive_file_name}
                    placeholder="VD: Đề cương Global Success Lớp 7 - Phiếu DOCX..."
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label for="audit-lesson-plan" class="block text-xs font-bold text-slate-700 mb-1">📋 Nguồn Bài Giảng Dán Thêm &amp; Nội Dung Giáo Án Chi Tiết:</label>
                <textarea
                  id="audit-lesson-plan"
                  rows="4"
                  bind:value={editForm.lesson_plan_content}
                  placeholder="Dán trực tiếp nguồn bài giảng, từ vựng, cấu trúc ngữ pháp và tiến trình giảng dạy trong ca..."
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                ></textarea>
              </div>
            </div>

            <!-- Section 3 (Tab 2): Effectiveness Evaluation & Manual Suitability % -->
            <div class:hidden={activeInspectorTab !== 'summary' && activeInspectorTab !== 'all'} class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <h3 class="text-sm font-extrabold text-slate-900">2. Tổng Kết Ca Dạy &amp; Đánh Giá Hiệu Quả Giảng Dạy</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center text-xs">
                <div>
                  <label for="audit-manual-pct" class="block font-bold text-slate-700 mb-1">
                    Chấm điểm mức độ phù hợp của tài liệu với học sinh: <strong class="text-emerald-700 text-sm">{editForm.manual_suitability_pct}%</strong>
                  </label>
                  <input
                    id="audit-manual-pct"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    bind:value={editForm.manual_suitability_pct}
                    class="w-full accent-emerald-600"
                  />
                </div>

                <div>
                  <label for="audit-rating" class="block font-bold text-slate-700 mb-1">Xếp loại chất lượng ca dạy:</label>
                  <select
                    id="audit-rating"
                    bind:value={editForm.effectiveness_rating}
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    <option value="excellent">🌟 Xuất sắc (Học sinh hiểu sâu &amp; hoàn thành tốt)</option>
                    <option value="good">👍 Tốt (Đạt mục tiêu giáo án)</option>
                    <option value="needs_improvement">🔧 Cần điều chỉnh (Tài liệu hơi khó/dễ hoặc thiếu tương tác)</option>
                    <option value="critical">🚨 Báo động (Cần dạy bù / phụ đạo gấp)</option>
                  </select>
                </div>
              </div>

              <div>
                <label for="audit-eff-notes" class="block text-xs font-bold text-slate-700 mb-1">Nhận xét tổng kết hiệu quả thực tế sau ca học:</label>
                <textarea
                  id="audit-eff-notes"
                  rows="3"
                  bind:value={editForm.effectiveness_notes}
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                ></textarea>
              </div>
            </div>

            <!-- Section 4 & 5 (Tab 3): Parent Interaction, Internal Interaction & Upgrade Roadmap -->
            <div class:hidden={activeInspectorTab !== 'interactions' && activeInspectorTab !== 'all'} class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <h3 class="text-xs font-extrabold text-slate-900 uppercase">3. Tương Tác Phụ Huynh</h3>
                  <textarea
                    id="audit-parent-notes"
                    rows="3"
                    bind:value={editForm.parent_interaction_notes}
                    placeholder="Ghi nhận phản hồi phụ huynh, tình hình đưa đón, thông báo điểm danh & kết quả BTVN..."
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                  ></textarea>
                </div>

                <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <h3 class="text-xs font-extrabold text-slate-900 uppercase">4. Tương Tác Nội Bộ (GV - Trợ Giảng - Leader)</h3>
                  <textarea
                    id="audit-internal-notes"
                    rows="3"
                    bind:value={editForm.internal_interaction_notes}
                    placeholder="Bàn giao giữa Giáo viên chính, Trợ giảng và chỉ đạo chuyên môn của Cô Dung..."
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                  ></textarea>
                </div>
              </div>

              <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <h3 class="text-xs font-extrabold text-emerald-950 uppercase">5. Lộ Trình Đánh Giá &amp; Đề Xuất Nâng Cấp Ca Dạy Tiếp Theo</h3>
                <textarea
                  id="audit-roadmap"
                  rows="3"
                  bind:value={editForm.roadmap_recommendation}
                  class="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-xs text-slate-900"
                ></textarea>
              </div>
            </div>

            <!-- Sticky Action Footer -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-stone-200">
              <label class="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input type="checkbox" bind:checked={editForm.notify_internal} class="rounded text-emerald-600" />
                <span>Đồng bộ lộ trình &amp; tổng kết ca vào chuông thông báo của Giáo viên</span>
              </label>

              <button
                type="button"
                data-testid="save-session-audit-btn"
                disabled={saving}
                onclick={handleSaveAudit}
                class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-b-[3px] border-emerald-800 font-extrabold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {saving ? '⏳ Đang lưu vào D1...' : '💾 Lưu Tổng Kết & Học Liệu Ca Dạy'}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Export 5-Part Dossier Modal -->
{#if showExportModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-500/25 backdrop-blur-sm">
    <div class="w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 class="text-lg font-bold text-slate-900">📄 Hồ Sơ Báo Cáo &amp; Đối Soát Ca Học (Đủ 5 Hạng Mục)</h3>
          <p class="text-xs text-slate-500">Bao gồm: Tỷ lệ BTVN/Quiz đáp ứng • Giáo án • Đánh giá hiệu quả • Tương tác phụ huynh • Tương tác nội bộ &amp; Lộ trình</p>
        </div>
        <button onclick={() => showExportModal = false} class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold">✕</button>
      </div>

      <textarea
        readonly
        rows="16"
        data-testid="session-dossier-export-text"
        value={exportedMarkdown}
        class="w-full flex-1 font-mono text-xs p-4 rounded-xl bg-white text-emerald-700 border border-slate-200 overflow-y-auto"
      ></textarea>

      <div class="flex flex-wrap items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          onclick={handleCopyDossier}
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
        >
          📋 Sao Chép Báo Cáo
        </button>
        <button
          type="button"
          onclick={handleDispatchDossierToBot}
          class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
        >
          🚀 Bắn Báo Cáo Qua Bot Webhook
        </button>
        <button
          type="button"
          onclick={() => showExportModal = false}
          class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
        >
          Đóng
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Bot Webhook & API Token Configuration Modal -->
{#if showBotConfigModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-500/25 backdrop-blur-sm">
    <div class="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 class="text-base font-bold text-slate-900">🤖 Cấu Hình &amp; Xác Thực Bot API Token (Zalo Bot Platform / Telegram)</h3>
          <p class="text-xs text-slate-500">Kết nối trực tiếp với <code class="font-mono text-emerald-700">bot-api.zaloplatforms.com</code> &amp; lưu trên Cloudflare D1</p>
        </div>
        <button onclick={() => showBotConfigModal = false} class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold">✕</button>
      </div>

      {#if botVerification?.bot_profile}
        <div data-testid="verified-bot-card" class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 space-y-1.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-bold text-emerald-900 flex items-center gap-1.5">
              <span>🟢 Đã xác thực Zalo Bot Platform (`getMe` 200 OK):</span>
              <strong class="underline">{botVerification.bot_profile.display_name}</strong>
            </span>
            <span class="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
              {botVerification.bot_profile.account_type || 'BASIC'}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px] text-emerald-800 pt-1">
            <div>• <strong>Bot ID:</strong> <code class="font-mono">{botVerification.bot_profile.id}</code></div>
            <div>• <strong>Account:</strong> <code class="font-mono">@{botVerification.bot_profile.account_name}</code></div>
            <div class="col-span-2">• <strong>Active Webhook:</strong> <code class="font-mono">{botVerification.webhook_info?.url || 'Chưa gắn webhook'}</code></div>
          </div>
        </div>
      {/if}

      <div class="space-y-3 text-xs">
        <div>
          <label for="bot-provider" class="block font-bold text-slate-700 mb-1">Nền tảng Bot:</label>
          <select id="bot-provider" bind:value={botForm.provider} class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-semibold">
            <option value="zalo_bot_platform">Zalo Bot Platform (bot-api.zaloplatforms.com • ID:Token)</option>
            <option value="zalo_webhook">Zalo OA / Zalo ZNS Gateway Webhook</option>
            <option value="telegram_bot">Telegram Bot API (api.telegram.org)</option>
            <option value="custom_webhook">Webhook trung gian (n8n / Make / Custom)</option>
          </select>
        </div>

        <div>
          <label for="bot-token" class="block font-bold text-slate-700 mb-1">
            Bot API Token ({catalogs.bot_configs?.[0]?.masked_token ? `Đang lưu: ${catalogs.bot_configs[0].masked_token}` : 'Nhập mới'}):
          </label>
          <input
            id="bot-token"
            type="password"
            bind:value={botForm.bot_token}
            placeholder="Để trống để giữ Token 2267052943606876676:*** hiện tại hoặc dán Token mới..."
            class="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
          />
        </div>

        <div>
          <label for="bot-chat-id" class="block font-bold text-slate-700 mb-1">Chat ID / Group ID người nhận mặc định (`sendMessage`):</label>
          <input id="bot-chat-id" type="text" bind:value={botForm.chat_id} placeholder="Nhập Zalo chat_id người nhận hoặc để hệ thống tự thu thập qua Webhook" class="w-full px-3 py-2 rounded-lg border border-slate-300" />
        </div>

        <div>
          <label for="bot-url" class="block font-bold text-slate-700 mb-1">Webhook Endpoint URL:</label>
          <input id="bot-url" type="text" bind:value={botForm.webhook_url} placeholder="https://timbk.io.vn/api/zalo-bot/webhook" class="w-full px-3 py-2 rounded-lg border border-slate-300" />
        </div>

        <div class="p-3 rounded-xl bg-sky-50 border border-sky-200 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-sky-950">🧠 Trợ Lý AI Tương Tác 2 Chiều (DeepSeek AI + Dữ Liệu D1):</span>
            <label class="inline-flex items-center gap-1.5 font-bold text-emerald-700 cursor-pointer">
              <input type="checkbox" bind:checked={botForm.ai_enabled} class="rounded text-emerald-600" />
              <span>Đang bật trả lời 2 chiều</span>
            </label>
          </div>
          <p class="text-[11px] text-sky-800">
            Mặc định chạy <strong>DeepSeek R1 Distill Qwen 32B (Cloudflare Edge AI)</strong> miễn phí kết hợp tra cứu trực tiếp Lịch học, Học phí, Điểm số từ D1. Bạn cũng có thể dán thêm <code>DEEPSEEK_API_KEY (sk-...)</code> riêng bên dưới:
          </p>
          <input
            id="bot-deepseek-key"
            type="password"
            bind:value={botForm.deepseek_api_key}
            placeholder="Tùy chọn: Dán DeepSeek API Key (sk-...) hoặc để trống dùng DeepSeek R1 32B tích hợp sẵn"
            class="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white font-mono text-xs"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
        <button
          type="button"
          data-testid="verify-bot-token-btn"
          disabled={verifyingBot}
          onclick={handleVerifyBotToken}
          class="px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold"
        >
          {verifyingBot ? '⏳ Đang kiểm tra getMe...' : '🔍 Kiểm Tra Kết Nối Token (getMe)'}
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick={() => showBotConfigModal = false} class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">Đóng</button>
          <button type="button" disabled={savingBot} onclick={handleSaveBotConfig} class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
            {savingBot ? 'Đang lưu...' : '💾 Lưu Cấu Hình Bot'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

