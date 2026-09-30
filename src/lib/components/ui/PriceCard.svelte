<!-- src/lib/components/ui/PriceCard.svelte — cong thuc Monkey/StepUp: gia gach + % giam + Xd/ngay + countdown -->
<script>
  import UiButton from './UiButton.svelte';
  import CountdownTimer from './CountdownTimer.svelte';
  import { SITE_CONTACT } from '$lib/site.js';

  let {
    title = '',
    gradeBand = '',
    price = 0,          // tong gia goi (VND)
    oldPrice = 0,       // gia goc (VND)
    unit = 'tháng',     // don vi hien thi: 'tháng' | '5 tháng' | 'năm học'
    periodMonths = 1,   // so thang cua goi de tinh "Xd/ngay"
    features = [],
    gifts = [],
    commitments = [],
    badge = 'Ưu đãi khai giảng',
    cta = 'Đăng ký ngay',
    href = '',
    featured = false
  } = $props();

  const discountPct = $derived(oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0);
  const perDay = $derived(periodMonths > 0 ? Math.round(price / (periodMonths * 30)) : 0);
  const fmt = (v) => Number(v).toLocaleString('vi-VN');
</script>

<div class={`relative flex flex-col p-6 rounded-3xl border-2 shadow-sm transition-all hover:shadow-md ${featured ? 'border-accent-500 bg-surface-0' : 'border-line bg-surface-0'}`}>
  {#if badge}
    <div class="flex justify-center -mt-2 mb-3">
      <span class="whitespace-nowrap px-4 py-1 rounded-full bg-accent-500 text-white text-xs font-extrabold shadow-md">
        {badge}{discountPct ? ` −${discountPct}%` : ''}
      </span>
    </div>
  {/if}

  <h3 class="font-heading text-lg font-extrabold text-ink-900 text-center mt-1">{title}</h3>
  {#if gradeBand}
    <div class="text-center mt-1">
      <span class="inline-block px-2.5 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-[11px] font-extrabold uppercase tracking-widest">{gradeBand}</span>
    </div>
  {/if}

  <div class="text-center mt-3 mb-1">
    {#if oldPrice > price}
      <div class="text-sm text-ink-500 line-through">{fmt(oldPrice)}đ</div>
    {/if}
    <div class="font-heading text-3xl font-extrabold text-brand-600">{fmt(price)}đ<span class="text-sm font-bold text-ink-500">/{unit}</span></div>
    {#if perDay > 0}
      <div class="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-full bg-accent-500/15 text-accent-500 text-xs font-extrabold">
        💰 Chỉ {fmt(perDay)}đ/ngày
      </div>
    {/if}
  </div>

  <div class="flex justify-center my-3">
    <CountdownTimer />
  </div>

  {#if features.length}
    <div class="mb-3">
      <div class="text-xs font-extrabold uppercase tracking-widest text-ink-500 mb-1.5">✨ Điểm nổi bật</div>
      <ul class="space-y-1">
        {#each features as f}<li class="text-xs text-ink-900 font-medium flex gap-1.5"><span>✓</span><span>{f}</span></li>{/each}
      </ul>
    </div>
  {/if}

  {#if gifts.length}
    <div class="mb-3">
      <div class="text-xs font-extrabold uppercase tracking-widest text-ink-500 mb-1.5">🎁 Quà tặng kèm</div>
      <ul class="space-y-1">
        {#each gifts as g}<li class="text-xs text-ink-900 font-medium flex gap-1.5"><span>✓</span><span>{g}</span></li>{/each}
      </ul>
    </div>
  {/if}

  {#if commitments.length}
    <div class="mb-4">
      <div class="text-xs font-extrabold uppercase tracking-widest text-ink-500 mb-1.5">✅ Cam kết</div>
      <ul class="space-y-1">
        {#each commitments as c}<li class="text-xs text-ink-500 flex gap-1.5"><span>•</span><span>{c}</span></li>{/each}
      </ul>
    </div>
  {/if}

  <div class="mt-auto space-y-2">
    <UiButton size="md" variant={featured ? 'accent' : 'primary'} href={href || undefined} class="w-full">{cta}</UiButton>
    <a href={SITE_CONTACT.zaloUrl} target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1.5 w-full px-5 py-2.5 text-sm rounded-xl font-bold text-brand-600 border border-line hover:bg-brand-50 transition-colors">
      💬 Chat Zalo tư vấn
    </a>
  </div>
</div>
