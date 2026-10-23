<!-- src/lib/components/ThemeStudio.svelte
     Hệ thống áp dụng Theme toàn cục (Halloween, Đi Dã Ngoại, Workshop, Trại Hè, Lễ Hội...)
     Bao gồm: Áp biến CSS, Thanh Banner Sự Kiện & Hiệu ứng hạt trang trí (Particles) -->
<script>
  import { onMount } from 'svelte';
  import ThemeStudioPanel from './ThemeStudioPanel.svelte';
  import {
    applyThemeVars, removeThemeVars, buildCssText, saveLocal, loadLocal, clearLocal, findPresetByNameOrId
  } from '$lib/themeStudio.js';

  let visible = $state(false);
  let open = $state(true);
  let activeName = $state('Lavie Aqua');
  let copied = $state(false);
  let current = $state(null); // { id, name, c, hof, bannerEnabled, bannerTitle, bannerSub, ctaText, ctaHref, particlesEnabled, particles, icon, badge }
  let bannerDismissed = $state(false);

  function enrichTheme(t) {
    if (!t || typeof t !== 'object') return null;
    const preset = findPresetByNameOrId(t.id || t.name);
    if (!preset) return t;
    return {
      ...preset,
      ...t,
      c: t.c || preset.c,
      hof: t.hof || preset.hof
    };
  }

  function apply(cOrTheme, hof, name, persist = true) {
    let themeObj;
    if (cOrTheme && typeof cOrTheme === 'object' && cOrTheme.c && !cOrTheme[500]) {
      themeObj = enrichTheme(cOrTheme);
    } else {
      themeObj = enrichTheme({ name: name || 'Custom Theme', c: cOrTheme, hof: hof || [] });
    }
    if (!themeObj || !themeObj.c) return;
    applyThemeVars(themeObj);
    current = themeObj;
    activeName = themeObj.name;
    bannerDismissed = false;
    if (persist) {
      saveLocal(themeObj.name, themeObj.c, themeObj.hof, {
        id: themeObj.id,
        category: themeObj.category,
        icon: themeObj.icon,
        badge: themeObj.badge,
        bannerEnabled: themeObj.bannerEnabled,
        bannerTitle: themeObj.bannerTitle,
        bannerSub: themeObj.bannerSub,
        ctaText: themeObj.ctaText,
        ctaHref: themeObj.ctaHref,
        particlesEnabled: themeObj.particlesEnabled,
        particles: themeObj.particles
      });
    }
  }

  function copyCss() {
    if (!current) return;
    const text = buildCssText(current.name, current.c, current.hof);
    const done = () => { copied = true; setTimeout(() => copied = false, 2000); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
    else fallback(text, done);
  }

  function fallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  onMount(() => {
    const handleThemeUpdate = (e) => {
      const detail = e?.detail;
      if (!detail) {
        current = null;
        activeName = 'Lavie Aqua';
        return;
      }
      current = enrichTheme(detail);
      activeName = current?.name || 'Lavie Aqua';
      bannerDismissed = false;
    };
    window.addEventListener('tienganh:site-theme-updated', handleThemeUpdate);

    (async () => {
      // 1) Theme chung do Admin chọn trên D1 được ưu tiên nếu có chủ đề sự kiện
      try {
        const res = await fetch('/api/site-theme');
        const data = await res.json();
        if (data.success && data.theme) {
          apply(data.theme, data.theme.hof, data.theme.name, false);
          return;
        }
      } catch {}
      // 2) Fallback sang theme cá nhân lưu ở localStorage nếu chưa có theme chung
      const mine = loadLocal();
      if (mine) {
        apply(mine, mine.hof || [], mine.name, false);
      }
    })();

    if (new URLSearchParams(location.search).get('studio') === '1') visible = true;

    return () => {
      window.removeEventListener('tienganh:site-theme-updated', handleThemeUpdate);
    };
  });
</script>

<!-- Hạt trang trí chủ đề Sự kiện / Lễ hội / Dã ngoại / Workshop (pointer-events: none để không bao giờ chặn click) -->
{#if current && current.particlesEnabled && Array.isArray(current.particles) && current.particles.length > 0}
  <div
    data-testid="site-theme-particles"
    aria-hidden="true"
    style="position:fixed;inset:0;pointer-events:none;z-index:35;overflow:hidden;"
  >
    {#each current.particles as emoji, idx}
      <span
        class="theme-floating-particle"
        style={`left:${8 + ((idx * 17) % 84)}%;top:${10 + ((idx * 23) % 72)}%;animation-delay:${idx * 1.1}s;animation-duration:${9 + (idx % 4) * 2}s;`}
      >
        {emoji}
      </span>
    {/each}
  </div>
{/if}

<!-- Thanh Banner Chủ đề Sự kiện (Halloween, Đi Dã Ngoại, Workshop, Trại Hè, Tết...) -->
{#if current && current.bannerEnabled && current.bannerTitle && !bannerDismissed}
  <div
    data-testid="site-theme-event-banner"
    style={`position:relative;z-index:38;background:linear-gradient(90deg, ${current.c?.[800] || '#1c1917'}, ${current.c?.[600] || '#0891b2'}, ${current.c?.[700] || '#0e7490'});color:#ffffff;padding:8px 16px;border-bottom:2px solid ${current.c?.[300] || '#67e8f9'};box-shadow:0 4px 14px rgba(0,0,0,0.12);`}
  >
    <div style="max-width:1280px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
        <span style="font-size:20px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));">{current.icon || '🎉'}</span>
        {#if current.badge}
          <span style={`padding:2px 8px;border-radius:999px;background:${current.c?.[200] || '#fde68a'};color:${current.c?.[950] || '#1c1917'};font-size:10px;font-weight:900;letter-spacing:0.05em;white-space:nowrap;`}>
            {current.badge}
          </span>
        {/if}
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:800;line-height:1.3;">{current.bannerTitle}</div>
          {#if current.bannerSub}
            <div style="font-size:11px;opacity:0.92;line-height:1.25;">{current.bannerSub}</div>
          {/if}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        {#if current.ctaText && current.ctaHref}
          <a
            href={current.ctaHref}
            data-testid="site-theme-banner-cta"
            style={`padding:5px 12px;border-radius:999px;background:#ffffff;color:${current.c?.[800] || '#1c1917'};font-size:11.5px;font-weight:800;text-decoration:none;box-shadow:0 2px 6px rgba(0,0,0,0.18);white-space:nowrap;`}
          >
            {current.ctaText} →
          </a>
        {/if}
        <button
          type="button"
          onclick={() => (bannerDismissed = true)}
          aria-label="Ẩn thanh sự kiện"
          style="width:24px;height:24px;border-radius:999px;border:1px solid rgba(255,255,255,0.35);background:rgba(0,0,0,0.2);color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
{/if}

{#if visible}
<div style="position:fixed;right:12px;bottom:12px;z-index:99990;width:340px;max-height:82vh;overflow-y:auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:system-ui,sans-serif;">
  <button onclick={()=>open=!open} style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1c1917;color:#fff;border:none;border-radius:16px 16px 0 0;cursor:pointer;font-weight:800;font-size:14px;">
    <span>🎨 Theme Studio</span><span>{open ? '▾' : '▸'}</span>
  </button>
  {#if open}
  <div style="padding:12px 14px;">
    <ThemeStudioPanel {activeName} onApply={(c,hof,name,presetObj)=>apply(presetObj || { name, c, hof }, hof, name, true)} />
    <div style="display:flex;gap:6px;margin-top:12px;">
      <button onclick={copyCss} style="flex:1;padding:8px;border:none;border-radius:10px;background:#1c1917;color:#fff;font-weight:800;font-size:12px;cursor:pointer;">{copied ? '✓ Đã copy!' : '📋 Copy CSS'}</button>
      <button onclick={()=>{clearLocal();removeThemeVars();}} style="padding:8px 12px;border:1px solid #e7e5e4;border-radius:10px;background:#fff;color:#57534e;font-weight:700;font-size:12px;cursor:pointer;">Reset</button>
    </div>
  </div>
  {/if}
</div>
{/if}

<style>
  .theme-floating-particle {
    position: absolute;
    font-size: 1.35rem;
    opacity: 0.22;
    user-select: none;
    pointer-events: none;
    animation-name: themeParticleFloat;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
  }
  @keyframes themeParticleFloat {
    0%, 100% {
      transform: translateY(0px) rotate(0deg) scale(1);
    }
    50% {
      transform: translateY(-16px) rotate(8deg) scale(1.08);
    }
  }
</style>
