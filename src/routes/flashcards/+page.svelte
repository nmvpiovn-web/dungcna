<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { saveUserProgress } from '$lib/staticDb.js';

  let { data } = $props();

  let words = $state([...(data?.words || [])]);
  let currentIndex = $state(0);
  let isFlipped = $state(false);
  let selectedGrade = $state('all');
  let selectedUnit = $state(data?.currentUnit || 'all');
  let searchQuery = $state('');
  let autoPlay = $state(false);
  let autoPlayTimer = $state(null);
  let studyFilter = $state('all'); // 'all', 'need_review', 'mastered'
  let frontLanguage = $state('vi'); // 'vi' (Mặt trước TV, Mặt sau TA) or 'en'
  let slowVoice = $state(false);
  let isStudyPopupOpen = $state(false);

  const gradeCards = [
    {
      id: 'all',
      icon: '🌟',
      title: 'Toàn Bộ K12 & Quốc Tế',
      subtitle: 'Tất cả khối lớp từ Tiểu học, THCS, THPT đến IELTS',
      cefr: 'Pre-A1 → C1',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    },
    {
      id: 'primary',
      icon: '🎒',
      title: 'Tiểu Học (Lớp 1 – 5)',
      subtitle: 'Từ vựng nhà trường, đồ dùng học tập & Phonics nền tảng',
      cefr: 'Starters • Movers • Flyers',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
    },
    {
      id: 'Lớp 6',
      icon: '📚',
      title: 'Lớp 6 (Global Success)',
      subtitle: 'Trường lớp, bạn bè, gia đình & giao tiếp THCS Khối 6',
      cefr: 'Cambridge KET A2',
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200'
    },
    {
      id: 'Lớp 7',
      icon: '🌱',
      title: 'Lớp 7 (Global Success)',
      subtitle: 'Hobbies, Healthy Living, Community Service & năng lượng',
      cefr: 'Cambridge KET A2+',
      badgeColor: 'bg-teal-50 text-teal-800 border-teal-200'
    },
    {
      id: 'Lớp 8',
      icon: '📖',
      title: 'Lớp 8 (Global Success)',
      subtitle: 'Làng nghề truyền thống, đời sống đô thị & môi trường',
      cefr: 'Cambridge PET B1',
      badgeColor: 'bg-sky-50 text-sky-800 border-sky-200'
    },
    {
      id: 'Lớp 9',
      icon: '🎯',
      title: 'Lớp 9 & Luyện Thi Vào 10',
      subtitle: 'Định hướng nghề nghiệp, bản sắc văn hóa & kỳ quan thế giới',
      cefr: 'PET B1 → B1+',
      badgeColor: 'bg-rose-50 text-rose-800 border-rose-200'
    },
    {
      id: 'highschool_10_11',
      icon: '🏢',
      title: 'THPT (Lớp 10 – 11)',
      subtitle: 'Bảo vệ môi trường, đô thị tương lai, an ninh mạng & ngữ pháp',
      cefr: 'FCE B2',
      badgeColor: 'bg-purple-50 text-purple-800 border-purple-200'
    },
    {
      id: 'highschool_12_ielts',
      icon: '🎓',
      title: 'Lớp 12 • THPT QG & IELTS',
      subtitle: 'Trí tuệ nhân tạo (AI), điện toán đám mây & từ vựng học thuật',
      cefr: 'FCE B2 → CAE C1',
      badgeColor: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200'
    }
  ];

  function matchesGradeFilter(word, gradeId) {
    if (!gradeId || gradeId === 'all') return true;
    const g = String(word.grade || '').trim();
    const lvl = String(word.cambridge_level || '').trim();
    if (gradeId === 'primary') {
      return (
        g.includes('Lớp 1') ||
        g.includes('Lớp 2') ||
        g.includes('Lớp 3') ||
        g.includes('Lớp 4') ||
        g.includes('Lớp 5') ||
        lvl.includes('Starters') ||
        lvl.includes('Movers') ||
        lvl.includes('Flyers')
      );
    }
    if (gradeId === 'highschool_10_11') {
      return g.includes('Lớp 10') || g.includes('Lớp 11');
    }
    if (gradeId === 'highschool_12_ielts') {
      return g.includes('Lớp 12') || g.toLowerCase().includes('ielts') || lvl.includes('CAE_C1');
    }
    return g === gradeId || g.includes(gradeId);
  }

  function countWordsForGrade(gradeId) {
    return words.filter((w) => matchesGradeFilter(w, gradeId)).length;
  }

  function countWordsForUnit(unitId) {
    return words.filter((w) => {
      if (!matchesGradeFilter(w, selectedGrade)) return false;
      if (unitId === 'all') return true;
      return w.unit_id === unitId;
    }).length;
  }

  // Sync URL query params (?grade=...&unit=...)
  $effect(() => {
    if (typeof window === 'undefined') return;
    const sp = $page.url.searchParams;
    const gParam = sp.get('grade');
    const uParam = sp.get('unit');
    if (gParam && gradeCards.some((c) => c.id === gParam)) {
      selectedGrade = gParam;
    }
    if (uParam) {
      selectedUnit = uParam;
    }
  });

  function openStudyPopup() {
    isFlipped = false;
    isStudyPopupOpen = true;
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
  }

  function closeStudyPopup() {
    isStudyPopupOpen = false;
    if (autoPlayTimer) {
      clearTimeout(autoPlayTimer);
      autoPlayTimer = null;
    }
    autoPlay = false;
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }

  // Filtered list
  let displayWords = $derived.by(() => {
    let list = words;
    if (selectedGrade !== 'all') {
      list = list.filter((w) => matchesGradeFilter(w, selectedGrade));
    }
    if (selectedUnit !== 'all') {
      list = list.filter((w) => w.unit_id === selectedUnit);
    }
    if (studyFilter === 'need_review') {
      list = list.filter((w) => w.status !== 'mastered');
    } else if (studyFilter === 'mastered') {
      list = list.filter((w) => w.status === 'mastered');
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (w) =>
          (w.term || '').toLowerCase().includes(q) ||
          (w.meaning_vi || '').toLowerCase().includes(q) ||
          (w.ipa || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  let currentWord = $derived(displayWords[currentIndex] || displayWords[0] || null);

  function selectGradeCard(gradeId) {
    selectedGrade = gradeId;
    selectedUnit = 'all';
    currentIndex = 0;
    isFlipped = false;
  }

  function selectUnitCard(unitId) {
    selectedUnit = unitId;
    currentIndex = 0;
    isFlipped = false;
  }

  function flipCard() {
    isFlipped = !isFlipped;
    playAudioFeedback('flip');
    if (currentWord) {
      if ((frontLanguage === 'vi' && isFlipped) || (frontLanguage === 'en' && !isFlipped)) {
        speakWord(currentWord.term, slowVoice ? 0.7 : 0.9);
      }
    }
  }

  function nextCard() {
    if (displayWords.length === 0) return;
    if (currentIndex < displayWords.length - 1) {
      currentIndex++;
      isFlipped = false;
    } else {
      currentIndex = 0;
      isFlipped = false;
    }
  }

  function prevCard() {
    if (displayWords.length === 0) return;
    if (currentIndex > 0) {
      currentIndex--;
      isFlipped = false;
    } else {
      currentIndex = displayWords.length - 1;
      isFlipped = false;
    }
  }

  function shuffleCards() {
    const currentIds = new Set(displayWords.map((w) => w.id));
    const currentSub = [...displayWords];
    for (let i = currentSub.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentSub[i], currentSub[j]] = [currentSub[j], currentSub[i]];
    }
    const otherWords = words.filter((w) => !currentIds.has(w.id));
    words = [...currentSub, ...otherWords];
    currentIndex = 0;
    isFlipped = false;
  }

  function markProgress(status) {
    if (!currentWord) return;
    try {
      currentWord.status = status;
      saveUserProgress(currentWord.id, status);
      playAudioFeedback(status === 'mastered' ? 'correct' : 'wrong');
      nextCard();
    } catch (e) {
      console.error(e);
    }
  }

  function toggleAutoPlay() {
    autoPlay = !autoPlay;
    if (autoPlay) {
      runAutoPlay();
    } else if (autoPlayTimer) {
      clearTimeout(autoPlayTimer);
    }
  }

  function runAutoPlay() {
    if (!autoPlay) return;
    autoPlayTimer = setTimeout(() => {
      if (!isFlipped) {
        flipCard();
        runAutoPlay();
      } else {
        nextCard();
        runAutoPlay();
      }
    }, 3800);
  }

  function handleKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      flipCard();
    } else if (e.code === 'ArrowRight') {
      nextCard();
    } else if (e.code === 'ArrowLeft') {
      prevCard();
    } else if (e.code === 'KeyA' && currentWord) {
      speakWord(currentWord.term, slowVoice ? 0.7 : 0.9);
    } else if (e.code === 'Escape' && isStudyPopupOpen) {
      closeStudyPopup();
    }
  }

  function enrichChunkWord(rawArr) {
    const term = String(rawArr[1] || '').trim();
    const ipa = String(rawArr[2] || '').trim();
    const vowelTokens = ipa.match(/(?:iː|uː|ɑː|ɔː|ɜː|eɪ|aɪ|ɔɪ|aʊ|əʊ|ɪə|eə|ʊə|ɪ|e|æ|ʌ|ɒ|ʊ|ə|i|u)/g) || [];
    const consonantTokens = ipa.match(/(?:tʃ|dʒ|θ|ð|ʃ|ʒ|ŋ|p|b|t|d|k|ɡ|g|f|v|s|z|h|m|n|l|r|j|w)/g) || [];
    const uniqV = [...new Set(vowelTokens)];
    const uniqC = [...new Set(consonantTokens)];

    return {
      id: rawArr[0],
      term,
      ipa,
      pos: rawArr[3] || 'noun',
      meaning_vi: rawArr[4] || '',
      example_en: rawArr[5] || '',
      example_vi: rawArr[6] || '',
      grade: 'Lớp 7',
      cambridge_level: 'KET_A2',
      unit_id: 'unit1',
      status: 'new',
      syllables: `${term} (${Math.max(1, vowelTokens.length)} âm tiết)`,
      vowels_detail:
        uniqV.length > 0
          ? `Tổ hợp nguyên âm IPA: /${uniqV.join('/, /')}/ — mở khẩu hình rõ ở âm tiết mang dấu trọng âm (ˈ).`
          : `Nguyên âm chuẩn Cambridge IPA (${ipa}).`,
      consonants_detail:
        uniqC.length > 0
          ? `Phụ âm cấu thành: /${uniqC.join('/, /')}/ — bật rõ phụ âm đầu và âm đuôi chuẩn bản xứ.`
          : `Phụ âm chuẩn Cambridge (${ipa}).`,
      phonics_note: ipa.includes('ˈ')
        ? `Nhấn trọng âm chính tại vị trí dấu (ˈ) trong ${ipa}.`
        : `Phát âm chuẩn Cambridge IPA ${ipa}.`
    };
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    // Bổ sung thêm từ từ /vocab_m0.json & /vocab_m1.json NHƯNG TUYỆT ĐỐI KHÔNG GHI ĐÈ
    // dữ liệu giàu thông tin (grade, unit_id, vowels_detail, consonants_detail, phonics_note)
    const fetchChunk = (i) =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
          try {
            const d = JSON.parse(xhr.responseText);
            resolve(Array.isArray(d) ? d : []);
          } catch {
            resolve([]);
          }
        };
        xhr.onerror = () => resolve([]);
        xhr.ontimeout = () => resolve([]);
        xhr.timeout = 10000;
        xhr.open('GET', `/vocab_m${i}.json`);
        xhr.send();
      });

    (async () => {
      const existingByTerm = new Map(words.map((w) => [String(w.term || '').toLowerCase().trim(), w]));
      let addedCount = 0;

      // 1. Đồng bộ trực tiếp từ bảng D1 cambridge_vocabulary (/api/vocabulary)
      try {
        const d1Res = await fetch('/api/vocabulary');
        const d1Data = await d1Res.json().catch(() => ({}));
        if (d1Data.success && Array.isArray(d1Data.words)) {
          for (const dw of d1Data.words) {
            if (!dw?.term) continue;
            const key = String(dw.term).toLowerCase().trim();
            const prev = existingByTerm.get(key) || {};
            existingByTerm.set(key, { ...prev, ...dw });
            addedCount++;
          }
        }
      } catch {}

      // 2. Bổ sung thêm từ vựng mở rộng từ /vocab_m0.json & /vocab_m1.json
      for (let i = 0; i < 2; i++) {
        const chunk = await fetchChunk(i);
        for (const item of chunk) {
          if (!Array.isArray(item) || !item[1]) continue;
          const key = String(item[1]).toLowerCase().trim();
          if (!existingByTerm.has(key)) {
            existingByTerm.set(key, enrichChunkWord(item));
            addedCount++;
          }
        }
      }
      if (addedCount > 0) {
        words = Array.from(existingByTerm.values());
      }
    })();

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
    };
  });
</script>

<div class="flashcards-page">
  <!-- Header Banner & Controls -->
  <div class="page-top">
    <div class="title-area">
      <div class="mode-badge">
        <span>🗂️ CHẾ ĐỘ LẬT THẺ 3D &amp; PHÂN TÍCH NGỮ ÂM CAMBRIDGE</span>
      </div>
      <h1 class="page-title">Tiếng Anh Cô Dung — Flashcard Từ Vựng Theo Khối Lớp (Lớp 1–12 &amp; IELTS)</h1>
      <p class="page-desc">
        Học từ vựng đa giác quan cùng Tiếng Anh Cô Dung: <strong>Chọn trực tiếp thẻ khối lớp bên dưới</strong> (không cuộn ngang, không ẩn chữ), lật thẻ 3D xem <strong>phiên âm IPA, phân tích nguyên âm, phụ âm, trọng âm</strong> và nghe phát âm chuẩn bản xứ.
      </p>
    </div>

    <!-- ============ LƯỚI THẺ CHỌN KHỐI LỚP TRỰC DIỆN (KHÔNG SLIDE-BAR, KHÔNG CẮT CHỮ) ============ -->
    <section
      id="flashcards-grade-cards-grid"
      data-testid="flashcards-grade-cards-grid"
      aria-label="Chọn khối lớp học Flashcard"
      class="grade-cards-section"
    >
      <div class="section-header-row">
        <div>
          <span class="section-eyebrow">🎓 BƯỚC 1: CHỌN KHỐI LỚP / CẤP HỌC</span>
          <h2 class="section-heading">Thẻ Lựa Chọn Lớp Học Trực Diện (Hiển Thị Đầy Đủ Thông Tin 100%)</h2>
        </div>
        <span class="total-badge">Tổng kho: <strong>{words.length}</strong> thẻ từ vựng chuẩn IPA</span>
      </div>

      <div class="grade-cards-grid">
        {#each gradeCards as gc (gc.id)}
          {@const count = countWordsForGrade(gc.id)}
          {@const isSelected = selectedGrade === gc.id}
          <button
            type="button"
            data-testid={`flashcard-grade-card-${gc.id}`}
            onclick={() => selectGradeCard(gc.id)}
            class="grade-select-card {isSelected ? 'is-selected' : ''}"
          >
            <div class="grade-card-top">
              <span class="grade-card-icon">{gc.icon}</span>
              <div class="grade-card-badges">
                <span class="cefr-pill {gc.badgeColor}">{gc.cefr}</span>
                <span class="count-pill {isSelected ? 'count-active' : ''}">{count} từ</span>
              </div>
            </div>
            <div class="grade-card-title">{gc.title}</div>
            <div class="grade-card-desc">{gc.subtitle}</div>
          </button>
        {/each}
      </div>
    </section>

    <!-- ============ LƯỚI THẺ CHỦ ĐIỂM / UNIT (FLEX-WRAP, KHÔNG SLIDE-BAR) ============ -->
    <section
      id="flashcards-unit-cards-grid"
      data-testid="flashcards-unit-cards-grid"
      aria-label="Chọn chủ điểm từ vựng"
      class="unit-cards-section"
    >
      <div class="section-header-row">
        <span class="section-eyebrow">📚 BƯỚC 2: CHỌN CHỦ ĐIỂM / UNIT TRONG KHỐI LỚP</span>
        {#if selectedGrade !== 'all' || selectedUnit !== 'all' || searchQuery}
          <button
            type="button"
            onclick={() => {
              selectedGrade = 'all';
              selectedUnit = 'all';
              studyFilter = 'all';
              searchQuery = '';
              currentIndex = 0;
              isFlipped = false;
            }}
            class="btn-reset-filter"
          >
            ↺ Xem lại toàn bộ ({words.length} từ)
          </button>
        {/if}
      </div>

      <div class="unit-pills-wrap">
        <button
          type="button"
          onclick={() => selectUnitCard('all')}
          class="unit-card-btn {selectedUnit === 'all' ? 'is-active' : ''}"
        >
          <span>🌟 Tất cả chủ điểm</span>
          <span class="unit-count">({countWordsForUnit('all')})</span>
        </button>
        {#each (data?.units || []) as unit (unit.id)}
          {@const uCount = countWordsForUnit(unit.id)}
          {#if uCount > 0 || selectedUnit === unit.id}
            <button
              type="button"
              onclick={() => selectUnitCard(unit.id)}
              class="unit-card-btn {selectedUnit === unit.id ? 'is-active' : ''}"
            >
              <span>{unit.icon} {unit.name}</span>
              <span class="unit-count">({uCount})</span>
            </button>
          {/if}
        {/each}
      </div>
    </section>

    <!-- ============ THANH CÔNG CỤ TÌM KIẾM & CHẾ ĐỘ LẬT THẺ ============ -->
    <div class="filters-bar">
      <div class="filter-group search-group">
        <label for="vocab-search">🔍 Tìm nhanh:</label>
        <input
          id="vocab-search"
          type="text"
          bind:value={searchQuery}
          oninput={() => {
            currentIndex = 0;
            isFlipped = false;
          }}
          placeholder="Nhập từ tiếng Anh, nghĩa tiếng Việt hoặc IPA..."
          class="search-input"
        />
      </div>

      <div class="filter-group">
        <label for="filter-status">Trạng thái:</label>
        <select
          id="filter-status"
          bind:value={studyFilter}
          onchange={() => {
            currentIndex = 0;
            isFlipped = false;
          }}
        >
          <option value="all">Tất cả từ ({displayWords.length})</option>
          <option value="need_review">Chưa thuộc ({words.filter((w) => w.status !== 'mastered').length})</option>
          <option value="mastered">Đã thuộc ({words.filter((w) => w.status === 'mastered').length})</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="front-lang">Mặt trước:</label>
        <select id="front-lang" bind:value={frontLanguage}>
          <option value="vi">🇻🇳 Tiếng Việt (Gợi nhớ từ)</option>
          <option value="en">🇬🇧 Tiếng Anh (Gợi nhớ nghĩa)</option>
        </select>
      </div>

      <div class="action-buttons">
        <button class="btn-tool" onclick={shuffleCards} title="Xáo trộn ngẫu nhiên">
          <span>🔀 Xáo thẻ</span>
        </button>
        <button class="btn-tool" class:active={autoPlay} onclick={toggleAutoPlay} title="Tự động lật và chuyển thẻ">
          <span>{autoPlay ? '⏸️ Tạm dừng' : '▶️ Tự chạy'}</span>
        </button>
        <button class="btn-tool btn-start-study" onclick={openStudyPopup} title="Mở chế độ phóng to toàn màn hình">
          <span>🔍 Phóng to toàn màn hình</span>
        </button>
      </div>
    </div>
  </div>

  {#if displayWords.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🎉</div>
      <h3>Không có từ vựng nào trong bộ lọc này!</h3>
      <p>Hãy chọn khối lớp hoặc chủ điểm khác, hoặc bấm nút bên dưới để xem toàn bộ kho từ vựng.</p>
      <button
        class="btn-primary"
        onclick={() => {
          selectedGrade = 'all';
          selectedUnit = 'all';
          studyFilter = 'all';
          searchQuery = '';
          currentIndex = 0;
        }}
      >
        Xem lại tất cả {words.length} từ vựng
      </button>
    </div>
  {:else if currentWord}
    <!-- ============ BÀN HỌC FLASHCARD 3D TRỰC TIẾP TRÊN TRANG (KHÔNG CẦN MỞ POPUP, KHÔNG THANH CUỘN DỌC) ============ -->
    <section
      id="inline-flashcard-workspace"
      data-testid="inline-flashcard-workspace"
      aria-label="Bàn lật thẻ Flashcard 3D trực tiếp"
      class="inline-study-workspace"
    >
      <div class="progress-wrap">
        <div class="progress-info">
          <span class="card-counter">
            Đang học thẻ <strong>{currentIndex + 1}</strong> / <strong>{displayWords.length}</strong>
            • Khối: <strong>{currentWord.grade || 'K12'}</strong> ({currentWord.cambridge_level || 'KET_A2'})
          </span>
          <span class="keyboard-tip">💡 Phím tắt: [Space] Lật thẻ • [← / →] Đổi thẻ • [A] Nghe phát âm</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: {((currentIndex + 1) / displayWords.length) * 100}%"></div>
        </div>
      </div>

      <div class="card-area">
        <div class="card-stage-row">
          <button class="nav-side-btn" onclick={prevCard} aria-label="Từ trước" title="Thẻ trước (←)">
            ← Trước
          </button>

          <div class="card-container">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="flashcard" class:flipped={isFlipped} onclick={flipCard}>
              <!-- ================= FRONT FACE ================= -->
              <div class="card-face card-front">
                <div class="card-header">
                  <div class="card-category">
                    <span class="badge badge-indigo">{currentWord.grade || 'Lớp 7'}</span>
                    <span class="badge badge-purple">{(currentWord.unit_id || 'unit1').toUpperCase()}</span>
                    <span class="badge badge-amber">{currentWord.pos}</span>
                    {#if currentWord.cambridge_level}
                      <span class="badge badge-sky">{currentWord.cambridge_level}</span>
                    {/if}
                    {#if currentWord.status === 'mastered'}
                      <span class="badge badge-green">✓ Đã thuộc</span>
                    {/if}
                  </div>
                  <div class="flip-hint">
                    <span>🔄 Bấm vào thẻ hoặc nhấn Space để lật mặt sau</span>
                  </div>
                </div>

                {#if frontLanguage === 'vi'}
                  <div class="card-body front-vietnamese">
                    <div class="label-side">MẶT TIẾNG VIỆT (GỢI NHỚ TỪ VỰNG &amp; CẤU TRÚC)</div>
                    <h2 class="meaning-large">{currentWord.meaning_vi}</h2>
                    <div class="syllables-hint">
                      <span class="hint-label">Phân tách âm tiết:</span> {currentWord.syllables || currentWord.term}
                    </div>
                    <div class="prompt-text">
                      Hãy đọc to từ tiếng Anh tương ứng trước khi bấm lật thẻ để kiểm tra phiên âm IPA &amp; ngữ âm!
                    </div>
                  </div>
                {:else}
                  <div class="card-body front-english">
                    <div class="label-side">MẶT TIẾNG ANH (CHUẨN CAMBRIDGE IPA)</div>
                    <h2 class="term-large">{currentWord.term}</h2>
                    <div class="ipa-row">
                      <span class="ipa-text">{currentWord.ipa}</span>
                      <button
                        class="btn-audio"
                        onclick={(e) => {
                          e.stopPropagation();
                          speakWord(currentWord.term, slowVoice ? 0.7 : 0.9);
                        }}
                        title="Phát âm chuẩn bản xứ"
                      >
                        🔊 Nghe đọc
                      </button>
                    </div>
                    <div class="syllables-hint">
                      <span class="hint-label">Âm tiết:</span> {currentWord.syllables || currentWord.term}
                    </div>
                  </div>
                {/if}

                <div class="card-footer">
                  <span class="footer-hint">Bấm vào bất kỳ đâu trên thẻ để xem mặt sau: Phân tích Nguyên âm • Phụ âm • Trọng âm • Ví dụ ➔</span>
                </div>
              </div>

              <!-- ================= BACK FACE ================= -->
              <div class="card-face card-back">
                <div class="card-header">
                  <div class="card-category">
                    <span class="badge badge-green">MẶT TIẾNG ANH &amp; PHONICS</span>
                    <span class="badge badge-indigo">{currentWord.grade || 'Lớp 7'}</span>
                    <span class="badge badge-purple">{currentWord.pos}</span>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="audio-controls" onclick={(e) => e.stopPropagation()}>
                    <button
                      class="btn-audio-pill"
                      onclick={() => speakWord(currentWord.term, 0.9)}
                      title="Nghe phát âm chuẩn (Normal 1.0x)"
                    >
                      🔊 Đọc chuẩn
                    </button>
                    <button
                      class="btn-audio-pill slow"
                      onclick={() => speakWord(currentWord.term, 0.65)}
                      title="Nghe phát âm chậm để soi khẩu hình âm (Slow 0.65x)"
                    >
                      🐢 Đọc chậm
                    </button>
                  </div>
                </div>

                <div class="card-body back-english">
                  <div class="term-ipa-block">
                    <h2 class="term-title">{currentWord.term}</h2>
                    <span class="ipa-pill">{currentWord.ipa}</span>
                    {#if currentWord.syllables}
                      <span class="syllables-pill">{currentWord.syllables}</span>
                    {/if}
                  </div>

                  <div class="vietnamese-def">
                    <span class="def-label">Nghĩa tiếng Việt:</span>
                    <span class="def-text">{currentWord.meaning_vi}</span>
                  </div>

                  <div class="phonics-breakdown-box">
                    <div class="phonics-row">
                      <div class="phonics-col vowels">
                        <span class="phonics-tag tag-vowel">🟡 Mô tả Nguyên âm:</span>
                        <p class="phonics-desc">{currentWord.vowels_detail}</p>
                      </div>
                      <div class="phonics-row-divider"></div>
                      <div class="phonics-col consonants">
                        <span class="phonics-tag tag-consonant">🔵 Mô tả Phụ âm:</span>
                        <p class="phonics-desc">{currentWord.consonants_detail}</p>
                      </div>
                    </div>

                    {#if currentWord.phonics_note}
                      <div class="phonics-note">
                        <span class="note-icon">📌</span>
                        <span class="note-text"><strong>Quy tắc trọng âm &amp; ngữ âm:</strong> {currentWord.phonics_note}</span>
                      </div>
                    {/if}
                  </div>

                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="example-box" onclick={(e) => e.stopPropagation()}>
                    <div class="example-header">
                      <span class="example-title">💡 Ví dụ thực tế trong câu:</span>
                      <button
                        class="btn-speak-example"
                        onclick={() => speakWord(currentWord.example_en, 0.85)}
                        title="Nghe đọc câu ví dụ"
                      >
                        🔊 Đọc câu
                      </button>
                    </div>
                    <div class="example-en">"{currentWord.example_en}"</div>
                    <div class="example-vi">↳ {currentWord.example_vi}</div>
                  </div>
                </div>

                <div class="card-footer back-footer">
                  <span class="footer-hint">🔄 Bấm để lật lại mặt trước</span>
                </div>
              </div>
            </div>
          </div>

          <button class="nav-side-btn" onclick={nextCard} aria-label="Từ tiếp theo" title="Thẻ tiếp theo (→)">
            Tiếp →
          </button>
        </div>

        <!-- Hàng nút hành động dưới thẻ -->
        <div class="deck-controls">
          <button class="btn-nav" onclick={prevCard}>← Thẻ trước</button>
          <div class="mastery-actions">
            <button class="btn-action review" onclick={() => markProgress('learning')}>
              <span class="action-icon">❌</span>
              <span>Cần ôn lại</span>
            </button>
            <button class="btn-action flip-main" onclick={flipCard}>
              <span class="action-icon">🔄</span>
              <span>{isFlipped ? 'Lật về mặt trước' : 'Lật xem mặt sau'}</span>
            </button>
            <button class="btn-action mastered" onclick={() => markProgress('mastered')}>
              <span class="action-icon">✅</span>
              <span>Đã thuộc từ này</span>
            </button>
          </div>
          <button class="btn-nav" onclick={nextCard}>Thẻ tiếp →</button>
        </div>
      </div>
    </section>

    <!-- ============ DANH SÁCH THẺ TỪ VỰNG TRONG BỘ LỌC (CHỌN NHANH KHÔNG CUỘN NGANG) ============ -->
    <section
      id="flashcards-word-list-grid"
      data-testid="flashcards-word-list-grid"
      aria-label="Danh sách thẻ từ vựng trong khối lớp đang chọn"
      class="word-grid-section"
    >
      <div class="section-header-row">
        <div>
          <span class="section-eyebrow">🗂️ DANH SÁCH THẺ TỪ VỰNG TRONG BỘ LỌC HIỆN TẠI ({displayWords.length} TỪ)</span>
          <h2 class="section-heading">Bấm Vào Bất Kỳ Thẻ Từ Vựng Nào Để Đưa Lên Bàn Lật 3D</h2>
        </div>
      </div>

      <div class="word-mini-cards-grid">
        {#each displayWords.slice(0, 36) as w, idx (w.id)}
          {@const activeCard = idx === currentIndex}
          <button
            type="button"
            onclick={() => {
              currentIndex = idx;
              isFlipped = false;
              if (typeof document !== 'undefined') {
                document.getElementById('inline-flashcard-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            class="word-mini-card {activeCard ? 'is-current' : ''}"
          >
            <div class="mini-card-top">
              <span class="mini-grade-badge">{w.grade || 'Lớp 7'}</span>
              <span class="mini-pos-badge">{w.pos}</span>
              {#if w.status === 'mastered'}
                <span class="mini-mastered">✓</span>
              {/if}
            </div>
            <div class="mini-term">{w.term}</div>
            <div class="mini-ipa">{w.ipa}</div>
            <div class="mini-meaning">{w.meaning_vi}</div>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

<!-- ============ CHẾ ĐỘ PHÓNG TO TOÀN MÀN HÌNH (TÙY CHỌN) ============ -->
{#if isStudyPopupOpen && currentWord}
  <div class="fc-popup-overlay" role="dialog" aria-modal="true" aria-label="Học flashcards toàn màn hình">
    <div class="fc-popup-inner">
      <div class="fc-topbar">
        <div class="fc-topbar-info">
          <span class="fc-title">🗂️ Flashcards Toàn Màn Hình — {currentWord.grade || 'K12'}</span>
          <span class="fc-counter">Thẻ <strong>{currentIndex + 1}</strong> / {displayWords.length}</span>
        </div>
        <button class="fc-close" onclick={closeStudyPopup} aria-label="Đóng popup">✕ Thu nhỏ về trang</button>
      </div>
      <div class="progress-track fc-progress">
        <div class="progress-fill" style="width: {((currentIndex + 1) / displayWords.length) * 100}%"></div>
      </div>
      <div class="card-area fc-card-area">
        <button class="fc-arrow fc-arrow-left" onclick={prevCard} aria-label="Từ trước">←</button>
        <div class="card-container">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="flashcard" class:flipped={isFlipped} onclick={flipCard}>
            <div class="card-face card-front">
              <div class="card-header">
                <div class="card-category">
                  <span class="badge badge-indigo">{currentWord.grade || 'Lớp 7'}</span>
                  <span class="badge badge-purple">{(currentWord.unit_id || 'unit1').toUpperCase()}</span>
                  <span class="badge badge-amber">{currentWord.pos}</span>
                </div>
                <div class="flip-hint"><span>🔄 Click hoặc Space để lật</span></div>
              </div>
              <div class="card-body front-vietnamese">
                <div class="label-side">MẶT TIẾNG VIỆT</div>
                <h2 class="meaning-large">{currentWord.meaning_vi}</h2>
                <div class="syllables-hint">
                  <span class="hint-label">Cấu trúc từ:</span> {currentWord.syllables || currentWord.term}
                </div>
              </div>
            </div>
            <div class="card-face card-back">
              <div class="card-header">
                <div class="card-category">
                  <span class="badge badge-green">MẶT TIẾNG ANH &amp; PHONICS</span>
                  <span class="badge badge-purple">{currentWord.pos}</span>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="audio-controls" onclick={(e) => e.stopPropagation()}>
                  <button class="btn-audio-pill" onclick={() => speakWord(currentWord.term, 0.9)}>🔊 Đọc chuẩn</button>
                  <button class="btn-audio-pill slow" onclick={() => speakWord(currentWord.term, 0.65)}>🐢 Đọc chậm</button>
                </div>
              </div>
              <div class="card-body back-english">
                <div class="term-ipa-block">
                  <h2 class="term-title">{currentWord.term}</h2>
                  <span class="ipa-pill">{currentWord.ipa}</span>
                </div>
                <div class="vietnamese-def">
                  <span class="def-label">Nghĩa tiếng Việt:</span>
                  <span class="def-text">{currentWord.meaning_vi}</span>
                </div>
                <div class="phonics-breakdown-box">
                  <div class="phonics-row">
                    <div class="phonics-col vowels">
                      <span class="phonics-tag tag-vowel">🟡 Mô tả Nguyên âm:</span>
                      <p class="phonics-desc">{currentWord.vowels_detail}</p>
                    </div>
                    <div class="phonics-row-divider"></div>
                    <div class="phonics-col consonants">
                      <span class="phonics-tag tag-consonant">🔵 Mô tả Phụ âm:</span>
                      <p class="phonics-desc">{currentWord.consonants_detail}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="fc-arrow fc-arrow-right" onclick={nextCard} aria-label="Từ tiếp">→</button>
      </div>
      <div class="fc-actions">
        <button class="btn-action review" onclick={() => markProgress('learning')}>❌ Cần ôn lại</button>
        <button class="btn-action flip-main" onclick={flipCard}>🔄 {isFlipped ? 'Lật lại' : 'Lật thẻ'}</button>
        <button class="btn-action mastered" onclick={() => markProgress('mastered')}>✅ Đã thuộc</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .flashcards-page {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .page-top {
    background: white;
    padding: 24px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .mode-badge {
    display: inline-block;
    background: #eef2ff;
    color: #4f46e5;
    padding: 5px 14px;
    border-radius: 9999px;
    font-size: 0.78rem;
    font-weight: 800;
    margin-bottom: 8px;
  }

  .page-title {
    font-size: 1.55rem;
    color: #0f172a;
    font-weight: 800;
    margin-bottom: 6px;
    line-height: 1.3;
  }

  .page-desc {
    color: #475569;
    font-size: 0.94rem;
    max-width: 960px;
    line-height: 1.6;
  }

  /* ============ GRADE SELECTION CARDS GRID (NO SLIDE-BAR, NO TRUNCATE) ============ */
  .grade-cards-section,
  .unit-cards-section {
    border-top: 1px solid #e2e8f0;
    padding-top: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .section-eyebrow {
    display: block;
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #047857;
  }

  .section-heading {
    font-size: 1.05rem;
    font-weight: 800;
    color: #0f172a;
    margin-top: 2px;
  }

  .total-badge {
    font-size: 0.82rem;
    background: #f1f5f9;
    color: #334155;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
  }

  .grade-cards-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 12px;
  }

  @media (min-width: 640px) {
    .grade-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1024px) {
    .grade-cards-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .grade-select-card {
    text-align: left;
    padding: 14px 16px;
    border-radius: 16px;
    border: 2px solid #e2e8f0;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.16s ease;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03);
  }

  .grade-select-card:hover {
    border-color: #10b981;
    background: #f0fdf4;
    transform: translateY(-2px);
  }

  .grade-select-card.is-selected {
    border-color: #059669;
    background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
    box-shadow: 0 6px 18px rgba(5, 150, 105, 0.14);
  }

  .grade-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .grade-card-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .grade-card-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .cefr-pill {
    font-size: 0.7rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
  }

  .count-pill {
    font-size: 0.72rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
  }

  .count-pill.count-active {
    background: #059669;
    color: #ffffff;
  }

  .grade-card-title {
    font-size: 0.95rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.35;
    word-break: break-word;
  }

  .grade-card-desc {
    font-size: 0.8rem;
    color: #475569;
    line-height: 1.45;
    word-break: break-word;
  }

  /* ============ UNIT PILLS WRAP (FLEX-WRAP, NO SLIDE-BAR) ============ */
  .unit-pills-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .unit-card-btn {
    padding: 8px 14px;
    border-radius: 12px;
    border: 1.5px solid #cbd5e1;
    background: #f8fafc;
    color: #1e293b;
    font-size: 0.83rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }

  .unit-card-btn:hover {
    border-color: #4f46e5;
    background: #eef2ff;
    color: #312e81;
  }

  .unit-card-btn.is-active {
    background: #4f46e5;
    border-color: #4338ca;
    color: #ffffff;
    box-shadow: 0 3px 10px rgba(79, 70, 229, 0.25);
  }

  .unit-count {
    font-size: 0.75rem;
    opacity: 0.85;
  }

  .btn-reset-filter {
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid #fda4af;
    background: #fff1f2;
    color: #be123c;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  /* ============ FILTERS BAR ============ */
  .filters-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.86rem;
    font-weight: 700;
    color: #1e293b;
  }

  .search-group {
    flex: 1;
    min-width: 240px;
  }

  .search-input {
    flex: 1;
    min-height: 42px;
    padding: 8px 14px;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    font-size: 0.86rem;
    color: #0f172a;
  }

  .filter-group select {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    background: white;
    font-size: 0.85rem;
    color: #0f172a;
    min-height: 42px;
    cursor: pointer;
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }

  .btn-tool {
    padding: 8px 14px;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    background: white;
    font-size: 0.83rem;
    font-weight: 700;
    color: #1e293b;
    cursor: pointer;
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-tool.active {
    background: #eef2ff;
    color: #4f46e5;
    border-color: #818cf8;
  }

  .btn-start-study {
    background: linear-gradient(135deg, #4f46e5, #7c3aed) !important;
    color: #fff !important;
    border: none !important;
  }

  /* ============ INLINE 3D FLASHCARD WORKSPACE (ZERO VERTICAL SCROLLBAR) ============ */
  .inline-study-workspace {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    padding: 24px;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .progress-wrap {
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }

  .progress-info {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 0.86rem;
    color: #475569;
  }

  .card-counter strong {
    color: #0f172a;
  }

  .keyboard-tip {
    font-size: 0.78rem;
    color: #64748b;
  }

  .progress-track {
    width: 100%;
    height: 8px;
    background: #e2e8f0;
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #059669);
    transition: width 0.3s ease;
  }

  .card-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    width: 100%;
  }

  .card-stage-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    max-width: 960px;
  }

  .nav-side-btn {
    padding: 12px 16px;
    border-radius: 14px;
    border: 1.5px solid #cbd5e1;
    background: #f8fafc;
    color: #0f172a;
    font-weight: 800;
    font-size: 0.85rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .nav-side-btn:hover {
    background: #4f46e5;
    border-color: #4f46e5;
    color: #ffffff;
  }

  @media (max-width: 768px) {
    .nav-side-btn {
      display: none;
    }
  }

  /* Card container uses auto height via CSS Grid so content is NEVER trapped in a scrollbar */
  .card-container {
    max-width: 760px;
    width: 100%;
    perspective: 1200px;
    position: relative;
    margin: 0 auto;
  }

  .flashcard {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    transform-style: preserve-3d;
    transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
  }

  .flashcard.flipped {
    transform: rotateY(180deg);
  }

  .card-face {
    grid-area: 1 / 1;
    width: 100%;
    min-height: 430px;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    background: #ffffff;
    color: #0f172a;
    border-radius: 22px;
    border: 2px solid #cbd5e1;
    box-shadow: 0 12px 28px -6px rgba(15, 23, 42, 0.1);
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-sizing: border-box;
  }

  .card-front {
    transform: rotateY(0deg);
    z-index: 2;
  }

  .card-back {
    transform: rotateY(180deg);
    z-index: 1;
  }

  .card-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    border-bottom: 1px dashed #cbd5e1;
    padding-bottom: 12px;
  }

  .card-category {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .badge {
    font-size: 0.72rem;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
  }

  .badge-indigo {
    background: #e0e7ff;
    color: #3730a3;
  }

  .badge-purple {
    background: #f3e8ff;
    color: #6b21a8;
  }

  .badge-amber {
    background: #fef3c7;
    color: #92400e;
  }

  .badge-sky {
    background: #e0f2fe;
    color: #0369a1;
  }

  .badge-green {
    background: #dcfce7;
    color: #15803d;
  }

  .flip-hint {
    font-size: 0.78rem;
    color: #64748b;
    font-weight: 600;
  }

  .audio-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-audio {
    padding: 8px 14px;
    border-radius: 9999px;
    background: #eef2ff;
    color: #4f46e5;
    border: 1px solid #c7d2fe;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-audio-pill {
    padding: 8px 14px;
    border-radius: 9999px;
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #c7d2fe;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-audio-pill.slow {
    background: #fef3c7;
    color: #92400e;
    border-color: #fde68a;
  }

  .front-vietnamese,
  .front-english {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 28px 12px;
    flex: 1;
    gap: 12px;
  }

  .label-side {
    font-size: 0.75rem;
    font-weight: 800;
    color: #64748b;
    letter-spacing: 0.08em;
  }

  .meaning-large,
  .term-large {
    font-size: 2.1rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.3;
  }

  .ipa-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .ipa-text {
    font-family: monospace;
    font-size: 1.2rem;
    font-weight: 700;
    color: #4f46e5;
    background: #eef2ff;
    padding: 4px 12px;
    border-radius: 8px;
  }

  .syllables-hint {
    background: #f1f5f9;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 0.85rem;
    color: #334155;
    font-weight: 600;
  }

  .prompt-text {
    font-size: 0.88rem;
    color: #64748b;
    max-width: 520px;
  }

  .back-english {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0;
    flex: 1;
  }

  .term-ipa-block {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .term-title {
    font-size: 1.85rem;
    font-weight: 800;
    color: #4f46e5;
  }

  .ipa-pill {
    background: #f1f5f9;
    color: #0f172a;
    padding: 3px 10px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 1.05rem;
    font-weight: 700;
    border: 1px solid #cbd5e1;
  }

  .syllables-pill {
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #c7d2fe;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .vietnamese-def {
    font-size: 1.02rem;
    color: #0f172a;
    background: #f8fafc;
    padding: 10px 14px;
    border-radius: 10px;
    border-left: 4px solid #4f46e5;
  }

  .def-label {
    font-weight: 700;
    color: #475569;
    font-size: 0.85rem;
    margin-right: 6px;
  }

  .def-text {
    font-weight: 800;
    color: #0f172a;
  }

  .phonics-breakdown-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .phonics-row {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    gap: 12px;
  }

  .phonics-row-divider {
    background: #cbd5e1;
  }

  .phonics-tag {
    display: block;
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .tag-vowel {
    color: #b45309;
  }

  .tag-consonant {
    color: #0284c7;
  }

  .phonics-desc {
    font-size: 0.84rem;
    line-height: 1.5;
    color: #334155;
  }

  .phonics-note {
    background: #faf5ff;
    border-top: 1px dashed #d8b4fe;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 0.82rem;
    color: #6b21a8;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .example-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 10px 14px;
  }

  .example-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .example-title {
    font-size: 0.78rem;
    font-weight: 800;
    color: #4f46e5;
    text-transform: uppercase;
  }

  .btn-speak-example {
    font-size: 0.78rem;
    color: #15803d;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 8px;
    background: #dcfce7;
    border: 1px solid #86efac;
    cursor: pointer;
  }

  .example-en {
    font-size: 0.9rem;
    font-weight: 600;
    color: #0f172a;
  }

  .example-vi {
    font-size: 0.84rem;
    color: #475569;
    margin-top: 2px;
  }

  .card-footer {
    border-top: 1px dashed #cbd5e1;
    padding-top: 10px;
    text-align: center;
  }

  .footer-hint {
    font-size: 0.78rem;
    color: #64748b;
    font-weight: 600;
  }

  .deck-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 760px;
    gap: 12px;
  }

  .btn-nav {
    background: white;
    border: 1px solid #cbd5e1;
    padding: 10px 18px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.88rem;
    color: #0f172a;
    cursor: pointer;
  }

  .mastery-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 0.86rem;
    cursor: pointer;
  }

  .btn-action.review {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fca5a5;
  }

  .btn-action.flip-main {
    background: #eef2ff;
    color: #3730a3;
    border: 1px solid #c7d2fe;
  }

  .btn-action.mastered {
    background: #d1fae5;
    color: #047857;
    border: 1px solid #6ee7b7;
  }

  /* ============ WORD LIST MINI-CARDS GRID ============ */
  .word-grid-section {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .word-mini-cards-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 10px;
  }

  @media (min-width: 640px) {
    .word-mini-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1024px) {
    .word-mini-cards-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .word-mini-card {
    text-align: left;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1.5px solid #e2e8f0;
    background: #f8fafc;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: all 0.15s;
  }

  .word-mini-card:hover {
    border-color: #6366f1;
    background: #eef2ff;
  }

  .word-mini-card.is-current {
    border-color: #4f46e5;
    background: #eef2ff;
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
  }

  .mini-card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .mini-grade-badge {
    font-size: 0.68rem;
    font-weight: 800;
    padding: 1px 7px;
    border-radius: 999px;
    background: #e0e7ff;
    color: #3730a3;
  }

  .mini-pos-badge {
    font-size: 0.68rem;
    font-weight: 700;
    color: #64748b;
  }

  .mini-mastered {
    margin-left: auto;
    color: #059669;
    font-weight: 900;
  }

  .mini-term {
    font-size: 0.96rem;
    font-weight: 800;
    color: #0f172a;
  }

  .mini-ipa {
    font-size: 0.78rem;
    font-family: monospace;
    color: #4f46e5;
  }

  .mini-meaning {
    font-size: 0.8rem;
    color: #334155;
    line-height: 1.4;
  }

  /* ============ FULLSCREEN POPUP ============ */
  .fc-popup-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    overflow-y: auto;
    background: rgba(248, 250, 252, 0.97);
    backdrop-filter: blur(6px);
  }

  .fc-popup-inner {
    min-height: 100%;
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .fc-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 16px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
  }

  .fc-topbar-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .fc-title {
    font-weight: 800;
    color: #0f172a;
    font-size: 15px;
  }

  .fc-counter {
    font-size: 13px;
    color: #475569;
  }

  .fc-close {
    padding: 8px 16px;
    border-radius: 12px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #0f172a;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }

  .fc-card-area {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fc-arrow {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    background: #0f172a;
    color: #ffffff;
    font-weight: 900;
    border: none;
    cursor: pointer;
  }

  .fc-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .empty-state {
    text-align: center;
    background: white;
    padding: 48px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
    max-width: 520px;
    margin: 24px auto;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .btn-primary {
    margin-top: 14px;
    padding: 10px 20px;
    border-radius: 12px;
    background: #4f46e5;
    color: white;
    font-weight: 700;
    border: none;
    cursor: pointer;
  }

  @media (max-width: 680px) {
    .phonics-row {
      grid-template-columns: 1fr;
    }
    .phonics-row-divider {
      display: none;
    }
    .deck-controls {
      flex-direction: column;
    }
  }
</style>
