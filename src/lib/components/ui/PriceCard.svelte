<!-- src/lib/components/ui/PriceCard.svelte — cong thuc Monkey/StepUp: gia gach + % giam + Xd/ngay + countdown -->
<script>
  import UiButton from './UiButton.svelte';
  import CountdownTimer from './CountdownTimer.svelte';
  import { SITE_CONTACT } from '$lib/site.js';

  let {
    name = '',
    price = 0,          // gia KM (VND)
    oldPrice = 0,       // gia goc (VND)
    periodMonths = 12,  // so thang de tinh "Xd/ngay"
    gifts = [],
    commitments = [],
    ctaLabel = 'Đăng ký ngay',
    ctaHref = '',
    featured = false,
    badge = 'Ưu đãi khai giảng'
  } = $props();

  const discountPct = $derived(oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0);
  const perDay = $derived(Math.round(price / (periodMonths * 30)));
  const fmt = (v) => Number(v).toLocaleString('vi-VN');
</script>

<div class={`relative flex flex-col p-6 rounded-3xl border-2 shadow-sm transition-all hover:shadow-md ${featured ? 'border-accent-500 bg-surface-0' : 'border-line bg-surface-0'}`}>
  {#if badge}
    <span class="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1 rounded-full bg-accent-500 text-white text-xs font-extrabold shadow-sm">
      {badge}{discountPct ? ` −${discountPct}%` : ''}
    </span>
  {/if}

  <h3 class="font-heading text-lg font-extrabold text-ink-900 text-center mt-1">{name}</h3>

  <div class="text-center mt-3 mb-1">
    {#if oldPrice > price}
      <div class="text-sm text-ink-500 line-through">{fmt(oldPrice)}đ</div>
    {/if}
    <div class="font-heading text-3xl font-extrabold text-brand-600">{fmt(price)}đ</div>
    <div class="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-full bg-accent-500/15 text-accent-500 text-xs font-extrabold">
      💰 Chỉ {fmt(perDay)}đ/ngày
    </div>
  </div>

  <div class="flex justify-center my-3">
    <CountdownTimer />
  </div>

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
    <UiButton size="md" variant={featured ? 'accent' : 'primary'} href={ctaHref || undefined} class="w-full">{ctaLabel}</UiButton>
    <a href={SITE_CONTACT.zaloUrl} target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1.5 w-full px-5 py-2.5 text-sm rounded-xl font-bold text-brand-600 border border-line hover:bg-brand-50 transition-colors">
      💬 Chat Zalo tư vấn
    </a>
  </div>
</div>
