<script>
  import { buildCelebrationResult } from '$lib/gameCelebration.js';

  let {
    title = 'Hoàn thành thử thách!',
    score = 0,
    maxScore = 0,
    rewardStars = 20,
    streak = 1,
    metric = '',
    icon = '🏆',
    accent = 'sky',
    onReplay,
    onMenu
  } = $props();

  let result = $derived(buildCelebrationResult(score, maxScore));
  const accentClasses = {
    sky: 'from-cx-600 to-cx-700 shadow-cx-200',
    amber: 'from-amber-500 to-orange-600 shadow-amber-200',
    rose: 'from-rose-500 to-pink-600 shadow-rose-200',
    violet: 'from-violet-600 to-indigo-700 shadow-violet-200',
    emerald: 'from-emerald-600 to-teal-700 shadow-emerald-200'
  };
</script>

<section
  class="celebration-shell relative overflow-hidden rounded-[28px] border-2 border-cx-200 bg-white px-5 py-7 text-center shadow-xl shadow-cx-100 sm:px-9 sm:py-9"
  data-testid="game-celebration"
  role="status"
  aria-live="polite"
  aria-label="Kết quả trò chơi"
>
  <div class="confetti" aria-hidden="true">
    {#each ['#0891b2', '#f59e0b', '#10b981', '#e11d48', '#7c3aed', '#06b6d4', '#f97316', '#14b8a6'] as color, index}
      <i style={`--color:${color};--x:${10 + index * 11}%;--delay:${index * 0.08}s;--turn:${index % 2 ? 24 : -24}deg`}></i>
    {/each}
  </div>

  <div class={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-4xl text-white shadow-lg ${accentClasses[accent] || accentClasses.sky}`}>
    <span aria-hidden="true">{icon}</span>
  </div>

  <div class="mt-4 space-y-2">
    <p class="text-xs font-black uppercase tracking-[0.18em] text-cx-700">{result.label}</p>
    <h2 class="text-balance text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{title}</h2>
    <p class="mx-auto max-w-xl text-sm font-medium leading-6 text-slate-700">{result.message}</p>
  </div>

  <div class="mx-auto mt-5 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
    <div class="result-tile col-span-2 sm:col-span-1">
      <span>Điểm số</span>
      <strong>{score.toLocaleString('vi-VN')}</strong>
    </div>
    <div class="result-tile">
      <span>Sao thưởng</span>
      <strong>+{rewardStars} ⭐</strong>
    </div>
    <div class="result-tile">
      <span>Chuỗi hoàn thành</span>
      <strong>{Math.max(1, streak)} 🔥</strong>
    </div>
  </div>

  <div class="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
    <div class="flex items-center justify-center gap-1" aria-label={`${result.stars} trên 3 sao thành tích`}>
      {#each [1, 2, 3] as star}
        <span class:earned={star <= result.stars} class="achievement-star" aria-hidden="true">★</span>
      {/each}
    </div>
    {#if metric}<p class="mt-1 text-xs font-bold text-slate-700">{metric}</p>{/if}
  </div>

  <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
    <button onclick={onMenu} class="min-h-11 rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 text-sm font-extrabold text-slate-800 hover:border-cx-600 hover:text-cx-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cx-700">
      Về menu game
    </button>
    <button onclick={onReplay} class={`min-h-11 rounded-xl bg-gradient-to-r px-6 py-2.5 text-sm font-extrabold text-white shadow-md hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cx-700 ${accentClasses[accent] || accentClasses.sky}`}>
      Chơi lại thử thách ↻
    </button>
  </div>
</section>

<style>
  .result-tile { border: 1px solid #a5f3fc; border-radius: 1rem; background: #ecfeff; padding: .75rem; display: flex; flex-direction: column; gap: .2rem; }
  .result-tile span { color: #475569; font-size: .7rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  .result-tile strong { color: #0f172a; font-size: 1.05rem; font-weight: 900; }
  .achievement-star { color: #cbd5e1; font-size: 1.75rem; line-height: 1; transform: scale(.86); }
  .achievement-star.earned { color: #f59e0b; animation: star-pop .55s cubic-bezier(.2,.8,.2,1) both; }
  .confetti i { position: absolute; top: -14px; left: var(--x); width: 8px; height: 14px; border-radius: 2px; background: var(--color); transform: rotate(var(--turn)); animation: confetti-fall 1.8s var(--delay) ease-out both; }
  @keyframes confetti-fall { 0% { opacity: 0; translate: 0 -10px; } 15% { opacity: 1; } 100% { opacity: 0; translate: 0 210px; rotate: 240deg; } }
  @keyframes star-pop { 0% { opacity: 0; transform: scale(.4) rotate(-20deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
  @media (prefers-reduced-motion: reduce) {
    .confetti { display: none; }
    .achievement-star.earned { animation: none; }
  }
  @media (max-width: 389px) {
    .celebration-shell { border-radius: 1.25rem; padding-inline: 1rem; }
  }
</style>
