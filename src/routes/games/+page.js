import { getStaticWords, getStaticUnits, getStaticScores } from '$lib/staticDb.js';

export function load() {
  return {
    seo: {"title": "Trò Chơi Học Tiếng Anh Cho Trẻ | Tiếng Anh Cô Dung", "description": "Game học tiếng Anh vui nhộn cho học sinh tiểu học & THCS."},
    words: getStaticWords({ shuffle: true }),
    units: getStaticUnits(),
    leaderboards: {
      speed_match: getStaticScores('speed_match').slice(0, 5),
      word_scramble: getStaticScores('word_scramble').slice(0, 5),
      meteor_rush: getStaticScores('meteor_rush').slice(0, 5)
    }
  };
}
