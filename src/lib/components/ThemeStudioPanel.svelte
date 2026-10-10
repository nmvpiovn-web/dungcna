<!-- src/lib/components/ThemeStudioPanel.svelte
     Noi dung chon mau dung chung: floating panel (?studio=1) + tab Admin CP -->
<script>
  import { PRESETS, deriveScale } from '$lib/themeStudio.js';

  let { activeName = 'Doublemint Mint', onApply } = $props();

  let custom = $state({
    p600: '#059669', p700: '#047857', p50: '#ecfdf5', p200: '#a7f3d0',
    hof: ['#a7f3d0', '#6ee7b7', '#34d399', '#059669']
  });

  function pick(p){ onApply?.(p.c, p.hof, p.name); }
  function customApply(){
    onApply?.(deriveScale(custom.p600, custom.p700, custom.p50, custom.p200), [...custom.hof], 'Tuy chinh');
  }

  const lbl = 'font-size:11px;color:#44403c;';
  const inp = 'width:100%;height:34px;border:1px solid #e7e5e4;border-radius:8px;cursor:pointer;background:none;padding:2px;';
</script>

<div style="display:flex;flex-direction:column;gap:12px;">
  <div>
    <div style="font-size:12px;font-weight:800;color:#57534e;margin-bottom:6px;">MÀU CÓ SẴN</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      {#each PRESETS as p}
      <button onclick={()=>pick(p)}
        style={`display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;border:2px solid ${activeName===p.name?'#1c1917':'#e7e5e4'};background:#fdfbf7;cursor:pointer;font-size:11px;font-weight:700;color:#1c1917;`}>
        <span style={`width:22px;height:22px;border-radius:7px;flex:none;background:linear-gradient(135deg, ${p.c[300]}, ${p.c[600]});`}></span>
        {p.name}
      </button>
      {/each}
    </div>
  </div>
  <div>
    <div style="font-size:12px;font-weight:800;color:#57534e;margin-bottom:6px;">TỰ PHA MÀU</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <label style={lbl}>Chính <input type="color" value={custom.p600} oninput={(e)=>{custom.p600=e.target.value;customApply();}} style={inp}/></label>
      <label style={lbl}>Đậm <input type="color" value={custom.p700} oninput={(e)=>{custom.p700=e.target.value;customApply();}} style={inp}/></label>
      <label style={lbl}>Nhạt <input type="color" value={custom.p50} oninput={(e)=>{custom.p50=e.target.value;customApply();}} style={inp}/></label>
      <label style={lbl}>Viền <input type="color" value={custom.p200} oninput={(e)=>{custom.p200=e.target.value;customApply();}} style={inp}/></label>
    </div>
    <div style="font-size:11px;color:#44403c;margin-top:8px;margin-bottom:4px;">Gradient Hall of Fame</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
      {#each custom.hof as h, i}
      <input type="color" value={h} oninput={(e)=>{custom.hof[i]=e.target.value;customApply();}} style={inp}/>
      {/each}
    </div>
  </div>
</div>
