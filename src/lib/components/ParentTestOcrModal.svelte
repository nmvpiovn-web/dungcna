<script>
  import { getAuthToken, saveParentTestRecord } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech.js';

  let { isOpen = $bindable(false), student = null, onSaved = () => {} } = $props();

  let uploadedImage = $state(null);
  let isSaving = $state(false);

  // Form Fields - NO pre-filled sample scores!
  let testName = $state('');
  let testType = $state('standard_45m');
  let score = $state('');
  let maxScore = $state(10);
  let testDate = $state(new Date().toISOString().split('T')[0]);
  let teacherFeedback = $state('');
  let statusMessage = $state('');

  const testTypes = [
    { id: 'quick_15m', label: '⚡ Kiểm Tra 15 Phút Nhanh' },
    { id: 'standard_45m', label: '⏱️ Đề 1 Tiết 45 Phút Chuẩn' },
    { id: 'midterm_test', label: '📑 Khảo Sát Giữa Học Kỳ' },
    { id: 'final_test', label: '🏆 Đề Thi Cuối Kỳ' },
    { id: 'cambridge_test', label: '🌍 Bài Test Cambridge / Tiếng Anh Quốc Tế' },
    { id: 'other', label: '📝 Bài Kiểm Tra Khác' }
  ];

  // Reset form cleanly whenever modal opens or child changes (prevent data leak across children)
  $effect(() => {
    if (isOpen) {
      resetForm();
    }
  });

  function resetForm() {
    testName = '';
    testType = 'standard_45m';
    score = '';
    maxScore = 10;
    testDate = new Date().toISOString().split('T')[0];
    teacherFeedback = '';
    uploadedImage = null;
    statusMessage = '';
    isSaving = false;
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      statusMessage = '⚠️ Dung lượng ảnh tối đa là 5MB!';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      // Image is purely an attachment document, NOT proof of verified score
      uploadedImage = event.target.result;
      statusMessage = '📷 Đã đính kèm ảnh chụp bài thi (tài liệu tham khảo, chưa xác thực).';
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!student || !student.id) {
      statusMessage = '⚠️ Chưa xác định được học sinh liên kết!';
      return;
    }

    const cleanName = testName.trim();
    if (!cleanName) {
      statusMessage = '⚠️ Vui lòng nhập Tên bài kiểm tra / Chuyên đề!';
      return;
    }

    if (score === '' || isNaN(Number(score))) {
      statusMessage = '⚠️ Vui lòng nhập điểm số đạt được!';
      return;
    }

    const numScore = Number(score);
    const numMax = Number(maxScore) || 10;

    if (!isFinite(numScore) || numScore < 0 || numScore > numMax) {
      statusMessage = `⚠️ Điểm số không hợp lệ! Phải là số từ 0 đến ${numMax}.`;
      return;
    }

    isSaving = true;
    statusMessage = '';

    try {
      const token = getAuthToken();
      const res = await fetch('/api/parents/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          student_id: student.id,
          test_name: cleanName,
          test_type: testType,
          score: numScore,
          max_score: numMax,
          test_date: testDate,
          teacher_feedback: teacherFeedback.trim(),
          image_url: uploadedImage || ''
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        playAudioFeedback('correct');
        onSaved(data.record);
        isOpen = false;
        resetForm();
      } else {
        statusMessage = `⚠️ ${data.error || 'Có lỗi xảy ra khi lưu hồ sơ bài thi vào máy chủ!'}`;
      }
    } catch (err) {
      statusMessage = `⚠️ Lỗi kết nối máy chủ: ${err.message || err}`;
    } finally {
      isSaving = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
    <div class="w-full max-w-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-3xl shadow-2xl overflow-hidden relative font-sans text-slate-800 dark:text-slate-100 flex flex-col max-h-[92vh]">
      
      <!-- Modal Header -->
      <div class="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 dark:from-purple-950 dark:via-slate-900 dark:to-slate-950 p-6 text-white border-b border-purple-500/20 relative">
        <button
          onclick={() => isOpen = false}
          class="absolute top-4 right-4 text-purple-100 hover:text-white p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-xs transition-all"
          title="Đóng"
        >
          ✕
        </button>

        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-md">
            📝
          </div>
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-purple-200">SỔ PHỤ HUYNH • THEO DÕI ĐIỂM SỐ</div>
            <h2 class="text-xl font-heading font-black">
              Khai Báo Điểm Bài Thi {student ? `của con: ${student.name}` : ''}
            </h2>
            <div class="text-xs text-purple-100 mt-0.5">Phụ huynh tự nhập điểm bài thi định kỳ để cùng Cô Dung theo dõi tiến độ</div>
          </div>
        </div>
      </div>

      <!-- Regulatory Policy Notice Banner -->
      <div class="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 p-3.5 px-6 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
        <span class="text-base leading-none">ℹ️</span>
        <div class="text-[11px] leading-relaxed">
          <strong>Lưu ý quy chế minh bạch:</strong> Điểm số do phụ huynh tự khai báo phục vụ theo dõi học tập của gia đình, mang trạng thái <strong>Chưa xác thực (Unverified)</strong>. Hệ thống không sử dụng dữ liệu này để cộng sao thưởng, giảm trừ học phí hoặc thay thế điểm thi chính thức của lớp.
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
        {#if statusMessage}
          <div class="p-3 rounded-2xl text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300">
            {statusMessage}
          </div>
        {/if}

        <!-- Attachment upload box (No OCR scanning claim) -->
        <div class="p-4 rounded-2xl border border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/40 dark:bg-purple-950/20 text-center space-y-2">
          {#if !uploadedImage}
            <div class="flex items-center justify-between text-left">
              <div>
                <strong class="text-xs font-bold text-slate-800 dark:text-white block">
                  Đính kèm ảnh chụp bài kiểm tra (Tùy chọn)
                </strong>
                <span class="text-slate-500 dark:text-slate-400 text-[11px] block mt-0.5">
                  Lưu trữ hình ảnh để đối chiếu khi cần. Dung lượng tối đa 5MB.
                </span>
              </div>
              <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-sm cursor-pointer transition-all">
                <span>📎 Tải ảnh</span>
                <input type="file" accept="image/*" onchange={handleFileSelect} class="hidden" />
              </label>
            </div>
          {:else}
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <img src={uploadedImage} alt="Bài thi đính kèm" class="w-14 h-14 rounded-xl object-cover border border-purple-400 shadow-sm" />
                <div class="text-left">
                  <div class="font-bold text-slate-800 dark:text-white text-xs">Ảnh bài thi đã đính kèm</div>
                  <div class="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Tài liệu tham khảo (Chưa xác minh)</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-[11px] text-purple-600 dark:text-purple-400 font-bold underline cursor-pointer">
                  Đổi ảnh
                  <input type="file" accept="image/*" onchange={handleFileSelect} class="hidden" />
                </label>
                <button
                  type="button"
                  onclick={() => uploadedImage = null}
                  class="text-[11px] text-rose-500 hover:text-rose-700 font-bold ml-2"
                >
                  Gỡ ảnh
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- FORM INPUTS -->
        <div class="space-y-3 pt-1">
          <div>
            <label for="parent-test-name" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên Bài Kiểm Tra / Chuyên Đề (*):
            </label>
            <input
              id="parent-test-name"
              type="text"
              bind:value={testName}
              required
              placeholder="VD: Khảo sát 15 phút Unit 2, Đề kiểm tra 1 tiết giữa kỳ..."
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label for="parent-test-type" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại Bài Kiểm Tra:
              </label>
              <select
                id="parent-test-type"
                bind:value={testType}
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 text-xs"
              >
                {#each testTypes as t}
                  <option value={t.id}>{t.label}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="parent-score" class="block font-semibold text-purple-700 dark:text-purple-400 mb-1 font-bold">
                Điểm Số Đạt Được (*):
              </label>
              <input
                id="parent-score"
                type="number"
                step="0.1"
                min="0"
                max={maxScore}
                bind:value={score}
                required
                placeholder="VD: 8.5"
                class="w-full bg-purple-50/50 dark:bg-slate-950 border border-purple-300 dark:border-purple-700 rounded-xl px-3 py-2 text-base font-heading font-black text-purple-700 dark:text-purple-300 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label for="parent-date" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ngày Làm Bài:
              </label>
              <input
                id="parent-date"
                type="date"
                bind:value={testDate}
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 text-xs"
              />
            </div>
          </div>

          <div>
            <label for="parent-feedback" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Lời Phê / Nhận Xét Của Giáo Viên (Nếu có):
            </label>
            <textarea
              id="parent-feedback"
              rows="2"
              bind:value={teacherFeedback}
              placeholder="VD: Con làm bài cẩn thận, phát âm tốt..."
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
            ></textarea>
          </div>
        </div>

        <!-- Action Button -->
        <button
          type="button"
          disabled={isSaving}
          onclick={handleSave}
          class="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/25 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
        >
          {#if isSaving}
            <span class="inline-block animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
            <span>Đang lưu trữ vào máy chủ...</span>
          {:else}
            <span>💾 Lưu Điểm Bài Thi Vào Sổ Theo Dõi</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
