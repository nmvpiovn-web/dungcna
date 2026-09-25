<script>
  import { onMount } from 'svelte';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { saveGameScoreLocally } from '$lib/staticDb.js';

  let { data } = $props();

  let activeGame = $state('menu'); // 'menu', 'match', 'scramble', 'meteor'
  let playerName = $state('Học sinh Lớp 7');

  // ==========================================
  // GAME 1: SPEED MATCH (Quizlet Match style)
  // ==========================================
  let matchCards = $state([]);
  let matchSelected = $state([]); // [cardIndex, cardIndex]
  let matchStartTime = $state(0);
  let matchTimer = $state(0);
  let matchInterval = $state(null);
  let matchCompleted = $state(false);
  let matchPairsFound = $state(0);
  let matchTotalPairs = 6;

  function startMatchGame() {
    activeGame = 'match';
    matchCompleted = false;
    matchPairsFound = 0;
    matchSelected = [];
    matchTimer = 0;

    // Pick 6 random words
    const shuffledWords = [...data.words].sort(() => 0.5 - Math.random()).slice(0, matchTotalPairs);

    // Create 12 cards: 6 English, 6 Vietnamese
    const cards = [];
    shuffledWords.forEach((word) => {
      cards.push({
        id: `en_${word.id}`,
        wordId: word.id,
        text: word.term,
        sub: word.ipa,
        type: 'en',
        matched: false,
        word
      });
      cards.push({
        id: `vi_${word.id}`,
        wordId: word.id,
        text: word.meaning_vi,
        sub: word.pos,
        type: 'vi',
        matched: false,
        word
      });
    });

    // Shuffle the 12 cards
    matchCards = cards.sort(() => 0.5 - Math.random());

    matchStartTime = Date.now();
    if (matchInterval) clearInterval(matchInterval);
    matchInterval = setInterval(() => {
      matchTimer = ((Date.now() - matchStartTime) / 1000).toFixed(1);
    }, 100);
  }

  function handleCardClick(index) {
    const card = matchCards[index];
    if (card.matched || matchSelected.includes(index) || matchSelected.length >= 2) return;

    // Play click sound
    playAudioFeedback('flip');
    if (card.type === 'en') {
      speakWord(card.text, 0.9);
    }

    matchSelected.push(index);

    if (matchSelected.length === 2) {
      const idx1 = matchSelected[0];
      const idx2 = matchSelected[1];
      const card1 = matchCards[idx1];
      const card2 = matchCards[idx2];

      if (card1.wordId === card2.wordId && card1.type !== card2.type) {
        // MATCH!
        setTimeout(() => {
          card1.matched = true;
          card2.matched = true;
          matchSelected = [];
          matchPairsFound++;
          playAudioFeedback('correct');

          if (matchPairsFound >= matchTotalPairs) {
            finishMatchGame();
          }
        }, 250);
      } else {
        // WRONG MATCH
        playAudioFeedback('wrong');
        setTimeout(() => {
          matchSelected = [];
        }, 650);
      }
    }
  }

  function finishMatchGame() {
    clearInterval(matchInterval);
    matchCompleted = true;
    playAudioFeedback('win');

    // Save score
    const timeSpent = parseFloat(matchTimer);
    const score = Math.max(100, Math.round(1000 - timeSpent * 20));
    try {
      saveGameScoreLocally({
        gameMode: 'speed_match',
        playerName: playerName || 'Học sinh',
        score,
        timeSeconds: timeSpent,
        correctAnswers: matchTotalPairs,
        totalQuestions: matchTotalPairs
      });
    } catch (e) {
      console.error(e);
    }
  }

  // ==========================================
  // GAME 2: WORD SCRAMBLE (Duolingo style)
  // ==========================================
  let scrambleWordList = $state([]);
  let scrambleIndex = $state(0);
  let scrambleLetters = $state([]); // { char, id, used }
  let scrambleAssembled = $state([]); // { char, originalId }
  let scrambleScore = $state(0);
  let scrambleFinished = $state(false);
  let scrambleStatus = $state(''); // 'correct', 'wrong', ''

  let currentScramble = $derived(scrambleWordList[scrambleIndex] || null);

  function startScrambleGame() {
    activeGame = 'scramble';
    scrambleScore = 0;
    scrambleIndex = 0;
    scrambleFinished = false;
    // Pick 8 random words
    scrambleWordList = [...data.words].sort(() => 0.5 - Math.random()).slice(0, 8);
    loadScrambleWord();
  }

  function loadScrambleWord() {
    if (!currentScramble) return;
    scrambleStatus = '';
    scrambleAssembled = [];

    // Filter characters (ignore spaces in compound words for simpler gameplay)
    const cleanTerm = currentScramble.term.toUpperCase();
    const chars = cleanTerm.split('').map((char, i) => ({
      char,
      id: `${char}_${i}`,
      used: false
    }));

    // Shuffle characters
    scrambleLetters = chars.sort(() => 0.5 - Math.random());
    speakWord(currentScramble.term, 0.9);
  }

  function pickLetter(letter) {
    if (letter.used || scrambleStatus === 'correct') return;
    letter.used = true;
    scrambleAssembled.push({ char: letter.char, originalId: letter.id });
    playAudioFeedback('flip');

    // Check if assembled full word
    const target = currentScramble.term.toUpperCase();
    const current = scrambleAssembled.map(a => a.char).join('');

    if (current.length === target.length) {
      if (current === target) {
        // Correct
        scrambleStatus = 'correct';
        scrambleScore += 100;
        playAudioFeedback('correct');
        speakWord(currentScramble.term, 0.9);

        setTimeout(() => {
          if (scrambleIndex < scrambleWordList.length - 1) {
            scrambleIndex++;
            loadScrambleWord();
          } else {
            finishScrambleGame();
          }
        }, 1200);
      } else {
        // Wrong
        scrambleStatus = 'wrong';
        playAudioFeedback('wrong');
      }
    }
  }

  function removeLetter(index) {
    if (scrambleStatus === 'correct') return;
    const removed = scrambleAssembled.splice(index, 1)[0];
    const letter = scrambleLetters.find(l => l.id === removed.originalId);
    if (letter) letter.used = false;
    scrambleStatus = '';
    playAudioFeedback('flip');
  }

  function undoLastLetter() {
    if (scrambleAssembled.length > 0) {
      removeLetter(scrambleAssembled.length - 1);
    }
  }

  function finishScrambleGame() {
    scrambleFinished = true;
    playAudioFeedback('win');
    try {
      saveGameScoreLocally({
        gameMode: 'word_scramble',
        playerName: playerName || 'Học sinh',
        score: scrambleScore,
        correctAnswers: scrambleWordList.length,
        totalQuestions: scrambleWordList.length
      });
    } catch (e) {
      console.error(e);
    }
  }

  // ==========================================
  // GAME 3: METEOR RUSH (Blooket / Speed Rush)
  // ==========================================
  let meteorIndex = $state(0);
  let meteorScore = $state(0);
  let meteorStreak = $state(0);
  let meteorTimeLeft = $state(10);
  let meteorTimer = $state(null);
  let meteorQuestions = $state([]);
  let meteorFinished = $state(false);
  let meteorFeedback = $state(null);

  let currentMeteor = $derived(meteorQuestions[meteorIndex] || null);

  function startMeteorGame() {
    activeGame = 'meteor';
    meteorIndex = 0;
    meteorScore = 0;
    meteorStreak = 0;
    meteorFinished = false;

    // Pick 10 words
    const words = [...data.words].sort(() => 0.5 - Math.random()).slice(0, 10);
    meteorQuestions = words.map(w => {
      const distractors = data.words
        .filter(d => d.id !== w.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(d => d.meaning_vi);
      const options = [w.meaning_vi, ...distractors].sort(() => 0.5 - Math.random());
      return {
        word: w,
        options,
        correct: w.meaning_vi
      };
    });

    nextMeteorTurn();
  }

  function nextMeteorTurn() {
    if (meteorIndex >= meteorQuestions.length) {
      finishMeteorGame();
      return;
    }

    meteorFeedback = null;
    meteorTimeLeft = 10;
    speakWord(currentMeteor.word.term, 0.9);

    if (meteorTimer) clearInterval(meteorTimer);
    meteorTimer = setInterval(() => {
      meteorTimeLeft -= 0.1;
      if (meteorTimeLeft <= 0) {
        clearInterval(meteorTimer);
        handleMeteorAnswer(null); // Timeout
      }
    }, 100);
  }

  function handleMeteorAnswer(chosenOption) {
    if (meteorFeedback) return;
    clearInterval(meteorTimer);

    const isCorrect = chosenOption === currentMeteor.correct;
    if (isCorrect) {
      const timeBonus = Math.round(meteorTimeLeft * 15);
      meteorStreak++;
      const multiplier = Math.min(3, 1 + Math.floor(meteorStreak / 3));
      const turnScore = (100 + timeBonus) * multiplier;
      meteorScore += turnScore;
      meteorFeedback = { type: 'correct', text: `+${turnScore} điểm! (Combo x${multiplier})` };
      playAudioFeedback('correct');
    } else {
      meteorStreak = 0;
      meteorFeedback = { type: 'wrong', text: `Sai rồi! Đáp án: ${currentMeteor.correct}` };
      playAudioFeedback('wrong');
    }

    setTimeout(() => {
      meteorIndex++;
      nextMeteorTurn();
    }, 1200);
  }

  function finishMeteorGame() {
    clearInterval(meteorTimer);
    meteorFinished = true;
    playAudioFeedback('win');
    try {
      saveGameScoreLocally({
        gameMode: 'meteor_rush',
        playerName: playerName || 'Học sinh',
        score: meteorScore,
        totalQuestions: meteorQuestions.length,
        correctAnswers: meteorIndex
      });
    } catch (e) {
      console.error(e);
    }
  }

  onMount(() => {
    return () => {
      if (matchInterval) clearInterval(matchInterval);
      if (meteorTimer) clearInterval(meteorTimer);
    };
  });
</script>

<div class="games-page">
  {#if activeGame === 'menu'}
    <!-- Main Game Menu -->
    <div class="menu-hero">
      <div class="hero-badge">🎮 ĐẤU TRƯỜNG TỪ VỰNG TIẾNG ANH 7</div>
      <h1 class="hero-title">Tiếng Anh Cô Dung — Đấu Trường Trò Chơi Từ Vựng</h1>
      <p class="hero-desc">
        Học mà chơi, chơi mà học cùng Tiếng Anh Cô Dung! Tham khảo cơ chế từ các nền tảng hàng đầu thế giới: <strong>Quizlet Match</strong>, <strong>Duolingo Word Scramble</strong> và <strong>Blooket Speed Rush</strong>.
      </p>

      <div class="player-input-wrap">
        <label for="player-name">👤 Tên của bạn:</label>
        <input
          id="player-name"
          type="text"
          bind:value={playerName}
          placeholder="Nhập tên của bạn để ghi điểm..."
        />
      </div>
    </div>

    <!-- 3 Game Selection Cards -->
    <div class="game-grid">
      <!-- Game 1: Speed Match -->
      <div class="game-card match-theme">
        <div class="card-badge">Cảm hứng: QUIZLET MATCH</div>
        <div class="card-icon">⚡</div>
        <h3 class="card-title">Ghép Thẻ Siêu Tốc (Speed Match)</h3>
        <p class="card-desc">
          Ghép nối nhanh các cặp từ tiếng Anh với nghĩa tiếng Việt tương ứng. Thời gian tích tắc trôi, thẻ khớp biến mất!
        </p>
        <div class="card-features">
          <span>✓ 12 thẻ ngẫu nhiên</span>
          <span>✓ Đếm thời gian</span>
          <span>✓ Bảng xếp hạng kỷ lục</span>
        </div>
        <button class="btn-play" onclick={startMatchGame}>
          <span>Chơi Ghép Thẻ ➔</span>
        </button>
      </div>

      <!-- Game 2: Word Scramble -->
      <div class="game-card scramble-theme">
        <div class="card-badge">Cảm hứng: DUOLINGO / WORDWALL</div>
        <div class="card-icon">🔤</div>
        <h3 class="card-title">Sắp Xếp Chữ Cái (Word Scramble)</h3>
        <p class="card-desc">
          Xem nghĩa và nghe gợi ý âm thanh, bấm chọn các chữ cái xáo trộn để lắp ráp thành từ tiếng Anh chuẩn xác.
        </p>
        <div class="card-features">
          <span>✓ Rèn trí nhớ chữ cái</span>
          <span>✓ Hỗ trợ phát âm</span>
          <span>✓ Tích lũy 100 điểm/từ</span>
        </div>
        <button class="btn-play" onclick={startScrambleGame}>
          <span>Chơi Xếp Chữ ➔</span>
        </button>
      </div>

      <!-- Game 3: Meteor Rush -->
      <div class="game-card meteor-theme">
        <div class="card-badge">Cảm hứng: BLOOKET / BAAMBOOZLE</div>
        <div class="card-icon">☄️</div>
        <h3 class="card-title">Bắn Thiên Thạch (Meteor Rush)</h3>
        <p class="card-desc">
          Đếm ngược 10 giây mỗi câu! Phản xạ nhanh chọn đúng nghĩa tiếng Việt để phá hủy thiên thạch và nhận combo điểm số!
        </p>
        <div class="card-features">
          <span>✓ Phản xạ tốc độ cao</span>
          <span>✓ Combo số nhân điểm</span>
          <span>✓ Âm thanh sống động</span>
        </div>
        <button class="btn-play" onclick={startMeteorGame}>
          <span>Chơi Đấu Trường ➔</span>
        </button>
      </div>
    </div>

  <!-- ================= GAME 1: MATCH SCREEN ================= -->
  {:else if activeGame === 'match'}
    <div class="game-view">
      <div class="game-top">
        <button class="btn-back" onclick={() => activeGame = 'menu'}>← Trở về menu</button>
        <div class="game-header-info">
          <span class="game-timer">⏱️ Thời gian: <strong>{matchTimer}s</strong></span>
          <span class="pairs-count">Đã ghép: <strong>{matchPairsFound}</strong> / {matchTotalPairs}</span>
        </div>
      </div>

      {#if !matchCompleted}
        <div class="match-grid">
          {#each matchCards as card, index}
            <button
              class="match-card"
              class:selected={matchSelected.includes(index)}
              class:matched={card.matched}
              class:is-english={card.type === 'en'}
              onclick={() => handleCardClick(index)}
            >
              <div class="match-text">{card.text}</div>
              <div class="match-sub">{card.sub}</div>
              {#if card.type === 'en'}
                <div class="card-type-tag">EN</div>
              {:else}
                <div class="card-type-tag vi">VN</div>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="game-win-card">
          <div class="win-icon">🎉</div>
          <h2>Xuất Sắc! Bạn Đã Hoàn Thành Ghép Thẻ!</h2>
          <div class="win-time">Thời gian hoàn thành: <strong>{matchTimer} giây</strong></div>
          <p class="win-desc">Kỷ lục của bạn đã được ghi nhận vào hệ thống!</p>
          <div class="win-actions">
            <button class="btn-primary" onclick={startMatchGame}>🔄 Chơi ván mới</button>
            <button class="btn-secondary" onclick={() => activeGame = 'menu'}>Trở về menu trò chơi</button>
          </div>
        </div>
      {/if}
    </div>

  <!-- ================= GAME 2: SCRAMBLE SCREEN ================= -->
  {:else if activeGame === 'scramble'}
    <div class="game-view">
      <div class="game-top">
        <button class="btn-back" onclick={() => activeGame = 'menu'}>← Trở về menu</button>
        <div class="game-header-info">
          <span>Câu: <strong>{scrambleIndex + 1}</strong> / {scrambleWordList.length}</span>
          <span>Điểm: <strong>{scrambleScore}</strong></span>
        </div>
      </div>

      {#if !scrambleFinished && currentScramble}
        <div class="scramble-arena">
          <div class="scramble-hint-card">
            <div class="hint-category">
              <span class="badge badge-purple">{currentScramble.pos}</span>
              <span class="badge badge-green">{currentScramble.unit_id.toUpperCase()}</span>
            </div>
            <h2 class="hint-meaning">{currentScramble.meaning_vi}</h2>
            <div class="hint-ipa-box">
              <span>Phiên âm: <strong>{currentScramble.ipa}</strong></span>
              <button class="btn-audio-mini" onclick={() => speakWord(currentScramble.term, 0.9)}>🔊 Nghe</button>
            </div>
          </div>

          <!-- Assembled word slots -->
          <div class="assembled-slots" class:correct-slots={scrambleStatus === 'correct'} class:wrong-slots={scrambleStatus === 'wrong'}>
            {#each scrambleAssembled as item, idx}
              <button class="slot-letter" onclick={() => removeLetter(idx)}>
                {item.char}
              </button>
            {/each}
            {#if scrambleAssembled.length < currentScramble.term.length}
              {#each Array(currentScramble.term.length - scrambleAssembled.length) as _}
                <div class="slot-empty">_</div>
              {/each}
            {/if}
          </div>

          {#if scrambleStatus === 'correct'}
            <div class="scramble-alert correct">✓ Chính xác! +100 điểm</div>
          {:else if scrambleStatus === 'wrong'}
            <div class="scramble-alert wrong">✗ Chưa đúng rồi! Bấm vào chữ để sửa hoặc bấm Hoàn tác</div>
          {/if}

          <!-- Available scrambled letters pool -->
          <div class="letters-pool">
            {#each scrambleLetters as letter}
              <button
                class="letter-bubble"
                class:used={letter.used}
                disabled={letter.used || scrambleStatus === 'correct'}
                onclick={() => pickLetter(letter)}
              >
                {letter.char}
              </button>
            {/each}
          </div>

          <div class="scramble-actions">
            <button class="btn-undo" onclick={undoLastLetter} disabled={scrambleAssembled.length === 0}>
              ↩️ Hoàn tác chữ cuối
            </button>
            <button class="btn-hear-again" onclick={() => speakWord(currentScramble.term, 0.75)}>
              🐢 Nghe đọc chậm
            </button>
          </div>
        </div>
      {:else}
        <div class="game-win-card">
          <div class="win-icon">🌟</div>
          <h2>Chúc Mừng Bạn Đã Ghép Đúng Tất Cả!</h2>
          <div class="win-time">Tổng điểm đạt được: <strong>{scrambleScore} điểm</strong></div>
          <div class="win-actions">
            <button class="btn-primary" onclick={startScrambleGame}>🔄 Chơi ván mới</button>
            <button class="btn-secondary" onclick={() => activeGame = 'menu'}>Trở về menu trò chơi</button>
          </div>
        </div>
      {/if}
    </div>

  <!-- ================= GAME 3: METEOR RUSH SCREEN ================= -->
  {:else if activeGame === 'meteor'}
    <div class="game-view">
      <div class="game-top">
        <button class="btn-back" onclick={() => activeGame = 'menu'}>← Trở về menu</button>
        <div class="game-header-info">
          <span>Từ <strong>{meteorIndex + 1}</strong> / {meteorQuestions.length}</span>
          <span class="meteor-score-tag">Điểm: <strong>{meteorScore}</strong></span>
          {#if meteorStreak > 1}
            <span class="meteor-streak-tag">🔥 x{meteorStreak}</span>
          {/if}
        </div>
      </div>

      {#if !meteorFinished && currentMeteor}
        <div class="meteor-arena">
          <!-- Time Bar -->
          <div class="meteor-timer-track">
            <div
              class="meteor-timer-fill"
              style="width: {(meteorTimeLeft / 10) * 100}%; background: {meteorTimeLeft < 3 ? '#ef4444' : '#10b981'}"
            ></div>
          </div>

          <!-- Falling Meteor Word Target -->
          <div class="meteor-target animate-pop">
            <div class="meteor-badge">☄️ THIÊN THẠCH TỪ VỰNG</div>
            <h1 class="meteor-term">{currentMeteor.word.term}</h1>
            <div class="meteor-ipa-line">
              <span class="meteor-ipa">{currentMeteor.word.ipa}</span>
              <button class="btn-audio-mini" onclick={() => speakWord(currentMeteor.word.term, 0.9)}>🔊</button>
            </div>
          </div>

          {#if meteorFeedback}
            <div class="feedback-toast" class:correct={meteorFeedback.type === 'correct'} class:wrong={meteorFeedback.type === 'wrong'}>
              {meteorFeedback.text}
            </div>
          {/if}

          <!-- 4 Answer Options -->
          <div class="meteor-options-grid">
            {#each currentMeteor.options as opt}
              <button
                class="meteor-opt-btn"
                disabled={Boolean(meteorFeedback)}
                onclick={() => handleMeteorAnswer(opt)}
              >
                <span>{opt}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="game-win-card">
          <div class="win-icon">🏆</div>
          <h2>Bảo Vệ Trái Đất Thành Công!</h2>
          <div class="win-time">Kỷ lục điểm số: <strong>{meteorScore} điểm</strong></div>
          <div class="win-actions">
            <button class="btn-primary" onclick={startMeteorGame}>🔄 Chơi ván mới</button>
            <button class="btn-secondary" onclick={() => activeGame = 'menu'}>Trở về menu trò chơi</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .games-page {
    max-width: 1000px;
    margin: 0 auto;
  }

  /* Hero Menu */
  .menu-hero {
    background: white;
    padding: 32px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-sm);
    margin-bottom: 24px;
    text-align: center;
  }

  .hero-badge {
    display: inline-block;
    background: #fdf2f8;
    color: #db2777;
    padding: 4px 14px;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 800;
    margin-bottom: 8px;
  }

  .hero-title {
    font-size: 2rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .hero-desc {
    color: var(--text-muted);
    font-size: 0.95rem;
    max-width: 700px;
    margin: 0 auto 20px;
    line-height: 1.6;
  }

  .player-input-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-surface);
    padding: 8px 16px;
    border-radius: 9999px;
    border: 1px solid var(--border-color);
  }

  .player-input-wrap label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .player-input-wrap input {
    border: none;
    background: transparent;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text-main);
    outline: none;
  }

  /* Game Grid */
  .game-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  .game-card {
    background: white;
    border: 2px solid var(--border-color);
    border-radius: var(--border-radius-lg);
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.2s ease;
  }

  .game-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
    border-color: #94a3b8;
  }

  .card-badge {
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--text-sub);
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  .card-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .card-title {
    font-size: 1.25rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
    line-height: 1.3;
  }

  .card-desc {
    font-size: 0.88rem;
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 18px;
  }

  .card-features {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: #475569;
    font-weight: 600;
    margin-bottom: 22px;
  }

  .btn-play {
    background: #0f172a;
    color: white;
    font-weight: 700;
    padding: 12px 18px;
    border-radius: var(--border-radius-md);
    font-size: 0.95rem;
    transition: all 0.15s;
    text-align: center;
  }

  .btn-play:hover {
    background: #334155;
  }

  .match-theme:hover {
    border-color: #3b82f6;
  }

  .scramble-theme:hover {
    border-color: #10b981;
  }

  .meteor-theme:hover {
    border-color: #f59e0b;
  }

  /* Game View generic */
  .game-view {
    background: white;
    padding: 24px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
  }

  .game-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 16px;
    margin-bottom: 24px;
  }

  .btn-back {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .game-header-info {
    display: flex;
    gap: 16px;
    font-size: 1rem;
    color: var(--text-muted);
  }

  .game-header-info strong {
    color: #0f172a;
  }

  /* Match Game Layout */
  .match-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .match-card {
    height: 120px;
    background: #f8fafc;
    border: 2px solid var(--border-color);
    border-radius: var(--border-radius-md);
    padding: 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    position: relative;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .match-card:hover:not(.matched) {
    border-color: #94a3b8;
    background: white;
    transform: scale(1.02);
  }

  .match-card.selected {
    border-color: #6366f1;
    background: #eef2ff;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }

  .match-card.matched {
    opacity: 0.25;
    pointer-events: none;
    border-color: #10b981;
    background: #ecfdf5;
  }

  .match-text {
    font-size: 1.05rem;
    font-weight: 800;
    color: #0f172a;
  }

  .match-sub {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .card-type-tag {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.65rem;
    font-weight: 800;
    color: #3b82f6;
    background: #eff6ff;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .card-type-tag.vi {
    color: #10b981;
    background: #ecfdf5;
  }

  /* Scramble Arena */
  .scramble-arena {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    max-width: 650px;
    margin: 0 auto;
    padding: 20px 0;
  }

  .scramble-hint-card {
    text-align: center;
    background: #f8fafc;
    border: 1px solid var(--border-color);
    padding: 20px 32px;
    border-radius: var(--border-radius-md);
    width: 100%;
  }

  .hint-category {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .hint-meaning {
    font-size: 1.8rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .hint-ipa-box {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    color: var(--text-muted);
  }

  .btn-audio-mini {
    background: #eef2ff;
    color: #4f46e5;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .assembled-slots {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    min-height: 60px;
    padding: 10px;
    background: #f1f5f9;
    border-radius: var(--border-radius-md);
    border: 2px dashed #cbd5e1;
    width: 100%;
  }

  .assembled-slots.correct-slots {
    background: #ecfdf5;
    border-color: #10b981;
  }

  .assembled-slots.wrong-slots {
    background: #fef2f2;
    border-color: #ef4444;
  }

  .slot-letter {
    width: 48px;
    height: 52px;
    background: white;
    border: 2px solid #0f172a;
    border-radius: 8px;
    font-size: 1.5rem;
    font-weight: 800;
    color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 0 #0f172a;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .slot-letter:active {
    transform: translateY(2px);
    box-shadow: 0 2px 0 #0f172a;
  }

  .slot-empty {
    width: 48px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: #94a3b8;
  }

  .scramble-alert {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .scramble-alert.correct {
    color: #059669;
  }

  .scramble-alert.wrong {
    color: #dc2626;
  }

  .letters-pool {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .letter-bubble {
    width: 52px;
    height: 56px;
    background: white;
    border: 2px solid var(--border-color);
    border-radius: 12px;
    font-size: 1.5rem;
    font-weight: 800;
    color: #0f172a;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    transition: all 0.15s;
  }

  .letter-bubble:hover:not(:disabled) {
    border-color: var(--secondary);
    transform: translateY(-2px);
    background: #f8fafc;
  }

  .letter-bubble.used {
    opacity: 0.25;
    pointer-events: none;
    box-shadow: none;
  }

  .scramble-actions {
    display: flex;
    gap: 12px;
  }

  .btn-undo, .btn-hear-again {
    padding: 8px 16px;
    border-radius: var(--border-radius-sm);
    background: var(--bg-surface);
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-main);
  }

  /* Meteor Arena */
  .meteor-arena {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    max-width: 650px;
    margin: 0 auto;
    padding: 20px 0;
  }

  .meteor-timer-track {
    width: 100%;
    height: 10px;
    background: #e2e8f0;
    border-radius: 9999px;
    overflow: hidden;
  }

  .meteor-timer-fill {
    height: 100%;
    transition: width 0.1s linear;
  }

  .meteor-target {
    text-align: center;
    background: #0f172a;
    color: white;
    padding: 32px;
    border-radius: var(--border-radius-lg);
    width: 100%;
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.4);
  }

  .meteor-badge {
    font-size: 0.8rem;
    font-weight: 800;
    color: #fbbf24;
    margin-bottom: 8px;
  }

  .meteor-term {
    font-size: 2.8rem;
    font-weight: 800;
    font-family: 'Lexend', sans-serif;
    color: #38bdf8;
    margin-bottom: 8px;
  }

  .meteor-ipa-line {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }

  .meteor-ipa {
    font-family: monospace;
    font-size: 1.1rem;
    color: #94a3b8;
  }

  .feedback-toast {
    font-size: 1.1rem;
    font-weight: 800;
    padding: 8px 20px;
    border-radius: 9999px;
  }

  .feedback-toast.correct {
    background: #ecfdf5;
    color: #059669;
  }

  .feedback-toast.wrong {
    background: #fef2f2;
    color: #dc2626;
  }

  .meteor-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
  }

  .meteor-opt-btn {
    background: white;
    border: 2px solid var(--border-color);
    padding: 16px 20px;
    border-radius: var(--border-radius-md);
    font-size: 1.1rem;
    font-weight: 700;
    color: #0f172a;
    text-align: center;
    transition: all 0.15s;
  }

  .meteor-opt-btn:hover:not(:disabled) {
    border-color: #f59e0b;
    background: #fffbeb;
  }

  .meteor-score-tag {
    color: #b45309;
  }

  .meteor-streak-tag {
    background: #fef3c7;
    color: #b45309;
    padding: 2px 8px;
    border-radius: 9999px;
    font-weight: 800;
    font-size: 0.85rem;
  }

  /* Win Screen */
  .game-win-card {
    text-align: center;
    padding: 48px 20px;
  }

  .win-icon {
    font-size: 64px;
    margin-bottom: 12px;
  }

  .win-time {
    font-size: 1.3rem;
    color: var(--text-muted);
    margin: 12px 0 24px;
  }

  .win-time strong {
    color: #0f172a;
  }

  .win-actions {
    display: flex;
    justify-content: center;
    gap: 14px;
  }

  @media (max-width: 800px) {
    .game-grid {
      grid-template-columns: 1fr;
    }
    .match-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .meteor-options-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
