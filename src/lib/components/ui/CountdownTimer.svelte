<!-- src/lib/components/ui/CountdownTimer.svelte — deadline ROLLING (khong hardcode ngay co dinh) -->
<script>
  import { onMount } from 'svelte';
  // deadline: timestamp ms. Neu khong truyen -> tu dong rolling: het han vao 23:59:59 hom nay.
  let { deadline = null, label = 'Ưu đãi kết thúc sau' } = $props();

  function rollingDeadline() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  let target = $state(deadline || rollingDeadline());
  let remain = $state(Math.max(0, target - Date.now()));

  onMount(() => {
    const t = setInterval(() => {
      remain = Math.max(0, target - Date.now());
      if (remain === 0) {
        // Het han -> lap lai chu ky moi (rolling, khong bao gio hien 00:00:00 chet)
        target = rollingDeadline();
        remain = Math.max(0, target - Date.now());
      }
    }, 1000);
    return () => clearInterval(t);
  });

  const hh = $derived(String(Math.floor(remain / 3600000)).padStart(2, '0'));
  const mm = $derived(String(Math.floor((remain % 3600000) / 60000)).padStart(2, '0'));
  const ss = $derived(String(Math.floor((remain % 60000) / 1000)).padStart(2, '0'));
</script>

<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-danger-600/10 border border-danger-600/30">
  <span class="text-xs font-bold text-danger-600">⏳ {label}:</span>
  <span class="font-heading font-extrabold text-danger-600 tabular-nums text-sm">{hh}:{mm}:{ss}</span>
</div>
