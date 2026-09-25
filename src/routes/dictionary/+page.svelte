<script>
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import { addCustomWordLocally } from '$lib/staticDb.js';

  let { data } = $props();

  let searchQuery = $state(data.currentSearch || '');
  let selectedUnit = $state(data.currentUnit || 'all');
  let words = $state([...data.words]);
  let showAddModal = $state(false);

  // Form state for adding word
  let newTerm = $state('');
  let newIpa = $state('');
  let newPos = $state('noun');
  let newMeaning = $state('');
  let newExampleEn = $state('');
  let newExampleVi = $state('');
  let newUnit = $state('unit1');

  let filteredWords = $derived.by(() => {
    return words.filter(w => {
      const matchUnit = selectedUnit === 'all' || w.unit_id === selectedUnit;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || w.term.toLowerCase().includes(q) || w.meaning_vi.toLowerCase().includes(q);
      return matchUnit && matchSearch;
    });
  });

  function handleAddWord(e) {
    e.preventDefault();
    if (!newTerm.trim() || !newMeaning.trim()) return;

    try {
      const created = addCustomWordLocally({
        term: newTerm.trim(),
        ipa: newIpa.trim(),
        pos: newPos,
        meaning_vi: newMeaning.trim(),
        example_en: newExampleEn.trim(),
        example_vi: newExampleVi.trim(),
        unit_id: newUnit,
        status: 'new'
      });

      if (created) {
        words.unshift(created);
        showAddModal = false;
        newTerm = '';
        newIpa = '';
        newMeaning = '';
        newExampleEn = '';
        newExampleVi = '';
        playAudioFeedback('correct');
      }
    } catch (err) {
      console.error(err);
    }
  }
</script>

<div class="dict-page">
  <div class="dict-header">
    <div>
      <h1 class="dict-title">Tiếng Anh Cô Dung — 📖 Ngân Hàng Từ Vựng &amp; Phonics</h1>
      <p class="dict-sub">Tra cứu từ vựng, phiên âm IPA, mô tả nguyên âm &amp; phụ âm theo chuẩn Cambridge và GDPT 2026.</p>
    </div>
    <button class="btn-primary" onclick={() => showAddModal = true}>
      + Thêm từ vựng mới
    </button>
  </div>

  <!-- Search & Filter Controls -->
  <div class="dict-controls">
    <div class="search-input-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        placeholder="Tìm kiếm từ tiếng Anh hoặc nghĩa tiếng Việt..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button class="btn-clear" onclick={() => searchQuery = ''}>✕</button>
      {/if}
    </div>

    <div class="unit-tabs">
      <button class="tab-btn" class:active={selectedUnit === 'all'} onclick={() => selectedUnit = 'all'}>
        Tất cả ({words.length})
      </button>
      {#each data.units as unit}
        <button class="tab-btn" class:active={selectedUnit === unit.id} onclick={() => selectedUnit = unit.id}>
          {unit.icon} {unit.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Words Cards Grid -->
  <div class="words-grid">
    {#each filteredWords as word}
      <div class="word-card">
        <div class="word-top">
          <div class="term-wrap">
            <strong class="word-term">{word.term}</strong>
            <span class="word-pos">{word.pos}</span>
            <span class="word-ipa">{word.ipa}</span>
          </div>
          <button class="btn-audio-circle" onclick={() => speakWord(word.term, 0.9)} title="Phát âm">
            🔊
          </button>
        </div>

        <div class="word-meaning">
          {word.meaning_vi}
        </div>

        {#if word.vowels_detail || word.consonants_detail}
          <div class="phonics-mini-box">
            {#if word.vowels_detail}
              <div class="phonics-item">
                <span class="p-dot yellow"></span>
                <span><strong>Nguyên âm:</strong> {word.vowels_detail}</span>
              </div>
            {/if}
            {#if word.consonants_detail}
              <div class="phonics-item">
                <span class="p-dot blue"></span>
                <span><strong>Phụ âm:</strong> {word.consonants_detail}</span>
              </div>
            {/if}
          </div>
        {/if}

        {#if word.example_en}
          <div class="word-example">
            <div class="example-line-en">"{word.example_en}"</div>
            <div class="example-line-vi">↳ {word.example_vi}</div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Add Word Modal -->
  {#if showAddModal}
    <div class="modal-overlay" onclick={() => showAddModal = false}>
      <div class="modal-card" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>Thêm Từ Vựng Vào Cơ Sở Dữ Liệu</h3>
          <button class="btn-close" onclick={() => showAddModal = false}>✕</button>
        </div>
        <form onsubmit={handleAddWord} class="modal-form">
          <div class="form-row">
            <div class="form-group">
              <label>Từ tiếng Anh (*):</label>
              <input type="text" required bind:value={newTerm} placeholder="VD: volunteer" />
            </div>
            <div class="form-group">
              <label>Phiên âm IPA:</label>
              <input type="text" bind:value={newIpa} placeholder="VD: /ˌvɒlənˈtɪə(r)/" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Từ loại:</label>
              <select bind:value={newPos}>
                <option value="noun">Danh từ (n)</option>
                <option value="verb">Động từ (v)</option>
                <option value="adjective">Tính từ (adj)</option>
                <option value="adverb">Trạng từ (adv)</option>
                <option value="verb phrase">Cụm động từ</option>
                <option value="noun phrase">Cụm danh từ</option>
              </select>
            </div>
            <div class="form-group">
              <label>Chủ điểm bài học:</label>
              <select bind:value={newUnit}>
                {#each data.units as u}
                  <option value={u.id}>{u.name}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="new-meaning">Nghĩa tiếng Việt (*):</label>
            <input id="new-meaning" type="text" required bind:value={newMeaning} placeholder="VD: làm tình nguyện, tình nguyện viên" />
          </div>

          <div class="form-group">
            <label for="new-ex-en">Câu ví dụ tiếng Anh:</label>
            <input id="new-ex-en" type="text" bind:value={newExampleEn} placeholder="VD: Students volunteer every weekend." />
          </div>

          <div class="form-group">
            <label for="new-ex-vi">Dịch câu ví dụ:</label>
            <input id="new-ex-vi" type="text" bind:value={newExampleVi} placeholder="VD: Học sinh đi làm tình nguyện vào mỗi cuối tuần." />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" onclick={() => showAddModal = false}>Hủy</button>
            <button type="submit" class="btn-primary">Lưu từ mới</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .dict-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .dict-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: white;
    padding: 24px;
    border-radius: var(--border-radius-lg);
    border: 1px solid var(--border-color);
  }

  .dict-title {
    font-size: 1.6rem;
    font-weight: 800;
    color: #0f172a;
  }

  .dict-sub {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .dict-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .search-input-box {
    display: flex;
    align-items: center;
    gap: 10px;
    background: white;
    padding: 12px 18px;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--border-color);
  }

  .search-input-box input {
    flex: 1;
    border: none;
    font-size: 1rem;
    outline: none;
  }

  .unit-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .tab-btn {
    padding: 8px 16px;
    background: white;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-sm);
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--text-muted);
    white-space: nowrap;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    background: var(--bg-surface);
  }

  .tab-btn.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  /* Grid */
  .words-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .word-card {
    background: white;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: all 0.15s;
  }

  .word-card:hover {
    box-shadow: var(--shadow-md);
    border-color: #cbd5e1;
  }

  .word-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .term-wrap {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .word-term {
    font-size: 1.25rem;
    color: #0f172a;
    font-weight: 800;
  }

  .word-pos {
    font-size: 0.75rem;
    background: #e0e7ff;
    color: #4338ca;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 700;
  }

  .word-ipa {
    font-family: monospace;
    font-size: 0.85rem;
    color: #64748b;
  }

  .btn-audio-circle {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #f0fdf4;
    color: #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }

  .btn-audio-circle:hover {
    background: #10b981;
    color: white;
  }

  .word-meaning {
    font-size: 0.95rem;
    font-weight: 700;
    color: #047857;
  }

  .phonics-mini-box {
    background: #f8fafc;
    border-radius: var(--border-radius-sm);
    padding: 8px 10px;
    font-size: 0.78rem;
    color: #475569;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .phonics-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .p-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .p-dot.yellow { background: #f59e0b; }
  .p-dot.blue { background: #3b82f6; }

  .word-example {
    font-size: 0.82rem;
    color: #334155;
    border-top: 1px dashed #e2e8f0;
    padding-top: 8px;
  }

  .example-line-en {
    font-style: italic;
    color: #0f172a;
    font-weight: 600;
  }

  .example-line-vi {
    color: var(--text-muted);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 20px;
  }

  .modal-card {
    background: white;
    width: 100%;
    max-width: 550px;
    border-radius: var(--border-radius-lg);
    padding: 24px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-group label {
    display: block;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 4px;
  }

  .form-group input, .form-group select {
    width: 100%;
    padding: 8px 12px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
    font-size: 0.9rem;
    outline: none;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
  }
</style>
