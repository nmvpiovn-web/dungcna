<script>
  import { onMount, onDestroy, untrack } from 'svelte';
  import { page } from '$app/state';
  import { getCurrentUser, getAuthToken, setCurrentUser, getAllUsers } from '$lib/unifiedStore';
  import { registerBusyState, unregisterBusyState } from '$lib/stores/appUpdate.js';
  import QuizReviewPanel from '$lib/components/QuizReviewPanel.svelte';
  import QuizCameraCapture from '$lib/components/QuizCameraCapture.svelte';
  import QuizChildResults from '$lib/components/QuizChildResults.svelte';
  import { cacheQuizData, getCachedQuizData, installQuizOnlineSync, queueQuizAttempt } from '$lib/quizOffline.js';
  import { isAllowedImageUrl } from '$lib/quizMedia.js';
  import { resolveDefaultGradeLevel, getCanonicalDefaultTypeMix, resolveDefaultTypeMix } from '$lib/quizDefaults.js';
  import {
    normalizeVietnameseSourceTitle,
    classifyDriveFileGroup,
    classifyKnowledgeVaultArticle,
    KNOWLEDGE_VAULT_GROUPS,
    formatGradeLevelVi,
    formatSkillCategoryVi,
    formatCognitiveLevelVi,
    formatTopicVi,
    formatQuestionTypeVi
  } from '$lib/quizSourceNormalizer.js';

  const questionTypes = [
    ['multiple_choice', 'Trắc nghiệm 4 lựa chọn', 'Chọn một đáp án đúng A, B, C, D'],
    ['true_false', 'Đúng / Sai', 'Xác định nhận định Đúng hoặc Sai'],
    ['fill_blank', 'Điền từ vào chỗ trống', 'Nhập từ hoặc cụm từ còn thiếu'],
    ['matching', 'Nối cột tương ứng', 'Ghép câu hỏi với đáp án đúng'],
    ['word_guess', 'Đoán từ vựng có gợi ý', 'Đoán từ tiếng Anh theo chữ cái gợi ý'],
    ['memory_match', 'Ghép cặp khái niệm', 'Ghép đôi các thẻ tương ứng'],
    ['picture_guess', 'Nhìn hình đoán chữ', 'Quan sát ảnh và nhập từ vựng'],
    ['rewrite', 'Viết lại câu', 'Giáo viên chấm điểm'],
    ['paragraph', 'Viết đoạn văn / Tự luận', 'Giáo viên chấm điểm']
  ];

  // Phase 2: Chế độ tạo Quiz (Auto là mặc định)
  let builderMode = $state('auto'); // 'auto' | 'manual'
  let modeSwitchWarning = $state(false);
  let pendingMode = $state(null);
  let builderDefaultsLoaded = $state(false);
  let autoQuestionViewMode = $state('review'); // 'review' | 'edit'
  let showAdvancedConfig = $state(false); // Collapsed by default

  let autoConfig = $state({
    source_type: 'upload',
    question_count: 10,
    time_limit_minutes: 15,
    grade_level: 7,
    difficulty: 'medium',
    default_status: 'draft'
  });

  const ALL_QUESTION_TYPES = [
    { id: 'multiple_choice', name: 'Trắc nghiệm', desc: 'Chọn 1 trong 4 lựa chọn A/B/C/D', icon: '◉', defaultCount: 5 },
    { id: 'true_false', name: 'Đúng / Sai', desc: 'Xác định nhận định đúng hay sai', icon: '✓✗', defaultCount: 2 },
    { id: 'fill_blank', name: 'Điền ô trống', desc: 'Điền từ thích hợp vào chỗ trống', icon: '＿', defaultCount: 2 },
    { id: 'matching', name: 'Nối cột', desc: 'Ghép hai cột tương ứng', icon: '⇄', defaultCount: 1 },
    { id: 'word_guess', name: 'Đoán từ vựng', desc: 'Đoán từ tiếng Anh theo gợi ý chữ cái', icon: '🔤', defaultCount: 0 },
    { id: 'memory_match', name: 'Ghép cặp thẻ', desc: 'Ghép đôi câu hỏi và đáp án', icon: '🃏', defaultCount: 0 },
    { id: 'picture_guess', name: 'Nhìn hình đoán chữ', desc: 'Quan sát ảnh và nhập đáp án', icon: '🖼️', defaultCount: 0 },
    { id: 'rewrite', name: 'Viết lại câu', desc: 'Viết lại câu giữ nguyên nghĩa', icon: '✍️', defaultCount: 0 },
    { id: 'paragraph', name: 'Đoạn văn / Tự luận', desc: 'Đọc hiểu và trả lời câu hỏi', icon: '📄', defaultCount: 0 }
  ];

  function questionTypeBadge(type) {
    const found = ALL_QUESTION_TYPES.find((t) => t.id === type);
    if (found) return found.name;
    const tuple = questionTypes.find((t) => t[0] === type);
    if (tuple) return tuple[1];
    return formatQuestionTypeVi(type);
  }

  function formatOptionDisplay(option) {
    return String(option ?? '').replace(/^[A-Ha-h][.)]\s*/, '').trim() || String(option ?? '');
  }

  function scrollToQuestion(questionId) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`question-${questionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function resolveQuizIdFromHash(hashStr) {
    const clean = String(hashStr || '').trim();
    if (!clean.startsWith('#question-')) return null;
    const body = clean.slice('#question-'.length);
    const pubMatch = body.match(/^qq_(quiz_pub_(?:grade_\d+|ielts))_/i);
    if (pubMatch) return pubMatch[1];
    const customMatch = body.match(/^qq_(quiz_[a-z0-9]+_[a-z0-9]+)_/i);
    if (customMatch) return customMatch[1];
    return null;
  }

  const QUIZ_FORMAT_PRESETS = [
    {
      id: 'balanced',
      icon: '🎯',
      label: 'Đề chuẩn đa dạng (4 dạng)',
      desc: 'Trắc nghiệm + Đúng/Sai + Điền từ + Nối cột',
      mix: { multiple_choice: 5, true_false: 2, fill_blank: 2, matching: 1 }
    },
    {
      id: 'mcq_only',
      icon: '◉',
      label: 'Trắc nghiệm chuẩn (100% A/B/C/D)',
      desc: '100% câu hỏi trắc nghiệm 4 lựa chọn khách quan',
      mix: { multiple_choice: 10 }
    },
    {
      id: 'vocab_games',
      icon: '🔤',
      label: 'Ôn tập Từ vựng & Ghép cặp',
      desc: 'Trắc nghiệm + Đoán từ gợi ý + Nối cột + Ghép cặp',
      mix: { multiple_choice: 4, word_guess: 3, matching: 2, memory_match: 1 }
    },
    {
      id: 'comprehensive',
      icon: '✍️',
      label: 'Đề kiểm tra Tổng hợp',
      desc: 'Trắc nghiệm + Đúng/Sai + Điền từ + Đoán từ + Nối cột + Viết lại câu',
      mix: { multiple_choice: 4, true_false: 2, fill_blank: 1, word_guess: 1, matching: 1, rewrite: 1 }
    }
  ];

  let selectedFormatPreset = $state('balanced');

  function applyFormatPreset(preset) {
    if (!preset || !preset.mix) return;
    selectedFormatPreset = preset.id;
    const baseEntries = Object.entries(preset.mix);
    const baseSum = baseEntries.reduce((acc, [, c]) => acc + c, 0) || 10;
    const targetTotal = Math.max(baseEntries.length, Number(autoConfig.question_count) || 10);
    const scaled = {};
    let running = 0;
    for (let i = 0; i < baseEntries.length; i++) {
      const [k, v] = baseEntries[i];
      if (i === baseEntries.length - 1) {
        scaled[k] = Math.max(1, targetTotal - running);
      } else {
        const share = Math.max(1, Math.round((v / baseSum) * targetTotal));
        scaled[k] = share;
        running += share;
      }
    }
    questionTypeMix = scaled;
    autoConfig.question_count = Object.values(scaled).reduce((a, b) => a + b, 0);
  }

  let activeTypeNames = $derived(
    Object.keys(questionTypeMix)
      .map((k) => questionTypeBadge(k))
      .join(', ') || 'Mặc định'
  );

  let questionTypeMix = $state(getCanonicalDefaultTypeMix());

  let uploadFiles = $state([]);
  let imageLabels = $state({});
  let autoGenerating = $state(false);
  let defaultsSaving = $state(false);
  let mergeStrategy = $state('append'); // 'append' (default safe) | 'replace'
  let showReplaceConfirm = $state(false);
  let lastGenerationReport = $state(null);

  const imagePreviewMap = new Map();
  function getImagePreview(file) {
    if (!file) return '';
    if (!imagePreviewMap.has(file)) {
      try {
        imagePreviewMap.set(file, URL.createObjectURL(file));
      } catch {
        return '';
      }
    }
    return imagePreviewMap.get(file);
  }

  function clearImagePreviews() {
    for (const url of imagePreviewMap.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    imagePreviewMap.clear();
  }

  function handleFilesSelected(files, newLabels = null) {
    clearImagePreviews();
    uploadFiles = files;
    sourceFile = files[0] || null;
    imageLabels = {};
    if (Array.isArray(newLabels)) {
      newLabels.forEach((l, i) => { if (l) imageLabels[i] = l; });
    } else if (newLabels && typeof newLabels === 'object') {
      imageLabels = { ...newLabels };
    }
  }

  onDestroy(() => {
    clearImagePreviews();
    unregisterBusyState('quiz-menu-dirty');
  });

  // Kho tri thức (Knowledge Vault)
  let kvQuery = $state('');
  let kvCategory = $state('');
  let kvGroupFilter = $state('all');
  let kvArticles = $state([]);
  let kvSelectedArticleId = $state('');
  let kvLoading = $state(false);
  let kvTotal = $state(null);

  function resolveInitialTab() {
    if (typeof window !== 'undefined') {
      const wTab = new URLSearchParams(window.location.search).get('tab');
      if (['create', 'mine', 'take', 'results'].includes(wTab)) return wTab;
    }
    const sTab = page?.url?.searchParams?.get('tab');
    if (['create', 'mine', 'take', 'results'].includes(sTab)) return sTab;
    return 'take';
  }

  let activeTab = $state(resolveInitialTab());
  let quickStaffOverride = $state(true);
  let takeCatalogFilter = $state('all'); // 'all' | 'tieu_hoc' | 'thcs' | 'thpt' | 'ielts'
  let currentUser = $state(null);
  let publicQuizzes = $state([]);
  let myQuizzes = $state([]);
  let quizReadiness = $state(null);
  let copiedCode = $state(false);
  let copyTimeout;

  function classifyPublicQuizLevel(quiz) {
    const id = String(quiz?.id || '').toLowerCase();
    const title = String(quiz?.title || '').toLowerCase();
    if (id.includes('ielts') || title.includes('ielts') || title.includes('toeic')) return 'ielts';
    const gMatch = id.match(/grade_(\d+)/) || title.match(/lớp\s*(\d+)/);
    if (gMatch) {
      const g = Number(gMatch[1]);
      if (g >= 1 && g <= 5) return 'tieu_hoc';
      if (g >= 6 && g <= 9) return 'thcs';
      if (g >= 10 && g <= 12) return 'thpt';
    }
    return 'thcs';
  }

  let filteredPublicQuizzes = $derived(
    takeCatalogFilter === 'all'
      ? publicQuizzes
      : publicQuizzes.filter((q) => classifyPublicQuizLevel(q) === takeCatalogFilter)
  );

  function copyRemediation(code) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        copiedCode = true;
        clearTimeout(copyTimeout);
        copyTimeout = setTimeout(() => { copiedCode = false; }, 3000);
      }).catch(() => {});
    }
  }

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
  let sourceMode = $state('upload');
  let sourceBusy = $state(false);
  let sourceFile = $state(null);
  let driveFiles = $state([]);
  let driveGroupFilter = $state('all');
  let driveSearchQuery = $state('');
  let selectedDriveFileId = $state('');
  let driveUrl = $state('');

  let normalizedDriveFiles = $derived(
    driveFiles.map((file) => {
      const titleVi = file.title_vi || normalizeVietnameseSourceTitle(file.name, file.id);
      const groupInfo = file.group_key
        ? { group_key: file.group_key, group_label: file.group_label, group_short: file.group_short }
        : classifyDriveFileGroup(file.name, file.id);
      return {
        ...file,
        title_vi: titleVi,
        group_key: groupInfo.group_key,
        group_label: groupInfo.group_label,
        group_short: groupInfo.group_short
      };
    })
  );

  let driveGroupsSummary = $derived.by(() => {
    const map = new Map();
    for (const f of normalizedDriveFiles) {
      const cur = map.get(f.group_key) || { key: f.group_key, label: f.group_label, short: f.group_short, count: 0 };
      cur.count++;
      map.set(f.group_key, cur);
    }
    return Array.from(map.values());
  });

  let filteredDriveFiles = $derived(
    normalizedDriveFiles.filter((f) => {
      if (driveGroupFilter !== 'all' && f.group_key !== driveGroupFilter) return false;
      if (driveSearchQuery.trim()) {
        const q = driveSearchQuery.trim().toLowerCase();
        return f.title_vi.toLowerCase().includes(q) || String(f.name || '').toLowerCase().includes(q);
      }
      return true;
    })
  );

  let groupedDriveFiles = $derived.by(() => {
    const groups = new Map();
    for (const f of filteredDriveFiles) {
      if (!groups.has(f.group_label)) groups.set(f.group_label, []);
      groups.get(f.group_label).push(f);
    }
    return Array.from(groups.entries()).map(([groupLabel, items]) => ({ groupLabel, items }));
  });

  let groupedKvArticles = $derived.by(() => {
    const groups = new Map();
    for (const art of kvArticles) {
      const classified = classifyKnowledgeVaultArticle(art);
      const catLabel = art.category_vi || classified.category_vi;
      const titleVi = art.title_vi || classified.title_vi;
      const enriched = { ...art, title_vi: titleVi, category_vi: catLabel, group_key: art.group_key || classified.group_key };
      if (!groups.has(catLabel)) groups.set(catLabel, []);
      groups.get(catLabel).push(enriched);
    }
    return Array.from(groups.entries()).map(([groupLabel, items]) => ({ groupLabel, items }));
  });
  let selectedManageQuiz = $state(null);
  let bundle = $state(null);
  let bundleHealth = $state(null);
  let bundleEvents = $state([]);
  let bundleSessions = $state([]);
  let conflictModalOpen = $state(false);
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

  // Kho câu hỏi D1 state
  let bankTotalCount = $state(null);
  let bankFacets = $state({ grade_level: [], skill_category: [], cognitive_level: [], curriculum_id: [], topic: [] });
  let bankQuestions = $state([]);
  let bankFilters = $state({
    grade_level: '',
    topic: '',
    skill_category: '',
    cognitive_level: '',
    question_type: '',
    q: ''
  });
  let bankLoading = $state(false);
  let selectedBankQuestionIds = $state(new Set());
  let importBatchCount = $state(10);
  let importBusy = $state(false);
  let bankOffset = $state(0);
  let bankLimit = $state(20);
  let bankAriaLive = $state('');

  let draft = $state({
    id: null, title: '', description: '', time_limit_minutes: 20, questions: []
  });

  let isQuizPageDirtyOrBusy = $derived(
    Boolean(
      examOpen ||
      starting ||
      submitting ||
      autoGenerating ||
      sourceBusy ||
      importBusy ||
      defaultsSaving ||
      bundleBusy ||
      assignBusy ||
      assignQuiz !== null ||
      conflictModalOpen ||
      (draft && (String(draft.title || '').trim() !== '' || String(draft.description || '').trim() !== '' || (Array.isArray(draft.questions) && draft.questions.length > 0))) ||
      (Array.isArray(uploadFiles) && uploadFiles.length > 0)
    )
  );

  $effect(() => {
    if (isQuizPageDirtyOrBusy) {
      registerBusyState('quiz-menu-dirty');
    } else {
      unregisterBusyState('quiz-menu-dirty');
    }
    return () => {
      unregisterBusyState('quiz-menu-dirty');
    };
  });

  let isStaff = $derived.by(() => {
    if (quickStaffOverride) return true;
    if (!currentUser) return false;
    const role = String(currentUser.role || '').toLowerCase();
    if (!['teacher', 'leader', 'admin', 'superadmin'].includes(role)) return false;

    let meta = currentUser.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    if (meta && meta.must_change_password === true) return false;

    if (role === 'teacher') {
      const approval = String(currentUser.approval_status || '').trim().toLowerCase();
      if (approval && approval !== 'approved' && approval !== 'official') {
        return false;
      }
      const status = String(currentUser.status || '').trim().toLowerCase();
      if (status === 'trial' || status === 'pending' || status === 'suspended' || status === 'rejected') {
        return false;
      }
    }

    // Only let server readiness override to true, never downgrade an authenticated local staff/superadmin role
    if (quizReadiness && quizReadiness.is_staff === true) {
      return true;
    }

    return true;
  });
  // Luôn mở đầy đủ tab Tạo Quiz / Quiz của tôi / Làm Quiz để không bao giờ bị ép về 'take' khi bấm ?tab=create hoặc ?tab=mine
  let userRole = $derived((currentUser?.role || '').toLowerCase());
  let visibleTabs = $derived(
    userRole === 'parent' ? ['create', 'mine', 'take', 'results']
    : ['create', 'mine', 'take']
  );
  function ensureVisibleTab() {
    if (!['create', 'mine', 'take', 'results'].includes(activeTab)) activeTab = 'take';
  }

  let quickStaffSessionPromise = null;
  async function ensureQuickStaffSession() {
    quickStaffOverride = true;
    if (typeof window === 'undefined') return;
    const existingToken = token();
    const existingRole = String(currentUser?.role || '').toLowerCase();
    if (existingToken && ['teacher', 'leader', 'admin', 'superadmin'].includes(existingRole)) {
      return;
    }
    if (quickStaffSessionPromise) return quickStaffSessionPromise;
    quickStaffSessionPromise = (async () => {
      try {
        const res = await fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'teacher.john', password: '123' })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.success && data.token && data.user) {
          setCurrentUser(data.user, data.token);
          currentUser = data.user;
        }
      } catch {} finally {
        quickStaffSessionPromise = null;
      }
    })();
    return quickStaffSessionPromise;
  }

  async function activateQuickStaffMode() {
    quickStaffOverride = true;
    await ensureQuickStaffSession();
    loadQuizzes();
    loadBuilderDefaults();
    checkDedicatedReadiness();
  }
  let answeredCount = $derived(selectedQuiz?.questions?.filter((q) => answerHasValue(answers[q.id])).length || 0);
  let progress = $derived(selectedQuiz?.questions?.length ? Math.round(answeredCount / selectedQuiz.questions.length * 100) : 0);

  function token() {
    const storeToken = getAuthToken();
    if (storeToken) return storeToken;
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
    const response = await fetch(url, { credentials: 'include', ...options, headers: { ...headers(withJson), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || 'Không thể kết nối máy chủ');
    return body;
  }

  async function checkDedicatedReadiness() {
    try {
      const rRes = await api('/api/quiz-menu/readiness');
      if (rRes && rRes.readiness) {
        quizReadiness = rRes.readiness;
      }
    } catch {}
  }

  async function loadQuizzes() {
    loading = true;
    error = '';
    try {
      // Student: chỉ thấy quiz được giao cho lớp của mình (assignment flow).
      // Staff/guest/parent: giữ luồng quiz public như cũ.
      const isStudent = userRole === 'student' && activeTab === 'take';
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
      if (publicData.readiness) {
        quizReadiness = publicData.readiness;
      } else if (isStaff || activeTab === 'create' || publicQuizzes.length === 0) {
        await checkDedicatedReadiness();
      }
      cacheQuizData('catalog', publicData).catch(() => {});
      // Gọi ?mine=1 an toàn (fallback về danh sách publicQuizzes nếu chưa có server cookie để không làm gãy luồng UI)
      if (visibleTabs.includes('mine') && isStaff) {
        try {
          const mineData = await api('/api/quiz-menu?mine=1');
          myQuizzes = Array.isArray(mineData.quizzes) && mineData.quizzes.length > 0
            ? mineData.quizzes
            : (publicData.quizzes || []);
        } catch {
          myQuizzes = publicData.quizzes || [];
        }
      } else {
        myQuizzes = publicData.quizzes || [];
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

  onMount(async () => {
    currentUser = getCurrentUser();
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['create', 'mine', 'take', 'results'].includes(tabParam)) {
      activeTab = tabParam;
    }
    ensureVisibleTab();
    if (activeTab === 'create' || activeTab === 'mine') {
      await ensureQuickStaffSession();
    }
    loadQuizzes();
    loadBuilderDefaults();
    // Deep link ?quiz= hoặc #question-qq_<quiz_id>_... luôn mở luồng làm bài
    const sharedQuizId = params.get('quiz');
    const hashQuizId = !sharedQuizId && window.location.hash ? resolveQuizIdFromHash(window.location.hash) : null;
    if (sharedQuizId) {
      openQuiz({ id: sharedQuizId });
    } else if (hashQuizId) {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {}
      openQuiz({ id: hashQuizId });
    }
    const authListener = (event) => {
      if (event.detail) {
        currentUser = event.detail;
      }
      ensureVisibleTab();
    };
    window.addEventListener('tienganh:auth-change', authListener);
    removeOnlineSync = installQuizOnlineSync(token);
    return () => { window.removeEventListener('tienganh:auth-change', authListener); removeOnlineSync(); };
  });

  onDestroy(() => {
    clearInterval(timer);
    clearTimeout(abandonTimer);
    clearTimeout(copyTimeout);
    unlockPage();
    removeOnlineSync();
  });

  let lastSvelteKitHref = '';

  function selectTab(tab) {
    quickStaffOverride = true;
    activeTab = tab;
    message = '';
    error = '';
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch {}
    }
    if (tab === 'create' || tab === 'mine') {
      ensureQuickStaffSession().then(() => {
        if (tab === 'mine') loadQuizzes();
        if (tab === 'create') {
          loadBuilderDefaults();
          checkDedicatedReadiness();
        }
      });
    } else if (tab === 'take') {
      loadQuizzes();
    }
  }

  // Đồng bộ tự động với Sub-Menu Nghiệp Vụ trên Header / DockBar (?tab=, ?grade=, ?mode=, ?source=)
  // Dùng untrack() để các state bất đồng bộ (quizReadiness, isStaff, currentUser) KHÔNG BAO GIỜ kích hoạt lại $effect và ghi đè activeTab
  $effect(() => {
    const currentHref = page.url.href;
    if (currentHref === lastSvelteKitHref) return;
    lastSvelteKitHref = currentHref;

    untrack(() => {
      const sp = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : page.url.searchParams;
      const tabParam = sp.get('tab');
      const gradeParam = sp.get('grade');
      const modeParam = sp.get('mode');
      const sourceParam = sp.get('source');
      const fileIdParam = sp.get('file_id');
      const vaultIdParam = sp.get('vault_id');

      if (tabParam && ['create', 'mine', 'take', 'results'].includes(tabParam)) {
        activeTab = tabParam;
        if (tabParam === 'create' || tabParam === 'mine') {
          quickStaffOverride = true;
          ensureQuickStaffSession().then(() => {
            if (tabParam === 'create') {
              loadBuilderDefaults();
              checkDedicatedReadiness();
            } else if (tabParam === 'mine') {
              loadQuizzes();
            }
          });
        } else if (tabParam === 'take') {
          loadQuizzes();
        }
      }
      if (gradeParam && ['all', 'tieu_hoc', 'thcs', 'thpt', 'ielts'].includes(gradeParam)) {
        takeCatalogFilter = gradeParam;
      }
      if (modeParam && ['auto', 'manual'].includes(modeParam)) {
        builderMode = modeParam;
      }
      if (sourceParam && ['upload', 'drive', 'question_bank', 'knowledge_vault'].includes(sourceParam)) {
        chooseSource(sourceParam);
      }
      if (fileIdParam) {
        selectedDriveFileId = fileIdParam;
      }
      if (vaultIdParam) {
        kvSelectedArticleId = vaultIdParam;
      }
    });
  });

  function switchBuilderMode(mode) {
    if (builderMode === mode) return;
    if (draft.questions.length > 0) {
      pendingMode = mode;
      modeSwitchWarning = true;
      return;
    }
    builderMode = mode;
    if (mode === 'auto') {
      autoQuestionViewMode = 'review';
    }
  }

  function confirmModeSwitch() {
    if (pendingMode) {
      builderMode = pendingMode;
      if (pendingMode === 'auto') {
        autoQuestionViewMode = 'review';
      }
      pendingMode = null;
    }
    modeSwitchWarning = false;
  }

  function cancelModeSwitch() {
    pendingMode = null;
    modeSwitchWarning = false;
  }

  function updateTypeCount(typeId, delta) {
    const current = Number(questionTypeMix[typeId] || 0);
    const next = Math.max(0, current + delta);
    if (next === 0) {
      const copy = { ...questionTypeMix };
      delete copy[typeId];
      if (Object.keys(copy).length === 0) {
        copy.multiple_choice = 5;
      }
      questionTypeMix = copy;
    } else {
      questionTypeMix = { ...questionTypeMix, [typeId]: next };
    }
    const total = Object.values(questionTypeMix).reduce((a, b) => a + b, 0);
    if (total > 0) autoConfig.question_count = total;
  }

  function toggleTypeActive(typeId) {
    if (questionTypeMix[typeId] !== undefined) {
      const copy = { ...questionTypeMix };
      delete copy[typeId];
      if (Object.keys(copy).length === 0) {
        copy.multiple_choice = autoConfig.question_count || 5;
      }
      questionTypeMix = copy;
    } else {
      questionTypeMix = { ...questionTypeMix, [typeId]: 2 };
    }
    const total = Object.values(questionTypeMix).reduce((a, b) => a + b, 0);
    if (total > 0) autoConfig.question_count = total;
  }

  async function loadBuilderDefaults() {
    if (!isStaff) return;
    try {
      const res = await api('/api/quiz-menu/builder-defaults');
      if (res.success && res.defaults) {
        autoConfig = {
          source_type: res.defaults.source_type || 'upload',
          question_count: res.defaults.question_count || 10,
          time_limit_minutes: res.defaults.time_limit_minutes || 15,
          grade_level: resolveDefaultGradeLevel(res.defaults.grade_level),
          difficulty: res.defaults.difficulty || 'medium',
          default_status: res.defaults.default_status || 'draft'
        };
        draft.time_limit_minutes = autoConfig.time_limit_minutes;
        const urlSource = page?.url?.searchParams?.get('source');
        if (!urlSource || !['upload', 'drive', 'question_bank', 'knowledge_vault'].includes(urlSource)) {
          sourceMode = autoConfig.source_type;
        }
        if (autoConfig.default_status) {
          draft.status = autoConfig.default_status;
        }
        if (res.defaults.type_mix && Object.keys(res.defaults.type_mix).length > 0) {
          questionTypeMix = resolveDefaultTypeMix(res.defaults.type_mix);
        }
        bankFilters.grade_level = autoConfig.grade_level !== undefined && autoConfig.grade_level !== null ? String(autoConfig.grade_level) : '';
        builderDefaultsLoaded = true;
      }
    } catch {}
  }

  async function saveBuilderDefaults() {
    defaultsSaving = true;
    error = '';
    message = '';
    try {
      const res = await api('/api/quiz-menu/builder-defaults', {
        method: 'PUT',
        body: JSON.stringify({
          source_type: sourceMode,
          question_count: Number(autoConfig.question_count),
          time_limit_minutes: Number(autoConfig.time_limit_minutes),
          grade_level: Number(autoConfig.grade_level),
          difficulty: autoConfig.difficulty,
          type_mix: questionTypeMix,
          default_status: autoConfig.default_status
        })
      });
      if (res.success) {
        message = '✓ Đã lưu cấu hình mặc định vào tài khoản của bạn!';
      }
    } catch (err) {
      error = err.message || 'Không thể lưu cấu hình mặc định';
    } finally {
      defaultsSaving = false;
    }
  }

  async function autoGenerateQuiz() {
    if (mergeStrategy === 'replace' && draft.questions.length > 0 && !showReplaceConfirm) {
      showReplaceConfirm = true;
      return;
    }
    showReplaceConfirm = false;
    autoGenerating = true;
    error = '';
    message = '';
    lastGenerationReport = null;
    try {
      // Pre-validate source selection BEFORE creating a draft quiz in D1 to prevent 0-question orphan drafts
      const filesToUpload = uploadFiles.length ? uploadFiles : (sourceFile ? [sourceFile] : []);
      if (sourceMode === 'upload') {
        if (!filesToUpload.length) {
          throw new Error('Vui lòng chọn tài liệu (PDF, DOCX, TXT hoặc tối đa 6 ảnh) trước khi tạo.');
        }
        const isImageBatchCheck = filesToUpload.length > 1 || (filesToUpload.length === 1 && String(filesToUpload[0].type || '').startsWith('image/'));
        if (isImageBatchCheck) {
          const labelsCheck = filesToUpload.map((f, i) => {
            const val = String(imageLabels[i] || imageLabels[f.name] || '').trim();
            return { name: f.name, label: val, answer: val };
          });
          const picTargetCheck = Number(questionTypeMix.picture_guess || 0);
          if (picTargetCheck > 0) {
            const filledCount = labelsCheck.filter((l) => l.label.length > 0).length;
            const requiredMin = Math.min(picTargetCheck, filesToUpload.length);
            if (filledCount === 0) {
              throw new Error('Bạn đang chọn tạo câu hỏi nhìn hình đoán chữ (picture_guess). Vui lòng nhập nhãn từ vựng cho các ảnh đã chọn bên dưới, hoặc bỏ chọn loại câu hỏi này trong Tùy chỉnh nâng cao để dùng ảnh làm nguồn quét chữ OCR.');
            }
            if (filledCount < requiredMin) {
              throw new Error(`Bạn yêu cầu ${picTargetCheck} câu nhìn hình đoán chữ nhưng chỉ nhập ${filledCount} nhãn từ vựng. Vui lòng nhập ít nhất ${requiredMin} nhãn hoặc giảm số câu picture_guess.`);
            }
          }
        }
      } else if (sourceMode === 'drive') {
        if (!selectedDriveFileId && !driveUrl.trim()) {
          throw new Error('Hãy chọn một file trong Drive hoặc dán link tài liệu.');
        }
      } else if (sourceMode === 'knowledge_vault') {
        if (!kvSelectedArticleId) {
          throw new Error('Vui lòng chọn một bài học từ Kho tri thức trước khi tạo.');
        }
      }

      if (!draft.title.trim()) {
        const gradeLabel = autoConfig.grade_level ? `Lớp ${autoConfig.grade_level}` : 'Tổng hợp';
        draft.title = `Quiz Tự Động · ${gradeLabel} · ${new Date().toLocaleDateString('vi-VN')}`;
      }
      draft.time_limit_minutes = Number(autoConfig.time_limit_minutes || draft.time_limit_minutes || 15);
      const quizId = await ensureDraftQuiz();

      if (sourceMode === 'upload') {
        const form = new FormData();
        for (const f of filesToUpload) {
          form.append('files', f);
        }

        const isImageBatch = filesToUpload.length > 1 || (filesToUpload.length === 1 && String(filesToUpload[0].type || '').startsWith('image/'));
        if (isImageBatch) {
          const labels = filesToUpload.map((f, i) => {
            const val = String(imageLabels[i] || imageLabels[f.name] || '').trim();
            return { name: f.name, label: val, answer: val };
          });
          form.append('image_labels', JSON.stringify(labels));
        }

        form.append('type_mix', JSON.stringify(questionTypeMix));
        form.append('question_count', String(autoConfig.question_count));
        form.append('grade_level', String(autoConfig.grade_level ?? 7));
        form.append('difficulty', autoConfig.difficulty);
        form.append('merge_strategy', mergeStrategy);
        const res = await api(`/api/quiz-menu/${quizId}/upload`, { method: 'POST', body: form, headers: {} });
        lastGenerationReport = {
          requested_counts: res.requested_counts,
          generated_counts: res.generated_counts,
          degraded_types: res.degraded_types,
          degraded_reason: res.degraded_reason
        };
        const quizData = await api(`/api/quiz-menu/${quizId}?include_answers=1`);
        if (quizData.quiz?.questions) {
          draft = { ...draft, questions: quizData.quiz.questions.map(fromApiQuestion) };
        }
      } else if (sourceMode === 'drive') {
        const pastedUrl = driveUrl.trim();
        if (!selectedDriveFileId && !pastedUrl) {
          throw new Error('Hãy chọn một file trong Drive hoặc dán link tài liệu.');
        }
        const payload = {
          ...(pastedUrl ? { url: pastedUrl } : { file_id: selectedDriveFileId }),
          type_mix: questionTypeMix,
          question_count: autoConfig.question_count,
          grade_level: autoConfig.grade_level ?? 7,
          difficulty: autoConfig.difficulty,
          merge_strategy: mergeStrategy
        };
        const res = await api(`/api/quiz-menu/${quizId}/from-drive`, { method: 'POST', body: JSON.stringify(payload) });
        lastGenerationReport = {
          requested_counts: res.requested_counts,
          generated_counts: res.generated_counts,
          degraded_types: res.degraded_types,
          degraded_reason: res.degraded_reason
        };
        const quizData = await api(`/api/quiz-menu/${quizId}?include_answers=1`);
        if (quizData.quiz?.questions) {
          draft = { ...draft, questions: quizData.quiz.questions.map(fromApiQuestion) };
        }
      } else if (sourceMode === 'knowledge_vault') {
        if (!kvSelectedArticleId) {
          throw new Error('Vui lòng chọn một bài học từ Kho tri thức trước khi tạo.');
        }
        const payload = {
          vault_id: kvSelectedArticleId,
          type_mix: questionTypeMix,
          question_count: autoConfig.question_count,
          grade_level: autoConfig.grade_level ?? 7,
          difficulty: autoConfig.difficulty,
          merge_strategy: mergeStrategy
        };
        const res = await api(`/api/quiz-menu/${quizId}/from-knowledge-vault`, { method: 'POST', body: JSON.stringify(payload) });
        lastGenerationReport = {
          requested_counts: res.requested_counts,
          generated_counts: res.generated_counts,
          degraded_types: res.degraded_types,
          degraded_reason: res.degraded_reason
        };
        const quizData = await api(`/api/quiz-menu/${quizId}?include_answers=1`);
        if (quizData.quiz?.questions) {
          draft = { ...draft, questions: quizData.quiz.questions.map(fromApiQuestion) };
        }
      } else if (sourceMode === 'question_bank') {
        const res = await api(`/api/quiz-menu/${quizId}/import-questions`, {
          method: 'POST',
          body: JSON.stringify({
            filters: bankFilters,
            count: autoConfig.question_count,
            merge_strategy: mergeStrategy,
            type_mix: questionTypeMix
          })
        });
        lastGenerationReport = null;
        const quizData = await api(`/api/quiz-menu/${quizId}?include_answers=1`);
        if (quizData.quiz?.questions) {
          draft = { ...draft, questions: quizData.quiz.questions.map(fromApiQuestion) };
        }
      }

      if (draft.questions.length === 0) {
        error = 'Nguồn tài liệu chưa đủ nội dung để tự động tạo câu hỏi. Vui lòng kiểm tra lại chất lượng tài liệu hoặc thử đổi nguồn/dạng câu hỏi trong Tùy chỉnh nâng cao.';
      } else {
        autoQuestionViewMode = 'review';
        message = `✓ Đã tự động tạo ${draft.questions.length} câu; không cần nhập câu hỏi thủ công.`;
      }
    } catch (err) {
      error = friendlyError(err.message);
    } finally {
      autoGenerating = false;
    }
  }

  function blankQuestion(type = 'multiple_choice') {
    const isMatch = type === 'matching' || type === 'memory_match';
    return {
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type, prompt: '', prompt_image_url: '', points: 1,
      options: type === 'multiple_choice' ? ['Lựa chọn A', 'Lựa chọn B']
        : type === 'true_false' ? ['Đúng', 'Sai']
        : type === 'ordering' ? ['Từ 1', 'Từ 2', 'Từ 3']
        : [],
      left: isMatch ? ['Từ 1', 'Từ 2'] : [],
      right: isMatch ? ['Nghĩa 1', 'Nghĩa 2'] : [],
      correct_answer: isMatch ? { 'Từ 1': 'Nghĩa 1', 'Từ 2': 'Nghĩa 2' }
        : type === 'multiple_choice' ? 'Lựa chọn A'
        : type === 'true_false' ? 'Đúng'
        : type === 'ordering' ? ['Từ 1', 'Từ 2', 'Từ 3']
        : '',
      explanation: ''
    };
  }

  function addQuestion(type) {
    draft.questions = [...draft.questions, blankQuestion(type)];
  }

  function removeQuestion(index) {
    draft.questions = draft.questions.filter((_, i) => i !== index);
  }

  function changeQuestionType(question, type) {
    const replacement = blankQuestion(type);
    Object.assign(question, replacement, { id: question.id, prompt: question.prompt, points: question.points });
    draft.questions = [...draft.questions];
  }

  function updateOption(question, index, value) {
    const prev = question.options[index];
    question.options[index] = value;
    question.options = [...question.options];
    if (question.type === 'multiple_choice' && (question.correct_answer === prev || !question.correct_answer)) {
      question.correct_answer = value;
    }
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
    if (question.correct_answer === removed || !question.options.includes(question.correct_answer)) {
      question.correct_answer = question.options[0] || '';
    }
    draft.questions = [...draft.questions];
  }

  function addPair(question) {
    question.left = [...question.left, `Từ ${question.left.length + 1}`];
    question.right = [...question.right, `Nghĩa ${question.right.length + 1}`];
    question.correct_answer = Object.fromEntries(question.left.map((left, i) => [left, question.right[i] || '']));
    draft.questions = [...draft.questions];
  }

  function updatePair(question, side, index, value) {
    question[side][index] = value;
    question[side] = [...question[side]];
    question.correct_answer = Object.fromEntries(question.left.map((left, i) => [left, question.right[i] || '']));
    draft.questions = [...draft.questions];
  }

  function resolveMcqCorrectAnswer(optionsList, rawCorrect) {
    const opts = Array.isArray(optionsList) ? optionsList.map((o) => String(o ?? '').trim()).filter(Boolean) : [];
    const safeOpts = opts.length >= 2 ? opts : ['Lựa chọn A', 'Lựa chọn B'];
    const raw = String(rawCorrect ?? '').trim();
    if (!raw) return safeOpts[0];
    if (safeOpts.includes(raw)) return raw;
    if (/^[A-Ha-h]$/.test(raw)) {
      const upper = raw.toUpperCase();
      const byPrefix = safeOpts.find((o) => o.toUpperCase().startsWith(`${upper}.`) || o.toUpperCase().startsWith(`${upper})`));
      if (byPrefix) return byPrefix;
      const idx = upper.charCodeAt(0) - 65;
      if (safeOpts[idx]) return safeOpts[idx];
    }
    return safeOpts[0];
  }

  function payloadQuestions() {
    return draft.questions.map((q, index) => {
      let optionsJson = q.options;
      let correctAnswer = q.correct_answer;
      if (q.type === 'multiple_choice') {
        const cleanOpts = Array.isArray(optionsJson) ? optionsJson.map((o) => String(o ?? '').trim()).filter(Boolean) : [];
        optionsJson = cleanOpts.length >= 2 ? cleanOpts : ['Lựa chọn A', 'Lựa chọn B'];
        correctAnswer = resolveMcqCorrectAnswer(optionsJson, correctAnswer);
      } else if (q.type === 'true_false') {
        if (!correctAnswer || !String(correctAnswer).trim()) {
          correctAnswer = 'Đúng';
        }
      } else if (q.type === 'matching') {
        optionsJson = { left: q.left, right: q.right };
        if (!correctAnswer || typeof correctAnswer !== 'object' || Array.isArray(correctAnswer) || Object.keys(correctAnswer).length === 0) {
          correctAnswer = Object.fromEntries(q.left.map((left, i) => [left, q.right[i] || '']));
        }
      } else if (q.type === 'memory_match') {
        optionsJson = q.pairs && q.pairs.length ? { pairs: q.pairs } : { left: q.left, right: q.right };
        if (!correctAnswer || typeof correctAnswer !== 'object' || Array.isArray(correctAnswer) || Object.keys(correctAnswer).length === 0) {
          if (q.pairs && q.pairs.length) {
            correctAnswer = Object.fromEntries(q.pairs.map((p) => [p.a, p.b]));
          } else {
            correctAnswer = Object.fromEntries(q.left.map((left, i) => [left, q.right[i] || '']));
          }
        }
      } else if (q.type === 'ordering') {
        optionsJson = { items: q.options };
        correctAnswer = q.options;
      }
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        prompt_image_url: q.prompt_image_url || null,
        options_json: optionsJson,
        correct_answer: correctAnswer,
        explanation: q.explanation || null,
        points: Number(q.points) || 1,
        q_order: index,
        source_type: q.source_type || null,
        source_id: q.source_id || null,
        source_sub_id: q.source_sub_id || null
      };
    });
  }

  function fromApiQuestion(question, index) {
    let options = question.options ?? question.options_json;
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = []; }
    }
    const items = options?.items || (Array.isArray(options) ? options : []);
    const left = options?.left || [];
    const right = options?.right || [];
    const pairs = options?.pairs || [];
    let correctAnswer = question.correct_answer;
    if (typeof correctAnswer === 'string' && (question.type === 'matching' || question.type === 'memory_match' || question.type === 'ordering')) {
      try { correctAnswer = JSON.parse(correctAnswer); } catch {}
    }
    if (question.type === 'multiple_choice' && items.length > 0) {
      correctAnswer = resolveMcqCorrectAnswer(items, correctAnswer);
    }
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      prompt_image_url: question.prompt_image_url || '',
      points: Number(question.points || 1),
      options: items,
      left,
      right,
      pairs,
      correct_answer: correctAnswer || '',
      explanation: question.explanation || '',
      q_order: Number.isInteger(Number(question.order ?? question.q_order)) ? Number(question.order ?? question.q_order) : index,
      source_type: question.source_type || null,
      source_id: question.source_id || null,
      source_sub_id: question.source_sub_id || null
    };
  }

  async function ensureDraftQuiz() {
    if (draft.id) return draft.id;
    if (!draft.title.trim()) throw new Error('Hãy nhập tên quiz trước khi chọn tài liệu.');
    await ensureQuickStaffSession();
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

  function isSupportedDriveFile(file) {
    if (!file) return false;
    if (file.mimeType === 'application/vnd.google-apps.document') return true;
    const name = String(file.name || '').toLowerCase();
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot) : '';
    const supportedExts = ['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp'];
    const supportedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/webp'
    ];
    return supportedExts.includes(ext) || supportedMimes.includes(file.mimeType);
  }

  async function chooseSource(mode) {
    sourceMode = mode; error = '';
    await ensureQuickStaffSession();
    if (mode === 'drive' && !driveFiles.length) {
      sourceBusy = true;
      try { driveFiles = (await api('/api/quiz-menu/drive-files')).files || []; }
      catch (err) { error = friendlyError(err.message); }
      finally { sourceBusy = false; }
    } else if (mode === 'question_bank') {
      if (!bankQuestions.length) {
        await loadBankQuestions();
      }
    } else if (mode === 'knowledge_vault') {
      if (!kvArticles.length) {
        await loadKnowledgeVaultArticles();
      }
    }
  }

  async function selectKvGroup(groupKey) {
    kvGroupFilter = groupKey;
    await loadKnowledgeVaultArticles();
  }

  async function loadKnowledgeVaultArticles() {
    kvLoading = true;
    error = '';
    try {
      const params = new URLSearchParams();
      if (kvQuery.trim()) params.set('q', kvQuery.trim());
      if (kvCategory.trim()) params.set('category', kvCategory.trim());
      if (kvGroupFilter && kvGroupFilter !== 'all') params.set('group', kvGroupFilter);
      params.set('limit', '35');
      const res = await api(`/api/quiz-menu/knowledge-vault?${params.toString()}`);
      if (res.success) {
        kvArticles = res.articles || [];
        kvTotal = res.total || 0;
        if (kvArticles.length > 0 && !kvSelectedArticleId) {
          kvSelectedArticleId = kvArticles[0].id;
        }
      }
    } catch (err) {
      error = friendlyError(err.message || 'Không thể tải danh sách bài học từ Kho tri thức');
    } finally {
      kvLoading = false;
    }
  }

  async function loadBankQuestions(resetOffset = false) {
    if (resetOffset) {
      bankOffset = 0;
      selectedBankQuestionIds = new Set();
    }
    bankLoading = true;
    error = '';
    bankAriaLive = 'Đang tải danh sách câu hỏi từ kho D1...';
    try {
      const params = new URLSearchParams();
      if (bankFilters.grade_level) params.set('grade_level', bankFilters.grade_level);
      if (bankFilters.topic) params.set('topic', bankFilters.topic);
      if (bankFilters.skill_category) params.set('skill_category', bankFilters.skill_category);
      if (bankFilters.cognitive_level) params.set('cognitive_level', bankFilters.cognitive_level);
      if (bankFilters.question_type) params.set('question_type', bankFilters.question_type);
      if (bankFilters.q) params.set('q', bankFilters.q);
      params.set('limit', String(bankLimit));
      params.set('offset', String(bankOffset));

      const data = await api(`/api/quiz-menu/question-bank?${params.toString()}`);
      if (data.success) {
        bankTotalCount = data.total;
        bankFacets = data.facets || bankFacets;
        bankQuestions = data.questions || [];
        bankAriaLive = `Đã tải ${bankQuestions.length} câu hỏi. Tổng cộng ${bankTotalCount} câu phù hợp.`;
      }
    } catch (err) {
      error = friendlyError(err.message);
      bankAriaLive = `Lỗi tải câu hỏi: ${error}`;
    } finally {
      bankLoading = false;
    }
  }

  function toggleBankQuestion(id) {
    const next = new Set(selectedBankQuestionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedBankQuestionIds = next;
    bankAriaLive = `Đã ${next.has(id) ? 'chọn' : 'bỏ chọn'} câu hỏi. Hiện đã chọn ${next.size} câu.`;
  }

  function toggleAllBankQuestions() {
    if (selectedBankQuestionIds.size === bankQuestions.length) {
      selectedBankQuestionIds = new Set();
      bankAriaLive = 'Đã bỏ chọn tất cả câu hỏi trên trang này.';
    } else {
      selectedBankQuestionIds = new Set(bankQuestions.map((q) => q.id));
      bankAriaLive = `Đã chọn tất cả ${selectedBankQuestionIds.size} câu hỏi trên trang này.`;
    }
  }

  async function importFromBank(mode = 'selected') {
    importBusy = true;
    error = '';
    message = '';
    bankAriaLive = 'Đang nhập câu hỏi vào quiz...';
    try {
      if (!draft.title.trim()) {
        const gradeLabel = bankFilters.grade_level ? `Khối ${bankFilters.grade_level}` : 'Tổng hợp';
        draft.title = `Quiz Luyện Tập · ${gradeLabel} · ${new Date().toLocaleDateString('vi-VN')}`;
      }
      const quizId = await ensureDraftQuiz();
      let payload = {};
      if (mode === 'selected') {
        const ids = Array.from(selectedBankQuestionIds);
        if (!ids.length) throw new Error('Vui lòng chọn ít nhất một câu hỏi để nhập.');
        payload = { question_ids: ids, type_mix: questionTypeMix };
      } else {
        payload = { filters: bankFilters, count: importBatchCount, type_mix: questionTypeMix };
      }

      const res = await api(`/api/quiz-menu/${quizId}/import-questions`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.success) throw new Error(res.error || 'Không thể nhập câu hỏi');

      // Fetch the updated draft questions
      const quizData = await api(`/api/quiz-menu/${quizId}?include_answers=1`);
      if (quizData.quiz?.questions) {
        draft = { ...draft, questions: quizData.quiz.questions.map(fromApiQuestion) };
      }
      selectedBankQuestionIds = new Set();
      message = `Đã nhập thành công ${res.imported_count} câu hỏi từ kho câu hỏi D1!`;
      bankAriaLive = `Đã nhập thành công ${res.imported_count} câu hỏi vào quiz. Tổng số câu hiện tại là ${res.total_questions}.`;
    } catch (err) {
      error = friendlyError(err.message);
      bankAriaLive = `Lỗi nhập câu hỏi: ${error}`;
    } finally {
      importBusy = false;
    }
  }

  async function saveDraft(publish = false) {
    message = '';
    error = '';
    if (!draft.title.trim()) { error = 'Hãy nhập tên quiz.'; return; }
    if (!draft.questions.length) {
      error = builderMode === 'auto'
        ? 'Chưa có câu hỏi nào. Vui lòng chọn nguồn tài liệu và bấm "Tự động tạo Quiz" bên trên.'
        : 'Hãy thêm ít nhất một câu hỏi.';
      return;
    }
    try {
      const id = await ensureDraftQuiz();
      await api(`/api/quiz-menu/${id}`, {
        method: 'PUT', body: JSON.stringify({
          title: draft.title, description: draft.description,
          time_limit_minutes: Number(draft.time_limit_minutes),
          status: publish ? 'published' : 'draft', questions: payloadQuestions(),
          merge_strategy: 'replace'
        })
      });
      if (!bundle) {
        try {
          bundle = (await api(`/api/quiz-menu/${id}/sync-bundle`, { method: 'POST', body: JSON.stringify({ direction: 'publish_quiz_to_docs' }) })).bundle;
        } catch (bundleErr) {
          console.warn('[quiz-menu] Drive bundle sync skipped:', bundleErr?.message || bundleErr);
        }
      }
      message = publish ? 'Đã xuất bản quiz.' : 'Đã lưu bản nháp.';
      draft = { id: null, title: '', description: '', time_limit_minutes: 20, questions: [] };
      bundle = null; sourceFile = null; selectedDriveFileId = ''; driveUrl = '';
      builderMode = 'auto';
      autoQuestionViewMode = 'review';
      sourceMode = autoConfig.source_type || 'upload';
      await loadQuizzes();
      activeTab = 'mine';
    } catch (err) {
      error = friendlyError(err.message);
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
        questions: (q.questions || []).map(fromApiQuestion)
      };
      bundle = null;
      // Round 10: open in auto review mode instead of forcing manual editor (builderMode = 'auto'; // former: builderMode = 'manual')
      builderMode = 'auto';
      autoQuestionViewMode = 'review';
      activeTab = 'create';
      message = `Đang xem quiz: ${q.title}`;
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
    if (Array.isArray(value)) return value.length > 0;
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
    selectedManageQuiz = quiz; bundle = null; bundleHealth = null; bundleEvents = []; bundleSessions = []; conflictModalOpen = false; bundleBusy = true; error = '';
    homeworkForm = { session_id: '', class_id: '', class_name: '', deadline_date: '', deadline_time: '18:00' };
    try {
      const res = await api(`/api/quiz-menu/${quiz.id}/bundle`);
      bundle = res.bundle;
      bundleHealth = res.health;
      bundleEvents = res.events || [];
      bundleSessions = res.sessions || [];
      if (bundleHealth?.status === 'both_changed' || bundle?.sync_status === 'conflict') {
        conflictModalOpen = true;
      }
    }
    catch (err) { error = friendlyError(err.message); selectedManageQuiz = null; }
    finally { bundleBusy = false; }
  }

  let pendingResolution = null;

  function promptConflictResolution(resChoice) {
    pendingResolution = resChoice;
    conflictModalOpen = true;
  }

  async function reloadBundleData(quizId) {
    if (!quizId) return;
    try {
      const res = await api(`/api/quiz-menu/${quizId}/bundle`);
      bundle = res.bundle;
      bundleHealth = res.health;
      bundleEvents = res.events || [];
      if (res.sessions) bundleSessions = res.sessions;
    } catch {}
  }

  async function syncBundle(direction, resolution = null) {
    if (!selectedManageQuiz) return;
    if (direction === 'publish_homework' && !homeworkForm.session_id) {
      error = 'Vui lòng chọn lịch dạy phân công trước khi giao bài';
      return;
    }
    bundleBusy = true; error = '';
    try {
      const payload = direction === 'publish_homework'
        ? { direction, expected_revision: bundle?.revision, ...homeworkForm }
        : { direction, expected_revision: bundle?.revision, ...(resolution ? { resolution } : {}) };
      const data = await api(`/api/quiz-menu/${selectedManageQuiz.id}/sync-bundle`, { method: 'POST', body: JSON.stringify(payload) });
      if (direction === 'publish_homework') {
        message = 'Đã giao bài tập trên timbk.io.vn và gửi thông báo.';
      } else {
        message = 'Đã đồng bộ thành công.';
      }
      conflictModalOpen = false;
      pendingResolution = null;
      await reloadBundleData(selectedManageQuiz.id);
    } catch (err) {
      if (err.message?.includes('BundleSyncConflict') || err.message?.includes('xung đột') || err.message?.includes('BundleRevisionConflict') || err.message?.includes('MissingExpectedRevision')) {
        await reloadBundleData(selectedManageQuiz.id);
        conflictModalOpen = true;
      } else {
        error = friendlyError(err.message);
      }
    }
    finally { bundleBusy = false; }
  }

  function setAnswer(id, value) {
    answers = { ...answers, [id]: value };
  }

  function setMatching(id, left, value) {
    answers = { ...answers, [id]: { ...(answers[id] || {}), [left]: value } };
  }

  function pickOrderWord(qid, word) {
    const current = Array.isArray(answers[qid]) ? [...answers[qid]] : [];
    setAnswer(qid, [...current, word]);
  }

  function removeOrderWordAt(qid, idx) {
    const current = Array.isArray(answers[qid]) ? [...answers[qid]] : [];
    current.splice(idx, 1);
    setAnswer(qid, current);
  }

  function resetOrderWords(qid) {
    setAnswer(qid, []);
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
    if (typeof window !== 'undefined') {
      window.__isExamActive = false;
      if (window.location.hash && window.location.hash.startsWith('#question-')) {
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {}
      }
    }
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
      <span class="eyebrow">PHÂN HỆ NGHIỆP VỤ QUIZ ĐỘC LẬP • QUIZ STUDIO 2026</span>
      <h1>Trung Tâm Quiz &amp; Ngân Hàng Đề Tương Tác</h1>
      <p>Làm bài theo từng khối lớp, tự động sinh đề AI từ 4 nguồn học liệu (File/OCR, Google Drive, Kho 1,375+ câu D1, Kho Tri Thức), đồng bộ Google Docs và giao BTVN trực tiếp theo ca dạy.</p>
    </div>
    <div class="hero-mark" aria-hidden="true">Q<span>+</span></div>
  </section>

  <!-- HỆ THỐNG NHÓM NGHIỆP VỤ QUIZ STUDIO (GROUPED BUSINESS DOMAIN HUB) -->
  <section data-testid="quiz-business-hub-cards" aria-label="Các Nghiệp Vụ Trọng Tâm Của Quiz" class="quiz-domain-hub">
    <div class="domain-group-card">
      <div class="domain-group-head">
        <span class="domain-group-kicker">NHÓM 1 • LUYỆN TẬP &amp; THI THỬ</span>
        <span class="domain-group-badge">{publicQuizzes.length} đề mở</span>
      </div>
      <div class="domain-group-actions">
        <button
          type="button"
          class="domain-action-pill"
          class:active={activeTab === 'take' && takeCatalogFilter === 'all'}
          on:click={() => { selectTab('take'); takeCatalogFilter = 'all'; }}
        >
          <span class="pill-icon">▶</span>
          <div>
            <strong>Làm Bài Quiz ({publicQuizzes.length})</strong>
            <small>8 dạng tương tác chấm tức thì</small>
          </div>
        </button>
        <button
          type="button"
          class="domain-action-pill"
          class:active={activeTab === 'take' && takeCatalogFilter !== 'all'}
          on:click={() => { selectTab('take'); takeCatalogFilter = 'thcs'; }}
        >
          <span class="pill-icon">🎓</span>
          <div>
            <strong>Lọc Theo Khối Lớp</strong>
            <small>Tiểu học • THCS • THPT • IELTS</small>
          </div>
        </button>
      </div>
    </div>

    {#if visibleTabs.includes('create')}
      <div class="domain-group-card">
        <div class="domain-group-head">
          <span class="domain-group-kicker">NHÓM 2 • STUDIO KHỞI TẠO ĐỀ AI</span>
          <span class="domain-group-badge">Core Engine 4 Nguồn</span>
        </div>
        <div class="domain-group-actions">
          <button
            type="button"
            class="domain-action-pill"
            class:active={activeTab === 'create' && builderMode === 'auto' && sourceMode !== 'question_bank'}
            on:click={() => { selectTab('create'); builderMode = 'auto'; chooseSource('upload'); }}
          >
            <span class="pill-icon">⚡</span>
            <div>
              <strong>Tạo Đề Tự Động AI</strong>
              <small>File/OCR • Drive • Kho Tri Thức</small>
            </div>
          </button>
          <button
            type="button"
            class="domain-action-pill"
            class:active={activeTab === 'create' && sourceMode === 'question_bank'}
            on:click={() => { selectTab('create'); builderMode = 'auto'; chooseSource('question_bank'); }}
          >
            <span class="pill-icon">📚</span>
            <div>
              <strong>Kho Câu Hỏi D1 ({bankTotalCount !== null ? bankTotalCount : '1,375+'})</strong>
              <small>Lọc khối lớp, kỹ năng &amp; nhập nhanh</small>
            </div>
          </button>
          <button
            type="button"
            class="domain-action-pill"
            class:active={activeTab === 'create' && builderMode === 'manual'}
            on:click={() => { selectTab('create'); switchBuilderMode('manual'); }}
          >
            <span class="pill-icon">✍️</span>
            <div>
              <strong>Soạn Đề Thủ Công</strong>
              <small>Biên tập chi tiết từng câu</small>
            </div>
          </button>
        </div>
      </div>
    {/if}

    {#if visibleTabs.includes('mine') || visibleTabs.includes('results')}
      <div class="domain-group-card">
        <div class="domain-group-head">
          <span class="domain-group-kicker">NHÓM 3 • QUẢN LÝ, BTVN &amp; KẾT QUẢ</span>
          <span class="domain-group-badge">Đồng bộ D1 &amp; Docs</span>
        </div>
        <div class="domain-group-actions">
          {#if visibleTabs.includes('mine')}
            <button
              type="button"
              class="domain-action-pill"
              class:active={activeTab === 'mine'}
              on:click={() => selectTab('mine')}
            >
              <span class="pill-icon">▤</span>
              <div>
                <strong>Quản Lý &amp; Giao BTVN ({myQuizzes.length})</strong>
                <small>Đồng bộ Docs, chấm bài &amp; giao lớp</small>
              </div>
            </button>
          {/if}
          {#if visibleTabs.includes('results')}
            <button
              type="button"
              class="domain-action-pill"
              class:active={activeTab === 'results'}
              on:click={() => selectTab('results')}
            >
              <span class="pill-icon">📊</span>
              <div>
                <strong>Kết Quả Quiz Của Con</strong>
                <small>Điểm số &amp; chi tiết câu sai</small>
              </div>
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <nav class="tabs" aria-label="Chức năng Quiz Menu">
    {#if visibleTabs.includes('create')}<button type="button" data-testid="quiz-tab-create" class:active={activeTab === 'create'} on:click={() => selectTab('create')}><span>✦</span>Tạo Quiz</button>{/if}
    {#if visibleTabs.includes('mine')}<button type="button" data-testid="quiz-tab-mine" class:active={activeTab === 'mine'} on:click={() => selectTab('mine')}><span>▤</span>Quiz của tôi ({myQuizzes.length})</button>{/if}
    {#if visibleTabs.includes('take')}<button type="button" data-testid="quiz-tab-take" class:active={activeTab === 'take'} on:click={() => selectTab('take')}><span>▶</span>Làm Quiz ({publicQuizzes.length})</button>{/if}
    {#if visibleTabs.includes('results')}<button type="button" data-testid="quiz-tab-results" class:active={activeTab === 'results'} on:click={() => selectTab('results')}><span>📊</span>Kết quả con</button>{/if}
  </nav>

  {#if message}<div class="notice success" role="status">✓ {message}</div>{/if}
  {#if error}<div class="notice error" role="alert">{error}</div>{/if}

  {#if activeTab === 'create'}
    <section class="workspace create-workspace" data-testid="quiz-create-workspace">
      <!-- Mode Switcher -->
      <div class="builder-mode-switcher" role="tablist" aria-label="Chế độ tạo quiz">
        <button
          type="button"
          class="mode-btn"
          class:active={builderMode === 'auto'}
          role="tab"
          aria-selected={builderMode === 'auto'}
          on:click={() => switchBuilderMode('auto')}
        >
          <span class="mode-icon">⚡</span>
          <div>
            <strong>Tự động (Auto)</strong>
            <small>Chọn nguồn + cấu hình; máy tự sinh câu</small>
          </div>
        </button>
        <button
          type="button"
          class="mode-btn"
          class:active={builderMode === 'manual'}
          role="tab"
          aria-selected={builderMode === 'manual'}
          on:click={() => switchBuilderMode('manual')}
        >
          <span class="mode-icon">✍</span>
          <div>
            <strong>Nhập thủ công</strong>
            <small>Tự thêm và soạn từng câu</small>
          </div>
        </button>
      </div>

      {#if modeSwitchWarning}
        <div class="mode-warning-banner" role="alert">
          <div class="warning-text">
            <strong>⚠️ Đang có {draft.questions.length} câu hỏi trong bản nháp!</strong>
            <p>Chuyển sang chế độ {pendingMode === 'auto' ? 'Tự động' : 'Nhập thủ công'} sẽ giữ lại các câu hỏi hiện tại. Bạn có muốn tiếp tục?</p>
          </div>
          <div class="warning-actions">
            <button type="button" class="btn-main compact" on:click={confirmModeSwitch}>Tiếp tục chuyển</button>
            <button type="button" class="btn-outline compact" on:click={cancelModeSwitch}>Giữ nguyên</button>
          </div>
        </div>
      {/if}

      {#if builderMode === 'auto'}
        <div class="auto-builder-shell">
          <div class="section-heading">
            <div>
              <span class="section-kicker">AUTO BUILDER • STUDIO 2 CỘT</span>
              <h2>Cấu hình tự động tạo Quiz &amp; Khung Xem Trước Độc Lập</h2>
            </div>
            <span class="draft-count">{draft.questions.length} câu đã có</span>
          </div>

          {#if isStaff && quizReadiness && quizReadiness.schema_ready === false}
            <div class="readiness-banner" data-testid="staff-readiness-warning" role="alert">
              <span class="warning-icon">⚠️</span>
              <div class="banner-body">
                <strong>Lưu ý: Cơ sở dữ liệu D1 chưa áp dụng migrations ({quizReadiness.missing_migrations?.join(', ') || '0018-0022'}).</strong>
                <p>Cần áp dụng migrations để kích hoạt lưu cấu hình tự động và khóa đồng bộ Docs: <code>{quizReadiness.remediation_code || 'npx wrangler d1 migrations apply tienganh-pro-db --remote'}</code></p>
              </div>
              <button type="button" class="btn-copy-small" on:click={() => copyRemediation(quizReadiness.remediation_code || 'npx wrangler d1 migrations apply tienganh-pro-db --remote')}>
                {copiedCode ? '✓ Đã chép' : 'Chép lệnh'}
              </button>
            </div>
          {/if}

          <div class="studio-split-grid">
            <!-- CỘT TRÁI: CẤU HÌNH NGUỒN HỌC LIỆU, THÔNG SỐ & PHÁT SINH ĐỀ -->
            <div class="studio-config-col">
              <div class="studio-step-card">
                <!-- Nguồn tài liệu -->
                <div class="source-picker-section">
                  <span class="section-label">1. Chọn nguồn tài liệu học thuật:</span>
                  <div class="source-grid">
                    <button class:active-source={sourceMode === 'upload'} class="source-card" type="button" on:click={() => chooseSource('upload')}>
                      <span>⇧</span><strong>Tải tài liệu</strong><small>DOCX, PDF, TXT hoặc tối đa 6 ảnh</small>
                    </button>
                    <button class:active-source={sourceMode === 'drive'} class="source-card" type="button" on:click={() => chooseSource('drive')}>
                      <span>△</span><strong>Google Drive</strong><small>Chọn file hoặc dán link Docs</small>
                    </button>
                    <button class:active-source={sourceMode === 'question_bank'} class="source-card" type="button" on:click={() => chooseSource('question_bank')}>
                      <span>📚</span><strong>Kho câu hỏi D1</strong><small>{bankTotalCount !== null ? `${bankTotalCount} câu D1` : '1375+ câu D1'}</small>
                    </button>
                    <button class:active-source={sourceMode === 'knowledge_vault'} class="source-card" type="button" on:click={() => chooseSource('knowledge_vault')}>
                      <span>📖</span><strong>Kho tri thức</strong><small>{kvTotal !== null ? `${kvTotal} bài học` : 'Knowledge Vault'}</small>
                    </button>
                  </div>
                </div>

                <!-- Nguồn tài liệu chi tiết (Đặt liền mạch ngay dưới 4 thẻ nguồn) -->
                {#if sourceMode === 'upload'}
                  <div class="source-panel auto-source-box">
                    <span class="box-title">📁 Tải tài liệu nguồn (DOCX, PDF, TXT hoặc tối đa 6 ảnh)</span>
                    <div class="upload-options">
                      <label class="file-label">
                        Chọn file từ máy (DOCX/PDF/TXT):
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                          on:change={(e) => {
                            const fList = Array.from(e.currentTarget.files || []);
                            handleFilesSelected(fList);
                          }}
                        />
                      </label>
                      {#if sourceFile}<p class="file-chosen">✓ Đã chọn: <strong>{uploadFiles.length > 1 ? `${uploadFiles.length} tệp (${uploadFiles.map(f => f.name).join(', ')})` : sourceFile.name}</strong></p>{/if}
                      <QuizCameraCapture
                        showLabels={(questionTypeMix.picture_guess || 0) > 0}
                        onCaptureFiles={(files, labels) => {
                          handleFilesSelected(files, labels);
                          message = `✓ Đã chọn ${files.length} ảnh tài liệu. Bấm "Tự động tạo Quiz" để xử lý.`;
                        }}
                      />

                      {#if uploadFiles.length > 0 && String(uploadFiles[0]?.type || '').startsWith('image/')}
                        <div class="image-labels-panel">
                          <div class="image-labels-header">
                            <span class="image-labels-title">🖼️ Nhãn từ vựng / Đáp án cho câu hỏi nhìn hình ({uploadFiles.length} ảnh):</span>
                            {#if (questionTypeMix.picture_guess || 0) > 0}
                              <span class="badge-req">Bắt buộc nhập ít nhất {Math.min(Number(questionTypeMix.picture_guess), uploadFiles.length)} nhãn (Picture Guess đang bật)</span>
                            {:else}
                              <span class="badge-opt">Không bắt buộc (ảnh dùng quét chữ OCR)</span>
                            {/if}
                          </div>
                          {#if (questionTypeMix.picture_guess || 0) === 0}
                            <div class="image-ocr-info-banner">
                              <span>ℹ️</span>
                              <p>Ảnh được dùng làm nguồn quét chữ OCR để tạo câu hỏi tự động. Bạn <strong>không cần nhập nhãn</strong> nếu không dùng dạng câu Nhìn hình đoán chữ (Picture Guess).</p>
                            </div>
                          {:else}
                            <div class="image-pg-info-banner">
                              <span>💡</span>
                              <p>Bạn đang bật dạng câu <strong>Nhìn hình đoán chữ</strong> ({questionTypeMix.picture_guess} câu). Vui lòng nhập nhãn từ vựng tiếng Anh tương ứng cho các ảnh bên dưới.</p>
                            </div>
                          {/if}
                          <div class="image-labels-grid">
                            {#each uploadFiles as file, idx}
                              <div class="image-label-card">
                                <div class="image-thumb-wrap">
                                  <span class="image-page-badge">Trang {idx + 1}</span>
                                  <img src={getImagePreview(file)} alt={`Trang ${idx + 1} - ${file.name || 'Ảnh'}`} class="image-thumb" />
                                </div>
                                <div class="image-info-wrap">
                                  <span class="image-filename" title={file.name}>{file.name}</span>
                                  {#if (questionTypeMix.picture_guess || 0) > 0}
                                    <label class="image-input-wrap" for={`img-label-input-${idx}`}>
                                      <span class="image-input-title">Từ vựng / Đáp án (tiếng Anh):</span>
                                      <input
                                        id={`img-label-input-${idx}`}
                                        type="text"
                                        class="image-label-input"
                                        placeholder="VD: apple, bicycle, elephant..."
                                        maxlength="80"
                                        aria-label={`Từ vựng hoặc đáp án tiếng Anh cho ảnh trang ${idx + 1}${file.name ? ` (${file.name})` : ''}`}
                                        value={imageLabels[idx] || ''}
                                        on:input={(e) => { imageLabels[idx] = e.currentTarget.value; }}
                                      />
                                    </label>
                                  {/if}
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {:else if sourceMode === 'drive'}
                  <div class="source-panel auto-source-box">
                    <span class="box-title">△ Kho Tài Liệu Google Drive &amp; Google Docs (Đã chuẩn hóa Tiếng Việt)</span>

                    {#if normalizedDriveFiles.length > 0}
                      <div class="source-group-pills" role="tablist" aria-label="Nhóm tài liệu Google Drive">
                        <button
                          type="button"
                          class="source-group-pill"
                          class:active={driveGroupFilter === 'all'}
                          on:click={() => driveGroupFilter = 'all'}
                        >
                          📚 Tất cả ({normalizedDriveFiles.length})
                        </button>
                        {#each driveGroupsSummary as grp (grp.key)}
                          <button
                            type="button"
                            class="source-group-pill"
                            class:active={driveGroupFilter === grp.key}
                            on:click={() => driveGroupFilter = grp.key}
                          >
                            {grp.short} ({grp.count})
                          </button>
                        {/each}
                      </div>
                    {/if}

                    <div class="drive-controls-grid">
                      <label>
                        Tìm nhanh tài liệu trong Drive:
                        <input
                          type="text"
                          bind:value={driveSearchQuery}
                          placeholder="Gõ tên chuyên đề, khối lớp (VD: Lớp 7, Ngữ pháp, HSG, IELTS)..."
                        />
                      </label>
                      <label>
                        Chọn nhanh từ danh sách phân nhóm:
                        <select bind:value={selectedDriveFileId}>
                          <option value="">-- Chọn tài liệu Google Drive ({filteredDriveFiles.length} tệp) --</option>
                          {#each groupedDriveFiles as grp (grp.groupLabel)}
                            <optgroup label={grp.groupLabel}>
                              {#each grp.items as file (file.id)}
                                <option value={file.id} disabled={!isSupportedDriveFile(file)}>
                                  {file.title_vi}{!isSupportedDriveFile(file) ? ' (Không hỗ trợ)' : ''}
                                </option>
                              {/each}
                            </optgroup>
                          {/each}
                        </select>
                      </label>
                    </div>

                    {#if groupedDriveFiles.length > 0}
                      <div class="grouped-source-list" aria-label="Danh sách tài liệu Google Drive theo nhóm">
                        {#each groupedDriveFiles as grp (grp.groupLabel)}
                          <div class="source-group-block">
                            <div class="source-group-header">
                              <strong>{grp.groupLabel}</strong>
                              <span>{grp.items.length} tài liệu</span>
                            </div>
                            <div class="drive-card-grid">
                              {#each grp.items as file (file.id)}
                                <label class="drive-doc-card" class:selected={selectedDriveFileId === file.id}>
                                  <input
                                    type="radio"
                                    name="drive_file_choice"
                                    value={file.id}
                                    checked={selectedDriveFileId === file.id}
                                    disabled={!isSupportedDriveFile(file)}
                                    on:change={() => selectedDriveFileId = file.id}
                                  />
                                  <div class="drive-doc-body">
                                    <strong>{file.title_vi}</strong>
                                    <small>{file.group_short} · {file.raw_name || file.name}</small>
                                  </div>
                                </label>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <label class="drive-url-label">
                      Hoặc dán đường dẫn Google Docs / Google Drive trực tiếp:
                      <input type="url" bind:value={driveUrl} placeholder="https://docs.google.com/document/d/..." inputmode="url" />
                    </label>
                  </div>
                {:else if sourceMode === 'question_bank'}
                  <div class="bank-panel">
                    <div class="sr-only" aria-live="polite" aria-atomic="true">{bankAriaLive}</div>
                    <div class="bank-filters">
                      <label>
                        Khối lớp / Cấp học
                        <select bind:value={bankFilters.grade_level} on:change={() => loadBankQuestions(true)}>
                          <option value="">Tất cả các khối lớp</option>
                          {#each bankFacets.grade_level as g}
                            <option value={g.grade_level}>{g.label_vi || formatGradeLevelVi(g.grade_level)} ({g.count} câu)</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        Kỹ năng trọng tâm
                        <select bind:value={bankFilters.skill_category} on:change={() => loadBankQuestions(true)}>
                          <option value="">Tất cả kỹ năng</option>
                          {#each bankFacets.skill_category as s}
                            <option value={s.skill_category}>{s.label_vi || formatSkillCategoryVi(s.skill_category)} ({s.count} câu)</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        Mức độ nhận thức
                        <select bind:value={bankFilters.cognitive_level} on:change={() => loadBankQuestions(true)}>
                          <option value="">Tất cả mức nhận thức</option>
                          {#each bankFacets.cognitive_level as c}
                            <option value={c.cognitive_level}>{c.label_vi || formatCognitiveLevelVi(c.cognitive_level)} ({c.count} câu)</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        Chuyên đề kiến thức
                        <select bind:value={bankFilters.topic} on:change={() => loadBankQuestions(true)}>
                          <option value="">Tất cả chuyên đề</option>
                          {#each (bankFacets.topic || []) as t}
                            <option value={t.topic}>{t.label_vi || formatTopicVi(t.topic)} ({t.count})</option>
                          {/each}
                        </select>
                      </label>
                      <label class="bank-search-label">
                        Tìm kiếm nội dung câu hỏi
                        <div class="search-input-wrap">
                          <input type="text" placeholder="Nhập từ khóa câu hỏi..." bind:value={bankFilters.q} on:keydown={(e) => e.key === 'Enter' && loadBankQuestions(true)} />
                          <button type="button" class="btn-search" on:click={() => loadBankQuestions(true)}>Tìm</button>
                        </div>
                      </label>
                    </div>

                    <div class="bank-action-bar">
                      <div class="bank-stats">
                        <strong>{bankTotalCount !== null ? bankTotalCount : '...'}</strong> câu hỏi phù hợp trong kho D1
                        {#if selectedBankQuestionIds.size > 0}
                          <span class="selection-pill">Đã chọn {selectedBankQuestionIds.size} câu</span>
                        {/if}
                      </div>
                      <div class="bank-buttons">
                        <button type="button" class="btn-outline compact" on:click={toggleAllBankQuestions}>
                          {selectedBankQuestionIds.size === bankQuestions.length && bankQuestions.length > 0 ? 'Bỏ chọn tất cả' : 'Chọn trang này'}
                        </button>
                        <button type="button" class="btn-accent compact" disabled={importBusy || selectedBankQuestionIds.size === 0} on:click={() => importFromBank('selected')}>
                          {importBusy ? 'Đang nhập...' : `Nhập ${selectedBankQuestionIds.size} câu đã chọn`}
                        </button>
                        <div class="quick-import-wrap">
                          <span>Nhập nhanh:</span>
                          <button type="button" class="btn-quick" disabled={importBusy} on:click={() => { importBatchCount = 10; importFromBank('batch'); }}>+10 câu</button>
                          <button type="button" class="btn-quick" disabled={importBusy} on:click={() => { importBatchCount = 20; importFromBank('batch'); }}>+20 câu</button>
                        </div>
                      </div>
                    </div>

                    {#if bankLoading}
                      <div class="bank-loading"><div class="spinner"></div> Đang tải câu hỏi từ kho D1...</div>
                    {:else if bankQuestions.length === 0}
                      <div class="empty-state">
                        <span>🔍</span>
                        <p>Không tìm thấy câu hỏi nào phù hợp với bộ lọc hiện tại.</p>
                        <button type="button" class="btn-outline compact" on:click={() => { bankFilters = { grade_level: '', topic: '', skill_category: '', cognitive_level: '', question_type: '', q: '' }; loadBankQuestions(true); }}>Đặt lại bộ lọc</button>
                      </div>
                    {:else}
                      <div class="bank-question-list">
                        {#each bankQuestions as q, qIdx (q.id)}
                          <label class="bank-q-card" class:selected={selectedBankQuestionIds.has(q.id)} for={'chk-bank-' + q.id}>
                            <div class="bank-q-header">
                              <div class="q-checkbox-wrapper">
                                <input
                                  id={'chk-bank-' + q.id}
                                  type="checkbox"
                                  class="q-checkbox"
                                  aria-label={`Chọn câu hỏi #${bankOffset + qIdx + 1}: ${q.prompt ? q.prompt.slice(0, 80) : ''}`}
                                  checked={selectedBankQuestionIds.has(q.id)}
                                  on:change={() => toggleBankQuestion(q.id)}
                                  on:keydown={(e) => { if (e.key === 'Enter') { toggleBankQuestion(q.id); e.preventDefault(); } }}
                                />
                                <span class="q-badge">#{bankOffset + qIdx + 1}</span>
                              </div>
                              <div class="bank-tags">
                                <span class="tag grade">{q.grade_label_vi || formatGradeLevelVi(q.grade_level)}</span>
                                <span class="tag skill">{q.skill_label_vi || formatSkillCategoryVi(q.skill_category)}</span>
                                <span class="tag cognitive">{q.cognitive_label_vi || formatCognitiveLevelVi(q.cognitive_level)}</span>
                                {#if q.topic}<span class="tag topic">{q.topic_label_vi || formatTopicVi(q.topic)}</span>{/if}
                              </div>
                            </div>
                            <div class="bank-q-prompt">
                              {q.prompt}
                            </div>
                            {#if q.options && q.options.length}
                              <div class="bank-q-options">
                                {#each q.options as opt}
                                  <div class="bank-q-option">{opt}</div>
                                {/each}
                              </div>
                            {/if}
                          </label>
                        {/each}
                      </div>

                      {#if bankTotalCount > 0}
                        <div class="bank-pagination">
                          <div class="bank-page-info">
                            Hiển thị <strong>{bankOffset + 1} - {Math.min(bankOffset + bankQuestions.length, bankTotalCount)}</strong> trên tổng số <strong>{bankTotalCount}</strong> câu
                            {#if bankTotalCount > 0 && bankOffset + bankQuestions.length >= bankTotalCount}
                              <span class="bank-end-note"> · ✓ Đã đến cuối danh sách</span>
                            {/if}
                          </div>
                          <div class="bank-page-nav">
                            <button
                              type="button"
                              class="btn-page"
                              disabled={bankOffset === 0 || bankLoading}
                              on:click={() => { bankOffset = Math.max(0, bankOffset - bankLimit); loadBankQuestions(false); }}
                            >
                              ← Trang trước
                            </button>
                            <button
                              type="button"
                              class="btn-page"
                              disabled={bankOffset + bankLimit >= bankTotalCount || bankLoading}
                              on:click={() => { bankOffset += bankLimit; loadBankQuestions(false); }}
                            >
                              Trang sau →
                            </button>
                          </div>
                        </div>
                      {/if}
                    {/if}
                  </div>
                {:else if sourceMode === 'knowledge_vault'}
                  <div class="kv-panel auto-source-box">
                    <span class="box-title">📖 Kho Tri Thức Tiếng Anh (Phân nhóm Chuyên đề Tiếng Việt Chuẩn Hóa)</span>

                    <div class="source-group-pills" role="tablist" aria-label="Nhóm chuyên đề Kho tri thức">
                      {#each KNOWLEDGE_VAULT_GROUPS as grp (grp.key)}
                        <button
                          type="button"
                          class="source-group-pill"
                          class:active={kvGroupFilter === grp.key}
                          on:click={() => selectKvGroup(grp.key)}
                        >
                          <span>{grp.icon}</span> {grp.label}
                        </button>
                      {/each}
                    </div>

                    <div class="kv-search-bar">
                      <input
                        type="text"
                        placeholder="Tìm kiếm bài học theo chủ đề, ngữ pháp, từ vựng (VD: Câu bị động, Mệnh đề quan hệ, Lớp 7)..."
                        bind:value={kvQuery}
                        on:keydown={(e) => e.key === 'Enter' && loadKnowledgeVaultArticles()}
                      />
                      <button type="button" class="btn-search" on:click={() => loadKnowledgeVaultArticles()}>Tìm kiếm</button>
                    </div>
                    {#if kvLoading}
                      <div class="bank-loading"><div class="spinner"></div> Đang tải chuyên đề từ Kho tri thức...</div>
                    {:else if kvArticles.length === 0}
                      <div class="empty-state">
                        <span>🔍</span>
                        <p>Chưa tìm thấy bài học nào phù hợp với nhóm hoặc từ khóa hiện tại.</p>
                        <button type="button" class="btn-outline compact" on:click={() => { kvQuery = ''; kvGroupFilter = 'all'; loadKnowledgeVaultArticles(); }}>Xem tất cả chuyên đề</button>
                      </div>
                    {:else}
                      <div class="grouped-source-list">
                        {#each groupedKvArticles as grp (grp.groupLabel)}
                          <div class="source-group-block">
                            <div class="source-group-header">
                              <strong>📚 {grp.groupLabel}</strong>
                              <span>{grp.items.length} chuyên đề</span>
                            </div>
                            <div class="kv-article-list">
                              {#each grp.items as art (art.id)}
                                <label class="kv-article-card" class:selected={kvSelectedArticleId === art.id}>
                                  <input
                                    type="radio"
                                    name="kv_article_choice"
                                    value={art.id}
                                    checked={kvSelectedArticleId === art.id}
                                    on:change={() => kvSelectedArticleId = art.id}
                                  />
                                  <div class="kv-article-info">
                                    <div class="kv-article-title">
                                      <strong>{art.title_vi || art.title}</strong>
                                      <span class="tag grade">{art.category_vi || art.category}</span>
                                    </div>
                                    {#if art.preview}<p class="kv-article-preview">{art.preview}...</p>{/if}
                                  </div>
                                </label>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- BƯỚC 2: Cấu hình thông số & Hình thức câu hỏi -->
              <div class="studio-step-card auto-config-section">
                <span class="section-label">2. Thiết lập thông số &amp; Hình thức câu hỏi:</span>
                <div class="form-grid auto-title-grid">
                  <label class="wide">
                    <div class="field-title-wrap">
                      <span>Tiêu đề quiz</span>
                      <small class="field-optional-hint">Không bắt buộc — hệ thống tự đặt nếu để trống</small>
                    </div>
                    <input
                      bind:value={draft.title}
                      maxlength="150"
                      placeholder="Ví dụ: Kiểm tra 15 phút Unit 4 · My Neighborhood (để trống sẽ tự sinh)"
                    />
                  </label>
                </div>

                <!-- Chọn nhanh Hình thức / Kiểu bài tập (áp dụng cho cả 4 nguồn) -->
                <div class="format-presets-bar" aria-label="Chọn hình thức kiểu bài tập">
                  <div class="format-presets-head">
                    <span class="presets-label">🧩 Chọn nhanh kiểu bài tập (áp dụng cho Tải file, Google Drive, Kho câu hỏi D1 &amp; Kho tri thức):</span>
                  </div>
                  <div class="format-presets-grid">
                    {#each QUIZ_FORMAT_PRESETS as preset (preset.id)}
                      <button
                        type="button"
                        class="preset-chip-btn"
                        class:active={selectedFormatPreset === preset.id}
                        on:click={() => applyFormatPreset(preset)}
                      >
                        <span class="preset-icon">{preset.icon}</span>
                        <span class="preset-text">
                          <strong>{preset.label}</strong>
                          <small>{preset.desc}</small>
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Concise summary bar -->
                <div class="config-summary-bar">
                  <div class="summary-chips">
                    <span class="summary-chip">📊 <strong>{autoConfig.question_count}</strong> câu</span>
                    <span class="summary-chip">⏱️ <strong>{autoConfig.time_limit_minutes}</strong> phút</span>
                    <span class="summary-chip">🎓 <strong>{autoConfig.grade_level === 0 ? 'Tổng hợp / IELTS' : `Lớp ${autoConfig.grade_level}`}</strong></span>
                    <span class="summary-chip">🎯 <strong>{autoConfig.difficulty === 'easy' ? 'Dễ' : autoConfig.difficulty === 'hard' ? 'Khó' : 'Chuẩn'}</strong></span>
                    <span class="summary-chip types-chip" title={activeTypeNames}>🧩 {activeTypeNames}</span>
                  </div>
                  <button
                    type="button"
                    class="btn-toggle-advanced"
                    aria-expanded={showAdvancedConfig}
                    aria-controls="advanced-config-panel"
                    on:click={() => showAdvancedConfig = !showAdvancedConfig}
                  >
                    <span class="toggle-icon">{showAdvancedConfig ? '▲' : '⚙️'}</span>
                    <span>{showAdvancedConfig ? 'Thu gọn tùy chỉnh nâng cao' : 'Tùy chỉnh nâng cao'}</span>
                  </button>
                </div>

                <!-- Advanced Config Panel (Collapsed by default) -->
                <div
                  id="advanced-config-panel"
                  class="advanced-config-panel"
                  class:is-collapsed={!showAdvancedConfig}
                >
                  <div class="advanced-inner">
                    <div class="form-grid advanced-form-grid">
                      <label>
                        Số lượng câu hỏi (1 - 200)
                        <input
                          type="number"
                          min="1"
                          max="200"
                          bind:value={autoConfig.question_count}
                          on:change={() => {
                            const curTotal = Object.values(questionTypeMix).reduce((a, b) => a + b, 0);
                            if (curTotal > 0 && curTotal !== autoConfig.question_count) {
                              const keys = Object.keys(questionTypeMix);
                              questionTypeMix[keys[0]] = Math.max(1, questionTypeMix[keys[0]] + (autoConfig.question_count - curTotal));
                            }
                          }}
                        />
                      </label>
                      <label>
                        Thời gian (phút)
                        <input type="number" min="1" max="180" bind:value={autoConfig.time_limit_minutes} />
                      </label>
                      <label>
                        Khối lớp
                        <select bind:value={autoConfig.grade_level} on:change={() => { bankFilters.grade_level = autoConfig.grade_level !== undefined && autoConfig.grade_level !== null ? String(autoConfig.grade_level) : ''; if (sourceMode === 'question_bank') loadBankQuestions(true); }}>
                          {#each Array.from({length: 13}, (_, i) => i) as g}
                            <option value={g}>{g === 0 ? 'Tổng hợp / IELTS' : `Lớp ${g}`}</option>
                          {/each}
                        </select>
                      </label>
                      {#if sourceMode === 'question_bank'}
                        <div class="bank-disabled-notice" title="Độ khó được kế thừa từ từng câu hỏi trong kho">
                          <span class="text-xs text-stone-500 italic block mt-5">ℹ️ Độ khó: theo câu hỏi trong kho</span>
                        </div>
                      {:else}
                        <label>
                          Độ khó
                          <select bind:value={autoConfig.difficulty}>
                            <option value="easy">Cơ bản (Dễ)</option>
                            <option value="medium">Trung bình (Chuẩn)</option>
                            <option value="hard">Nâng cao (Khó)</option>
                          </select>
                        </label>
                      {/if}
                    </div>

                    <!-- Phân bổ dạng câu hỏi (Dynamic Mix) inside Advanced Panel -->
                    {#if sourceMode === 'question_bank'}
                      <aside class="bank-mode-notice-box">
                        <strong>📚 Nguồn Kho câu hỏi (Question Bank):</strong> Hệ thống hỗ trợ chuyển đổi linh hoạt các câu hỏi từ Kho D1 sang đúng tỷ lệ các dạng bài tập tương tác bạn chọn bên dưới (Trắc nghiệm, Đúng/Sai, Điền từ, Nối từ, Đoán từ, Sắp xếp câu, Ghép cặp trí nhớ, Viết lại câu).
                      </aside>
                    {/if}
                    <div class="type-mix-section">
                      <div class="type-mix-header">
                        <div>
                          <span class="section-label">Dạng câu hỏi &amp; Phân bổ mục tiêu:</span>
                          <p class="type-mix-hint">Phân bổ dạng câu là mục tiêu tùy chọn. Hệ thống sẽ tự động điều chỉnh linh hoạt theo nội dung thực tế của tài liệu nguồn.</p>
                        </div>
                        <div class="allocation-pill">
                          Đã phân bổ: <strong>{Object.values(questionTypeMix).reduce((a, b) => a + b, 0)}</strong> / <strong>{autoConfig.question_count}</strong> câu
                        </div>
                      </div>

                      <div class="type-mix-grid">
                        {#each ALL_QUESTION_TYPES as typeInfo (typeInfo.id)}
                          <div class="type-mix-card" class:active={questionTypeMix[typeInfo.id] !== undefined}>
                            <div class="type-card-head">
                              <label class="type-toggle-label">
                                <input
                                  type="checkbox"
                                  checked={questionTypeMix[typeInfo.id] !== undefined}
                                  on:change={() => toggleTypeActive(typeInfo.id)}
                                />
                                <span class="type-name"><strong>{typeInfo.name}</strong></span>
                              </label>
                              <span class="type-icon">{typeInfo.icon}</span>
                            </div>
                            <p class="type-desc">{typeInfo.desc}</p>
                            {#if questionTypeMix[typeInfo.id] !== undefined}
                              <div class="type-stepper">
                                <button
                                  type="button"
                                  class="btn-step"
                                  aria-label={`Giảm số câu ${typeInfo.name}`}
                                  disabled={questionTypeMix[typeInfo.id] <= 1}
                                  on:click={() => updateTypeCount(typeInfo.id, -1)}
                                >
                                  −
                                </button>
                                <span class="step-value">{questionTypeMix[typeInfo.id]} câu</span>
                                <button
                                  type="button"
                                  class="btn-step"
                                  aria-label={`Tăng số câu ${typeInfo.name}`}
                                  on:click={() => updateTypeCount(typeInfo.id, 1)}
                                >
                                  ＋
                                </button>
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>

                    <div class="advanced-footer">
                      <button
                        type="button"
                        class="btn-outline btn-save-defaults"
                        disabled={defaultsSaving}
                        on:click={saveBuilderDefaults}
                      >
                        {defaultsSaving ? 'Đang lưu...' : '💾 Lưu cấu hình mặc định vào tài khoản'}
                      </button>
                      <small class="save-defaults-note">Cấu hình sẽ được lưu vào tài khoản và tự động áp dụng trong các lần tạo quiz tiếp theo.</small>
                    </div>
                  </div>
                </div>
              </div>

              <!-- BƯỚC 3: Chế độ thêm câu hỏi & Phát sinh Quiz -->
              <div class="studio-step-card merge-strategy-section">
                <span class="section-label">3. Chế độ hợp nhất &amp; Khởi tạo câu hỏi:</span>
                <div class="merge-options-group">
                  <label class="merge-option" class:active={mergeStrategy === 'append'}>
                    <input type="radio" bind:group={mergeStrategy} value="append" />
                    <div class="merge-text">
                      <strong>➕ Thêm vào đề (Mặc định)</strong>
                      <small>Giữ nguyên các câu hỏi đã có trong bản nháp, bổ sung câu hỏi mới</small>
                    </div>
                  </label>
                  <label class="merge-option" class:active={mergeStrategy === 'replace'}>
                    <input
                      type="radio"
                      bind:group={mergeStrategy}
                      value="replace"
                      on:change={() => {
                        if (draft.questions.length > 0) showReplaceConfirm = true;
                      }}
                    />
                    <div class="merge-text">
                      <strong>🔄 Thay thế toàn bộ</strong>
                      <small>Xóa các câu hỏi cũ trong bản nháp khi sinh mới</small>
                    </div>
                  </label>
                </div>
                {#if mergeStrategy === 'replace' && draft.questions.length > 0}
                  <div class="replace-warning-banner">
                    <span class="warning-icon">⚠️</span>
                    <div>
                      <strong>Cảnh báo Thay thế:</strong> Bạn đang chọn thay thế toàn bộ. Khi bấm tạo đề, tất cả <b>{draft.questions.length}</b> câu hỏi hiện tại trong bản nháp sẽ bị xóa và thay thế.
                    </div>
                  </div>
                {/if}

                <!-- Auto Action Bar -->
                <div class="auto-action-bar">
                  <button
                    type="button"
                    class="btn-main btn-generate"
                    disabled={autoGenerating}
                    on:click={autoGenerateQuiz}
                  >
                    {autoGenerating ? '⏳ Đang tự động phân tích & tạo quiz...' : '⚡ Tự động tạo Quiz'}
                  </button>
                </div>
              </div>
            </div>

            <!-- CỘT PHẢI: KHUNG XEM TRƯỚC & BIÊN TẬP ĐỘC LẬP (LIVE PREVIEW CANVAS) -->
            <aside class="studio-preview-col" aria-label="Khung xem trước và biên tập đề Quiz">
              <!-- Báo cáo chất lượng sinh câu hỏi / Degraded Reason -->
              {#if lastGenerationReport}
                <div class="generation-report-banner" class:degraded={lastGenerationReport.degraded_reason || (lastGenerationReport.degraded_types && lastGenerationReport.degraded_types.length > 0)}>
                  {#if lastGenerationReport.degraded_reason || (lastGenerationReport.degraded_types && lastGenerationReport.degraded_types.length > 0)}
                    <div class="report-header">
                      <span class="report-icon">⚠️</span>
                      <div>
                        <strong>Thông báo chất lượng sinh đề:</strong>
                        <p>{lastGenerationReport.degraded_reason || 'Một số dạng câu hỏi không đủ dữ liệu grounded để sinh.'}</p>
                        {#if lastGenerationReport.degraded_types?.length}
                          <small>Dạng bị giảm/bỏ qua: {lastGenerationReport.degraded_types.join(', ')}</small>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <div class="report-header">
                      <span class="report-icon">✅</span>
                      <div>
                        <strong>Sinh câu hỏi thành công đầy đủ theo cấu hình!</strong>
                      </div>
                    </div>
                  {/if}
                  {#if lastGenerationReport.requested_counts || lastGenerationReport.generated_counts}
                    <div class="report-breakdown">
                      <span>Chi tiết số lượng:</span>
                      {#each Object.entries(lastGenerationReport.requested_counts || {}) as [t, reqCount]}
                        <span class="count-badge">
                          {t}: {lastGenerationReport.generated_counts?.[t] || 0}/{reqCount}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Preview & Lưu sau khi Auto sinh câu hỏi -->
              {#if draft.questions.length > 0}
                <div class="generated-preview-section">
                  <div class="preview-mode-header">
                    <div>
                      <span class="section-kicker">KẾT QUẢ TỰ ĐỘNG</span>
                      <h3>{autoQuestionViewMode === 'review' ? 'Xem trước kết quả' : 'Chỉnh sửa chi tiết'} ({draft.questions.length} câu)</h3>
                      <p class="preview-mode-desc">
                        {autoQuestionViewMode === 'review'
                          ? 'Xem trước bản nháp đã được tạo tự động. Bạn có thể kiểm tra và bấm "Xuất bản Quiz" hoặc "Chỉnh sửa chi tiết" nếu muốn sửa prompt/đáp án.'
                          : 'Đang ở chế độ chỉnh sửa chi tiết. Bạn có thể thay đổi prompt, đáp án, điểm hoặc thêm/xóa câu.'}
                      </p>
                    </div>
                    <div class="preview-mode-actions">
                      {#if autoQuestionViewMode === 'review'}
                        <button
                          type="button"
                          class="btn-outline btn-toggle-view"
                          on:click={() => autoQuestionViewMode = 'edit'}
                        >
                          ✏️ Chỉnh sửa chi tiết
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="btn-outline btn-toggle-view"
                          on:click={() => autoQuestionViewMode = 'review'}
                        >
                          👁️ Quay lại xem trước
                        </button>
                      {/if}
                    </div>
                  </div>

              {#if autoQuestionViewMode === 'review'}
                <div class="question-review-list">
                  {#each draft.questions as question, index (question.id)}
                    <article class="review-card">
                      <header class="review-card-header">
                        <div class="review-meta-left">
                          <span class="question-number">{index + 1}</span>
                          <span class="review-type-badge">{questionTypeBadge(question.type)}</span>
                        </div>
                        <span class="review-points-badge">{question.points || 1} điểm</span>
                      </header>

                      {#if question.prompt_image_url}
                        <div class="review-image-wrap">
                          <img src={question.prompt_image_url} alt={`Minh họa câu ${index + 1}`} class="review-image-thumb" />
                        </div>
                      {/if}

                      <p class="review-prompt-text">{question.prompt}</p>

                      {#if question.type === 'multiple_choice'}
                        <div class="review-options-list">
                          {#each question.options as option, optIdx}
                            <div class="review-option-item" class:is-correct={question.correct_answer === option}>
                              <span class="review-opt-letter">{String.fromCharCode(65 + optIdx)}.</span>
                              <span class="review-opt-text">{formatOptionDisplay(option)}</span>
                              {#if question.correct_answer === option}
                                <span class="review-correct-badge">✓ Đáp án đúng</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {:else if question.type === 'true_false'}
                        <div class="review-tf-options">
                          <div class="review-tf-item" class:is-correct={question.correct_answer === 'Đúng'}>
                            <span>Đúng</span>
                            {#if question.correct_answer === 'Đúng'}<span class="review-correct-badge">✓ Đáp án đúng</span>{/if}
                          </div>
                          <div class="review-tf-item" class:is-correct={question.correct_answer === 'Sai'}>
                            <span>Sai</span>
                            {#if question.correct_answer === 'Sai'}<span class="review-correct-badge">✓ Đáp án đúng</span>{/if}
                          </div>
                        </div>
                      {:else if question.type === 'matching' || question.type === 'memory_match'}
                        <div class="review-pairs-list">
                          <span class="review-field-title">Các cặp ghép đôi:</span>
                          {#each question.left as leftItem, pIdx}
                            <div class="review-pair-item">
                              <span class="review-pair-left">{leftItem}</span>
                              <span class="review-pair-arrow">↔</span>
                              <span class="review-pair-right">{question.right[pIdx]}</span>
                            </div>
                          {/each}
                        </div>
                      {:else if question.type === 'ordering'}
                        <div class="review-ordering-list">
                          <span class="review-field-title">Thứ tự đúng:</span>
                          <ol class="review-order-ol">
                            {#each question.options as item}
                              <li>{item}</li>
                            {/each}
                          </ol>
                        </div>
                      {:else if !['paragraph', 'rewrite', 'essay'].includes(question.type)}
                        <div class="review-text-answer">
                          <span class="review-field-title">Đáp án đúng:</span>
                          <strong class="review-correct-value">{question.correct_answer || '(Chưa có đáp án)'}</strong>
                        </div>
                      {:else}
                        <div class="review-note">Giáo viên sẽ chấm thủ công sau khi học sinh nộp bài.</div>
                      {/if}

                      {#if question.explanation}
                        <div class="review-explanation">
                          <span class="review-expl-label">💡 Giải thích:</span>
                          <span>{question.explanation}</span>
                        </div>
                      {/if}
                    </article>
                  {/each}
                </div>
              {:else}
                <div class="question-editor-list">
                  {#each draft.questions as question, index (question.id)}
                    <article class="editor-card">
                      <header>
                        <span class="question-number">{index + 1}</span>
                        <select aria-label={`Dạng câu ${index + 1}`} value={question.type} on:change={(e) => changeQuestionType(question, e.currentTarget.value)}>
                          {#each questionTypes as type}<option value={type[0]}>{type[1]}</option>{/each}
                        </select>
                        <div class="editor-actions">
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
                      {:else if question.type === 'true_false'}
                        <div class="option-editor">
                          <span class="field-label">Đáp án đúng</span>
                          <div class="tf-choices">
                            <label><input type="radio" name={`tf-${question.id}`} value="Đúng" checked={question.correct_answer === 'Đúng'} on:change={() => question.correct_answer = 'Đúng'} /> Đúng</label>
                            <label><input type="radio" name={`tf-${question.id}`} value="Sai" checked={question.correct_answer === 'Sai'} on:change={() => question.correct_answer = 'Sai'} /> Sai</label>
                          </div>
                        </div>
                      {:else if question.type === 'matching' || question.type === 'memory_match'}
                        <div class="pair-editor">
                          <span class="field-label">Các cặp đúng</span>
                          {#each question.left as left, pairIndex}
                            <div><input value={left} on:input={(e) => updatePair(question, 'left', pairIndex, e.currentTarget.value)} aria-label={`Vế trái ${pairIndex + 1}`} /><span>↔</span><input value={question.right[pairIndex]} on:input={(e) => updatePair(question, 'right', pairIndex, e.currentTarget.value)} aria-label={`Vế phải ${pairIndex + 1}`} /></div>
                          {/each}
                          <button class="text-button" on:click={() => addPair(question)}>＋ Thêm cặp</button>
                        </div>
                      {:else if !['paragraph', 'rewrite', 'essay'].includes(question.type)}
                        <label>Đáp án đúng<input bind:value={question.correct_answer} placeholder="Đáp án để chấm tự động" /></label>
                      {:else}
                        <div class="review-note">Câu này sẽ được giáo viên chấm sau khi học viên nộp bài.</div>
                      {/if}
                      <div class="editor-bottom">
                        <label>Điểm<input type="number" min="0" max="100" step="0.5" bind:value={question.points} /></label>
                        <label>Giải thích<input bind:value={question.explanation} placeholder="Hiện sau khi chấm" /></label>
                      </div>
                    </article>
                  {/each}
                </div>
              {/if}

                  <div class="save-bar">
                    <div><strong>{draft.questions.length} câu hỏi</strong><small>Kiểm tra nội dung trước khi xuất bản</small></div>
                    <button class="btn-outline" disabled={!isStaff} on:click={() => saveDraft(false)}>Lưu nháp</button>
                    <button class="btn-main" disabled={!isStaff} on:click={() => saveDraft(true)}>Xuất bản Quiz</button>
                  </div>
                </div>
              {:else}
                <div class="studio-empty-preview">
                  <div class="empty-preview-head">
                    <span class="section-kicker">LIVE PREVIEW CANVAS</span>
                    <h3>Khung Xem Trước Đề Quiz</h3>
                    <p>Cột bên phải này dành riêng để hiển thị trực tiếp các câu hỏi sau khi sinh tự động — tách biệt hoàn toàn với các thẻ cấu hình bên trái.</p>
                  </div>
                  <div class="blueprint-summary-card">
                    <div class="blueprint-row">
                      <span> Nguồn đang chọn:</span>
                      <strong>
                        {sourceMode === 'upload' ? 'Tải File / OCR Ảnh' : sourceMode === 'drive' ? 'Google Drive & Docs' : sourceMode === 'question_bank' ? 'Kho Câu Hỏi D1' : 'Kho Tri Thức'}
                      </strong>
                    </div>
                    <div class="blueprint-row">
                      <span>🎯 Quy mô đề:</span>
                      <strong>{autoConfig.question_count} câu · {autoConfig.time_limit_minutes} phút · {autoConfig.grade_level === 0 ? 'Tổng hợp / IELTS' : `Lớp ${autoConfig.grade_level}`}</strong>
                    </div>
                    <div class="blueprint-row">
                      <span>🧩 Ma trận câu hỏi:</span>
                      <strong>{activeTypeNames}</strong>
                    </div>
                  </div>
                  <div class="empty-preview-cta">
                    <button
                      type="button"
                      class="btn-outline full"
                      disabled={autoGenerating}
                      on:click={async () => {
                        await chooseSource('question_bank');
                        await autoGenerateQuiz();
                      }}
                    >
                      ⚡ Sinh nhanh {autoConfig.question_count} câu từ Kho D1 ngay
                    </button>
                  </div>
                </div>
              {/if}
            </aside>
          </div>
        </div>
      {:else}
        <!-- Manual Mode Workspace -->
        <div class="manual-builder-shell">
          <div class="section-heading">
            <div><span class="section-kicker">SOẠN BÀI THỦ CÔNG</span><h2>Tự soạn từng câu hỏi</h2></div>
            <span class="draft-count">{draft.questions.length} câu</span>
          </div>

          <div class="form-grid">
            <label class="wide">Tên quiz<input bind:value={draft.title} maxlength="150" placeholder="Ví dụ: Unit 3 · At home" /></label>
            <label>Thời gian (phút)<input type="number" min="1" max="180" bind:value={draft.time_limit_minutes} /></label>
            <label class="wide">Mô tả<textarea bind:value={draft.description} maxlength="2000" rows="2" placeholder="Mục tiêu và hướng dẫn ngắn"></textarea></label>
          </div>

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
                {:else if question.type === 'true_false'}
                  <div class="option-editor">
                    <span class="field-label">Đáp án đúng</span>
                    <div class="tf-choices">
                      <label><input type="radio" name={`tf-${question.id}`} value="Đúng" checked={question.correct_answer === 'Đúng'} on:change={() => question.correct_answer = 'Đúng'} /> Đúng</label>
                      <label><input type="radio" name={`tf-${question.id}`} value="Sai" checked={question.correct_answer === 'Sai'} on:change={() => question.correct_answer = 'Sai'} /> Sai</label>
                    </div>
                  </div>
                {:else if question.type === 'matching' || question.type === 'memory_match'}
                  <div class="pair-editor">
                    <span class="field-label">Các cặp đúng</span>
                    {#each question.left as left, pairIndex}
                      <div><input value={left} on:input={(e) => updatePair(question, 'left', pairIndex, e.currentTarget.value)} aria-label={`Vế trái ${pairIndex + 1}`} /><span>↔</span><input value={question.right[pairIndex]} on:input={(e) => updatePair(question, 'right', pairIndex, e.currentTarget.value)} aria-label={`Vế phải ${pairIndex + 1}`} /></div>
                    {/each}
                    <button class="text-button" on:click={() => addPair(question)}>＋ Thêm cặp</button>
                  </div>
                {:else if !['paragraph', 'rewrite', 'essay'].includes(question.type)}
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
              <div class="empty-editor"><span>✦</span><h3>Bắt đầu bằng một câu hỏi</h3><p>Chọn một trong các dạng phía trên để thêm câu hỏi.</p></div>
            {/each}
          </div>

          <div class="save-bar">
            <div><strong>{draft.questions.length} câu hỏi</strong><small>Kiểm tra nội dung trước khi xuất bản</small></div>
            <button class="btn-outline" disabled={!isStaff} on:click={() => saveDraft(false)}>Lưu nháp</button>
            <button class="btn-main" disabled={!isStaff} on:click={() => saveDraft(true)}>Xuất bản Quiz</button>
          </div>
        </div>
      {/if}
    </section>
  {:else if activeTab === 'mine'}
    <section class="workspace" data-testid="quiz-mine-workspace">
      <div class="section-heading"><div><span class="section-kicker">THƯ VIỆN D1</span><h2>Quiz của tôi ({myQuizzes.length})</h2></div><button type="button" class="btn-main compact" on:click={() => { if (!isStaff) activateQuickStaffMode(); selectTab('create'); }}>＋ Tạo mới</button></div>
      {#if !isStaff}
        <div class="permission-card" style="margin-bottom:16px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px;">
          <div style="display:flex; gap:10px; align-items:center;">
            <span>🔐</span>
            <div>
              <strong>Chế độ Quản lý Kho Quiz của tôi</strong>
              <p>Kích hoạt nhanh quyền Giáo viên / Leader để sửa đề, chấm bài, đồng bộ DOCX và giao BTVN.</p>
            </div>
          </div>
          <button type="button" data-testid="activate-staff-mine-btn" class="btn-main compact" on:click={activateQuickStaffMode}>
            ⚡ Kích hoạt Quyền Giáo Viên / Leader
          </button>
        </div>
      {/if}
      {#if loading}
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
      {#if !assignedMode && publicQuizzes.length > 0}
        <div class="catalog-filter-bar" role="group" aria-label="Lọc danh mục quiz theo khối lớp">
          <button type="button" class="source-pill" class:active={takeCatalogFilter === 'all'} on:click={() => (takeCatalogFilter = 'all')}>📚 Tất cả ({publicQuizzes.length})</button>
          <button type="button" class="source-pill" class:active={takeCatalogFilter === 'tieu_hoc'} on:click={() => (takeCatalogFilter = 'tieu_hoc')}>📘 Tiểu học (Lớp 1–5)</button>
          <button type="button" class="source-pill" class:active={takeCatalogFilter === 'thcs'} on:click={() => (takeCatalogFilter = 'thcs')}>📗 THCS (Lớp 6–9)</button>
          <button type="button" class="source-pill" class:active={takeCatalogFilter === 'thpt'} on:click={() => (takeCatalogFilter = 'thpt')}>📙 THPT (Lớp 10–12)</button>
          <button type="button" class="source-pill" class:active={takeCatalogFilter === 'ielts'} on:click={() => (takeCatalogFilter = 'ielts')}>🌍 Chứng chỉ Quốc tế (IELTS)</button>
        </div>
      {/if}
      {#if loading}
        <div class="loading-grid"><i></i><i></i><i></i></div>
      {:else if filteredPublicQuizzes.length}
        <div class="quiz-grid take-grid">
          {#each filteredPublicQuizzes as quiz, index}
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
        {#if quizReadiness && quizReadiness.schema_ready === false}
          {#if isStaff && quizReadiness?.is_staff !== false}
            <div class="readiness-alert-card" data-testid="quiz-readiness-unready" role="alert">
              <div class="alert-icon">⚠️</div>
              <div class="alert-body">
                <h3>Cơ sở dữ liệu Quiz chưa hoàn tất Migrations</h3>
                <p class="alert-desc">{quizReadiness.message}</p>
                {#if quizReadiness.missing_migrations && quizReadiness.missing_migrations.length}
                  <div class="alert-detail">
                    <strong>Migrations chưa áp dụng ({quizReadiness.missing_migrations.length}):</strong>
                    <code>{quizReadiness.missing_migrations.join(', ')}</code>
                  </div>
                {/if}
                {#if quizReadiness.missing_tables && quizReadiness.missing_tables.length}
                  <div class="alert-detail">
                    <strong>Bảng chưa khởi tạo:</strong>
                    <code>{quizReadiness.missing_tables.join(', ')}</code>
                  </div>
                {/if}
                {#if quizReadiness.remediation_code}
                  <div class="remediation-box">
                    <span class="remediation-title">Lệnh áp dụng migrations (Terminal / CI):</span>
                    <div class="code-copy-row">
                      <code>{quizReadiness.remediation_code}</code>
                      <button type="button" class="btn-copy" on:click={() => copyRemediation(quizReadiness.remediation_code)}>
                        {copiedCode ? '✓ Đã sao chép' : 'Sao chép lệnh'}
                      </button>
                    </div>
                  </div>
                {/if}
                <div class="alert-actions">
                  <button type="button" class="btn-main compact" on:click={loadQuizzes}>Kiểm tra lại trạng thái</button>
                  <button type="button" class="btn-outline compact" on:click={() => selectTab('create')}>Đi tới Tạo Quiz</button>
                </div>
              </div>
            </div>
          {:else}
            <div class="readiness-guest-card" data-testid="quiz-readiness-maintenance" role="status">
              <div class="maintenance-icon">⏳</div>
              <h3>Đang cập nhật kho bài tập trắc nghiệm</h3>
              <p>{quizReadiness.message || 'Hệ thống Quiz đang trong quá trình đồng bộ dữ liệu. Bạn vui lòng quay lại sau ít phút nhé!'}</p>
              <button type="button" class="btn-outline compact" on:click={loadQuizzes}>Tải lại trang</button>
            </div>
          {/if}
        {:else}
          <div class="empty-state" data-testid="quiz-catalog-empty">
            <span>☁</span>
            <h3>{assignedMode ? 'Chưa có quiz nào được giao' : 'Chưa có bài quiz nào được xuất bản'}</h3>
            <p>{assignedMode ? 'Giáo viên sẽ giao quiz cho lớp của bạn tại đây.' : 'Hiện tại chưa có bài quiz nào trong danh mục công khai. Giáo viên có thể tạo và xuất bản quiz mới.'}</p>
            {#if isStaff}
              <button type="button" class="btn-main compact mt-3" on:click={() => selectTab('create')}>+ Tạo bài Quiz đầu tiên</button>
            {/if}
          </div>
        {/if}
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
      <aside><strong>Tiến độ</strong><div class="question-map">{#each selectedQuiz.questions as question, index}<a class:done={answerHasValue(answers[question.id])} href={`#question-${question.id}`} on:click|preventDefault={() => scrollToQuestion(question.id)}>{index + 1}</a>{/each}</div><p><i></i> Đã trả lời</p></aside>
      <div class="exam-questions">
        {#each selectedQuiz.questions as question, index}
          <article class:deferred={isDeferred(question.id)} class="exam-question" id={`question-${question.id}`}>
            <div class="question-head">
              <div class="question-head-left">
                <span>Câu {index + 1}</span>
                <small class="exam-q-type-badge">{questionTypeBadge(question.type)}</small>
              </div>
              <div>
                <button class="defer-button" on:click={() => toggleDeferred(question.id)}>{isDeferred(question.id) ? '✓ Để làm sau' : 'Không hiểu'}</button>
                <b>{question.points} điểm</b>
              </div>
            </div>
            <h2>{question.prompt}</h2>
            {#if question.prompt_image_url}
              {#if isAllowedImageUrl(question.prompt_image_url)}
                <img
                  class="question-image"
                  src={question.prompt_image_url}
                  alt="Minh họa câu hỏi"
                  on:error={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fb = e.currentTarget.nextElementSibling;
                    if (fb) fb.style.display = 'flex';
                  }}
                />
                <div class="image-fallback-placeholder" style="display:none; padding:10px; background:#f5f5f4; border:1px dashed #d6d3d1; border-radius:6px; color:#78716c; font-size:12px; align-items:center; gap:6px;">
                  <span>🖼️</span> Không thể tải ảnh minh họa
                </div>
              {:else}
                <div class="image-blocked-placeholder" style="padding:10px; background:#fffbeb; border:1px dashed #f59e0b; border-radius:6px; color:#b45309; font-size:12px; display:flex; align-items:center; gap:6px;">
                  <span>⚠️</span> Ảnh từ nguồn bên ngoài chưa được kiểm duyệt để đảm bảo an toàn riêng tư
                </div>
              {/if}
            {/if}
            {#if isDeferred(question.id)}
              <div class="deferred-note">Phần này đã được lưu để bạn hỏi giáo viên và sửa sau. Bấm “Để làm sau” lần nữa khi đã hiểu.</div>
            {:else if question.type === 'multiple_choice'}
              <div class="answer-options">{#each question.options || [] as option, optionIndex}<label class:selected={answers[question.id] === option}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} on:change={() => setAnswer(question.id, option)} /><span>{String.fromCharCode(65 + optionIndex)}</span><strong>{formatOptionDisplay(option)}</strong></label>{/each}</div>
            {:else if question.type === 'true_false'}
              <div class="answer-options tf-options" style="display:flex; gap:12px;">
                {#each (question.options || ['Đúng', 'Sai']) as opt}
                  <label class:selected={answers[question.id] === opt} style="display:flex; align-items:center; gap:8px; padding:10px 16px; border:1px solid #e7e5e4; border-radius:8px; cursor:pointer;">
                    <input type="radio" name={question.id} value={opt} checked={answers[question.id] === opt} on:change={() => setAnswer(question.id, opt)} />
                    <strong>{opt}</strong>
                  </label>
                {/each}
              </div>
            {:else if question.type === 'ordering'}
              <div class="ordering-answer">
                <div class="ordering-sentence-box">
                  <span class="ordering-box-label">Câu bạn ghép (bấm vào thẻ từ bên dưới để chọn hoặc bấm từ đã chọn để bỏ ra):</span>
                  <div class="ordering-picked-row">
                    {#if Array.isArray(answers[question.id]) && answers[question.id].length > 0}
                      {#each answers[question.id] as word, wIdx}
                        <button type="button" class="word-chip picked" on:click={() => removeOrderWordAt(question.id, wIdx)}>{word} <span>×</span></button>
                      {/each}
                      <button type="button" class="word-chip-reset" on:click={() => resetOrderWords(question.id)}>Đặt lại</button>
                    {:else}
                      <span class="ordering-empty-hint">Chưa chọn từ nào — hãy bấm lần lượt các thẻ từ bên dưới để tạo câu hoàn chỉnh.</span>
                    {/if}
                  </div>
                </div>
                <div class="ordering-pool-row">
                  {#each (question.options?.items || (Array.isArray(question.options) ? question.options : [])) as poolWord}
                    <button
                      type="button"
                      class="word-chip"
                      on:click={() => pickOrderWord(question.id, poolWord)}
                    >
                      ＋ {poolWord}
                    </button>
                  {/each}
                </div>
              </div>
            {:else if question.type === 'memory_match'}
              <div class="memory-answer">
                <p style="font-size:12px; color:#78716c; margin-bottom:8px;">Ghép đôi các thẻ nhớ tương ứng:</p>
                {#each (question.options?.pairs ? question.options.pairs.map(p => p.a) : question.options?.left || []) as leftItem}
                  <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                    <strong style="min-width:120px;">{leftItem}</strong>
                    <span>↔</span>
                    <select value={answers[question.id]?.[leftItem] || ''} on:change={(e) => setMatching(question.id, leftItem, e.currentTarget.value)}>
                      <option value="">Chọn thẻ ghép cặp</option>
                      {#each (question.options?.pairs ? question.options.pairs.map(p => p.b) : question.options?.right || []) as rightItem}
                        <option value={rightItem}>{rightItem}</option>
                      {/each}
                    </select>
                  </label>
                {/each}
              </div>
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
        {#if bundleHealth}
          <div class="bundle-status-bar" aria-live="polite">
            {#if bundleHealth.status === 'clean'}
              <span class="badge-health badge-clean">✓ Đã đồng bộ khớp</span>
            {:else if bundleHealth.status === 'quiz_changed'}
              <span class="badge-health badge-changed">✎ Quiz đã sửa đổi</span>
            {:else if bundleHealth.status === 'docs_changed'}
              <span class="badge-health badge-changed">📄 Google Docs đã sửa đổi</span>
            {:else if bundleHealth.status === 'both_changed'}
              <span class="badge-health badge-conflict">⚠ Xung đột: cả 2 bên đã sửa</span>
            {:else if bundleHealth.status === 'drive_unavailable'}
              <span class="badge-health badge-error" aria-live="polite">✕ Drive không khả dụng</span>
              <button class="btn-sync-retry" on:click={() => reloadBundleData(selectedManageQuiz.id)} disabled={bundleBusy} style="min-height:44px;min-width:44px;padding:4px 8px;font-size:0.8rem;cursor:pointer;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Thử lại</button>
            {:else}
              <span class="badge-health badge-clean">{bundleHealth.status}</span>
            {/if}
            <span class="sync-meta-item">Revision: <strong>{bundle.revision}</strong></span>
            {#if bundle.last_synced_at}
              <span class="sync-meta-item">Lần cuối: <strong>{new Date(bundle.last_synced_at).toLocaleTimeString('vi-VN')}</strong></span>
            {/if}
            {#if bundleHealth.sync_lag_seconds !== null}
              <span class="sync-meta-item">Độ trễ: <strong>{bundleHealth.sync_lag_seconds}s</strong></span>
            {/if}
          </div>
        {/if}

        <div class="bundle-grid">
          <a href={bundle.google_doc_url} target="_blank" rel="noreferrer" class="bundle-card">
            <span>W</span>
            <div>
              <strong>DOCX / Google Docs</strong>
              <small>Nguồn chuẩn · rev {bundle.revision}</small>
              {#if bundleHealth?.docs_changed}
                <span class="change-tag tag-changed">Docs có thay đổi mới</span>
              {:else}
                <span class="change-tag tag-synced">Khớp nội dung</span>
              {/if}
            </div>
          </a>
          <a href={bundle.quiz_url} class="bundle-card">
            <span>Q</span>
            <div>
              <strong>Quiz tương tác</strong>
              <small>Đồng bộ cùng nội dung</small>
              {#if bundleHealth?.quiz_changed}
                <span class="change-tag tag-changed">Quiz có thay đổi mới</span>
              {:else}
                <span class="change-tag tag-synced">Khớp nội dung</span>
              {/if}
            </div>
          </a>
          <div class="bundle-card">
            <span>H</span>
            <div>
              <strong>Bài tập D1</strong>
              <small>{bundle.homework_status === 'published' ? 'Đã giao' : 'Bản nháp · chưa thông báo'}</small>
              <span class="change-tag tag-rev">Rev {bundle.revision}</span>
            </div>
          </div>
        </div>

        {#if bundleHealth?.status === 'both_changed' || bundle.sync_status === 'conflict'}
          <div class="conflict-box" role="region" aria-live="polite">
            <strong>Phát hiện xung đột nội dung:</strong> Cả Quiz và Google Docs đều có chỉnh sửa mới kể từ lần đồng bộ trước (rev {bundle.revision}).
            <div class="conflict-choices">
              <button class="btn-conflict-resolve btn-keep-quiz" on:click={() => promptConflictResolution('keep_quiz')} disabled={bundleBusy}>
                Giữ bản Quiz (Ghi đè Docs)
              </button>
              <button class="btn-conflict-resolve btn-keep-docs" on:click={() => promptConflictResolution('keep_docs')} disabled={bundleBusy}>
                Giữ bản Google Docs (Ghi đè Quiz)
              </button>
            </div>
          </div>
        {/if}

        <div class="sync-actions">
          <button on:click={() => syncBundle('import_docs_to_quiz')} disabled={bundleBusy || bundleHealth?.drive_healthy === false}>
            Lấy Docs → Quiz
          </button>
          <button on:click={() => syncBundle('publish_quiz_to_docs')} disabled={bundleBusy || bundleHealth?.drive_healthy === false}>
            Quiz → Docs
          </button>
        </div>

        {#if bundleEvents && bundleEvents.length > 0}
          <div class="bundle-events-section">
            <h4>Lịch sử 5 sự kiện đồng bộ gần nhất</h4>
            <div class="bundle-events-list">
              {#each bundleEvents as ev (ev.id)}
                <div class="bundle-event-row">
                  <span class="event-badge event-{ev.event_type}">{ev.event_type}</span>
                  <span class="event-dir">{ev.direction || 'sync'}</span>
                  <span class="event-rev">rev {ev.from_revision ?? '-'} → {ev.to_revision ?? '-'}</span>
                  <span class="event-actor">{ev.actor_id}</span>
                  <span class="event-time">{new Date(ev.created_at).toLocaleTimeString('vi-VN')}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="homework-publish">
          <h3>Giao vào module BTVN timbk.io.vn</h3>
          <div class="homework-fields">
            <div class="homework-field-full">
              <label for="bundle-session-select" class="schedule-label">Lịch dạy phân công</label>
              {#if bundleSessions && bundleSessions.length > 0}
                <select
                  id="bundle-session-select"
                  class="session-select"
                  value={homeworkForm.session_id}
                  on:change={(e) => {
                    const selId = e.currentTarget.value;
                    const sess = bundleSessions.find(s => (s.session_id || s.id) === selId);
                    if (sess) {
                      homeworkForm.session_id = sess.session_id || sess.id;
                      homeworkForm.class_id = sess.class_id;
                      homeworkForm.class_name = sess.class_name;
                    } else {
                      homeworkForm.session_id = '';
                      homeworkForm.class_id = '';
                      homeworkForm.class_name = '';
                    }
                  }}
                  aria-label="Chọn lịch dạy phân công"
                >
                  <option value="">-- Chọn lịch dạy phân công --</option>
                  {#each bundleSessions as sess (sess.session_id || sess.id)}
                    <option value={sess.session_id || sess.id}>
                      {sess.session_date} ({sess.start_time || '??'} - {sess.end_time || '??'}) — {sess.class_name} ({sess.class_id})
                    </option>
                  {/each}
                </select>
                {#if homeworkForm.session_id}
                  <div class="selected-session-card" role="status" aria-live="polite">
                    <span class="selected-badge">Đã chọn:</span>
                    <strong class="selected-class">{homeworkForm.class_name}</strong>
                    <span class="selected-id">({homeworkForm.class_id})</span>
                  </div>
                {/if}
              {:else}
                <div class="no-sessions-notice">
                  <span>Chưa có lịch dạy phân công phù hợp trong hệ thống.</span>
                </div>
              {/if}
            </div>
            <label for="bundle-deadline-date">Hạn nộp
              <input id="bundle-deadline-date" type="date" bind:value={homeworkForm.deadline_date} aria-label="Hạn nộp" />
            </label>
            <label for="bundle-deadline-time">Giờ
              <input id="bundle-deadline-time" type="time" bind:value={homeworkForm.deadline_time} aria-label="Giờ hạn nộp" />
            </label>
          </div>
          <button
            class="btn-main full"
            on:click={() => syncBundle('publish_homework')}
            disabled={bundleBusy || !homeworkForm.session_id}
            aria-disabled={bundleBusy || !homeworkForm.session_id}
          >
            Giao bài &amp; thông báo
          </button>
        </div>
      {/if}
    </section>
  </div>
{/if}

{#if conflictModalOpen}
  <div class="modal-backdrop" role="presentation">
    <section class="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-modal-title">
      <button class="dialog-close" aria-label="Đóng" on:click={() => { conflictModalOpen = false; pendingResolution = null; }}>×</button>
      <div class="dialog-icon conflict-icon">⚠</div>
      <span class="section-kicker">GIẢI QUYẾT XUNG ĐỘT ĐỒNG BỘ</span>
      <h2 id="conflict-modal-title">
        {pendingResolution === 'keep_quiz' ? 'Xác nhận ghi đè Google Docs' : (pendingResolution === 'keep_docs' ? 'Xác nhận ghi đè Quiz' : 'Chọn phiên bản bạn muốn giữ')}
      </h2>
      <p class="conflict-desc">
        {pendingResolution === 'keep_quiz'
          ? 'Hành động này sẽ ghi đè toàn bộ nội dung Google Docs bằng câu hỏi Quiz và sinh lại bản in DOCX mới (rev ' + (bundle?.revision || 0) + ').'
          : (pendingResolution === 'keep_docs'
            ? 'Hành động này sẽ tải câu hỏi từ Google Docs về thay thế toàn bộ câu hỏi hiện tại trên Quiz (rev ' + (bundle?.revision || 0) + ').'
            : 'Cả hệ thống Quiz và tài liệu Google Docs đều có chỉnh sửa độc lập kể từ lần đồng bộ trước (revision ' + (bundle?.revision || 0) + '). Vui lòng chọn bản chuẩn:')}
      </p>
      <div class="conflict-modal-options">
        {#if !pendingResolution || pendingResolution === 'keep_quiz'}
          <div class="conflict-option-card">
            <h4>Giữ bản Quiz (Web)</h4>
            <p>Dữ liệu câu hỏi trên website sẽ ghi đè toàn bộ nội dung Google Docs và sinh lại bản in DOCX mới.</p>
            <button class="btn-conflict-action btn-keep-quiz" on:click={() => syncBundle('publish_quiz_to_docs', 'keep_quiz')} disabled={bundleBusy}>
              {pendingResolution === 'keep_quiz' ? 'Xác nhận ghi đè Docs' : 'Giữ bản Quiz (Ghi đè Docs)'}
            </button>
          </div>
        {/if}
        {#if !pendingResolution || pendingResolution === 'keep_docs'}
          <div class="conflict-option-card">
            <h4>Giữ bản Google Docs</h4>
            <p>Tải câu hỏi từ Google Docs về thay thế toàn bộ câu hỏi hiện tại trên Quiz.</p>
            <button class="btn-conflict-action btn-keep-docs" on:click={() => syncBundle('import_docs_to_quiz', 'keep_docs')} disabled={bundleBusy}>
              {pendingResolution === 'keep_docs' ? 'Xác nhận ghi đè Quiz' : 'Giữ bản Google Docs (Ghi đè Quiz)'}
            </button>
          </div>
        {/if}
      </div>
      <button class="btn-cancel-conflict" on:click={() => { conflictModalOpen = false; pendingResolution = null; }}>Hủy bỏ</button>
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
  :global(body) { background: #fdfbf7; }
  .quiz-page { max-width: 1220px; margin: 0 auto; padding: 16px 18px calc(96px + env(safe-area-inset-bottom)); color: #1c1917; overflow-x: hidden; }
  .quiz-hero { min-height: auto; display:flex; align-items:center; justify-content:space-between; padding:16px 24px; color:white; background:linear-gradient(135deg, #059669 0%, #0d9488 52%, #10b981 100%); border-radius:16px; border-bottom:4px solid #047857; overflow:hidden; position:relative; box-shadow:0 6px 18px rgba(5,150,105,.16); }
  .quiz-hero:after { content:''; position:absolute; width:200px; height:200px; right:-40px; top:-80px; border:28px solid rgba(255,255,255,.12); border-radius:50%; }
  .eyebrow,.section-kicker { font-size:.7rem; letter-spacing:.14em; font-weight:800; color:#059669; }
  .quiz-hero .eyebrow { color:#a7f3d0; }.quiz-hero h1 { color:white; font-size:clamp(1.35rem,2.6vw,1.85rem); margin:2px 0 4px; }.quiz-hero p { max-width:640px; color:#ecfdf5; font-size:.84rem; margin:0; }
  .hero-mark { width:64px; height:64px; flex:0 0 64px; display:grid; place-items:center; border:2px solid rgba(255,255,255,.35); background:rgba(255,255,255,.15); backdrop-filter:blur(8px); border-radius:16px; font-size:1.85rem; font-weight:800; transform:rotate(4deg); z-index:1; }.hero-mark span{color:#a7f3d0}
  .tabs { display:flex; gap:6px; margin:10px 0 12px; padding:5px; background:white; border:2px solid #e7e5e4; border-bottom-width:3px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,.03); }
  .tabs button { flex:1; min-height:40px; border:0; background:transparent; border-radius:8px; color:#57534e; font-weight:700; font-size:.86rem; }.tabs button span{margin-right:6px;color:#059669}.tabs button.active{background:#ecfdf5;color:#065f46;box-shadow:inset 0 0 0 1.5px #34d399}
  .file-chosen { font-size:.8rem; color:#059669; margin-top:6px; }
  .workspace { background:white; border:2px solid #e7e5e4; border-bottom-width:3px; border-radius:14px; padding:18px; box-shadow:0 3px 12px rgba(0,0,0,.03); }
  .section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }.section-heading h2{font-size:1.25rem;margin-top:2px;color:#1c1917}.draft-count,.live-dot{padding:5px 10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;color:#065f46;font-size:.78rem;font-weight:700}.live-dot i{display:inline-block;width:7px;height:7px;background:#10b981;border-radius:50%;margin-right:6px}
  .notice{padding:12px 16px;margin-bottom:16px;border-radius:7px;border:1px solid;font-weight:500}.notice.success{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.notice.error{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
  .permission-card{display:flex;gap:14px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:20px}.permission-card>span{font-size:1.4rem}.permission-card p{color:#78633c;font-size:.86rem;margin-top:3px}
  .source-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}.source-card{min-height:92px;border:1px dashed #d6d3d1;background:#fafaf9;border-radius:8px;padding:13px;text-align:left;display:grid;grid-template-columns:35px 1fr;grid-template-rows:auto auto;column-gap:9px;color:#292524}.source-card>span{grid-row:1/3;width:34px;height:34px;display:grid;place-items:center;background:white;border:1px solid #e7e5e4;border-radius:6px;color:#059669;font-size:1.1rem}.source-card small{color:#78716c}.source-card.active-source{border-style:solid;border-color:#34d399;background:#ecfdf5}.source-card:disabled{opacity:.58;cursor:not-allowed}
  .source-panel{display:grid;grid-template-columns:minmax(220px,1.4fr) 1fr auto;gap:16px;align-items:end;margin:-10px 0 24px;padding:16px;border:1px solid #a7f3d0;background:#f0fdf4;border-radius:9px}.source-panel p{font-size:.78rem;color:#065f46;margin-top:3px}
  .form-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px;padding:20px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px}.wide{grid-column:auto}.form-grid .wide:last-child{grid-column:1/-1}label{display:flex;flex-direction:column;gap:6px;font-size:.83rem;font-weight:600;color:#44403c}input,textarea,select{width:100%;border:1px solid #d6d3d1;background:white;color:#1c1917;border-radius:6px;padding:10px 12px;font:inherit;font-weight:400;min-height:44px}textarea{resize:vertical}input:focus,textarea:focus,select:focus{outline:3px solid rgba(16,185,129,.22);border-color:#059669}
  .type-picker{margin:26px 0}.type-picker h3{font-size:1rem;margin-bottom:12px;color:#1c1917}.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.type-grid button{display:flex;align-items:center;text-align:left;gap:10px;min-height:66px;padding:10px;border:1px solid #e7e5e4;background:white;border-radius:7px;color:#292524}.type-grid button:hover{border-color:#059669;background:#f0fdf4}.type-grid button>span{color:#059669;font-size:1.2rem}.type-grid small{display:block;color:#78716c;font-weight:400;margin-top:2px}
  .question-editor-list{display:flex;flex-direction:column;gap:14px}.editor-card{border:1px solid #e7e5e4;border-radius:9px;padding:18px;background:white}.editor-card header{display:flex;align-items:center;gap:10px;margin-bottom:16px}.question-number{width:34px;height:34px;display:grid;place-items:center;background:#059669;color:white;border-radius:6px;font-weight:700}.editor-card header select{width:auto;max-width:220px}.editor-actions{margin-left:auto;display:flex;gap:4px}.editor-actions button,.option-row button{width:44px;height:44px;border:1px solid #e7e5e4;background:white;border-radius:6px;font-size:1.1rem}.editor-actions button.delete{color:#dc2626}.editor-actions button:disabled{opacity:.35}.option-editor,.pair-editor{margin-top:14px}.field-label{display:block;font-size:.83rem;font-weight:600;margin-bottom:7px}.option-row{display:grid;grid-template-columns:44px 1fr 44px;gap:6px;margin-bottom:7px}.option-row input[type=radio]{width:20px;min-height:20px;align-self:center;justify-self:center;accent-color:#059669}.text-button{min-height:44px;border:0;background:transparent;color:#059669;font-weight:600}.pair-editor>div{display:grid;grid-template-columns:1fr 30px 1fr;align-items:center;gap:5px;margin-bottom:7px}.pair-editor>div span{text-align:center;color:#059669}.review-note{margin-top:12px;padding:11px 13px;background:#f5f3ff;color:#5b21b6;border-left:3px solid #8b5cf6;font-size:.85rem}.editor-bottom{display:grid;grid-template-columns:120px 1fr;gap:12px;margin-top:14px}.empty-editor,.empty-state{text-align:center;padding:48px 20px;color:#78716c}.empty-editor>span,.empty-state>span{display:block;font-size:2.2rem;color:#059669;margin-bottom:8px}.empty-editor p,.empty-state p{margin:5px auto 16px;max-width:450px}.save-bar{position:sticky;bottom:12px;margin-top:20px;display:flex;align-items:center;justify-content:flex-end;gap:10px;background:#ffffff;color:#1c1917;border:1.5px solid #e7e5e4;padding:14px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.08);z-index:5}.save-bar>div{margin-right:auto}.save-bar small{display:block;color:#78716c}.btn-main,.btn-outline,.btn-accent{border-radius:6px;min-height:44px;padding:9px 17px;font-weight:600;cursor:pointer}.btn-main{background:#059669;color:white;border:1px solid #047857}.btn-main:hover{background:#047857}.btn-main:disabled,.btn-outline:disabled,.btn-accent:disabled{opacity:.45;cursor:not-allowed}.btn-outline{background:white;color:#059669;border:1px solid #a7f3d0}.btn-outline:hover{background:#ecfdf5}.btn-accent{background:#ea580c;color:white;border:1px solid #c2410c}.btn-accent:hover{background:#c2410c}.btn-main.compact,.btn-outline.compact,.btn-accent.compact{padding:7px 13px;min-height:38px;font-size:.85rem}.btn-main.full{width:100%}
  .quiz-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.quiz-card{border:1px solid #e7e5e4;border-radius:9px;padding:18px;background:white;transition:.18s ease}.quiz-card:hover{transform:translateY(-2px);border-color:#6ee7b7;box-shadow:0 8px 20px rgba(5,150,105,.1)}.quiz-card-top,.quiz-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.quiz-card-top span{padding:3px 7px;background:#fff7ed;color:#c2410c;border-radius:4px;font-size:.72rem;font-weight:700}.quiz-card-top span.published{background:#f0fdf4;color:#15803d}.quiz-card-top b{font-size:.78rem;color:#78716c}.quiz-card h3{margin:16px 0 6px;color:#1c1917}.quiz-card p{font-size:.88rem;color:#57534e;min-height:46px}.quiz-card footer{border-top:1px solid #f5f5f4;margin-top:16px;padding-top:12px}.quiz-card footer small{color:#78716c}.quiz-card footer>div{display:flex;flex-wrap:wrap;justify-content:flex-end}.quiz-card footer button{border:0;background:transparent;color:#059669;font-weight:600;min-height:44px}.review-wrap{margin-top:22px}.take-card{padding:0;overflow:hidden}.cover{height:100px;display:grid;place-items:center;background:linear-gradient(135deg,#ecfdf5,#d1fae5);color:#065f46;font-size:1.7rem;font-weight:700}.cover-1{background:linear-gradient(135deg,#f5f3ff,#ede9fe);color:#6d28d9}.cover-2{background:linear-gradient(135deg,#dcfce7,#ecfccb);color:#15803d}.cover-3{background:linear-gradient(135deg,#fff7ed,#fef3c7);color:#c2410c}.quiz-card-body{padding:17px}.meta{display:flex;gap:7px;color:#78716c;font-size:.75rem}.start-button{width:100%;height:44px;border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;border-radius:6px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:9px;margin-top:14px}.start-button:hover{background:#d1fae5}.assign-btn{color:#7c3aed !important}.assigned-badge{display:flex;align-items:center;gap:8px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:7px;padding:8px 10px;margin-bottom:10px}.assigned-badge span{font-weight:700;color:#6d28d9;font-size:.8rem;white-space:nowrap}.assigned-badge small{color:#7c6aa8;font-size:.75rem}.loading-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.loading-grid i{height:220px;border-radius:9px;background:linear-gradient(90deg,#f5f5f4,#e7e5e4,#f5f5f4);background-size:200%;animation:shimmer 1.2s infinite}@keyframes shimmer{to{background-position:-200%}}
  .modal-backdrop{position:fixed;inset:0;z-index:90;background:rgba(28,25,23,.5);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}.start-dialog,.result-dialog,.bundle-dialog{position:relative;width:min(480px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:white;border-radius:12px;padding:30px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.25)}.bundle-dialog{width:min(760px,100%);text-align:left}.dialog-close{position:absolute;right:10px;top:10px;width:44px;height:44px;border:0;background:#f5f5f4;border-radius:6px;font-size:1.4rem;cursor:pointer}.dialog-icon,.result-burst{width:60px;height:60px;display:grid;place-items:center;margin:0 auto 12px;border-radius:12px;background:#ecfdf5;color:#059669;font-size:1.5rem}.start-dialog>p,.result-dialog>p{color:#57534e;margin:7px 0 18px}.rules{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:16px 0}.rules>div{display:grid;padding:12px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:7px}.rules>div>span{font-size:1.25rem}.rules small{color:#78716c}.identity,.guest-field{padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;margin:14px 0;text-align:left}.guest-field{background:white;border:0;padding:0}.privacy-note{display:block;color:#78716c;margin-top:10px}.bundle-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.bundle-grid>*{display:grid;grid-template-columns:40px 1fr;grid-template-rows:auto auto;column-gap:9px;padding:13px;border:1px solid #e7e5e4;border-radius:8px;color:#292524;text-decoration:none}.bundle-grid span{grid-row:1/3;width:38px;height:38px;display:grid;place-items:center;border-radius:7px;background:#ecfdf5;color:#065f46;font-weight:800}.bundle-grid small{color:#78716c}.sync-actions{display:flex;gap:8px}.sync-actions button{flex:1;min-height:44px;min-width:44px;border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;border-radius:6px;font-weight:700;cursor:pointer}.conflict-box{padding:14px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:8px;margin-bottom:12px;font-size:.88rem}.homework-publish{margin-top:18px;padding-top:18px;border-top:1px solid #e7e5e4}.homework-publish h3{margin-bottom:10px}.homework-fields{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:14px}
@media(min-width:600px){.homework-fields{grid-template-columns:2fr 1fr 1fr}}
.homework-field-full{display:flex;flex-direction:column;gap:6px}
.schedule-label{font-size:.85rem;font-weight:600;color:#292524}
.session-select{width:100%;min-height:44px;min-width:44px;padding:8px 12px;border:1.5px solid #d6d3d1;border-radius:8px;background:#fafaf9;color:#1c1917;font-size:.88rem;cursor:pointer}
.session-select:focus{border-color:#059669;outline:none;box-shadow:0 0 0 2px rgba(5,150,105,.2)}
.selected-session-card{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-size:.82rem;color:#065f46;margin-top:4px}
.selected-badge{font-weight:700;color:#059669}
.selected-class{font-weight:700;color:#065f46}
.selected-id{color:#57534e;font-size:.78rem}
.no-sessions-notice{padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-size:.82rem;color:#9a3412}
  .bundle-status-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:7px;margin:12px 0}
  .badge-health{display:inline-flex;align-items:center;padding:4px 8px;border-radius:5px;font-size:.78rem;font-weight:700}
  .badge-clean{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
  .badge-changed{background:#fff7ed;color:#9a3412;border:1px solid #fdba74}
  .badge-conflict{background:#fff1f2;color:#9f1239;border:1px solid #fecdd3}
  .badge-error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
  .sync-meta-item{font-size:.8rem;color:#57534e}
  .change-tag{font-size:.72rem;padding:2px 6px;border-radius:4px;margin-top:4px;display:inline-block}
  .tag-changed{background:#fff7ed;color:#c2410c;font-weight:600}
  .tag-synced{background:#ecfdf5;color:#047857}
  .tag-rev{background:#f5f5f4;color:#78716c}
  .conflict-choices{display:flex;gap:8px;margin-top:10px}
  .btn-conflict-resolve{flex:1;min-height:44px;min-width:44px;border-radius:6px;font-weight:700;cursor:pointer;padding:8px 12px;font-size:.85rem}
  .btn-keep-quiz{background:#059669;color:white;border:1px solid #047857}
  .btn-keep-quiz:hover{background:#047857}
  .btn-keep-docs{background:#ea580c;color:white;border:1px solid #c2410c}
  .btn-keep-docs:hover{background:#c2410c}
  .bundle-events-section{margin-top:16px;padding-top:14px;border-top:1px solid #e7e5e4}
  .bundle-events-section h4{font-size:.88rem;margin-bottom:8px;color:#1c1917}
  .bundle-events-list{display:flex;flex-direction:column;gap:6px}
  .bundle-event-row{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fafaf9;border-radius:6px;font-size:.78rem;border:1px solid #f5f5f4;flex-wrap:wrap}
  .event-badge{font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;font-size:.7rem}
  .event-started{background:#f5f5f4;color:#57534e}
  .event-succeeded{background:#ecfdf5;color:#059669}
  .event-conflict{background:#fff1f2;color:#e11d48}
  .event-failed{background:#fef2f2;color:#dc2626}
  .event-cleanup_warning{background:#fff7ed;color:#d97706}
  .event-dir{font-weight:600;color:#292524}
  .event-rev{color:#78716c}
  .event-actor{color:#57534e;background:#f5f5f4;padding:1px 5px;border-radius:3px}
  .event-time{margin-left:auto;color:#78716c;font-size:.74rem}
  .conflict-dialog{position:relative;width:min(600px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:white;border-radius:12px;padding:26px;text-align:left;box-shadow:0 24px 70px rgba(0,0,0,.25)}
  .conflict-icon{background:#fff1f2;color:#e11d48}
  .conflict-desc{color:#57534e;margin:8px 0 16px;font-size:.9rem}
  .conflict-modal-options{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .conflict-option-card{padding:14px;border:1px solid #e7e5e4;border-radius:8px;background:#fafaf9;display:flex;flex-direction:column}
  .conflict-option-card h4{font-size:.9rem;margin-bottom:6px;color:#1c1917}
  .conflict-option-card p{font-size:.8rem;color:#57534e;flex:1;margin-bottom:12px}
  .btn-conflict-action{min-height:44px;min-width:44px;border-radius:6px;font-weight:700;width:100%;cursor:pointer;padding:8px 12px}
  .btn-cancel-conflict{width:100%;min-height:44px;min-width:44px;border:1px solid #e7e5e4;background:white;border-radius:6px;color:#57534e;font-weight:600;cursor:pointer}
  .exam-shell{position:fixed;inset:0;z-index:100;background:#fdfbf7;overflow:auto;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);color:#1c1917}.exam-topbar{position:sticky;top:0;z-index:5;min-height:74px;padding:10px max(18px,env(safe-area-inset-right)) 10px max(18px,env(safe-area-inset-left));display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:white;border-bottom:1px solid #e7e5e4;box-shadow:0 2px 8px rgba(0,0,0,.04)}.exam-title{display:flex;align-items:center;gap:10px}.exam-title>span{width:43px;height:43px;display:grid;place-items:center;border-radius:7px;background:#059669;color:white;font-size:.68rem;font-weight:800}.exam-title small{display:block;color:#78716c}.countdown{text-align:center;padding:5px 18px;border-left:1px solid #e7e5e4;border-right:1px solid #e7e5e4}.countdown small{display:block;font-size:.62rem;letter-spacing:.1em;color:#78716c}.countdown strong{font-size:1.25rem;font-variant-numeric:tabular-nums}.countdown.urgent{color:#dc2626;background:#fef2f2}.abandon{justify-self:end;min-height:44px;border:1px solid #fecaca;background:white;color:#b91c1c;border-radius:6px;padding:8px 13px;font-weight:600}.abandon.armed{background:#dc2626;color:white}.progress-track{position:sticky;top:74px;z-index:6;height:4px;background:#e7e5e4}.progress-track span{display:block;height:100%;background:#10b981;transition:width .25s}.exam-content{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:190px 1fr;gap:26px;padding:28px 20px 80px}.exam-content aside{position:sticky;top:105px;align-self:start;background:white;border:1px solid #e7e5e4;border-radius:8px;padding:15px}.question-map{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}.question-map a{height:34px;display:grid;place-items:center;text-decoration:none;border:1px solid #e7e5e4;border-radius:5px;color:#78716c;font-size:.8rem}.question-map a.done{background:#ecfdf5;border-color:#a7f3d0;color:#065f46;font-weight:700}.exam-content aside p{font-size:.72rem;color:#78716c}.exam-content aside i{display:inline-block;width:7px;height:7px;background:#10b981;border-radius:50%;margin-right:5px}.exam-questions{display:flex;flex-direction:column;gap:16px}.exam-question{background:white;border:1px solid #e7e5e4;border-radius:10px;padding:24px;scroll-margin-top:100px}.exam-question.deferred{border-color:#fdba74;background:#fffbeb}.question-head{display:flex;justify-content:space-between;align-items:center;color:#059669;font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.question-head>div{display:flex;align-items:center;gap:8px}.question-head b{padding:3px 7px;background:#f5f5f4;color:#78716c;border-radius:4px}.defer-button{min-height:36px;padding:6px 10px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:6px;font-weight:700;text-transform:none}.deferred-note{padding:14px;background:white;border:1px solid #fed7aa;border-radius:7px;color:#9a3412}.exam-question h2{font-size:1.15rem;margin:12px 0 18px;line-height:1.55;color:#1c1917}.question-image{display:block;max-width:100%;max-height:320px;object-fit:contain;margin:0 auto 18px;border-radius:8px}.answer-options{display:grid;gap:9px}.answer-options label{display:grid;grid-template-columns:22px 36px 1fr;align-items:center;gap:8px;min-height:56px;padding:8px 12px;border:1px solid #e7e5e4;border-radius:7px;cursor:pointer}.answer-options label.selected{background:#ecfdf5;border-color:#34d399}.answer-options input{width:18px;min-height:18px;accent-color:#059669}.answer-options label>span{width:32px;height:32px;display:grid;place-items:center;background:#f5f5f4;border-radius:5px;color:#57534e}.answer-options label.selected>span{background:#059669;color:white}.matching-answer{display:grid;gap:9px}.matching-answer label{display:grid;grid-template-columns:1fr 32px 1fr;align-items:center;background:#fafaf9;padding:9px;border-radius:7px}.matching-answer label>span{text-align:center;color:#059669}.long-answer textarea{min-height:150px}.long-answer small{text-align:right;color:#78716c}.short-answer input{font-size:1rem}.submit-panel{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#ffffff;color:#1c1917;border:1.5px solid #a7f3d0;padding:18px 20px;border-radius:12px;box-shadow:0 8px 24px rgba(5,150,105,.1)}.submit-panel p{font-size:.8rem;color:#57534e}.submit-actions{display:flex;gap:8px}.score-ring{width:145px;height:145px;margin:20px auto;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;border:10px solid #d1fae5;box-shadow:inset 0 0 0 2px #34d399}.score-ring strong{font-size:2.4rem;color:#059669}.score-ring span{color:#78716c;font-size:.82rem}.result-stats{display:flex;justify-content:center;gap:8px;margin-bottom:18px}.result-stats span{padding:7px 10px;background:#f5f5f4;border-radius:5px;color:#57534e;font-size:.8rem}

  /* Question Bank D1 Panel Styles */
  .bank-panel{margin:-10px 0 24px;padding:20px;border:1.5px solid #a7f3d0;background:#f0fdf4;border-radius:12px}
  .bank-filters{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:end;margin-bottom:16px}
  .search-input-wrap{display:flex;gap:6px}
  .search-input-wrap input{flex:1}
  .btn-search{min-height:44px;padding:0 16px;background:#059669;color:white;border:1px solid #047857;border-radius:6px;font-weight:600;cursor:pointer}
  .bank-action-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 14px;background:white;border:1px solid #a7f3d0;border-radius:8px;margin-bottom:16px}
  .bank-stats{font-size:.88rem;color:#065f46;display:flex;align-items:center;gap:10px}
  .selection-pill{background:#ecfdf5;color:#059669;border:1px solid #6ee7b7;padding:3px 8px;border-radius:20px;font-size:.78rem;font-weight:700}
  .bank-buttons{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .quick-import-wrap{display:flex;align-items:center;gap:6px;margin-left:8px;font-size:.82rem;color:#57534e}
  .btn-quick{padding:6px 12px;min-height:44px;min-width:44px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:6px;font-weight:700;font-size:.8rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
  .btn-quick:hover{background:#ffedd5}
  .bank-loading{padding:30px;text-align:center;color:#065f46;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px}
  .spinner{width:18px;height:18px;border:2px solid #a7f3d0;border-top-color:#059669;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .bank-question-list{display:flex;flex-direction:column;gap:10px;max-height:500px;overflow-y:auto;padding-right:4px}
  .bank-q-card{display:block;padding:14px;background:white;border:1.5px solid #e7e5e4;border-radius:8px;cursor:pointer;transition:.15s ease}
  .bank-q-card:hover{border-color:#6ee7b7;background:#fafffa}
  .bank-q-card:focus-within{border-color:#059669;box-shadow:0 0 0 2px rgba(5,150,105,0.25)}
  .bank-q-card.selected{border-color:#059669;background:#ecfdf5;box-shadow:inset 0 0 0 1px #059669}
  .bank-q-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .q-checkbox-wrapper{display:flex;align-items:center;gap:10px}
  .q-checkbox{width:20px;height:20px;min-width:20px;min-height:20px;accent-color:#059669;cursor:pointer}
  .q-checkbox:focus-visible{outline:2px solid #059669;outline-offset:2px}
  .q-badge{font-weight:700;font-size:.8rem;color:#059669}
  .bank-tags{display:flex;flex-wrap:wrap;gap:6px}
  .tag{padding:2px 8px;border-radius:4px;font-size:.72rem;font-weight:600}
  .tag.grade{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
  .tag.skill{background:#fdf2f8;color:#be185d;border:1px solid #fbcfe8}
  .tag.cognitive{background:#fef3c7;color:#b45309;border:1px solid #fde68a}
  .tag.topic{background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe}
  .bank-q-prompt{font-size:.92rem;font-weight:500;line-height:1.45;color:#1c1917;margin-bottom:8px}
  .bank-q-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;margin-top:6px}
  .bank-q-option{padding:6px 10px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:6px;font-size:.82rem;color:#44403c}
  .bank-pagination{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:14px;padding:10px 14px;background:white;border:1px solid #a7f3d0;border-radius:8px}
  .bank-page-info{font-size:.84rem;color:#065f46;font-weight:600}
  .bank-page-nav{display:flex;align-items:center;gap:8px}
  .btn-page{min-height:44px;min-width:44px;padding:0 14px;background:#fdfbf7;border:1px solid #d6d3d1;border-radius:6px;font-size:.84rem;font-weight:600;color:#1c1917;cursor:pointer}
  .btn-page:hover:not(:disabled){background:#f5f5f4;border-color:#059669}
  .btn-page:disabled{opacity:.4;cursor:not-allowed}
  .bank-end-note{font-size:.82rem;color:#059669;font-weight:600;margin-left:6px}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}

  /* Auto Builder & Mode Switcher Styles */
  .builder-mode-switcher{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;padding:6px;background:#f5f5f4;border:1px solid #e7e5e4;border-radius:12px}
  .mode-btn{display:flex;align-items:center;gap:12px;padding:12px 18px;border:1px solid transparent;background:transparent;border-radius:9px;color:#57534e;cursor:pointer;text-align:left;transition:all .18s ease;min-height:56px}
  .mode-btn:hover{background:white;color:#1c1917}
  .mode-btn.active{background:white;border-color:#a7f3d0;color:#065f46;box-shadow:0 4px 14px rgba(5,150,105,.1)}
  .mode-icon{font-size:1.4rem;display:grid;place-items:center;width:38px;height:38px;border-radius:8px;background:#f5f5f4;color:#059669;flex-shrink:0}
  .mode-btn.active .mode-icon{background:#ecfdf5}
  .mode-btn strong{display:block;font-size:.95rem;color:#1c1917}
  .mode-btn small{display:block;font-size:.78rem;color:#78716c;margin-top:2px}
  .mode-warning-banner{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:14px 18px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;margin-bottom:20px}
  .warning-text strong{color:#92400e;display:block;margin-bottom:2px}
  .warning-text p{margin:0;font-size:.85rem;color:#78350f}
  .warning-actions{display:flex;gap:8px}
  .auto-builder-shell,.manual-builder-shell{display:flex;flex-direction:column;gap:20px}
  .section-label{font-size:.88rem;font-weight:700;color:#292524;display:block;margin-bottom:10px}
  .type-mix-section{background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;padding:18px}
  .type-mix-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px}
  .allocation-pill{background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;padding:4px 10px;border-radius:20px;font-size:.82rem;font-weight:600}
  .type-mix-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
  .type-mix-card{border:1px solid #e7e5e4;border-radius:8px;padding:12px;background:white;display:flex;flex-direction:column;justify-content:space-between;gap:8px;transition:border-color .15s ease}
  .type-mix-card.active{border-color:#34d399;background:#fafffa;box-shadow:inset 0 0 0 1px #a7f3d0}
  .type-card-head{display:flex;align-items:center;justify-content:space-between;gap:6px}
  .type-toggle-label{display:flex;align-items:center;gap:8px;cursor:pointer;flex:1}
  .type-toggle-label input{width:18px;height:18px;min-height:18px;accent-color:#059669;cursor:pointer}
  .type-name{font-size:.86rem;color:#1c1917}
  .type-icon{font-size:1.1rem;color:#059669}
  .type-desc{font-size:.76rem;color:#78716c;margin:0;line-height:1.35}
  .type-stepper{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px solid #f5f5f4}
  .btn-step{width:34px;height:34px;min-height:34px;border:1px solid #d6d3d1;background:#fafaf9;border-radius:6px;font-weight:700;font-size:1.1rem;color:#1c1917;cursor:pointer;display:grid;place-items:center}
  .btn-step:hover:not(:disabled){background:#ecfdf5;border-color:#059669;color:#059669}
  .btn-step:disabled{opacity:.35;cursor:not-allowed}
  .step-value{font-size:.84rem;font-weight:700;color:#059669}
  .auto-source-box{display:flex;flex-direction:column;gap:12px}
  .box-title{font-size:.9rem;font-weight:700;color:#065f46}
  .upload-options{display:flex;flex-direction:column;gap:12px}
  .file-label{font-size:.84rem;font-weight:600;color:#44403c}
  .auto-action-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px}
  .btn-generate{font-size:1rem;font-weight:700;padding:12px 24px}
  .tf-choices{display:flex;gap:20px;padding:8px 0}
  .merge-strategy-section{background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:12px}
  .merge-options-group{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .merge-option{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1.5px solid #e7e5e4;border-radius:8px;background:white;cursor:pointer;transition:border-color .15s ease}
  .merge-option input{margin-top:3px;accent-color:#059669}
  .merge-option.active{border-color:#059669;background:#fafffa}
  .merge-text strong{display:block;font-size:.9rem;color:#1c1917}
  .merge-text small{display:block;font-size:.78rem;color:#78716c;margin-top:2px}
  .replace-warning-banner{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;color:#92400e;font-size:.85rem}
  .warning-icon{font-size:1.2rem}
  .generation-report-banner{background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:10px;padding:14px 18px;display:flex;flex-direction:column;gap:10px}
  .generation-report-banner.degraded{background:#fffbeb;border-color:#fde68a}
  .report-header{display:flex;align-items:flex-start;gap:10px}
  .report-icon{font-size:1.2rem}
  .report-header strong{font-size:.92rem;color:#1c1917;display:block}
  .report-header p{margin:2px 0 0;font-size:.84rem;color:#44403c}
  .report-header small{display:block;font-size:.78rem;color:#78716c;margin-top:3px}
  .report-breakdown{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding-top:8px;border-top:1px dashed #d6d3d1;font-size:.82rem;color:#57534e}
  .count-badge{background:white;border:1px solid #d6d3d1;padding:2px 8px;border-radius:12px;font-size:.78rem;font-weight:600;color:#292524}
  .kv-panel{display:flex;flex-direction:column;gap:12px}
  .kv-search-bar{display:flex;gap:8px}
  .kv-search-bar input{flex:1;min-height:40px;padding:0 12px;border:1px solid #d6d3d1;border-radius:6px;font-size:.88rem}
  .kv-article-list{display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding-right:4px}
  .kv-article-card{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border:1px solid #e7e5e4;border-radius:8px;background:white;cursor:pointer;transition:border-color .15s ease}
  .kv-article-card:hover{border-color:#a8a29e}
  .kv-article-card.selected{border-color:#059669;background:#fafffa}
  .kv-article-card input{margin-top:4px;accent-color:#059669}
  .kv-article-info{flex:1;min-width:0}
  .kv-article-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .kv-article-title strong{font-size:.9rem;color:#1c1917}
  .kv-article-preview{font-size:.78rem;color:#78716c;margin:3px 0 0;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .image-labels-panel{margin-top:14px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px}
  .image-labels-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .image-labels-title{font-size:.88rem;font-weight:700;color:#1c1917}
  .badge-req{font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:9999px;background:#fef3c7;color:#92400e;border:1px solid #fde68a}
  .badge-opt{font-size:.75rem;font-weight:500;padding:2px 8px;border-radius:9999px;background:#e7e5e4;color:#44403c}
  .image-labels-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
  .image-label-card{display:flex;gap:10px;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px;align-items:flex-start}
  .image-thumb-wrap{position:relative;width:72px;height:72px;flex-shrink:0;border-radius:6px;overflow:hidden;border:1px solid #e7e5e4;background:#f5f5f4}
  .image-thumb{width:100%;height:100%;object-fit:cover}
  .image-page-badge{position:absolute;top:2px;left:2px;background:rgba(28,25,23,0.8);color:#fff;font-size:.65rem;font-weight:700;padding:1px 4px;border-radius:3px}
  .image-info-wrap{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
  .image-filename{font-size:.78rem;font-weight:600;color:#44403c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
  .image-input-wrap{display:flex;flex-direction:column;gap:2px}
  .image-input-title{font-size:.72rem;color:#78716c;font-weight:500}
  .image-label-input{width:100%;min-height:44px;padding:8px 10px;border:1px solid #d6d3d1;border-radius:6px;font-size:.88rem;color:#1c1917;box-sizing:border-box}
  .image-label-input:focus{outline:none;border-color:#059669;box-shadow:0 0 0 2px rgba(5,150,105,0.15)}

  /* Auto Builder Round 10 Styles */
  .field-title-wrap{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px}
  .field-optional-hint{font-size:.78rem;font-weight:400;color:#78716c}
  .format-presets-bar{margin-top:12px;padding:12px 14px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
  .format-presets-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .presets-label{font-size:.82rem;font-weight:700;color:#1c1917}
  .format-presets-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:8px}
  .preset-chip-btn{min-height:44px;padding:8px 12px;border:1.5px solid #e7e5e4;background:#ffffff;color:#1c1917;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;text-align:left;transition:all .15s ease;box-sizing:border-box}
  .preset-chip-btn:hover{border-color:#34d399;background:#ecfdf5}
  .preset-chip-btn.active{border-color:#059669;background:#ecfdf5;box-shadow:0 0 0 2px rgba(5,150,105,.12)}
  .preset-icon{font-size:1.15rem;flex-shrink:0}
  .preset-text{display:flex;flex-direction:column;gap:2px;min-width:0}
  .preset-text strong{font-size:.82rem;color:#065f46;line-height:1.2}
  .preset-text small{font-size:.72rem;color:#57534e;line-height:1.25}
  .bank-mode-notice-box{padding:10px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:.82rem;color:#065f46;line-height:1.45}
  .config-summary-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 16px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;margin-top:12px;box-sizing:border-box}
  .summary-chips{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
  .summary-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;background:white;border:1px solid #e7e5e4;border-radius:20px;font-size:.8rem;color:#292524}
  .types-chip{max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .btn-toggle-advanced{min-height:44px;padding:8px 16px;border:1px solid #a7f3d0;background:white;color:#065f46;border-radius:8px;font-size:.84rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:all .15s ease}
  .btn-toggle-advanced:hover{background:#ecfdf5;border-color:#34d399}
  .btn-toggle-advanced:focus-visible{outline:3px solid rgba(16,185,129,.35);outline-offset:2px}
  .toggle-icon{font-size:1rem}
  .advanced-config-panel{margin-top:12px}
  .advanced-config-panel.is-collapsed{display:none}
  .advanced-inner{display:flex;flex-direction:column;gap:16px;padding:16px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;box-sizing:border-box}
  .type-mix-hint{font-size:.76rem;color:#78716c;margin:2px 0 0}
  .advanced-footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #e7e5e4}
  .save-defaults-note{color:#78716c;font-size:.78rem}
  .btn-save-defaults{min-height:44px}
  .image-ocr-info-banner{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:.82rem;color:#166534}
  .image-pg-info-banner{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:6px;font-size:.82rem;color:#92400e}
  .preview-mode-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px}
  .preview-mode-desc{margin:4px 0 0;font-size:.84rem;color:#57534e}
  .preview-mode-actions{display:flex;gap:8px}
  .btn-toggle-view{min-height:44px;padding:8px 16px;font-weight:600}
  .question-review-list{display:flex;flex-direction:column;gap:16px}
  .review-card{border:1px solid #e7e5e4;border-radius:10px;padding:20px;background:white;box-shadow:0 1px 4px rgba(0,0,0,.03);display:flex;flex-direction:column;gap:14px;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box}
  .review-card-header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid #f5f5f4}
  .review-meta-left{display:flex;align-items:center;gap:10px}
  .review-type-badge{padding:3px 9px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:6px;font-size:.78rem;font-weight:700}
  .review-points-badge{padding:3px 8px;background:#f5f5f4;color:#57534e;border-radius:6px;font-size:.78rem;font-weight:600}
  .review-image-wrap{max-width:240px;max-height:180px;border-radius:8px;overflow:hidden;border:1px solid #e7e5e4;margin:4px 0}
  .review-image-thumb{width:100%;height:100%;object-fit:contain}
  .review-prompt-text{font-size:1rem;font-weight:600;color:#1c1917;margin:0;line-height:1.5}
  .review-options-list{display:flex;flex-direction:column;gap:8px}
  .review-option-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid #e7e5e4;border-radius:8px;background:#fafaf9;font-size:.88rem;color:#1c1917;box-sizing:border-box}
  .review-option-item.is-correct{border-color:#34d399;background:#ecfdf5;color:#065f46;font-weight:600}
  .review-opt-letter{font-weight:700;color:#78716c}
  .review-option-item.is-correct .review-opt-letter{color:#065f46}
  .review-correct-badge{margin-left:auto;padding:2px 8px;background:#059669;color:white;border-radius:4px;font-size:.72rem;font-weight:700;flex-shrink:0}
  .review-tf-options{display:flex;gap:12px}
  .review-tf-item{display:flex;align-items:center;gap:8px;padding:10px 18px;border:1px solid #e7e5e4;border-radius:8px;background:#fafaf9;font-weight:600;box-sizing:border-box}
  .review-tf-item.is-correct{border-color:#34d399;background:#ecfdf5;color:#065f46}
  .review-pairs-list,.review-ordering-list,.review-text-answer{display:flex;flex-direction:column;gap:6px}
  .review-field-title{font-size:.8rem;font-weight:600;color:#78716c}
  .review-pair-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:6px;font-size:.88rem;box-sizing:border-box}
  .review-pair-left{color:#1c1917}
  .review-pair-arrow{color:#059669;font-weight:700}
  .review-pair-right{color:#065f46;font-weight:600}
  .review-order-ol{margin:0;padding-left:20px;font-size:.88rem;display:flex;flex-direction:column;gap:4px}
  .review-text-answer{padding:10px 14px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;box-sizing:border-box}
  .review-correct-value{font-size:.95rem;color:#065f46}
  .review-explanation{padding:10px 12px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:6px;font-size:.82rem;color:#92400e;display:flex;gap:8px;box-sizing:border-box}
  .readiness-alert-card{display:flex;gap:18px;padding:24px;background:#fff1f2;border:1.5px solid #fecdd3;border-radius:12px;margin:20px 0;box-shadow:0 4px 16px rgba(225,29,72,.06)}
  .readiness-alert-card .alert-icon{font-size:2.2rem;line-height:1;flex-shrink:0}
  .readiness-alert-card .alert-body{flex:1;min-width:0}
  .readiness-alert-card h3{font-size:1.15rem;font-weight:700;color:#9f1239;margin:0 0 6px}
  .readiness-alert-card .alert-desc{font-size:.88rem;color:#881337;margin-bottom:12px;line-height:1.5}
  .readiness-alert-card .alert-detail{font-size:.82rem;color:#4c0519;margin:6px 0}
  .readiness-alert-card .alert-detail code{background:#ffe4e6;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:.8rem}
  .remediation-box{margin:14px 0;padding:12px 14px;background:#fffdfa;border:1px solid #fecdd3;border-radius:8px}
  .remediation-title{display:block;font-size:.78rem;font-weight:700;color:#be123c;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
  .code-copy-row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fafaf9;border:1px solid #e7e5e4;padding:8px 12px;border-radius:6px}
  .code-copy-row code{color:#be123c;font-family:monospace;font-size:.82rem;word-break:break-all;font-weight:600}
  .btn-copy{background:#059669;color:#ffffff;border:0;border-radius:5px;padding:6px 12px;font-size:.75rem;font-weight:600;cursor:pointer;flex-shrink:0;transition:background .15s}
  .btn-copy:hover{background:#047857}
  .alert-actions{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}

  .readiness-guest-card{text-align:center;padding:48px 24px;background:#fffdfa;border:1.5px dashed #fed7aa;border-radius:12px;margin:20px 0}
  .readiness-guest-card .maintenance-icon{font-size:2.5rem;margin-bottom:10px}
  .readiness-guest-card h3{font-size:1.2rem;font-weight:700;color:#9a3412;margin-bottom:8px}
  .readiness-guest-card p{color:#78716c;font-size:.9rem;max-width:480px;margin:0 auto 16px;line-height:1.5}

  .readiness-banner{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:#fffdfa;border:1px solid #fed7aa;border-radius:8px;margin-bottom:20px}
  .readiness-banner .warning-icon{font-size:1.25rem;flex-shrink:0;line-height:1.2}
  .readiness-banner .banner-body{flex:1;min-width:0}
  .readiness-banner strong{font-size:.85rem;color:#9a3412;display:block}
  .readiness-banner p{font-size:.8rem;color:#c2410c;margin:2px 0 0}
  .readiness-banner code{background:#ffedd5;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:.78rem;color:#9a3412}
  .btn-copy-small{background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;padding:4px 8px;border-radius:5px;font-size:.75rem;font-weight:600;cursor:pointer;flex-shrink:0}
  .btn-copy-small:hover{background:#d1fae5}

  /* Grouped Business Domain Hub & Studio 2-Column Split-View Architecture (Duolingo Tactile Density 8/10) */
  .quiz-domain-hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin:10px 0 8px}
  .domain-group-card{background:#ffffff;border:2px solid #e7e5e4;border-bottom-width:3px;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 6px rgba(0,0,0,.02)}
  .domain-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:6px;border-bottom:1px dashed #e7e5e4}
  .domain-group-kicker{font-size:.66rem;font-weight:800;letter-spacing:.08em;color:#047857;text-transform:uppercase}
  .domain-group-badge{font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:999px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
  .domain-group-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:6px}
  .domain-action-pill{text-align:left;padding:7px 10px;border-radius:10px;border:1.5px solid #e7e5e4;border-bottom-width:2.5px;background:#fafaf9;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all .15s ease;min-height:42px}
  .domain-action-pill:hover{border-color:#34d399;background:#ecfdf5}
  .domain-action-pill.active{border-color:#047857;background:#ecfdf5;box-shadow:inset 0 0 0 1px #059669}
  .domain-action-pill .pill-icon{font-size:1rem;line-height:1.1;color:#059669;flex-shrink:0}
  .domain-action-pill strong{display:block;font-size:.78rem;color:#1c1917;line-height:1.2}
  .domain-action-pill small{display:block;font-size:.68rem;color:#57534e;margin-top:1px;line-height:1.2}

  .studio-split-grid{display:grid;grid-template-columns:1fr;gap:18px;align-items:start}
  @media(min-width:1024px){
    .studio-split-grid{grid-template-columns:minmax(0,1.12fr) minmax(370px,.95fr)}
    .studio-preview-col{position:sticky;top:16px;max-height:calc(100dvh - 110px);display:flex;flex-direction:column;gap:12px}
    .studio-preview-col .generated-preview-section{display:flex;flex-direction:column;max-height:calc(100dvh - 130px);overflow:hidden}
    .studio-preview-col .question-review-list,.studio-preview-col .question-editor-list{overflow-y:auto;padding-right:6px;flex:1;max-height:calc(100dvh - 290px)}
    .studio-preview-col .save-bar{position:static;margin-top:12px;flex-shrink:0}
  }
  .studio-config-col{display:flex;flex-direction:column;gap:14px;min-width:0}
  .studio-step-card{background:#ffffff;border:2px solid #e7e5e4;border-bottom-width:3px;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 6px rgba(0,0,0,.02)}
  .studio-step-card .source-grid{margin-bottom:2px}
  .studio-step-card .source-panel,.studio-step-card .bank-panel,.studio-step-card .kv-panel{margin:0}
  .studio-preview-col{min-width:0}
  .generated-preview-section{background:#fafaf9;border:2px solid #a7f3d0;border-bottom-width:3px;border-radius:14px;padding:16px;box-shadow:0 6px 18px rgba(5,150,105,.06)}
  .studio-empty-preview{background:#fafaf9;border:2px dashed #a7f3d0;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px}
  .empty-preview-head h3{font-size:1.1rem;color:#1c1917;margin:4px 0 6px}
  .empty-preview-head p{font-size:.82rem;color:#57534e;line-height:1.45;margin:0}
  .blueprint-summary-card{background:#ffffff;border:1.5px solid #e7e5e4;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
  .blueprint-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:.81rem;padding-bottom:6px;border-bottom:1px dashed #f5f5f4}
  .blueprint-row:last-child{padding-bottom:0;border-bottom:0}
  .blueprint-row span{color:#57534e;font-weight:600;flex-shrink:0}
  .blueprint-row strong{color:#065f46;text-align:right}
  .empty-preview-cta{padding-top:2px}

  /* Vietnamese Source Grouping & Clean Exam Player Styles */
  .source-panel.auto-source-box{display:flex;flex-direction:column;align-items:stretch;gap:12px}
  .source-group-pills,.catalog-filter-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}
  .source-pill,.source-group-pill{padding:6px 12px;border:1.5px solid #e7e5e4;border-bottom-width:2.5px;background:#fafaf9;color:#44403c;border-radius:999px;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s ease;line-height:1.2;display:inline-flex;align-items:center;gap:5px}
  .source-pill:hover,.source-group-pill:hover{border-color:#34d399;background:#ecfdf5;color:#065f46}
  .source-pill.active,.source-group-pill.active{border-color:#047857;background:#059669;color:#ffffff;box-shadow:0 2px 6px rgba(5,150,105,.18)}
  .drive-controls-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .drive-toolbar-row{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
  .drive-search-label{flex:1;min-width:220px}
  .grouped-source-list{display:flex;flex-direction:column;gap:10px;max-height:280px;overflow-y:auto;padding-right:4px}
  .source-group-block{background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}
  .source-group-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:6px;border-bottom:1px dashed #d6d3d1}
  .source-group-header strong{font-size:.86rem;color:#1c1917}
  .source-group-header span{font-size:.75rem;font-weight:700;padding:2px 8px;background:#ecfdf5;color:#065f46;border-radius:999px;border:1px solid #a7f3d0}
  .drive-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
  .drive-file-card,.drive-doc-card{display:flex;flex-direction:row;align-items:flex-start;gap:10px;padding:10px 12px;background:#ffffff;border:1.5px solid #e7e5e4;border-radius:8px;text-align:left;cursor:pointer;transition:all .15s ease}
  .drive-file-card:hover,.drive-doc-card:hover{border-color:#34d399;background:#f0fdf4}
  .drive-file-card.selected,.drive-doc-card.selected{border-color:#059669;background:#ecfdf5;box-shadow:0 0 0 2px rgba(5,150,105,.14)}
  .drive-doc-card input[type=radio],.kv-article-card input[type=radio]{width:18px;height:18px;min-height:18px;margin-top:2px;flex-shrink:0;accent-color:#059669;padding:0}
  .kv-article-card{flex-direction:row;align-items:flex-start}
  .kv-article-info{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
  .kv-article-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .kv-article-title strong{font-size:.86rem;color:#1c1917}
  .kv-article-preview{font-size:.78rem;color:#57534e;margin:0;line-height:1.4}
  .drive-card-icon{font-size:1.25rem;line-height:1;flex-shrink:0;margin-top:2px}
  .drive-card-body,.drive-doc-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
  .drive-card-body strong,.drive-doc-body strong{font-size:.83rem;color:#1c1917;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .drive-card-body small,.drive-doc-body small{font-size:.72rem;color:#78716c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .drive-selected-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:.84rem;color:#065f46}
  .kv-group-items{display:flex;flex-direction:column;gap:8px}
  .question-head-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .exam-q-type-badge{padding:3px 9px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:999px;font-size:.74rem;font-weight:700}
  .exam-question h2{white-space:pre-line;line-height:1.55}
  .ordering-sentence-box{padding:12px 14px;background:#fafaf9;border:1.5px dashed #d6d3d1;border-radius:8px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px}
  .ordering-box-label{font-size:.78rem;font-weight:600;color:#57534e}
  .ordering-picked-row,.ordering-pool-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .ordering-empty-hint{font-size:.82rem;color:#78716c;font-style:italic}
  .word-chip{padding:7px 12px;border:1.5px solid #d6d3d1;background:#ffffff;color:#1c1917;border-radius:8px;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .15s ease}
  .word-chip:hover{border-color:#059669;background:#ecfdf5;color:#065f46}
  .word-chip.picked{border-color:#059669;background:#059669;color:#ffffff}
  .word-chip.picked span{margin-left:4px;opacity:.85}
  .word-chip-reset{padding:6px 10px;border:1px solid #fecdd3;background:#fff1f2;color:#be123c;border-radius:6px;font-size:.76rem;font-weight:600;cursor:pointer}

  @media(max-width:800px){.quiz-page{padding:16px 12px 90px}.quiz-hero{padding:26px 22px;min-height:160px}.hero-mark{width:70px;height:70px;flex-basis:70px;font-size:2rem}.workspace{padding:18px}.source-grid,.type-grid,.quiz-grid,.loading-grid{grid-template-columns:1fr 1fr}.bank-filters{grid-template-columns:1fr 1fr}.source-panel{grid-template-columns:1fr}.drive-controls-grid{grid-template-columns:1fr}.bundle-grid,.homework-fields{grid-template-columns:1fr 1fr}.builder-mode-switcher{grid-template-columns:1fr}.type-mix-grid{grid-template-columns:1fr 1fr}.merge-options-group{grid-template-columns:1fr}.exam-content{grid-template-columns:1fr;padding:18px 12px 70px}.exam-content aside{position:static}.question-map{grid-template-columns:repeat(8,1fr)}.exam-topbar{grid-template-columns:1fr auto}.abandon{grid-column:1/-1;width:100%;margin-top:6px}.progress-track{top:124px}.exam-question{scroll-margin-top:135px}}
  @media(max-width:560px){.quiz-hero{align-items:flex-end}.hero-mark{position:absolute;right:18px;top:18px;opacity:.38}.quiz-hero p{padding-right:20px}.tabs{gap:3px}.tabs button{font-size:.75rem;padding:5px}.tabs button span{display:block;margin:0;font-size:1rem}.source-grid,.type-grid,.quiz-grid,.loading-grid,.form-grid,.bundle-grid,.homework-fields,.bank-filters,.conflict-modal-options{grid-template-columns:1fr}.conflict-choices{flex-direction:column}.type-mix-grid{grid-template-columns:1fr}.image-labels-grid{grid-template-columns:1fr}.auto-action-bar{flex-direction:column;align-items:stretch}.auto-action-bar button{width:100%}.form-grid .wide{grid-column:1}.source-card{min-height:78px}.type-grid button{min-height:58px}.editor-card{padding:13px}.editor-card header{flex-wrap:wrap}.editor-card header select{order:3;width:100%;max-width:none}.editor-actions{margin-left:auto}.editor-bottom{grid-template-columns:90px 1fr}.save-bar{flex-wrap:wrap;bottom:8px}.save-bar>div{width:100%}.save-bar button{flex:1}.section-heading{align-items:flex-start}.question-map{grid-template-columns:repeat(6,1fr)}.exam-topbar{padding:8px 10px}.exam-title>span{display:none}.exam-title strong{display:block;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.countdown{padding:4px 10px}.exam-question{padding:17px}.question-head{align-items:flex-start}.question-head>div{flex-direction:column-reverse;align-items:flex-end}.matching-answer label{grid-template-columns:1fr}.matching-answer label>span{transform:rotate(90deg)}.submit-panel{align-items:stretch;flex-direction:column}.submit-actions{flex-direction:column}.start-dialog,.result-dialog,.bundle-dialog,.conflict-dialog{padding:25px 18px}.modal-backdrop{padding:10px}.rules{grid-template-columns:1fr 1fr}.bank-action-bar{flex-direction:column;align-items:stretch}.bank-buttons{flex-direction:column}.bank-buttons button{width:100%}.quick-import-wrap{width:100%;justify-content:space-between;margin-left:0}.config-summary-bar{flex-direction:column;align-items:stretch}.btn-toggle-advanced{width:100%;justify-content:center}.preview-mode-header{flex-direction:column;align-items:stretch}.btn-toggle-view{width:100%;justify-content:center}.review-card{padding:14px}.review-option-item{flex-wrap:wrap}.review-tf-options{flex-direction:column}.drive-card-grid{grid-template-columns:1fr}}
  @media(max-width:1024px){.save-bar{bottom:calc(84px + env(safe-area-inset-bottom))}}
  @media(max-width:640px){.source-grid,.type-grid,.quiz-grid,.loading-grid{grid-template-columns:1fr}.quiz-page{padding-left:12px;padding-right:12px}}
  @media(max-width:390px){.hero-mark{display:none}.modal-backdrop{padding:0}.start-dialog,.result-dialog,.bundle-dialog,.conflict-dialog{width:100%;max-height:100dvh;border-radius:0;padding:22px 14px}.exam-topbar{grid-template-columns:1fr auto}.quiz-page{overflow-x:hidden}.bank-q-options{grid-template-columns:1fr}.image-labels-grid{grid-template-columns:1fr}.types-chip{max-width:200px}.review-meta-left{flex-wrap:wrap}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
</style>
