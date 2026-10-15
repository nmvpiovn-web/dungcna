<script>
  import { onMount } from 'svelte';

  let iframeEl = $state(null);

  onMount(() => {
    // Sync auth changes between parent SvelteKit context and Mobile App Workspace
    const handleStorage = (e) => {
      if (e.key === 'tienganh_current_user' || e.key === 'tienganh_token') {
        if (iframeEl?.contentWindow) {
          iframeEl.contentWindow.location.reload();
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  });
</script>

<svelte:head>
  <title>Tiếng Anh Cô Dung — Ứng Dụng Mobile &amp; R10</title>
</svelte:head>

<div class="fixed inset-0 z-50 bg-[#eaf3f8] flex flex-col">
  <iframe
    bind:this={iframeEl}
    src="/mobile-app/index.html"
    title="Tiếng Anh Cô Dung Mobile App"
    class="w-full h-full border-0 flex-1"
    allow="microphone; geolocation; autoplay"
  ></iframe>
</div>
