<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getAuthToken, setCurrentUser, updateUserProfile, POPULAR_SCHOOLS, isTeacherOrAdmin, requestUnlockClass } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech.js';

  let { isOpen = $bindable(false) } = $props();

  let currentUser = $state(null);
  let name = $state('');
  let phone = $state('');
  let zaloId = $state('');
  let email = $state('');
  let avatar = $state('');
  let grade = $state('');
  let school = $state('');
  let target = $state('');
  let statusMessage = $state('');
  let profileVersion = $state(null); // Integer CAS version from server
  let originalProfile = {};
  let isSaving = $state(false);

  let showTransferModal = $state(false);
  let requestedTargetGrade = $state('');
  let transferReason = $state('');
  let isSendingTransfer = $state(false);
  let isAdminOrTeacher = $derived(currentUser ? isTeacherOrAdmin(currentUser) : false);

  const presetAvatars = [
    { label: '👦 Bé trai', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix' },
    { label: '👧 Bé gái', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Mia' },
    { label: '🎒 Học sinh', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
    { label: '👩‍🏫 Cô giáo', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150' },
    { label: '👨‍🏫 Thầy giáo', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
    { label: '👨‍👩‍👧 Phụ huynh', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150' }
  ];

  const gradeOptions = [
    'Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5',
    'Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9',
    'Lớp 10', 'Lớp 11', 'Lớp 12',
    'Ôn Thi THPT Quốc Gia 2026',
    'Luyện Thi IELTS Academic',
    'Luyện Thi TOEIC (Thang 990)',
    'Luyện Thi TOEFL iBT'
  ];

  $effect(() => {
    if (isOpen) {
      statusMessage = '';
      loadProfileData();
    }
  });

  async function loadProfileData() {
    currentUser = getCurrentUser();
    if (!currentUser) return;

    // Try to fetch authoritative profile from server (includes profile_version for CAS)
    try {
      const token = getAuthToken();
      if (token) {
        const res = await fetch('/api/users/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            currentUser = data.user;
            profileVersion = data.profile_version || null;
          }
        }
      }
    } catch {
      // API unavailable — fall back to local store data
    }

    name = currentUser.name || '';
    phone = currentUser.phone || '';
    email = currentUser.email || '';
    avatar = currentUser.avatar || presetAvatars[0].url;

    let meta = {};
    try {
      meta = typeof currentUser.metadata === 'string' ? JSON.parse(currentUser.metadata) : (currentUser.metadata || {});
    } catch {}

    zaloId = meta.zalo_id || meta.zalo_phone || phone;
    grade = currentUser.grade || meta.grade || '';
    requestedTargetGrade = grade || '';
    school = meta.school || '';
    target = meta.target || `Chương trình ${grade}`;
    originalProfile = { name, phone, email, avatar, school, target, zalo_id: zaloId, grade };
  }

  async function handleSendClassTransferRequest() {
    if (!currentUser) return;
    isSendingTransfer = true;
    try {
      const res = await requestUnlockClass(currentUser.id, requestedTargetGrade, transferReason);
      if (res.success) {
        statusMessage = `✅ Đã gửi yêu cầu chuyển sang ${requestedTargetGrade} tới Cô Dung thành công!`;
        playAudioFeedback('correct');
        showTransferModal = false;
        transferReason = '';
      } else {
        statusMessage = res.error || 'Có lỗi xảy ra khi gửi yêu cầu!';
      }
    } catch (err) {
      statusMessage = err.message || 'Lỗi kết nối';
    } finally {
      isSendingTransfer = false;
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      statusMessage = '⚠️ Dung lượng ảnh không được vượt quá 2MB!';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      avatar = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    isSaving = true;
    statusMessage = '';

    try {
      const token = getAuthToken();
      const payload = {
        name: name.trim(),
        phone: phone ? phone.trim() : '',
        email: email ? email.trim() : '',
        avatar,
        school: school ? school.trim() : '',
        target: target ? target.trim() : '',
        zalo_id: zaloId ? zaloId.trim() : ''
      };

      if (isAdminOrTeacher && grade) {
        payload.grade = grade;
      }

      // Include CAS version for concurrency guard
      if (profileVersion != null) {
        payload.expected_version = profileVersion;
      }

      for (const key of Object.keys(payload)) {
        if (key === 'expected_version') continue; // Don't strip version field
        if (payload[key] === originalProfile[key]) delete payload[key];
      }
      const res = await fetch('/api/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        statusMessage = '✅ Cập nhật hồ sơ thành công!';
        if (data.user) {
          currentUser = setCurrentUser(data.user);
        }
        // Update version for any subsequent saves in the same session
        if (data.profile_version) {
          profileVersion = data.profile_version;
        }
        playAudioFeedback('correct');
        setTimeout(() => {
          isOpen = false;
          isSaving = false;
        }, 500);
      } else if (res.status === 409 && data.error?.includes('ConcurrencyConflict')) {
        // Keep the submitted dirty fields, refresh the server baseline/version,
        // then restore only those edits for explicit user review and retry.
        const draft = { ...payload };
        delete draft.expected_version;
        await loadProfileData();
        if ('name' in draft) name = draft.name;
        if ('phone' in draft) phone = draft.phone;
        if ('email' in draft) email = draft.email;
        if ('avatar' in draft) avatar = draft.avatar;
        if ('school' in draft) school = draft.school;
        if ('target' in draft) target = draft.target;
        if ('zalo_id' in draft) zaloId = draft.zalo_id;
        if ('grade' in draft) grade = draft.grade;
        statusMessage = '⚠️ Hồ sơ đã được cập nhật bởi phiên khác. Các chỉnh sửa của bạn được giữ lại; vui lòng đối chiếu và nhấn Lưu nếu muốn áp dụng.';
        isSaving = false;
      } else {
        statusMessage = `⚠️ ${data.error || 'Có lỗi xảy ra khi lưu hồ sơ vào máy chủ!'}`;
        isSaving = false;
      }
    } catch (err) {
      statusMessage = `⚠️ Lỗi kết nối máy chủ: ${err.message || err}`;
      isSaving = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) isOpen = false; }} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
    onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden relative font-sans text-slate-800 dark:text-slate-100 flex flex-col max-h-[92vh]">
      
      <!-- Modal Header (Academic Ledger Style) -->
      <div class="bg-slate-900 p-5 text-slate-100 border-b border-slate-800 relative">
        <button
          onclick={() => isOpen = false}
          class="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs transition-colors"
          title="Đóng"
        >
          ✕
        </button>

        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-xl">
            👤
          </div>
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wider text-sky-400">TIẾNG ANH CÔ DUNG</div>
            <h2 class="text-lg font-semibold text-white">Chỉnh Sửa Hồ Sơ Cá Nhân</h2>
          </div>
        </div>
      </div>

      <!-- Modal Body -->
      <form onsubmit={handleSaveProfile} class="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
        {#if statusMessage}
          <div class="p-3 rounded-md text-xs font-semibold {statusMessage.includes('✅') ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'}">
            {statusMessage}
          </div>
        {/if}

        <!-- Avatar Selection -->
        <div class="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="font-semibold text-slate-700 dark:text-slate-300">Ảnh Đại Diện (Avatar):</div>
          
          <div class="flex items-center gap-4">
            <img src={avatar} alt="Avatar Preview" class="w-16 h-16 rounded-md object-cover border border-slate-300 dark:border-slate-700 shadow-xs bg-white" />
            
            <div class="flex-1 space-y-1.5">
              <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Tải ảnh từ máy tính hoặc điện thoại:
              </label>
              <input
                type="file"
                accept="image/*"
                onchange={handleFileUpload}
                class="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sky-700 file:text-white hover:file:bg-sky-600 cursor-pointer"
              />
            </div>
          </div>

          <!-- Quick Avatar Presets -->
          <div>
            <div class="text-[11px] text-slate-500 uppercase font-semibold mb-1.5">Hoặc chọn avatar gợi ý:</div>
            <div class="flex items-center gap-2 overflow-x-auto pb-1">
              {#each presetAvatars as p}
                <button
                  type="button"
                  onclick={() => avatar = p.url}
                  class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors text-[11px] whitespace-nowrap {avatar === p.url ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'}"
                >
                  <img src={p.url} alt={p.label} class="w-5 h-5 rounded-full object-cover" />
                  <span>{p.label}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- Name & Contact -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="prof-name" class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Họ và Tên (*):
            </label>
            <input
              id="prof-name"
              type="text"
              bind:value={name}
              required
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label for="prof-phone" class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Số Điện Thoại (*):
            </label>
            <input
              id="prof-phone"
              type="text"
              bind:value={phone}
              required
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <!-- Zalo & Email -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="prof-zalo" class="block font-bold text-blue-600 dark:text-blue-400 mb-1">
              💬 Số Zalo / Zalo ID (* Nhận báo cáo):
            </label>
            <input
              id="prof-zalo"
              type="text"
              bind:value={zaloId}
              placeholder="VD: 0912345678 hoặc nick zalo"
              class="w-full bg-blue-50/50 dark:bg-slate-950 border border-blue-300 dark:border-blue-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
            <span class="text-xs text-slate-500 block mt-1">Dùng để Bot Zalo Cô Dung gửi phiếu học phí &amp; kết quả thi.</span>
          </div>

          <div>
            <label for="prof-email" class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Địa Chỉ Email:
            </label>
            <input
              id="prof-email"
              type="email"
              bind:value={email}
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <!-- Grade & School (with Role-based Security & Transfer Request) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="prof-grade" class="block font-bold text-slate-700 dark:text-slate-300">
                Khối Lớp Học Tập:
              </label>
              {#if !isAdminOrTeacher}
                <span class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  🔒 Cố định
                </span>
              {/if}
            </div>

            {#if isAdminOrTeacher}
              <select
                id="prof-grade"
                bind:value={grade}
                class="w-full bg-slate-50 dark:bg-slate-950 border border-emerald-400 dark:border-emerald-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-semibold"
              >
                {#each gradeOptions as g}
                  <option value={g}>{g}</option>
                {/each}
              </select>
              <span class="text-xs text-emerald-600 dark:text-emerald-400 block mt-1">
                ⭐ Bạn là Giáo viên/Admin: Có toàn quyền đổi khối lớp trực tiếp.
              </span>
            {:else}
              <div class="relative">
                <input
                  id="prof-grade"
                  type="text"
                  value={grade}
                  disabled
                  class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-600 dark:text-slate-400 font-bold cursor-not-allowed select-none"
                />
              </div>
              <div class="mt-1.5 flex items-center justify-between text-[11px]">
                <span class="text-slate-500 dark:text-slate-400">Chỉ Cô Dung mới có quyền đổi lớp.</span>
                <button
                  type="button"
                  onclick={() => showTransferModal = !showTransferModal}
                  class="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold underline cursor-pointer flex items-center gap-1"
                >
                  <span>📩</span> {showTransferModal ? 'Đóng form' : 'Yêu cầu chuyển lớp'}
                </button>
              </div>

              {#if showTransferModal}
                <div class="p-3 mt-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-2 animate-in fade-in duration-200">
                  <div class="font-semibold flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                    <span>📩</span> Gửi Yêu Cầu Chuyển Khối Lớp Tới Cô Dung
                  </div>
                  <p class="text-[11px] text-slate-600 dark:text-slate-300">
                    Chọn khối lớp bạn mong muốn chuyển sang. Cô Dung sẽ xét duyệt và cập nhật trong AdminCP.
                  </p>
                  <div>
                    <label for="req-target-grade" class="block font-semibold text-[11px] mb-1">Khối lớp mong muốn:</label>
                    <select
                      id="req-target-grade"
                      bind:value={requestedTargetGrade}
                      class="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    >
                      {#each gradeOptions as g}
                        <option value={g}>{g}</option>
                      {/each}
                    </select>
                  </div>
                  <div>
                    <label for="req-transfer-reason" class="block font-semibold text-[11px] mb-1">Lý do / Nguyện vọng:</label>
                    <input
                      id="req-transfer-reason"
                      type="text"
                      bind:value={transferReason}
                      placeholder="VD: Em muốn học thêm IELTS / Em lên lớp mới..."
                      class="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div class="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSendingTransfer}
                      onclick={handleSendClassTransferRequest}
                      class="flex-1 py-1.5 px-3 rounded-md bg-amber-700 hover:bg-amber-600 text-white font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                    >
                      {isSendingTransfer ? '⏳ Đang gửi...' : '🚀 Gửi Yêu Cầu Ngay'}
                    </button>
                    <button
                      type="button"
                      onclick={() => showTransferModal = false}
                      class="py-1.5 px-3 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-semibold text-xs"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              {/if}
            {/if}
          </div>

          <div>
            <label for="prof-school" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Trường Đang Theo Học (Có gợi ý):
            </label>
            <input
              id="prof-school"
              type="text"
              list="popular-schools-list"
              bind:value={school}
              placeholder="Gõ để xem gợi ý trường tiêu biểu..."
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
            />
            <datalist id="popular-schools-list">
              {#each POPULAR_SCHOOLS as sch}
                <option value={sch.name}>{sch.gradeLevel}</option>
              {/each}
            </datalist>
          </div>
        </div>

        <!-- Target / Goal -->
        <div>
          <label for="prof-target" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Mục Tiêu Học Tập &amp; Điểm Số Hướng Tới:
          </label>
          <input
            id="prof-target"
            type="text"
            bind:value={target}
            placeholder="VD: Đạt 9.0+ trên lớp, Chinh phục IELTS 7.5+, Thi đỗ Chuyên Anh..."
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        <!-- Action Button -->
        <button
          type="submit"
          disabled={isSaving}
          class="w-full py-2.5 rounded-md bg-sky-700 hover:bg-sky-600 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 mt-4"
        >
          <span>{isSaving ? '⏳ Đang lưu hồ sơ...' : '💾 Lưu Thay Đổi Hồ Sơ'}</span>
        </button>
      </form>
    </div>
  </div>
{/if}
