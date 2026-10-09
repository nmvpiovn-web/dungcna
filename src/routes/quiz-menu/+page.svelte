<script>
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';
  import QuizReviewPanel from '$lib/components/QuizReviewPanel.svelte';
  import QuizCameraCapture from '$lib/components/QuizCameraCapture.svelte';
  import QuizChildResults from '$lib/components/QuizChildResults.svelte';
  import { cacheQuizData, getCachedQuizData, installQuizOnlineSync, queueQuizAttempt } from '$lib/quizOffline.js';

  const questionTypes = [
    ['multiple_choice', 'Trắc nghiệm', 'Chọn một đáp án đúng'],
    ['fill_blank', 'Điền ô trống', 'Nhập từ hoặc cụm từ'],
    ['matching', 'Nối từ', 'Ghép hai cột tương ứng'],
    ['paragraph', 'Viết đoạn văn', 'Giáo viên sẽ chấm'],
    ['picture_guess', 'Nhìn hình đoán chữ', 'Quan sát và nhập đáp án'],
    ['rewrite', 'Viết lại câu', 'Giáo viên sẽ chấm']
  ];

  let activeTab = $state('take');
  let currentUser = $state(null);
  let publicQuizzes = $state([]);
  let myQuizzes = $state([]);
  let loading = $state(true);
  let message = $state('');
  let error = $state('');
  let guestName = $state('');
  let guestClass = $state('');
  let selectedQuiz = $state(null);
  let startPanel = $state(false);
  let examOpen = $state(false);
  let starting = $state(false);
  let submitting = $state(false);
  let attempt = $state(null);
  let answers = $state({});
  let result = $state(null);
  let secondsLeft = $state(0);
  let timer;
  let abandonArmed = $state(false);
  let abandonTimer;
  let sourceMode = $state('manual');
  let sourceBusy = $state(false);
  let sourceFile = $state(null);
  let driveFiles = $state([]);
  let selectedDriveFileId = $state('');
  let driveUrl = $state('');
  let selectedManageQuiz = $state(null);
  let bundle = $state(null);
  let bundleBusy = $state(false);
  let homeworkForm = $state({ session_id: '', class_id: '', class_name: '', deadline_date: '', deadline_time: '18:00' });
  let selectedReviewQuizId = $state('');
  let assignedMode = $state(false); // true khi student đang xem quiz được giao
  // Giao quiz: modal state
  let assignQuiz = $state(null);
  let assignClasses = $state([]);
  let assignForm = $state({ class_id: '', due_date: '' });
  let assignBusy = $state(false);
  let assignError = $state('');
  let assignMessage = $state('');
  let removeOnlineSync = () => {};

  let draft = $state({
    id: null, title: '', description: '', time_limit_minutes: 20, questions: []
  });

  let isStaff = $derived(['teacher', 'leader', 'admin', 'superadmin'].includes((currentUser?.role || '').toLowerCase()));
  // Role-aware tabs: staff thấy Tạo/Quản lý/Làm; parent thấy Làm + Kết quả con; student/guest chỉ Làm
  let userRole = $derived((currentUser?.role || '').toLowerCase());
  let visibleTabs = $derived(
    ['teacher', 'leader', 'admin', 'superadmin'].includes(userRole) ? ['create', 'mine', 'take']
    : userRole === 'parent' ? ['take', 'results']
    : ['take']
  );
  function ensureVisibleTab() {
    if (!visibleTabs.includes(activeTab)) activeTab = 'take';
  }
  let answeredCount = $derived(selectedQuiz?.questions?.filter((q) => answerHasValue(answers[q.id])).length || 0);
  let progress = $derived(selectedQuiz?.questions?.length ? Math.round(answeredCount / selectedQuiz.questions.length * 100) : 0);

  function token() {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token') || '';
  }

  function headers(withJson = false) {
    const authToken = token();
    return {
      ...(withJson ? { 'content-type': 'application/json' } : {}),
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {})
    };
  }

  async function api(url, options = {}) {
    const withJson = !!options.body && !(options.body instanceof FormData);
    const response = await fetch(url, { ...options, headers: { ...headers(withJson), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || 'Không thể kết nối máy chủ');
    return body;
  }

  async function loadQuizzes() {
    loading = true;
    error = '';
    try {
      // Student: chỉ thấy quiz được giao cho lớp của mình (assignment flow).
      // Staff/guest/parent: giữ luồng quiz public như cũ.
      const isStudent = userRole === 'student';
      let publicData;
      try {
        publicData = isStudent
          ? await api('/api/quiz-menu?assigned=1')
          : await api('/api/quiz-menu');
      } catch (err) {
        // Student: KHÔNG fallback về public (isolation). Hiển thị trống + thông báo.
        if (isStudent) {
          publicData = { quizzes: [], assigned: true };
          error = 'Không tải được quiz được giao. Hãy thử lại.';
        }
        else throw err;
      }
      publicQuizzes = publicData.quizzes || [];
      assignedMode = !!publicData.assigned;
      cacheQuizData('catalog', publicData).catch(() => {});
      // Chỉ gọi ?mine=1 khi role có tab mine
      if (visibleTabs.includes('mine')) {
        const mineData = await api('/api/quiz-menu?mine=1');
        myQuizzes = mineData.quizzes || [];
      } else {
        myQuizzes = [];
      }
    } catch (err) {
      const cached = await getCachedQuizData('catalog').catch(() => null);
      if (cached) {
        publicQuizzes = cached.quizzes || [];
        message = 'Đang xem danh sách quiz đã lưu trên thiết bị.';
      } else error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    currentUser = getCurrentUser();
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) activeTab = tabParam;
    ensureVisibleTab();
    loadQuizzes();
    // Deep link ?quiz= luôn mở luồng làm bài
    const sharedQuizId = params.get('quiz');
    if (sharedQuizId) openQuiz({ id: sharedQuizId });
    const authListener = (event) => {
      currentUser = event.detail;
      ensureVisibleTab();
      loadQuizzes();
    };
    window.addEventListener('tienganh:auth-change', authListener);
    removeOnlineSync = installQuizOnlineSync(token);
    return () => { window.removeEventListener('tienganh:auth-change', authListener); removeOnlineSync(); };
  });

  onDestroy(() => {
    clearInterval(timer);
    clearTimeout(abandonTimer);
    unlockPage();
    removeOnlineSync();
  });

  function selectTab(tab) {
    if (!visibleTabs.includes(tab)) return;
    activeTab = tab;
    message = '';
    error = '';
    if (tab === 'mine' || tab === 'take') loadQuizzes();
  }

  function blankQuestion(type = 'multiple_choice') {
    return {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type, prompt: '', prompt_image_url: '', points: 1,
      options: type === 'multiple_choice' ? ['Lựa chọn A', 'Lựa chọn B'] : [],
      left: type === 'matching' ? ['Từ 1', 'Từ 2'] : [],
      right: type === 'matching' ? ['Nghĩa 1', 'Nghĩa 2'] : [],
      correct_answer: type === 'matching' ? {} : '', explanation: ''
    };
  }

  function addQuestion(type) {
    draft.questions = [...draft.questions, blankQuestion(type)];
  }

  function removeQuestion(index) {
    draft.questions = draft.questions.filter((_, i) => i !== index);
  }

  function moveQuestion(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= draft.questions.length) return;
    const copy = [...draft.questions];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    draft.questions = copy;
  }

  function changeQuestionType(question, type) {
    const replacement = blankQuestion(type);
    Object.assign(question, replacement, { id: question.id, prompt: question.prompt, points: question.points });
    draft.questions = [...draft.questions];
  }

  function updateOption(question, index, value) {
    question.options[index] = value;
    question.options = [...question.options];
    draft.questions = [...draft.questions];
  }

  function addOption(question) {
    if (question.options.length >= 8) return;
    question.options = [...question.options, `Lựa chọn ${question.options.length + 1}`];
    draft.questions = [...draft.questions];
  }

  function removeOption(question, index) {
    if (question.options.length <= 2) return;
    const removed = question.options[index];
    question.options = question.options.filter((_, i) => i !== index);
    if (question.correct_answer === removed) question.correct_answer = '';
    draft.questions = [...draft.questions];
  }

  function addPair(question) {
    question.left = [...question.left, `Từ ${question.left.length + 1}`];
    question.right = [...question.right, `Nghĩa ${question.right.length + 1}`];
    draft.questions = [...draft.questions];
  }

  function updatePair(question, side, index, value) {
    question[side][index] = value;
    question[side] = [...question[side]];
    question.correct_answer = Object.fromEntries(question.left.map((left, i) => [left, question.right[i] || '']));
    draft.questions = [...draft.questions];
  }

  function payloadQuestions() {
    return draft.questions.map((q, index) => ({
      id: q.id, type: q.type, prompt: q.prompt, prompt_image_url: q.prompt_image_url || null,
      options_json: q.type === 'matching' ? { left: q.left, right: q.right } : q.options,
      correct_answer: q.type === 'matching' ? Object.fromEntries(q.left.map((left, i) => [left, q.right[i] || ''])) : q.correct_answer,
      explanation: q.explanation, points: Number(q.points) || 1, q_order: index
    }));
  }

  function fromApiQuestion(question, index) {
    let options = question.options_json;
    if (typeof options === 'string') try { options = JSON.parse(options); } catch { options = []; }
    return {
      id: question.id, type: question.type, prompt: question.prompt, prompt_image_url: question.prompt_image_url || '',
      points: Number(question.points || 1), options: Array.isArray(options) ? options : [],
      left: options?.left || [], right: options?.right || [], correct_answer: question.correct_answer || '',
      explanation: question.explanation || '', q_order: index
    };
  }

  async function ensureDraftQuiz() {
    if (draft.id) return draft.id;
    if (!draft.title.trim()) throw new Error('Hãy nhập tên quiz trước khi chọn tài liệu.');
    const created = await api('/api/quiz-menu', { method: 'POST', body: JSON.stringify({
      title: draft.title, description: draft.description, time_limit_minutes: Number(draft.time_limit_minutes)
    }) });
    draft = { ...draft, id: created.quiz.id };
    return created.quiz.id;
  }

  async function importSource() {
    sourceBusy = true; error = ''; message = '';
    try {
      const id = await ensureDraftQuiz();
      let data;
      if (sourceMode === 'upload') {
        if (!sourceFile) throw new Error('Hãy chọn một file nguồn.');
        const form = new FormData(); form.set('file', sourceFile);
        data = await api(`/api/quiz-menu/${id}/upload`, { method: 'POST', body: form, headers: {} });
      } else {
        const pastedUrl = driveUrl.trim();
        if (!selectedDriveFileId && !pastedUrl) throw new Error('Hãy chọn một file trong Drive hoặc dán link.');
        const payload = pastedUrl ? { url: pastedUrl } : { file_id: selectedDriveFileId };
        data = await api(`/api/quiz-menu/${id}/from-drive`, { method: 'POST', body: JSON.stringify(payload) });
      }
      draft = { ...draft, questions: (data.questions || []).map(fromApiQuestion) };
      bundle = data.bundle || null;
      message = `Đã tạo ${draft.questions.length} câu và đồng bộ DOCX, Quiz, BTVN nháp.`;
    } catch (err) { error = friendlyError(err.message); }
    finally { sourceBusy = false; }
  }

  async function chooseSource(mode) {
    sourceMode = mode; error = '';
    if (mode === 'drive' && !driveFiles.length) {
      sourceBusy = true;
      try { driveFiles = (await api('/api/quiz-menu/drive-files')).files || []; }
      catch (err) { error = friendlyError(err.message); }
      finally { sourceBusy = false; }
    }
  }

  async function saveDraft(publish = false) {
    message = '';
    error = '';
    if (!draft.title.trim()) { error = 'Hãy nhập tên quiz.'; return; }
    if (!draft.questions.length) { error = 'Hãy thêm ít nhất một câu hỏi.'; return; }
    try {
      const id = await ensureDraftQuiz();
      await api(`/api/quiz-menu/${id}`, {
        method: 'PUT', body: JSON.stringify({
          title: draft.title, description: draft.description,
          time_limit_minutes: Number(draft.time_limit_minutes),
          status: publish ? 'published' : 'draft', questions: payloadQuestions()
        })
      });
      if (!bundle) bundle = (await api(`/api/quiz-menu/${id}/sync-bundle`, { method: 'POST', body: JSON.stringify({ direction: 'publish_quiz_to_docs' }) })).bundle;
      message = publish ? 'Đã xuất bản quiz.' : 'Đã lưu bản nháp.';
      draft = { id: null, title: '', description: '', time_limit_minutes: 20, questions: [] };
      bundle = null; sourceFile = null; selectedDriveFileId = ''; driveUrl = ''; sourceMode = 'manual';
      await loadQuizzes();
      activeTab = 'mine';
    } catch (err) {
      error = err.message;
    }
  }

  async function shareQuiz(quiz) {
    const link = new URL('/quiz-menu', window.location.origin);
    link.searchParams.set('quiz', quiz.id);
    try { await navigator.clipboard.writeText(link.href); message = 'Đã sao chép link. Khách có thể nhập tên và lớp để làm bài.'; }
    catch { message = `Link làm bài: ${link.href}`; }
  }

  async function editQuiz(quiz) {
    message = '';
    error = '';
    try {
      const data = await api(`/api/quiz-menu/${quiz.id}?include_answers=1`);
      const q = data.quiz;
      draft = {
        id: q.id,
        title: q.title || '',
        description: q.description || '',
        time_limit_minutes: q.time_limit_minutes || 20,
        questions: (q.questions || []).map((qq, idx) => ({
          id: qq.id || `q${idx}`,
          type: qq.type || 'mcq',
          prompt: qq.prompt || '',
          options: qq.options || ['', '', '', ''],
          correct_answer: qq.correct_answer ?? 0,
          explanation: qq.explanation || '',
          points: qq.points || 1
        }))
      };
      bundle = null;
      sourceMode = 'manual';
      activeTab = 'create';
      message = `Đang sửa quiz: ${q.title}`;
    } catch (err) {
      error = 'Không tải được quiz: ' + err.message;
    }
  }

  async function deleteQuiz(quiz) {
    if (!confirm(`Xóa quiz "${quiz.title}"? Hành động này không thể hoàn tác.`)) return;
    message = '';
    error = '';
    try {
      await api(`/api/quiz-menu/${quiz.id}`, { method: 'DELETE' });
      message = `Đã xóa quiz "${quiz.title}".`;
      await loadQuizzes();
    } catch (err) {
      error = 'Không xóa được: ' + err.message;
    }
  }

  // Giao quiz cho lớp: mở modal, tải danh sách lớp, submit
  async function openAssignModal(quiz) {
    assignQuiz = quiz;
    assignClasses = [];
    assignForm = { class_id: '', due_date: '' };
    assignError = '';
    assignMessage = '';
    try {
      const data = await api(`/api/quiz-menu/${quiz.id}/assign`);
      assignClasses = data.classes || [];
      if (!assignClasses.length) assignError = 'Bạn chưa có lớp dạy nào trong thời khóa biểu.';
    } catch (err) {
      assignError = 'Không tải được danh sách lớp: ' + err.message;
    }
  }

  async function submitAssign() {
    assignError = '';
    assignMessage = '';
    if (!assignForm.class_id) { assignError = 'Hãy chọn lớp để giao quiz.'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assignForm.due_date)) { assignError = 'Hạn nộp phải có dạng YYYY-MM-DD.'; return; }
    assignBusy = true;
    try {
      const data = await api(`/api/quiz-menu/${assignQuiz.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ class_id: assignForm.class_id, due_date: assignForm.due_date })
      });
      assignMessage = data.message || 'Đã giao quiz.';
      message = data.message || 'Đã giao quiz.';
    } catch (err) {
      assignError = err.message;
    } finally {
      assignBusy = false;
    }
  }

  async function openQuiz(quiz) {
    error = '';
    result = null;
    try {
      const data = await api(`/api/quiz-menu/${encodeURIComponent(quiz.id)}`);
      selectedQuiz = data.quiz;
      cacheQuizData(`quiz:${quiz.id}`, data).catch(() => {});
      answers = {};
      guestName = ''; guestClass = '';
      startPanel = true;
    } catch (err) {
      // Không mở cache khi 404 (quiz không được giao / không tồn tại) — chống bypass isolation
      const is404 = /QuizNotFound|404|không khả dụng/i.test(err.message || '');
      if (is404) { error = 'Quiz không khả dụng hoặc bạn không được giao quiz này.'; return; }
      const cached = await getCachedQuizData(`quiz:${quiz.id}`).catch(() => null);
      if (cached?.quiz) {
        selectedQuiz = cached.quiz; answers = {}; guestName = ''; guestClass = ''; startPanel = true;
        message = 'Đang mở bản quiz đã lưu trên thiết bị.';
      } else error = err.message;
    }
  }

  async function startAttempt() {
    if (!currentUser && (!guestName.trim() || !guestClass.trim())) { error = 'Hãy nhập tên và lớp để bắt đầu.'; return; }
    starting = true;
    error = '';
    try {
      const data = await api(`/api/quiz-menu/${selectedQuiz.id}/submit`, {
        method: 'POST', body: JSON.stringify({ action: 'start', guest_name: guestName, guest_class: guestClass })
      });
      attempt = data;
      startPanel = false;
      examOpen = true;
      abandonArmed = false;
      lockPage();
      updateCountdown();
      clearInterval(timer);
      timer = setInterval(updateCountdown, 1000);
    } catch (err) {
      error = !navigator.onLine ? 'Cần kết nối mạng để máy chủ bắt đầu và tính giờ bài làm.' : friendlyError(err.message);
    } finally {
      starting = false;
    }
  }

  function updateCountdown() {
    const deadline = Date.parse(attempt?.deadline_at || '');
    secondsLeft = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
    if (secondsLeft === 0 && examOpen && !submitting) submitAttempt(true);
  }

  function formatTime(value) {
    const minutes = Math.floor(value / 60).toString().padStart(2, '0');
    const seconds = (value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function answerHasValue(value) {
    if (value?.state === 'not_understood') return false;
    if (value && typeof value === 'object') return Object.values(value).some(Boolean);
    return String(value ?? '').trim().length > 0;
  }

  function isDeferred(id) { return answers[id]?.state === 'not_understood'; }

  function toggleDeferred(id) {
    if (isDeferred(id)) {
      const copy = { ...answers }; delete copy[id]; answers = copy;
    } else answers = { ...answers, [id]: { state: 'not_understood' } };
  }

  async function saveForLater() {
    if (!attempt || submitting) return;
    submitting = true; error = '';
    try {
      const deferred_question_ids = Object.keys(answers).filter(isDeferred);
      await api(`/api/quiz-menu/${selectedQuiz.id}/submit`, { method: 'POST', body: JSON.stringify({
        action: 'save_for_later', attempt_id: attempt.attempt_id, attempt_token: attempt.attempt_token,
        answers, deferred_question_ids
      }) });
      message = 'Đã lưu phần chưa hiểu. Bạn có thể quay lại sửa trước hạn.';
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError || /fetch|network|kết nối/i.test(err.message)) {
        const deferredQuestionIds = Object.keys(answers).filter(isDeferred);
        await queueQuizAttempt({ quizId: selectedQuiz.id, attemptId: attempt.attempt_id, attemptToken: attempt.attempt_token, answers, action: 'save_for_later', deferredQuestionIds });
        message = 'Mất mạng: phần chưa hiểu đã được lưu và sẽ đồng bộ khi có kết nối.';
      } else error = friendlyError(err.message);
    }
    finally { submitting = false; }
  }

  async function openBundle(quiz) {
    selectedManageQuiz = quiz; bundle = null; bundleBusy = true; error = '';
    try { bundle = (await api(`/api/quiz-menu/${quiz.id}/bundle`)).bundle; }
    catch (err) { error = friendlyError(err.message); selectedManageQuiz = null; }
    finally { bundleBusy = false; }
  }

  async function syncBundle(direction) {
    if (!selectedManageQuiz) return;
    bundleBusy = true; error = '';
    try {
      const payload = direction === 'publish_homework' ? { direction, ...homeworkForm } : { direction };
      const data = await api(`/api/quiz-menu/${selectedManageQuiz.id}/sync-bundle`, { method: 'POST', body: JSON.stringify(payload) });
      if (direction === 'publish_homework') {
        message = 'Đã giao bài tập trên timbk.io.vn và gửi thông báo.';
        bundle = { ...bundle, homework_status: 'published' };
      } else bundle = data.bundle;
    } catch (err) { error = friendlyError(err.message); }
    finally { bundleBusy = false; }
  }

  function setAnswer(id, value) {
    answers = { ...answers, [id]: value };
  }

  function setMatching(id, left, value) {
    answers = { ...answers, [id]: { ...(answers[id] || {}), [left]: value } };
  }

  async function submitAttempt(auto = false) {
    if (!attempt || submitting) return;
    submitting = true;
    error = '';
    try {
      const data = await api(`/api/quiz-menu/${selectedQuiz.id}/submit`, {
        method: 'POST', body: JSON.stringify({
          action: 'submit', attempt_id: attempt.attempt_id,
          attempt_token: attempt.attempt_token, answers
        })
      });
      result = data;
      clearInterval(timer);
      examOpen = false;
      unlockPage();
      message = auto ? 'Hết giờ. Bài đã được nộp tự động.' : 'Đã nộp bài thành công.';
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError || /fetch|network|kết nối/i.test(err.message)) {
        await queueQuizAttempt({ quizId: selectedQuiz.id, attemptId: attempt.attempt_id, attemptToken: attempt.attempt_token, answers });
        clearInterval(timer); examOpen = false; unlockPage();
        message = 'Mất mạng: bài đã được lưu an toàn và sẽ tự gửi khi có kết nối.';
      } else {
        error = friendlyError(err.message);
      }
      if (err.message === 'TimeLimitExceeded') {
        clearInterval(timer);
        examOpen = false;
        unlockPage();
      }
    } finally {
      submitting = false;
    }
  }

  function abandonExam() {
    if (!abandonArmed) {
      abandonArmed = true;
      clearTimeout(abandonTimer);
      abandonTimer = setTimeout(() => abandonArmed = false, 5000);
      return;
    }
    clearInterval(timer);
    examOpen = false;
    attempt = null;
    answers = {};
    abandonArmed = false;
    unlockPage();
    message = 'Đã thoát bài. Lần làm này chưa được nộp.';
  }

  function lockPage() {
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
    if (typeof window !== 'undefined') window.__isExamActive = true;
  }

  function unlockPage() {
    if (typeof document !== 'undefined') document.body.style.overflow = '';
    if (typeof window !== 'undefined') window.__isExamActive = false;
  }

  function friendlyError(code) {
    const labels = {
      TimeLimitExceeded: 'Đã hết thời gian làm bài.', RateLimitExceeded: 'Bạn bắt đầu quá nhiều lượt. Hãy thử lại sau một phút.',
      QuizNotFound: 'Quiz không còn khả dụng.', AttemptAlreadyClosed: 'Lần làm bài này đã kết thúc.',
      DeferredQuestionsRemain: 'Bạn còn câu đã đánh dấu Không hiểu. Hãy sửa hoặc lưu để làm sau.',
      BundleSyncConflict: 'Google Docs và quiz đều đã thay đổi. Hãy chọn rõ chiều đồng bộ.',
      DriveNotConfigured: 'Google Drive chưa được cấu hình trên máy chủ.'
    };
    return labels[code] || code;
  }
</script>

<main class="quiz-page">
  <section class="quiz-hero">
    <div>
      <span class="eyebrow">QUIZ STUDIO</span>
      <h1>Học một chút, nhớ thật lâu</h1>
      <p>Tự tạo thử thách, luyện sáu dạng bài và xem kết quả ngay sau khi nộp.</p>
    </div>
    <div class="hero-mark" aria-hidden="true">Q<span>+</span></div>
  </section>

  <nav class="tabs" aria-label="Chức năng Quiz Menu">
    {#if visibleTabs.includes('create')}<button class:active={activeTab === 'create'} on:click={() => selectTab('create')}><span>✦</span>Tạo Quiz</button>{/if}
    {#if visibleTabs.includes('mine')}<button class:active={activeTab === 'mine'} on:click={() => selectTab('mine')}><span>▤</span>Quiz của tôi</button>{/if}
    {#if visibleTabs.includes('take')}<button class:active={activeTab === 'take'} on:click={() => selectTab('take')}><span>▶</span>Làm Quiz</button>{/if}
    {#if visibleTabs.includes('results')}<button class:active={activeTab === 'results'} on:click={() => selectTab('results')}><span>📊</span>Kết quả con</button>{/if}
  </nav>

  {#if message}<div class="notice success" role="status">✓ {message}</div>{/if}
  {#if error}<div class="notice error" role="alert">{error}</div>{/if}

  {#if activeTab === 'create'}
    {#if !isStaff}
    <section class="workspace">
      <div class="permission-card"><span>🔒</span><div><strong>Cần tài khoản giáo viên hoặc leader</strong><p>Đăng nhập đúng vai trò để tạo quiz.</p></div></div>
    </section>
    {:else}
    <section class="workspace create-workspace">
      <div class="section-heading">
        <div><span class="section-kicker">SOẠN BÀI</span><h2>Tạo quiz mới</h2></div>
        <span class="draft-count">{draft.questions.length} câu</span>
      </div>
      <div class="source-grid">
        <button class:active-source={sourceMode === 'manual'} class="source-card" type="button" on:click={() => chooseSource('manual')}><span>✍</span><strong>Soạn thủ công</strong><small>Thêm từng câu hỏi</small></button>
        <button class:active-source={sourceMode === 'upload'} class="source-card" type="button" disabled={!isStaff} on:click={() => chooseSource('upload')}><span>⇧</span><strong>Tải tài liệu</strong><small>PDF, DOCX, TXT, ảnh</small></button>
        <button class:active-source={sourceMode === 'drive'} class="source-card" type="button" disabled={!isStaff} on:click={() => chooseSource('drive')}><span>△</span><strong>Chọn từ Drive</strong><small>Quiz Uploads</small></button>
      </div>
      <div class="form-grid">
        <label class="wide">Tên quiz<input bind:value={draft.title} maxlength="150" placeholder="Ví dụ: Unit 3 · At home" /></label>
        <label>Thời gian (phút)<input type="number" min="1" max="180" bind:value={draft.time_limit_minutes} /></label>
        <label class="wide">Mô tả<textarea bind:value={draft.description} maxlength="2000" rows="2" placeholder="Mục tiêu và hướng dẫn ngắn"></textarea></label>
      </div>
      {#if sourceMode !== 'manual'}
        <div class="source-panel">
          {#if sourceMode === 'upload'}
            <div>
              <label>File nguồn<input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" on:change={(event) => sourceFile = event.currentTarget.files?.[0] || null} /></label>
              {#if sourceFile}<p class="file-chosen">Đã chọn: {sourceFile.name}</p>{/if}
              <QuizCameraCapture onCapture={(file) => { sourceFile = file; message = 'Đã chụp ảnh tài liệu. Bấm "Tạo bộ tài liệu" để xử lý.'; }} />
            </div>
          {:else}
            <div>
              <label>File trong Google Drive<select bind:value={selectedDriveFileId}><option value="">Chọn file...</option>{#each driveFiles as file}<option value={file.id}>{file.name}</option>{/each}</select></label>
              <label>Dán link Drive/Docs<input type="url" bind:value={driveUrl} placeholder="https://drive.google.com/..." inputmode="url" /></label>
            </div>
          {/if}
          <div><strong>Một lần tạo, ba nơi dùng</strong><p>DOCX để in · Quiz tương tác · BTVN nháp trên timbk.io.vn</p></div>
          <button class="btn-main" disabled={sourceBusy} on:click={importSource}>{sourceBusy ? 'Đang xử lý...' : 'Tạo bộ tài liệu'}</button>
        </div>
      {/if}

      <div class="type-picker">
        <h3>Thêm dạng câu hỏi</h3>
        <div class="type-grid">
          {#each questionTypes as type}
            <button type="button" on:click={() => addQuestion(type[0])}><span>＋</span><div><strong>{type[1]}</strong><small>{type[2]}</small></div></button>
          {/each}
        </div>
      </div>

      <div class="question-editor-list">
        {#each draft.questions as question, index (question.id)}
          <article class="editor-card">
            <header>
              <span class="question-number">{index + 1}</span>
              <select aria-label={`Dạng câu ${index + 1}`} value={question.type} on:change={(e) => changeQuestionType(question, e.currentTarget.value)}>
                {#each questionTypes as type}<option value={type[0]}>{type[1]}</option>{/each}
              </select>
              <div class="editor-actions">
                <button aria-label="Đưa câu lên" on:click={() => moveQuestion(index, -1)} disabled={index === 0}>↑</button>
                <button aria-label="Đưa câu xuống" on:click={() => moveQuestion(index, 1)} disabled={index === draft.questions.length - 1}>↓</button>
                <button class="delete" aria-label="Xóa câu" on:click={() => removeQuestion(index)}>×</button>
              </div>
            </header>
            <label>Nội dung câu hỏi<textarea bind:value={question.prompt} rows="2" placeholder="Nhập câu hỏi..."></textarea></label>
            {#if question.type === 'picture_guess'}
              <label>Đường dẫn ảnh<input type="url" bind:value={question.prompt_image_url} placeholder="https://..." /></label>
            {/if}
            {#if question.type === 'multiple_choice'}
              <div class="option-editor">
                <span class="field-label">Các lựa chọn và đáp án đúng</span>
                {#each question.options as option, optionIndex}
                  <div class="option-row">
                    <input type="radio" name={`correct-${question.id}`} value={option} checked={question.correct_answer === option} on:change={() => question.correct_answer = option} aria-label={`Chọn đáp án ${optionIndex + 1} là đúng`} />
                    <input value={option} on:input={(e) => updateOption(question, optionIndex, e.currentTarget.value)} aria-label={`Lựa chọn ${optionIndex + 1}`} />
                    <button on:click={() => removeOption(question, optionIndex)} aria-label="Xóa lựa chọn">×</button>
                  </div>
                {/each}
                <button class="text-button" on:click={() => addOption(question)}>＋ Thêm lựa chọn</button>
              </div>
            {:else if question.type === 'matching'}
              <div class="pair-editor">
                <span class="field-label">Các cặp đúng</span>
                {#each question.left as left, pairIndex}
                  <div><input value={left} on:input={(e) => updatePair(question, 'left', pairIndex, e.currentTarget.value)} aria-label={`Vế trái ${pairIndex + 1}`} /><span>↔</span><input value={question.right[pairIndex]} on:input={(e) => updatePair(question, 'right', pairIndex, e.currentTarget.value)} aria-label={`Vế phải ${pairIndex + 1}`} /></div>
                {/each}
                <button class="text-button" on:click={() => addPair(question)}>＋ Thêm cặp</button>
              </div>
            {:else if !['paragraph', 'rewrite'].includes(question.type)}
              <label>Đáp án đúng<input bind:value={question.correct_answer} placeholder="Đáp án để chấm tự động" /></label>
            {:else}
              <div class="review-note">Câu này sẽ được giáo viên hoặc leader chấm sau khi học viên nộp bài.</div>
            {/if}
            <div class="editor-bottom">
              <label>Điểm<input type="number" min="0" max="100" step="0.5" bind:value={question.points} /></label>
              <label>Giải thích<input bind:value={question.explanation} placeholder="Hiện sau khi chấm" /></label>
            </div>
          </article>
        {:else}
          <div class="empty-editor"><span>✦</span><h3>Bắt đầu bằng một câu hỏi</h3><p>Chọn một trong sáu dạng phía trên.</p></div>
        {/each}
      </div>
      <div class="save-bar">
        <div><strong>{draft.questions.length} câu hỏi</strong><small>Kiểm tra nội dung trước khi xuất bản</small></div>
        <button class="btn-outline" disabled={!isStaff} on:click={() => saveDraft(false)}>Lưu nháp</button>
        <button class="btn-main" disabled={!isStaff} on:click={() => saveDraft(true)}>Xuất bản Quiz</button>
      </div>
    </section>
    {/if}
  {:else if activeTab === 'mine'}
    <section class="workspace">
      <div class="section-heading"><div><span class="section-kicker">THƯ VIỆN</span><h2>Quiz của tôi</h2></div><button class="btn-main compact" on:click={() => selectTab('create')}>＋ Tạo mới</button></div>
      {#if !isStaff}
        <div class="empty-state"><span>🔐</span><h3>Đăng nhập tài khoản giáo viên</h3><p>Quiz nháp và quiz đã xuất bản của bạn sẽ xuất hiện ở đây.</p></div>
      {:else if loading}
        <div class="loading-grid"><i></i><i></i><i></i></div>
      {:else if myQuizzes.length}
        <div class="quiz-grid">
          {#each myQuizzes as quiz}
            <article class="quiz-card">
              <div class="quiz-card-top"><span class:published={quiz.status === 'published'}>{quiz.status === 'published' ? 'Đã xuất bản' : quiz.status === 'draft' ? 'Bản nháp' : 'Đã lưu trữ'}</span><b>{quiz.time_limit_minutes} phút</b></div>
              <h3>{quiz.title}</h3><p>{quiz.description || 'Chưa có mô tả.'}</p>
              <footer><small>Cập nhật {new Date(quiz.updated_at).toLocaleDateString('vi-VN')}</small><div><button on:click={() => selectedReviewQuizId = selectedReviewQuizId === quiz.id ? '' : quiz.id}>Chấm bài</button><button on:click={() => openBundle(quiz)}>DOCX &amp; BTVN</button><button on:click={() => editQuiz(quiz)}>✏️ Sửa</button><button on:click={() => deleteQuiz(quiz)} style="color:#dc2626">🗑️ Xóa</button>{#if quiz.status === 'published'}<button class="assign-btn" on:click={() => openAssignModal(quiz)}>📤 Giao bài</button><button on:click={() => shareQuiz(quiz)}>Sao chép link</button><button on:click={() => { activeTab = 'take'; openQuiz(quiz); }}>Xem bài →</button>{/if}</div></footer>
            </article>
          {/each}
        </div>
        {#if selectedReviewQuizId}<div class="review-wrap"><QuizReviewPanel quizId={selectedReviewQuizId} onReviewed={() => message = 'Đã lưu điểm và nhận xét.'} /></div>{/if}
      {:else}
        <div class="empty-state"><span>▤</span><h3>Chưa có quiz nào</h3><p>Tạo quiz đầu tiên để giao bài cho học viên.</p><button class="btn-main" on:click={() => selectTab('create')}>Tạo Quiz</button></div>
      {/if}
    </section>
  {:else if activeTab === 'results'}
    <section class="workspace">
      <div class="section-heading"><div><span class="section-kicker">PHỤ HUYNH</span><h2>Kết quả học tập của con</h2></div></div>
      <QuizChildResults />
    </section>
  {:else}
    <section class="workspace">
      <div class="section-heading"><div><span class="section-kicker">LUYỆN TẬP</span><h2>{assignedMode ? 'Quiz được giao' : 'Chọn một thử thách'}</h2></div><span class="live-dot"><i></i>{publicQuizzes.length} quiz đang mở</span></div>
      {#if loading}
        <div class="loading-grid"><i></i><i></i><i></i></div>
      {:else if publicQuizzes.length}
        <div class="quiz-grid take-grid">
          {#each publicQuizzes as quiz, index}
            <article class="quiz-card take-card">
              <div class="cover cover-{index % 4}"><span>{index % 3 === 0 ? 'ABC' : index % 3 === 1 ? 'Aa' : '✦'}</span></div>
              <div class="quiz-card-body">
                {#if quiz.assigned_class_name}
                  <div class="assigned-badge"><span>📩 Được giao</span><small>{quiz.assigned_class_name}{quiz.assigned_due_date ? ` · Hạn ${quiz.assigned_due_date}` : ''}</small></div>
                {/if}
                <div class="meta"><span>⏱ {quiz.time_limit_minutes} phút</span><span>•</span><span>{quiz.creator_name || 'TESOL Learning'}</span></div><h3>{quiz.title}</h3><p>{quiz.description || 'Luyện tập kiến thức và nhận kết quả sau khi hoàn thành.'}</p><button class="start-button" on:click={() => openQuiz(quiz)}>Bắt đầu <span>→</span></button></div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="empty-state"><span>☁</span><h3>{assignedMode ? 'Chưa có quiz nào được giao' : 'Chưa có quiz đang mở'}</h3><p>{assignedMode ? 'Giáo viên sẽ giao quiz cho lớp của bạn tại đây.' : 'Hãy quay lại sau khi giáo viên xuất bản bài mới.'}</p></div>
      {/if}
    </section>
  {/if}
</main>

{#if startPanel && selectedQuiz}
  <div class="modal-backdrop" role="presentation" on:click={(e) => e.currentTarget === e.target && (startPanel = false)}>
    <section class="start-dialog" role="dialog" aria-modal="true" aria-labelledby="start-title">
      <button class="dialog-close" aria-label="Đóng" on:click={() => startPanel = false}>×</button>
      <div class="dialog-icon">▶</div><span class="section-kicker">SẴN SÀNG?</span><h2 id="start-title">{selectedQuiz.title}</h2>
      <p>{selectedQuiz.description || 'Làm lần lượt các câu hỏi và nộp trước khi hết giờ.'}</p>
      <div class="rules"><div><span>⏱</span><strong>{selectedQuiz.time_limit_minutes} phút</strong><small>Thời gian từ máy chủ</small></div><div><span>▤</span><strong>{selectedQuiz.questions.length} câu</strong><small>Nộp một lần</small></div></div>
      {#if currentUser}
        <div class="identity">✓ Làm bài với tên <strong>{currentUser.name || currentUser.username}</strong></div>
      {:else}
        <p>Đăng ký để theo dõi kết quả lâu dài. Bạn vẫn có thể làm bài ngay với tư cách khách.</p>
        <a data-sveltekit-reload href={`/quiz-menu?quiz=${encodeURIComponent(selectedQuiz.id)}&login=1`}>Đăng nhập / Đăng ký</a>
        <label class="guest-field">Tên của bạn<input bind:value={guestName} maxlength="50" autocomplete="name" placeholder="Nhập tên để lưu kết quả" required /></label>
        <label class="guest-field">Lớp của bạn<input bind:value={guestClass} maxlength="50" placeholder="Ví dụ: 7A / IELTS tối thứ 3" required /></label>
        <small>Tên, lớp và giờ bắt đầu/nộp bài được lưu để giáo viên đối chiếu lịch dạy.</small>
      {/if}
      <button class="btn-main full" disabled={starting} on:click={startAttempt}>{starting ? 'Đang chuẩn bị...' : 'Vào phòng làm bài'}</button>
      <small class="privacy-note">Khi bắt đầu, đồng hồ sẽ chạy liên tục kể cả khi mất kết nối.</small>
    </section>
  </div>
{/if}

{#if examOpen && selectedQuiz}
  <section class="exam-shell" role="dialog" aria-modal="true" aria-label={`Làm bài ${selectedQuiz.title}`}>
    <header class="exam-topbar">
      <div class="exam-title"><span>QUIZ</span><div><strong>{selectedQuiz.title}</strong><small>{answeredCount}/{selectedQuiz.questions.length} câu đã trả lời</small></div></div>
      <div class:urgent={secondsLeft < 60} class="countdown"><small>CÒN LẠI</small><strong>{formatTime(secondsLeft)}</strong></div>
      <button class:armed={abandonArmed} class="abandon" on:click={abandonExam}>{abandonArmed ? 'Bấm lần nữa để thoát' : 'Thoát bài'}</button>
    </header>
    <div class="progress-track"><span style={`width:${progress}%`}></span></div>
    <div class="exam-content">
      <aside><strong>Tiến độ</strong><div class="question-map">{#each selectedQuiz.questions as question, index}<a class:done={answerHasValue(answers[question.id])} href={`#question-${question.id}`}>{index + 1}</a>{/each}</div><p><i></i> Đã trả lời</p></aside>
      <div class="exam-questions">
        {#each selectedQuiz.questions as question, index}
          <article class:deferred={isDeferred(question.id)} class="exam-question" id={`question-${question.id}`}>
            <div class="question-head"><span>Câu {index + 1}</span><div><button class="defer-button" on:click={() => toggleDeferred(question.id)}>{isDeferred(question.id) ? '✓ Để làm sau' : 'Không hiểu'}</button><b>{question.points} điểm</b></div></div>
            <h2>{question.prompt}</h2>
            {#if question.prompt_image_url}<img class="question-image" src={question.prompt_image_url} alt="Minh họa câu hỏi" />{/if}
            {#if isDeferred(question.id)}
              <div class="deferred-note">Phần này đã được lưu để bạn hỏi giáo viên và sửa sau. Bấm “Để làm sau” lần nữa khi đã hiểu.</div>
            {:else if question.type === 'multiple_choice'}
              <div class="answer-options">{#each question.options || [] as option, optionIndex}<label class:selected={answers[question.id] === option}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} on:change={() => setAnswer(question.id, option)} /><span>{String.fromCharCode(65 + optionIndex)}</span><strong>{option}</strong></label>{/each}</div>
            {:else if question.type === 'matching'}
              <div class="matching-answer">{#each question.options?.left || [] as left}<label><strong>{left}</strong><span>→</span><select value={answers[question.id]?.[left] || ''} on:change={(e) => setMatching(question.id, left, e.currentTarget.value)}><option value="">Chọn đáp án</option>{#each question.options?.right || [] as right}<option value={right}>{right}</option>{/each}</select></label>{/each}</div>
            {:else if ['paragraph', 'rewrite'].includes(question.type)}
              <label class="long-answer"><textarea rows="6" value={answers[question.id] || ''} on:input={(e) => setAnswer(question.id, e.currentTarget.value)} placeholder={question.type === 'paragraph' ? 'Viết đoạn văn của bạn...' : 'Viết lại câu hoàn chỉnh...'}></textarea><small>{String(answers[question.id] || '').trim().split(/\s+/).filter(Boolean).length} từ · Giáo viên sẽ chấm</small></label>
            {:else}
              <label class="short-answer"><span>{question.type === 'picture_guess' ? 'Bạn nhìn thấy gì?' : 'Câu trả lời của bạn'}</span><input value={answers[question.id] || ''} on:input={(e) => setAnswer(question.id, e.currentTarget.value)} placeholder="Nhập đáp án..." autocomplete="off" /></label>
            {/if}
          </article>
        {/each}
        <div class="submit-panel"><div><strong>Đã trả lời {answeredCount}/{selectedQuiz.questions.length} câu</strong><p>Câu “Không hiểu” được lưu để sửa sau và chưa bị chấm sai.</p></div><div class="submit-actions"><button class="btn-outline" disabled={submitting} on:click={saveForLater}>Lưu làm sau</button><button class="btn-main" disabled={submitting} on:click={() => submitAttempt(false)}>{submitting ? 'Đang lưu...' : 'Nộp bài'}</button></div></div>
      </div>
    </div>
  </section>
{/if}

{#if selectedManageQuiz}
  <div class="modal-backdrop">
    <section class="bundle-dialog" role="dialog" aria-modal="true" aria-labelledby="bundle-title">
      <button class="dialog-close" aria-label="Đóng" on:click={() => selectedManageQuiz = null}>×</button>
      <span class="section-kicker">BỘ TÀI LIỆU ĐỒNG BỘ</span><h2 id="bundle-title">{selectedManageQuiz.title}</h2>
      {#if bundleBusy && !bundle}<p>Đang đọc trạng thái...</p>{:else if bundle}
        <div class="bundle-grid">
          <a href={bundle.google_doc_url} target="_blank" rel="noreferrer"><span>W</span><strong>DOCX / Google Docs</strong><small>Nguồn chuẩn · revision {bundle.revision}</small></a>
          <a href={bundle.quiz_url}><span>Q</span><strong>Quiz tương tác</strong><small>Đồng bộ cùng nội dung</small></a>
          <div><span>H</span><strong>Bài tập D1</strong><small>{bundle.homework_status === 'published' ? 'Đã giao' : 'Bản nháp · chưa thông báo'}</small></div>
        </div>
        {#if bundle.sync_status === 'conflict'}<div class="conflict-box">Google Docs và quiz đang khác nhau. Chọn bản muốn giữ.</div>{/if}
        <div class="sync-actions"><button on:click={() => syncBundle('import_docs_to_quiz')} disabled={bundleBusy}>Lấy DOCX → Quiz</button><button on:click={() => syncBundle('publish_quiz_to_docs')} disabled={bundleBusy}>Quiz → DOCX</button></div>
        <div class="homework-publish"><h3>Giao vào module BTVN timbk.io.vn</h3><div class="homework-fields"><label>Mã buổi học<input bind:value={homeworkForm.session_id} /></label><label>Mã lớp<input bind:value={homeworkForm.class_id} /></label><label>Tên lớp<input bind:value={homeworkForm.class_name} /></label><label>Hạn nộp<input type="date" bind:value={homeworkForm.deadline_date} /></label><label>Giờ<input type="time" bind:value={homeworkForm.deadline_time} /></label></div><button class="btn-main full" on:click={() => syncBundle('publish_homework')} disabled={bundleBusy}>Giao bài &amp; thông báo</button></div>
      {/if}
    </section>
  </div>
{/if}

{#if assignQuiz}
  <div class="modal-backdrop" role="presentation" on:click={(e) => e.currentTarget === e.target && (assignQuiz = null)}>
    <section class="start-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-title">
      <button class="dialog-close" aria-label="Đóng" on:click={() => assignQuiz = null}>×</button>
      <div class="dialog-icon">📤</div><span class="section-kicker">GIAO BÀI</span>
      <h2 id="assign-title">{assignQuiz.title}</h2>
      <p>Học sinh trong lớp sẽ thấy quiz này ở tab Làm Quiz, kèm hạn nộp.</p>
      {#if assignError}<div class="notice error" role="alert">{assignError}</div>{/if}
      {#if assignMessage}<div class="notice success" role="status">✓ {assignMessage}</div>{/if}
      <label class="guest-field">Lớp học
        <select bind:value={assignForm.class_id} aria-label="Chọn lớp">
          <option value="">— Chọn lớp —</option>
          {#each assignClasses as c}<option value={c.class_id}>{c.class_name}</option>{/each}
        </select>
      </label>
      <label class="guest-field">Hạn nộp<input type="date" bind:value={assignForm.due_date} /></label>
      <button class="btn-main full" disabled={assignBusy} on:click={submitAssign}>{assignBusy ? 'Đang giao...' : 'Giao quiz cho lớp'}</button>
    </section>
  </div>
{/if}

{#if result}
  <div class="modal-backdrop">
    <section class="result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div class="result-burst">✦</div><span class="section-kicker">HOÀN THÀNH</span><h2 id="result-title">{result.attempt.status === 'review_pending' ? 'Đã gửi giáo viên chấm' : 'Kết quả của bạn'}</h2>
      <div class="score-ring"><strong>{result.attempt.auto_score}</strong><span>/ {result.attempt.max_score} điểm</span></div>
      {#if result.attempt.status === 'review_pending'}<p>Câu khách quan đã được chấm. Điểm cuối sẽ cập nhật sau khi giáo viên xem phần tự luận.</p>{:else}<p>Bạn đã hoàn thành quiz. Hãy xem lại giải thích để nhớ bài lâu hơn.</p>{/if}
      <div class="result-stats"><span>⏱ {Math.floor((result.attempt.duration_seconds || 0) / 60)} phút</span><span>✓ {result.grading.filter((g) => g.correct === true).length} câu đúng</span></div>
      <button class="btn-main full" on:click={() => { result = null; selectedQuiz = null; loadQuizzes(); }}>Về danh sách Quiz</button>
    </section>
  </div>
{/if}

<style>
  :global(body) { background: #f5f8fb; }
  .quiz-page { max-width: 1180px; margin: 0 auto; padding: 28px 20px calc(96px + env(safe-area-inset-bottom)); color: #132238; overflow-x: hidden; }
  .quiz-hero { min-height: 190px; display:flex; align-items:center; justify-content:space-between; padding:34px 42px; color:white; background:linear-gradient(125deg,#075985,#0891b2 56%,#14b8a6); border-radius:16px; overflow:hidden; position:relative; box-shadow:0 12px 30px rgba(8,145,178,.17); }
  .quiz-hero:after { content:''; position:absolute; width:260px; height:260px; right:-50px; top:-100px; border:38px solid rgba(255,255,255,.08); border-radius:50%; }
  .eyebrow,.section-kicker { font-size:.72rem; letter-spacing:.16em; font-weight:700; color:#0891b2; }
  .quiz-hero .eyebrow { color:#a5f3fc; }.quiz-hero h1 { color:white; font-size:clamp(1.65rem,4vw,2.6rem); margin:5px 0 6px; }.quiz-hero p { max-width:600px; color:#e0f2fe; }
  .hero-mark { width:100px; height:100px; flex:0 0 100px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.3); background:rgba(255,255,255,.12); backdrop-filter:blur(8px); border-radius:22px; font-size:3rem; font-weight:700; transform:rotate(4deg); z-index:1; }.hero-mark span{color:#67e8f9}
  .tabs { display:flex; gap:8px; margin:22px 0; padding:6px; background:white; border:1px solid #dce5ec; border-radius:10px; box-shadow:0 2px 8px rgba(15,23,42,.04); }
  .tabs button { flex:1; min-height:48px; border:0; background:transparent; border-radius:7px; color:#52657a; font-weight:600; font-size:.92rem; }.tabs button span{margin-right:8px;color:#0891b2}.tabs button.active{background:#ecfeff;color:#0e7490;box-shadow:inset 0 0 0 1px #a5f3fc}
  .file-chosen { font-size:.8rem; color:#0e7490; margin-top:6px; }
  .workspace { background:white; border:1px solid #dce5ec; border-radius:12px; padding:28px; box-shadow:0 3px 14px rgba(15,23,42,.045); }
  .section-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; }.section-heading h2{font-size:1.5rem;margin-top:2px}.draft-count,.live-dot{padding:6px 10px;background:#f1f5f9;border-radius:5px;color:#52657a;font-size:.8rem;font-weight:600}.live-dot i{display:inline-block;width:7px;height:7px;background:#16a34a;border-radius:50%;margin-right:6px}
  .notice{padding:12px 16px;margin-bottom:16px;border-radius:7px;border:1px solid;font-weight:500}.notice.success{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.notice.error{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
  .permission-card{display:flex;gap:14px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:20px}.permission-card>span{font-size:1.4rem}.permission-card p{color:#78633c;font-size:.86rem;margin-top:3px}
  .source-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}.source-card{min-height:92px;border:1px dashed #b9c7d3;background:#f8fafc;border-radius:8px;padding:13px;text-align:left;display:grid;grid-template-columns:35px 1fr;grid-template-rows:auto auto;column-gap:9px;color:#34465a}.source-card>span{grid-row:1/3;width:34px;height:34px;display:grid;place-items:center;background:white;border:1px solid #dce5ec;border-radius:6px;color:#0891b2;font-size:1.1rem}.source-card small{color:#7a8a9b}.source-card.active-source{border-style:solid;border-color:#67e8f9;background:#ecfeff}.source-card:disabled{opacity:.58;cursor:not-allowed}
  .source-panel{display:grid;grid-template-columns:minmax(220px,1.4fr) 1fr auto;gap:16px;align-items:end;margin:-10px 0 24px;padding:16px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:9px}.source-panel p{font-size:.78rem;color:#527086;margin-top:3px}
  .form-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}.wide{grid-column:auto}.form-grid .wide:last-child{grid-column:1/-1}label{display:flex;flex-direction:column;gap:6px;font-size:.83rem;font-weight:600;color:#3b4d61}input,textarea,select{width:100%;border:1px solid #cbd5e1;background:white;color:#17283d;border-radius:6px;padding:10px 12px;font:inherit;font-weight:400;min-height:44px}textarea{resize:vertical}input:focus,textarea:focus,select:focus{outline:3px solid rgba(34,211,238,.18);border-color:#0891b2}
  .type-picker{margin:26px 0}.type-picker h3{font-size:1rem;margin-bottom:12px}.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.type-grid button{display:flex;align-items:center;text-align:left;gap:10px;min-height:66px;padding:10px;border:1px solid #dce5ec;background:white;border-radius:7px;color:#263a50}.type-grid button:hover{border-color:#0891b2;background:#f0fdff}.type-grid button>span{color:#0891b2;font-size:1.2rem}.type-grid small{display:block;color:#7a8a9b;font-weight:400;margin-top:2px}
  .question-editor-list{display:flex;flex-direction:column;gap:14px}.editor-card{border:1px solid #dce5ec;border-radius:9px;padding:18px;background:white}.editor-card header{display:flex;align-items:center;gap:10px;margin-bottom:16px}.question-number{width:34px;height:34px;display:grid;place-items:center;background:#0891b2;color:white;border-radius:6px;font-weight:700}.editor-card header select{width:auto;max-width:220px}.editor-actions{margin-left:auto;display:flex;gap:4px}.editor-actions button,.option-row button{width:44px;height:44px;border:1px solid #dce5ec;background:white;border-radius:6px;font-size:1.1rem}.editor-actions button.delete{color:#dc2626}.editor-actions button:disabled{opacity:.35}.option-editor,.pair-editor{margin-top:14px}.field-label{display:block;font-size:.83rem;font-weight:600;margin-bottom:7px}.option-row{display:grid;grid-template-columns:44px 1fr 44px;gap:6px;margin-bottom:7px}.option-row input[type=radio]{width:20px;min-height:20px;align-self:center;justify-self:center;accent-color:#0891b2}.text-button{min-height:44px;border:0;background:transparent;color:#087e9b;font-weight:600}.pair-editor>div{display:grid;grid-template-columns:1fr 30px 1fr;align-items:center;gap:5px;margin-bottom:7px}.pair-editor>div span{text-align:center;color:#0891b2}.review-note{margin-top:12px;padding:11px 13px;background:#eff6ff;color:#31577c;border-left:3px solid #3b82f6;font-size:.85rem}.editor-bottom{display:grid;grid-template-columns:120px 1fr;gap:12px;margin-top:14px}.empty-editor,.empty-state{text-align:center;padding:48px 20px;color:#617184}.empty-editor>span,.empty-state>span{display:block;font-size:2.2rem;color:#0891b2;margin-bottom:8px}.empty-editor p,.empty-state p{margin:5px auto 16px;max-width:450px}.save-bar{position:sticky;bottom:12px;margin-top:20px;display:flex;align-items:center;justify-content:flex-end;gap:10px;background:#17283d;color:white;padding:13px 15px;border-radius:9px;box-shadow:0 8px 24px rgba(15,23,42,.25);z-index:5}.save-bar>div{margin-right:auto}.save-bar small{display:block;color:#b7c4d1}.btn-main,.btn-outline{border:1px solid #0e7490;border-radius:6px;min-height:44px;padding:9px 17px;font-weight:600}.btn-main{background:#0891b2;color:white}.btn-main:hover{background:#0e7490}.btn-main:disabled,.btn-outline:disabled{opacity:.45;cursor:not-allowed}.btn-outline{background:white;color:#0e7490;border-color:#a5f3fc}.btn-main.compact{padding:8px 13px}.btn-main.full{width:100%}
  .quiz-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.quiz-card{border:1px solid #dce5ec;border-radius:9px;padding:18px;background:white;transition:.18s ease}.quiz-card:hover{transform:translateY(-2px);border-color:#8dddea;box-shadow:0 8px 20px rgba(15,23,42,.07)}.quiz-card-top,.quiz-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.quiz-card-top span{padding:3px 7px;background:#fff7ed;color:#c2410c;border-radius:4px;font-size:.72rem;font-weight:700}.quiz-card-top span.published{background:#f0fdf4;color:#15803d}.quiz-card-top b{font-size:.78rem;color:#64748b}.quiz-card h3{margin:16px 0 6px}.quiz-card p{font-size:.88rem;color:#66778a;min-height:46px}.quiz-card footer{border-top:1px solid #edf1f4;margin-top:16px;padding-top:12px}.quiz-card footer small{color:#8492a2}.quiz-card footer>div{display:flex;flex-wrap:wrap;justify-content:flex-end}.quiz-card footer button{border:0;background:transparent;color:#087e9b;font-weight:600;min-height:44px}.review-wrap{margin-top:22px}.take-card{padding:0;overflow:hidden}.cover{height:100px;display:grid;place-items:center;background:linear-gradient(135deg,#e0f2fe,#cffafe);color:#0e7490;font-size:1.7rem;font-weight:700}.cover-1{background:linear-gradient(135deg,#ede9fe,#fae8ff);color:#7e22ce}.cover-2{background:linear-gradient(135deg,#dcfce7,#ecfccb);color:#15803d}.cover-3{background:linear-gradient(135deg,#ffedd5,#fef3c7);color:#c2410c}.quiz-card-body{padding:17px}.meta{display:flex;gap:7px;color:#748496;font-size:.75rem}.start-button{width:100%;height:44px;border:1px solid #a5f3fc;background:#ecfeff;color:#0e7490;border-radius:6px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:9px;margin-top:14px}.assign-btn{color:#7c3aed !important}.assigned-badge{display:flex;align-items:center;gap:8px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:7px;padding:8px 10px;margin-bottom:10px}.assigned-badge span{font-weight:700;color:#6d28d9;font-size:.8rem;white-space:nowrap}.assigned-badge small{color:#7c6aa8;font-size:.75rem}.loading-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.loading-grid i{height:220px;border-radius:9px;background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9);background-size:200%;animation:shimmer 1.2s infinite}@keyframes shimmer{to{background-position:-200%}}
  .modal-backdrop{position:fixed;inset:0;z-index:90;background:rgba(15,23,42,.5);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}.start-dialog,.result-dialog,.bundle-dialog{position:relative;width:min(480px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:white;border-radius:12px;padding:30px;text-align:center;box-shadow:0 24px 70px rgba(15,23,42,.3)}.bundle-dialog{width:min(760px,100%);text-align:left}.dialog-close{position:absolute;right:10px;top:10px;width:44px;height:44px;border:0;background:#f1f5f9;border-radius:6px;font-size:1.4rem}.dialog-icon,.result-burst{width:60px;height:60px;display:grid;place-items:center;margin:0 auto 12px;border-radius:12px;background:#ecfeff;color:#0891b2;font-size:1.5rem}.start-dialog>p,.result-dialog>p{color:#66778a;margin:7px 0 18px}.rules{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:16px 0}.rules>div{display:grid;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px}.rules>div>span{font-size:1.25rem}.rules small{color:#78889a}.identity,.guest-field{padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;margin:14px 0;text-align:left}.guest-field{background:white;border:0;padding:0}.privacy-note{display:block;color:#7a8a9b;margin-top:10px}.bundle-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.bundle-grid>*{display:grid;grid-template-columns:40px 1fr;grid-template-rows:auto auto;column-gap:9px;padding:13px;border:1px solid #dce5ec;border-radius:8px;color:#20354a;text-decoration:none}.bundle-grid span{grid-row:1/3;width:38px;height:38px;display:grid;place-items:center;border-radius:7px;background:#ecfeff;color:#0e7490;font-weight:800}.bundle-grid small{color:#718195}.sync-actions{display:flex;gap:8px}.sync-actions button{flex:1;min-height:44px;border:1px solid #a5f3fc;background:#ecfeff;color:#0e7490;border-radius:6px;font-weight:700}.conflict-box{padding:12px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:7px;margin-bottom:10px}.homework-publish{margin-top:18px;padding-top:18px;border-top:1px solid #e2e8f0}.homework-publish h3{margin-bottom:10px}.homework-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
  .exam-shell{position:fixed;inset:0;z-index:100;background:#f4f7fa;overflow:auto;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);color:#17283d}.exam-topbar{position:sticky;top:0;z-index:5;min-height:74px;padding:10px max(18px,env(safe-area-inset-right)) 10px max(18px,env(safe-area-inset-left));display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:white;border-bottom:1px solid #dce5ec;box-shadow:0 2px 8px rgba(15,23,42,.05)}.exam-title{display:flex;align-items:center;gap:10px}.exam-title>span{width:43px;height:43px;display:grid;place-items:center;border-radius:7px;background:#0891b2;color:white;font-size:.68rem;font-weight:800}.exam-title small{display:block;color:#718195}.countdown{text-align:center;padding:5px 18px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0}.countdown small{display:block;font-size:.62rem;letter-spacing:.1em;color:#64748b}.countdown strong{font-size:1.25rem;font-variant-numeric:tabular-nums}.countdown.urgent{color:#dc2626;background:#fef2f2}.abandon{justify-self:end;min-height:44px;border:1px solid #fecaca;background:white;color:#b91c1c;border-radius:6px;padding:8px 13px;font-weight:600}.abandon.armed{background:#dc2626;color:white}.progress-track{position:sticky;top:74px;z-index:6;height:4px;background:#dfe7ed}.progress-track span{display:block;height:100%;background:#14b8a6;transition:width .25s}.exam-content{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:190px 1fr;gap:26px;padding:28px 20px 80px}.exam-content aside{position:sticky;top:105px;align-self:start;background:white;border:1px solid #dce5ec;border-radius:8px;padding:15px}.question-map{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}.question-map a{height:34px;display:grid;place-items:center;text-decoration:none;border:1px solid #dce5ec;border-radius:5px;color:#64748b;font-size:.8rem}.question-map a.done{background:#ecfeff;border-color:#67e8f9;color:#0e7490;font-weight:700}.exam-content aside p{font-size:.72rem;color:#718195}.exam-content aside i{display:inline-block;width:7px;height:7px;background:#14b8a6;border-radius:50%;margin-right:5px}.exam-questions{display:flex;flex-direction:column;gap:16px}.exam-question{background:white;border:1px solid #dce5ec;border-radius:10px;padding:24px;scroll-margin-top:100px}.exam-question.deferred{border-color:#fdba74;background:#fffbeb}.question-head{display:flex;justify-content:space-between;align-items:center;color:#0e7490;font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.question-head>div{display:flex;align-items:center;gap:8px}.question-head b{padding:3px 7px;background:#f1f5f9;color:#64748b;border-radius:4px}.defer-button{min-height:36px;padding:6px 10px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:6px;font-weight:700;text-transform:none}.deferred-note{padding:14px;background:white;border:1px solid #fed7aa;border-radius:7px;color:#9a3412}.exam-question h2{font-size:1.15rem;margin:12px 0 18px;line-height:1.55}.question-image{display:block;max-width:100%;max-height:320px;object-fit:contain;margin:0 auto 18px;border-radius:8px}.answer-options{display:grid;gap:9px}.answer-options label{display:grid;grid-template-columns:22px 36px 1fr;align-items:center;gap:8px;min-height:56px;padding:8px 12px;border:1px solid #dce5ec;border-radius:7px;cursor:pointer}.answer-options label.selected{background:#ecfeff;border-color:#22d3ee}.answer-options input{width:18px;min-height:18px;accent-color:#0891b2}.answer-options label>span{width:32px;height:32px;display:grid;place-items:center;background:#f1f5f9;border-radius:5px;color:#52657a}.answer-options label.selected>span{background:#0891b2;color:white}.matching-answer{display:grid;gap:9px}.matching-answer label{display:grid;grid-template-columns:1fr 32px 1fr;align-items:center;background:#f8fafc;padding:9px;border-radius:7px}.matching-answer label>span{text-align:center;color:#0891b2}.long-answer textarea{min-height:150px}.long-answer small{text-align:right;color:#778798}.short-answer input{font-size:1rem}.submit-panel{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#17283d;color:white;padding:18px 20px;border-radius:9px}.submit-panel p{font-size:.8rem;color:#bac6d1}.submit-actions{display:flex;gap:8px}.score-ring{width:145px;height:145px;margin:20px auto;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;border:10px solid #cffafe;box-shadow:inset 0 0 0 2px #22d3ee}.score-ring strong{font-size:2.4rem;color:#087e9b}.score-ring span{color:#64748b;font-size:.82rem}.result-stats{display:flex;justify-content:center;gap:8px;margin-bottom:18px}.result-stats span{padding:7px 10px;background:#f1f5f9;border-radius:5px;color:#52657a;font-size:.8rem}
  @media(max-width:800px){.quiz-page{padding:16px 12px 90px}.quiz-hero{padding:26px 22px;min-height:160px}.hero-mark{width:70px;height:70px;flex-basis:70px;font-size:2rem}.workspace{padding:18px}.source-grid,.type-grid,.quiz-grid,.loading-grid{grid-template-columns:1fr 1fr}.source-panel{grid-template-columns:1fr}.bundle-grid,.homework-fields{grid-template-columns:1fr 1fr}.exam-content{grid-template-columns:1fr;padding:18px 12px 70px}.exam-content aside{position:static}.question-map{grid-template-columns:repeat(8,1fr)}.exam-topbar{grid-template-columns:1fr auto}.abandon{grid-column:1/-1;width:100%;margin-top:6px}.progress-track{top:124px}.exam-question{scroll-margin-top:135px}}
  @media(max-width:560px){.quiz-hero{align-items:flex-end}.hero-mark{position:absolute;right:18px;top:18px;opacity:.38}.quiz-hero p{padding-right:20px}.tabs{gap:3px}.tabs button{font-size:.75rem;padding:5px}.tabs button span{display:block;margin:0;font-size:1rem}.source-grid,.type-grid,.quiz-grid,.loading-grid,.form-grid,.bundle-grid,.homework-fields{grid-template-columns:1fr}.form-grid .wide{grid-column:1}.source-card{min-height:78px}.type-grid button{min-height:58px}.editor-card{padding:13px}.editor-card header{flex-wrap:wrap}.editor-card header select{order:3;width:100%;max-width:none}.editor-actions{margin-left:auto}.editor-bottom{grid-template-columns:90px 1fr}.save-bar{flex-wrap:wrap;bottom:8px}.save-bar>div{width:100%}.save-bar button{flex:1}.section-heading{align-items:flex-start}.question-map{grid-template-columns:repeat(6,1fr)}.exam-topbar{padding:8px 10px}.exam-title>span{display:none}.exam-title strong{display:block;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.countdown{padding:4px 10px}.exam-question{padding:17px}.question-head{align-items:flex-start}.question-head>div{flex-direction:column-reverse;align-items:flex-end}.matching-answer label{grid-template-columns:1fr}.matching-answer label>span{transform:rotate(90deg)}.submit-panel{align-items:stretch;flex-direction:column}.submit-actions{flex-direction:column}.start-dialog,.result-dialog,.bundle-dialog{padding:25px 18px}.modal-backdrop{padding:10px}.rules{grid-template-columns:1fr 1fr}}
  @media(max-width:1024px){.save-bar{bottom:calc(84px + env(safe-area-inset-bottom))}}
  @media(max-width:640px){.source-grid,.type-grid,.quiz-grid,.loading-grid{grid-template-columns:1fr}.quiz-page{padding-left:12px;padding-right:12px}}
  @media(max-width:390px){.hero-mark{display:none}.modal-backdrop{padding:0}.start-dialog,.result-dialog,.bundle-dialog{width:100%;max-height:100dvh;border-radius:0;padding:22px 14px}.exam-topbar{grid-template-columns:1fr auto}.quiz-page{overflow-x:hidden}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
</style>
