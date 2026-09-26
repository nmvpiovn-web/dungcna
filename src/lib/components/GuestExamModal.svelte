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

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval);
  });

  // Start Guest Test
  async function handleStartTest(e) {
    if (e) e.preventDefault();
    isStarting = true;
    errorMsg = '';

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

  function handleReset() {
    step = 'setup';
    examResult = null;
    leadSuccessMsg = '';
    leadPhone = '';
    onClose();
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 text-xs max-h-[90vh] overflow-y-auto">
      <!-- Modal Top Bar -->
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
          <span class="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            Khảo Sát Năng Lực Trực Tuyến
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            Dành Cho Khách
          </span>
        </div>
        <button onclick={handleReset} class="text-slate-400 hover:text-slate-600 font-bold p-1 text-sm">✕</button>
      </div>

      <!-- STEP 1: ONBOARDING & SETUP -->
      {#if step === 'setup'}
        <div class="space-y-4">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Chào Mừng Bạn Đến Với Tiếng Anh Cô Dung! 🌸</h2>
            <p class="text-slate-600 dark:text-slate-400 leading-relaxed">
              Bài thi thử thông minh giúp xác định trình độ chuẩn CEFR (A1 - C1), đánh giá phản xạ ngữ pháp, nghe và đọc hiểu điền từ (Open Cloze) mà không cần đăng ký tài khoản.
            </p>
          </div>

          {#if errorMsg}
            <div class="p-3 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium">
              {errorMsg}
            </div>
          {/if}

          <form onsubmit={handleStartTest} class="space-y-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
              <label for="cand-name-input" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên của bạn hoặc học sinh:</label>
              <input 
                id="cand-name-input"
                type="text" 
                bind:value={candidateName}
                placeholder="VD: Nguyễn Hoàng Nam"
                class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="cand-grade-select" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Khối lớp / Trình độ:</label>
                <select 
                  id="cand-grade-select"
                  bind:value={selectedGrade}
                  class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="lop_7">Lớp 7 (Nền Tảng THCS - Chuẩn K12)</option>
                  <option value="lop_12">Lớp 12 &amp; Luyện Thi THPT QG / IELTS</option>
                </select>
                <p class="text-[10px] text-slate-500 mt-1">Các khối lớp 1–6 và 8–11 đang trong lộ trình thẩm định đề.</p>
              </div>

              <div>
                <label for="cand-dur-select" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời lượng bài test:</label>
                <select 
                  id="cand-dur-select"
                  bind:value={selectedDuration}
                  class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="5m">⚡ Khảo Sát Nhanh (5 phút - 5 câu)</option>
                  {#if selectedGrade === 'lop_7'}
                    <option value="15m">⏱️ Kiểm Tra Toàn Diện (15 phút - 10 câu)</option>
                  {/if}
                </select>
                <p class="text-[10px] text-slate-500 mt-1">Mốc 30m &amp; 45m cần ngân hàng mở rộng đang được biên soạn.</p>
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <button 
                type="submit"
                disabled={isStarting}
                class="px-6 py-2.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors shadow-sm"
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
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-400">Thời gian còn lại:</span>
              <span class="font-mono text-base font-semibold text-amber-400 tabular-nums">{formattedTime}</span>
            </div>
          </div>

          <!-- Questions Container -->
          <div class="space-y-4">
            {#each questions as q, idx}
              <div class="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-sky-600 dark:text-sky-400">
                    Câu {idx + 1} / {questions.length}
                  </span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {q.type === 'listening' ? '🎧 Bài Nghe' : q.type === 'open_cloze' ? '📖 Tự Luận Điền Từ' : '✍️ Trắc Nghiệm'}
                  </span>
                </div>

                <!-- Open Cloze Passage -->
                {#if q.passage}
                  <div class="p-3 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-700 text-xs italic text-slate-800 dark:text-slate-200 leading-relaxed">
                    "{q.passage}"
                  </div>
                {/if}

                <!-- Audio term for listening -->
                {#if q.audio_term}
                  <div class="flex items-center gap-2 p-2 bg-sky-50 dark:bg-sky-950/40 rounded border border-sky-200 dark:border-sky-800">
                    <button 
                      type="button"
                      onclick={() => speakWord(q.audio_term, 0.9)}
                      class="px-3 py-1 rounded bg-sky-600 text-white font-semibold flex items-center gap-1 shadow-sm"
                    >
                      <span>🔊</span>
                      <span>Bấm để nghe phát âm</span>
                    </button>
                    <span class="text-slate-500 text-[11px]">(Nghe kỹ trọng âm và ngữ điệu)</span>
                  </div>
                {/if}

                <div class="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                  {q.question_text}
                </div>

                <!-- Options for MCQ / Listening -->
                {#if q.options && q.options.length > 0}
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {#each q.options as opt}
                      {@const isSelected = answers[q.id] === opt.id}
                      <button 
                        type="button"
                        onclick={() => answers[q.id] = opt.id}
                        class="p-2.5 rounded-md text-left transition-colors font-medium border flex items-center gap-2.5 {isSelected ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'}"
                      >
                        <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold {isSelected ? 'bg-white text-sky-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                          {opt.id}
                        </span>
                        <span>{opt.text}</span>
                      </button>
                    {/each}
                  </div>
                {:else if q.type === 'open_cloze'}
                  <!-- Open Cloze: Free-text fill in the blank without ABCD -->
                  <div class="space-y-1.5 pt-1">
                    <label for="cloze-input-{q.id}" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Tự luận: Nhập từ chính xác điền vào chỗ trống:
                    </label>
                    <input 
                      id="cloze-input-{q.id}"
                      type="text" 
                      bind:value={answers[q.id]}
                      placeholder="Ví dụ: pollution, wish, of..."
                      class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Submit Action -->
          <div class="pt-2 flex justify-between items-center border-t border-slate-200 dark:border-slate-800">
            <span class="text-slate-500 tabular-nums">Đã trả lời: {Object.keys(answers).length}/{questions.length} câu</span>
            <button 
              onclick={handleSubmitTest}
              disabled={isSubmitting}
              class="px-6 py-2.5 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? 'Đang chấm điểm...' : 'Hoàn Thành & Xem Kết Quả →'}
            </button>
          </div>
        </div>

      <!-- STEP 3: CEFR COMPETENCY REPORT & VOLUNTARY LEAD -->
      {:else if step === 'result' && examResult}
        <div class="space-y-5">
          <!-- Competency Summary Header -->
          <div class="bg-slate-900 border border-slate-800 rounded-lg p-5 text-white space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs text-sky-400 font-semibold uppercase tracking-wider">Báo Cáo Năng Lực Chuẩn CEFR</span>
                <h3 class="text-xl font-semibold mt-0.5">{examResult.rank_title}</h3>
              </div>
              <div class="text-right">
                <div class="text-2xl font-semibold text-amber-400 tabular-nums">{examResult.score_10} / 10</div>
                <div class="text-xs text-slate-400 tabular-nums">Đúng {examResult.correct_count}/{examResult.total_questions} câu</div>
              </div>
            </div>

            <div class="p-3 bg-slate-800/80 rounded border border-slate-700 text-xs text-slate-200 leading-relaxed">
              <strong>💡 Đánh giá sư phạm &amp; Lộ trình:</strong> {examResult.recommendation}
            </div>
          </div>

          <!-- Review Question By Question -->
          <div class="space-y-3">
            <h4 class="font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-xs">Chi Tiết Từng Câu Hỏi &amp; Đáp Án:</h4>
            {#each examResult.item_feedback as item}
              <div class="p-3 rounded-md border text-xs space-y-1.5 {item.is_correct ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'}">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-slate-800 dark:text-slate-200">Câu {item.item_order}: {item.question_text}</span>
                  <span class="font-bold {item.is_correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}">
                    {item.is_correct ? '✓ Đúng' : `✗ Sai (Bạn chọn ${item.student_choice || 'Chưa chọn'} - Đáp án đúng: ${item.correct_id})`}
                  </span>
                </div>
                {#if item.explanation}
                  <p class="text-slate-600 dark:text-slate-400 italic">↳ Giải thích: {item.explanation}</p>
                {/if}
              </div>
            {/each}
          </div>

          <!-- VOLUNTARY SEPARATE OPT-IN LEAD FORM -->
          <div class="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-5 rounded-lg space-y-3">
            <div>
              <h4 class="font-semibold text-sky-900 dark:text-sky-200 text-sm">Nhận Tư Vấn Lộ Trình Cá Nhân Hóa (Tùy Chọn)</h4>
              <p class="text-slate-600 dark:text-slate-400 text-xs mt-0.5 leading-relaxed">
                Để lại số điện thoại để Cô Dung gửi kế hoạch học tập chi tiết và xếp lớp học thử miễn phí tại cơ sở gần nhất. Hoàn toàn tự nguyện, không ràng buộc.
              </p>
            </div>

            {#if leadSuccessMsg}
              <div class="p-3 rounded bg-emerald-100 text-emerald-800 font-semibold text-xs">
                {leadSuccessMsg}
              </div>
            {:else}
              <form onsubmit={handleSendLead} class="space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label for="lead-phone-input" class="block font-medium text-slate-700 dark:text-slate-300 mb-1">Số điện thoại / Zalo (*):</label>
                    <input 
                      id="lead-phone-input"
                      type="tel" 
                      required
                      bind:value={leadPhone}
                      placeholder="VD: 0912345678"
                      class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums font-medium"
                    />
                  </div>
                  <div>
                    <label for="lead-target-select" class="block font-medium text-slate-700 dark:text-slate-300 mb-1">Mục tiêu học tập:</label>
                    <select 
                      id="lead-target-select"
                      bind:value={leadTarget}
                      class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                    >
                      <option value="Lấy gốc & Cải thiện điểm trên lớp">Lấy gốc &amp; Cải thiện điểm trên lớp</option>
                      <option value="Chuyên sâu Học Sinh Giỏi">Chuyên sâu Học Sinh Giỏi</option>
                      <option value="Luyện thi Tốt Nghiệp THPT Điểm 9+">Luyện thi Tốt Nghiệp THPT Điểm 9+</option>
                      <option value="Luyện chứng chỉ Cambridge / IELTS">Luyện chứng chỉ Cambridge / IELTS</option>
                    </select>
                  </div>
                </div>

                <div class="flex items-center justify-between pt-1">
                  <span class="text-[11px] text-slate-500">Hotline tư vấn: 0912.xxx.xxx</span>
                  <button 
                    type="submit"
                    disabled={isSubmittingLead}
                    class="px-5 py-2 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                  >
                    {isSubmittingLead ? 'Đang gửi...' : 'Gửi Yêu Cầu Tư Vấn Zalo'}
                  </button>
                </div>
              </form>
            {/if}
          </div>

          <!-- Bottom Actions -->
          <div class="flex justify-end pt-2">
            <button onclick={handleReset} class="px-5 py-2 rounded-md font-semibold bg-slate-900 hover:bg-slate-800 text-white">
              Đóng &amp; Trở Về
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
