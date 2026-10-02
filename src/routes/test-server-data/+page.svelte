<script>
  let { data } = $props();
</script>

<h1>Test Server Data</h1>
<p>Message: {data?.message || 'NO DATA'}</p>
<p>Timestamp: {data?.timestamp || 'NO DATA'}</p>
<p>Test: {data?.test || 'NO DATA'}</p>
<p>Full data: {JSON.stringify(data)}</p>
