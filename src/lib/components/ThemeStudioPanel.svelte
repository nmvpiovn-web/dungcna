<!-- src/lib/components/ThemeStudioPanel.svelte
     Bảng điều khiển Chủ đề Sự kiện (Halloween, Đi Dã Ngoại, Workshop, Trại Hè, Lễ Hội...) & Bảng màu Học đường
     Hỗ trợ đầy đủ: Chọn nhanh, Tùy chỉnh Banner/Hạt bay, Lưu lên toàn Web (D1), Tạo/Xóa Theme tùy chỉnh & Khôi phục (Restore) -->
<script>
  import { onMount } from 'svelte';
  import {
    PRESETS, EVENT_THEMES, CLASSIC_THEMES, deriveScale, applyThemeVars, removeThemeVars, clearLocal
  } from '$lib/themeStudio.js';

  let { activeName = 'Lavie Aqua', onApply, onSaved } = $props();

  let selectedTheme = $state(PRESETS[0]);
  let savedGlobalTheme = $state(null);
  let previousGlobalTheme = $state(null);
  let customThemes = $state([]);
  let statusMsg = $state('');
  let isBusy = $state(false);

  // Form tùy chỉnh màu + Banner sự kiện + Hạt trang trí
  let customForm = $state({
    name: '🏕️ Dã Ngoại & Workshop Cuối Tuần',
    icon: '🏕️',
    badge: 'OUTDOOR WORKSHOP',
    desc: 'Chủ đề dã ngoại & thực hành tiếng Anh ngoài trời',
    p600: '#059669',
    p700: '#047857',
    p50: '#f0fdf4',
    p200: '#bbf7d0',
    hof: ['#bbf7d0', '#34d399', '#059669', '#d97706'],
    bannerEnabled: true,
    bannerTitle: '🏕️ Chuyến Đi Dã Ngoại & Workshop Tiếng Anh Thực Tế — Đăng Ký Tham Gia Ngay!',
    bannerSub: 'Học từ vựng qua trò chơi đồng đội, thuyết trình ngoài trời & săn học bổng Sao.',
    ctaText: '🏕️ Khám Phá Từ Vựng Dã Ngoại',
    ctaHref: '/dictionary?q=picnic',
    particlesEnabled: true,
    particlesText: '🏕️, 🌿, 🌻, 🎒, 🧭, 🦋'
  });

  function getAuthHeaders() {
    const h = { 'Content-Type': 'application/json', 'x-admin-user': 'usr_admin_root' };
    if (typeof localStorage !== 'undefined') {
      const tk = localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token');
      if (tk) h['Authorization'] = `Bearer ${tk}`;
    }
    return h;
  }

  async function loadServerThemes() {
    try {
      const res = await fetch('/api/site-theme');
      const data = await res.json();
      if (data.success) {
        savedGlobalTheme = data.theme || null;
        previousGlobalTheme = data.previousTheme || null;
        customThemes = Array.isArray(data.customThemes) ? data.customThemes : [];
        if (data.theme) {
          selectedTheme = data.theme;
          syncCustomFormFromTheme(data.theme);
        }
      }
    } catch {}
  }

  function syncCustomFormFromTheme(p) {
    if (!p) return;
    customForm.name = p.name || 'Chủ đề tùy chỉnh';
    customForm.icon = p.icon || '🎨';
    customForm.badge = p.badge || 'EVENT THEME';
    customForm.desc = p.desc || '';
    if (p.c) {
      customForm.p600 = p.c[600] || '#059669';
      customForm.p700 = p.c[700] || '#047857';
      customForm.p50 = p.c[50] || '#f0fdf4';
      customForm.p200 = p.c[200] || '#bbf7d0';
    }
    if (Array.isArray(p.hof) && p.hof.length === 4) {
      customForm.hof = [...p.hof];
    }
    customForm.bannerEnabled = p.bannerEnabled !== undefined ? Boolean(p.bannerEnabled) : Boolean(p.bannerTitle);
    customForm.bannerTitle = p.bannerTitle || '';
    customForm.bannerSub = p.bannerSub || '';
    customForm.ctaText = p.ctaText || '';
    customForm.ctaHref = p.ctaHref || '/dictionary';
    customForm.particlesEnabled = p.particlesEnabled !== undefined ? Boolean(p.particlesEnabled) : false;
    customForm.particlesText = Array.isArray(p.particles) ? p.particles.join(', ') : '';
  }

  function pickPreset(p) {
    selectedTheme = { ...p };
    syncCustomFormFromTheme(p);
    applyThemeVars(selectedTheme);
    onApply?.(selectedTheme.c, selectedTheme.hof, selectedTheme.name, selectedTheme);
    statusMsg = `👁️ Đang xem trước chủ đề "${p.name}". Bấm "Lưu & Áp Dụng Toàn Web" để kích hoạt cho mọi học sinh!`;
  }

  function buildCustomThemeObject() {
    const c = deriveScale(customForm.p600, customForm.p700, customForm.p50, customForm.p200);
    const particles = String(customForm.particlesText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      id: selectedTheme?.id || `thm_${Date.now()}`,
      name: String(customForm.name || 'Chủ đề tùy chỉnh').trim(),
      category: selectedTheme?.category || 'event',
      icon: String(customForm.icon || '🎨').trim(),
      badge: String(customForm.badge || 'EVENT THEME').trim(),
      desc: String(customForm.desc || '').trim(),
      c,
      hof: [...customForm.hof],
      bannerEnabled: Boolean(customForm.bannerEnabled),
      bannerTitle: String(customForm.bannerTitle || '').trim(),
      bannerSub: String(customForm.bannerSub || '').trim(),
      ctaText: String(customForm.ctaText || '').trim(),
      ctaHref: String(customForm.ctaHref || '/dictionary').trim(),
      particlesEnabled: Boolean(customForm.particlesEnabled),
      particles
    };
  }

  function previewCustomForm() {
    const built = buildCustomThemeObject();
    selectedTheme = built;
    applyThemeVars(built);
    onApply?.(built.c, built.hof, built.name, built);
  }

  async function handleActivateGlobalTheme(themeToSave = null) {
    const target = themeToSave || buildCustomThemeObject();
    isBusy = true;
    statusMsg = '';
    try {
      const res = await fetch('/api/site-theme', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ adminUserId: 'usr_admin_root', theme: target })
      });
      const data = await res.json();
      if (data.success) {
        clearLocal();
        applyThemeVars(target);
        savedGlobalTheme = target;
        onSaved?.(target);
        statusMsg = data.message || `✅ Đã kích hoạt chủ đề "${target.name}" trên toàn bộ WebApp!`;
        await loadServerThemes();
      } else {
        statusMsg = `❌ ${data.error || 'Không lưu được chủ đề'}`;
      }
    } catch (e) {
      statusMsg = '❌ Lỗi kết nối khi lưu chủ đề lên D1.';
    } finally {
      isBusy = false;
    }
  }

  async function handleSaveCustomToLibrary() {
    const target = buildCustomThemeObject();
    isBusy = true;
    statusMsg = '';
    try {
      const res = await fetch('/api/site-theme', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'save_custom_theme',
          adminUserId: 'usr_admin_root',
          theme: { ...target, id: `thm_custom_${Date.now()}`, isCustomD1: true }
        })
      });
      const data = await res.json();
      if (data.success) {
        statusMsg = data.message || `✅ Đã thêm "${target.name}" vào Kho Chủ Đề D1!`;
        await loadServerThemes();
      } else {
        statusMsg = `❌ ${data.error || 'Không thêm được vào kho D1'}`;
      }
    } catch {
      statusMsg = '❌ Lỗi kết nối khi thêm chủ đề vào kho D1.';
    } finally {
      isBusy = false;
    }
  }

  async function handleDeleteCustomTheme(id, name) {
    if (!id) return;
    isBusy = true;
    statusMsg = '';
    try {
      const res = await fetch('/api/site-theme', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'delete_custom_theme', adminUserId: 'usr_admin_root', id })
      });
      const data = await res.json();
      if (data.success) {
        customThemes = customThemes.filter((t) => t.id !== id);
        statusMsg = `🗑️ Đã xóa chủ đề "${name || id}" khỏi kho D1!`;
      } else {
        statusMsg = `❌ ${data.error || 'Không xóa được chủ đề'}`;
      }
    } catch {
      statusMsg = '❌ Lỗi kết nối khi xóa chủ đề.';
    } finally {
      isBusy = false;
    }
  }

  async function handleRestorePrevious() {
    isBusy = true;
    statusMsg = '';
    try {
      const res = await fetch('/api/site-theme', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'restore_previous', adminUserId: 'usr_admin_root' })
      });
      const data = await res.json();
      if (data.success) {
        clearLocal();
        if (data.theme) {
          applyThemeVars(data.theme);
          savedGlobalTheme = data.theme;
          syncCustomFormFromTheme(data.theme);
        } else {
          removeThemeVars();
          savedGlobalTheme = null;
        }
        statusMsg = data.message || '🔄 Đã khôi phục về chủ đề trước đó!';
        await loadServerThemes();
      }
    } catch {
      statusMsg = '❌ Lỗi khi khôi phục chủ đề trước đó.';
    } finally {
      isBusy = false;
    }
  }

  async function handleRestoreDefault() {
    isBusy = true;
    statusMsg = '';
    try {
      const res = await fetch('/api/site-theme', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ adminUserId: 'usr_admin_root' })
      });
      const data = await res.json();
      if (data.success) {
        clearLocal();
        removeThemeVars();
        savedGlobalTheme = null;
        statusMsg = '🔄 Đã gỡ chủ đề sự kiện & khôi phục giao diện mặc định (Lavie Aqua)!';
        await loadServerThemes();
      }
    } catch {
      statusMsg = '❌ Lỗi khi khôi phục giao diện mặc định.';
    } finally {
      isBusy = false;
    }
  }

  onMount(() => {
    loadServerThemes();
  });
</script>

<div class="space-y-6" data-testid="theme-studio-panel">
  <!-- Trạng thái Theme hiện tại trên Production & Các nút thao tác nhanh -->
  <div class="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex flex-wrap items-center justify-between gap-3">
    <div>
      <div class="text-xs font-extrabold uppercase tracking-wider text-stone-500">Trạng Thái Giao Diện Toàn Hệ Thống (Cloudflare D1)</div>
      {#if savedGlobalTheme}
        <div class="text-sm font-black text-emerald-700 mt-0.5 flex items-center gap-2">
          <span>● Đang kích hoạt trên toàn Web:</span>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
            {savedGlobalTheme.icon || '🎨'} {savedGlobalTheme.name}
          </span>
        </div>
      {:else}
        <div class="text-sm font-bold text-stone-700 mt-0.5">
          ○ Đang dùng giao diện chuẩn mặc định: <b>💧 Lavie Aqua (Học đường)</b>
        </div>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="btn-activate-global-theme"
        disabled={isBusy}
        onclick={() => handleActivateGlobalTheme()}
        class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
      >
        {isBusy ? '⏳ Đang lưu...' : `💾 Lưu & Áp Dụng "${customForm.name}" Toàn Web`}
      </button>

      {#if previousGlobalTheme}
        <button
          type="button"
          data-testid="btn-restore-prev-theme"
          disabled={isBusy}
          onclick={handleRestorePrevious}
          class="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs transition cursor-pointer"
        >
          ⏪ Khôi phục bản trước ({previousGlobalTheme.name})
        </button>
      {/if}

      <button
        type="button"
        data-testid="btn-restore-default-theme"
        disabled={isBusy}
        onclick={handleRestoreDefault}
        class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-xs transition cursor-pointer"
      >
        🔄 Khôi Phục Mặc Định (Restore)
      </button>
    </div>
  </div>

  {#if statusMsg}
    <div
      data-testid="theme-status-msg"
      class="p-3 rounded-xl text-xs font-extrabold border {statusMsg.startsWith('❌') ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}"
    >
      {statusMsg}
    </div>
  {/if}

  <!-- 1. CHỦ ĐỀ SỰ KIỆN, LỄ HỘI, DÃ NGOẠI & WORKSHOP -->
  <div>
    <div class="flex items-center justify-between mb-2.5">
      <h4 class="text-xs font-black uppercase tracking-wider text-stone-700">
        🎉 1. Chủ Đề Sự Kiện, Lễ Hội, Đi Dã Ngoại & Workshop (Bấm Chọn Hoặc Áp Dụng Ngay)
      </h4>
      <span class="text-[11px] font-semibold text-stone-500">{EVENT_THEMES.length} chủ đề dựng sẵn</span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {#each EVENT_THEMES as p}
        {@const isCurrent = (selectedTheme?.id && selectedTheme.id === p.id) || activeName === p.name || savedGlobalTheme?.name === p.name}
        <div
          data-testid={`theme-card-${p.id}`}
          class="p-3.5 rounded-2xl border-2 transition flex flex-col justify-between gap-2.5 {isCurrent ? 'border-stone-900 bg-stone-50 shadow-sm' : 'border-stone-200 bg-white hover:border-stone-400'}"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <span
                class="w-8 h-8 rounded-xl flex items-center justify-center text-lg shadow-xs"
                style={`background:linear-gradient(135deg, ${p.c[200]}, ${p.c[600]});`}
              >
                {p.icon || '🎉'}
              </span>
              <span
                class="px-2 py-0.5 rounded-full text-[9.5px] font-black tracking-wider uppercase"
                style={`background:${p.c[100]};color:${p.c[800]};border:1px solid ${p.c[300]};`}
              >
                {p.badge}
              </span>
            </div>
            <div class="font-extrabold text-sm text-stone-900">{p.name}</div>
            <p class="text-[11px] text-stone-600 mt-1 line-clamp-2">{p.desc}</p>
            {#if Array.isArray(p.particles) && p.particles.length > 0}
              <div class="mt-1.5 text-xs tracking-widest opacity-85">{p.particles.join(' ')}</div>
            {/if}
          </div>

          <div class="flex items-center gap-1.5 pt-2 border-t border-stone-100">
            <button
              type="button"
              data-testid={`btn-preview-theme-${p.id}`}
              onclick={() => pickPreset(p)}
              class="flex-1 px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-[11px] transition cursor-pointer"
            >
              👁️ Xem trước
            </button>
            <button
              type="button"
              data-testid={`btn-apply-theme-${p.id}`}
              disabled={isBusy}
              onclick={() => { pickPreset(p); handleActivateGlobalTheme(p); }}
              class="flex-1 px-2.5 py-1.5 rounded-lg text-white font-extrabold text-[11px] shadow-xs transition cursor-pointer"
              style={`background:${p.c[600]};`}
            >
              ✓ Chọn & Lưu
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- 2. KHO CHỦ ĐỀ TÙY CHỈNH TRÊN D1 (Thêm / Xóa Chủ Đề Riêng Của Trường) -->
  <div class="p-4 rounded-2xl bg-stone-50/70 border border-stone-200">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div>
        <h4 class="text-xs font-black uppercase tracking-wider text-stone-800">
          🗂️ 2. Kho Chủ Đề Tùy Chỉnh Đã Lưu Trên D1 (Thêm / Xóa Chủ Đề Dã Ngoại, Workshop Riêng)
        </h4>
        <p class="text-[11px] text-stone-500">Lưu lại các chủ đề sự kiện riêng của trung tâm để tái sử dụng hoặc xóa bất kỳ lúc nào.</p>
      </div>
      <button
        type="button"
        data-testid="btn-save-custom-theme-d1"
        disabled={isBusy}
        onclick={handleSaveCustomToLibrary}
        class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition cursor-pointer"
      >
        + Lưu Cấu Hình Bên Dưới Thành Theme Mới (D1)
      </button>
    </div>

    {#if customThemes.length === 0}
      <div class="text-xs text-stone-500 italic py-2">
        Chưa có chủ đề tùy chỉnh nào trong kho riêng. Bạn có thể chỉnh màu/banner ở mục 4 rồi bấm <b>"+ Lưu Cấu Hình Bên Dưới Thành Theme Mới (D1)"</b>.
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        {#each customThemes as ct (ct.id)}
          <div
            data-testid={`custom-theme-card-${ct.id}`}
            class="p-3 rounded-xl bg-white border border-stone-200 flex flex-col justify-between gap-2 shadow-2xs"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                  style={`background:linear-gradient(135deg, ${ct.c?.[200] || '#a7f3d0'}, ${ct.c?.[600] || '#059669'});`}
                >
                  {ct.icon || '🎨'}
                </span>
                <div>
                  <div class="font-extrabold text-xs text-stone-900">{ct.name}</div>
                  <div class="text-[10px] font-bold text-stone-500">{ct.badge || 'CUSTOM THEME'}</div>
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-delete-custom-theme"
                onclick={() => handleDeleteCustomTheme(ct.id, ct.name)}
                class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[10.5px] transition cursor-pointer"
              >
                🗑️ Xóa
              </button>
            </div>
            <div class="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onclick={() => pickPreset(ct)}
                class="flex-1 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-[11px] cursor-pointer"
              >
                👁️ Xem thử
              </button>
              <button
                type="button"
                onclick={() => handleActivateGlobalTheme(ct)}
                class="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
              >
                ✓ Áp dụng Web
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 3. BẢNG MÀU HỌC ĐƯỜNG CƠ BẢN (CLASSIC THEMES) -->
  <div>
    <h4 class="text-xs font-black uppercase tracking-wider text-stone-700 mb-2.5">
      🎨 3. Bảng Màu Học Đường Cơ Bản (Không Kèm Banner Sự Kiện)
    </h4>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
      {#each CLASSIC_THEMES as p}
        <button
          type="button"
          onclick={() => pickPreset(p)}
          class="flex items-center gap-2 p-2.5 rounded-xl border-2 transition cursor-pointer text-left {activeName === p.name ? 'border-stone-900 bg-stone-100' : 'border-stone-200 bg-white hover:border-stone-400'}"
        >
          <span
            class="w-6 h-6 rounded-lg shrink-0"
            style={`background:linear-gradient(135deg, ${p.c[300]}, ${p.c[600]});`}
          ></span>
          <span class="text-xs font-bold text-stone-900 truncate">{p.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- 4. STUDIO TÙY CHỈNH MÀU SẮC, BANNER SỰ KIỆN & HIỆU ỨNG HẠT BAY -->
  <div class="p-4 rounded-2xl bg-white border border-stone-200 space-y-4">
    <h4 class="text-xs font-black uppercase tracking-wider text-stone-800">
      🧪 4. Tùy Chỉnh Chi Tiết Chủ Đề (Màu Sắc, Thanh Banner Sự Kiện & Biểu Tượng Bay)
    </h4>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
      <label class="block text-xs font-bold text-stone-700">
        Tên Chủ Đề / Sự Kiện
        <input
          type="text"
          data-testid="input-custom-theme-name"
          bind:value={customForm.name}
          oninput={previewCustomForm}
          class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          placeholder="VD: 🏕️ Dã Ngoại Công Viên Yên Sở"
        />
      </label>
      <label class="block text-xs font-bold text-stone-700">
        Icon Sự Kiện
        <input
          type="text"
          bind:value={customForm.icon}
          oninput={previewCustomForm}
          class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          placeholder="🎃 / 🏕️ / 🎙️"
        />
      </label>
      <label class="block text-xs font-bold text-stone-700">
        Nhãn Badge
        <input
          type="text"
          bind:value={customForm.badge}
          oninput={previewCustomForm}
          class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          placeholder="OUTDOOR WORKSHOP"
        />
      </label>
      <label class="block text-xs font-bold text-stone-700">
        Các Hạt Bay Trang Trí (cách nhau dấu phẩy)
        <input
          type="text"
          bind:value={customForm.particlesText}
          oninput={previewCustomForm}
          class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          placeholder="🎃, 🦇, 👻, 🍬"
        />
      </label>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <label class="block text-xs font-bold text-stone-700">
        Màu Chủ Đạo (Primary 600)
        <input type="color" bind:value={customForm.p600} oninput={previewCustomForm} class="mt-1 w-full h-9 rounded-lg border border-stone-300 cursor-pointer" />
      </label>
      <label class="block text-xs font-bold text-stone-700">
        Màu Đậm (Hover 700)
        <input type="color" bind:value={customForm.p700} oninput={previewCustomForm} class="mt-1 w-full h-9 rounded-lg border border-stone-300 cursor-pointer" />
      </label>
      <label class="block text-xs font-bold text-stone-700">
        Màu Nền Trang (Surface 50)
        <input type="color" bind:value={customForm.p50} oninput={previewCustomForm} class="mt-1 w-full h-9 rounded-lg border border-stone-300 cursor-pointer" />
      </label>
      <label class="block text-xs font-bold text-stone-700">
        Màu Viền Card (Border 200)
        <input type="color" bind:value={customForm.p200} oninput={previewCustomForm} class="mt-1 w-full h-9 rounded-lg border border-stone-300 cursor-pointer" />
      </label>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
      <label class="flex items-center gap-2 text-xs font-extrabold text-stone-800 cursor-pointer">
        <input type="checkbox" bind:checked={customForm.bannerEnabled} onchange={previewCustomForm} class="rounded" />
        Hiển thị Thanh Banner Sự Kiện Ở Đầu Trang Web
      </label>
      <label class="flex items-center gap-2 text-xs font-extrabold text-stone-800 cursor-pointer">
        <input type="checkbox" bind:checked={customForm.particlesEnabled} onchange={previewCustomForm} class="rounded" />
        Bật Hiệu Ứng Hạt Biểu Tượng Bay Nhẹ (🎃 / 🏕️ / 🎙️)
      </label>
    </div>

    {#if customForm.bannerEnabled}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="block text-xs font-bold text-stone-700">
          Tiêu Đề Thanh Banner Sự Kiện
          <input
            type="text"
            bind:value={customForm.bannerTitle}
            oninput={previewCustomForm}
            class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          />
        </label>
        <label class="block text-xs font-bold text-stone-700">
          Mô Tả Phụ Trên Banner
          <input
            type="text"
            bind:value={customForm.bannerSub}
            oninput={previewCustomForm}
            class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          />
        </label>
        <label class="block text-xs font-bold text-stone-700">
          Chữ Nút Kêu Gọi Hành Động (CTA)
          <input
            type="text"
            bind:value={customForm.ctaText}
            oninput={previewCustomForm}
            class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          />
        </label>
        <label class="block text-xs font-bold text-stone-700">
          Đường Dẫn Khi Bấm CTA
          <input
            type="text"
            bind:value={customForm.ctaHref}
            oninput={previewCustomForm}
            class="mt-1 w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
          />
        </label>
      </div>
    {/if}
  </div>
</div>
