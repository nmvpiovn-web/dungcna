<script>
  import { onMount, onDestroy } from 'svelte';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';

  let { isOpen = $bindable(false), onClose = () => {} } = $props();

  // Wizard Steps: 'setup' | 'testing' | 'result'
  let step = $state('setup');

  // Step 1 Form
  let candidateName = $state('Học Sinh Khách');
  let selectedGrade = $state('lop_7');
  let selectedDuration = $state('5m'); // '5m' | '15m' | '45m'
  let isStarting = $state(false);
  let errorMsg = $state('');

  // Step 2 Testing State
  let guestSessionId = $state('');
  let guestToken = $state('');
  let questions = $state([]);
  let answers = $state({});
  let timeLeftSeconds = $state(300);
  let timerInterval = $state(null);
  let isSubmitting = $state(false);

  // Step 3 Result & Lead State
  let examResult = $state(null);
  let leadPhone = $state('');
  let leadTarget = $state('Nâng cao điểm số & Luyện phát âm');
  let leadNotes = $state('');
  let isSubmittingLead = $state(false);
  let leadSuccessMsg = $state('');

  function handleReset() {
    if (timerInterval) clearInterval(timerInterval);
    step = 'setup';
    examResult = null;
    leadSuccessMsg = '';
    leadPhone = '';
    isOpen = false;
    onClose();
  }

  function handleDismiss() {
    if (step === 'testing') {
      if (typeof window !== 'undefined' && !window.confirm('Bạn có chắc muốn dừng bài khảo sát và thoát? Tiến độ làm bài hiện tại sẽ không được lưu.')) {
        return;
      }
    }
    handleReset();
  }

  // Keyboard Escape & Mobile Back Listener
  onMount(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        handleDismiss();
      }
    }

    function handlePopState() {
      if (isOpen) {
        handleDismiss();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (timerInterval) clearInterval(timerInterval);
    };
  });

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval);
  });

  // Start Guest Test
  async function handleStartTest(e) {
    if (e) e.preventDefault();
    isStarting = true;
    errorMsg = '';

    // Check supported grades
    const supportedGrades = ['lop_7', 'lop_12'];
    if (!supportedGrades.includes(selectedGrade)) {
      isStarting = false;
      const gradeLabel = selectedGrade.replace('lop_', 'Lớp ');
      errorMsg = `Ngân hàng đề thi thử cho ${gradeLabel} đang được biên soạn và thẩm định theo chuẩn GDPT 2026. Hiện tại bạn có thể trải nghiệm đề kiểm tra chuẩn Lớp 7 hoặc Lớp 12!`;
      return;
    }

    try {
      const res = await fetch('/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          candidate_name: candidateName.trim() || 'Học Sinh Khách',
          grade: selectedGrade,
          duration_type: selectedDuration
        })
      });

      const data = await res.json();
      if (data.success) {
        guestSessionId = data.guest_session_id;
        guestToken = data.guest_token;
        questions = data.questions || [];
        answers = {};
        timeLeftSeconds = data.duration_minutes * 60;
        step = 'testing';
        startTimer();
      } else {
        errorMsg = data.error || 'Không thể khởi tạo bài thi thử.';
      }
    } catch (err) {
      errorMsg = 'Lỗi kết nối máy chủ: ' + err.message;
    } finally {
      isStarting = false;
    }
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeftSeconds -= 1;
      if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval);
        handleSubmitTest();
      }
    }, 1000);
  }

  let formattedTime = $derived.by(() => {
    const mins = Math.floor(Math.max(0, timeLeftSeconds) / 60);
    const secs = Math.max(0, timeLeftSeconds) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  // Submit Guest Test
  async function handleSubmitTest() {
    if (isSubmitting) return;
    if (timerInterval) clearInterval(timerInterval);
    isSubmitting = true;

    try {
      const durMins = selectedDuration === '45m' ? 45 : selectedDuration === '30m' ? 30 : selectedDuration === '15m' ? 15 : 5;
      const durationSeconds = durMins * 60 - timeLeftSeconds;
      const res = await fetch('/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          guest_session_id: guestSessionId,
          guest_token: guestToken,
          answers: answers,
          duration_seconds: Math.max(10, durationSeconds)
        })
      });

      const data = await res.json();
      if (data.success) {
        examResult = data.result;
        step = 'result';
        playAudioFeedback(true);
      } else {
        alert(data.error || 'Nộp bài thất bại');
      }
    } catch (err) {
      alert('Lỗi nộp bài: ' + err.message);
    } finally {
      isSubmitting = false;
    }
  }

  // Voluntary Lead Submission
  async function handleSendLead(e) {
    if (e) e.preventDefault();
    if (!leadPhone.trim()) return;

    isSubmittingLead = true;
    try {
      const res = await fetch('/api/exams/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'voluntary_lead',
          guest_session_id: guestSessionId,
          phone: leadPhone.trim(),
          student_target: leadTarget,
          parent_notes: leadNotes.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        leadSuccessMsg = data.message || 'Đã gửi thông tin thành công!';
        playAudioFeedback(true);
      } else {
        alert(data.error || 'Gửi thông tin thất bại');
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      isSubmittingLead = false;
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop with click-outside to close and Escape handling -->
  <div 
    class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="guest-modal-title"
    onclick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}
    onkeydown={(e) => { if (e.key === 'Escape') handleDismiss(); }}
    tabindex="-1"
  >
    <div class="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 text-sm max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-150">
      <!-- Modal Top Bar -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
          <h3 id="guest-modal-title" class="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            Khảo Sát Năng Lực Trực Tuyến (Thi Thử Miễn Phí)
          </h3>
          <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            Dành Cho Khách
          </span>
        </div>
        <button 
          type="button"
          onclick={handleDismiss} 
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-base"
          aria-label="Đóng khảo sát năng lực"
          title="Đóng (Escape)"
        >
          ✕
        </button>
      </div>

      <!-- STEP 1: ONBOARDING & SETUP -->
      {#if step === 'setup'}
        <div class="space-y-4 font-normal">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Chào Mừng Bạn Đến Với Tiếng Anh Cô Dung! 🌸</h2>
            <p class="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
              Bài thi thử thông minh giúp xác định trình độ chuẩn CEFR (A1 - C1), đánh giá phản xạ ngữ pháp, nghe và đọc hiểu điền từ mà không cần đăng ký tài khoản.
            </p>
          </div>

          {#if errorMsg}
            <div class="p-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800 text-xs font-medium">
              ⚠️ {errorMsg}
            </div>
          {/if}

          <form onsubmit={handleStartTest} class="space-y-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
              <label for="cand-name-input" class="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs">Tên của bạn hoặc học sinh:</label>
              <input 
                id="cand-name-input"
                type="text" 
                bind:value={candidateName}
                placeholder="VD: Nguyễn Hoàng Nam"
                class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-normal"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="cand-grade-select" class="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs">Khối lớp / Trình độ:</label>
                <select 
                  id="cand-grade-select"
                  bind:value={selectedGrade}
                  class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium"
                >
                  <optgroup label="Khối Lớp Đã Có Đề Thi Chuẩn">
                    <option value="lop_7">Lớp 7 (Global Success Chuyên Sâu • Đã có sẵn đề)</option>
                    <option value="lop_12">Lớp 12 & Ôn Thi Tốt Nghiệp THPTQG / IELTS</option>
                  </optgroup>
                  <optgroup label="Khối Lớp Khác (Đang hoàn thiện đề thi)">
                    <option value="lop_1">Lớp 1 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_2">Lớp 2 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_3">Lớp 3 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_4">Lớp 4 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_5">Lớp 5 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_6">Lớp 6 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_8">Lớp 8 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_9">Lớp 9 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_10">Lớp 10 (Chương trình mới • Sắp mở)</option>
                    <option value="lop_11">Lớp 11 (Chương trình mới • Sắp mở)</option>
                  </optgroup>
                </select>
                <p class="text-[11px] text-slate-500 mt-1">Hệ thống mở rộng từ Lớp 1 đến Lớp 12 theo lộ trình thẩm định.</p>
              </div>

              <div>
                <label for="cand-dur-select" class="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs">Thời lượng bài test:</label>
                <select 
                  id="cand-dur-select"
                  bind:value={selectedDuration}
                  class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium"
                >
                  <option value="5m">⚡ Khảo Sát Nhanh (5 phút - 5 câu)</option>
                  <option value="15m">⏱️ Kiểm Tra Toàn Diện (15 phút - 10 câu)</option>
                </select>
                <p class="text-[11px] text-slate-500 mt-1">Đánh giá nhanh độ phản xạ ngữ pháp và từ vựng.</p>
              </div>
            </div>

            <div class="pt-2 flex items-center justify-end gap-2.5">
              <button 
                type="button"
                onclick={handleReset}
                class="px-4 py-2.5 rounded-md font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs"
              >
                Đóng
              </button>
              <button 
                type="submit"
                disabled={isStarting}
                class="px-5 py-2.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors shadow-sm text-xs"
              >
                {isStarting ? 'Đang chuẩn bị đề...' : 'Bắt Đầu Làm Bài Ngay →'}
              </button>
            </div>
          </form>
        </div>

      <!-- STEP 2: INTERACTIVE TEST EXECUTION -->
      {:else if step === 'testing'}
        <div class="space-y-4">
          <!-- Timer Bar -->
          <div class="flex items-center justify-between bg-slate-900 text-white p-3 rounded-md">
            <div>
              <span class="text-xs text-sky-400 font-semibold">{candidateName}</span>
              <span class="text-slate-400 text-xs">• Khối: {selectedGrade.replace('lop_', 'Lớp ')}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-400">Thời gian:</span>
                <span class="font-mono text-base font-semibold text-amber-400 tabular-nums">{formattedTime}</span>
              </div>
              <button
                type="button"
                onclick={() => {
                  if (confirm('Bạn có chắc muốn dừng bài khảo sát và thoát?')) handleReset();
                }}
                class="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                title="Dừng bài thi"
              >
                ✕ Thoát
              </button>
            </div>
          </div>

          <!-- Questions Container -->
          <div class="space-y-4">
            {#each questions as q, idx}
              <div class="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-sky-600 dark:text-sky-400 text-xs">
                    Câu {idx + 1} / {questions.length}
                  </span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {q.type === 'listening' ? '🎧 Bài Nghe' : q.type === 'open_cloze' ? '📖 Điền Từ' : '✍️ Trắc Nghiệm'}
                  </span>
                </div>

                {#if q.passage}
                  <div class="p-3 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-700 text-xs italic text-slate-800 dark:text-slate-200 leading-relaxed">
                    "{q.passage}"
                  </div>
                {/if}

                {#if q.audio_term}
                  <div class="flex items-center gap-2 p-2 bg-sky-50 dark:bg-sky-950/40 rounded border border-sky-200 dark:border-sky-800">
                    <button 
                      type="button"
                      onclick={() => speakWord(q.audio_term, 0.9)}
                      class="px-3 py-1 rounded bg-sky-600 text-white font-medium flex items-center gap-1 shadow-sm text-xs"
                    >
                      <span>🔊</span>
                      <span>Nghe Phát Âm</span>
                    </button>
                    <span class="text-xs text-slate-600 dark:text-slate-400 italic">Bấm để nghe đoạn âm thanh mẫu</span>
                  </div>
                {/if}

                <div class="text-xs font-medium text-slate-900 dark:text-white leading-relaxed">
                  {q.question}
                </div>

                {#if q.type === 'open_cloze'}
                  <div>
                    <input 
                      type="text" 
                      bind:value={answers[q.id]}
                      placeholder="Gõ từ còn thiếu vào đây..."
                      class="w-full sm:w-2/3 p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-normal"
                    />
                  </div>
                {:else if q.options && q.options.length}
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {#each q.options as opt}
                      {@const optVal = typeof opt === 'object' && opt ? opt.id : opt}
                      {@const optLabel = typeof opt === 'object' && opt ? `${opt.id}. ${opt.text}` : opt}
                      <label class="flex items-center gap-2 p-2.5 rounded border text-xs cursor-pointer transition-colors {answers[q.id] === optVal ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200 font-medium' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200 font-normal'}">
                        <input 
                          type="radio" 
                          name={`q_${q.id}`} 
                          value={optVal} 
                          bind:group={answers[q.id]}
                          class="accent-sky-600"
                        />
                        <span>{optLabel}</span>
                      </label>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Bottom Action -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <button 
              type="button"
              onclick={() => {
                if (confirm('Bạn có chắc muốn hủy bài thi thử này không?')) handleReset();
              }}
              class="px-4 py-2 rounded-md font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs"
            >
              Hủy Bài Thi
            </button>
            <button 
              type="button"
              disabled={isSubmitting}
              onclick={handleSubmitTest}
              class="px-6 py-2.5 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-sm text-xs"
            >
              {isSubmitting ? 'Đang chấm điểm...' : 'Nộp Bài & Xem Điểm Ngay ✓'}
            </button>
          </div>
        </div>

      <!-- STEP 3: RESULT & VOLUNTARY FEEDBACK -->
      {:else if step === 'result' && examResult}
        <div class="space-y-4 font-normal">
          <div class="text-center p-5 rounded-xl bg-gradient-to-b from-sky-50 to-white dark:from-slate-800 dark:to-slate-900 border border-sky-100 dark:border-slate-800 space-y-2">
            <span class="text-3xl">🎉</span>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              Kết Quả Khảo Sát: {candidateName}
            </h3>
            <div class="flex items-center justify-center gap-4 text-xs font-medium pt-1">
              <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                Điểm Số: <strong>{examResult.score} / 10</strong> ({examResult.correct_count}/{examResult.total_questions} câu đúng)
              </span>
              <span class="px-3 py-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300">
                Xếp Loại CEFR: <strong>{examResult.cefr_level || 'A2'}</strong>
              </span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto pt-1 leading-relaxed">
              {examResult.feedback || 'Em có nền tảng ngữ pháp tương đối tốt, cần tiếp tục rèn luyện thêm kỹ năng nghe và đọc hiểu.'}
            </p>
          </div>

          <!-- Lead capture form -->
          <div class="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-4 rounded-lg space-y-3">
            <div>
              <h4 class="font-semibold text-sky-900 dark:text-sky-200 text-xs">Nhận Tư Vấn Kế Hoạch Học Tập (Tùy Chọn)</h4>
              <p class="text-slate-600 dark:text-slate-400 text-xs mt-0.5 leading-relaxed">
                Để lại số điện thoại nếu phụ huynh muốn nhận lộ trình chi tiết và đăng ký học thử miễn phí. Hoàn toàn tự nguyện, không ràng buộc.
              </p>
            </div>

            {#if leadSuccessMsg}
              <div class="p-3 rounded bg-emerald-100 text-emerald-800 font-medium text-xs">
                {leadSuccessMsg}
              </div>
            {:else}
              <form onsubmit={handleSendLead} class="space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label for="lead-phone-input" class="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs">Số điện thoại / Zalo (*):</label>
                    <input 
                      id="lead-phone-input"
                      type="tel" 
                      required
                      bind:value={leadPhone}
                      placeholder="VD: 0912345678"
                      class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums text-xs font-normal"
                    />
                  </div>
                  <div>
                    <label for="lead-target-select" class="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs">Mục tiêu học tập:</label>
                    <select 
                      id="lead-target-select"
                      bind:value={leadTarget}
                      class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium"
                    >
                      <option value="Lấy gốc & Cải thiện điểm trên lớp">Lấy gốc &amp; Cải thiện điểm trên lớp</option>
                      <option value="Chuyên sâu Học Sinh Giỏi">Chuyên sâu Học Sinh Giỏi</option>
                      <option value="Luyện thi Tốt Nghiệp THPT Điểm 9+">Luyện thi Tốt Nghiệp THPT Điểm 9+</option>
                      <option value="Luyện chứng chỉ Cambridge / IELTS">Luyện chứng chỉ Cambridge / IELTS</option>
                    </select>
                  </div>
                </div>

                <div class="flex items-center justify-between pt-1">
                  <span class="text-[11px] text-slate-500">Tư vấn viên: Cô Dung & Đội ngũ chuyên môn</span>
                  <button 
                    type="submit"
                    disabled={isSubmittingLead}
                    class="px-5 py-2 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors text-xs"
                  >
                    {isSubmittingLead ? 'Đang gửi...' : 'Gửi Yêu Cầu Tư Vấn Zalo'}
                  </button>
                </div>
              </form>
            {/if}
          </div>

          <!-- Bottom Actions -->
          <div class="flex justify-end pt-2">
            <button 
              type="button"
              onclick={handleReset} 
              class="px-5 py-2 rounded-md font-semibold bg-slate-900 hover:bg-slate-800 text-white text-xs"
            >
              Đóng &amp; Trở Về
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
