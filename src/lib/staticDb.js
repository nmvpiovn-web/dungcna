import wordsData from '$lib/data/words.json';
import questionsData from '$lib/data/questions.json';
import unitsData from '$lib/data/units.json';

const STORAGE_KEY_PROGRESS = 'tienganh7_user_progress';
const STORAGE_KEY_SCORES = 'tienganh7_game_scores';
const STORAGE_KEY_CUSTOM_WORDS = 'tienganh7_custom_words';

// Get all words (static default + any user-created custom words)
export function getStaticWords({ unitId, search, limit, shuffle } = {}) {
  let list = [...wordsData];

  // Merge custom words from localStorage if in browser
  if (typeof window !== 'undefined') {
    try {
      const custom = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_WORDS) || '[]');
      if (Array.isArray(custom)) {
        list = [...custom, ...list];
      }
    } catch {}
  }

  // Attach progress if in browser
  if (typeof window !== 'undefined') {
    const progressMap = getProgressMap();
    list = list.map(w => {
      const p = progressMap[w.id];
      return {
        ...w,
        status: p ? p.status : 'new',
        review_count: p ? p.review_count : 0,
        correct_count: p ? p.correct_count : 0,
        wrong_count: p ? p.wrong_count : 0
      };
    });
  } else {
    list = list.map(w => ({ ...w, status: 'new' }));
  }

  if (unitId && unitId !== 'all') {
    list = list.filter(w => w.unit_id === unitId);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(w => w.term.toLowerCase().includes(q) || w.meaning_vi.toLowerCase().includes(q));
  }

  if (shuffle) {
    list = [...list].sort(() => 0.5 - Math.random());
  }

  if (limit && Number(limit) > 0) {
    list = list.slice(0, Number(limit));
  }

  return list;
}

export function getStaticUnits() {
  return unitsData;
}

export function getStaticQuestions({ section, unitId, limit } = {}) {
  let list = [...questionsData];

  if (section && section !== 'all') {
    list = list.filter(q => q.section === section);
  }

  if (unitId && unitId !== 'all') {
    list = list.filter(q => q.unit_id === unitId);
  }

  if (limit && Number(limit) > 0) {
    list = list.slice(0, Number(limit));
  }

  return list;
}

export function getStaticStats() {
  const words = getStaticWords();
  const questions = getStaticQuestions();

  let mastered = 0;
  let learning = 0;
  let newWords = words.length;

  if (typeof window !== 'undefined') {
    const progressMap = getProgressMap();
    Object.values(progressMap).forEach(p => {
      if (p.status === 'mastered') mastered++;
      else if (p.status === 'learning') learning++;
    });
    newWords = Math.max(0, words.length - mastered - learning);
  }

  return {
    totalWords: words.length,
    masteredWords: mastered,
    learningWords: learning,
    newWords,
    totalQuestions: questions.length,
    recentScores: getStaticScores().slice(0, 5)
  };
}

export function saveUserProgress(wordId, statusOrIsCorrect) {
  if (typeof window === 'undefined') return;
  const progressMap = getProgressMap();
  const existing = progressMap[wordId] || {
    word_id: wordId,
    status: 'new',
    review_count: 0,
    correct_count: 0,
    wrong_count: 0
  };

  if (typeof statusOrIsCorrect === 'string') {
    existing.status = statusOrIsCorrect;
  } else if (typeof statusOrIsCorrect === 'boolean') {
    existing.review_count += 1;
    if (statusOrIsCorrect) {
      existing.correct_count += 1;
      if (existing.correct_count >= 3 && existing.wrong_count === 0) {
        existing.status = 'mastered';
      } else {
        existing.status = 'learning';
      }
    } else {
      existing.wrong_count += 1;
      existing.status = 'learning';
    }
  }

  existing.last_reviewed = new Date().toISOString();
  progressMap[wordId] = existing;
  localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(progressMap));
}

function getProgressMap() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESS) || '{}');
  } catch {
    return {};
  }
}

export function saveGameScoreLocally({ gameMode, playerName, score, timeSeconds, correctAnswers, totalQuestions }) {
  if (typeof window === 'undefined') return;
  const scores = getStaticScores();
  const newEntry = {
    id: Date.now(),
    game_mode: gameMode,
    player_name: playerName || 'Học sinh',
    score: Number(score),
    time_seconds: Number(timeSeconds || 0),
    correct_answers: Number(correctAnswers || 0),
    total_questions: Number(totalQuestions || 0),
    created_at: new Date().toISOString()
  };
  scores.unshift(newEntry);
  localStorage.setItem(STORAGE_KEY_SCORES, JSON.stringify(scores.slice(0, 100)));
  return newEntry;
}

export function getStaticScores(gameMode) {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_SCORES) || '[]');
    if (gameMode) {
      return list.filter(s => s.game_mode === gameMode).sort((a, b) => b.score - a.score);
    }
    return list;
  } catch {
    return [];
  }
}

export function addCustomWordLocally(word) {
  if (typeof window === 'undefined') return;
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_WORDS) || '[]');
    const newWord = {
      ...word,
      id: Date.now(),
      created_at: new Date().toISOString()
    };
    list.unshift(newWord);
    localStorage.setItem(STORAGE_KEY_CUSTOM_WORDS, JSON.stringify(list));
    return newWord;
  } catch {
    return null;
  }
}
