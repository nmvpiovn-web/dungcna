<!-- src/lib/components/ThemeStudio.svelte
     Bang chon mau noi (Theme Studio) — hien khi URL co ?studio=1
     Chinh la thay doi truc tiep tren web that qua CSS bien. -->
<script>
  import { onMount } from 'svelte';

  const STORE_KEY = 'tienganh_studio_theme';
  const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  const PRESETS = [
    {
      name: 'Lavie Aqua',
      c: { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63',950:'#083344' },
      hof: ['#a5f3fc','#67e8f9','#22d3ee','#06b6d4']
    },
    {
      name: 'Doublemint Mint',
      c: { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b',950:'#022c22' },
      hof: ['#a7f3d0','#6ee7b7','#34d399','#059669']
    },
    {
      name: 'Xanh Duong',
      c: { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e',950:'#082f49' },
      hof: ['#7dd3fc','#38bdf8','#0ea5e9','#0284c7']
    },
    {
      name: 'Tim Violet',
      c: { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95',950:'#2e1065' },
      hof: ['#ddd6fe','#c4b5fd','#a78bfa','#7c3aed']
    },
    {
      name: 'Cam San Ho',
      c: { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407' },
      hof: ['#fed7aa','#fdba74','#fb923c','#ea580c']
    },
    {
      name: 'Hong Rose',
      c: { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337',950:'#4c0519' },
      hof: ['#fecdd3','#fda4af','#fb7185','#e11d48']
    }
  ];

  let visible = $state(false);
  let open = $state(true);
  let activePreset = $state('Lavie Aqua');
  let custom = $state({ p600:'#0891b2', p700:'#0e7490', p50:'#ecfeff', p200:'#a5f3fc', hof:['#a5f3fc','#67e8f9','#22d3ee','#06b6d4'] });
  let copied = $state(false);

  function hx(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function toHex(r,g,b){ return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
  function mix(h1,h2,t){ const a=hx(h1),b=hx(h2); return toHex(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t); }

  function setVar(el, name, hex){
    el.style.setProperty('--'+name, hex);
    const [r,g,b] = hx(hex);
    el.style.setProperty('--'+name+'-rgb', `${r} ${g} ${b}`);
  }

  function applyTheme(cScale, hofStops, name){
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    for (const s of SHADES) setVar(el, 'c-'+s, cScale[s]);
    setVar(el, 'brand-600', cScale[600]);
    setVar(el, 'brand-700', cScale[700]);
    setVar(el, 'brand-50', cScale[50]);
    setVar(el, 'brand-200', cScale[200]);
    hofStops.forEach((h,i)=> el.style.setProperty('--hof-'+(i+1), h));
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ name, c: cScale, hof: hofStops })); } catch(e){}
    activePreset = name;
  }

  function usePreset(p){ applyTheme(p.c, p.hof, p.name); }

  function deriveScale(){
    const b = custom.p600;
    return {
      50: custom.p50, 100: mix(b,'#ffffff',0.85), 200: custom.p200,
      300: mix(b,'#ffffff',0.50), 400: mix(b,'#ffffff',0.30), 500: mix(b,'#ffffff',0.12),
      600: b, 700: custom.p700, 800: mix(b,'#000000',0.30),
      900: mix(b,'#000000',0.45), 950: mix(b,'#000000',0.60)
    };
  }
  function useCustom(){ applyTheme(deriveScale(), custom.hof, 'Tuy chinh'); }

  function resetTheme(){
    try { localStorage.removeItem(STORE_KEY); } catch(e){}
    location.reload();
  }

  function copyCss(){
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch(e){}
    if (!saved) return;
    let out = `/* Theme: ${saved.name} — paste vao :root trong src/app.css */\n:root{\n`;
    for (const s of SHADES){ const [r,g,b]=hx(saved.c[s]); out += `  --c-${s}: ${saved.c[s]}; --c-${s}-rgb: ${r} ${g} ${b};\n`; }
    const b6=saved.c[600],b7=saved.c[700],b5=saved.c[50],b2=saved.c[200];
    const q=(h)=>{const [r,g,b]=hx(h); return `${r} ${g} ${b}`;};
    out += `  --brand-600: ${b6}; --brand-600-rgb: ${q(b6)};\n  --brand-700: ${b7}; --brand-700-rgb: ${q(b7)};\n`;
    out += `  --brand-50: ${b5}; --brand-50-rgb: ${q(b5)};\n  --brand-200: ${b2}; --brand-200-rgb: ${q(b2)};\n`;
    saved.hof.forEach((h,i)=>{ out += `  --hof-${i+1}: ${h};\n`; });
    out += `}`;
    const done = ()=>{ copied = true; setTimeout(()=>copied=false, 2000); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(out).then(done).catch(()=>fallbackCopy(out, done));
    else fallbackCopy(out, done);
  }
  function fallbackCopy(text, done){
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch(e){}
    document.body.removeChild(ta);
  }

  onMount(()=>{
    // Ap dung theme da luu (neu co) cho moi luot xem
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved?.c) applyTheme(saved.c, saved.hof || [], saved.name || 'Da luu');
    } catch(e){}
    const params = new URLSearchParams(location.search);
    if (params.get('studio') === '1') visible = true;
  });
</script>

{#if visible}
<div style="position:fixed;right:12px;bottom:12px;z-index:99990;width:300px;max-height:82vh;overflow-y:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:system-ui,sans-serif;">
  <button onclick={()=>open=!open} style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f172a;color:#fff;border:none;border-radius:16px 16px 0 0;cursor:pointer;font-weight:800;font-size:14px;">
    <span>🎨 Theme Studio</span><span>{open ? '▾' : '▸'}</span>
  </button>
  {#if open}
  <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px;">
    <div>
      <div style="font-size:12px;font-weight:800;color:#475569;margin-bottom:6px;">MÀU CÓ SẴN</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        {#each PRESETS as p}
        <button onclick={()=>usePreset(p)}
          style={`display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;border:2px solid ${activePreset===p.name?'#0f172a':'#e2e8f0'};background:#f8fafc;cursor:pointer;font-size:11px;font-weight:700;color:#0f172a;`}>
          <span style={`width:22px;height:22px;border-radius:7px;flex:none;background:linear-gradient(135deg, ${p.c[300]}, ${p.c[600]});`}></span>
          {p.name}
        </button>
        {/each}
      </div>
    </div>
    <div>
      <div style="font-size:12px;font-weight:800;color:#475569;margin-bottom:6px;">TỰ PHA MÀU</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <label style="font-size:11px;color:#334155;">Chính <input type="color" value={custom.p600} oninput={(e)=>{custom.p600=e.target.value;useCustom();}} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:none;padding:2px;"/></label>
        <label style="font-size:11px;color:#334155;">Đậm <input type="color" value={custom.p700} oninput={(e)=>{custom.p700=e.target.value;useCustom();}} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:none;padding:2px;"/></label>
        <label style="font-size:11px;color:#334155;">Nhạt <input type="color" value={custom.p50} oninput={(e)=>{custom.p50=e.target.value;useCustom();}} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:none;padding:2px;"/></label>
        <label style="font-size:11px;color:#334155;">Viền <input type="color" value={custom.p200} oninput={(e)=>{custom.p200=e.target.value;useCustom();}} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:none;padding:2px;"/></label>
      </div>
      <div style="font-size:11px;color:#334155;margin-top:8px;margin-bottom:4px;">Gradient Hall of Fame</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
        {#each custom.hof as h, i}
        <input type="color" value={h} oninput={(e)=>{custom.hof[i]=e.target.value;useCustom();}} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:none;padding:2px;"/>
        {/each}
      </div>
    </div>
    <div style="display:flex;gap:6px;">
      <button onclick={copyCss} style="flex:1;padding:8px;border:none;border-radius:10px;background:#0f172a;color:#fff;font-weight:800;font-size:12px;cursor:pointer;">{copied ? '✓ Đã copy!' : '📋 Copy CSS'}</button>
      <button onclick={resetTheme} style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;font-weight:700;font-size:12px;cursor:pointer;">Reset</button>
    </div>
    <div style="font-size:10.5px;color:#94a3b8;line-height:1.5;">
      Đang dùng: <b style="color:#475569;">{activePreset}</b><br/>
      Ưng màu nào → bấm <b>Copy CSS</b> rồi gửi tao, tao deploy cứng lên web cho mọi người cùng thấy.
    </div>
  </div>
  {/if}
</div>
{/if}
