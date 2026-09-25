<script>
  import { saveParentTestRecord, simulateOcrFromImage } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech.js';

  let { isOpen = $bindable(false), student = null, onSaved = () => {} } = $props();

  let activeTab = $state('ocr'); // 'ocr' | 'manual'
  let uploadedImage = $state(null);
  let isScanning = $state(false);
  let scanProgress = $state(0);
  let ocrScanMessage = $state('');
  let rawOcrText = $state('');

  // Form Fields
  let testName = $state('Bài Kiểm Tra Định Kỳ Mới');
  let testType = $state('standard_45m');
  let score = $state(9.0);
  let maxScore = $state(10);
  let testDate = $state(new Date().toISOString().split('T')[0]);
  let teacherFeedback = $state('');
  let statusMessage = $state('');

  const testTypes = [
    { id: 'quick_15m', label: '⚡ Kiểm Tra 15 Phút Nhanh' },
    { id: 'standard_45m', label: '⏱️ Đề 1 Tiết 45 Phút Chuẩn' },
    { id: 'midterm_test', label: '📑 Khảo Sát Giữa Học Kỳ' },
    { id: 'final_test', label: '🏆 Đề Thi Cuối Kỳ' },
    { id: 'cambridge_test', label: '🌍 Bài Test Cambridge / Tiếng Anh Quốc Tế' }
  ];

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      statusMessage = '⚠️ Dung lượng ảnh tối đa là 5MB!';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      uploadedImage = event.target.result;
      await runOcrProcess(uploadedImage);
    };
    reader.readAsDataURL(file);
  }

  async function runOcrProcess(imgData) {
    isScanning = true;
    scanProgress = 20;
    ocrScanMessage = 'Đang căn chỉnh độ nét và nhận diện khung bài thi...';

    const interval = setInterval(() => {
      if (scanProgress < 85) scanProgress += 20;
    }, 250);

    try {
      const res = await simulateOcrFromImage(imgData);
      clearInterval(interval);
      scanProgress = 100;
      isScanning = false;
      ocrScanMessage = '✅ Nhận diện OCR thành công! Đã tự động điền điểm số và lời phê:';

      // Auto populate form
      score = res.detected_score;
      maxScore = res.max_score;
      testName = res.detected_title;
      teacherFeedback = res.detected_feedback;
      testDate = res.detected_date;
      rawOcrText = res.raw_ocr_text;

      playAudioFeedback('correct');
    } catch (err) {
      clearInterval(interval);
      isScanning = false;
      ocrScanMessage = '⚠️ OCR không nhận diện được rõ nét, vui lòng chỉnh sửa thông tin thủ công:';
    }
  }

  function handleSave() {
    if (!student) {
      statusMessage = '⚠️ Chưa xác định được học sinh liên kết!';
      return;
    }

    try {
      const saved = saveParentTestRecord({
        student_id: student.id,
        student_name: student.name,
        test_name: testName,
        test_type: testType,
        score: Number(score) || 0,
        max_score: Number(maxScore) || 10,
        test_date: testDate,
        teacher_feedback: teacherFeedback,
        ocr_status: uploadedImage ? 'ocr_verified' : 'manual_entry',
        ocr_raw_text: rawOcrText,
        image_url: uploadedImage || ''
      });

      playAudioFeedback('correct');
      onSaved(saved);
      isOpen = false;
    } catch (err) {
      statusMessage = err.message || 'Lỗi khi lưu bài thi';
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
            📸
          </div>
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-purple-200">SỔ PHỤ HUYNH THÔNG MINH</div>
            <h2 class="text-xl font-heading font-black">
              Cập Nhật Điểm Bài Thi {student ? `của con: ${student.name}` : ''}
            </h2>
            <div class="text-xs text-purple-100 mt-0.5">Tải ảnh chụp bài thi để máy tự động quét điểm (OCR) hoặc nhập thủ công</div>
          </div>
        </div>
      </div>

      <!-- Tab Switcher -->
      <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/50 p-1.5 text-xs font-bold">
        <button
          onclick={() => activeTab = 'ocr'}
          class="flex-1 py-2 rounded-xl transition-all {activeTab === 'ocr' ? 'bg-white dark:bg-purple-600 text-purple-700 dark:text-white shadow-sm font-extrabold' : 'text-slate-500 dark:text-slate-400'}"
        >
          📸 Chụp / Tải Ảnh Bài Thi (Tự Động OCR Điểm)
        </button>
        <button
          onclick={() => activeTab = 'manual'}
          class="flex-1 py-2 rounded-xl transition-all {activeTab === 'manual' ? 'bg-white dark:bg-purple-600 text-purple-700 dark:text-white shadow-sm font-extrabold' : 'text-slate-500 dark:text-slate-400'}"
        >
          ✍️ Nhập Điểm Thủ Công
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
        {#if statusMessage}
          <div class="p-3 rounded-2xl text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300">
            {statusMessage}
          </div>
        {/if}

        <!-- TAB 1: OCR PHOTO SCAN -->
        {#if activeTab === 'ocr'}
          <div class="p-5 rounded-2xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/40 dark:bg-purple-950/20 text-center space-y-3">
            {#if !uploadedImage}
              <div class="text-4xl">📄</div>
              <div>
                <strong class="text-sm font-bold text-slate-800 dark:text-white block">
                  Chọn ảnh chụp bài kiểm tra giấy của con
                </strong>
                <span class="text-slate-500 dark:text-slate-400 text-[11px] block mt-1">
                  Hệ thống OCR sẽ tự động nhận dạng điểm số, tên bài và lời phê của giáo viên.
                </span>
              </div>

              <label class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md cursor-pointer transition-all">
                <span>📷 Tải Hoặc Chụp Ảnh Bài Thi</span>
                <input type="file" accept="image/*" onchange={handleFileSelect} class="hidden" />
              </label>
            {:else}
              <div class="flex items-center justify-center gap-4">
                <img src={uploadedImage} alt="Bài thi chụp" class="w-24 h-24 rounded-2xl object-cover border-2 border-purple-400 shadow-md" />
                <div class="text-left space-y-1">
                  <div class="font-bold text-slate-800 dark:text-white">Ảnh Bài Thi Đã Tải Lên</div>
                  <label class="text-[11px] text-purple-600 dark:text-purple-400 font-bold underline cursor-pointer">
                    Chọn ảnh khác
                    <input type="file" accept="image/*" onchange={handleFileSelect} class="hidden" />
                  </label>
                </div>
              </div>

              {#if isScanning}
                <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 space-y-2">
                  <div class="flex items-center justify-between text-[11px] font-bold text-purple-700 dark:text-purple-300">
                    <span>{ocrScanMessage}</span>
                    <span>{scanProgress}%</span>
                  </div>
                  <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div class="h-full bg-purple-600 transition-all duration-300" style="width: {scanProgress}%"></div>
                  </div>
                </div>
              {:else if ocrScanMessage}
                <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold text-left">
                  {ocrScanMessage}
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- EXTRACTED / EDITABLE SCORE FORM -->
        <div class="space-y-3 pt-2">
          <div class="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>Chi Tiết Điểm Bài Thi:</span>
            {#if uploadedImage && !isScanning}
              <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                ✓ OCR Đã Điền Tự Động
              </span>
            {/if}
          </div>

          <div>
            <label for="ocr-test-name" class="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tên Bài Kiểm Tra / Chuyên Đề (*):
            </label>
            <input
              id="ocr-test-name"
              type="text"
              bind:value={testName}
              required
              placeholder="VD: Kiểm tra 15 phút Unit 2, Khảo sát Giữa kỳ..."
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label for="ocr-test-type" class="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Loại Bài Kiểm Tra:
              </label>
              <select
                id="ocr-test-type"
                bind:value={testType}
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
              >
                {#each testTypes as t}
                  <option value={t.id}>{t.label}</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="ocr-score" class="block font-semibold text-purple-700 dark:text-purple-400 mb-1 font-bold">
                Điểm Số Đạt Được (*):
              </label>
              <input
                id="ocr-score"
                type="number"
                step="0.1"
                min="0"
                max={maxScore}
                bind:value={score}
                required
                class="w-full bg-purple-50/50 dark:bg-slate-950 border border-purple-300 dark:border-purple-700 rounded-xl px-3 py-2 text-base font-heading font-black text-purple-700 dark:text-purple-300 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label for="ocr-date" class="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Ngày Làm Bài:
              </label>
              <input
                id="ocr-date"
                type="date"
                bind:value={testDate}
                class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label for="ocr-feedback" class="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Lời Phê / Nhận Xét Của Giáo Viên (Nếu có):
            </label>
            <textarea
              id="ocr-feedback"
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
          onclick={handleSave}
          class="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/25 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 mt-4"
        >
          <span>💾 Lưu Điểm Bài Thi Vào Sổ Theo Dõi</span>
        </button>
      </div>
    </div>
  </div>
{/if}
