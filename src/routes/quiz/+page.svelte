<script>
  import { onMount, onDestroy } from 'svelte';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { saveUserProgress, saveGameScoreLocally } from '$lib/staticDb.js';

  let { data } = $props();

  // Settings
  let quizMode = $state('typing'); // 'typing', 'mcq', 'context'
  let selectedUnit = $state('all');
  let questionCount = $state(10);
  let isStarted = $state(false);
  let isFinished = $state(false);

  // Active quiz state
  let currentQuestionIndex = $state(0);
  let quizQuestions = $state([]);
  let typedAnswer = $state('');
  let selectedOption = $state(null);
  let isAnswerChecked = $state(false);
  let isCorrect = $state(false);
  let score = $state(0);
  let streak = $state(0);
  let hintGiven = $state(false);
  let userResults = $state([]);

  // Filter pool
  let wordPool = $derived.by(() => {
    if (selectedUnit === 'all') return data.words;
    return data.words.filter(w => w.unit_id === selectedUnit);
  });

  function startQuiz() {
    let pool = [...wordPool];
    if (pool.length === 0) {
      alert('Không có từ vựng nào trong danh mục này!');
      return;
    }

    // Shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const count = Math.min(questionCount, pool.length);
    const selectedWords = pool.slice(0, count);

    // Build quiz questions based on mode
    quizQuestions = selectedWords.map((word) => {
      if (quizMode === 'mcq') {
        // Generate 4 options: 1 correct + 3 random distractors
        const distractors = data.words
          .filter(w => w.id !== word.id)
          .sort(() => 0.5 - Math.random())
          .slice(0, 3);
        const options = [word, ...distractors].sort(() => 0.5 - Math.random());
        return {
          type: 'mcq',
          word,
          prompt: word.meaning_vi,
          correctAnswer: word.term,
          options: options.map(o => o.term)
        };
      } else if (quizMode === 'context') {
        // Sentence fill-in
        const sentenceWithBlank = word.example_en.replace(
          new RegExp(word.term, 'gi'),
          '______'
        );
        const distractors = data.words
          .filter(w => w.id !== word.id)
          .sort(() => 0.5 - Math.random())
          .slice(0, 3);
        const options = [word.term, ...distractors.map(d => d.term)].sort(() => 0.5 - Math.random());
        return {
          type: 'context',
          word,
          prompt: sentenceWithBlank,
          subPrompt: word.example_vi,
          correctAnswer: word.term,
          options
        };
      } else {
        // Typing mode
        return {
          type: 'typing',
          word,
          prompt: word.meaning_vi,
          correctAnswer: word.term
        };
      }
    });

    currentQuestionIndex = 0;
    score = 0;
    streak = 0;
    userResults = [];
    isStarted = true;
    isFinished = false;
    resetQuestionState();
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
  }

  // Thoát quiz: đóng popup + mở lại scroll nền
  function quitQuiz() {
    isStarted = false;
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  });

  function resetQuestionState() {
    typedAnswer = '';
    selectedOption = null;
    isAnswerChecked = false;
    isCorrect = false;
    hintGiven = false;
  }

  let currentQ = $derived(quizQuestions[currentQuestionIndex] || null);

  function checkAnswer(answerToCheck = null) {
    if (isAnswerChecked || !currentQ) return;

    let ans = '';
    if (quizMode === 'typing') {
      ans = (answerToCheck || typedAnswer).trim().toLowerCase();
    } else {
      ans = (selectedOption || '').trim().toLowerCase();
    }

    const correct = currentQ.correctAnswer.trim().toLowerCase();
    isCorrect = ans === correct;

    if (isCorrect) {
      score++;
      streak++;
      playAudioFeedback('correct');
    } else {
      streak = 0;
      playAudioFeedback('wrong');
    }

    // Pronounce the word
    speakWord(currentQ.word.term, 0.9);

    // Save to user results
    userResults.push({
      questionNum: currentQuestionIndex + 1,
      word: currentQ.word,
      prompt: currentQ.prompt,
      userAnswer: ans,
      correctAnswer: currentQ.correctAnswer,
      isCorrect
    });

    // Save progress locally
    saveUserProgress(currentQ.word.id, isCorrect);

    isAnswerChecked = true;
  }

  function giveHint() {
    if (!currentQ || hintGiven) return;
    hintGiven = true;
    const term = currentQ.correctAnswer;
    typedAnswer = term.slice(0, 2) + '_ '.repeat(Math.max(0, term.length - 2));
  }

  function nextQuestion() {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      currentQuestionIndex++;
      resetQuestionState();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    isFinished = true;
    playAudioFeedback('win');
    try {
      saveGameScoreLocally({
        gameMode: `quiz_${quizMode}`,
        playerName: 'Học sinh',
        score,
        totalQuestions: quizQuestions.length,
        correctAnswers: score
      });
    } catch (e) {
      console.error(e);
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      if (!isAnswerChecked && quizMode === 'typing' && typedAnswer.trim()) {
        checkAnswer();
      } else if (isAnswerChecked) {
        nextQuestion();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="quiz-page">
  {#if !isStarted}
    <!-- Setup Screen -->
    <div class="setup-container">
      <div class="setup-header">
        <div class="badge-quiz">✍️ CHẾ ĐỘ DÒ TỪ VỰNG</div>
        <h1 class="setup-title">Tiếng Anh Cô Dung — Kiểm Tra &amp; Dò Bài Từ Vựng</h1>
        <p class="setup-desc">
          Công cụ đắc lực của Tiếng Anh Cô Dung giúp giáo viên kiểm tra miệng hoặc học sinh tự kiểm tra độ nhớ từ. Đa dạng hình thức từ gõ chính tả (Spelling), trắc nghiệm 4 đáp án đến điền từ vào câu ngữ cảnh thực tế.
        </p>
      </div>

      <div class="setup-grid">
        <!-- Choose Mode -->
        <div class="setting-card">
          <h3 class="setting-title">1. Chọn hình thức dò từ:</h3>
          <div class="mode-options">
            <button
              class="mode-btn"
              class:active={quizMode === 'typing'}
              onclick={() => quizMode = 'typing'}
            >
              <div class="mode-icon">⌨️</div>
              <div class="mode-text">
                <span class="mode-name">Gõ chính tả (Spelling)</span>
                <span class="mode-sub">Hiện nghĩa tiếng Việt, học sinh tự gõ lại từ tiếng Anh chính xác (Khuyên dùng để thuộc từ)</span>
              </div>
            </button>

            <button
              class="mode-btn"
              class:active={quizMode === 'mcq'}
              onclick={() => quizMode = 'mcq'}
            >
              <div class="mode-icon">🔘</div>
              <div class="mode-text">
                <span class="mode-name">Trắc nghiệm 4 lựa chọn (MCQ)</span>
                <span class="mode-sub">Luyện phản xạ nhanh, chọn từ tiếng Anh tương ứng với nghĩa</span>
              </div>
            </button>

            <button
              class="mode-btn"
              class:active={quizMode === 'context'}
              onclick={() => quizMode = 'context'}
            >
              <div class="mode-icon">📝</div>
              <div class="mode-text">
                <span class="mode-name">Điền từ vào câu ngữ cảnh</span>
                <span class="mode-sub">Áp dụng từ vào câu ví dụ thực tế trong đề thi lớp 7</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Choose Scope -->
        <div class="setting-card">
          <h3 class="setting-title">2. Chọn phạm vi ôn tập:</h3>
          <div class="form-item">
            <label for="scope-unit">Chủ điểm bài học:</label>
            <select id="scope-unit" bind:value={selectedUnit}>
              <option value="all">Tất cả bài học ({data.words.length} từ)</option>
              {#each data.units as unit}
                <option value={unit.id}>{unit.icon} {unit.name}</option>
              {/each}
            </select>
          </div>

          <div class="form-item">
            <label for="scope-count">Số lượng câu kiểm tra:</label>
            <div class="count-selector">
              {#each [5, 10, 15, 20] as cnt}
                <button
                  class="btn-count"
                  class:active={questionCount === cnt}
                  onclick={() => questionCount = cnt}
                >
                  {cnt} câu
                </button>
              {/each}
            </div>
          </div>

          <div class="start-action">
            <button class="btn-start" onclick={startQuiz}>
              <span>🚀 Bắt đầu dò từ ngay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Quiz popup modal: cô lập khi đang làm bài / xem kết quả (đồng bộ với phòng thi) -->
    <div class="quiz-popup-overlay" role="dialog" aria-modal="true" aria-label="Dò từ vựng">
    <div class="quiz-popup-inner">
    {#if !isFinished && currentQ}
    <!-- Active Quiz Screen -->
    <div class="active-quiz">
      <div class="quiz-topbar">
        <button class="btn-quit" onclick={quitQuiz}>✕ Thoát</button>
        <div class="quiz-progress-text">
          Câu <strong>{currentQuestionIndex + 1}</strong> / {quizQuestions.length}
        </div>
        <div class="quiz-stats-header">
          <span class="stat-pill score">Điểm: {score}</span>
          {#if streak > 1}
            <span class="stat-pill streak">🔥 Streak x{streak}</span>
          {/if}
        </div>
      </div>

      <!-- Question Card -->
      <div class="quiz-card">
        <div class="q-header">
          <span class="badge badge-purple">{currentQ.word.pos.toUpperCase()}</span>
          <span class="badge badge-green">{currentQ.word.unit_id.toUpperCase()}</span>
          <button class="btn-voice-quiz" onclick={() => speakWord(currentQ.word.term, 0.9)} title="Phát âm từ">
            🔊 Nghe gợi ý âm
          </button>
        </div>

        {#if quizMode === 'context'}
          <!-- Context sentence prompt -->
          <div class="q-context">
            <div class="context-label">Điền từ thích hợp vào chỗ trống trong câu:</div>
            <div class="context-sentence">"{currentQ.prompt}"</div>
            <div class="context-sub">↳ Dịch nghĩa: {currentQ.subPrompt}</div>
          </div>
        {:else}
          <!-- Meaning prompt -->
          <div class="q-meaning">
            <div class="meaning-label">Nghĩa tiếng Việt của từ:</div>
            <h2 class="meaning-display">{currentQ.prompt}</h2>
            {#if currentQ.word.syllables}
              <div class="syllables-hint-quiz">
                💡 Cấu trúc: <strong>{currentQ.word.syllables}</strong> ({currentQ.word.term.length} chữ cái)
              </div>
            {/if}
          </div>
        {/if}

        <!-- Answer Input Area -->
        <div class="q-interactive">
          {#if quizMode === 'typing'}
            <!-- Typing input -->
            <div class="typing-box">
              <input
                type="text"
                class="typing-input"
                class:correct={isAnswerChecked && isCorrect}
                class:wrong={isAnswerChecked && !isCorrect}
                placeholder="Gõ từ tiếng Anh vào đây..."
                bind:value={typedAnswer}
                disabled={isAnswerChecked}
                autocomplete="off"
                autofocus
              />
              {#if !isAnswerChecked}
                <div class="typing-tools">
                  <button class="btn-hint" onclick={giveHint} disabled={hintGiven}>
                    {hintGiven ? 'Đã nhận gợi ý' : '💡 Gợi ý chữ đầu'}
                  </button>
                  <button class="btn-submit-ans" onclick={() => checkAnswer()} disabled={!typedAnswer.trim()}>
                    Kiểm tra [Enter] ➔
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Options selection -->
            <div class="mcq-grid">
              {#each currentQ.options as opt}
                <button
                  class="mcq-btn"
                  class:selected={selectedOption === opt}
                  class:correct-choice={isAnswerChecked && opt.toLowerCase() === currentQ.correctAnswer.toLowerCase()}
                  class:wrong-choice={isAnswerChecked && selectedOption === opt && !isCorrect}
                  disabled={isAnswerChecked}
                  onclick={() => { selectedOption = opt; checkAnswer(opt); }}
                >
                  <span class="mcq-term">{opt}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Feedback Box -->
        {#if isAnswerChecked}
          <div class="feedback-box" class:feedback-correct={isCorrect} class:feedback-wrong={!isCorrect}>
            <div class="feedback-title">
              {isCorrect ? '🎉 Chính xác tuyệt đối!' : '❌ Chưa chính xác rồi!'}
            </div>
            <div class="feedback-answer">
              Đáp án đúng: <strong class="correct-term">{currentQ.correctAnswer}</strong>
              <span class="ipa-text">{currentQ.word.ipa}</span>
              <button class="btn-voice-small" onclick={() => speakWord(currentQ.word.term, 0.85)}>🔊</button>
            </div>

            <!-- Phonics notes for student -->
            <div class="feedback-phonics">
              <div><strong>Ngữ âm:</strong> {currentQ.word.phonics_note || currentQ.word.vowels_detail}</div>
              <div class="feedback-ex"><strong>Ví dụ:</strong> "{currentQ.word.example_en}"</div>
            </div>

            <button class="btn-next-q" onclick={nextQuestion} autofocus>
              <span>{currentQuestionIndex < quizQuestions.length - 1 ? 'Câu tiếp theo ➔' : 'Xem kết quả tổng kết ➔'}</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Finished Screen -->
    <div class="result-container">
      <div class="result-card">
        <div class="result-icon">
          {#if score / quizQuestions.length >= 0.8}
            🏆
          {:else if score / quizQuestions.length >= 0.5}
            ⭐
          {:else}
            💪
          {/if}
        </div>
        <h2 class="result-title">Hoàn Thành Bài Dò Từ Vựng!</h2>
        <div class="result-score-banner">
          <div class="score-num">{score} / {quizQuestions.length}</div>
          <div class="score-percent">{Math.round((score / quizQuestions.length) * 100)}% Chính xác</div>
        </div>

        <p class="result-feedback">
          {#if score / quizQuestions.length >= 0.8}
            Xuất sắc! Bạn đã ghi nhớ từ vựng rất vững vàng, sẵn sàng cho bài thi 1 tiết!
          {:else if score / quizQuestions.length >= 0.5}
            Khá tốt! Bạn hãy dùng thêm chế độ Lật Flashcard để củng cố các từ chưa nhớ nhé.
          {:else}
            Đừng nản lòng! Hãy ôn lại qua Flashcard và chơi game ghép thẻ để thuộc từ nhanh hơn.
          {/if}
        </p>

        <!-- Detailed Review Table -->
        <div class="review-table-wrap">
          <h4 class="table-title">Chi tiết từng câu:</h4>
          <div class="review-list">
            {#each userResults as res}
              <div class="review-item" class:item-correct={res.isCorrect} class:item-wrong={!res.isCorrect}>
                <div class="item-status">{res.isCorrect ? '✓' : '✗'}</div>
                <div class="item-content">
                  <div class="item-top">
                    <strong class="item-term">{res.correctAnswer}</strong>
                    <span class="item-ipa">{res.word.ipa}</span>
                    <button class="btn-voice-tiny" onclick={() => speakWord(res.correctAnswer, 0.9)}>🔊</button>
                  </div>
                  <div class="item-meaning">{res.word.meaning_vi}</div>
                  {#if !res.isCorrect}
                    <div class="item-user-ans">Bạn đã chọn/gõ: <span class="wrong-text">{res.userAnswer || '(Để trống)'}</span></div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="result-actions">
          <button class="btn-secondary" onclick={quitQuiz}>
            ⚙️ Cấu hình lại
          </button>
          <button class="btn-primary" onclick={startQuiz}>
            🔄 Làm lại đề mới
          </button>
        </div>
      </div>
    </div>
    {/if}
    </div><!-- /quiz-popup-inner -->
    </div><!-- /quiz-popup-overlay -->
  {/if}
</div>

<style>
  .quiz-popup-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    overflow-y: auto;
    background: rgba(2, 6, 23, 0.95);
    backdrop-filter: blur(4px);
    animation: quizPopupIn 0.15s ease-out;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .quiz-popup-inner {
    min-height: 100%;
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    padding: 12px;
    padding-top: calc(12px + env(safe-area-inset-top, 0px) + 8px);
  }
  @media (min-width: 640px) {
    .quiz-popup-inner { padding: 24px; padding-top: calc(24px + env(safe-area-inset-top, 0px) + 8px); }
  }
  @keyframes quizPopupIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .quiz-page {
    max-width: 860px;
    margin: 0 auto;
  }

  .setup-container {
    background: white;
    padding: 32px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-sm);
  }

  .badge-quiz {
    display: inline-block;
    background: #ecfdf5;
    color: #059669;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .setup-title {
    font-size: 1.8rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .setup-desc {
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .setup-grid {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .setting-card {
    background: var(--bg-surface);
    padding: 20px;
    border-radius: var(--border-radius-md);
  }

  .setting-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 14px;
  }

  .mode-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 16px;
    background: white;
    border: 2px solid var(--border-color);
    padding: 14px 18px;
    border-radius: var(--border-radius-md);
    text-align: left;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    border-color: #cbd5e1;
    background: #fafafa;
  }

  .mode-btn.active {
    border-color: var(--primary);
    background: #f0fdf4;
  }

  .mode-icon {
    font-size: 28px;
    flex-shrink: 0;
  }

  .mode-name {
    display: block;
    font-weight: 700;
    color: #0f172a;
    font-size: 0.98rem;
    margin-bottom: 2px;
  }

  .mode-sub {
    display: block;
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .form-item {
    margin-bottom: 16px;
  }

  .form-item label {
    display: block;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 6px;
  }

  .form-item select {
    width: 100%;
    padding: 10px 14px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
    background: white;
    font-size: 0.92rem;
    outline: none;
  }

  .count-selector {
    display: flex;
    gap: 10px;
  }

  .btn-count {
    flex: 1;
    padding: 10px;
    background: white;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-sm);
    font-weight: 700;
    color: var(--text-main);
    transition: all 0.15s;
  }

  .btn-count.active {
    background: var(--secondary-light);
    border-color: var(--secondary);
    color: var(--secondary);
  }

  .start-action {
    margin-top: 20px;
  }

  .btn-start {
    width: 100%;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    font-size: 1.1rem;
    font-weight: 800;
    padding: 14px;
    border-radius: var(--border-radius-md);
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
    transition: all 0.2s;
  }

  .btn-start:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(16, 185, 129, 0.4);
  }

  /* Active Quiz Screen */
  .active-quiz {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .quiz-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: white;
    padding: 12px 20px;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--border-color);
  }

  .btn-quit {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .quiz-progress-text {
    font-size: 0.95rem;
    color: var(--text-muted);
  }

  .quiz-progress-text strong {
    color: #0f172a;
    font-size: 1.1rem;
  }

  .quiz-stats-header {
    display: flex;
    gap: 8px;
  }

  .stat-pill {
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .stat-pill.score {
    background: #f1f5f9;
    color: #334155;
  }

  .stat-pill.streak {
    background: #fef3c7;
    color: #b45309;
  }

  .quiz-card {
    background: white;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    padding: 32px;
    box-shadow: var(--shadow-sm);
  }

  .q-header {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 24px;
  }

  .btn-voice-quiz {
    margin-left: auto;
    background: #eef2ff;
    color: #4338ca;
    padding: 5px 12px;
    border-radius: 9999px;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .meaning-label, .context-label {
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--text-sub);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .meaning-display {
    font-size: 2rem;
    color: #0f172a;
    font-weight: 800;
    font-family: 'Lexend', sans-serif;
    margin-bottom: 8px;
  }

  .syllables-hint-quiz {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 24px;
  }

  .context-sentence {
    font-size: 1.35rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .context-sub {
    font-size: 0.92rem;
    color: var(--text-muted);
    font-style: italic;
    margin-bottom: 24px;
  }

  /* Typing Area */
  .typing-box {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .typing-input {
    width: 100%;
    padding: 16px 20px;
    border: 2px solid var(--border-color);
    border-radius: var(--border-radius-md);
    font-size: 1.3rem;
    font-weight: 700;
    font-family: 'Lexend', sans-serif;
    color: #0f172a;
    outline: none;
    transition: all 0.15s;
  }

  .typing-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
  }

  .typing-input.correct {
    border-color: #10b981;
    background: #ecfdf5;
    color: #065f46;
  }

  .typing-input.wrong {
    border-color: #ef4444;
    background: #fef2f2;
    color: #991b1b;
  }

  .typing-tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .btn-hint {
    background: #f1f5f9;
    color: #475569;
    padding: 8px 14px;
    border-radius: var(--border-radius-sm);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .btn-submit-ans {
    background: var(--primary);
    color: white;
    padding: 10px 20px;
    border-radius: var(--border-radius-md);
    font-weight: 700;
    font-size: 0.95rem;
  }

  .btn-submit-ans:disabled {
    opacity: 0.5;
  }

  /* MCQ Grid */
  .mcq-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .mcq-btn {
    background: white;
    border: 2px solid var(--border-color);
    border-radius: var(--border-radius-md);
    padding: 18px 20px;
    font-size: 1.15rem;
    font-weight: 700;
    color: #1e293b;
    text-align: center;
    transition: all 0.15s;
  }

  .mcq-btn:hover:not(:disabled) {
    border-color: var(--secondary);
    background: #f5f3ff;
  }

  .mcq-btn.correct-choice {
    border-color: #10b981;
    background: #d1fae5;
    color: #065f46;
  }

  .mcq-btn.wrong-choice {
    border-color: #ef4444;
    background: #fee2e2;
    color: #991b1b;
  }

  /* Feedback box */
  .feedback-box {
    margin-top: 24px;
    padding: 20px;
    border-radius: var(--border-radius-md);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .feedback-correct {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
  }

  .feedback-wrong {
    background: #fef2f2;
    border: 1px solid #fecaca;
  }

  .feedback-title {
    font-size: 1.1rem;
    font-weight: 800;
  }

  .feedback-correct .feedback-title {
    color: #065f46;
  }

  .feedback-wrong .feedback-title {
    color: #991b1b;
  }

  .feedback-answer {
    font-size: 1rem;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .correct-term {
    color: #047857;
    font-size: 1.25rem;
  }

  .ipa-text {
    font-family: monospace;
    color: #475569;
    font-weight: 700;
    background: white;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .feedback-phonics {
    font-size: 0.85rem;
    color: #334155;
    line-height: 1.45;
  }

  .feedback-ex {
    margin-top: 4px;
    font-style: italic;
    color: #0f172a;
  }

  .btn-next-q {
    margin-top: 10px;
    align-self: flex-end;
    background: #0f172a;
    color: white;
    font-weight: 700;
    padding: 10px 22px;
    border-radius: var(--border-radius-md);
    font-size: 0.95rem;
    transition: all 0.15s;
  }

  .btn-next-q:hover {
    background: #334155;
  }

  /* Result Screen */
  .result-container {
    background: white;
    padding: 40px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    text-align: center;
  }

  .result-icon {
    font-size: 56px;
    margin-bottom: 12px;
  }

  .result-title {
    font-size: 1.8rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 16px;
  }

  .result-score-banner {
    display: inline-block;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    padding: 16px 36px;
    border-radius: var(--border-radius-lg);
    margin-bottom: 16px;
  }

  .score-num {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--primary-hover);
    font-family: 'Lexend', sans-serif;
  }

  .score-percent {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .result-feedback {
    color: var(--text-muted);
    font-size: 1rem;
    max-width: 600px;
    margin: 0 auto 28px;
    line-height: 1.6;
  }

  .review-table-wrap {
    text-align: left;
    margin-bottom: 30px;
  }

  .table-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .review-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .review-item {
    display: flex;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
  }

  .review-item.item-correct {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .review-item.item-wrong {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .item-status {
    font-weight: 800;
    font-size: 1.1rem;
  }

  .item-correct .item-status {
    color: #16a34a;
  }

  .item-wrong .item-status {
    color: #dc2626;
  }

  .item-content {
    flex: 1;
  }

  .item-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .item-term {
    font-size: 1rem;
    color: #0f172a;
  }

  .item-ipa {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .item-meaning {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .item-user-ans {
    font-size: 0.8rem;
    color: #991b1b;
  }

  .wrong-text {
    text-decoration: line-through;
  }

  .btn-voice-tiny {
    font-size: 0.75rem;
  }

  .result-actions {
    display: flex;
    justify-content: center;
    gap: 14px;
  }

  @media (max-width: 640px) {
    .mcq-grid {
      grid-template-columns: 1fr;
    }
    .setup-container, .quiz-card {
      padding: 20px;
    }
  }
</style>
