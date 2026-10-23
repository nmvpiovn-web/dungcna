<script>
  import { onMount } from 'svelte';
  import { speakWord } from '$lib/speech.js';

  let isOpen = $state(false);
  let campaigns = $state([]);
  let selectedCampaignId = $state('camp_halloween_2026');
  let activeCampaign = $derived(
    campaigns.find((c) => c.id === selectedCampaignId) ||
    campaigns[0] || {
      id: 'camp_halloween_2026',
      theme: 'halloween',
      badge_text: '🎃 LỄ HỘI HALLOWEEN SẮP DIỄN RA (20/10 – 31/10)',
      title: '🎃 Đêm Hội Phù Thủy Anh Ngữ Halloween: Trick or Treat & Săn Học Bổng 5.000 Sao!',
      subtitle: 'Chào đón mùa lễ hội Halloween 2026 tại Lớp Tiếng Anh Cô Dung! Khám phá kho từ vựng Spooky Halloween, vượt thử thách Quiz hóa trang và nhận ngay học bổng ưu đãi.',
      offer_highlight: '🎁 Tặng ngay +500 Sao thưởng • 02 Buổi Học Thử Miễn Phí (Tiểu học, THCS Global Success, IELTS) • Bộ Flashcard Halloween Cambridge độc quyền!',
      highlights: [
        "🎃 Học bộ từ vựng chủ đề Halloween (Jack-o'-lantern, Costume, Trick-or-treat, Spooky, Enchanted) có phát âm IPA chuẩn",
        '🧩 Đấu trường Quiz & Mini-game Săn Kẹo Phù Thủy tích lũy Sao đổi chiết khấu học phí thật',
        '👩‍🏫 Đăng ký học thử 02 buổi miễn phí cùng Cô Nguyễn Thị Dung (42 Hiệp Bình & Online Zoom VIP)'
      ],
      cta_primary_text: '🎃 Học Ngay Từ Vựng & Flashcard Halloween',
      cta_primary_url: '/flashcards',
      cta_secondary_text: '🧩 Vào Đấu Trường Quiz Halloween',
      cta_secondary_url: '/quiz-menu?tab=take',
      discount_code: 'HALLOWEEN2026',
      bonus_stars: 500
    }
  );

  const halloweenMiniWords = [
    { word: "jack-o'-lantern", ipa: "/ˈdʒæk.əˌlæn.tən/", vi: "Đèn lồng bí ngô" },
    { word: "trick-or-treat", ipa: "/ˌtrɪk.ɔːˈtriːt/", vi: "Cho kẹo hay bị ghẹo" },
    { word: "costume", ipa: "/ˈkɒs.tjuːm/", vi: "Trang phục hóa trang" },
    { word: "spooky", ipa: "/ˈspuː.ki/", vi: "Kỳ bí, ma mị vui nhộn" },
    { word: "enchanted", ipa: "/ɪnˈtʃɑːn.tɪd/", vi: "Phép thuật kỳ diệu" }
  ];

  let leadName = $state('');
  let leadPhone = $state('');
  let leadGrade = $state('Lớp 7 (Global Success & KET A2)');
  let claiming = $state(false);
  let claimResult = $state(null);
  let claimError = $state('');

  async function loadCampaignsFromD1() {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json().catch(() => ({}));
      if (data.success && Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        campaigns = data.campaigns;
        if (data.active_campaign?.id) {
          selectedCampaignId = data.active_campaign.id;
        }
      }
    } catch {}
  }

  function closePopup() {
    isOpen = false;
    try {
      sessionStorage.setItem('tienganh_halloween_popup_seen', '1');
    } catch {}
  }

  async function handleClaimOffer(e) {
    e.preventDefault();
    claimError = '';
    claimResult = null;
    if (!leadPhone.trim() || leadPhone.trim().length < 8) {
      claimError = 'Vui lòng nhập số điện thoại Zalo hợp lệ để nhận mã học bổng +500 Sao!';
      return;
    }
    claiming = true;
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim_offer',
          campaign_id: activeCampaign.id,
          visitor_name: leadName.trim() || 'Phụ huynh / Học sinh',
          phone: leadPhone.trim(),
          grade_interest: leadGrade
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        claimResult = data;
        leadName = '';
        leadPhone = '';
      } else {
        claimError = data.error || 'Không thể gửi đăng ký. Vui lòng thử lại!';
      }
    } catch (err) {
      claimError = 'Lỗi kết nối: ' + err.message;
    } finally {
      claiming = false;
    }
  }

  onMount(() => {
    loadCampaignsFromD1();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('campaign') === 'halloween' || params.get('popup') === 'halloween') {
        isOpen = true;
        return;
      }
      // Auto-show on home page once per session if not dismissed
      const seen = sessionStorage.getItem('tienganh_halloween_popup_seen');
      if (!seen && window.location.pathname === '/') {
        const timer = setTimeout(() => {
          isOpen = true;
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  });
</script>

<!-- Floating Campaign Trigger Pill (Always accessible above DockBar) -->
<button
  type="button"
  id="halloween-campaign-pill"
  data-testid="halloween-campaign-pill"
  onclick={() => (isOpen = true)}
  class="fixed bottom-24 left-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-purple-700 text-white font-black text-[11px] shadow-lg border-2 border-amber-200 hover:scale-105 transition-all cursor-pointer"
  title="Mở Popup Chiến Dịch Lễ Hội Halloween 2026 & Nhận 500 Sao"
>
  <span class="text-sm">🎃</span>
  <span>Halloween +500⭐</span>
</button>

{#if isOpen}
  <div
    data-testid="halloween-marketing-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="halloween-modal-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
  >
    <div class="w-full max-w-2xl rounded-3xl bg-white border-2 border-orange-400 shadow-2xl flex flex-col max-h-[82vh] overflow-hidden">
      <!-- Festive Header -->
      <div class="shrink-0 px-5 py-4 bg-gradient-to-r from-slate-900 via-purple-950 to-orange-900 text-white flex items-start justify-between gap-3 border-b border-orange-400/40">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-black tracking-wider uppercase shadow-xs">
              {activeCampaign.badge_text}
            </span>
            <span class="px-2.5 py-0.5 rounded-full bg-amber-300 text-slate-950 text-[10px] font-black">
              Mã: {activeCampaign.discount_code || 'HALLOWEEN2026'} (+{activeCampaign.bonus_stars || 500}⭐)
            </span>
          </div>
          <h2 id="halloween-modal-title" class="text-base sm:text-lg font-black leading-snug text-amber-100">
            {activeCampaign.title}
          </h2>
        </div>
        <button
          type="button"
          data-testid="close-halloween-modal-btn"
          onclick={closePopup}
          aria-label="Đóng"
          class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white font-bold flex items-center justify-center shrink-0 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <!-- Campaign Switcher Tabs (if multiple campaigns active in D1) -->
      {#if campaigns.length > 1}
        <div class="shrink-0 px-5 py-2 bg-orange-50 border-b border-orange-200 flex flex-wrap items-center gap-2 text-xs">
          <span class="font-bold text-orange-900 text-[11px]">🎯 Chọn Chiến Dịch Đang Mở:</span>
          {#each campaigns as c (c.id)}
            <button
              type="button"
              onclick={() => {
                selectedCampaignId = c.id;
                claimResult = null;
              }}
              class="px-3 py-1 rounded-xl font-extrabold text-[11px] border transition-all cursor-pointer {selectedCampaignId === c.id
                ? 'bg-orange-600 text-white border-orange-700 shadow-2xs'
                : 'bg-white text-slate-700 border-orange-200 hover:bg-orange-100'}"
            >
              {c.theme === 'halloween' ? '🎃 Lễ Hội Halloween (31/10)' : '🏆 ' + c.slug}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Scrollable Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
        <p class="text-slate-700 leading-relaxed font-medium">
          {activeCampaign.subtitle}
        </p>

        <!-- Offer Highlight Banner -->
        <div class="p-3.5 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-purple-50 border-2 border-orange-300 text-slate-900 space-y-2">
          <div class="font-black text-orange-900 text-xs sm:text-sm">
            {activeCampaign.offer_highlight}
          </div>
          {#if Array.isArray(activeCampaign.highlights) && activeCampaign.highlights.length > 0}
            <ul class="space-y-1 text-[11px] text-slate-700">
              {#each activeCampaign.highlights as item}
                <li class="flex items-start gap-1.5">
                  <span class="text-orange-600 font-bold">✦</span>
                  <span>{item}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <!-- Interactive Mini Halloween Vocabulary Bar -->
        <div class="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-black text-amber-300 text-[11px] uppercase tracking-wider">
              🎃 5 Từ Vựng Chủ Đề Halloween Nổi Bật (Bấm Để Nghe Phát Âm IPA)
            </span>
            <span class="text-[10px] text-orange-300 font-semibold">Đã đồng bộ D1</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {#each halloweenMiniWords as hw}
              <button
                type="button"
                onclick={() => speakWord(hw.word, 0.9)}
                class="p-2 rounded-xl bg-white/10 hover:bg-orange-500/30 border border-white/15 text-left transition-all cursor-pointer"
              >
                <div class="font-black text-amber-200 text-xs flex items-center justify-between">
                  <span class="truncate">{hw.word}</span>
                  <span>🔊</span>
                </div>
                <div class="font-mono text-[10px] text-slate-300">{hw.ipa}</div>
                <div class="text-[10px] text-orange-200 truncate mt-0.5">{hw.vi}</div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Lead Registration Form to Claim +500 Stars & 2 Free Trial Sessions -->
        <form onsubmit={handleClaimOffer} class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div class="font-black text-slate-900 text-xs flex items-center gap-1.5">
            <span>🎁 Đăng Ký Nhận Ngay Mã Học Bổng `{activeCampaign.discount_code || 'HALLOWEEN2026'}` (+{activeCampaign.bonus_stars || 500} Sao &amp; 02 Buổi Học Thử):</span>
          </div>

          {#if claimResult}
            <div data-testid="campaign-claim-success" class="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs">
              {claimResult.message}
            </div>
          {/if}
          {#if claimError}
            <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs">
              ⚠️ {claimError}
            </div>
          {/if}

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label for="camp-lead-name" class="block font-bold text-slate-700 mb-1 text-[11px]">Họ tên Phụ huynh / Học sinh:</label>
              <input
                id="camp-lead-name"
                data-testid="camp-lead-name"
                type="text"
                bind:value={leadName}
                placeholder="VD: Chị Lan / Bé Minh"
                class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
              />
            </div>
            <div>
              <label for="camp-lead-phone" class="block font-bold text-slate-700 mb-1 text-[11px]">Số điện thoại Zalo (*):</label>
              <input
                id="camp-lead-phone"
                data-testid="camp-lead-phone"
                type="tel"
                required
                bind:value={leadPhone}
                placeholder="090..."
                class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono"
              />
            </div>
            <div>
              <label for="camp-lead-grade" class="block font-bold text-slate-700 mb-1 text-[11px]">Khối lớp quan tâm:</label>
              <select
                id="camp-lead-grade"
                bind:value={leadGrade}
                class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
              >
                <option value="Tiểu Học (Lớp 1-5 • Starters/Movers/Flyers)">Tiểu Học (Lớp 1–5)</option>
                <option value="Lớp 6-7 (Global Success & KET A2)">THCS Lớp 6–7 (KET A2)</option>
                <option value="Lớp 8-9 (Global Success & Ôn Vào 10)">THCS Lớp 8–9 (PET B1 / Vào 10)</option>
                <option value="THPT Lớp 10-12 & IELTS 7.5+">THPT Lớp 10–12 &amp; IELTS</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end">
            <button
              type="submit"
              data-testid="claim-campaign-offer-btn"
              disabled={claiming}
              class="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-sm cursor-pointer disabled:opacity-50"
            >
              {claiming ? '⏳ Đang ghi nhận vào D1...' : '🎃 Nhận Ngay +500 Sao & Ưu Đãi Học Thử'}
            </button>
          </div>
        </form>
      </div>

      <!-- Sticky Bottom CTA Footer -->
      <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onclick={closePopup}
          class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
        >
          Để sau
        </button>
        <div class="flex flex-wrap items-center gap-2">
          <a
            href={activeCampaign.cta_secondary_url || '/quiz-menu?tab=take'}
            onclick={closePopup}
            class="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black shadow-xs"
          >
            {activeCampaign.cta_secondary_text || '🧩 Làm Quiz Halloween'}
          </a>
          <a
            href={activeCampaign.cta_primary_url || '/flashcards'}
            onclick={closePopup}
            class="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black shadow-xs"
          >
            {activeCampaign.cta_primary_text || '🎃 Học Flashcard Halloween'}
          </a>
        </div>
      </div>
    </div>
  </div>
{/if}
