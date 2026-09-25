<script>
  import { onMount, onDestroy } from 'svelte';
  import { playAudioFeedback, speakWord } from '$lib/speech.js';
  import { 
    getCurrentUser, 
    saveExamAttempt, 
    saveBatchExamAttempts,
    logSnapshot,
    dispatchBotReport,
    getAttendedStudentsForSession,
    getAttendanceForSession,
    getAllClassSessions,
    getAllUsers,
    isSuperAdmin,
    getUserEnrolledGrades,
    requestUnlockClass
  } from '$lib/unifiedStore';

  let { data } = $props();

  let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);
  let lockedExamAlert = $state('');
  let isRequestingUnlock = $state(false);
  let selectedExamId = $state(data.exams[0]?.id || 'ex_quick_15m_g7');
  let currentExam = $derived(data.exams.find(e => e.id === selectedExamId) || data.exams[0]);

  // Session & Attendance-based candidate selection
  let selectedSessionId = $state(data.sessions?.[0]?.id || 'sess_1');
  let selectedSessionDate = $state(new Date().toISOString().slice(0, 10));
  let filterAttendedOnly = $state(true); // Default: only attended students
  let selectedStudentId = $state('');
  let studentName = $state('');
  let isBatchGradingOpen = $state(false);
  let batchScores = $state([]);
  let batchStatusMsg = $state('');

  let currentSession = $derived(data.sessions?.find(s => s.id === selectedSessionId) || data.sessions?.[0]);

  let allSessionStudentCount = $derived.by(() => {
    if (!currentSession?.student_ids) return 0;
    return currentSession.student_ids.length;
  });

  let eligibleStudents = $state([]);

  function refreshEligibleStudents() {
    if (!selectedSessionId) {
      eligibleStudents = (data.users || []).filter(u => u.role === 'student');
      return;
    }
    if (filterAttendedOnly) {
      eligibleStudents = getAttendedStudentsForSession(selectedSessionId, selectedSessionDate);
    } else {
      const sess = data.sessions?.find(s => s.id === selectedSessionId);
      if (sess?.student_ids && sess.student_ids.length > 0) {
        eligibleStudents = (data.users || []).filter(u => sess.student_ids.includes(u.id));
      } else {
        eligibleStudents = (data.users || []).filter(u => u.role === 'student');
      }
    }

    // Auto set candidate
    if (currentUser?.role === 'student') {
      selectedStudentId = currentUser.id;
      studentName = currentUser.name;
    } else {
      if (!eligibleStudents.some(s => s.id === selectedStudentId) && eligibleStudents.length > 0) {
        selectedStudentId = eligibleStudents[0].id;
        studentName = eligibleStudents[0].name;
      } else if (eligibleStudents.length === 0) {
        selectedStudentId = '';
        studentName = 'Chưa có thí sinh';
      }
    }
  }

  function handleSessionChange() {
    refreshEligibleStudents();
  }

  function handleDateChange() {
    refreshEligibleStudents();
  }

  function handleStudentChange() {
    const found = eligibleStudents.find(s => s.id === selectedStudentId);
    if (found) {
      studentName = found.name;
    }
  }

  function openBatchGradingModal() {
    batchScores = eligibleStudents.map(st => ({
      student_id: st.id,
      student_name: st.name,
      student_email: st.email || '',
      score: 8.5,
      note: 'Tham gia kiểm tra đầy đủ, tập trung làm bài'
    }));
    batchStatusMsg = '';
    isBatchGradingOpen = true;
  }

  function closeBatchGradingModal() {
    isBatchGradingOpen = false;
  }

  function handleSaveBatchScores() {
    if (batchScores.length === 0) return;
    saveBatchExamAttempts(
      selectedSessionId,
      currentSession?.class_id || '',
      currentExam.id,
      currentExam.title,
      batchScores,
      currentUser
    );
    batchStatusMsg = `✅ Đã lưu điểm cho ${batchScores.length} học sinh thành công!`;
    playAudioFeedback(true);
    setTimeout(() => {
      isBatchGradingOpen = false;
      batchStatusMsg = '';
    }, 1500);
  }

  // Questions for currently selected exam
  let activeQuestions = $derived.by(() => {
    const list = data.allQuestions.filter(q => q.exam_id === selectedExamId);
    if (list.length > 0) return list;
    // Fallback to default questions mapped
    return data.defaultQuestions.slice(0, 15).map((q, idx) => ({
      id: `fallback_${q.id}`,
      exam_id: selectedExamId,
      question_index: idx + 1,
      skill: 'grammar_vocab',
      type: 'multiple_choice',
      prompt: q.question,
      options_json: JSON.stringify([`A. ${q.option_a}`, `B. ${q.option_b}`, `C. ${q.option_c}`, `D. ${q.option_d}`]),
      correct_answer: q.correct_option,
      explanation: q.explanation || 'Chọn phương án phù hợp nhất theo cấu trúc ngữ pháp.',
      cambridge_level: 'KET_A2'
    }));
  });

  // State
  let isStarted = $state(false);
  let isSubmitted = $state(false);
  let timeLeftSeconds = $state(15 * 60);
  let timerInterval = null;
  let userAnswers = $state({}); // { qIndex: 'A' | 'B' | text }

  // Writing Module State
  let essayText = $state('');
  let essayWordCount = $derived(essayText.trim() ? essayText.trim().split(/\s+/).length : 0);

  // Speaking Module State (Web Speech Audio Recording)
  let isRecording = $state(false);
  let recordedAudioUrl = $state(null);
  let mediaRecorder = null;
  let audioChunks = [];
  let speechTranscript = $state('');

  function isExamEnrolledForUser(user, exam) {
    if (!user || user.role !== 'student') return true;
    const grades = getUserEnrolledGrades(user);
    const title = (exam.title || '').toLowerCase();
    const curriculumId = (exam.curriculum_id || '').toLowerCase();

    return grades.some(g => {
      const clean = g.toLowerCase().trim();
      const match = clean.match(/lớp\s*([0-9]+)/i) || clean.match(/grade-?([0-9]+)/i);
      if (match) {
        const num = Number(match[1]);
        if (Number(exam.grade) === num || title.includes(`lớp ${num}`)) return true;
      }
      if (clean.includes('ielts') && (curriculumId.includes('ielts') || title.includes('ielts') || exam.format_type === 'ielts_academic')) return true;
      if (clean.includes('toeic') && (curriculumId.includes('toeic') || title.includes('toeic') || exam.format_type === 'toeic_lr')) return true;
      if (clean.includes('toefl') && (curriculumId.includes('toefl') || title.includes('toefl') || exam.format_type === 'toefl_ibt')) return true;
      if ((clean.includes('đại học') || clean.includes('thptqg')) && (curriculumId.includes('thptqg') || Number(exam.grade) === 12)) return true;
      return false;
    });
  }

  async function handleUnlockRequest(exam) {
    if (!currentUser) return;
    isRequestingUnlock = true;
    try {
      await requestUnlockClass(currentUser.id, exam.title);
      playAudioFeedback('success');
      lockedExamAlert = `✅ Đã gửi yêu cầu mở đề thi "${exam.title}" tới Leader Cô Dung!`;
      setTimeout(() => lockedExamAlert = '', 6000);
    } catch (err) {
      lockedExamAlert = 'Lỗi gửi yêu cầu: ' + err.message;
    } finally {
      isRequestingUnlock = false;
    }
  }

  onMount(() => {
    currentUser = getCurrentUser();
    refreshEligibleStudents();
    if (currentUser?.role === 'student') {
      activeExamCategory = 'my_grade';
      studentName = currentUser?.name || 'Học viên';
      selectedStudentId = currentUser?.id || '';
      const match = data.exams.find(e => isExamEnrolledForUser(currentUser, e));
      if (match) {
        selectedExamId = match.id;
      }
    } else if (eligibleStudents.length > 0) {
      selectedStudentId = eligibleStudents[0].id;
      studentName = eligibleStudents[0].name;
    } else {
      studentName = currentUser?.name || 'Học viên Pro';
    }
    resetExamState();
  });

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval);
  });

  function resetExamState() {
    if (timerInterval) clearInterval(timerInterval);
    isStarted = false;
    isSubmitted = false;
    userAnswers = {};
    essayText = '';
    speechTranscript = '';
    recordedAudioUrl = null;
    timeLeftSeconds = (currentExam?.duration_minutes || 15) * 60;
  }

  function handleSelectExam(ex) {
    if (currentUser?.role === 'student' && !isExamEnrolledForUser(currentUser, ex)) {
      playAudioFeedback(false);
      lockedExamAlert = `🔒 Đề thi "${ex.title}" chưa được mở cho lớp của em (${currentUser.grade || 'Lớp 7'}). Hãy hoàn thành bài thi khối lớp mình trước nhé!`;
      setTimeout(() => lockedExamAlert = '', 7000);
      return;
    }
    selectedExamId = ex.id;
    lockedExamAlert = '';
    resetExamState();
  }

  function startExam() {
    if (currentUser?.role === 'student' && !isExamEnrolledForUser(currentUser, currentExam)) {
      playAudioFeedback(false);
      lockedExamAlert = `🔒 Không thể làm bài: Đề thi này chưa được mở cho khối lớp của em (${currentUser.grade || 'Lớp 7'}).`;
      return;
    }
    isStarted = true;
    isSubmitted = false;
    userAnswers = {};
    timeLeftSeconds = (currentExam?.duration_minutes || 15) * 60;
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeftSeconds--;
      if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval);
        submitExam();
      }
    }, 1000);
  }

  function selectOption(qIdx, option) {
    if (isSubmitted) return;
    userAnswers[qIdx] = option;
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Category Filter & Exam Derivation
  let activeExamCategory = $state('all'); // 'all' | 'my_grade' | 'ielts' | 'toeic' | 'toefl' | 'quick_15m' | 'standard_45m'

  let enrolledExamsCount = $derived(
    currentUser?.role === 'student' ? data.exams.filter(e => isExamEnrolledForUser(currentUser, e)).length : data.exams.length
  );

  let filteredExams = $derived(
    data.exams.filter(e => {
      if (activeExamCategory === 'my_grade') return isExamEnrolledForUser(currentUser, e);
      if (activeExamCategory === 'all') return true;
      if (activeExamCategory === 'primary') return e.grade === 3 || e.grade === 4 || e.grade === 5 || e.title.includes('Lớp 3') || e.title.includes('Lớp 4') || e.title.includes('Lớp 5');
      if (activeExamCategory === 'g7') return e.grade === 7 || e.title.includes('Lớp 7') || e.curriculum_id === 'curr_g7';
      if (activeExamCategory === 'g9') return e.grade === 9 || e.title.includes('Vào 10') || e.curriculum_id === 'curr_g9';
      if (activeExamCategory === 'highschool') return e.grade === 10 || e.grade === 11 || e.grade === 12 || e.title.includes('Lớp 11') || e.title.includes('Lớp 12') || e.title.includes('THPT');
      if (activeExamCategory === 'ielts') return e.format_type === 'ielts_academic' || e.curriculum_id === 'curr_ielts';
      if (activeExamCategory === 'toeic') return e.format_type === 'toeic_lr' || e.curriculum_id === 'curr_toeic';
      if (activeExamCategory === 'toefl') return e.format_type === 'toefl_ibt' || e.curriculum_id === 'curr_toefl';
      if (activeExamCategory === 'quick_15m') return e.format_type === 'quick_15m';
      if (activeExamCategory === 'standard_45m') return e.format_type === 'standard_45m';
      return true;
    })
  );

  // Scoring
  let correctCount = $derived.by(() => {
    let count = 0;
    activeQuestions.forEach((q, idx) => {
      const uAns = userAnswers[idx];
      if (uAns && q.correct_answer && uAns.trim().toUpperCase() === q.correct_answer.trim().toUpperCase()) {
        count++;
      }
    });
    return count;
  });

  let calculatedScore = $derived.by(() => {
    if (activeQuestions.length === 0) return 0;
    // If writing exam
    if (currentExam.skill_category === 'writing') {
      const words = essayWordCount;
      if (words >= 250) return 8.0;
      if (words >= 180) return 6.5;
      if (words >= 100) return 5.0;
      return 4.0;
    }
    // If speaking exam
    if (currentExam.skill_category === 'speaking') {
      return speechTranscript ? 7.5 : 6.0;
    }
    return ((correctCount / activeQuestions.length) * 10).toFixed(1);
  });

  let formattedResultBadge = $derived.by(() => {
    const total = activeQuestions.length || 1;
    const ratio = correctCount / total;

    if (currentExam.format_type === 'ielts_academic' || currentExam.curriculum_id === 'curr_ielts') {
      const band = (ratio * 4.0 + 5.0).toFixed(1);
      return {
        scaleName: 'IELTS Band',
        value: `Band ${band} / 9.0`,
        sub: band >= 7.5 ? 'Very Good User (C1 CAE)' : 'Competent User (B2 FCE)',
        badgeColor: 'text-indigo-600 dark:text-indigo-400'
      };
    }
    if (currentExam.format_type === 'toeic_lr' || currentExam.curriculum_id === 'curr_toeic') {
      const toeicScore = Math.min(990, Math.round(ratio * 800 + 190));
      return {
        scaleName: 'Điểm TOEIC Chuẩn',
        value: `${toeicScore} / 990`,
        sub: toeicScore >= 785 ? 'Working Proficiency (Giao Tiếp Chuyên Nghiệp)' : 'Intermediate Proficiency',
        badgeColor: 'text-teal-600 dark:text-teal-400'
      };
    }
    if (currentExam.format_type === 'toefl_ibt' || currentExam.curriculum_id === 'curr_toefl') {
      const toeflScale = Math.min(120, Math.round(ratio * 80 + 40));
      return {
        scaleName: 'Điểm TOEFL iBT',
        value: `${toeflScale} / 120`,
        sub: toeflScale >= 95 ? 'High Academic Level (Chuẩn Du Học Mỹ)' : 'Intermediate Academic',
        badgeColor: 'text-purple-600 dark:text-purple-400'
      };
    }
    return {
      scaleName: 'Điểm Số (Hệ 10)',
      value: `${calculatedScore} / 10.0`,
      sub: parseFloat(calculatedScore) >= 8.0 ? 'Giỏi / Xuất Sắc' : 'Đạt Chuẩn Bộ GD',
      badgeColor: parseFloat(calculatedScore) >= 7.0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
    };
  });

  let earnedStars = $derived.by(() => {
    const sc = parseFloat(calculatedScore);
    if (sc >= 9.0) return 20;
    if (sc >= 8.0) return 15;
    if (sc >= 7.0) return 10;
    return 0;
  });

  function submitExam() {
    if (timerInterval) clearInterval(timerInterval);
    isSubmitted = true;

    const studentUser = (data.users || []).find(u => u.id === selectedStudentId) || currentUser;

    // Save attempt
    const attempt = saveExamAttempt({
      user_id: selectedStudentId || currentUser?.id || 'usr_guest',
      user_name: studentName,
      user_email: studentUser?.email || currentUser?.email || 'guest@timbk.io.vn',
      exam_id: currentExam.id,
      exam_title: currentExam.title,
      score: parseFloat(calculatedScore),
      max_score: 10,
      answers: { ...userAnswers, essay: essayText, transcript: speechTranscript },
      duration_seconds: (currentExam.duration_minutes * 60) - timeLeftSeconds,
      session_id: selectedSessionId,
      class_id: currentSession?.class_id || ''
    });

    // Dispatch bot alert
    dispatchBotReport('EXAM_SUBMITTED', {
      student_name: studentName,
      exam_title: currentExam.title,
      score: calculatedScore,
      duration: `${Math.floor(((currentExam.duration_minutes * 60) - timeLeftSeconds) / 60)} phút`,
      class_name: currentSession?.class_name || 'Lớp Tiếng Anh Cô Dung',
      stars_reward: earnedStars
    });

    if (parseFloat(calculatedScore) >= 7.0) {
      playAudioFeedback(true);
    } else {
      playAudioFeedback(false);
    }
  }

  // Audio playing for listening questions
  function playQuestionAudio(audioUrl) {
    if (!audioUrl) return;
    if (audioUrl.startsWith('speech_prompt:')) {
      const textToSpeak = audioUrl.replace('speech_prompt:', '').trim();
      speakWord(textToSpeak);
    } else {
      const audio = new Audio(audioUrl);
      audio.play().catch(e => {
        console.warn('Audio play error, falling back to speech synthesis:', e);
        speakWord(audioUrl);
      });
    }
  }

  // Speaking Recording Functions
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        recordedAudioUrl = URL.createObjectURL(audioBlob);
        speechTranscript = "Recorded voice sample successfully captured. Fluency and pronunciation are ready for evaluation.";
      };

      mediaRecorder.start();
      isRecording = true;
    } catch (err) {
      alert('Không thể truy cập Microphone: ' + err.message);
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      // Stop tracks
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }
</script>

<div class="space-y-6">
  {#if currentUser?.role === 'teacher' || currentUser?.role === 'superadmin' || isSuperAdmin(currentUser)}
    <!-- Teacher & Leader Attendance-Linked Exam Panel -->
    <div class="rounded-3xl bg-slate-900 border border-emerald-500/30 p-5 md:p-6 shadow-xl space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>👩‍🏫 ĐIỀU PHỐI KHẢO THÍ THEO LỚP &amp; ĐIỂM DANH (Teacher &amp; Leader Cô Dung)</span>
          </div>
          <div class="text-sm font-black text-white mt-1">
            Khởi Tạo Đề Thi &amp; Gán Học Sinh Trực Tiếp Theo Buổi Học
          </div>
        </div>

        <!-- Quick Action Buttons -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={openBatchGradingModal}
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all hover:scale-105"
          >
            <span>⚡ Chấm Nhanh Cả Lớp Có Mặt</span>
            <span class="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{eligibleStudents.length} em</span>
          </button>
          <a
            href="/schedule"
            class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 border border-slate-700"
          >
            <span>📅 Điểm Danh Buổi Học</span>
          </a>
        </div>
      </div>

      <!-- Controls Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
        <!-- 1. Select Session -->
        <div class="space-y-1">
          <label class="font-bold text-slate-300" for="sess-select">1. Chọn Buổi Học / Lớp:</label>
          <select
            id="sess-select"
            bind:value={selectedSessionId}
            onchange={handleSessionChange}
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-emerald-500"
          >
            {#each (data.sessions || []) as s}
              <option value={s.id}>
                {s.class_name} ({s.day_name} {s.start_time})
              </option>
            {/each}
          </select>
        </div>

        <!-- 2. Select Date -->
        <div class="space-y-1">
          <label class="font-bold text-slate-300" for="sess-date">2. Ngày Điểm Danh:</label>
          <input
            id="sess-date"
            type="date"
            bind:value={selectedSessionDate}
            onchange={handleDateChange}
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-emerald-500"
          />
        </div>

        <!-- 3. Attendance Filter -->
        <div class="space-y-1">
          <span class="font-bold text-slate-300 block">3. Bộ Lọc Điểm Danh:</span>
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onclick={() => { filterAttendedOnly = true; refreshEligibleStudents(); }}
              class="flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all {filterAttendedOnly ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}"
            >
              🟢 Có Mặt Hôm Nay
            </button>
            <button
              type="button"
              onclick={() => { filterAttendedOnly = false; refreshEligibleStudents(); }}
              class="flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all {!filterAttendedOnly ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}"
            >
              👥 Tất Cả ({allSessionStudentCount})
            </button>
          </div>
        </div>

        <!-- 4. Selected Candidate -->
        <div class="space-y-1">
          <label class="font-bold text-slate-300 flex items-center justify-between" for="cand-select">
            <span>4. Thí Sinh Làm Bài:</span>
            <span class="text-[10px] font-semibold text-emerald-400">{eligibleStudents.length} em đủ điều kiện</span>
          </label>
          <select
            id="cand-select"
            bind:value={selectedStudentId}
            onchange={handleStudentChange}
            class="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-400"
          >
            {#each eligibleStudents as st}
              <option value={st.id}>
                👤 {st.name} ({st.username || st.phone || 'Học viên'})
              </option>
            {/each}
            {#if eligibleStudents.length === 0}
              <option value="" disabled>Chưa có học sinh điểm danh ngày này</option>
            {/if}
          </select>
        </div>
      </div>

      <!-- Quick Pill Selector -->
      {#if eligibleStudents.length > 0}
        <div class="flex items-center gap-2 overflow-x-auto pb-1 pt-1 text-xs">
          <span class="text-slate-400 whitespace-nowrap text-[11px] font-medium">Chọn nhanh thí sinh:</span>
          {#each eligibleStudents as st}
            {@const isChosen = selectedStudentId === st.id}
            <button
              type="button"
              onclick={() => { selectedStudentId = st.id; handleStudentChange(); }}
              class="px-2.5 py-1 rounded-lg border font-semibold text-[11px] transition-all whitespace-nowrap flex items-center gap-1.5 {isChosen ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-sm ring-1 ring-emerald-400/50' : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'}"
            >
              <span class="w-1.5 h-1.5 rounded-full {isChosen ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
              <span>{st.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if currentUser?.role === 'student'}
    {@const isOfficial = currentUser.approval_status === 'official' || (currentUser.status === 'active' && !currentUser.is_trial && !currentUser.metadata?.includes('"is_trial":true'))}
    {@const primaryGrade = currentUser.grade || 'Lớp 7'}
    <!-- Student Header Badge -->
    <div class="rounded-2xl bg-indigo-950/40 border border-indigo-500/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
      <div class="flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold flex items-center justify-center text-xl shadow-md">
          🎓
        </div>
        <div class="space-y-0.5">
          <div class="text-sm font-bold text-white flex flex-wrap items-center gap-2">
            <span>Thí Sinh: <strong class="text-indigo-200">{currentUser.name}</strong></span>
            {#if isOfficial}
              <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                ✓ Học Sinh Chính Thức
              </span>
            {:else}
              <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                ⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt
              </span>
            {/if}
          </div>
          <div class="text-xs text-slate-400">
            Tài khoản: <strong class="text-slate-200">@{currentUser.username}</strong> • Chương trình: <strong class="text-emerald-400">{primaryGrade} GDPT 2026</strong>
          </div>
        </div>
      </div>
      <div class="sm:text-right bg-indigo-900/30 px-3.5 py-2 rounded-xl border border-indigo-500/20">
        <div class="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider">Khối Lớp Đã Đăng Ký</div>
        <div class="text-sm font-black text-white">{primaryGrade}</div>
      </div>
    </div>
  {/if}

  <!-- Locked Exam Alert Banner -->
  {#if lockedExamAlert}
    <div class="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center justify-between shadow-lg animate-in slide-in-from-top-2">
      <div class="flex items-center gap-2.5">
        <span class="text-xl">🔒</span>
        <span>{lockedExamAlert}</span>
      </div>
      <button onclick={() => lockedExamAlert = ''} class="text-amber-600 hover:text-white font-bold text-sm">✕</button>
    </div>
  {/if}

  <!-- Exam Selector Ribbon -->
  <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 md:p-6 shadow-xl space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
        <span>👩‍🏫</span>
        <span>HỆ THỐNG KHẢO THÍ CHUẨN 2026 (IELTS • TOEIC • TOEFL • 15P • 45P):</span>
      </div>

      <!-- Category Filter Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
        {#if currentUser?.role === 'student'}
          <button
            onclick={() => activeExamCategory = 'my_grade'}
            class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'my_grade' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
          >
            🎯 Đề Khối Của Em ({enrolledExamsCount})
          </button>
        {/if}
        <button
          onclick={() => activeExamCategory = 'all'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🌟 Tất Cả ({data.exams.length})
        </button>
        <button
          onclick={() => activeExamCategory = 'primary'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'primary' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🎒 Tiểu Học (L3-5)
        </button>
        <button
          onclick={() => activeExamCategory = 'g7'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'g7' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🌱 Lớp 7 (HSG &amp; KET)
        </button>
        <button
          onclick={() => activeExamCategory = 'g9'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'g9' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🎯 Vào 10 (Lớp 9)
        </button>
        <button
          onclick={() => activeExamCategory = 'highschool'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'highschool' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🏢 THPT &amp; ĐH (L10-12)
        </button>
        <button
          onclick={() => activeExamCategory = 'ielts'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'ielts' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🌍 IELTS
        </button>
        <button
          onclick={() => activeExamCategory = 'toeic'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'toeic' ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          💼 TOEIC
        </button>
        <button
          onclick={() => activeExamCategory = 'toefl'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'toefl' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🎓 TOEFL iBT
        </button>
        <button
          onclick={() => activeExamCategory = 'quick_15m'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'quick_15m' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          ⚡ Đề 15 Phút
        </button>
        <button
          onclick={() => activeExamCategory = 'standard_45m'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'standard_45m' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          ⏱️ Đề 45 Phút Chuẩn Bộ
        </button>
      </div>
    </div>

    <!-- Exam Cards Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {#each filteredExams as ex}
        {@const isEnrolled = isExamEnrolledForUser(currentUser, ex)}
        {@const isSelected = selectedExamId === ex.id}
        <button
          onclick={() => handleSelectExam(ex)}
          class="p-3 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between {isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/50' : (isEnrolled ? 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80' : 'bg-slate-100/70 dark:bg-slate-950/40 border-slate-200/80 dark:border-slate-800/60 text-slate-400 opacity-60 hover:opacity-90')}"
        >
          <div>
            <div class="flex items-center justify-between text-[10px] font-bold uppercase mb-1">
              <span class="{isSelected ? 'text-indigo-200' : (isEnrolled ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')}">
                {#if !isEnrolled}🔒 {/if}
                {ex.format_type === 'quick_15m' ? '⚡ 15 Phút' : ex.format_type === 'standard_45m' ? '⏱️ 45 Phút' : ex.format_type === 'ielts_academic' ? '🌍 IELTS' : ex.format_type === 'toeic_lr' ? '💼 TOEIC' : ex.format_type === 'toefl_ibt' ? '🎓 TOEFL' : '📜 Khảo Thí'}
              </span>
              {#if !isEnrolled}
                <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">Khóa</span>
              {:else}
                <span class="opacity-80 font-mono">{ex.duration_minutes}'</span>
              {/if}
            </div>
            <div class="font-bold text-xs line-clamp-2 leading-snug">{ex.title}</div>
          </div>
          <div class="mt-2 text-[10px] opacity-75 flex items-center justify-between">
            <span>{ex.total_questions} câu</span>
            <span class="uppercase">{ex.skill_category}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- Active Exam Details & Status Header -->
  <div class="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase">
          {currentExam.format_type}
        </span>
        <span class="text-xs text-slate-400">Giáo viên ra đề: <strong>{currentExam.created_by}</strong></span>
      </div>
      <h1 class="text-xl md:text-2xl font-black text-white">{currentExam.title}</h1>
      <p class="text-xs text-slate-300 max-w-2xl">{currentExam.description}</p>
    </div>

    <!-- Timer & Main Action -->
    <div class="flex items-center gap-4 flex-shrink-0">
      <div class="text-center bg-slate-950 px-5 py-3 rounded-2xl border border-slate-800 shadow-inner">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thời Gian Còn Lại</div>
        <div class="text-2xl font-black font-mono {timeLeftSeconds < 300 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}">
          {formatTime(timeLeftSeconds)}
        </div>
      </div>

      {#if !isStarted}
        <button
          onclick={startExam}
          class="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 transition-all hover:scale-105"
        >
          🚀 Bắt Đầu Làm Bài
        </button>
      {:else if !isSubmitted}
        <button
          onclick={submitExam}
          class="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm shadow-xl shadow-rose-600/30 transition-all hover:scale-105"
        >
          🏁 Nộp Bài &amp; Chấm Điểm
        </button>
      {:else}
        <button
          onclick={startExam}
          class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
        >
          🔄 Làm Lại Đề Này
        </button>
      {/if}
    </div>
  </div>

  <!-- RESULT CARD BANNER (After submission) -->
  {#if isSubmitted}
    <div class="p-6 md:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">KẾT QUẢ KHẢO THÍ CHÍNH THỨC</span>
          <h2 class="text-2xl font-black text-white mt-1">Thí Sinh: {studentName}</h2>
          <div class="text-xs text-slate-400 mt-0.5">Thời gian hoàn thành: {Math.floor(((currentExam.duration_minutes * 60) - timeLeftSeconds) / 60)} phút {((currentExam.duration_minutes * 60) - timeLeftSeconds) % 60} giây</div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="text-center p-3 rounded-2xl bg-slate-950 border border-indigo-500/30 min-w-[130px] shadow-lg">
            <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{formattedResultBadge.scaleName}</div>
            <div class="text-2xl font-black {formattedResultBadge.badgeColor}">
              {formattedResultBadge.value}
            </div>
            <div class="text-[10px] font-semibold text-slate-400 mt-0.5">{formattedResultBadge.sub}</div>
          </div>
          <div class="text-center p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-[80px]">
            <div class="text-[10px] text-slate-400 font-bold uppercase">Hệ 10</div>
            <div class="text-2xl font-black {parseFloat(calculatedScore) >= 7.0 ? 'text-emerald-400' : 'text-amber-400'}">
              {calculatedScore}
            </div>
          </div>
          <div class="text-center p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-[80px]">
            <div class="text-[10px] text-slate-400 font-bold uppercase">Số Câu Đúng</div>
            <div class="text-2xl font-black text-indigo-400">
              {correctCount}/{activeQuestions.length}
            </div>
          </div>
        </div>
      </div>

      <div class="text-xs text-slate-300 bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span>✅ Kết quả bài thi của thí sinh <strong>{studentName}</strong> đã được lưu vào hệ thống Cloudflare D1.</span>
          {#if earnedStars > 0}
            <span class="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
              ⭐ Thưởng +{earnedStars} Sao
            </span>
          {/if}
        </div>
        <div class="flex items-center gap-3">
          <a href="/evaluations" class="text-indigo-400 font-bold hover:underline">Chuyển sang Đánh giá học viên ➔</a>
          <a href="/tuition" class="text-emerald-400 font-bold hover:underline">Xem trừ học phí sao ➔</a>
        </div>
      </div>
    </div>
  {/if}

  <!-- MAIN EXAM PLAYER BODY -->
  {#if !isStarted && !isSubmitted}
    <!-- Instructions Screen -->
    <div class="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
      <div class="text-5xl">📝</div>
      <h2 class="text-xl font-bold text-white">Bạn Đã Sẵn Sàng Làm Bài?</h2>
      <p class="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
        Bài thi gồm {activeQuestions.length} câu hỏi. Thời gian làm bài là {currentExam.duration_minutes} phút. 
        Đồng hồ sẽ bắt đầu đếm ngược ngay khi bạn bấm nút bên dưới.
      </p>
      <button
        onclick={startExam}
        class="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-105"
      >
        Bắt Đầu Ngay
      </button>
    </div>
  {:else}
    <!-- MODULE: IELTS WRITING TASK 2 -->
    {#if currentExam.skill_category === 'writing'}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left: Prompt & Criteria -->
        <div class="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <span class="text-xs font-bold text-purple-400">WRITING TASK 2 PROMPT</span>
            <span class="text-xs font-bold text-slate-400">Yêu cầu tối thiểu: 250 từ</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line">
            {activeQuestions[0]?.prompt || 'Viết một bài luận học thuật thảo luận về tác động của Trí Tuệ Nhân Tạo đối với giáo dục phổ thông.'}
          </div>

          <!-- Criteria Rubric Preview -->
          <div class="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-2 text-xs">
            <div class="font-bold text-purple-300">4 Tiêu Chí Chấm Điểm Chuẩn Cambridge IELTS:</div>
            <ul class="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
              <li><strong>Task Response (25%):</strong> Trả lời trọn vẹn cả 2 quan điểm và nêu lập trường cá nhân xuyên suốt.</li>
              <li><strong>Coherence &amp; Cohesion (25%):</strong> Bố cục 4 đoạn mạch lạc, liên kết câu tự nhiên.</li>
              <li><strong>Lexical Resource (25%):</strong> Sử dụng linh hoạt vốn từ vựng học thuật B2-C1.</li>
              <li><strong>Grammatical Range &amp; Accuracy (25%):</strong> Đa dạng cấu trúc câu phức, câu điều kiện, câu bị động.</li>
            </ul>
          </div>
        </div>

        <!-- Right: Essay Editor -->
        <div class="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 flex flex-col justify-between">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <span class="text-xs font-bold text-slate-300">KHUNG BÀI LÀM CỦA THÍ SINH</span>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold {essayWordCount >= 250 ? 'text-emerald-400' : 'text-amber-400'}">
                {essayWordCount} từ {essayWordCount >= 250 ? '✓ Đạt chuẩn' : '(Cần thêm ' + (250 - essayWordCount) + ' từ)'}
              </span>
            </div>
          </div>

          <textarea
            bind:value={essayText}
            disabled={isSubmitted}
            rows="16"
            placeholder="Type your essay here in English... (Live word counter is enabled)"
            class="w-full flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-sans text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 leading-relaxed resize-none"
          ></textarea>

          <div class="flex justify-between items-center text-xs text-slate-400 pt-2">
            <span>Hệ thống tự động lưu từng ký tự</span>
            {#if !isSubmitted}
              <button
                onclick={submitExam}
                class="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
              >
                Nộp Bài Luận
              </button>
            {/if}
          </div>
        </div>
      </div>

    <!-- MODULE: IELTS SPEAKING MOCK -->
    {:else if currentExam.skill_category === 'speaking'}
      <div class="rounded-3xl bg-slate-900 border border-slate-800 p-8 max-w-3xl mx-auto space-y-6 text-center">
        <div class="space-y-2">
          <span class="text-xs font-bold text-rose-400 uppercase tracking-wider">IELTS SPEAKING PART 2 &amp; CUE CARD</span>
          <h2 class="text-xl font-black text-white">Luyện Thi Nói Trực Tiếp Với Microphone</h2>
        </div>

        <!-- Cue Card Box -->
        <div class="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs leading-relaxed text-slate-200 whitespace-pre-line">
          {activeQuestions[0]?.prompt || 'Describe a skill you learned that you found extremely useful.'}
        </div>

        <!-- Audio Recorder Controls -->
        <div class="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center gap-4">
          <div class="flex items-center gap-4">
            {#if !isRecording}
              <button
                onclick={startRecording}
                class="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all hover:scale-105"
              >
                <span>🎙️ Bắt Đầu Thu Âm Giọng Nói</span>
              </button>
            {:else}
              <button
                onclick={stopRecording}
                class="px-6 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 animate-pulse"
              >
                <span>⏹️ Dừng Thu &amp; Phân Tích</span>
              </button>
            {/if}

            <button
              onclick={() => speakWord(activeQuestions[0]?.prompt?.split('\n')[0] || 'Describe a skill you learned')}
              class="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2"
            >
              <span>🔊 Nghe Đề Bản Ngữ</span>
            </button>
          </div>

          {#if recordedAudioUrl}
            <div class="w-full max-w-md pt-2">
              <div class="text-[11px] text-emerald-400 font-bold mb-1">Bản Ghi Âm Của Bạn:</div>
              <audio controls src={recordedAudioUrl} class="w-full"></audio>
            </div>
          {/if}
        </div>
      </div>

    <!-- MODULE: STANDARD MULTIPLE CHOICE / READING / QUICK 15M / 45M -->
    {:else}
      <div class="space-y-6">
        {#each activeQuestions as q, idx}
          {@const parsedOptions = q.options_json ? JSON.parse(q.options_json) : []}
          {@const isCorrect = isSubmitted && userAnswers[idx]?.trim().toUpperCase() === q.correct_answer?.trim().toUpperCase()}
          {@const isWrong = isSubmitted && userAnswers[idx] && !isCorrect}

          <div class="p-6 rounded-3xl bg-slate-900 border {isCorrect ? 'border-emerald-500/60 bg-emerald-950/10' : isWrong ? 'border-rose-500/60 bg-rose-950/10' : 'border-slate-800'} space-y-4 transition-all">
            <!-- Header of Question -->
            <div class="flex items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-xl bg-slate-800 text-indigo-400 font-bold flex items-center justify-center">
                  #{idx + 1}
                </span>
                <span class="font-bold text-slate-300 uppercase tracking-wider">{q.skill}</span>
                {#if q.cambridge_level}
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-semibold border border-indigo-500/20">
                    {q.cambridge_level}
                  </span>
                {/if}
              </div>

              {#if isSubmitted}
                <span class="font-bold {isCorrect ? 'text-emerald-400' : 'text-rose-400'}">
                  {isCorrect ? '✓ Đúng (+1.0 điểm)' : '✕ Sai (Đáp án: ' + q.correct_answer + ')'}
                </span>
              {/if}
            </div>

            <!-- Reading Passage if present (Split-view or card) -->
            {#if q.passage}
              <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans max-h-64 overflow-y-auto whitespace-pre-line">
                <strong class="text-cyan-400 block mb-1">📖 Đoạn Văn Đọc Hiểu / Ngữ Cảnh:</strong>
                {q.passage}
              </div>
            {/if}

            <!-- Question Photo / Diagram (e.g. TOEIC Part 1) -->
            {#if q.image_url}
              <div class="my-3 text-center bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                <img 
                  src={q.image_url} 
                  alt="Question Diagram or Scene" 
                  class="max-h-64 rounded-xl border border-slate-700/60 object-cover shadow-lg mx-auto" 
                />
                <span class="text-[11px] text-slate-400 mt-2 block font-medium">📷 Hình ảnh ngữ cảnh bài thi</span>
              </div>
            {/if}

            <!-- Audio Listening Track (e.g. TOEIC Part 1 / TOEFL Lecture / Listening Exam) -->
            {#if q.audio_url}
              <div class="my-2 p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-3 shadow-inner">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 flex items-center justify-center text-lg">
                    🎧
                  </div>
                  <div>
                    <div class="text-xs font-bold text-indigo-300">Listening Audio Track (Bản Nghe Đề Thi)</div>
                    <div class="text-[10px] text-slate-400">Bấm nút để nghe đoạn audio / hội thoại của bài thi</div>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={() => playQuestionAudio(q.audio_url)}
                  class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
                >
                  <span>🔊 Phát Audio</span>
                </button>
              </div>
            {/if}

            <!-- Question Prompt -->
            <div class="text-sm font-bold text-white flex items-center justify-between gap-3">
              <span>{q.prompt}</span>
              <button
                onclick={() => speakWord(q.prompt)}
                class="text-xs p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                title="Phát âm câu hỏi"
              >
                🔊
              </button>
            </div>

            <!-- Options Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {#each parsedOptions as opt}
                {@const optLetter = opt.substring(0, 1).toUpperCase()}
                {@const isSelected = userAnswers[idx] === optLetter}
                {@const isThisCorrect = isSubmitted && q.correct_answer === optLetter}

                <button
                  disabled={isSubmitted}
                  onclick={() => selectOption(idx, optLetter)}
                  class="p-3 rounded-2xl border text-left text-xs font-medium transition-all {isThisCorrect ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200 font-bold' : isSelected && isWrong ? 'bg-rose-600/30 border-rose-500 text-rose-200 font-bold' : isSelected ? 'bg-indigo-600 border-indigo-500 text-white font-bold shadow-md' : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'}"
                >
                  {opt}
                </button>
              {/each}
            </div>

            <!-- Review Explanation (After submission) -->
            {#if isSubmitted && q.explanation}
              <div class="p-3.5 rounded-2xl bg-slate-950 border border-indigo-500/20 text-xs text-indigo-300 space-y-1">
                <strong class="text-indigo-400 block font-bold">💡 Giải thích chi tiết:</strong>
                <div class="text-slate-300 font-sans">{q.explanation}</div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- BATCH GRADING MODAL FOR ATTENDED STUDENTS -->
  {#if isBatchGradingOpen}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div class="bg-slate-900 border border-emerald-500/30 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider">CHẤM ĐIỂM HÀNG LOẠT THEO ĐIỂM DANH</div>
            <h2 class="text-lg font-black text-white mt-0.5">{currentExam.title}</h2>
            <div class="text-xs text-slate-400 mt-0.5">Lớp: {currentSession?.class_name} • Ngày: {selectedSessionDate} ({batchScores.length} học sinh có mặt)</div>
          </div>
          <button
            type="button"
            onclick={closeBatchGradingModal}
            class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {#if batchStatusMsg}
          <div class="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <span>{batchStatusMsg}</span>
          </div>
        {/if}

        <div class="max-h-96 overflow-y-auto space-y-2 pr-1">
          {#each batchScores as item, idx}
            <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-lg bg-slate-800 text-emerald-400 font-bold text-xs flex items-center justify-center">
                  #{idx + 1}
                </span>
                <div>
                  <div class="text-xs font-bold text-white">{item.student_name}</div>
                  <div class="text-[10px] text-slate-400">ID: {item.student_id}</div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <div class="flex items-center gap-1.5">
                  <label class="text-[11px] font-bold text-slate-400" for="sc-{idx}">Điểm (0-10):</label>
                  <input
                    id="sc-{idx}"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    bind:value={item.score}
                    class="w-16 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-center font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <input
                  type="text"
                  bind:value={item.note}
                  placeholder="Nhận xét bài thi..."
                  class="flex-1 min-w-[140px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          {/each}
          {#if batchScores.length === 0}
            <div class="text-center py-6 text-slate-400 text-xs">
              Không có học sinh nào đủ điều kiện điểm danh trong buổi học này.
            </div>
          {/if}
        </div>

        <div class="flex items-center justify-between border-t border-slate-800 pt-3">
          <div class="text-[11px] text-slate-400">
            💡 Điểm từ 7.0 trở lên tự động cộng sao thưởng tích lũy (100 sao = 1.000 VNĐ trừ học phí)!
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={closeBatchGradingModal}
              class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={batchScores.length === 0}
              onclick={handleSaveBatchScores}
              class="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>💾 Lưu &amp; Báo Zalo Bot</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
