<script>
  import { onMount } from 'svelte';
  import GameCelebration from '$lib/components/GameCelebration.svelte';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { saveGameScoreLocally } from '$lib/staticDb.js';
  import { 
    getCurrentUser, 
    isTeacherOrAdmin, 
    isSuperAdmin,
    getGameArenaSettings, 
    saveGameArenaSettings, 
    toggleMasterGamePortal, 
    toggleIndividualGame,
    isGameAccessibleForUser,
    updateUserStarAdjustment,
    getStudentStars
  } from '$lib/unifiedStore';

  let { data } = $props();

  let currentUser = $state(null);
  let gameSettings = $state(getGameArenaSettings());
  let activeGame = $state('menu'); // 'menu' | 'match' | 'scramble' | 'meteor' | 'sentence' | 'tense' | 'memory' | 'duel'
  let playerName = $state('Học sinh Lớp 7');
  let studentStarBalance = $state(850);
  let starRewardToast = $state('');
  let teacherNotice = $state('');
  let completionStreak = $state(0);

  let isTeacher = $derived(isTeacherOrAdmin(currentUser));
  let isPortalOpen = $derived(gameSettings.is_portal_open);

  onMount(() => {
    currentUser = getCurrentUser();
    gameSettings = getGameArenaSettings();
    if (currentUser) {
      playerName = currentUser.name || 'Học sinh';
      if (currentUser.role === 'student') {
        const s = getStudentStars(currentUser.id);
        studentStarBalance = s.stars_balance || 850;
      }
    }

    const handleSettingsUpdate = (e) => {
      gameSettings = e.detail || getGameArenaSettings();
    };

    window.addEventListener('tienganh:game-settings-change', handleSettingsUpdate);
    return () => {
      window.removeEventListener('tienganh:game-settings-change', handleSettingsUpdate);
      if (matchInterval) clearInterval(matchInterval);
      if (meteorTimer) clearInterval(meteorTimer);
      if (tenseTimer) clearInterval(tenseTimer);
    };
  });

  function awardStars(delta = 20, reason = 'Hoàn thành thử thách trò chơi') {
    if (currentUser?.role === 'student') {
      const res = updateUserStarAdjustment(currentUser.id, delta, reason);
      if (res.success) {
        studentStarBalance = res.stars.stars_balance;
        starRewardToast = `🎉 Chúc mừng! Bạn nhận được +${delta} ⭐ (${(delta * 10).toLocaleString()}đ trừ học phí)`;
        setTimeout(() => starRewardToast = '', 5000);
      }
    }
  }

  function recordGameCompletion(reason) {
    completionStreak += 1;
    awardStars(gameSettings.reward_stars_per_game || 20, reason);
  }

  // Teacher Control Handlers
  function handleToggleMaster(isOpen) {
    gameSettings = toggleMasterGamePortal(isOpen, currentUser);
    teacherNotice = isOpen ? '🟢 Đã mở cổng đấu trường cho toàn bộ học sinh!' : '🔴 Đã khóa cổng đấu trường. Học sinh không thể truy cập!';
    playAudioFeedback(isOpen);
    setTimeout(() => teacherNotice = '', 4000);
  }

  function handleToggleGame(gameKey) {
    const next = !gameSettings.active_games[gameKey];
    gameSettings = toggleIndividualGame(gameKey, next, currentUser);
    teacherNotice = `Đã ${next ? 'bật' : 'tắt'} trò chơi: ${gameKey}`;
    setTimeout(() => teacherNotice = '', 3000);
  }

  // ==========================================
  // GAME 1: SPEED MATCH (Từ vựng: Ghép đôi phản xạ)
  // ==========================================
  let matchCards = $state([]);
  let matchSelected = $state([]);
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

    const words = data?.words && data.words.length >= 6 ? data.words : [
      { id: 'w1', term: 'Environment', ipa: '/ɪnˈvaɪrənmənt/', meaning_vi: 'Môi trường sống', pos: 'noun' },
      { id: 'w2', term: 'Community', ipa: '/kəˈmjuːnəti/', meaning_vi: 'Cộng đồng', pos: 'noun' },
      { id: 'w3', term: 'Pollution', ipa: '/pəˈluːʃn/', meaning_vi: 'Sự ô nhiễm', pos: 'noun' },
      { id: 'w4', term: 'Heritage', ipa: '/ˈherɪtɪdʒ/', meaning_vi: 'Di sản văn hóa', pos: 'noun' },
      { id: 'w5', term: 'Recycle', ipa: '/ˌriːˈsaɪkl/', meaning_vi: 'Tái chế rác thải', pos: 'verb' },
      { id: 'w6', term: 'Traditional', ipa: '/trəˈdɪʃənl/', meaning_vi: 'Thuộc về truyền thống', pos: 'adj' }
    ];

    const shuffledWords = [...words].sort(() => 0.5 - Math.random()).slice(0, matchTotalPairs);
    const cards = [];
    shuffledWords.forEach((word) => {
      cards.push({ id: `en_${word.id}`, wordId: word.id, text: word.term, sub: word.ipa, type: 'en', matched: false });
      cards.push({ id: `vi_${word.id}`, wordId: word.id, text: word.meaning_vi, sub: word.pos, type: 'vi', matched: false });
    });

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

    playAudioFeedback('flip');
    if (card.type === 'en') speakWord(card.text, 0.9);
    matchSelected.push(index);

    if (matchSelected.length === 2) {
      const idx1 = matchSelected[0];
      const idx2 = matchSelected[1];
      const card1 = matchCards[idx1];
      const card2 = matchCards[idx2];

      if (card1.wordId === card2.wordId && card1.type !== card2.type) {
        setTimeout(() => {
          card1.matched = true;
          card2.matched = true;
          matchSelected = [];
          matchPairsFound++;
          playAudioFeedback('correct');

          if (matchPairsFound >= matchTotalPairs) {
            clearInterval(matchInterval);
            matchCompleted = true;
            playAudioFeedback('win');
            recordGameCompletion('Chiến thắng Speed Match');
          }
        }, 250);
      } else {
        playAudioFeedback('wrong');
        setTimeout(() => { matchSelected = []; }, 650);
      }
    }
  }

  // ==========================================
  // GAME 2: WORD SCRAMBLE (Từ vựng: Xếp chữ Duolingo)
  // ==========================================
  let scrambleWordList = $state([]);
  let scrambleIndex = $state(0);
  let scrambleLetters = $state([]);
  let scrambleAssembled = $state([]);
  let scrambleScore = $state(0);
  let scrambleFinished = $state(false);
  let scrambleStatus = $state('');

  let currentScramble = $derived(scrambleWordList[scrambleIndex] || null);

  function startScrambleGame() {
    activeGame = 'scramble';
    scrambleScore = 0;
    scrambleIndex = 0;
    scrambleFinished = false;

    const words = data?.words && data.words.length >= 6 ? data.words : [
      { id: 'w1', term: 'FUTURE', meaning_vi: 'Tương lai' },
      { id: 'w2', term: 'GLOBAL', meaning_vi: 'Toàn cầu' },
      { id: 'w3', term: 'ENERGY', meaning_vi: 'Năng lượng' },
      { id: 'w4', term: 'SCHOOL', meaning_vi: 'Trường học' },
      { id: 'w5', term: 'PLANET', meaning_vi: 'Hành tinh' }
    ];

    scrambleWordList = [...words].sort(() => 0.5 - Math.random()).slice(0, 6);
    loadScrambleWord();
  }

  function loadScrambleWord() {
    if (!currentScramble) return;
    scrambleStatus = '';
    scrambleAssembled = [];
    const cleanTerm = currentScramble.term.toUpperCase().replace(/[^A-Z]/g, '');
    const chars = cleanTerm.split('').map((char, i) => ({ char, id: `${char}_${i}`, used: false }));
    scrambleLetters = chars.sort(() => 0.5 - Math.random());
    speakWord(currentScramble.term, 0.9);
  }

  function pickLetter(letter) {
    if (letter.used || scrambleStatus === 'correct') return;
    letter.used = true;
    scrambleAssembled.push({ char: letter.char, originalId: letter.id });
    playAudioFeedback('flip');

    const target = currentScramble.term.toUpperCase().replace(/[^A-Z]/g, '');
    const current = scrambleAssembled.map(a => a.char).join('');

    if (current.length === target.length) {
      if (current === target) {
        scrambleStatus = 'correct';
        scrambleScore += 100;
        playAudioFeedback('correct');
        speakWord(currentScramble.term, 0.9);

        setTimeout(() => {
          if (scrambleIndex < scrambleWordList.length - 1) {
            scrambleIndex++;
            loadScrambleWord();
          } else {
            scrambleFinished = true;
            playAudioFeedback('win');
            recordGameCompletion('Chiến thắng Word Scramble');
          }
        }, 1200);
      } else {
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

  // ==========================================
  // GAME 3: METEOR RUSH (Từ vựng: Đua tốc độ 10s)
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

    const sampleWords = [
      { term: 'Volunteer', meaning_vi: 'Tình nguyện viên' },
      { term: 'Festival', meaning_vi: 'Lễ hội văn hóa' },
      { term: 'Custom', meaning_vi: 'Phong tục tập quán' },
      { term: 'Pollution', meaning_vi: 'Sự ô nhiễm' },
      { term: 'Solar Energy', meaning_vi: 'Năng lượng mặt trời' }
    ];

    meteorQuestions = sampleWords.map(w => {
      const distractors = sampleWords.filter(d => d.term !== w.term).map(d => d.meaning_vi);
      const options = [w.meaning_vi, ...distractors.slice(0, 3)].sort(() => 0.5 - Math.random());
      return { word: w, options, correct: w.meaning_vi };
    });

    nextMeteorTurn();
  }

  function nextMeteorTurn() {
    if (meteorIndex >= meteorQuestions.length) {
      clearInterval(meteorTimer);
      meteorFinished = true;
      playAudioFeedback('win');
      recordGameCompletion('Chiến thắng Meteor Rush');
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
        handleMeteorAnswer(null);
      }
    }, 100);
  }

  function handleMeteorAnswer(chosenOption) {
    if (meteorFeedback) return;
    clearInterval(meteorTimer);

    const isCorrect = chosenOption === currentMeteor.correct;
    if (isCorrect) {
      meteorStreak++;
      const multiplier = Math.min(3, 1 + Math.floor(meteorStreak / 2));
      const turnScore = 100 * multiplier;
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

  // ==========================================
  // GAME 4: SENTENCE BUILDER (NGỮ PHÁP - MỚI!)
  // ==========================================
  const sentenceBank = [
    {
      id: 'sb_1',
      grammar_point: 'Hiện tại hoàn thành (Present Perfect)',
      vietnamese: 'Cô ấy đã sống ở Hà Nội được hơn 5 năm.',
      chunks: ['She', 'has lived', 'in Hanoi', 'for more than', 'five years.'],
      target: ['She', 'has lived', 'in Hanoi', 'for more than', 'five years.'],
      hint: 'Chủ ngữ (She) + has + V3/ed + nơi chốn + for + khoảng thời gian.'
    },
    {
      id: 'sb_2',
      grammar_point: 'Câu điều kiện loại 1 (Conditional Type 1)',
      vietnamese: 'Nếu ngày mai trời mưa, chúng tôi sẽ hủy chuyến dã ngoại.',
      chunks: ['If it rains', 'tomorrow,', 'we will cancel', 'the picnic.'],
      target: ['If it rains', 'tomorrow,', 'we will cancel', 'the picnic.'],
      hint: 'Mệnh đề If (Hiện tại đơn) + Mệnh đề chính (will + V-nguyên thể).'
    },
    {
      id: 'sb_3',
      grammar_point: 'Câu bị động (Passive Voice)',
      vietnamese: 'Thư viện mới này đã được xây dựng bởi cộng đồng vào năm ngoái.',
      chunks: ['This new library', 'was built', 'by our community', 'last year.'],
      target: ['This new library', 'was built', 'by our community', 'last year.'],
      hint: 'Chủ ngữ chỉ vật + was/were + V3/ed + by O + thời gian quá khứ.'
    },
    {
      id: 'sb_4',
      grammar_point: 'Mệnh đề quan hệ (Relative Clause)',
      vietnamese: 'Người phụ nữ đang dạy tiếng Anh là cô giáo chủ nhiệm của tôi.',
      chunks: ['The woman', 'who is teaching', 'English', 'is my head teacher.'],
      target: ['The woman', 'who is teaching', 'English', 'is my head teacher.'],
      hint: 'Đại từ quan hệ "who" thay thế cho danh từ chỉ người làm chủ ngữ.'
    }
  ];

  let sentenceIndex = $state(0);
  let availableChunks = $state([]);
  let placedChunks = $state([]);
  let sentenceScore = $state(0);
  let sentenceStatus = $state(''); // 'correct' | 'wrong' | ''
  let sentenceFinished = $state(false);

  let currentSentence = $derived(sentenceBank[sentenceIndex] || null);

  function startSentenceGame() {
    activeGame = 'sentence';
    sentenceIndex = 0;
    sentenceScore = 0;
    sentenceFinished = false;
    loadSentenceRound();
  }

  function loadSentenceRound() {
    if (!currentSentence) return;
    sentenceStatus = '';
    placedChunks = [];
    availableChunks = currentSentence.chunks
      .map((c, i) => ({ text: c, id: `chunk_${i}`, used: false }))
      .sort(() => 0.5 - Math.random());
  }

  function pickChunk(chunk) {
    if (chunk.used || sentenceStatus === 'correct') return;
    chunk.used = true;
    placedChunks.push(chunk);
    playAudioFeedback('flip');

    if (placedChunks.length === currentSentence.chunks.length) {
      checkSentenceResult();
    }
  }

  function removeChunk(index) {
    if (sentenceStatus === 'correct') return;
    const removed = placedChunks.splice(index, 1)[0];
    removed.used = false;
    sentenceStatus = '';
    playAudioFeedback('flip');
  }

  function checkSentenceResult() {
    const isExact = placedChunks.every((c, idx) => c.text === currentSentence.target[idx]);
    if (isExact) {
      sentenceStatus = 'correct';
      sentenceScore += 150;
      playAudioFeedback('correct');
      speakWord(currentSentence.target.join(' '), 0.85);

      setTimeout(() => {
        if (sentenceIndex < sentenceBank.length - 1) {
          sentenceIndex++;
          loadSentenceRound();
        } else {
          sentenceFinished = true;
          playAudioFeedback('win');
          recordGameCompletion('Chiến thắng Sentence Builder Ngữ Pháp');
        }
      }, 1800);
    } else {
      sentenceStatus = 'wrong';
      playAudioFeedback('wrong');
    }
  }

  // ==========================================
  // GAME 5: GRAMMAR TENSE MASTER (NGỮ PHÁP - MỚI!)
  // ==========================================
  const tenseQuestions = [
    {
      question: 'By the time my father arrived home yesterday, we _______ dinner.',
      options: ['had already finished', 'finished', 'have finished', 'were finishing'],
      correct: 'had already finished',
      explain: 'Hành động xảy ra và hoàn tất TRƯỚC một hành động khác trong quá khứ dùng Quá khứ hoàn thành (Past Perfect).'
    },
    {
      question: 'If you studied harder for the upcoming exam, you _______ better marks.',
      options: ['would get', 'will get', 'got', 'would have got'],
      correct: 'would get',
      explain: 'Câu điều kiện loại 2: If + S + V2/ed, S + would + V.'
    },
    {
      question: 'Listen! Somebody _______ the violin in the music room next door.',
      options: ['is playing', 'plays', 'played', 'has played'],
      correct: 'is playing',
      explain: 'Dấu hiệu "Listen!" diễn tả hành động đang diễn ra tại thời điểm nói -> Hiện tại tiếp diễn.'
    },
    {
      question: 'English _______ by more than 1.5 billion people around the world.',
      options: ['is spoken', 'speaks', 'was spoken', 'is speaking'],
      correct: 'is spoken',
      explain: 'Chủ ngữ chịu tác động (Bị động hiện tại đơn): S + am/is/are + V3/ed.'
    }
  ];

  let tenseIndex = $state(0);
  let tenseScore = $state(0);
  let tenseTimeLeft = $state(15);
  let tenseTimer = $state(null);
  let tenseFinished = $state(false);
  let tenseFeedback = $state(null);

  let currentTenseQ = $derived(tenseQuestions[tenseIndex] || null);

  function startTenseGame() {
    activeGame = 'tense';
    tenseIndex = 0;
    tenseScore = 0;
    tenseFinished = false;
    nextTenseQuestion();
  }

  function nextTenseQuestion() {
    if (tenseIndex >= tenseQuestions.length) {
      clearInterval(tenseTimer);
      tenseFinished = true;
      playAudioFeedback('win');
      recordGameCompletion('Chiến thắng Grammar Tense Master');
      return;
    }

    tenseFeedback = null;
    tenseTimeLeft = 15;
    if (tenseTimer) clearInterval(tenseTimer);

    tenseTimer = setInterval(() => {
      tenseTimeLeft -= 0.1;
      if (tenseTimeLeft <= 0) {
        clearInterval(tenseTimer);
        handleTenseSelect(null);
      }
    }, 100);
  }

  function handleTenseSelect(option) {
    if (tenseFeedback) return;
    clearInterval(tenseTimer);

    const isCorrect = option === currentTenseQ.correct;
    if (isCorrect) {
      tenseScore += 100 + Math.round(tenseTimeLeft * 10);
      tenseFeedback = { type: 'correct', text: 'Chính xác! Xuất sắc nắm vững quy tắc thì.' };
      playAudioFeedback('correct');
    } else {
      tenseFeedback = { type: 'wrong', text: `Chưa đúng! Đáp án đúng: ${currentTenseQ.correct}` };
      playAudioFeedback('wrong');
    }

    setTimeout(() => {
      tenseIndex++;
      nextTenseQuestion();
    }, 1800);
  }

  // ==========================================
  // GAME 6: MEMORY FLIP 3D (THẺ BÀI CARDS - MỚI!)
  // ==========================================
  let memoryCards = $state([]);
  let memoryFlipped = $state([]);
  let memoryPairsFound = $state(0);
  let memoryTotalPairs = 8;
  let memoryMoves = $state(0);
  let memoryFinished = $state(false);

  function startMemoryGame() {
    activeGame = 'memory';
    memoryFinished = false;
    memoryPairsFound = 0;
    memoryMoves = 0;
    memoryFlipped = [];

    const items = [
      { id: 'm1', en: 'Elephant', vi: 'Con voi', emoji: '🐘', ipa: '/ˈelɪfənt/' },
      { id: 'm2', en: 'Sun', vi: 'Mặt trời', emoji: '☀️', ipa: '/sʌn/' },
      { id: 'm3', en: 'Star', vi: 'Ngôi sao', emoji: '⭐', ipa: '/stɑːr/' },
      { id: 'm4', en: 'Book', vi: 'Quyển sách', emoji: '📖', ipa: '/bʊk/' },
      { id: 'm5', en: 'Apple', vi: 'Quả táo', emoji: '🍎', ipa: '/ˈæpl/' },
      { id: 'm6', en: 'Cat', vi: 'Chú mèo', emoji: '🐱', ipa: '/kæt/' },
      { id: 'm7', en: 'Dog', vi: 'Chú chó', emoji: '🐶', ipa: '/dɔːɡ/' },
      { id: 'm8', en: 'Guitar', vi: 'Đàn ghi-ta', emoji: '🎸', ipa: '/ɡɪˈtɑːr/' }
    ];

    const cards = [];
    items.forEach((item, i) => {
      cards.push({ cardId: `en_${i}`, pairId: item.id, content: item.en, sub: item.ipa, isFlipped: false, isMatched: false, type: 'en' });
      cards.push({ cardId: `vi_${i}`, pairId: item.id, content: `${item.emoji} ${item.vi}`, sub: 'Nghĩa tiếng Việt', isFlipped: false, isMatched: false, type: 'vi' });
    });

    memoryCards = cards.sort(() => 0.5 - Math.random());
  }

  function handleMemoryFlip(index) {
    const card = memoryCards[index];
    if (card.isMatched || card.isFlipped || memoryFlipped.length >= 2) return;

    card.isFlipped = true;
    playAudioFeedback('flip');
    if (card.type === 'en') speakWord(card.content, 0.9);

    memoryFlipped.push(index);

    if (memoryFlipped.length === 2) {
      memoryMoves++;
      const [idx1, idx2] = memoryFlipped;
      const c1 = memoryCards[idx1];
      const c2 = memoryCards[idx2];

      if (c1.pairId === c2.pairId && c1.type !== c2.type) {
        setTimeout(() => {
          c1.isMatched = true;
          c2.isMatched = true;
          memoryPairsFound++;
          memoryFlipped = [];
          playAudioFeedback('correct');

          if (memoryPairsFound >= memoryTotalPairs) {
            memoryFinished = true;
            playAudioFeedback('win');
            recordGameCompletion('Chiến thắng Memory Flip 3D Thẻ Bài');
          }
        }, 300);
      } else {
        setTimeout(() => {
          c1.isFlipped = false;
          c2.isFlipped = false;
          memoryFlipped = [];
        }, 900);
      }
    }
  }

  // Helper to check individual game accessibility
  function canPlayGame(gameKey) {
    return isTeacher || isGameAccessibleForUser(currentUser, gameKey);
  }
</script>

<div class="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

  <!-- Toast for Star Rewards -->
  {#if starRewardToast}
    <div class="fixed top-20 right-5 z-50 p-4 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs shadow-2xl animate-in slide-in-from-top-3 flex items-center gap-3">
      <span class="text-xl">⭐</span>
      <span>{starRewardToast}</span>
    </div>
  {/if}

  <!-- Teacher Notification Notice -->
  {#if teacherNotice}
    <div class="p-4 rounded-2xl bg-indigo-600 text-white font-bold text-xs shadow-lg animate-in fade-in flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span>📢</span>
        <span>{teacherNotice}</span>
      </div>
      <button onclick={() => teacherNotice = ''} class="text-white hover:opacity-80">✕</button>
    </div>
  {/if}

  <!-- ========================================================================= -->
  <!-- TEACHER CONTROL PANEL (BẢNG ĐIỀU KHIỂN GATEKEEPER CỦA GIÁO VIÊN) -->
  <!-- ========================================================================= -->
  {#if isTeacher}
    <div class="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-amber-500/60 p-6 shadow-2xl text-white space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl font-bold">
            👨‍🏫
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-amber-400 uppercase tracking-wider">CỔNG KIỂM SOÁT GIÁO VIÊN (GATEKEEPER)</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-black {isPortalOpen ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}">
                {isPortalOpen ? '🟢 HỌC SINH ĐANG ĐƯỢC CHƠI' : '🔒 ĐANG KHÓA HỌC SINH'}
              </span>
            </div>
            <h2 class="text-xl font-heading font-black text-white mt-0.5">
              Điều Khiển Trò Chơi Tiếng Anh Lớp Học
            </h2>
          </div>
        </div>

        <!-- Master Switch Button -->
        <div class="flex items-center gap-2">
          {#if isPortalOpen}
            <button
              onclick={() => handleToggleMaster(false)}
              class="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
            >
              <span>🔒 KHÓA CỔNG GAME NGAY</span>
            </button>
          {:else}
            <button
              onclick={() => handleToggleMaster(true)}
              class="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 animate-bounce"
            >
              <span>🚀 MỞ CỔNG CHO HỌC SINH</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Granular Switch Toggles for Each Game -->
      <div class="space-y-2">
        <div class="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
          Bật / Tắt Từng Trò Chơi Cụ Thể (Giáo viên luôn có quyền chơi thử bất cứ lúc nào):
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <!-- Game 1 -->
          <button
            onclick={() => handleToggleGame('speed_match')}
            class="p-2.5 rounded-xl border text-left transition-all {gameSettings.active_games.speed_match ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
          >
            <div class="font-bold flex items-center justify-between">
              <span>⚡ Speed Match</span>
              <span>{gameSettings.active_games.speed_match ? '✓' : '✕'}</span>
            </div>
            <div class="text-[10px] text-slate-400">Từ vựng</div>
          </button>

          <!-- Game 2 -->
          <button
            onclick={() => handleToggleGame('word_scramble')}
            class="p-2.5 rounded-xl border text-left transition-all {gameSettings.active_games.word_scramble ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
          >
            <div class="font-bold flex items-center justify-between">
              <span>🔤 Xếp Chữ</span>
              <span>{gameSettings.active_games.word_scramble ? '✓' : '✕'}</span>
            </div>
            <div class="text-[10px] text-slate-400">Từ vựng</div>
          </button>

          <!-- Game 3 -->
          <button
            onclick={() => handleToggleGame('meteor_rush')}
            class="p-2.5 rounded-xl border text-left transition-all {gameSettings.active_games.meteor_rush ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
          >
            <div class="font-bold flex items-center justify-between">
              <span>☄️ Bắn Thiên Thạch</span>
              <span>{gameSettings.active_games.meteor_rush ? '✓' : '✕'}</span>
            </div>
            <div class="text-[10px] text-slate-400">Từ vựng 10s</div>
          </button>

          <!-- Game 4 -->
          <button
            onclick={() => handleToggleGame('sentence_builder')}
            class="p-2.5 rounded-xl border text-left transition-all {gameSettings.active_games.sentence_builder ? 'bg-indigo-950/60 border-indigo-400 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
          >
            <div class="font-bold flex items-center justify-between">
              <span>🧩 Xây Dựng Câu</span>
              <span>{gameSettings.active_games.sentence_builder ? '✓' : '✕'}</span>
            </div>
            <div class="text-[10px] text-indigo-300 font-bold">Ngữ Pháp K12</div>
          </button>

          <!-- Game 5 -->
          <button
            onclick={() => handleToggleGame('grammar_tense')}
            class="p-2.5 rounded-xl border text-left transition-all {gameSettings.active_games.grammar_tense ? 'bg-indigo-950/60 border-indigo-400 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
          >
            <div class="font-bold flex items-center justify-between">
              <span>⏱️ Thì Động Từ</span>
              <span>{gameSettings.active_games.grammar_tense ? '✓' : '✕'}</span>
            </div>
            <div class="text-[10px] text-indigo-300 font-bold">Bẫy Ngữ Pháp</div>
          </button>

          <!-- Game 6 -->
          <button
            onclick={() => handleToggleGame('memory_flip')}
            class="p-2.5 rounded-xl border text-left transition-all {gameSettings.active_games.memory_flip ? 'bg-purple-950/60 border-purple-400 text-purple-200' : 'bg-slate-950 border-slate-800 text-slate-400'}"
          >
            <div class="font-bold flex items-center justify-between">
              <span>🎴 Memory Flip 3D</span>
              <span>{gameSettings.active_games.memory_flip ? '✓' : '✕'}</span>
            </div>
            <div class="text-[10px] text-purple-300 font-bold">Thẻ Bài Flashcard</div>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ========================================================================= -->
  <!-- STUDENT GATE: LOCKED STATE (MẶC ĐỊNH KHÓA NẾU GIÁO VIÊN CHƯA MỞ) -->
  <!-- ========================================================================= -->
  {#if !isTeacher && !isPortalOpen}
    <div class="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-xl space-y-6">
      <div class="w-20 h-20 rounded-3xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center text-5xl shadow-inner animate-pulse">
        🔒
      </div>

      <div class="space-y-2">
        <span class="px-3 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/40 uppercase">
          Khu Vực Kiểm Soát Lớp Học
        </span>
        <h1 class="text-2xl sm:text-3xl font-heading font-black text-slate-900 dark:text-white">
          Đấu Trường Trò Chơi Hiện Đang Đóng
        </h1>
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
          {gameSettings.lock_message || 'Cổng game được quản lý nghiêm ngặt bởi Cô Dung. Chỉ mở trong giờ giải lao hoặc luyện phản xạ nhóm sau khi học sinh hoàn thành bài học chính khóa!'}
        </p>
      </div>

      <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        <span>💡 Gợi ý: Hãy hoàn thành bài tập Unit chính khóa hoặc bài test 15 phút để tích lũy sao thưởng. Khi cô giáo bấm lệnh mở, màn hình này sẽ tự động mở ngay!</span>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <a
          href="/"
          class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
        >
          <span>🚀 Về Bài Học Lớp Của Tôi</span>
        </a>
        <a
          href="/exam"
          class="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
        >
          <span>⏱️ Làm Đề Thi 15p Chuẩn Bộ</span>
        </a>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- GAME ARENA LOBBY (KHI ĐÃ ĐƯỢC GIÁO VIÊN MỞ HOẶC GIÁO VIÊN PREVIEW) -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'menu'}
    <div class="space-y-8">
      <!-- Hero Header -->
      <div class="rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-indigo-700 p-8 sm:p-10 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="space-y-2 max-w-2xl">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-white/20 backdrop-blur-sm tracking-wider">
            <span>🎮 ĐẤU TRƯỜNG TIẾNG ANH TOÀN DIỆN 2026</span>
          </div>
          <h1 class="text-2xl sm:text-4xl font-heading font-black">
            Học Vui &amp; Bứt Phá Điểm Số Cùng Cô Dung 🌟
          </h1>
          <p class="text-xs sm:text-sm text-emerald-100 leading-relaxed">
            Kết hợp 3 trụ cột rèn luyện: <strong>Từ vựng</strong> phản xạ tốc độ cao, <strong>Ngữ pháp</strong> cấu trúc câu chuẩn K12 và <strong>Thẻ bài Flashcard 3D</strong> kích thích đa giác quan!
          </p>
        </div>

        <!-- Star Badge -->
        <div class="p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-4 flex-shrink-0">
          <div class="text-4xl animate-bounce">⭐</div>
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Ví Sao Tích Lũy</div>
            <div class="text-2xl font-heading font-black text-amber-300">{studentStarBalance} Sao</div>
            <div class="text-[10px] text-emerald-100">+{gameSettings.reward_stars_per_game || 20} ⭐ mỗi trận thắng</div>
          </div>
        </div>
      </div>

      <!-- 3 PILLARS OF ENGLISH GAMES -->

      <!-- PILLAR 1: TRÒ CHƠI NGỮ PHÁP (GRAMMAR MASTER - NEW!) -->
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="text-xl">🧩</span>
          <h2 class="text-xl font-heading font-black text-slate-900 dark:text-white">
            Trụ Cột 1: Đấu Trường Ngữ Pháp K12 &amp; Cấu Trúc Câu
          </h2>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-400/30">
            NÂNG CẤP 2026
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Game: Sentence Builder -->
          <div class="rounded-2xl bg-white dark:bg-slate-900 border-2 {canPlayGame('sentence_builder') ? 'border-indigo-500/60 shadow-lg' : 'border-slate-200 dark:border-slate-800 opacity-60'} p-6 flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-3xl p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                  🧩
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {canPlayGame('sentence_builder') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {canPlayGame('sentence_builder') ? '✓ Đang Mở' : '🔒 Khóa'}
                </span>
              </div>
              <h3 class="font-heading font-black text-lg text-slate-900 dark:text-white">
                Xây Dựng Cấu Trúc Câu (Sentence Builder)
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Ghép các khối từ ngữ xáo trộn thành câu hoàn chỉnh đúng trật tự ngữ pháp S + V + O, thì Hiện tại hoàn thành, Câu điều kiện và Câu bị động.
              </p>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">+150 điểm / câu</span>
              {#if canPlayGame('sentence_builder')}
                <button onclick={startSentenceGame} class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105">
                  {isTeacher ? 'Chơi Thử ➔' : 'Vào Chơi Ngay ➔'}
                </button>
              {:else}
                <span class="text-xs text-slate-400 italic">Cô giáo chưa kích hoạt</span>
              {/if}
            </div>
          </div>

          <!-- Game: Grammar Tense Master -->
          <div class="rounded-2xl bg-white dark:bg-slate-900 border-2 {canPlayGame('grammar_tense') ? 'border-indigo-500/60 shadow-lg' : 'border-slate-200 dark:border-slate-800 opacity-60'} p-6 flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-3xl p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                  ⏱️
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {canPlayGame('grammar_tense') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {canPlayGame('grammar_tense') ? '✓ Đang Mở' : '🔒 Khóa'}
                </span>
              </div>
              <h3 class="font-heading font-black text-lg text-slate-900 dark:text-white">
                Bậc Thầy Thì Động Từ (Tense Master Blitz)
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Đua tốc độ 15 giây mỗi câu! Vượt qua các bẫy ngữ pháp thi vào 10 và THPT Quốc gia về chia động từ, mạo từ và câu gián tiếp.
              </p>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">15s / câu • Combo x3</span>
              {#if canPlayGame('grammar_tense')}
                <button onclick={startTenseGame} class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105">
                  {isTeacher ? 'Chơi Thử ➔' : 'Vào Chơi Ngay ➔'}
                </button>
              {:else}
                <span class="text-xs text-slate-400 italic">Cô giáo chưa kích hoạt</span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- PILLAR 2: TRÒ CHƠI THẺ BÀI FLASHCARDS (CARDS ARENA - NEW!) -->
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="text-xl">🎴</span>
          <h2 class="text-xl font-heading font-black text-slate-900 dark:text-white">
            Trụ Cột 2: Đấu Trường Thẻ Bài Flashcards Đa Giác Quan
          </h2>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-400/30">
            AUDIO BẢN NGỮ
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Game: Memory Flip 3D -->
          <div class="rounded-2xl bg-white dark:bg-slate-900 border-2 {canPlayGame('memory_flip') ? 'border-purple-500/60 shadow-lg' : 'border-slate-200 dark:border-slate-800 opacity-60'} p-6 flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-3xl p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                  🎴
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {canPlayGame('memory_flip') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {canPlayGame('memory_flip') ? '✓ Đang Mở' : '🔒 Khóa'}
                </span>
              </div>
              <h3 class="font-heading font-black text-lg text-slate-900 dark:text-white">
                Lật Thẻ Trí Nhớ 3D (Memory Flip Cards)
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Bàn cờ 16 thẻ úp mặt. Lật tìm cặp tương ứng giữa từ vựng chuẩn IPA và hình ảnh minh họa, phát âm tự động kích thích ghi nhớ sâu.
              </p>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-purple-600 dark:text-purple-400">16 thẻ bài • 8 cặp</span>
              {#if canPlayGame('memory_flip')}
                <button onclick={startMemoryGame} class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105">
                  {isTeacher ? 'Chơi Thử ➔' : 'Vào Chơi Ngay ➔'}
                </button>
              {:else}
                <span class="text-xs text-slate-400 italic">Cô giáo chưa kích hoạt</span>
              {/if}
            </div>
          </div>

          <!-- Game: Speed Match -->
          <div class="rounded-2xl bg-white dark:bg-slate-900 border-2 {canPlayGame('speed_match') ? 'border-emerald-500/60 shadow-lg' : 'border-slate-200 dark:border-slate-800 opacity-60'} p-6 flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-3xl p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800">
                  ⚡
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {canPlayGame('speed_match') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {canPlayGame('speed_match') ? '✓ Đang Mở' : '🔒 Khóa'}
                </span>
              </div>
              <h3 class="font-heading font-black text-lg text-slate-900 dark:text-white">
                Ghép Đôi Phản Xạ (Speed Match Cards)
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Nối nhanh 12 thẻ Anh - Việt đang trôi trên màn hình. Rèn luyện phản xạ dịch nghĩa tức thì chuẩn Quizlet Match.
              </p>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">12 thẻ ngẫu nhiên</span>
              {#if canPlayGame('speed_match')}
                <button onclick={startMatchGame} class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105">
                  {isTeacher ? 'Chơi Thử ➔' : 'Vào Chơi Ngay ➔'}
                </button>
              {:else}
                <span class="text-xs text-slate-400 italic">Cô giáo chưa kích hoạt</span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- PILLAR 3: TRÒ CHƠI TỪ VỰNG TỐC ĐỘ (VOCABULARY ARENA) -->
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <span class="text-xl">🔤</span>
          <h2 class="text-xl font-heading font-black text-slate-900 dark:text-white">
            Trụ Cột 3: Đấu Trường Từ Vựng Phản Xạ &amp; Chính Tả
          </h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Game: Word Scramble -->
          <div class="rounded-2xl bg-white dark:bg-slate-900 border-2 {canPlayGame('word_scramble') ? 'border-amber-500/60 shadow-lg' : 'border-slate-200 dark:border-slate-800 opacity-60'} p-6 flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-3xl p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
                  🔤
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {canPlayGame('word_scramble') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {canPlayGame('word_scramble') ? '✓ Đang Mở' : '🔒 Khóa'}
                </span>
              </div>
              <h3 class="font-heading font-black text-lg text-slate-900 dark:text-white">
                Sắp Xếp Ký Tự (Word Scramble)
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Nghe phát âm bản ngữ và xem nghĩa tiếng Việt, bấm chọn các chữ cái xáo trộn để ghép thành từ vựng hoàn chỉnh.
              </p>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-amber-600 dark:text-amber-400">100 điểm / từ</span>
              {#if canPlayGame('word_scramble')}
                <button onclick={startScrambleGame} class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105">
                  {isTeacher ? 'Chơi Thử ➔' : 'Vào Chơi Ngay ➔'}
                </button>
              {:else}
                <span class="text-xs text-slate-400 italic">Cô giáo chưa kích hoạt</span>
              {/if}
            </div>
          </div>

          <!-- Game: Meteor Rush -->
          <div class="rounded-2xl bg-white dark:bg-slate-900 border-2 {canPlayGame('meteor_rush') ? 'border-rose-500/60 shadow-lg' : 'border-slate-200 dark:border-slate-800 opacity-60'} p-6 flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-3xl p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                  ☄️
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {canPlayGame('meteor_rush') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-600'}">
                  {canPlayGame('meteor_rush') ? '✓ Đang Mở' : '🔒 Khóa'}
                </span>
              </div>
              <h3 class="font-heading font-black text-lg text-slate-900 dark:text-white">
                Bắn Thiên Thạch (Meteor Rush 10s)
              </h3>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Đếm ngược 10 giây mỗi câu! Chọn nhanh nghĩa đúng để phá hủy thiên thạch và nhận combo điểm số nhân 3.
              </p>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-rose-600 dark:text-rose-400">10s phản xạ nhanh</span>
              {#if canPlayGame('meteor_rush')}
                <button onclick={startMeteorGame} class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105">
                  {isTeacher ? 'Chơi Thử ➔' : 'Vào Chơi Ngay ➔'}
                </button>
              {:else}
                <span class="text-xs text-slate-400 italic">Cô giáo chưa kích hoạt</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- GAME SCREEN 4: SENTENCE BUILDER (NGỮ PHÁP) -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'sentence'}
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button onclick={() => activeGame = 'menu'} class="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold">
          ← Về Menu Game
        </button>
        <div class="flex items-center gap-3 text-xs font-bold">
          <span class="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40">
            Câu {sentenceIndex + 1} / {sentenceBank.length}
          </span>
          <span class="text-emerald-600 dark:text-emerald-400">⭐ Điểm: {sentenceScore}</span>
        </div>
      </div>

      {#if !sentenceFinished && currentSentence}
        <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-xl">
          <div class="space-y-1.5 text-center">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 uppercase">
              {currentSentence.grammar_point}
            </span>
            <h3 class="text-lg sm:text-xl font-heading font-black text-slate-900 dark:text-white">
              "{currentSentence.vietnamese}"
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 italic">💡 Gợi ý: {currentSentence.hint}</p>
          </div>

          <!-- Sentence Assembly Slot -->
          <div class="min-h-[70px] p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 {sentenceStatus === 'correct' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : sentenceStatus === 'wrong' ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20' : 'border-dashed border-slate-300 dark:border-slate-700'} flex flex-wrap items-center gap-2 transition-all">
            {#if placedChunks.length === 0}
              <span class="text-xs text-slate-400 italic mx-auto">Bấm chọn các khối từ ngữ bên dưới theo đúng trật tự câu...</span>
            {:else}
              {#each placedChunks as chunk, idx}
                <button
                  onclick={() => removeChunk(idx)}
                  class="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md transition-all hover:bg-indigo-500 hover:scale-105"
                  title="Bấm để gỡ khối từ này"
                >
                  {chunk.text}
                </button>
              {/each}
            {/if}
          </div>

          {#if sentenceStatus === 'correct'}
            <div class="p-3 rounded-xl bg-emerald-500 text-white text-xs font-bold text-center animate-in zoom-in-95">
              🎉 Chính xác! Bạn đã xây dựng câu chuẩn 100% ngữ pháp! (+150 điểm)
            </div>
          {:else if sentenceStatus === 'wrong'}
            <div class="p-3 rounded-xl bg-rose-500 text-white text-xs font-bold text-center animate-in shake">
              ⚠️ Trật tự từ chưa chính xác! Hãy bấm vào khối từ để gỡ và thử sắp xếp lại.
            </div>
          {/if}

          <!-- Available Word Chunks to Pick -->
          <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div class="text-[11px] font-bold text-slate-400 mb-2">Các khối từ có sẵn (Bấm để xếp vào câu):</div>
            <div class="flex flex-wrap gap-2.5 justify-center">
              {#each availableChunks as chunk}
                <button
                  disabled={chunk.used || sentenceStatus === 'correct'}
                  onclick={() => pickChunk(chunk)}
                  class="px-4 py-2.5 rounded-xl border font-bold text-xs transition-all {chunk.used ? 'opacity-20 border-slate-200 dark:border-slate-800 pointer-events-none' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:scale-105 text-slate-800 dark:text-slate-200 shadow-sm'}"
                >
                  {chunk.text}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <!-- Victory Finish -->
        <GameCelebration
          title="Hoàn thành thử thách cấu trúc câu!"
          score={sentenceScore}
          maxScore={sentenceBank.length * 150}
          rewardStars={gameSettings.reward_stars_per_game || 20}
          streak={completionStreak}
          metric={`Đã hoàn thành ${sentenceBank.length} mẫu câu tiếng Anh`}
          icon="🏆"
          accent="emerald"
          onReplay={startSentenceGame}
          onMenu={() => activeGame = 'menu'}
        />
      {/if}
    </div>

  <!-- ========================================================================= -->
  <!-- GAME SCREEN 5: GRAMMAR TENSE MASTER (NGỮ PHÁP) -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'tense'}
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button onclick={() => activeGame = 'menu'} class="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold">
          ← Về Menu Game
        </button>
        <div class="flex items-center gap-3 text-xs font-bold">
          <span class="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
            Câu {tenseIndex + 1} / {tenseQuestions.length}
          </span>
          <span class="text-amber-500">⏱️ {tenseTimeLeft.toFixed(1)}s</span>
          <span class="text-emerald-600 dark:text-emerald-400">Điểm: {tenseScore}</span>
        </div>
      </div>

      {#if !tenseFinished && currentTenseQ}
        <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-xl">
          <!-- Timer Bar -->
          <div class="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-100" style="width: {(tenseTimeLeft / 15) * 100}%"></div>
          </div>

          <div class="space-y-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">CHỌN DẠNG ĐÚNG CỦA ĐỘNG TỪ / CẤU TRÚC:</span>
            <h3 class="text-base sm:text-lg font-heading font-black text-slate-900 dark:text-white leading-relaxed">
              {currentTenseQ.question}
            </h3>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {#each currentTenseQ.options as opt}
              <button
                disabled={!!tenseFeedback}
                onclick={() => handleTenseSelect(opt)}
                class="p-4 rounded-2xl border text-left font-bold text-xs transition-all {tenseFeedback && opt === currentTenseQ.correct ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : tenseFeedback && opt !== currentTenseQ.correct ? 'bg-slate-100 dark:bg-slate-800 opacity-50 border-slate-200 dark:border-slate-700' : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:scale-[1.02] text-slate-800 dark:text-slate-200 shadow-sm'}"
              >
                {opt}
              </button>
            {/each}
          </div>

          {#if tenseFeedback}
            <div class="p-3.5 rounded-2xl {tenseFeedback.type === 'correct' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-800 dark:text-rose-200 border border-rose-500/30'} text-xs space-y-1">
              <div class="font-bold">{tenseFeedback.text}</div>
              <div class="text-[11px] opacity-90">📖 {currentTenseQ.explain}</div>
            </div>
          {/if}
        </div>
      {:else}
        <GameCelebration
          title="Hoàn thành thách thức ngữ pháp!"
          score={tenseScore}
          maxScore={tenseQuestions.length * 100}
          rewardStars={gameSettings.reward_stars_per_game || 20}
          streak={completionStreak}
          metric={`Đã luyện ${tenseQuestions.length} câu ngữ pháp`}
          icon="⚡"
          accent="amber"
          onReplay={startTenseGame}
          onMenu={() => activeGame = 'menu'}
        />
      {/if}
    </div>

  <!-- ========================================================================= -->
  <!-- GAME SCREEN 6: MEMORY FLIP 3D (THẺ BÀI CARDS) -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'memory'}
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button onclick={() => activeGame = 'menu'} class="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold">
          ← Về Menu Game
        </button>
        <div class="flex items-center gap-4 text-xs font-bold">
          <span class="text-slate-500">Số lượt lật: <strong>{memoryMoves}</strong></span>
          <span class="text-purple-600 dark:text-purple-400">Đã ghép: <strong>{memoryPairsFound}</strong> / {memoryTotalPairs}</span>
        </div>
      </div>

      {#if !memoryFinished}
        <div class="grid grid-cols-4 sm:grid-cols-4 gap-3 sm:gap-4">
          {#each memoryCards as card, index}
            <button
              onclick={() => handleMemoryFlip(index)}
              class="h-28 sm:h-32 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center p-2 text-center relative {card.isMatched ? 'bg-emerald-500/10 border-emerald-500 opacity-40 pointer-events-none' : card.isFlipped ? 'bg-white dark:bg-slate-800 border-purple-500 shadow-lg scale-105' : 'bg-gradient-to-br from-purple-600 to-indigo-700 border-purple-400/50 hover:scale-102 cursor-pointer shadow-md'}"
            >
              {#if card.isFlipped || card.isMatched}
                <div class="font-heading font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                  {card.content}
                </div>
                <div class="text-[10px] text-purple-600 dark:text-purple-400 mt-1 font-mono">
                  {card.sub}
                </div>
              {:else}
                <div class="text-2xl text-white/90 animate-pulse">🎴</div>
                <div class="text-[9px] font-bold text-white/70 uppercase mt-1">Cô Dung 3D</div>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <GameCelebration
          title="Xuất sắc! Hoàn thành thẻ bài trí nhớ!"
          score={Math.max(0, memoryTotalPairs * 100 - Math.max(0, memoryMoves - memoryTotalPairs) * 10)}
          maxScore={memoryTotalPairs * 100}
          rewardStars={gameSettings.reward_stars_per_game || 20}
          streak={completionStreak}
          metric={`Ghép đúng ${memoryTotalPairs} cặp sau ${memoryMoves} lượt lật`}
          icon="🎴"
          accent="violet"
          onReplay={startMemoryGame}
          onMenu={() => activeGame = 'menu'}
        />
      {/if}
    </div>

  <!-- ========================================================================= -->
  <!-- GAME SCREEN 1: SPEED MATCH -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'match'}
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button onclick={() => activeGame = 'menu'} class="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold">
          ← Về Menu Game
        </button>
        <div class="flex items-center gap-4 text-xs font-bold">
          <span class="text-slate-500">⏱️ Thời gian: <strong>{matchTimer}s</strong></span>
          <span class="text-emerald-600 dark:text-emerald-400">Đã ghép: <strong>{matchPairsFound}</strong> / {matchTotalPairs}</span>
        </div>
      </div>

      {#if !matchCompleted}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {#each matchCards as card, index}
            <button
              onclick={() => handleCardClick(index)}
              class="h-28 rounded-2xl border-2 p-3 flex flex-col justify-center items-center text-center transition-all {card.matched ? 'opacity-20 border-emerald-500 pointer-events-none' : matchSelected.includes(index) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 scale-105' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400'}"
            >
              <div class="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">{card.text}</div>
              <div class="text-[10px] text-slate-400 font-mono mt-1">{card.sub}</div>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 {card.type === 'en' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}">
                {card.type === 'en' ? 'EN' : 'VN'}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <GameCelebration
          title="Kỷ lục tốc độ hoàn thành!"
          score={Math.max(100, Math.round(1000 - Number(matchTimer) * 10))}
          maxScore={1000}
          rewardStars={gameSettings.reward_stars_per_game || 20}
          streak={completionStreak}
          metric={`Ghép ${matchTotalPairs} cặp trong ${matchTimer} giây`}
          icon="⚡"
          accent="sky"
          onReplay={startMatchGame}
          onMenu={() => activeGame = 'menu'}
        />
      {/if}
    </div>

  <!-- ========================================================================= -->
  <!-- GAME SCREEN 2: WORD SCRAMBLE -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'scramble'}
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button onclick={() => activeGame = 'menu'} class="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold">
          ← Về Menu Game
        </button>
        <div class="flex items-center gap-4 text-xs font-bold">
          <span class="text-slate-500">Từ {scrambleIndex + 1} / {scrambleWordList.length}</span>
          <span class="text-amber-500">Điểm: {scrambleScore}</span>
        </div>
      </div>

      {#if !scrambleFinished && currentScramble}
        <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-xl text-center">
          <div class="space-y-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">GHÉP CÁC CHỮ CÁI ĐÚNG VỚI NGHĨA:</span>
            <h3 class="text-xl font-heading font-black text-slate-900 dark:text-white">
              "{currentScramble.meaning_vi}"
            </h3>
          </div>

          <!-- Assembled Slot -->
          <div class="min-h-[60px] p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 {scrambleStatus === 'correct' ? 'border-emerald-500' : scrambleStatus === 'wrong' ? 'border-rose-500' : 'border-dashed border-slate-300 dark:border-slate-700'} flex items-center justify-center gap-2">
            {#each scrambleAssembled as a, idx}
              <button onclick={() => removeLetter(idx)} class="w-10 h-12 rounded-xl bg-amber-500 text-white font-black text-base shadow-md">
                {a.char}
              </button>
            {/each}
          </div>

          <!-- Letters to pick -->
          <div class="flex flex-wrap gap-2 justify-center pt-2">
            {#each scrambleLetters as l}
              <button
                disabled={l.used}
                onclick={() => pickLetter(l)}
                class="w-11 h-12 rounded-xl border-2 font-black text-base transition-all {l.used ? 'opacity-20 border-slate-200 dark:border-slate-800 pointer-events-none' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:border-amber-500 text-slate-900 dark:text-white shadow-sm'}"
              >
                {l.char}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <GameCelebration
          title="Hoàn thành sắp xếp chữ cái!"
          score={scrambleScore}
          maxScore={scrambleWordList.length * 100}
          rewardStars={gameSettings.reward_stars_per_game || 20}
          streak={completionStreak}
          metric={`Đã ghép đúng ${scrambleWordList.length} từ tiếng Anh`}
          icon="🔤"
          accent="amber"
          onReplay={startScrambleGame}
          onMenu={() => activeGame = 'menu'}
        />
      {/if}
    </div>

  <!-- ========================================================================= -->
  <!-- GAME SCREEN 3: METEOR RUSH -->
  <!-- ========================================================================= -->
  {:else if activeGame === 'meteor'}
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button onclick={() => activeGame = 'menu'} class="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold">
          ← Về Menu Game
        </button>
        <div class="flex items-center gap-4 text-xs font-bold">
          <span class="text-slate-500">Từ {meteorIndex + 1} / {meteorQuestions.length}</span>
          <span class="text-rose-500">⏱️ {meteorTimeLeft.toFixed(1)}s</span>
          <span class="text-emerald-600 dark:text-emerald-400">Điểm: {meteorScore}</span>
        </div>
      </div>

      {#if !meteorFinished && currentMeteor}
        <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-xl text-center">
          <div class="space-y-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">CHỌN NHANH NGHĨA CỦA TỪ SAU ĐÂY:</span>
            <h3 class="text-2xl font-heading font-black text-slate-900 dark:text-white">
              {currentMeteor.word.term}
            </h3>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {#each currentMeteor.options as opt}
              <button
                disabled={!!meteorFeedback}
                onclick={() => handleMeteorAnswer(opt)}
                class="p-4 rounded-2xl border text-left font-bold text-xs transition-all {meteorFeedback && opt === currentMeteor.correct ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-rose-500'}"
              >
                {opt}
              </button>
            {/each}
          </div>

          {#if meteorFeedback}
            <div class="p-3 rounded-xl {meteorFeedback.type === 'correct' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'} text-xs font-bold">
              {meteorFeedback.text}
            </div>
          {/if}
        </div>
      {:else}
        <GameCelebration
          title="Hoàn thành đua tốc độ!"
          score={meteorScore}
          maxScore={meteorQuestions.length * 300}
          rewardStars={gameSettings.reward_stars_per_game || 20}
          streak={completionStreak}
          metric={`Đã phản xạ với ${meteorQuestions.length} từ vựng`}
          icon="☄️"
          accent="rose"
          onReplay={startMeteorGame}
          onMenu={() => activeGame = 'menu'}
        />
      {/if}
    </div>
  {/if}

</div>
