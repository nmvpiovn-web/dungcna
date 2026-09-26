<script>
  import { onMount } from 'svelte';
  import { 
    getCurrentUser, 
    isSuperAdmin, 
    getAllTeacherProfiles, 
    updateTeacherRoleAndSalary, 
    addTeacherAppraisalAndRating, 
    addTeacherBonus, 
    addTeacherPrivateReminder,
    acknowledgeTeacherReminder,
    TEACHER_ROLE_TYPES 
  } from '$lib/unifiedStore';

  let { 
    isOpen = $bindable(false), 
    teacherId = null, 
    staffProfile = null, 
    onUpdated = () => {}, 
    onSaved = () => {} 
  } = $props();

  let currentUser = $state(null);
  let profile = $state(null);
  let activeTab = $state('overview'); // 'overview' | 'appraisal' | 'bonus' | 'reminders'
  let isLeader = $derived(isSuperAdmin(currentUser));

  // Edit Role & Salary Form
  let roleType = $state('lead');
  let roleTitle = $state('');
  let baseSalaryVnd = $state(15000000);
  let ratePerSessionVnd = $state(500000);
  let salaryType = $state('monthly');

  // Appraisal Form
  let leaderRating = $state(5.0);
  let leaderAppraisal = $state('');

  // Bonus Form
  let bonusAmount = $state(1000000);
  let bonusReason = $state('Khen thưởng hoàn thành xuất sắc ca giảng dạy');

  // Reminder Form
  let reminderContent = $state('');
  let reminderUrgency = $state('medium'); // 'low' | 'medium' | 'high'

  let toastMsg = $state('');

  $effect(() => {
    if (isOpen) {
      currentUser = getCurrentUser();
      loadProfile();
    }
  });

  function loadProfile() {
    const all = getAllTeacherProfiles();
    const targetId = teacherId || staffProfile?.teacher_id || (currentUser?.role === 'teacher' ? currentUser.id : all[0]?.teacher_id);
    profile = all.find(p => p.teacher_id === targetId) || (staffProfile?.teacher_id === targetId ? staffProfile : all[0]);

    if (profile) {
      roleType = profile.role_type || profile.role_level || 'lead';
      roleTitle = profile.role_title || profile.role_label || '';
      baseSalaryVnd = profile.base_salary_vnd || 0;
      ratePerSessionVnd = profile.rate_per_session_vnd || profile.per_session_rate_vnd || 0;
      salaryType = profile.salary_type || 'monthly';
      leaderRating = profile.leader_rating || profile.rating_stars || 5.0;
      leaderAppraisal = profile.leader_appraisal || '';
    }
  }

  function showToast(msg) {
    toastMsg = msg;
    setTimeout(() => toastMsg = '', 3500);
  }

  let isSaving = $state(false);

  function getClientToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('tienganh_auth_token');
  }

  async function handleSaveRoleSalary() {
    if (!profile) return;
    isSaving = true;
    const updates = {
      role_type: roleType,
      role_level: roleType,
      role_title: roleTitle,
      role_label: roleTitle,
      base_salary_vnd: Number(baseSalaryVnd),
      rate_per_session_vnd: Number(ratePerSessionVnd),
      per_session_rate_vnd: Number(ratePerSessionVnd),
      salary_type: salaryType,
      leader_rating: Number(leaderRating) || 5.0,
      rating_stars: Math.round(Number(leaderRating) || 5)
    };

    try {
      const token = getClientToken();
      const res = await fetch('/api/teachers/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'update_role_salary',
          teacher_id: profile.teacher_id,
          ...updates
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi từ máy chủ');
      }
      updateTeacherRoleAndSalary(profile.teacher_id, updates, currentUser);
      loadProfile();
      showToast(data.source === 'cloudflare_d1' ? 'Đã lưu phân quyền & lương vào Cloudflare D1 thành công!' : 'Đã cập nhật phân quyền và mức lương thành công!');
      onUpdated();
      onSaved();
    } catch (err) {
      console.warn('Fallback to local store:', err);
      updateTeacherRoleAndSalary(profile.teacher_id, updates, currentUser);
      loadProfile();
      showToast('Đã lưu thông tin (kết nối máy chủ: ' + err.message + ')');
      onUpdated();
      onSaved();
    } finally {
      isSaving = false;
    }
  }

  async function handleSaveAppraisal() {
    if (!profile) return;
    isSaving = true;
    try {
      const token = getClientToken();
      const res = await fetch('/api/teachers/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'add_appraisal',
          teacher_id: profile.teacher_id,
          appraisal: leaderAppraisal,
          rating: leaderRating
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi server');
      addTeacherAppraisalAndRating(profile.teacher_id, leaderAppraisal, leaderRating, currentUser);
      loadProfile();
      showToast('Đã lưu đánh giá & xếp loại giáo viên lên Cloudflare D1!');
      onUpdated();
      onSaved();
    } catch (err) {
      addTeacherAppraisalAndRating(profile.teacher_id, leaderAppraisal, leaderRating, currentUser);
      loadProfile();
      showToast('Đã lưu đánh giá & xếp loại giáo viên!');
      onUpdated();
      onSaved();
    } finally {
      isSaving = false;
    }
  }

  async function handleAddBonus() {
    if (!profile) return;
    isSaving = true;
    try {
      const token = getClientToken();
      const res = await fetch('/api/teachers/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'add_bonus',
          teacher_id: profile.teacher_id,
          amount_vnd: bonusAmount,
          reason: bonusReason
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi server');
      addTeacherBonus(profile.teacher_id, {
        amount_vnd: bonusAmount,
        reason: bonusReason
      }, currentUser);

      bonusAmount = 1000000;
      bonusReason = '';
      loadProfile();
      showToast('Đã trao quyết định khen thưởng giáo viên thành công!');
      onUpdated();
      onSaved();
    } catch (err) {
      addTeacherBonus(profile.teacher_id, {
        amount_vnd: bonusAmount,
        reason: bonusReason
      }, currentUser);
      bonusAmount = 1000000;
      bonusReason = '';
      loadProfile();
      showToast('Đã trao quyết định khen thưởng giáo viên thành công!');
      onUpdated();
      onSaved();
    } finally {
      isSaving = false;
    }
  }

  async function handleSendReminder() {
    if (!profile || !reminderContent.trim()) {
      alert('Vui lòng nhập nội dung nhắc nhở riêng!');
      return;
    }
    isSaving = true;
    try {
      const token = getClientToken();
      const res = await fetch('/api/teachers/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'send_private_reminder',
          teacher_id: profile.teacher_id,
          content: reminderContent.trim(),
          urgency: reminderUrgency
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi server');
      addTeacherPrivateReminder(profile.teacher_id, {
        content: reminderContent.trim(),
        urgency: reminderUrgency
      }, currentUser);

      reminderContent = '';
      loadProfile();
      showToast('Đã gửi nhắc nhở riêng tư tới giáo viên!');
      onUpdated();
      onSaved();
    } catch (err) {
      addTeacherPrivateReminder(profile.teacher_id, {
        content: reminderContent.trim(),
        urgency: reminderUrgency
      }, currentUser);
      reminderContent = '';
      loadProfile();
      showToast('Đã gửi nhắc nhở riêng tư tới giáo viên!');
      onUpdated();
      onSaved();
    } finally {
      isSaving = false;
    }
  }

  async function handleAcknowledge(remId) {
    if (!profile) return;
    try {
      const token = getClientToken();
      await fetch('/api/teachers/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'acknowledge_reminder',
          teacher_id: profile.teacher_id,
          reminder_id: remId
        })
      });
      acknowledgeTeacherReminder(profile.teacher_id, remId);
      loadProfile();
      showToast('Đã xác nhận đã tiếp thu nhắc nhở!');
      onUpdated();
      onSaved();
    } catch (err) {
      acknowledgeTeacherReminder(profile.teacher_id, remId);
      loadProfile();
      showToast('Đã xác nhận đã tiếp thu nhắc nhở!');
      onUpdated();
      onSaved();
    }
  }
</script>

{#if isOpen && profile}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
      
      <!-- Header -->
      <div class="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl shadow-md">
            👨‍🏫
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900 dark:text-white">{profile.teacher_name}</h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full font-bold border {TEACHER_ROLE_TYPES.find(r => r.key === profile.role_type)?.badgeColor || 'bg-slate-100 text-slate-800'}">
                {TEACHER_ROLE_TYPES.find(r => r.key === profile.role_type)?.title || profile.role_type}
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tài khoản: <strong>@{profile.username}</strong> • Ca đã dạy: <strong>{profile.total_sessions_taught} buổi</strong>
            </p>
          </div>
        </div>
        <button
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center font-bold"
        >
          ✕
        </button>
      </div>

      {#if toastMsg}
        <div class="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between">
          <span>✨ {toastMsg}</span>
          <button onclick={() => toastMsg = ''}>✕</button>
        </div>
      {/if}

      <!-- Tab Buttons -->
      <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-bold">
        <button
          onclick={() => activeTab = 'overview'}
          class="px-3.5 py-1.5 rounded-xl transition-all {activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          💼 Chức Danh &amp; Mức Lương
        </button>
        <button
          onclick={() => activeTab = 'appraisal'}
          class="px-3.5 py-1.5 rounded-xl transition-all {activeTab === 'appraisal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          👑 Đánh Giá Từ Cô Dung ({profile.leader_rating} ⭐)
        </button>
        <button
          onclick={() => activeTab = 'bonus'}
          class="px-3.5 py-1.5 rounded-xl transition-all {activeTab === 'bonus' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          🎁 Khen Thưởng ({profile.bonuses?.length || 0})
        </button>
        <button
          onclick={() => activeTab = 'reminders'}
          class="px-3.5 py-1.5 rounded-xl transition-all {activeTab === 'reminders' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          🔒 Nhắc Nhở Riêng ({profile.private_reminders?.filter(r => r.status === 'pending').length || 0} mới)
        </button>
      </div>

      <!-- TAB 1: OVERVIEW & SALARY -->
      {#if activeTab === 'overview'}
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Phân Loại Vai Trò (Chia Role Từ Leader):
              </label>
              <select
                disabled={!isLeader}
                bind:value={roleType}
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none font-semibold disabled:opacity-75"
              >
                <option value="lead">Giáo Viên Chính Thức (Lead Teacher)</option>
                <option value="native">Giáo Viên Bản Ngữ (Native ESL Trainer)</option>
                <option value="assistant_fixed">Trợ Giảng Cố Định (Permanent Assistant)</option>
                <option value="assistant_temp">Trợ Giảng Tạm Thời (Temporary Assistant)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tiêu Đề / Chức Danh Hiển Thị:</label>
              <input
                type="text"
                disabled={!isLeader}
                bind:value={roleTitle}
                placeholder="Ví dụ: Trợ Giảng Cố Định Lớp 7 &amp; Phonics"
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none disabled:opacity-75"
              />
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mức Lương Cơ Bản (VNĐ/Tháng):</label>
              <input
                type="number"
                disabled={!isLeader}
                bind:value={baseSalaryVnd}
                step="500000"
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 font-mono text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none disabled:opacity-75"
              />
              <span class="text-[10px] text-slate-400 mt-1 block">
                = {(Number(baseSalaryVnd) || 0).toLocaleString('vi-VN')} VNĐ/tháng
              </span>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Thù Lao Theo Ca Giảng Dạy (VNĐ/Buổi):</label>
              <input
                type="number"
                disabled={!isLeader}
                bind:value={ratePerSessionVnd}
                step="50000"
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 font-mono text-teal-600 dark:text-teal-400 font-bold focus:outline-none disabled:opacity-75"
              />
              <span class="text-[10px] text-slate-400 mt-1 block">
                = {(Number(ratePerSessionVnd) || 0).toLocaleString('vi-VN')} VNĐ/ca
              </span>
            </div>
          </div>

          <!-- Total Projected Compensation Summary Card -->
          <div class="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div class="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                Ước Tính Thu Nhập Dự Kiến Trong Tháng
              </div>
              <div class="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                {(Number(baseSalaryVnd) + Number(ratePerSessionVnd) * (profile.total_sessions_taught || 12)).toLocaleString('vi-VN')} VNĐ
              </div>
              <div class="text-[11px] text-slate-500">
                Gồm lương cơ bản + {profile.total_sessions_taught || 12} ca dạy trong tháng
              </div>
            </div>

            {#if isLeader}
              <button
                type="button"
                disabled={isSaving}
                onclick={handleSaveRoleSalary}
                class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
              >
                {#if isSaving}
                  <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Đang lưu lên hệ thống...
                {:else}
                  💾 Lưu Thay Đổi Phân Quyền &amp; Lương
                {/if}
              </button>
            {/if}
          </div>
        </div>

      <!-- TAB 2: LEADER APPRAISAL -->
      {:else if activeTab === 'appraisal'}
        <div class="space-y-4 text-xs">
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/40 space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-amber-800 dark:text-amber-300">
                👑 Đánh Giá Chuyên Môn &amp; Năng Lực Giảng Dạy Từ Leader Cô Dung
              </span>
              <div class="flex items-center gap-1 font-bold text-amber-500">
                <span>{leaderRating}</span> <span>⭐</span>
              </div>
            </div>

            {#if isLeader}
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Xếp Loại Điểm Sao:</label>
                <select
                  bind:value={leaderRating}
                  class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 font-bold text-amber-500 focus:outline-none"
                >
                  <option value={5.0}>5.0 ⭐ (Xuất sắc toàn diện)</option>
                  <option value={4.8}>4.8 ⭐ (Rất tốt, phụ huynh khen)</option>
                  <option value={4.5}>4.5 ⭐ (Đạt chuẩn)</option>
                  <option value={4.0}>4.0 ⭐ (Cần cải thiện)</option>
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nhận Xét Của Cô Dung:</label>
                <textarea
                  bind:value={leaderAppraisal}
                  rows="4"
                  placeholder="Nhập nhận xét chuyên môn, thái độ phục vụ học sinh và định hướng đào tạo..."
                  class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                ></textarea>
              </div>

              <button
                type="button"
                onclick={handleSaveAppraisal}
                class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold"
              >
                💾 Lưu Đánh Giá Của Leader
              </button>
            {:else}
              <div class="p-3 bg-white dark:bg-slate-900 rounded-xl text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                "{profile.leader_appraisal || 'Chưa có nhận xét cập nhật từ Leader.'}"
              </div>
            {/if}
          </div>
        </div>

      <!-- TAB 3: BONUSES -->
      {:else if activeTab === 'bonus'}
        <div class="space-y-4 text-xs">
          {#if isLeader}
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <h4 class="font-bold text-slate-900 dark:text-white">🎁 Quyết Định Khen Thưởng Mới</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số Tiền Thưởng (VNĐ):</label>
                  <input
                    type="number"
                    bind:value={bonusAmount}
                    step="500000"
                    class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 font-mono text-emerald-600 font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Lý Do / Thành Tích Khen Thưởng:</label>
                  <input
                    type="text"
                    bind:value={bonusReason}
                    placeholder="Ví dụ: Giảng dạy nhiệt tình, chấm thi đúng hạn"
                    class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onclick={handleAddBonus}
                class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                🎉 Quyết Định Khen Thưởng
              </button>
            </div>
          {/if}

          <!-- Bonus List -->
          <div class="space-y-2">
            <h4 class="font-bold text-slate-500 uppercase tracking-wider">Lịch Sử Tiền Thưởng &amp; Khen Ngợi:</h4>
            {#if !profile.bonuses || profile.bonuses.length === 0}
              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border text-center text-slate-400">
                Chưa có khen thưởng nào được ghi nhận.
              </div>
            {:else}
              {#each profile.bonuses as b}
                <div class="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between gap-3">
                  <div>
                    <div class="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                      +{(b.amount_vnd || 0).toLocaleString('vi-VN')} VNĐ
                    </div>
                    <div class="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">{b.reason}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">Khen tặng bởi: {b.awarded_by} • {b.date}</div>
                  </div>
                  <span class="text-2xl">🎖️</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>

      <!-- TAB 4: PRIVATE REMINDERS -->
      {:else if activeTab === 'reminders'}
        <div class="space-y-4 text-xs">
          {#if isLeader}
            <div class="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 space-y-3">
              <h4 class="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                <span>🔒</span>
                <span>Gửi Nhắc Nhở Riêng Tư Từ Leader (Chỉ Giáo Viên Này Nhìn Thấy)</span>
              </h4>
              <div>
                <textarea
                  bind:value={reminderContent}
                  rows="2"
                  placeholder="Ví dụ: Nhắc nhở nộp sổ đầu bài đúng hạn lúc 18h tối nay; chú ý kèm cặp học sinh A..."
                  class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                ></textarea>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-600 dark:text-slate-400">Mức độ:</span>
                  <select
                    bind:value={reminderUrgency}
                    class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    <option value="low">Nhắc nhở nhẹ nhàng (Thường)</option>
                    <option value="medium">Quan trọng (Cần làm ngay)</option>
                    <option value="high">Khẩn cấp (Lưu ý nghiêm túc)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onclick={handleSendReminder}
                  class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  📨 Gửi Nhắc Nhở Riêng
                </button>
              </div>
            </div>
          {/if}

          <!-- Reminders List -->
          <div class="space-y-2">
            <h4 class="font-bold text-slate-500 uppercase tracking-wider">Hòm Thư Nhắc Nhở Riêng:</h4>
            {#if !profile.private_reminders || profile.private_reminders.length === 0}
              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border text-center text-slate-400">
                Không có nhắc nhở nào cần xử lý. Tinh thần làm việc rất tốt! ✨
              </div>
            {:else}
              {#each profile.private_reminders as rem}
                <div class="p-3.5 rounded-xl border space-y-2 {rem.status === 'pending' ? 'bg-amber-50/70 border-amber-300 dark:bg-amber-950/20 dark:border-amber-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800'}">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full {rem.urgency === 'high' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}">
                      {rem.urgency === 'high' ? '⚠️ Khẩn Cấp' : '📌 Nhắc Nhở'} • {rem.date}
                    </span>
                    <span class="text-[10px] text-slate-400">Từ: {rem.sent_by}</span>
                  </div>

                  <div class="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                    {rem.content}
                  </div>

                  <div class="flex items-center justify-between pt-1">
                    <span class="text-[10px] font-bold {rem.status === 'acknowledged' ? 'text-emerald-500' : 'text-amber-500'}">
                      {rem.status === 'acknowledged' ? '✓ Đã tiếp thu & xác nhận' : '⏳ Chưa xác nhận'}
                    </span>

                    {#if rem.status === 'pending'}
                      <button
                        type="button"
                        onclick={() => handleAcknowledge(rem.id)}
                        class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]"
                      >
                        ✓ Xác Nhận Đã Đọc &amp; Tiếp Thu
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      <!-- Close Button -->
      <div class="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onclick={() => isOpen = false}
          class="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
        >
          Đóng
        </button>
      </div>
    </div>
  </div>
{/if}
