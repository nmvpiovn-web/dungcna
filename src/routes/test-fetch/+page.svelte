<script>
  import { onMount } from 'svelte';
  let result = $state('Chưa test');
  let details = $state('');

  onMount(async () => {
    result = 'Đang fetch...';
    try {
      const start = Date.now();
      const res = await fetch('/api/second-brain?_t=' + Date.now(), {
        credentials: 'include',
        cache: 'no-store'
      });
      const elapsed = Date.now() - start;
      details = `Status: ${res.status}, Time: ${elapsed}ms`;
      const text = await res.text();
      result = `OK! Length: ${text.length} chars`;
      details += `, Body preview: ${text.substring(0, 100)}`;
    } catch (e) {
      result = `LỖI: ${e.message}`;
      details = e.stack || '';
    }
  });
</script>

<h1>Test Fetch API</h1>
<p><strong>Kết quả:</strong> {result}</p>
<p><strong>Chi tiết:</strong> {details}</p>
