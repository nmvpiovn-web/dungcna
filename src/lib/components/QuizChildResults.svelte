<script>
  import { onMount } from 'svelte';

  let children = $state([]);
  let childId = $state('');
  let results = $state([]);
  let childInfo = $state(null);
  let loading = $state(false);
  let error = $state('');

  function token() {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token') || '';
  }

  async function apiGet(url) {
    const res = await fetch(url, { headers: token() ? { authorization: `Bearer ${token()}` } : {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || body.error || 'Không tải được dữ liệu');
    return body;
  }

  async function loadChildren() {
    try {
      const data = await apiGet('/api/parents/children');
      const list = data.children || data.linked_children || [];
      children = list.filter((c) => (c.verification_status || c.status || 'verified') === 'verified');
      if (children.length === 1) {
        childId = children[0].student_user_id || children[0].id;
        await loadResults();
      }
    } catch (e) {
      error = e.message;
    }
  }

  async function loadResults() {
    if (!childId) return;
    loading = true;
    error = '';
    results = [];
    try {
      const data = await apiGet(`/api/quiz-menu/children-results?child_id=${encodeURIComponent(childId)}`);
      childInfo = data.child;
      results = data.results || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function statusLabel(s) {
    return s === 'graded' ? 'Đã chấm' : s === 'review_pending' ? 'Chờ giáo viên chấm' : s === 'submitted' ? 'Đã nộp' : s;
  }

  function scoreText(r) {
    const score = r.final_score ?? r.auto_score;
    if (score == null) return '—';
    return `${score}/${r.max_score ?? '—'}`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
  }

  onMount(loadChildren);
</script>

<div class="child-results">
  {#if error}<div class="notice error" role="alert">{error}</div>{/if}

  {#if children.length > 1}
    <label>Chọn con
      <select bind:value={childId} on:change={loadResults}>
        <option value="">— Chọn —</option>
        {#each children as c}
          <option value={c.student_user_id || c.id}>{c.student_name || c.name || c.username}</option>
        {/each}
      </select>
    </label>
  {:else if !children.length && !error}
    <div class="empty-state"><span>👨‍👩‍👧</span><h3>Chưa liên kết học sinh</h3><p>Liên kết tài khoản với con để theo dõi kết quả quiz.</p></div>
  {/if}

  {#if loading}
    <p>Đang tải kết quả...</p>
  {:else if childId && !results.length && !error}
    <div class="empty-state"><span>📝</span><h3>Chưa có bài làm</h3><p>{childInfo?.name || 'Con'} chưa nộp bài quiz nào.</p></div>
  {:else if results.length}
    <div class="results-head"><strong>{childInfo?.name || ''}</strong><span>{results.length} bài đã nộp</span></div>
    <div class="results-list">
      {#each results as r}
        <article class="result-card">
          <div class="result-top"><h3>{r.quiz_title}</h3><span class="status">{statusLabel(r.status)}</span></div>
          <div class="result-meta">
            <span>Điểm: <strong>{scoreText(r)}</strong></span>
            {#if r.duration_seconds != null}<span>⏱ {Math.round(r.duration_seconds / 60)} phút</span>{/if}
            <span>🕒 {fmtDate(r.submitted_at)}</span>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .child-results { display: flex; flex-direction: column; gap: 14px; }
  .notice.error { padding: 12px 16px; border-radius: 7px; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
  .empty-state { text-align: center; padding: 40px 16px; color: #617184; }
  .empty-state > span { display: block; font-size: 2rem; margin-bottom: 8px; }
  .results-head { display: flex; align-items: center; justify-content: space-between; }
  .results-head span { color: #64748b; font-size: .85rem; }
  .results-list { display: flex; flex-direction: column; gap: 10px; }
  .result-card { border: 1px solid #dce5ec; border-radius: 9px; padding: 14px 16px; background: #fff; }
  .result-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .result-top h3 { margin: 0; font-size: 1rem; }
  .status { padding: 3px 8px; background: #f0fdf4; color: #15803d; border-radius: 4px; font-size: .75rem; font-weight: 700; white-space: nowrap; }
  .result-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; color: #64748b; font-size: .85rem; }
  .result-meta strong { color: #0e7490; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: .83rem; font-weight: 600; color: #3b4d61; max-width: 320px; }
  select { min-height: 44px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; font: inherit; }
</style>
