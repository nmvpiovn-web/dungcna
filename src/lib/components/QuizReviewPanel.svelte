<script>
  import { onMount } from 'svelte';

  let { quizId, onReviewed = () => {} } = $props();

  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let quiz = $state(null);
  let questions = $state([]);
  let attempts = $state([]);
  let selectedId = $state('');
  let summary = $state('');
  let scoreOverride = $state('');
  let scores = $state({});
  let comments = $state({});

  let selected = $derived(attempts.find((attempt) => attempt.id === selectedId) || null);
  let subjective = $derived(questions.filter((question) => question.type === 'paragraph' || question.type === 'rewrite'));

  function timeLabel(value) {
    return value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa nộp';
  }

  function authHeaders(json = false) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {})
    };
  }

  function chooseAttempt(id) {
    selectedId = id;
    summary = '';
    scoreOverride = '';
    scores = Object.fromEntries(subjective.map((question) => [question.id, '']));
    comments = Object.fromEntries(subjective.map((question) => [question.id, '']));
  }

  async function loadAttempts() {
    loading = true;
    error = '';
    try {
      const response = await fetch(`/api/quiz-menu/${encodeURIComponent(quizId)}/attempts`, {
        headers: authHeaders(), credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tải được bài làm');
      quiz = data.quiz;
      questions = data.questions || [];
      attempts = data.attempts || [];
      const preferred = attempts.find((attempt) => attempt.status === 'review_pending') || attempts[0];
      if (preferred) chooseAttempt(preferred.id);
    } catch (loadError) {
      error = loadError.message || 'Không tải được bài làm';
    } finally {
      loading = false;
    }
  }

  async function submitReview() {
    if (!selected || saving) return;
    error = '';
    const feedbackQuestions = subjective.map((question) => ({
      question_id: question.id,
      awarded_points: Number(scores[question.id]),
      comment: comments[question.id] || ''
    }));
    if (feedbackQuestions.some((item) => !Number.isFinite(item.awarded_points))) {
      error = 'Vui lòng nhập điểm cho tất cả câu tự luận.';
      return;
    }
    saving = true;
    try {
      const response = await fetch(`/api/quiz-menu/attempts/${encodeURIComponent(selected.id)}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify({
          feedback: { summary, questions: feedbackQuestions },
          score_override: scoreOverride === '' ? null : Number(scoreOverride)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không lưu được kết quả chấm');
      attempts = attempts.map((attempt) => attempt.id === selected.id
        ? { ...attempt, status: data.attempt.status, final_score: data.attempt.final_score, reviews: [...(attempt.reviews || []), data.review] }
        : attempt);
      onReviewed(data);
    } catch (saveError) {
      error = saveError.message || 'Không lưu được kết quả chấm';
    } finally {
      saving = false;
    }
  }

  onMount(loadAttempts);
</script>

<section class="review-panel" aria-labelledby="quiz-review-title">
  <header>
    <div>
      <p class="eyebrow">Chấm bài Quiz</p>
      <h2 id="quiz-review-title">{quiz?.title || 'Bài làm cần duyệt'}</h2>
    </div>
    <button class="refresh" type="button" on:click={loadAttempts} disabled={loading}>Làm mới</button>
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loading}
    <p class="empty">Đang tải bài làm…</p>
  {:else if attempts.length === 0}
    <p class="empty">Quiz này chưa có bài nộp.</p>
  {:else}
    <div class="workspace">
      <nav class="attempt-list" aria-label="Danh sách bài làm">
        {#each attempts as attempt}
          <button class:active={attempt.id === selectedId} type="button" on:click={() => chooseAttempt(attempt.id)}>
            <strong>{attempt.guest_name || attempt.user_id || 'Học viên'}</strong>
            <span>{attempt.guest_class ? `Lớp: ${attempt.guest_class}` : 'Tài khoản / chưa khai lớp'}</span>
            <span>{timeLabel(attempt.started_at)}</span>
            <span>{attempt.status === 'review_pending' ? 'Chờ chấm' : `${attempt.final_score ?? '—'}/${attempt.max_score ?? '—'} điểm`}</span>
            {#if attempt.deferred_question_ids?.length}<em>{attempt.deferred_question_ids.length} câu chưa hiểu</em>{/if}
          </button>
        {/each}
      </nav>

      {#if selected}
        <div class="review-form">
          <div class="score-strip">
            <span>Lớp khai báo <b>{selected.guest_class || '—'}</b></span>
            <span>Bắt đầu <b>{timeLabel(selected.started_at)}</b></span>
            <span>Nộp bài <b>{timeLabel(selected.submitted_at)}</b></span>
            <small>Giờ Việt Nam · thời gian máy chủ</small>
            <span>Tự động <b>{selected.auto_score ?? 0}</b></span>
            <span>Tối đa <b>{selected.max_score ?? 0}</b></span>
            <span>Trạng thái <b>{selected.status}</b></span>
          </div>

          {#if selected.deferred_question_ids?.length}
            <div class="needs-help">
              <strong>Học viên cần được giảng lại</strong>
              <p>{selected.deferred_question_ids.length} câu được đánh dấu “Không hiểu – để làm sau”.</p>
              <ul>{#each questions.filter((question) => selected.deferred_question_ids.includes(question.id)) as question}<li>{question.prompt}</li>{/each}</ul>
            </div>
          {/if}

          {#each subjective as question}
            <article class="question">
              <h3>{question.prompt}</h3>
              <p class="answer">{selected.answers?.[question.id]?.state === 'not_understood' ? 'Chưa hiểu – học viên để làm sau' : selected.answers?.[question.id] || 'Không có câu trả lời'}</p>
              <div class="grade-row">
                <label>
                  Điểm (tối đa {question.points})
                  <input type="number" min="0" max={question.points} step="0.25" bind:value={scores[question.id]} />
                </label>
                <label>
                  Nhận xét câu này
                  <input maxlength="2000" bind:value={comments[question.id]} placeholder="Gợi ý để học viên cải thiện" />
                </label>
              </div>
            </article>
          {/each}

          <label class="wide-label">
            Nhận xét chung
            <textarea maxlength="5000" rows="3" bind:value={summary} placeholder="Điểm mạnh và nội dung cần ôn lại"></textarea>
          </label>
          <label class="override">
            Điểm cuối tùy chỉnh (không bắt buộc, 0–{selected.max_score})
            <input type="number" min="0" max={selected.max_score} step="0.25" bind:value={scoreOverride} />
          </label>
          <button class="save" type="button" disabled={saving} on:click={submitReview}>{saving ? 'Đang lưu…' : 'Lưu kết quả chấm'}</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .review-panel { color: #1e293b; background: #fff; border: 1px solid #e2e8f0; border-radius: 22px; padding: 20px; box-shadow: 0 18px 45px rgba(15,23,42,.08); }
  header, .score-strip, .grade-row { display: flex; gap: 12px; align-items: center; }
  header { justify-content: space-between; margin-bottom: 16px; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1rem; }
  .eyebrow { color: #7c3aed; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  button { font: inherit; cursor: pointer; }
  button:disabled { cursor: wait; opacity: .6; }
  .refresh { border: 1px solid #ddd6fe; background: #f5f3ff; color: #6d28d9; border-radius: 12px; padding: 8px 12px; }
  .workspace { display: grid; grid-template-columns: minmax(170px, .34fr) minmax(0, 1fr); gap: 18px; }
  .attempt-list { display: flex; flex-direction: column; gap: 8px; }
  .attempt-list button { text-align: left; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 13px; padding: 11px; }
  .attempt-list button.active { border-color: #8b5cf6; background: #f5f3ff; }
  .attempt-list strong, .attempt-list span { display: block; }
  .attempt-list span { color: #64748b; font-size: .78rem; margin-top: 3px; }
  .attempt-list em { display:block; margin-top:5px; color:#b45309; font-size:.72rem; font-style:normal; font-weight:800; }
  .review-form { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .score-strip { flex-wrap: wrap; padding: 10px 12px; background: #f1f5f9; border-radius: 13px; font-size: .84rem; }
  .question { border: 1px solid #e2e8f0; border-radius: 15px; padding: 14px; }
  .needs-help { padding:13px 15px; border:1px solid #fdba74; background:#fffbeb; color:#92400e; border-radius:13px; }
  .needs-help p { margin-top:3px; font-size:.84rem; }.needs-help ul{margin:8px 0 0;padding-left:20px;font-size:.82rem}
  .answer { margin: 9px 0 12px; white-space: pre-wrap; padding: 10px; background: #f8fafc; border-radius: 10px; }
  .grade-row label:first-child { flex: 0 0 145px; }
  .grade-row label:last-child { flex: 1; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: .82rem; font-weight: 700; }
  input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 10px; font: inherit; font-weight: 400; }
  textarea { resize: vertical; }
  .override { max-width: 320px; }
  .save { align-self: flex-end; border: 0; color: #fff; background: linear-gradient(135deg,#7c3aed,#4f46e5); border-radius: 12px; padding: 11px 16px; font-weight: 800; }
  .error { color: #b91c1c; background: #fef2f2; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
  .empty { color: #64748b; padding: 24px 0; text-align: center; }
  @media (max-width: 720px) { .workspace { grid-template-columns: 1fr; } .attempt-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } .grade-row { align-items: stretch; flex-direction: column; } .grade-row label:first-child { flex-basis: auto; } }
</style>
