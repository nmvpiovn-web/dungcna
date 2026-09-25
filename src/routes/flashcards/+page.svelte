<script>
  import { onMount } from 'svelte';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { saveUserProgress } from '$lib/staticDb.js';

  let { data } = $props();

  let words = $state([...data.words]);
  let currentIndex = $state(0);
  let isFlipped = $state(false);
  let selectedUnit = $state(data.currentUnit || 'all');
  let autoPlay = $state(false);
  let autoPlayTimer = $state(null);
  let studyFilter = $state('all'); // 'all', 'need_review', 'mastered'
  let frontLanguage = $state('vi'); // 'vi' (Mặt trước TV, Mặt sau TA) or 'en'
  let slowVoice = $state(false);

  // Filtered list
  let displayWords = $derived.by(() => {
    let list = words;
    if (selectedUnit !== 'all') {
      list = list.filter(w => w.unit_id === selectedUnit);
    }
    if (studyFilter === 'need_review') {
      list = list.filter(w => w.status !== 'mastered');
    } else if (studyFilter === 'mastered') {
      list = list.filter(w => w.status === 'mastered');
    }
    return list;
  });

  let currentWord = $derived(displayWords[currentIndex] || null);

  function flipCard() {
    isFlipped = !isFlipped;
    playAudioFeedback('flip');
    // If flipped to English side, automatically pronounce if desired
    if (currentWord) {
      if ((frontLanguage === 'vi' && isFlipped) || (frontLanguage === 'en' && !isFlipped)) {
        speakWord(currentWord.term, slowVoice ? 0.7 : 0.9);
      }
    }
  }

  function nextCard() {
    if (currentIndex < displayWords.length - 1) {
      currentIndex++;
      isFlipped = false;
    } else {
      // Reached end
      currentIndex = 0;
      isFlipped = false;
    }
  }

  function prevCard() {
    if (currentIndex > 0) {
      currentIndex--;
      isFlipped = false;
    }
  }

  function shuffleCards() {
    const array = [...displayWords];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    words = array;
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
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      flipCard();
    } else if (e.code === 'ArrowRight') {
      nextCard();
    } else if (e.code === 'ArrowLeft') {
      prevCard();
    } else if (e.code === 'KeyA' && currentWord) {
      speakWord(currentWord.term, slowVoice ? 0.7 : 0.9);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
    };
  });
</script>

<div class="flashcards-page">
  <!-- Header Controls -->
  <div class="page-top">
    <div class="title-area">
      <div class="mode-badge">
        <span>🗂️ CHẾ ĐỘ LẬT THẺ THÔNG MINH</span>
      </div>
      <h1 class="page-title">Tiếng Anh Cô Dung — Flashcard Từ Vựng Chuẩn Ngữ Âm</h1>
      <p class="page-desc">
        Học từ vựng đa giác quan cùng Tiếng Anh Cô Dung: <strong>1 mặt tiếng Việt</strong> gợi nhớ, <strong>1 mặt tiếng Anh</strong> phát âm bản xứ, phân tích chi tiết <strong>nguyên âm, phụ âm, trọng âm</strong> và câu ví dụ ngữ cảnh.
      </p>
    </div>

    <!-- Filters & Settings -->
    <div class="filters-bar">
      <div class="filter-group">
        <label for="unit-select">Chủ điểm:</label>
        <select id="unit-select" bind:value={selectedUnit} onchange={() => { currentIndex = 0; isFlipped = false; }}>
          <option value="all">Tất cả Unit (Tổng hợp đề thi)</option>
          {#each data.units as unit}
            <option value={unit.id}>{unit.icon} {unit.name}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-status">Trạng thái:</label>
        <select id="filter-status" bind:value={studyFilter} onchange={() => { currentIndex = 0; isFlipped = false; }}>
          <option value="all">Tất cả từ ({data.words.length})</option>
          <option value="need_review">Chưa thuộc ({data.words.filter(w => w.status !== 'mastered').length})</option>
          <option value="mastered">Đã thuộc ({data.words.filter(w => w.status === 'mastered').length})</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="front-lang">Mặt trước:</label>
        <select id="front-lang" bind:value={frontLanguage}>
          <option value="vi">🇻🇳 Tiếng Việt (Khuyến nghị)</option>
          <option value="en">🇬🇧 Tiếng Anh</option>
        </select>
      </div>

      <div class="action-buttons">
        <button class="btn-tool" onclick={shuffleCards} title="Xáo trộn ngẫu nhiên">
          <span>🔀 Xáo thẻ</span>
        </button>
        <button class="btn-tool" class:active={autoPlay} onclick={toggleAutoPlay} title="Tự động lật và chuyển thẻ">
          <span>{autoPlay ? '⏸️ Tạm dừng' : '▶️ Tự chạy'}</span>
        </button>
      </div>
    </div>
  </div>

  {#if displayWords.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🎉</div>
      <h3>Không có từ vựng nào trong bộ lọc này!</h3>
      <p>Bạn đã hoàn thành tất cả từ hoặc bộ lọc chưa có từ tương ứng.</p>
      <button class="btn-primary" onclick={() => { studyFilter = 'all'; selectedUnit = 'all'; }}>
        Xem lại tất cả từ vựng
      </button>
    </div>
  {:else if currentWord}
    <!-- Progress Indicator -->
    <div class="progress-wrap">
      <div class="progress-info">
        <span class="card-counter">Thẻ <strong>{currentIndex + 1}</strong> / {displayWords.length}</span>
        <span class="keyboard-tip">💡 Phím tắt: [Space] Lật thẻ • [← / →] Đổi thẻ • [A] Nghe phát âm</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: {((currentIndex + 1) / displayWords.length) * 100}%"></div>
      </div>
    </div>

    <!-- The 3D Flashcard Container -->
    <div class="card-area">
      <div class="card-container">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flashcard"
          class:flipped={isFlipped}
          onclick={flipCard}
        >
          <!-- ================= FRONT FACE ================= -->
          <div class="card-face card-front">
            <div class="card-header">
              <div class="card-category">
                <span class="badge badge-purple">{currentWord.unit_id.toUpperCase()}</span>
                <span class="badge badge-amber">{currentWord.pos}</span>
                {#if currentWord.status === 'mastered'}
                  <span class="badge badge-green">✓ Đã thuộc</span>
                {/if}
              </div>
              <div class="flip-hint">
                <span>🔄 Click hoặc Space để lật</span>
              </div>
            </div>

            <!-- Content depends on frontLanguage setting -->
            {#if frontLanguage === 'vi'}
              <!-- Mặt trước Tiếng Việt (gợi nhớ từ) -->
              <div class="card-body front-vietnamese">
                <div class="label-side">MẶT TIẾNG VIỆT (GỢI NHỚ NGHĨA)</div>
                <h2 class="meaning-large">{currentWord.meaning_vi}</h2>
                <div class="syllables-hint">
                  <span class="hint-label">Cấu trúc từ:</span> {currentWord.syllables || 'Từ vựng SGK'}
                </div>
                <div class="prompt-text">
                  Bạn có nhớ từ tiếng Anh và cách phát âm của từ này không?
                </div>
              </div>
            {:else}
              <!-- Mặt trước Tiếng Anh -->
              <div class="card-body front-english">
                <div class="label-side">MẶT TIẾNG ANH</div>
                <h2 class="term-large">{currentWord.term}</h2>
                <div class="ipa-row">
                  <span class="ipa-text">{currentWord.ipa}</span>
                  <button
                    class="btn-audio"
                    onclick={(e) => { e.stopPropagation(); speakWord(currentWord.term, slowVoice ? 0.7 : 0.9); }}
                    title="Phát âm"
                  >
                    🔊
                  </button>
                </div>
              </div>
            {/if}

            <div class="card-footer">
              <span class="footer-hint">Bấm vào thẻ để xem đáp án & phân tích ngữ âm ➔</span>
            </div>
          </div>

          <!-- ================= BACK FACE ================= -->
          <div class="card-face card-back">
            <div class="card-header">
              <div class="card-category">
                <span class="badge badge-green">MẶT TIẾNG ANH & PHONICS</span>
                <span class="badge badge-purple">{currentWord.pos}</span>
              </div>
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
              <!-- Từ tiếng Anh & Phiên âm IPA -->
              <div class="term-ipa-block">
                <h2 class="term-title">{currentWord.term}</h2>
                <span class="ipa-pill">{currentWord.ipa}</span>
                {#if currentWord.syllables}
                  <span class="syllables-pill">{currentWord.syllables}</span>
                {/if}
              </div>

              <!-- Nghĩa tiếng Việt -->
              <div class="vietnamese-def">
                <span class="def-label">Nghĩa tiếng Việt:</span>
                <span class="def-text">{currentWord.meaning_vi}</span>
              </div>

              <!-- KHỐI MÔ TẢ NGUYÊN ÂM & PHỤ ÂM CHI TIẾT (Theo yêu cầu người dùng) -->
              <div class="phonics-breakdown-box">
                <div class="phonics-row">
                  <div class="phonics-col vowels">
                    <span class="phonics-tag tag-vowel">🟡 Mô tả Nguyên âm:</span>
                    <p class="phonics-desc">{currentWord.vowels_detail || 'Đang cập nhật phân tích nguyên âm'}</p>
                  </div>
                  <div class="phonics-row-divider"></div>
                  <div class="phonics-col consonants">
                    <span class="phonics-tag tag-consonant">🔵 Mô tả Phụ âm:</span>
                    <p class="phonics-desc">{currentWord.consonants_detail || 'Đang cập nhật phân tích phụ âm'}</p>
                  </div>
                </div>

                {#if currentWord.phonics_note}
                  <div class="phonics-note">
                    <span class="note-icon">📌</span>
                    <span class="note-text"><strong>Quy tắc trọng âm:</strong> {currentWord.phonics_note}</span>
                  </div>
                {/if}
              </div>

              <!-- CÂU VÍ DỤ MINH HỌA -->
              <div class="example-box" onclick={(e) => e.stopPropagation()}>
                <div class="example-header">
                  <span class="example-title">💡 Ví dụ thực tế:</span>
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

      <!-- Action Navigation Buttons -->
      <div class="deck-controls">
        <button class="btn-nav prev" onclick={prevCard} disabled={currentIndex === 0}>
          <span>← Từ trước</span>
        </button>

        <div class="mastery-actions">
          <button class="btn-action review" onclick={() => markProgress('learning')}>
            <span class="action-icon">❌</span>
            <span>Chưa nhớ</span>
          </button>
          <button class="btn-action flip-main" onclick={flipCard}>
            <span class="action-icon">🔄</span>
            <span>{isFlipped ? 'Lật lại' : 'Lật thẻ'}</span>
          </button>
          <button class="btn-action mastered" onclick={() => markProgress('mastered')}>
            <span class="action-icon">✅</span>
            <span>Đã thuộc</span>
          </button>
        </div>

        <button class="btn-nav next" onclick={nextCard} disabled={currentIndex === displayWords.length - 1}>
          <span>Từ tiếp →</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .flashcards-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .page-top {
    background: white;
    padding: 24px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-sm);
  }

  .mode-badge {
    display: inline-block;
    background: #eef2ff;
    color: #4f46e5;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .page-title {
    font-size: 1.6rem;
    color: #0f172a;
    font-weight: 800;
    margin-bottom: 6px;
  }

  .page-desc {
    color: var(--text-muted);
    font-size: 0.95rem;
    max-width: 900px;
    line-height: 1.6;
  }

  .filters-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid var(--border-color);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .filter-group select {
    padding: 7px 12px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
    background: white;
    font-size: 0.88rem;
    outline: none;
    cursor: pointer;
  }

  .filter-group select:focus {
    border-color: var(--primary);
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .btn-tool {
    padding: 7px 14px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
    background: white;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main);
    transition: all 0.15s;
  }

  .btn-tool:hover {
    background: var(--bg-surface);
  }

  .btn-tool.active {
    background: var(--primary-light);
    color: var(--primary-hover);
    border-color: var(--primary-border);
  }

  /* Progress Bar */
  .progress-wrap {
    max-width: 680px;
    margin: 0 auto;
    width: 100%;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .card-counter strong {
    color: var(--text-main);
    font-size: 1rem;
  }

  .keyboard-tip {
    font-size: 0.78rem;
    color: var(--text-sub);
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

  /* Card Area */
  .card-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .card-container {
    max-width: 680px;
    width: 100%;
    height: 480px;
  }

  .flashcard {
    height: 100%;
    min-height: 480px;
  }

  .card-face {
    height: 100%;
    overflow-y: auto;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px dashed #e2e8f0;
    padding-bottom: 12px;
  }

  .card-category {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .flip-hint {
    font-size: 0.8rem;
    color: var(--text-sub);
    font-weight: 500;
  }

  .audio-controls {
    display: flex;
    gap: 6px;
  }

  .btn-audio-pill {
    padding: 4px 10px;
    border-radius: 9999px;
    background: var(--primary-light);
    color: var(--primary-hover);
    border: 1px solid var(--primary-border);
    font-size: 0.78rem;
    font-weight: 700;
    transition: all 0.15s;
  }

  .btn-audio-pill:hover {
    background: var(--primary);
    color: white;
  }

  .btn-audio-pill.slow {
    background: #fef3c7;
    color: #92400e;
    border-color: #fde68a;
  }

  .btn-audio-pill.slow:hover {
    background: #f59e0b;
    color: white;
  }

  /* Front Vietnamese Layout */
  .front-vietnamese {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 30px 10px;
    flex: 1;
  }

  .label-side {
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--text-sub);
    letter-spacing: 0.08em;
    margin-bottom: 12px;
  }

  .meaning-large {
    font-size: 2.2rem;
    font-weight: 800;
    color: #0f172a;
    font-family: 'Lexend', sans-serif;
    margin-bottom: 16px;
    line-height: 1.3;
  }

  .syllables-hint {
    background: var(--bg-surface);
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: 12px;
  }

  .prompt-text {
    font-size: 0.9rem;
    color: var(--text-sub);
    font-style: italic;
  }

  /* Back English Layout */
  .back-english {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 0;
    flex: 1;
  }

  .term-ipa-block {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .term-title {
    font-size: 1.9rem;
    font-weight: 800;
    color: #047857;
    font-family: 'Lexend', sans-serif;
  }

  .ipa-pill {
    background: #f1f5f9;
    color: #334155;
    padding: 3px 10px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .syllables-pill {
    background: #e0f2fe;
    color: #0369a1;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .vietnamese-def {
    font-size: 1.05rem;
    color: #1e293b;
    background: #f8fafc;
    padding: 8px 12px;
    border-radius: var(--border-radius-sm);
    border-left: 4px solid var(--primary);
  }

  .def-label {
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-right: 6px;
  }

  .def-text {
    font-weight: 700;
    color: #0f172a;
  }

  /* PHONICS BREAKDOWN BOX */
  .phonics-breakdown-box {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: var(--border-radius-md);
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
    background: #e2e8f0;
  }

  .phonics-tag {
    display: block;
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }

  .tag-vowel {
    color: #b45309;
  }

  .tag-consonant {
    color: #1d4ed8;
  }

  .phonics-desc {
    font-size: 0.82rem;
    line-height: 1.45;
    color: #334155;
  }

  .phonics-note {
    background: #faf5ff;
    border-top: 1px dashed #e9d5ff;
    padding: 8px 10px;
    border-radius: var(--border-radius-sm);
    font-size: 0.8rem;
    color: #6b21a8;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* EXAMPLE SENTENCE BOX */
  .example-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: var(--border-radius-md);
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
    color: #166534;
    text-transform: uppercase;
  }

  .btn-speak-example {
    font-size: 0.75rem;
    color: #15803d;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    background: #dcfce7;
  }

  .btn-speak-example:hover {
    background: #bbf7d0;
  }

  .example-en {
    font-size: 0.92rem;
    font-weight: 600;
    color: #14532d;
    font-style: italic;
  }

  .example-vi {
    font-size: 0.82rem;
    color: #166534;
    margin-top: 2px;
  }

  .card-footer {
    border-top: 1px dashed #e2e8f0;
    padding-top: 10px;
    text-align: center;
  }

  .footer-hint {
    font-size: 0.78rem;
    color: var(--text-sub);
  }

  /* Deck controls */
  .deck-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 680px;
    gap: 12px;
  }

  .btn-nav {
    background: white;
    border: 1px solid var(--border-color);
    padding: 10px 18px;
    border-radius: var(--border-radius-md);
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text-main);
    transition: all 0.15s;
  }

  .btn-nav:hover:not(:disabled) {
    background: var(--bg-surface);
  }

  .btn-nav:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mastery-actions {
    display: flex;
    gap: 10px;
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: var(--border-radius-md);
    font-weight: 700;
    font-size: 0.88rem;
    transition: all 0.15s;
  }

  .btn-action.review {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fca5a5;
  }

  .btn-action.review:hover {
    background: #fecaca;
  }

  .btn-action.flip-main {
    background: white;
    color: var(--text-main);
    border: 1px solid var(--border-color);
  }

  .btn-action.flip-main:hover {
    background: var(--bg-surface);
  }

  .btn-action.mastered {
    background: #d1fae5;
    color: #047857;
    border: 1px solid #6ee7b7;
  }

  .btn-action.mastered:hover {
    background: #a7f3d0;
  }

  .empty-state {
    text-align: center;
    background: white;
    padding: 48px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    max-width: 500px;
    margin: 40px auto;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
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
    .mastery-actions {
      width: 100%;
      justify-content: center;
    }
  }
</style>
