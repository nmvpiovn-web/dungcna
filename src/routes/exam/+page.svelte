<script>
  import { onMount, onDestroy } from 'svelte';
  import { playAudioFeedback, speakWord } from '$lib/speech.js';
  import { 
    getCurrentUser, 
    getAuthToken,
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
  import GuestExamModal from '$lib/components/GuestExamModal.svelte';

  let { data } = $props();

  let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);
  let showGuestModal = $state(false);
  let lockedExamAlert = $state('');
  let isRequestingUnlock = $state(false);
  let selectedExamId = $state(data.exams[0]?.id || 'ex_quick_15m_g7');
  let dynamicExam = $state(null);
  let dynamicQuestions = $state([]);
  let currentExam = $derived(
    dynamicExam && selectedExamId === dynamicExam.id 
      ? dynamicExam 
      : (data.exams.find(e => e.id === selectedExamId) || data.exams[0])
  );

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
    if (dynamicExam && selectedExamId === dynamicExam.id) {
      return dynamicQuestions;
    }
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
  let activeExamCategory = $state('all'); // 'all' | 'my_grade' | 'primary' | 'g7' | 'g9' | 'highschool' | 'ielts' | 'toeic' | 'toefl' | 'quick_5m' | 'quick_15m' | 'standard_45m' | 'random_builder'

  // Random Test Generator State
  let randomDuration = $state(15); // 5 | 15 | 45 | 50
  let randomGrade = $state(7);
  let randomSkill = $state('all'); // 'all' | 'grammar' | 'vocabulary' | 'phonics' | 'reading'
  let randomSuccessNotice = $state('');
  let isGeneratingRandom = $state(false);

  async function generateRandomExam() {
    // Check user role permission for selected grade
    if (currentUser?.role === 'student') {
      const enrolledGrades = getUserEnrolledGrades(currentUser);
      const isAllowed = enrolledGrades.some(g => {
        const clean = g.toLowerCase().trim();
        const match = clean.match(/lớp\s*([0-9]+)/i);
        if (match && Number(match[1]) === Number(randomGrade)) return true;
        if (randomGrade === 0 && (clean.includes('ielts') || clean.includes('ket') || clean.includes('pet'))) return true;
        if (randomDuration === 50 && (clean.includes('12') || clean.includes('thpt'))) return true;
        return false;
      });
      if (!isAllowed) {
        playAudioFeedback(false);
        lockedExamAlert = `🔒 Em đang được phân quyền vào ${currentUser.grade || 'Lớp 7'}. Vui lòng chọn đúng khối lớp của em hoặc liên hệ Cô Dung để mở thêm lớp nhé!`;
        setTimeout(() => lockedExamAlert = '', 6000);
        return;
      }
    }

    isGeneratingRandom = true;
    try {
      let apiType = '15m';
      if (randomDuration === 50) apiType = 'thpt_qg';
      else if (randomDuration === 45) apiType = '45m';
      else if (randomDuration === 5) apiType = '15m';

      const gradeQuery = randomGrade > 0 ? `lop_${randomGrade}` : (apiType === 'thpt_qg' ? 'lop_12' : 'lop_7');
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch(`/api/exams/random?action=create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'create', exam_type: apiType, grade: gradeQuery })
      });
      const dataJson = await res.json();

      if (dataJson.success && dataJson.items && dataJson.items.length > 0) {
        const gradeLabel = randomGrade > 0 ? `Lớp ${randomGrade}` : 'Quốc Tế (Cambridge & IELTS)';
        const dynId = dataJson.instance_id;
        dynamicExam = {
          id: dynId,
          instance_id: dynId,
          curriculum_id: randomGrade > 0 ? `curr_g${randomGrade}` : 'curr_thptqg',
          title: dataJson.title || `🎲 Đề Thi Ngẫu Nhiên D1 (${dataJson.total_questions} câu)`,
          description: `Đề thi trắc nghiệm được Cloudflare D1 sinh tự động theo ma trận năng lực GDPT 2025. Bản chụp lưu máy chủ: #${dynId.slice(-6)}.`,
          grade: randomDuration === 50 ? 12 : randomGrade,
          format_type: apiType === 'thpt_qg' ? 'standard_45m' : (apiType === '45m' ? 'standard_45m' : 'quick_15m'),
          skill_category: randomSkill,
          duration_minutes: dataJson.duration_minutes || randomDuration,
          total_questions: dataJson.total_questions || dataJson.items.length,
          pass_percentage: 70,
          created_by: 'Cloudflare D1 AI Engine',
          is_published: 1,
          is_random: true,
          created_at: new Date().toISOString()
        };

        dynamicQuestions = dataJson.items.map((item, idx) => ({
          id: item.question_id,
          exam_id: dynId,
          question_index: item.item_order || idx + 1,
          prompt: item.question_text,
          options_json: JSON.stringify(item.options.map(o => `${o.id}. ${o.text}`)),
          skill: 'random_d1',
          type: 'multiple_choice',
          reading_passage: item.reading_passage
        }));

        selectedExamId = dynId;
        lockedExamAlert = '';
        resetExamState();
        startExam();
        randomSuccessNotice = `🎉 Đã tạo đề ngẫu nhiên D1 (${dataJson.items.length} câu) thành công! Mã đề: #${dynId.slice(-6)}.`;
        setTimeout(() => randomSuccessNotice = '', 6000);
        return;
      }
    } catch (apiErr) {
      console.warn('API /api/exams/random unavailable, using client-side fallback:', apiErr);
    } finally {
      isGeneratingRandom = false;
    }

    // Client-side fallback if offline
    let pool = [...data.allQuestions];
    if (randomGrade > 0) {
      pool = pool.filter(q => Number(q.grade) === Number(randomGrade));
    }
    if (pool.length === 0) pool = data.allQuestions.slice(0, 30);
    const targetCount = randomDuration === 5 ? 5 : (randomDuration === 15 ? 15 : (randomDuration === 50 ? 40 : 25));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(targetCount, shuffled.length)).map((q, idx) => ({
      ...q,
      question_index: idx + 1
    }));
    const dynId = `dyn_local_${Date.now()}`;
    dynamicExam = {
      id: dynId,
      title: `🎲 Đề Ngẫu Nhiên Offline (#${Math.floor(Math.random() * 900 + 100)})`,
      description: `Đề thi trắc nghiệm ngẫu nhiên từ ngân hàng offline (${chosen.length} câu).`,
      grade: randomGrade,
      format_type: 'quick_15m',
      duration_minutes: randomDuration,
      total_questions: chosen.length,
      pass_percentage: 70,
      created_by: 'Hệ Thống Trực Tuyến',
      is_published: 1,
      is_random: true,
      created_at: new Date().toISOString()
    };
    dynamicQuestions = chosen;
    selectedExamId = dynId;
    lockedExamAlert = '';
    resetExamState();
    startExam();
  }

  let enrolledExamsCount = $derived(
    currentUser?.role === 'student' ? data.exams.filter(e => isExamEnrolledForUser(currentUser, e)).length : data.exams.length
  );

  let filteredExams = $derived(
    data.exams.filter(e => {
      if (activeExamCategory === 'my_grade') return isExamEnrolledForUser(currentUser, e);
      if (activeExamCategory === 'all') return true;
      if (activeExamCategory === 'primary') return (e.grade >= 1 && e.grade <= 5) || e.title.includes('Lớp 1') || e.title.includes('Lớp 2') || e.title.includes('Lớp 3') || e.title.includes('Lớp 4') || e.title.includes('Lớp 5');
      if (activeExamCategory === 'g7') return e.grade === 7 || e.title.includes('Lớp 7') || e.curriculum_id === 'curr_g7';
      if (activeExamCategory === 'g9') return e.grade === 9 || e.title.includes('Vào 10') || e.curriculum_id === 'curr_g9';
      if (activeExamCategory === 'highschool') return (e.grade >= 10 && e.grade <= 12) || e.title.includes('Lớp 10') || e.title.includes('Lớp 11') || e.title.includes('Lớp 12') || e.title.includes('THPT');
      if (activeExamCategory === 'ielts') return e.format_type === 'ielts_academic' || e.curriculum_id === 'curr_ielts';
      if (activeExamCategory === 'toeic') return e.format_type === 'toeic_lr' || e.curriculum_id === 'curr_toeic';
      if (activeExamCategory === 'toefl') return e.format_type === 'toefl_ibt' || e.curriculum_id === 'curr_toefl';
      if (activeExamCategory === 'quick_5m') return e.format_type === 'quick_5m' || e.duration_minutes === 5;
      if (activeExamCategory === 'quick_15m') return e.format_type === 'quick_15m' || e.duration_minutes === 15;
      if (activeExamCategory === 'standard_45m') return e.format_type === 'standard_45m' || e.duration_minutes === 45;
      if (activeExamCategory === 'random_builder') return false;
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

    // If dynamic exam created by D1 server, submit to /api/exams/random for server-side evaluation & explanations
    if (currentExam?.instance_id) {
      fetch('/api/exams/random', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAuthToken() ? { 'Authorization': `Bearer ${getAuthToken()}` } : {})
        },
        body: JSON.stringify({
          action: 'submit',
          instance_id: currentExam.instance_id,
          answers: userAnswers,
          duration_seconds: (currentExam.duration_minutes * 60) - timeLeftSeconds
        })
      }).then(r => r.json()).then(res => {
        if (res.success && res.detailed_results) {
          dynamicQuestions = dynamicQuestions.map(q => {
            const found = res.detailed_results.find(d => d.item_order === q.question_index);
            if (found) {
              return {
                ...q,
                correct_answer: found.correct_option_id,
                explanation: found.explanation
              };
            }
            return q;
          });
        }
      }).catch(err => console.error('Server grading error:', err));
    }

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
        <button
          type="button"
          onclick={() => showGuestModal = true}
          class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-md shadow-emerald-500/20"
        >
          <span>🎓 Thi Thử Cho Khách</span>
          <span class="px-1.5 py-0.2 rounded-full bg-white/20 text-[9px]">Tự Do</span>
        </button>
        {#if currentUser?.role === 'student'}
          <button
            onclick={() => activeExamCategory = 'my_grade'}
            class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'my_grade' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
          >
            🎯 Đề Khối Của Em ({enrolledExamsCount})
          </button>
        {/if}
        <button
          onclick={() => activeExamCategory = 'random_builder'}
          class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeExamCategory === 'random_builder' ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25 ring-2 ring-sky-300 font-bold' : 'bg-sky-100/70 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-200/70'}"
        >
          <span>🎲 Tạo Đề Random (5p • 15p • 45p)</span>
          <span class="px-1.5 py-0.2 rounded-full bg-white/20 text-[9px]">Mới</span>
        </button>
        <button
          onclick={() => activeExamCategory = 'quick_5m'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'quick_5m' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          ⚡ Đề 5 Phút (Khởi Động)
        </button>
        <button
          onclick={() => activeExamCategory = 'quick_15m'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'quick_15m' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          ⏱️ Đề 15 Phút (Thường Xuyên)
        </button>
        <button
          onclick={() => activeExamCategory = 'standard_45m'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'standard_45m' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          📝 Đề 45 Phút (1 Tiết Chuẩn)
        </button>
        <button
          onclick={() => activeExamCategory = 'all'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'all' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🌟 Tất Cả ({data.exams.length})
        </button>
        <button
          onclick={() => activeExamCategory = 'primary'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'primary' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🎒 Tiểu Học (L1-5)
        </button>
        <button
          onclick={() => activeExamCategory = 'g7'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'g7' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🌱 Lớp 7 (HSG &amp; KET)
        </button>
        <button
          onclick={() => activeExamCategory = 'g9'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'g9' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🎯 Vào 10 (Lớp 9)
        </button>
        <button
          onclick={() => activeExamCategory = 'highschool'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'highschool' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🏢 THPT &amp; ĐH (L10-12)
        </button>
        <button
          onclick={() => activeExamCategory = 'ielts'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'ielts' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🌍 IELTS
        </button>
        <button
          onclick={() => activeExamCategory = 'toeic'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'toeic' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          💼 TOEIC
        </button>
        <button
          onclick={() => activeExamCategory = 'toefl'}
          class="px-3 py-1.5 rounded-xl transition-all whitespace-nowrap {activeExamCategory === 'toefl' ? 'bg-sky-600 text-white shadow-sm font-bold' : 'bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700'}"
        >
          🎓 TOEFL iBT
        </button>
      </div>
    </div>

    <!-- RANDOM EXAM GENERATOR INTERACTIVE PANEL -->
    {#if activeExamCategory === 'random_builder'}
      <div class="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 border border-amber-500/40 p-5 md:p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div class="space-y-1">
            <div class="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <span class="text-lg">🎲</span>
              <span>BỘ TẠO ĐỀ THI TRẮC NGHIỆM NGẪU NHIÊN THEO THỜI LƯỢNG (DYNAMIC TEST BUILDER)</span>
            </div>
            <p class="text-xs text-slate-400">
              Hệ thống xáo trộn ngẫu nhiên từ kho <strong>{data.allQuestions?.length || 573} câu hỏi</strong> chuẩn GDPT 2018 &amp; Cambridge. Mỗi lần tạo là một đề thi hoàn toàn mới!
            </p>
          </div>
          {#if randomSuccessNotice}
            <div class="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30 animate-pulse">
              {randomSuccessNotice}
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <!-- 1. Duration Choice -->
          <div class="space-y-2">
            <span class="block font-bold text-slate-300">1. Thời Lượng Làm Bài:</span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onclick={() => randomDuration = 5}
                class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 5 ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 font-black' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
              >
                <div>⚡ 5 Phút</div>
                <div class="text-[10px] opacity-80 font-normal">5 câu</div>
              </button>
              <button
                type="button"
                onclick={() => randomDuration = 15}
                class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 15 ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30 font-black' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
              >
                <div>⏱️ 15 Phút</div>
                <div class="text-[10px] opacity-80 font-normal">15 câu</div>
              </button>
              <button
                type="button"
                onclick={() => randomDuration = 45}
                class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 45 ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 font-black' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
              >
                <div>📝 45 Phút</div>
                <div class="text-[10px] opacity-80 font-normal">30 câu</div>
              </button>
              <button
                type="button"
                onclick={() => randomDuration = 50}
                class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 50 ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 font-black ring-1 ring-rose-400' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
              >
                <div>🎯 50 Phút</div>
                <div class="text-[10px] opacity-80 font-normal">40 câu (2025)</div>
              </button>
            </div>
          </div>

          <!-- 2. Grade Choice -->
          <div class="space-y-2">
            <label class="block font-bold text-slate-300" for="rand-grade">2. Khối Lớp / Hệ Học:</label>
            <select
              id="rand-grade"
              bind:value={randomGrade}
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <optgroup label="🌱 Cấp 2 (THCS)">
                <option value={7}>Lớp 7 (Global Success &amp; KET A2)</option>
                <option value={6}>Lớp 6 (Friends Plus &amp; A1)</option>
                <option value={8}>Lớp 8 (THCS &amp; PET B1)</option>
                <option value={9}>Lớp 9 (Luyện Thi Vào 10 Chuyên)</option>
              </optgroup>
              <optgroup label="🎒 Cấp 1 (Tiểu Học)">
                <option value={1}>Lớp 1 (Phonics Starters)</option>
                <option value={2}>Lớp 2 (Starters A1)</option>
                <option value={3}>Lớp 3 (Movers A1)</option>
                <option value={4}>Lớp 4 (Movers A1+)</option>
                <option value={5}>Lớp 5 (Flyers A2)</option>
              </optgroup>
              <optgroup label="🏢 Cấp 3 (THPT)">
                <option value={10}>Lớp 10 (Global Success B1)</option>
                <option value={11}>Lớp 11 (B1+ &amp; ASEAN)</option>
                <option value={12}>Lớp 12 (Tốt Nghiệp THPT QG)</option>
              </optgroup>
              <optgroup label="🌍 Chứng Chỉ Quốc Tế">
                <option value={0}>IELTS Academic &amp; Cambridge KET/PET</option>
              </optgroup>
            </select>
          </div>

          <!-- 3. Skill Choice -->
          <div class="space-y-2">
            <label class="block font-bold text-slate-300" for="rand-skill">3. Trọng Tâm Kỹ Năng:</label>
            <select
              id="rand-skill"
              bind:value={randomSkill}
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-amber-400"
            >
              <option value="all">🌟 Tổng Hợp Toàn Diện (Mixed Skills)</option>
              <option value="grammar">📐 Ngữ Pháp Cú Pháp (Grammar Focus)</option>
              <option value="vocabulary">🔤 Từ Vựng &amp; Cụm Từ (Vocabulary)</option>
              <option value="phonics">🔊 Ngữ Âm &amp; Phát Âm (Phonics &amp; IPA)</option>
              <option value="reading">📖 Đọc Hiểu &amp; Biển Báo (Reading)</option>
            </select>
          </div>
        </div>

        <!-- Action Button -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div class="text-xs text-slate-400 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>Sinh đề ngẫu nhiên chuẩn ma trận nhận thức D1 (Nhận biết • Thông hiểu • Vận dụng).</span>
          </div>

          <button
            type="button"
            onclick={generateRandomExam}
            disabled={isGeneratingRandom}
            class="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
          >
            {#if isGeneratingRandom}
              <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Đang Lấy Mẫu Ngẫu Nhiên Từ D1...</span>
            {:else}
              <span>🚀 Bắt Đầu Làm Đề Ngẫu Nhiên {randomDuration} Phút</span>
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <!-- Quick Random Banner for other tabs -->
    {#if activeExamCategory !== 'random_builder'}
      <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div class="flex items-center gap-2 text-slate-300">
          <span class="text-base">🎲</span>
          <span>Cần bài tập nhanh không trùng lặp? Hãy thử <strong>Bộ Tạo Đề Ngẫu Nhiên 5p • 15p • 45p</strong> từ kho 573 câu hỏi!</span>
        </div>
        <button
          type="button"
          onclick={() => activeExamCategory = 'random_builder'}
          class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs whitespace-nowrap self-start sm:self-auto shadow-sm"
        >
          🎲 Mở Bộ Tạo Đề
        </button>
      </div>
    {/if}

    <!-- Exam Cards Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {#each filteredExams as ex}
        {@const isEnrolled = isExamEnrolledForUser(currentUser, ex)}
        {@const isSelected = selectedExamId === ex.id}
        {@const is5m = ex.format_type === 'quick_5m' || ex.duration_minutes === 5}
        {@const is15m = ex.format_type === 'quick_15m' || ex.duration_minutes === 15}
        {@const is45m = ex.format_type === 'standard_45m' || ex.duration_minutes === 45}
        <button
          onclick={() => handleSelectExam(ex)}
          class="p-3.5 rounded-2xl border text-left transition-all duration-200 hover-lift flex flex-col justify-between {isSelected ? 'bg-gradient-to-br from-sky-600 to-blue-600 border-sky-400 text-white shadow-lg shadow-sky-600/25 ring-2 ring-sky-300/80 font-semibold' : (isEnrolled ? 'bg-white/90 dark:bg-slate-900/90 border-sky-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-md' : 'bg-slate-100/60 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-800/40 text-slate-400 opacity-60 hover:opacity-85')}"
        >
          <div>
            <div class="flex items-center justify-between text-[10px] font-bold uppercase mb-1.5">
              <span class="{isSelected ? 'text-sky-100' : (isEnrolled ? (is5m ? 'text-amber-500 font-extrabold' : (is15m ? 'text-sky-600 dark:text-sky-400 font-extrabold' : 'text-blue-600 dark:text-blue-400 font-extrabold')) : 'text-slate-400')}">
                {#if !isEnrolled}🔒 {/if}
                {is5m ? '⚡ 5 Phút' : (is15m ? '⏱️ 15 Phút' : (is45m ? '📝 45 Phút' : (ex.format_type === 'ielts_academic' ? '🌍 IELTS' : (ex.format_type === 'toeic_lr' ? '💼 TOEIC' : (ex.format_type === 'toefl_ibt' ? '🎓 TOEFL' : '📜 Khảo Thí')))))}
              </span>
              {#if !isEnrolled}
                <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">Khóa</span>
              {:else}
                <span class="opacity-80 font-mono text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{ex.duration_minutes}'</span>
              {/if}
            </div>
            <div class="font-bold text-xs line-clamp-2 leading-snug">{ex.title}</div>
          </div>
          <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] opacity-75 flex items-center justify-between">
            <span>{ex.total_questions} câu</span>
            <span class="uppercase font-semibold">{ex.skill_category}</span>
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

  <!-- Guest Exam Modal -->
  <GuestExamModal bind:isOpen={showGuestModal} />
</div>
