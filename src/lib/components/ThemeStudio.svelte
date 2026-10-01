<!-- src/lib/components/ThemeStudio.svelte
     Panel noi (?studio=1) + tu dong ap theme: ca nhan (localStorage) > chung (API) -->
<script>
  import { onMount } from 'svelte';
  import ThemeStudioPanel from './ThemeStudioPanel.svelte';
  import {
    applyThemeVars, buildCssText, saveLocal, loadLocal, clearLocal
  } from '$lib/themeStudio.js';

  let visible = $state(false);
  let open = $state(true);
  let activeName = $state('Lavie Aqua');
  let copied = $state(false);
  let current = $state(null); // {name, c, hof} dang ap dung

  function apply(c, hof, name, persist = true){
    applyThemeVars(c, hof);
    current = { name, c, hof };
    activeName = name;
    if (persist) saveLocal(name, c, hof);
  }

  function copyCss(){
    if (!current) return;
    const text = buildCssText(current.name, current.c, current.hof);
    const done = ()=>{ copied = true; setTimeout(()=>copied=false, 2000); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(()=>fallback(text, done));
    else fallback(text, done);
  }
  function fallback(text, done){
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch(e){}
    document.body.removeChild(ta);
  }

  onMount(async ()=>{
    // 1) theme ca nhan (xem truoc) uu tien
    const mine = loadLocal();
    if (mine){ apply(mine.c, mine.hof || [], mine.name, false); }
    else {
      // 2) theme chung do admin luu
      try {
        const res = await fetch('/api/site-theme');
        const data = await res.json();
        if (data.success && data.theme) apply(data.theme.c, data.theme.hof, data.theme.name, false);
      } catch {}
    }
    if (new URLSearchParams(location.search).get('studio') === '1') visible = true;
  });
</script>

{#if visible}
<div style="position:fixed;right:12px;bottom:12px;z-index:99990;width:300px;max-height:82vh;overflow-y:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:system-ui,sans-serif;">
  <button onclick={()=>open=!open} style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f172a;color:#fff;border:none;border-radius:16px 16px 0 0;cursor:pointer;font-weight:800;font-size:14px;">
    <span>🎨 Theme Studio</span><span>{open ? '▾' : '▸'}</span>
  </button>
  {#if open}
  <div style="padding:12px 14px;">
    <ThemeStudioPanel {activeName} onApply={(c,hof,name)=>apply(c,hof,name,true)} />
    <div style="display:flex;gap:6px;margin-top:12px;">
      <button onclick={copyCss} style="flex:1;padding:8px;border:none;border-radius:10px;background:#0f172a;color:#fff;font-weight:800;font-size:12px;cursor:pointer;">{copied ? '✓ Đã copy!' : '📋 Copy CSS'}</button>
      <button onclick={()=>{clearLocal();location.reload();}} style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;font-weight:700;font-size:12px;cursor:pointer;">Reset</button>
    </div>
    <div style="font-size:10.5px;color:#94a3b8;line-height:1.5;margin-top:8px;">
      Đang dùng: <b style="color:#475569;">{activeName}</b><br/>
      Ưng màu nào → bấm <b>Copy CSS</b> rồi gửi tao, tao deploy cứng lên web.
    </div>
  </div>
  {/if}
</div>
{/if}
