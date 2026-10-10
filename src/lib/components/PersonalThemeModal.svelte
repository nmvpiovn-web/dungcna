<!-- src/lib/components/PersonalThemeModal.svelte
     Cho moi user tu chon MAU CA NHAN (luu localStorage, uu tien hon mau chung cua web).
     Khong anh huong nguoi khac. Co nut "ve mau chung" de reset. -->
<script>
  import {
    PRESETS, deriveScale, applyThemeVars, removeThemeVars,
    saveLocal, loadLocal, clearLocal, isHex
  } from '$lib/themeStudio.js';

  let { isOpen = $bindable(false) } = $props();

  let statusText = $state('');
  let isPersonal = $state(false);
  let draft = $state(null); // {name, c, hof} dang xem truoc
  let openSnapshot = $state(null); // personal theme luc mo modal (de revert)
  let custom = $state({
    p600: '#059669', p700: '#047857', p50: '#ecfdf5', p200: '#a7f3d0',
    hof: ['#a7f3d0', '#6ee7b7', '#34d399', '#059669']
  });

  async function fetchGlobalTheme(){
    try {
      const res = await fetch('/api/site-theme');
      const data = await res.json();
      if (data.success && data.theme) return data.theme;
    } catch {}
    return null;
  }

  async function initOnOpen(){
    const mine = loadLocal();
    openSnapshot = mine;
    isPersonal = !!mine;
    draft = null;
    let base = mine || await fetchGlobalTheme();
    const c = base?.c || PRESETS[0].c;
    const hof = base?.hof || PRESETS[0].hof;
    if (isHex(c[600])) custom.p600 = c[600];
    if (isHex(c[700])) custom.p700 = c[700];
    if (isHex(c[50])) custom.p50 = c[50];
    if (isHex(c[200])) custom.p200 = c[200];
    custom.hof = [...hof];
    statusText = mine
      ? `🎨 Màu của bạn: ${mine.name}`
      : (base?.name ? `🌐 Đang dùng màu chung: ${base.name}` : '🌐 Đang dùng màu mặc định của web');
  }

  $effect(() => { if (isOpen) initOnOpen(); });

  function previewPreset(p){
    draft = { name: p.name, c: p.c, hof: p.hof };
    applyThemeVars(p.c, p.hof);
    statusText = `👀 Xem trước: ${p.name} (chưa lưu)`;
  }

  function previewCustom(){
    const c = deriveScale(custom.p600, custom.p700, custom.p50, custom.p200);
    const hof = [...custom.hof];
    draft = { name: 'Tùy chỉnh', c, hof };
    applyThemeVars(c, hof);
    statusText = '👀 Xem trước: Tùy chỉnh (chưa lưu)';
  }

  function notifyChange(){
    try { window.dispatchEvent(new CustomEvent('tienganh:personal-theme-change')); } catch {}
  }

  function saveMine(){
    if (!draft) return;
    saveLocal(draft.name, draft.c, draft.hof);
    openSnapshot = { name: draft.name, c: draft.c, hof: draft.hof };
    isPersonal = true;
    notifyChange();
    isOpen = false;
  }

  async function useSiteDefault(){
    clearLocal();
    notifyChange();
    isOpen = false;
    location.reload(); // ve sach: ap lai mau chung tu server
  }

  async function revertPreview(){
    if (openSnapshot) {
      applyThemeVars(openSnapshot.c, openSnapshot.hof || []);
    } else {
      removeThemeVars();
      const g = await fetchGlobalTheme();
      if (g) applyThemeVars(g.c, g.hof);
    }
  }

  async function close(){
    await revertPreview();
    draft = null;
    isOpen = false;
  }

  function onBackdropKey(e){
    if (e.key === 'Escape') close();
  }
</script>

{#if isOpen}
<div
  class="fixed inset-0 z-[99995] flex items-center justify-center p-4"
  role="dialog" aria-modal="true" aria-label="Màu sắc của tôi"
  onkeydown={onBackdropKey}
>
  <button type="button" aria-label="Đóng" onclick={close}
    class="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px] cursor-default"></button>

  <div class="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl bg-surface-0 border border-line shadow-2xl">
    <div class="sticky top-0 flex items-center justify-between px-5 py-4 bg-surface-0/95 backdrop-blur border-b border-line rounded-t-2xl">
      <div class="font-extrabold text-ink-900">🎨 Màu sắc của tôi</div>
      <button type="button" onclick={close} aria-label="Đóng"
        class="w-8 h-8 rounded-full bg-surface-1 border border-line text-ink-500 hover:text-ink-900 font-bold">✕</button>
    </div>

    <div class="px-5 py-4 space-y-4">
      <div class="text-xs font-semibold text-ink-500 bg-surface-1 border border-line rounded-xl px-3 py-2.5">
        {statusText}
      </div>

      <div>
        <div class="text-xs font-extrabold uppercase tracking-wide text-ink-500 mb-2">Màu có sẵn</div>
        <div class="grid grid-cols-2 gap-2">
          {#each PRESETS as p}
          <button type="button" onclick={()=>previewPreset(p)}
            class="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 font-bold text-xs text-ink-900 transition-all
              {draft?.name===p.name ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface-1 hover:border-ink-500/40'}">
            <span class="w-6 h-6 rounded-lg shrink-0 border border-black/10"
              style={`background:linear-gradient(135deg, ${p.c[300]}, ${p.c[600]});`}></span>
            {p.name}
          </button>
          {/each}
        </div>
      </div>

      <div>
        <div class="text-xs font-extrabold uppercase tracking-wide text-ink-500 mb-2">Tự pha màu</div>
        <div class="grid grid-cols-4 gap-2">
          {#each [['p600','Chính'],['p700','Đậm'],['p50','Nhạt'],['p200','Viền']] as [key, label]}
          <label class="text-[11px] font-semibold text-ink-500 flex flex-col gap-1">
            {label}
            <input type="color" value={custom[key]}
              oninput={(e)=>{ custom[key]=e.target.value; previewCustom(); }}
              class="w-full h-10 rounded-lg border border-line cursor-pointer bg-surface-0 p-1" />
          </label>
          {/each}
        </div>
        <div class="text-[11px] font-semibold text-ink-500 mt-3 mb-1">Gradient Hall of Fame</div>
        <div class="grid grid-cols-4 gap-2">
          {#each custom.hof as h, i}
          <input type="color" value={h}
            oninput={(e)=>{ custom.hof[i]=e.target.value; previewCustom(); }}
            class="w-full h-10 rounded-lg border border-line cursor-pointer bg-surface-0 p-1" />
          {/each}
        </div>
      </div>

      <div class="text-[11px] text-ink-500 leading-relaxed">
        Màu bạn chọn chỉ hiện trên <b>thiết bị này</b>, không ảnh hưởng người khác.
        Bấm <b>“Dùng màu chung của web”</b> để quay về màu admin đã đặt.
      </div>
    </div>

    <div class="sticky bottom-0 px-5 py-4 bg-surface-0/95 backdrop-blur border-t border-line rounded-b-2xl flex gap-2">
      <button type="button" onclick={useSiteDefault}
        class="flex-1 px-3 py-2.5 rounded-xl border border-line bg-surface-1 text-ink-900 text-xs font-extrabold hover:bg-surface-0 transition-all">
        🌐 Dùng màu chung của web
      </button>
      <button type="button" onclick={saveMine} disabled={!draft}
        class="flex-1 px-3 py-2.5 rounded-xl text-xs font-extrabold text-white transition-all
          {draft ? 'bg-brand-600 hover:bg-brand-700 shadow-sm' : 'bg-ink-500/30 cursor-not-allowed'}">
        💾 Lưu màu của tôi
      </button>
    </div>
  </div>
</div>
{/if}
