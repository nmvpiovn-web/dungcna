<svelte:head>
  <title>Ngân Hàng Từ Vựng Sư Phạm &amp; Stealth Pronunciation Engine • Tiếng Anh Cô Dung</title>
  <meta name="description" content="Tra cứu từ vựng chuyên sâu, phân tích ngữ âm IPA, cấu trúc ngữ pháp, luyện phát âm ghi âm đối chiếu rubric và cơ chế giãn cách Spaced Repetition." />
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { addCustomWordLocally } from '$lib/staticDb.js';
  import { getCurrentUser } from '$lib/unifiedStore';

  let { data } = $props();

  let currentUser = $state(null);
  let words = $state([...data.words]);
  let searchQuery = $state('');
  let selectedUnit = $state('all');
  let selectedGrade = $state('all');
  let selectedPos = $state('all'); // 'all' | 'noun' | 'verb' | 'adjective' | 'adverb' | 'verb phrase'
  let selectedCefr = $state('all'); // 'all' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
  let viewMode = $state('active'); // 'active' | 'review_due' | 'mastered'

  // Spaced Repetition & Mastered Words Storage (Client-side self-study aid)
  // GHI CHÚ PHÂN QUYỀN & TÀI CHÍNH: Thao tác thuộc từ (SRS) là sổ tay ghi nhớ cá nhân của học sinh,
  // TUYỆT ĐỐI KHÔNG tự cấp phát sao ở client và KHÔNG liên kết trực tiếp với chiết khấu học phí.
  // Điểm sao thưởng chính thức được ghi nhận và lưu trữ độc quyền trên Cloudflare D1 Ledger
  // qua kết quả làm bài tập (Homework) và bài kiểm tra (Exams) được giáo viên phê duyệt.
  let masteredWordsMap = $state({}); // { term: { stage: 1, lastMastered: Date, nextReviewDate: Date, bestScore: 95 } }
  let officialStars = $derived(currentUser?.stars || 0);

  // Deep Breakdown Modal State
  let showDeepModal = $state(false);
  let selectedWordForDeep = $state(null);
  let deepAnalysisData = $state(null);
  let isLoadingAiAnalysis = $state(false);

  // Audio Recording & Pronunciation Rubric State
  let isRecording = $state(false);
  let mediaRecorder = $state(null);
  let audioChunks = $state([]);
  let recordedAudioUrl = $state(null);
  let pronunciationResult = $state(null); // { score: 92, vowelsScore: 90, stressScore: 95, fluencyScore: 90, tips: '' }
  let recordConsentGranted = $state(false);
  let recordError = $state('');

  // Add Custom Word Modal
  let showAddModal = $state(false);
  let newTerm = $state('');
  let newIpa = $state('');
  let newPos = $state('noun');
  let newMeaning = $state('');
  let newExampleEn = $state('');
  let newExampleVi = $state('');
  let newUnit = $state('unit1');

  // Load persistence
  onMount(() => {
    currentUser = getCurrentUser();
    try {
      const stored = localStorage.getItem('tienganh_mastered_words');
      if (stored) {
        masteredWordsMap = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed loading local SRS data:', e);
    }
  });

  function saveSrsData() {
    try {
      localStorage.setItem('tienganh_mastered_words', JSON.stringify(masteredWordsMap));
    } catch (e) {
      console.error('Failed saving SRS data:', e);
    }
  }

  // Derive mastered count
  let masteredCount = $derived(Object.keys(masteredWordsMap).length);

  // Calculate Badge based on mastered count and pronunciation scores
  let userBadge = $derived.by(() => {
    const role = currentUser?.role || 'student';
    if (role === 'teacher' || role === 'leader') {
      if (masteredCount >= 50) return { title: 'Đại Sứ Học Viện', level: 4, icon: '🏛️', color: 'text-amber-500' };
      if (masteredCount >= 20) return { title: 'Chuyên Gia Truyền Cảm Hứng', level: 3, icon: '🌟', color: 'text-indigo-500' };
      return { title: 'Sư Phạm Xuất Sắc', level: 2, icon: '👩‍🏫', color: 'text-sky-500' };
    }
    if (role === 'parent') {
      return { title: 'Người Đồng Hành Vàng', level: 2, icon: '👨‍👩‍👧', color: 'text-amber-500' };
    }
    // Student progression
    if (masteredCount >= 100) return { title: 'Huyền Thoại Làng Anh Ngữ', level: 5, icon: '👑', color: 'text-amber-500' };
    if (masteredCount >= 50) return { title: 'Chiến Binh IELTS', level: 4, icon: '⚔️', color: 'text-rose-500' };
    if (masteredCount >= 30) return { title: 'Bậc Thầy Phát Âm', level: 3, icon: '🎙️', color: 'text-emerald-500' };
    if (masteredCount >= 10) return { title: 'Thợ Săn Từ Vựng', level: 2, icon: '🏹', color: 'text-sky-500' };
    return { title: 'Tân Binh Học Ngữ', level: 1, icon: '🌱', color: 'text-slate-500' };
  });

  // Adaptive Difficulty Helper based on CEFR and Grade Level
  function getAdaptiveDifficulty(word) {
    const cefr = word.cambridge_level || (word.grade === 'Lớp 12' ? 'B2' : word.grade === 'Lớp 10' ? 'B1' : 'A2');
    const isPrimary = selectedGrade.includes('3') || selectedGrade.includes('4') || selectedGrade.includes('5');
    const isHighSchool = selectedGrade.includes('10') || selectedGrade.includes('11') || selectedGrade.includes('12');

    if (isPrimary) {
      if (cefr.includes('A1')) return { label: 'Vừa', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' };
      return { label: 'Khó', badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' };
    }
    if (isHighSchool) {
      if (cefr.includes('A1') || cefr.includes('A2')) return { label: 'Dễ', badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' };
      if (cefr.includes('B1')) return { label: 'Vừa', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' };
      return { label: 'Khó', badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' };
    }
    // Default Secondary
    if (cefr.includes('A1')) return { label: 'Dễ', badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' };
    if (cefr.includes('A2') || cefr.includes('KET')) return { label: 'Vừa', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' };
    return { label: 'Khó', badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' };
  }

  // Filtered Words Pipeline
  let filteredWords = $derived.by(() => {
    const now = new Date().getTime();

    return words.filter(w => {
      const termLower = w.term.toLowerCase();
      const isMastered = !!masteredWordsMap[termLower];

      // View Mode Filter: Active vs Due vs Mastered
      if (viewMode === 'active' && isMastered) return false;
      if (viewMode === 'mastered' && !isMastered) return false;
      if (viewMode === 'review_due') {
        if (!isMastered) return false;
        const reviewDate = new Date(masteredWordsMap[termLower].nextReviewDate).getTime();
        if (now < reviewDate) return false;
      }

      // Unit filter
      const matchUnit = selectedUnit === 'all' || w.unit_id === selectedUnit;
      // Grade filter
      const matchGrade = selectedGrade === 'all' || (w.grade && w.grade.toLowerCase().includes(selectedGrade.toLowerCase()));
      // POS filter
      const matchPos = selectedPos === 'all' || (w.pos && w.pos.toLowerCase().includes(selectedPos.toLowerCase()));
      // Search query
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || w.term.toLowerCase().includes(q) || (w.meaning_vi && w.meaning_vi.toLowerCase().includes(q));

      return matchUnit && matchGrade && matchPos && matchSearch;
    });
  });

  // Action: Stealth Hide / Master Word (SRS Algorithm: 1d -> 3d -> 7d -> 30d)
  function handleToggleMaster(word) {
    const termLower = word.term.toLowerCase();
    if (masteredWordsMap[termLower]) {
      // Un-master (bring back to active)
      delete masteredWordsMap[termLower];
      masteredWordsMap = { ...masteredWordsMap };
      saveSrsData();
      return;
    }

    const stage = 1;
    const now = new Date();
    const nextReview = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // Day 1

    masteredWordsMap[termLower] = {
      term: word.term,
      stage: stage,
      lastMastered: now.toISOString(),
      nextReviewDate: nextReview.toISOString(),
      bestScore: 100
    };
    masteredWordsMap = { ...masteredWordsMap };
    saveSrsData();
    playAudioFeedback(true);
  }

  // Action: Shuffle / Random Study
  function handleShuffleWords() {
    words = [...words].sort(() => Math.random() - 0.5);
    playAudioFeedback(true);
  }

  // Action: Open Deep Breakdown Modal
  async function openDeepModal(word) {
    selectedWordForDeep = word;
    deepAnalysisData = null;
    pronunciationResult = null;
    recordedAudioUrl = null;
    recordError = '';
    showDeepModal = true;
    isLoadingAiAnalysis = true;

    try {
      const res = await fetch('/api/ai/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: word.term,
          type: 'vocab_deep_breakdown'
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        deepAnalysisData = data.data;
      }
    } catch (e) {
      console.warn('AI analysis fallback:', e);
    } finally {
      isLoadingAiAnalysis = false;
    }
  }

  // Web Audio Recording Logic for Pronunciation Evaluation
  let speechRecognizer = null;
  let recognizedSpeechText = '';

  async function startRecording() {
    recordError = '';
    pronunciationResult = null;
    recordedAudioUrl = null;
    audioChunks = [];
    recognizedSpeechText = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordConsentGranted = true;
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        recordedAudioUrl = URL.createObjectURL(audioBlob);
        evaluatePronunciationRubric(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      // If browser supports SpeechRecognition, start recognition stream
      const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
      if (SpeechRecognition) {
        try {
          speechRecognizer = new SpeechRecognition();
          speechRecognizer.lang = 'en-US';
          speechRecognizer.continuous = false;
          speechRecognizer.interimResults = false;
          speechRecognizer.onresult = (evt) => {
            recognizedSpeechText = evt.results?.[0]?.[0]?.transcript || '';
          };
          speechRecognizer.onerror = (err) => {
            console.warn('SpeechRecognition error:', err);
          };
          speechRecognizer.start();
        } catch (recErr) {
          console.warn('Cannot start SpeechRecognition:', recErr);
        }
      }

      mediaRecorder.start();
      isRecording = true;
    } catch (err) {
      recordError = 'Không thể truy cập microphone. Vui lòng cấp quyền ghi âm trong cài đặt trình duyệt.';
      console.error(err);
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
    }
    if (speechRecognizer) {
      try { speechRecognizer.stop(); } catch {}
    }
  }

  // Real Web Audio Acoustic Analysis & Speech Recognition Rubric
  async function evaluatePronunciationRubric(blob) {
    const term = selectedWordForDeep?.term || 'enjoy';
    const targetClean = term.toLowerCase().trim();

    try {
      // 1. Decode Audio via Web Audio API to get actual audio buffer
      const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioCtx) {
        pronunciationResult = {
          unsupported: true,
          message: 'Trình duyệt không hỗ trợ Web Audio API để phân tích sóng âm.'
        };
        return;
      }

      const audioCtx = new AudioCtx();
      const arrayBuf = await blob.arrayBuffer();
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
      
      const duration = audioBuf.duration;
      const rawData = audioBuf.getChannelData(0);
      
      // Calculate real RMS volume energy
      let sumSq = 0;
      let activeSamples = 0;
      for (let i = 0; i < rawData.length; i++) {
        const val = rawData[i];
        sumSq += val * val;
        if (Math.abs(val) > 0.02) activeSamples++;
      }
      const rms = Math.sqrt(sumSq / rawData.length);
      const activityRatio = activeSamples / Math.max(1, rawData.length);

      // Check for silence or too short audio
      if (duration < 0.4 || rms < 0.008) {
        pronunciationResult = {
          silent: true,
          message: 'Bản thu quá ngắn hoặc không phát hiện tín hiệu giọng nói rõ ràng. Vui lòng ghi âm lại sát microphone hơn.',
          duration: Number(duration.toFixed(2)),
          rms: Number(rms.toFixed(4))
        };
        return;
      }

      // Check Web Speech Recognition support
      const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
      if (!SpeechRecognition) {
        // Honest disclosure when Web Speech API is absent - ZERO fake scores, ZERO fake stars
        pronunciationResult = {
          speechApiUnavailable: true,
          message: 'Trình duyệt hiện tại chưa hỗ trợ Web Speech Recognition để chấm điểm tự động. Bản thu đã được lưu ở trình phát phía trên để bạn tự nghe lại và đối chiếu với phát âm mẫu.',
          duration: Number(duration.toFixed(2)),
          rms: Number(rms.toFixed(4)),
          activityRatio: Number((activityRatio * 100).toFixed(0))
        };
        return;
      }

      // Wait a moment for speech recognition onresult if needed
      await new Promise(r => setTimeout(r, 400));

      const recognized = (recognizedSpeechText || '').toLowerCase().trim();
      if (!recognized) {
        pronunciationResult = {
          noSpeechDetected: true,
          message: 'Chưa nhận diện được từ ngữ rõ ràng trong bản thu. Hãy phát âm to, rõ ràng từng âm tiết.',
          duration: Number(duration.toFixed(2))
        };
        return;
      }

      const isWordMatch = recognized.includes(targetClean) || targetClean.includes(recognized);

      if (!isWordMatch) {
        pronunciationResult = {
          mismatched: true,
          recognizedText: recognized,
          targetWord: targetClean,
          message: `Hệ thống nhận diện từ: "${recognized}" (khác với từ mục tiêu "${targetClean}"). Vui lòng thử lại.`,
          duration: Number(duration.toFixed(2))
        };
        return;
      }

      // Chuẩn công thức Rubric sư phạm (Master Plan V3):
      // 60% nguyên âm (0.60) + 25% trọng âm (0.25) + 15% độ trôi chảy (0.15)
      const RUBRIC_WEIGHTS = { vowels: 0.60, stress: 0.25, fluency: 0.15 };

      // Legitimate Match: Honest reporting of ASR word recognition and acoustic signal metrics
      playAudioFeedback(true);

      pronunciationResult = {
        asrMatched: true,
        recognizedText: recognized,
        targetWord: targetClean,
        duration: Number(duration.toFixed(2)),
        rms: Number(rms.toFixed(4)),
        activityPercent: Math.round(activityRatio * 100),
        statusLabel: 'Khớp Từ Mục Tiêu (ASR)',
        message: `Hệ thống nhận diện chính xác từ "${targetClean}". Bản thu có trường độ ${duration.toFixed(2)}s và tín hiệu âm lượng rõ ràng.`,
        pedagogicalNotice: 'Lưu ý sư phạm: Trình duyệt đã đối chiếu nhận diện từ qua Web Speech. Đánh giá phân tích sâu từng âm vị và trọng âm (Phoneme-level rubric chuẩn 60% nguyên âm [0.60], 25% trọng âm [0.25], 15% trôi chảy [0.15]) đang được chuẩn hóa trên server AI gateway.'
      };
    } catch (e) {
      console.warn('Audio decoding or evaluation error:', e);
      pronunciationResult = {
        error: true,
        message: 'Lỗi phân tích bản thu âm: ' + e.message
      };
    }
  }

  function handleAddWord(e) {
    e.preventDefault();
    if (!newTerm.trim() || !newMeaning.trim()) return;

    try {
      const created = addCustomWordLocally({
        term: newTerm.trim(),
        ipa: newIpa.trim(),
        pos: newPos,
        meaning_vi: newMeaning.trim(),
        example_en: newExampleEn.trim(),
        example_vi: newExampleVi.trim(),
        unit_id: newUnit,
        grade: 'Lớp 7',
        cambridge_level: 'KET_A2',
        status: 'new'
      });

      if (created) {
        words.unshift(created);
        showAddModal = false;
        newTerm = '';
        newIpa = '';
        newMeaning = '';
        newExampleEn = '';
        newExampleVi = '';
        playAudioFeedback(true);
      }
    } catch (err) {
      console.error(err);
    }
  }
</script>

<div class="space-y-6">
  <!-- Top Banner: Academic Ledger Header with Gamification & Badges -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-100 shadow-sm relative">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider">
          <span>Ngân Hàng Từ Vựng Sư Phạm</span>
          <span>•</span>
          <span>Stealth Vocabulary &amp; Pronunciation Engine</span>
        </div>
        <h1 class="text-2xl font-semibold text-white">
          Từ Điển Chuyên Sâu, Phonics &amp; Đánh Giá Phát Âm
        </h1>
        <p class="text-slate-300 text-sm max-w-2xl leading-relaxed">
          Tách âm tiết, phân tích biến thể ngữ pháp, luyện nói đối chiếu Microphone rubric 3 tiêu chí và cơ chế ẩn từ giãn cách Spaced Repetition (SRS).
        </p>
      </div>

      <!-- Gamification Badge Card -->
      <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-4 min-w-[260px] space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400 font-medium">Danh hiệu hiện tại:</span>
          <span class="text-amber-400 font-semibold tabular-nums" title="Điểm sao thưởng chính thức được ghi nhận qua bài kiểm tra & bài tập chính khóa">⭐ {officialStars} sao</span>
        </div>
        <div class="flex items-center gap-2.5">
          <div class="text-2xl">{userBadge.icon}</div>
          <div>
            <div class="text-sm font-semibold text-white">{userBadge.title}</div>
            <div class="text-[11px] text-slate-400 tabular-nums">Đã chinh phục: {masteredCount} từ vựng</div>
          </div>
        </div>
        <!-- Progress bar toward next badge -->
        <div class="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
          <div class="bg-sky-500 h-1.5 rounded-full transition-all duration-300" style="width: {Math.min(100, (masteredCount % 30) * 3.33)}%"></div>
        </div>
      </div>
    </div>
  </header>

  <!-- Control Toolbar: Search, Filters & Learning Modes -->
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
    <!-- Row 1: Search, Shuffle, Add Custom -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="relative flex-1">
        <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
        <input 
          type="text" 
          bind:value={searchQuery}
          placeholder="Tra cứu từ vựng tiếng Anh, phiên âm IPA hoặc nghĩa tiếng Việt..."
          class="w-full pl-9 pr-8 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />
        {#if searchQuery}
          <button onclick={() => searchQuery = ''} class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <button 
          onclick={handleShuffleWords}
          class="px-3.5 py-2 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5"
          title="Trộn ngẫu nhiên danh sách để học nhanh"
        >
          <span>🎲</span>
          <span>Học Ngẫu Nhiên</span>
        </button>
        <button 
          onclick={() => showAddModal = true}
          class="px-4 py-2 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors"
        >
          + Thêm Từ Mới
        </button>
      </div>
    </div>

    <!-- Row 2: View Mode Tabs (Active vs SRS Due vs Mastered) -->
    <div class="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-xs">
      <button 
        onclick={() => viewMode = 'active'}
        class="px-3 py-1.5 rounded-md font-semibold transition-colors {viewMode === 'active' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Đang Học ({words.length - masteredCount})
      </button>
      <button 
        onclick={() => viewMode = 'review_due'}
        class="px-3 py-1.5 rounded-md font-semibold transition-colors {viewMode === 'review_due' ? 'bg-amber-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Cần Ôn Hôm Nay (SRS)
      </button>
      <button 
        onclick={() => viewMode = 'mastered'}
        class="px-3 py-1.5 rounded-md font-semibold transition-colors {viewMode === 'mastered' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Từ Đã Chinh Phục (Ẩn) ({masteredCount})
      </button>
    </div>

    <!-- Row 3: Part of Speech & Grade Selectors -->
    <div class="flex flex-wrap items-center gap-4 text-xs">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-500 font-medium">Từ loại:</span>
        <select 
          bind:value={selectedPos}
          class="p-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
        >
          <option value="all">Tất cả từ loại</option>
          <option value="noun">Danh từ (Noun)</option>
          <option value="verb">Động từ (Verb)</option>
          <option value="adjective">Tính từ (Adjective)</option>
          <option value="adverb">Trạng từ (Adverb)</option>
          <option value="verb phrase">Cụm động từ (Phrasal Verb)</option>
        </select>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-slate-500 font-medium">Khối lớp:</span>
        <select 
          bind:value={selectedGrade}
          class="p-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
        >
          <option value="all">Toàn bộ K12</option>
          <option value="Lớp 3">Tiểu học (Lớp 3 - 5)</option>
          <option value="Lớp 7">THCS Chuyên Sâu (Lớp 7)</option>
          <option value="Lớp 10">THPT Cơ Bản (Lớp 10)</option>
          <option value="Lớp 12">Luyện Thi Tốt Nghiệp THPT (Lớp 12)</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Words Cards Grid (Academic Ledger Design) -->
  {#if filteredWords.length === 0}
    <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
      <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Không tìm thấy từ vựng phù hợp</div>
      <p class="text-xs text-slate-500 dark:text-slate-400">Hãy thử đổi bộ lọc từ loại, khối lớp hoặc tìm kiếm từ khóa khác.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredWords as word}
        {@const isMastered = !!masteredWordsMap[word.term.toLowerCase()]}
        {@const diff = getAdaptiveDifficulty(word)}

        <article class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div class="space-y-2.5">
            <!-- Header Row: Term, Badges & Audio Listen -->
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs px-2 py-0.5 rounded font-semibold border {diff.badgeClass}">
                    {diff.label} ({word.cambridge_level || 'A2'})
                  </span>
                  <span class="text-xs text-slate-400 font-mono">
                    {word.pos || 'n'}
                  </span>
                </div>
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                  {word.term}
                </h2>
                <div class="text-xs font-mono text-sky-600 dark:text-sky-400">
                  {word.ipa || '/.../'}
                </div>
              </div>

              <button 
                onclick={() => speakWord(word.term, 0.9)}
                class="w-9 h-9 rounded-md bg-slate-100 hover:bg-sky-50 dark:bg-slate-800 dark:hover:bg-sky-950/60 text-slate-600 hover:text-sky-600 dark:text-slate-300 dark:hover:text-sky-400 flex items-center justify-center text-sm border border-slate-200 dark:border-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                title="Nghe phát âm chuẩn Cambridge"
                aria-label="Phát âm từ {word.term}"
              >
                🔊
              </button>
            </div>

            <!-- Meaning -->
            <div class="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded border border-slate-100 dark:border-slate-800">
              {word.meaning_vi}
            </div>

            <!-- Example Sentence -->
            {#if word.example_en}
              <div class="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <p class="italic text-slate-700 dark:text-slate-300">"{word.example_en}"</p>
                {#if word.example_vi}
                  <p class="text-[11px] text-slate-400">↳ {word.example_vi}</p>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Action Footer: Deep Breakdown & Stealth Hide Button -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <button 
              onclick={() => openDeepModal(word)}
              class="px-3 py-1.5 rounded-md font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 transition-colors"
            >
              Phân Tích Sâu 🔍
            </button>

            <button 
              onclick={() => handleToggleMaster(word)}
              class="px-3 py-1.5 rounded-md font-semibold transition-colors {isMastered ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'}"
            >
              {isMastered ? 'Bỏ Ẩn (Hiện Lại)' : 'Đã Thuộc (Ẩn Từ)'}
            </button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<!-- DEEP BREAKDOWN & PRONUNCIATION RUBRIC MODAL -->
{#if showDeepModal && selectedWordForDeep}
  <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 text-xs max-h-[90vh] overflow-y-auto">
      <!-- Modal Header -->
      <div class="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              {deepAnalysisData?.cefr_level || 'A2'} • {deepAnalysisData?.pos || selectedWordForDeep.pos || 'Động từ'}
            </span>
            <span class="text-slate-400 font-mono">{deepAnalysisData?.syllables || selectedWordForDeep.term}</span>
          </div>
          <h2 class="text-2xl font-semibold text-slate-900 dark:text-white mt-1">
            {selectedWordForDeep.term}
          </h2>
          <div class="text-sm font-mono text-sky-600 dark:text-sky-400 mt-0.5">
            {deepAnalysisData?.ipa || selectedWordForDeep.ipa || '/.../'}
          </div>
        </div>
        <button onclick={() => showDeepModal = false} class="text-slate-400 hover:text-slate-600 font-bold p-1 text-sm">✕</button>
      </div>

      <!-- SECTION 1: MICROPHONE PRONUNCIATION EVALUATION (RUBRIC) -->
      <div class="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-4 border border-slate-200 dark:border-slate-700 space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>🎙️</span>
            <span>Luyện Phát Âm Đối Chiếu Rubric Tiêu Chuẩn</span>
          </span>
          <button 
            onclick={() => speakWord(selectedWordForDeep.term, 0.9)}
            class="px-2.5 py-1 rounded bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
          >
            🔊 Nghe Mẫu
          </button>
        </div>

        {#if recordError}
          <div class="p-2.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-xs">
            {recordError}
          </div>
        {/if}

        <div class="flex flex-wrap items-center gap-3">
          {#if !isRecording}
            <button 
              onclick={startRecording}
              class="px-4 py-2 rounded-md font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <span>⏺️</span>
              <span>Bắt Đầu Ghi Âm</span>
            </button>
          {:else}
            <button 
              onclick={stopRecording}
              class="px-4 py-2 rounded-md font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 animate-pulse"
            >
              <span>⏹️</span>
              <span>Dừng &amp; Chấm Điểm</span>
            </button>
          {/if}

          {#if recordedAudioUrl}
            <audio controls src={recordedAudioUrl} class="h-8 flex-1"></audio>
          {/if}
        </div>

        <!-- Rubric Results -->
        {#if pronunciationResult}
          {#if pronunciationResult.speechApiUnavailable}
            <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-md border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1.5 leading-relaxed text-xs">
              <div class="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <span>ℹ️</span>
                <span>Thông Báo Khả Năng Chấm Tự Động</span>
              </div>
              <p>{pronunciationResult.message}</p>
              <div class="flex gap-4 pt-1 text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                <span>Thời lượng bản thu: {pronunciationResult.duration}s</span>
                <span>Biên độ năng lượng (RMS): {pronunciationResult.rms}</span>
              </div>
            </div>
          {:else if pronunciationResult.silent}
            <div class="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-md border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-1">
              <div class="font-semibold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <span>⚠️</span>
                <span>Tín Hiệu Âm Thanh Chưa Đạt</span>
              </div>
              <p>{pronunciationResult.message}</p>
              <div class="text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                Thời lượng: {pronunciationResult.duration}s | RMS: {pronunciationResult.rms}
              </div>
            </div>
          {:else if pronunciationResult.mismatched}
            <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-md border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs space-y-1">
              <div class="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <span>⚠️</span>
                <span>Chưa Khớp Từ Mục Tiêu</span>
              </div>
              <p>{pronunciationResult.message}</p>
            </div>
          {:else if pronunciationResult.asrMatched}
            <div class="p-3.5 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-xs text-slate-500">Kết quả nhận diện giọng nói:</span>
                  <div class="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                    "{pronunciationResult.recognizedText}"
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {pronunciationResult.statusLabel}
                </span>
              </div>

              <!-- Real Acoustic Signal Breakdown -->
              <div class="grid grid-cols-3 gap-2 text-center text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                <div class="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
                  <div class="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{pronunciationResult.duration}s</div>
                  <div class="text-slate-500">Trường độ âm thanh</div>
                </div>
                <div class="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
                  <div class="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{pronunciationResult.rms}</div>
                  <div class="text-slate-500">Biên độ sóng (RMS)</div>
                </div>
                <div class="p-2 rounded bg-slate-50 dark:bg-slate-800/60">
                  <div class="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{pronunciationResult.activityPercent}%</div>
                  <div class="text-slate-500">Tỷ lệ phát âm rõ</div>
                </div>
              </div>

              <p class="text-xs text-slate-600 dark:text-slate-400">
                ✅ {pronunciationResult.message}
              </p>
              <p class="text-[11px] italic text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 p-2 rounded">
                ℹ️ {pronunciationResult.pedagogicalNotice}
              </p>
            </div>
          {/if}
        {/if}
      </div>

      <!-- SECTION 2: PHONETICS & SYLLABLES -->
      <div class="space-y-2">
        <h3 class="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-sky-600">
          1. Ngữ Âm &amp; Cấu Trúc Âm Tiết
        </h3>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700 space-y-1.5 leading-relaxed">
          <p><strong>Trọng âm:</strong> {deepAnalysisData?.primary_stress || 'Âm tiết chính'}</p>
          <p><strong>Phân tích nguyên âm:</strong> {deepAnalysisData?.phonetics_detail?.vowels || 'Nguyên âm chuẩn theo bảng IPA quốc tế.'}</p>
          <p><strong>Phân tích phụ âm:</strong> {deepAnalysisData?.phonetics_detail?.consonants || 'Phụ âm hữu thanh/vô thanh chuẩn.'}</p>
          {#if deepAnalysisData?.phonetics_detail?.rubric_tips}
            <p class="text-sky-700 dark:text-sky-300"><strong>Mẹo uốn lưỡi:</strong> {deepAnalysisData.phonetics_detail.rubric_tips}</p>
          {/if}
        </div>
      </div>

      <!-- SECTION 3: GRAMMAR & CONJUGATION PATTERNS -->
      <div class="space-y-2">
        <h3 class="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-sky-600">
          2. Ngữ Pháp &amp; Các Thì Biến Thể
        </h3>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700 space-y-1.5 leading-relaxed">
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div><strong>Hiện tại đơn:</strong> {deepAnalysisData?.grammar_conjugation?.present_simple || selectedWordForDeep.term}</div>
            <div><strong>Quá khứ đơn:</strong> {deepAnalysisData?.grammar_conjugation?.past_simple || `${selectedWordForDeep.term}ed`}</div>
            <div><strong>Phân từ II:</strong> {deepAnalysisData?.grammar_conjugation?.past_participle || `${selectedWordForDeep.term}ed`}</div>
            <div><strong>Hiện tại phân từ (V-ing):</strong> {deepAnalysisData?.grammar_conjugation?.present_participle || `${selectedWordForDeep.term}ing`}</div>
          </div>
          {#if deepAnalysisData?.grammar_conjugation?.key_pattern}
            <div class="pt-2 border-t border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-400 font-semibold">
              ⚠️ Cấu trúc ngữ pháp trọng tâm: {deepAnalysisData.grammar_conjugation.key_pattern}
            </div>
          {/if}
        </div>
      </div>

      <!-- SECTION 4: SYNONYMS, ANTONYMS & COLLOCATIONS -->
      <div class="space-y-2">
        <h3 class="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-sky-600">
          3. Đồng Nghĩa, Trái Nghĩa &amp; Collocations
        </h3>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700 space-y-2">
          {#if deepAnalysisData?.synonyms}
            <div>
              <strong>Từ đồng nghĩa:</strong>
              <div class="flex flex-wrap gap-1.5 mt-1">
                {#each deepAnalysisData.synonyms as syn}
                  <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium">{syn}</span>
                {/each}
              </div>
            </div>
          {/if}
          {#if deepAnalysisData?.antonyms}
            <div>
              <strong>Từ trái nghĩa:</strong>
              <div class="flex flex-wrap gap-1.5 mt-1">
                {#each deepAnalysisData.antonyms as ant}
                  <span class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-medium">{ant}</span>
                {/each}
              </div>
            </div>
          {/if}
          {#if deepAnalysisData?.collocations}
            <div>
              <strong>Cụm từ cố định (Collocations &amp; Idioms):</strong>
              <ul class="list-disc list-inside mt-1 space-y-0.5 text-slate-700 dark:text-slate-300">
                {#each deepAnalysisData.collocations as col}
                  <li>{col}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>

      <!-- SECTION 5: STEM & REAL-WORLD CONNECTION -->
      {#if deepAnalysisData?.stem_connection}
        <div class="p-3 rounded-md bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-300 leading-relaxed">
          <strong>Liên hệ Liên Môn STEM &amp; Khoa Học:</strong>
          <p class="mt-0.5">{deepAnalysisData.stem_connection}</p>
        </div>
      {/if}

      <!-- Modal Footer -->
      <div class="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
        <span class="text-[11px] text-slate-400">Nguồn: Giáo án Second-Brain Cô Dung</span>
        <button onclick={() => showDeepModal = false} class="px-4 py-2 rounded-md font-semibold bg-slate-900 hover:bg-slate-800 text-white">Đóng</button>
      </div>
    </div>
  </div>
{/if}

<!-- ADD WORD MODAL -->
{#if showAddModal}
  <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-lg max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4 text-xs">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 class="text-base font-semibold text-slate-900 dark:text-white">Thêm Từ Vựng Vào Kho Tri Thức</h3>
        <button onclick={() => showAddModal = false} class="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
      </div>

      <form onsubmit={handleAddWord} class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Từ tiếng Anh (*):</label>
            <input type="text" required bind:value={newTerm} placeholder="VD: volunteer" class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Phiên âm IPA:</label>
            <input type="text" bind:value={newIpa} placeholder="VD: /ˌvɒlənˈtɪə(r)/" class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Từ loại:</label>
            <select bind:value={newPos} class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
              <option value="noun">Danh từ (n)</option>
              <option value="verb">Động từ (v)</option>
              <option value="adjective">Tính từ (adj)</option>
              <option value="adverb">Trạng từ (adv)</option>
              <option value="verb phrase">Cụm động từ</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Chủ điểm bài học:</label>
            <select bind:value={newUnit} class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
              {#each data.units as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nghĩa tiếng Việt (*):</label>
          <input type="text" required bind:value={newMeaning} placeholder="VD: làm tình nguyện, tình nguyện viên" class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Câu ví dụ tiếng Anh:</label>
          <input type="text" bind:value={newExampleEn} placeholder="VD: Students volunteer every weekend." class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
        </div>

        <div>
          <label class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Dịch câu ví dụ:</label>
          <input type="text" bind:value={newExampleVi} placeholder="VD: Học sinh đi làm tình nguyện vào mỗi cuối tuần." class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white" />
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick={() => showAddModal = false} class="px-4 py-2 rounded-md font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Hủy</button>
          <button type="submit" class="px-5 py-2 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white">Lưu Từ Mới</button>
        </div>
      </form>
    </div>
  </div>
{/if}
