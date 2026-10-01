<!-- src/lib/components/ui/NeedQuiz.svelte — chon khoi lop -> goi y lo trinh (hoc Monkey), khong can login -->
<script>
 import UiButton from './UiButton.svelte';
 let { grades = [], onPick = null } = $props();
 let picked = $state(null);
 let result = $derived(picked ? grades.find((g) => g.key === picked) : null);

 function choose(key) {
 picked = key;
 if (onPick) onPick(key);
 }
</script>

<div class="rounded-3xl bg-surface-0 border border-line shadow-sm p-5 sm:p-7">
 <div class="font-extrabold text-ink-900 text-base sm:text-lg mb-1">🎯 Con bạn đang học lớp mấy?</div>
 <p class="text-xs sm:text-sm text-ink-500 mb-4">Chọn khối lớp để nhận gợi ý lộ trình phù hợp ngay — không cần đăng nhập.</p>
 <div class="flex flex-wrap gap-2 mb-4">
 {#each grades as g}
 <button
 type="button"
 onclick={() => choose(g.key)}
 class={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${picked === g.key ? 'bg-brand-600 border-brand-600 text-white shadow-sm' : 'bg-surface-1 border-line text-ink-900 hover:border-brand-200'}`}
 >
 {g.label}
 </button>
 {/each}
 </div>
 {#if result}
 <div class="rounded-2xl bg-brand-50 border border-brand-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
 <div>
 <div class="text-xs font-extrabold uppercase tracking-widest text-brand-700 mb-1">Gợi ý cho {result.label}</div>
 <div class="text-sm font-bold text-ink-900">{result.suggestion}</div>
 {#if result.detail}<div class="text-xs text-ink-500 mt-1">{result.detail}</div>{/if}
 </div>
 {#if result.href}
 <UiButton size="sm" href={result.href}>Xem lộ trình →</UiButton>
 {/if}
 </div>
 {/if}
</div>
