<svelte:head>
  <title>Bàn Học Của Em • Cpanel Học Sinh • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getStudentStars } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech';

  let currentUser = $state(null);
  let studentStars = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let loading = $state(true);
  let activeTab = $state('todo'); // 'todo' | 'completed' | 'all'
  let skillFilter = $state('all'); // 'all' | 'writing' | 'reading' | 'speaking'

  // Submission Modal State
  let showSubmitModal = $state(false);
  let selectedAssignment = $state(null);
  let writingContent = $state('');
  let isSubmitting = $state(false);
  let submitMessage = $state('');

  // Writing Mode: 'typed' | 'handwritten'
  let writingMode = $state('typed');
  let handwrittenPhotoUrl = $state(null);

  // Worksheet Print Modal State
  let showWorksheetPrintModal = $state(false);
  let worksheetToPrint = $state(null);

  // Speaking Recording State (Web Audio API)
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = $state(false);
  let recordingSeconds = $state(0);
  let recordingTimer = null;
  let recordedAudioUrl = $state(null);

  async function loadData() {
    loading = true;
    currentUser = getCurrentUser();
    if (currentUser) {
      studentStars = getStudentStars(currentUser.id);
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const res = await fetch('/api/homework', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        assignments = data.assignments || [];
        submissions = data.submissions || [];
      }
    } catch (e) {
      console.error('Failed to load homework:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  // Map submissions to assignments
  let assignmentItems = $derived.by(() => {
    return assignments.map(a => {
      const sub = submissions.find(s => s.assignment_id === a.id);
      return {
        ...a,
        submission: sub || null,
        isCompleted: !!sub,
        isGraded: sub?.status === 'graded'
      };
    });
  });

  let filteredItems = $derived.by(() => {
    return assignmentItems.filter(item => {
      if (skillFilter !== 'all' && item.skill_type !== skillFilter) return false;
      if (activeTab === 'todo') return !item.isCompleted;
      if (activeTab === 'completed') return item.isCompleted;
      return true;
    });
  });

  function openSubmitModal(assignment) {
    selectedAssignment = assignment;
    const existing = assignment.submission;
    if (existing) {
      writingContent = existing.content_text || '';
      recordedAudioUrl = existing.audio_url || null;
      handwrittenPhotoUrl = existing.handwritten_image_url || null;
      writingMode = existing.handwritten_image_url ? 'handwritten' : 'typed';
    } else {
      writingContent = '';
      recordedAudioUrl = null;
      handwrittenPhotoUrl = null;
      writingMode = 'typed';
    }
    submitMessage = '';
    showSubmitModal = true;
  }

  function openWorksheetPrint(assignment) {
    worksheetToPrint = assignment;
    showWorksheetPrintModal = true;
  }

  function triggerPrintWorksheet() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      handwrittenPhotoUrl = event.target?.result || null;
    };
    reader.readAsDataURL(file);
  }

  // MediaRecorder functions
  async function startRecording() {
    audioChunks = [];
    recordedAudioUrl = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          recordedAudioUrl = reader.result;
        };
      };
      mediaRecorder.start();
      isRecording = true;
      recordingSeconds = 0;
      recordingTimer = setInterval(() => {
        recordingSeconds += 1;
      }, 1000);
    } catch (err) {
      alert('Không thể truy cập microphone. Vui lòng cấp quyền micro trên trình duyệt của bạn!');
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      isRecording = false;
      clearInterval(recordingTimer);
    }
  }

  async function submitHomework() {
    if (!selectedAssignment) return;
    isSubmitting = true;
    submitMessage = '';

    const payload = {
      action: 'submit',
      assignment_id: selectedAssignment.id,
      submission_type: selectedAssignment.skill_type,
      content_text: writingContent,
      audio_url: recordedAudioUrl,
      handwritten_image_url: handwrittenPhotoUrl
    };

    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const res = await fetch('/api/homework', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        submitMessage = data.message;
        playAudioFeedback(true);
        setTimeout(() => {
          showSubmitModal = false;
          loadData();
        }, 1500);
      } else {
        submitMessage = data.error || 'Nộp bài thất bại';
      }
    } catch (e) {
      submitMessage = 'Lỗi kết nối server: ' + e.message;
    } finally {
      isSubmitting = false;
    }
  }

  let wordCount = $derived(writingContent.trim() ? writingContent.trim().split(/\s+/).length : 0);
</script>

<div class="space-y-6">
  <!-- Top Welcome Banner (Academic Navy / Slate) -->
  <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-sm relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <span>🎒 Không Gian Học Tập Của Em</span>
          <span>•</span>
          <span>{currentUser?.grade || 'Lớp 7 Chuyên'}</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">Xin chào, {currentUser?.name || currentUser?.username || 'Học Sinh'}! 👋</h1>
        <p class="text-slate-300 text-sm mt-1 max-w-xl">
          Hãy hoàn thành bài tập về nhà trước buổi học tiếp theo để nhận sao thưởng tích lũy học phí và được cô giáo nhận xét nhé!
        </p>
      </div>

      <div class="flex items-center gap-3">
        <div class="bg-slate-800/90 border border-slate-700/80 rounded-lg p-3 text-center min-w-[110px]">
          <div class="text-2xl font-bold text-amber-300 flex items-center justify-center gap-1">
            <span>⭐</span>
            <span>{studentStars?.stars_balance || 0}</span>
          </div>
          <div class="text-[11px] text-slate-300 font-medium mt-0.5">Sao Tích Lũy</div>
        </div>
        <div class="bg-slate-800/90 border border-slate-700/80 rounded-lg p-3 text-center min-w-[110px]">
          <div class="text-2xl font-bold text-emerald-300">
            {assignmentItems.filter(i => i.isGraded).length}/{assignmentItems.length}
          </div>
          <div class="text-[11px] text-slate-300 font-medium mt-0.5">Bài Hoàn Thành</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Filter & Tab Switcher -->
  <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
    <!-- Status Tabs -->
    <div class="flex items-center gap-1">
      <button 
        onclick={() => activeTab = 'todo'} 
        class="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all {activeTab === 'todo' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        ⏳ Cần Làm ({assignmentItems.filter(i => !i.isCompleted).length})
      </button>
      <button 
        onclick={() => activeTab = 'completed'} 
        class="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all {activeTab === 'completed' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        ✅ Đã Nộp ({assignmentItems.filter(i => i.isCompleted).length})
      </button>
      <button 
        onclick={() => activeTab = 'all'} 
        class="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all {activeTab === 'all' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Tất Cả ({assignmentItems.length})
      </button>
    </div>

    <!-- Skill Filter -->
    <div class="flex items-center gap-1.5 self-end sm:self-center">
      <span class="text-xs text-slate-400 font-medium hidden sm:inline">Kỹ năng:</span>
      <select 
        bind:value={skillFilter}
        class="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 focus:outline-none"
      >
        <option value="all">Tất cả kỹ năng</option>
        <option value="writing">✍️ Viết (Writing)</option>
        <option value="reading">📖 Đọc hiểu (Reading)</option>
        <option value="speaking">🎙️ Nói (Speaking)</option>
      </select>
    </div>
  </div>

  <!-- Assignment Cards Grid -->
  {#if loading}
    <div class="text-center py-12 text-slate-400">
      <div class="inline-block animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full mb-3"></div>
      <p class="text-sm font-medium">Đang tải bài tập về nhà...</p>
    </div>
  {:else if filteredItems.length === 0}
    <div class="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      <div class="text-5xl mb-3">🎉</div>
      <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">Không có bài tập nào cần làm!</h3>
      <p class="text-xs text-slate-500 mt-1">Con đã hoàn thành xuất sắc các bài tập được giao hoặc chưa có bài tập mới.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each filteredItems as item}
        {@const skillIcon = item.skill_type === 'writing' ? '✍️' : item.skill_type === 'reading' ? '📖' : '🎙️'}
        {@const skillLabel = item.skill_type === 'writing' ? 'Viết (Writing)' : item.skill_type === 'reading' ? 'Đọc (Reading)' : 'Nói (Speaking)'}
        <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div class="space-y-3">
            <!-- Header Badges -->
            <div class="flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                <span>{skillIcon}</span>
                <span>{skillLabel}</span>
              </span>

              {#if item.isGraded}
                <span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span>⭐</span>
                  <span>{item.submission.score}/10 Điểm</span>
                </span>
              {:else if item.isCompleted}
                <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  Đã nộp • Chờ cô chấm
                </span>
              {:else}
                <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  Chưa làm
                </span>
              {/if}
            </div>

            <!-- Title & Description -->
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white line-clamp-2">{item.title}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{item.description}</p>
            </div>

            <!-- Metadata info -->
            <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <div class="flex items-center justify-between">
                <span>👩‍🏫 Giáo viên phụ trách:</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">{item.teacher_name}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>⏰ Hạn nộp (trước buổi học kế tiếp):</span>
                <span class="font-bold text-rose-600 dark:text-rose-400">{item.deadline_time} • {item.deadline_date}</span>
              </div>
              {#if item.obsidian_note_title}
                <div class="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>🧠 Giáo án liên kết:</span>
                  <a href="/second-brain?id={item.obsidian_note_id}" class="text-sky-600 dark:text-sky-400 hover:underline font-bold truncate max-w-[200px]" target="_blank">
                    {item.obsidian_note_title}
                  </a>
                </div>
              {/if}
            </div>

            <!-- Feedback if Graded -->
            {#if item.isGraded && item.submission?.teacher_feedback}
              <div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 text-xs">
                <div class="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <span>💬 Lời nhận xét của {item.teacher_name}:</span>
                  {#if item.submission.stars_awarded > 0}
                    <span class="text-amber-500 font-extrabold">+{item.submission.stars_awarded} sao ⭐</span>
                  {/if}
                </div>
                <p class="text-emerald-700 dark:text-emerald-400 mt-1 italic">"{item.submission.teacher_feedback}"</p>
              </div>
            {/if}
          </div>

          <!-- Bottom Action Button -->
          <div class="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 flex flex-wrap items-center justify-between gap-2">
            <span class="text-[11px] text-amber-500 font-bold">
              🎁 Thưởng +{item.star_reward_on_time} sao khi làm tốt đúng hạn
            </span>

            <div class="flex items-center gap-1.5">
              {#if item.skill_type === 'writing'}
                <button 
                  onclick={() => openWorksheetPrint(item)}
                  class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-all flex items-center gap-1"
                  title="In phiếu bài tập khổ A4 ra giấy để luyện viết tay"
                >
                  <span>🖨️ In Phiếu Viết A4</span>
                </button>
              {/if}

              <button 
                onclick={() => openSubmitModal(item)}
                class="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm {item.isCompleted ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200' : 'bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/20'}"
              >
                {item.isCompleted ? 'Xem / Nộp Lại' : 'Làm Bài Ngay →'}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- SUBMISSION MODAL (Writing, Reading, Speaking with Web Audio Recorder & Photo Upload) -->
{#if showSubmitModal && selectedAssignment}
  <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <span class="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Nộp Bài Tập Về Nhà</span>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{selectedAssignment.title}</h2>
        </div>
        <button 
          onclick={() => showSubmitModal = false}
          class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 flex items-center justify-center font-bold"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 overflow-y-auto space-y-4 flex-1">
        <!-- Assignment prompt -->
        <div class="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">📋 Đề bài & Hướng dẫn:</span>
            {#if selectedAssignment.skill_type === 'writing'}
              <button 
                onclick={() => openWorksheetPrint(selectedAssignment)}
                class="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <span>🖨️ In Phiếu Viết Giấy A4</span>
              </button>
            {/if}
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">{selectedAssignment.description}</p>
        </div>

        <!-- Submission by Skill -->
        {#if selectedAssignment.skill_type === 'writing'}
          <div class="space-y-3">
            <!-- Mode Switcher: Typed vs Handwritten Photo -->
            <div class="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit">
              <button 
                onclick={() => writingMode = 'typed'}
                class="px-3 py-1.5 rounded-md text-xs font-semibold transition-all {writingMode === 'typed' ? 'bg-white dark:bg-slate-900 text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}"
              >
                ⌨️ Gõ Trên Máy Tính
              </button>
              <button 
                onclick={() => writingMode = 'handwritten'}
                class="px-3 py-1.5 rounded-md text-xs font-semibold transition-all {writingMode === 'handwritten' ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}"
              >
                📸 Chụp Ảnh Bài Viết Tay (Giấy)
              </button>
            </div>

            {#if writingMode === 'typed'}
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                  <label for="writing-textarea" class="font-semibold text-slate-700 dark:text-slate-300">✍️ Bài viết trực tiếp:</label>
                  <span class="text-slate-400 font-medium">Số từ: <strong class="text-sky-500">{wordCount}</strong> từ</span>
                </div>
                <textarea 
                  id="writing-textarea"
                  bind:value={writingContent}
                  placeholder="Nhập bài viết luận của em tại đây (tiếng Anh)..."
                  rows="7"
                  class="w-full text-xs font-mono p-4 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                ></textarea>
              </div>
            {:else}
              <!-- Handwritten Photo Upload -->
              <div class="p-5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border-2 border-dashed border-amber-300 dark:border-amber-800 text-center space-y-3">
                <div class="text-3xl">📝</div>
                <div>
                  <div class="text-xs font-semibold text-amber-800 dark:text-amber-200">Kích Thích Viết Tay Rèn Chữ Đẹp</div>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Hãy in phiếu bài tập A4 hoặc làm bài ra vở, sau đó dùng điện thoại chụp ảnh lại và tải lên đây nhé!
                  </p>
                </div>

                <div class="flex items-center justify-center gap-2">
                  <label class="cursor-pointer px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5">
                    <span>📷 Chụp Ảnh / Chọn File Ảnh</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      onchange={handlePhotoUpload}
                      class="hidden" 
                    />
                  </label>
                  <button 
                    onclick={() => openWorksheetPrint(selectedAssignment)}
                    class="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs"
                  >
                    🖨️ In Phiếu Mẫu
                  </button>
                </div>

                {#if handwrittenPhotoUrl}
                  <div class="pt-3 border-t border-amber-200 dark:border-amber-800/60 space-y-1">
                    <div class="text-xs font-bold text-emerald-600 flex items-center justify-center gap-1">
                      <span>✅ Ảnh bài viết tay đã sẵn sàng để nộp:</span>
                    </div>
                    <img 
                      src={handwrittenPhotoUrl} 
                      alt="Ảnh bài viết tay của học sinh" 
                      class="max-h-60 mx-auto rounded-xl border border-slate-300 dark:border-slate-700 shadow-md object-contain bg-white"
                    />
                  </div>
                {/if}
              </div>
            {/if}
          </div>

        {:else if selectedAssignment.skill_type === 'reading'}
          <div class="space-y-2">
            <label for="reading-textarea" class="text-xs font-bold text-slate-700 dark:text-slate-300">📖 Câu trả lời / Phân tích đọc hiểu:</label>
            <textarea 
              id="reading-textarea"
              bind:value={writingContent}
              placeholder="Điền đáp án các câu hỏi hoặc tóm tắt đoạn văn theo yêu cầu..."
              rows="8"
              class="w-full text-xs font-mono p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            ></textarea>
          </div>

        {:else if selectedAssignment.skill_type === 'speaking'}
          <div class="space-y-4">
            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">🎙️ Thu âm bài nói trực tiếp:</div>
            
            <!-- Audio Recorder Box -->
            <div class="p-6 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-4">
              <div class="text-4xl">
                {isRecording ? '🔴' : '🎙️'}
              </div>

              {#if isRecording}
                <div class="text-rose-500 font-bold text-lg animate-pulse">
                  Đang ghi âm: {recordingSeconds}s
                </div>
                <button 
                  onclick={stopRecording}
                  class="px-5 py-2.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-sm"
                >
                  ⏹️ Dừng Ghi Âm
                </button>
              {:else}
                <div>
                  <button 
                    onclick={startRecording}
                    class="px-5 py-2.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs shadow-sm"
                  >
                    ▶️ Bắt Đầu Thu Âm
                  </button>
                  <p class="text-[11px] text-slate-400 mt-2">Bấm để ghi âm bằng micro máy tính hoặc điện thoại</p>
                </div>
              {/if}

              <!-- Audio Player Preview -->
              {#if recordedAudioUrl}
                <div class="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div class="text-xs font-bold text-emerald-500">✅ Bản ghi âm sẵn sàng:</div>
                  <audio controls src={recordedAudioUrl} class="w-full max-w-md mx-auto"></audio>
                </div>
              {/if}
            </div>

            <!-- Notes text optional -->
            <div class="space-y-1">
              <label for="speaking-notes-input" class="text-xs text-slate-500">Ghi chú thêm cho cô giáo (tùy chọn):</label>
              <input 
                id="speaking-notes-input"
                type="text" 
                bind:value={writingContent}
                placeholder="VD: Con thu âm 2 lần, đoạn cuối phát âm từ khó..."
                class="w-full text-xs p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none"
              />
            </div>
          </div>
        {/if}

        {#if submitMessage}
          <div class="p-3 rounded-xl text-xs font-bold text-center {submitMessage.includes('thành công') ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600'}">
            {submitMessage}
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800/40">
        <button 
          onclick={() => showSubmitModal = false}
          class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200"
        >
          Hủy
        </button>
        <button 
          onclick={submitHomework}
          disabled={isSubmitting || (selectedAssignment.skill_type === 'speaking' && !recordedAudioUrl && !writingContent)}
          class="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 disabled:opacity-50"
        >
          {isSubmitting ? 'Đang nộp...' : 'Nộp Bài Cho Cô Giáo 🚀'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- WORKSHEET A4 PRINT MODAL (English 4-line Ruling Handwriting Sheet) -->
{#if showWorksheetPrintModal && worksheetToPrint}
  <div class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
    <div class="bg-white text-slate-900 rounded-xl max-w-4xl w-full border border-slate-300 shadow-2xl overflow-hidden flex flex-col my-auto">
      <!-- Toolbar (Non-printable) -->
      <div class="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
        <div class="flex items-center gap-2">
          <span class="text-xl">🖨️</span>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-sky-400">Xem Trước Bản In Phiếu Bài Tập A4</div>
            <div class="text-sm font-bold">{worksheetToPrint.title}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button 
            onclick={triggerPrintWorksheet}
            class="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5"
          >
            <span>🖨️ In Ngay (Print Worksheet)</span>
          </button>
          <button 
            onclick={() => showWorksheetPrintModal = false}
            class="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
          >
            ✕ Đóng
          </button>
        </div>
      </div>

      <!-- Printable A4 Worksheet Sheet Container -->
      <div id="printable-worksheet" class="p-8 sm:p-12 bg-white text-slate-900 font-serif leading-relaxed max-w-3xl mx-auto w-full">
        <!-- Header Section -->
        <div class="border-b-2 border-slate-900 pb-4 mb-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs font-sans font-bold uppercase tracking-widest text-sky-800">TRUNG TÂM TIẾNG ANH CÔ DUNG</div>
              <div class="text-[11px] font-sans text-slate-600 italic">Ms. Dung English Academy • Học Để Tự Tin Toàn Cầu</div>
            </div>
            <div class="text-right font-sans text-xs">
              <span class="px-2.5 py-1 rounded bg-slate-100 font-semibold border border-slate-300">PHIẾU LUYỆN VIẾT TAY A4</span>
            </div>
          </div>

          <div class="mt-4 text-center">
            <h1 class="text-xl font-bold font-sans uppercase tracking-wide text-slate-900">{worksheetToPrint.title}</h1>
            {#if worksheetToPrint.obsidian_note_title}
              <div class="text-xs font-sans text-slate-600 mt-0.5">Giáo án liên kết: {worksheetToPrint.obsidian_note_title}</div>
            {/if}
          </div>

          <!-- Student & Assignment Info Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-dashed border-slate-300 font-sans text-xs">
            <div>
              <span class="text-slate-500">Họ và tên:</span>
              <div class="font-bold border-b border-dotted border-slate-400 pb-0.5 min-h-[20px]">{currentUser?.name || '................................'}</div>
            </div>
            <div>
              <span class="text-slate-500">Lớp học:</span>
              <div class="font-bold border-b border-dotted border-slate-400 pb-0.5 min-h-[20px]">{worksheetToPrint.class_name}</div>
            </div>
            <div>
              <span class="text-slate-500">Giáo viên:</span>
              <div class="font-bold border-b border-dotted border-slate-400 pb-0.5 min-h-[20px]">{worksheetToPrint.teacher_name}</div>
            </div>
            <div>
              <span class="text-slate-500">Hạn nộp:</span>
              <div class="font-bold text-rose-700 border-b border-dotted border-slate-400 pb-0.5 min-h-[20px]">{worksheetToPrint.deadline_time} • {worksheetToPrint.deadline_date}</div>
            </div>
          </div>
        </div>

        <!-- Assignment Prompt Box -->
        <div class="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-300 font-sans text-xs">
          <div class="font-bold text-slate-800 uppercase tracking-wide mb-1">📋 Yêu cầu đề bài (Writing Prompt):</div>
          <p class="text-slate-700 leading-relaxed whitespace-pre-line">{worksheetToPrint.description}</p>
        </div>

        <!-- 4-Line English Handwriting Ruling Area -->
        <div class="space-y-4 mb-8">
          <div class="flex items-center justify-between font-sans text-[11px] text-slate-500 italic">
            <span>✍️ Em hãy dùng bút mực hoặc bút chì nắn nót viết bài vào các dòng kẻ chuẩn bên dưới:</span>
            <span>Thang điểm: 10.0</span>
          </div>

          {#each Array(11) as _, i}
            <div class="relative py-2 border-b border-slate-400">
              <!-- Midline guideline for lowercase letters -->
              <div class="border-b border-dashed border-sky-300/80 mb-2"></div>
              <div class="text-[9px] font-sans text-slate-300 absolute left-0 top-1">{i + 1}</div>
            </div>
          {/each}
        </div>

        <!-- Teacher Grading & Feedback Footer Box -->
        <div class="mt-8 pt-4 border-t-2 border-slate-900 grid grid-cols-3 gap-4 font-sans text-xs">
          <div class="col-span-2 border border-slate-300 rounded-lg p-3 min-h-[90px] flex flex-col justify-between">
            <span class="font-bold text-slate-800">💬 Nhận xét của Giáo viên:</span>
            <div class="border-b border-dotted border-slate-300 h-4"></div>
            <div class="border-b border-dotted border-slate-300 h-4"></div>
          </div>
          <div class="border border-slate-300 rounded-lg p-3 text-center flex flex-col justify-between">
            <span class="font-bold text-slate-800">Điểm Số / Chữ Ký</span>
            <div class="text-2xl font-bold text-slate-300 my-auto">....... / 10</div>
            <div class="text-[10px] text-slate-500">Thưởng sao: ....... ⭐</div>
          </div>
        </div>

        <!-- Submission Instruction for Parent -->
        <div class="mt-4 text-center font-sans text-[10px] text-slate-500 italic">
          Sau khi hoàn thành, học sinh hoặc phụ huynh chụp ảnh phiếu bài tập này và tải lên webapp tại mục "Chụp Ảnh Bài Viết Tay" để cô giáo chấm điểm.
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @media print {
    :global(body *) {
      visibility: hidden;
    }
    #printable-worksheet, #printable-worksheet * {
      visibility: visible;
    }
    #printable-worksheet {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      margin: 0;
      padding: 1.5cm;
    }
  }
</style>

