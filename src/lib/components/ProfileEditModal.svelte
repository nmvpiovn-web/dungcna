<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, updateUserProfile, POPULAR_SCHOOLS } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech.js';

  let { isOpen = $bindable(false) } = $props();

  let currentUser = $state(null);
  let name = $state('');
  let phone = $state('');
  let zaloId = $state('');
  let email = $state('');
  let avatar = $state('');
  let grade = $state('Lớp 7');
  let school = $state('');
  let target = $state('');
  let statusMessage = $state('');
  let isSaving = $state(false);

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
      loadProfileData();
    }
  });

  function loadProfileData() {
    currentUser = getCurrentUser();
    if (!currentUser) return;

    name = currentUser.name || '';
    phone = currentUser.phone || '';
    email = currentUser.email || '';
    avatar = currentUser.avatar || presetAvatars[0].url;

    let meta = {};
    try {
      meta = typeof currentUser.metadata === 'string' ? JSON.parse(currentUser.metadata) : (currentUser.metadata || {});
    } catch {}

    zaloId = meta.zalo_id || meta.zalo_phone || phone;
    grade = meta.grade || 'Lớp 7';
    school = meta.school || '';
    target = meta.target || `Chương trình ${grade}`;
    statusMessage = '';
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

  function handleSaveProfile(e) {
    if (e) e.preventDefault();
    if (!currentUser) return;

    isSaving = true;
    statusMessage = '';

    try {
      const res = updateUserProfile(currentUser.id, {
        name,
        phone,
        email,
        avatar,
        grade,
        school,
        target,
        zalo_id: zaloId,
        zalo_phone: zaloId
      });

      if (res.success) {
        statusMessage = '✅ Cập nhật hồ sơ thành công!';
        playAudioFeedback('correct');
        setTimeout(() => {
          isOpen = false;
          isSaving = false;
        }, 400);
      } else {
        statusMessage = res.error || 'Có lỗi xảy ra khi lưu hồ sơ!';
        isSaving = false;
      }
    } catch (err) {
      statusMessage = err.message || 'Lỗi cập nhật';
      isSaving = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
    <div class="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative font-sans text-slate-800 dark:text-slate-100 flex flex-col max-h-[92vh]">
      
      <!-- Modal Header -->
      <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 dark:from-emerald-950 dark:via-slate-900 dark:to-slate-950 p-6 text-white border-b border-emerald-500/20 relative">
        <button
          onclick={() => isOpen = false}
          class="absolute top-4 right-4 text-emerald-100 hover:text-white p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-xs transition-all"
          title="Đóng"
        >
          ✕
        </button>

        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-md">
            👤
          </div>
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-100">TIẾNG ANH CÔ DUNG</div>
            <h2 class="text-xl font-heading font-black">Chỉnh Sửa Hồ Sơ Cá Nhân</h2>
          </div>
        </div>
      </div>

      <!-- Modal Body -->
      <form onsubmit={handleSaveProfile} class="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
        {#if statusMessage}
          <div class="p-3 rounded-2xl text-xs font-semibold {statusMessage.includes('✅') ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300' : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300'}">
            {statusMessage}
          </div>
        {/if}

        <!-- Avatar Selection -->
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="font-bold text-slate-700 dark:text-slate-300">Ảnh Đại Diện (Avatar):</div>
          
          <div class="flex items-center gap-4">
            <img src={avatar} alt="Avatar Preview" class="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500 shadow-md bg-white" />
            
            <div class="flex-1 space-y-1.5">
              <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Tải ảnh từ máy tính hoặc điện thoại:
              </label>
              <input
                type="file"
                accept="image/*"
                onchange={handleFileUpload}
                class="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          <!-- Quick Avatar Presets -->
          <div>
            <div class="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Hoặc chọn avatar gợi ý:</div>
            <div class="flex items-center gap-2 overflow-x-auto pb-1">
              {#each presetAvatars as p}
                <button
                  type="button"
                  onclick={() => avatar = p.url}
                  class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-[11px] whitespace-nowrap {avatar === p.url ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-bold' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'}"
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
            <span class="text-[10px] text-slate-500 block mt-0.5">Dùng để Bot Zalo Cô Dung gửi phiếu học phí &amp; kết quả thi.</span>
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

        <!-- Grade & School (with Datalist Recommendations) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="prof-grade" class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Khối Lớp Hiện Tại:
            </label>
            <select
              id="prof-grade"
              bind:value={grade}
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            >
              {#each gradeOptions as g}
                <option value={g}>{g}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="prof-school" class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Trường Đang Theo Học (Có gợi ý):
            </label>
            <input
              id="prof-school"
              type="text"
              list="popular-schools-list"
              bind:value={school}
              placeholder="Gõ để xem gợi ý trường tiêu biểu..."
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
          <label for="prof-target" class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            Mục Tiêu Học Tập &amp; Điểm Số Hướng Tới:
          </label>
          <input
            id="prof-target"
            type="text"
            bind:value={target}
            placeholder="VD: Đạt 9.0+ trên lớp, Chinh phục IELTS 7.5+, Thi đỗ Chuyên Anh..."
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <!-- Action Button -->
        <button
          type="submit"
          disabled={isSaving}
          class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/25 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 mt-4"
        >
          <span>{isSaving ? '⏳ Đang lưu hồ sơ...' : '💾 Lưu Thay Đổi Hồ Sơ'}</span>
        </button>
      </form>
    </div>
  </div>
{/if}
