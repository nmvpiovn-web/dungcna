<script>
  import { onMount } from 'svelte';
  import vaultData from '$lib/data/second_brain_vault.json';

  let searchQuery = $state('');
  let selectedFolder = $state('all');
  let selectedNoteId = $state('00_INDEX_MOC');
  let historyStack = $state(['00_INDEX_MOC']);
  let historyIndex = $state(0);
  let isMobileSidebarOpen = $state(false);

  const folders = [
    { id: 'all', name: '📂 Toàn Bộ Tri Thức', count: vaultData.notes.length },
    { id: 'Root', name: '🏠 Bản Đồ Tổng (MOC)', count: vaultData.notes.filter(n => n.folder === 'Root').length },
    { id: '01_CURRICULUM_GDPT', name: '📚 01. Chương Trình GDPT', count: vaultData.notes.filter(n => n.folder.includes('01')).length },
    { id: '02_GRAMMAR_KNOWLEDGE_BASE', name: '📐 02. Chuyên Đề Ngữ Pháp', count: vaultData.notes.filter(n => n.folder.includes('02')).length },
    { id: '03_VOCABULARY_ATLAS', name: '🔤 03. Từ Vựng & Phonics', count: vaultData.notes.filter(n => n.folder.includes('03')).length },
    { id: '04_EXAMS_AND_QUESTION_BANK', name: '📝 04. Ngân Hàng Đề Thi', count: vaultData.notes.filter(n => n.folder.includes('04')).length },
    { id: '05_TEACHING_SOP_AND_PEDAGOGY', name: '👩‍🏫 05. Sư Phạm & SOP', count: vaultData.notes.filter(n => n.folder.includes('05')).length },
    { id: '06_CROSS_DISCIPLINARY_SYNAPSES', name: '⚡ 06. Mạng Nơ-ron & Synapses', count: vaultData.notes.filter(n => n.folder.includes('06')).length }
  ];

  let filteredNotes = $derived.by(() => {
    let list = vaultData.notes;
    if (selectedFolder !== 'all') {
      list = list.filter(n => n.folder === selectedFolder || n.folder.includes(selectedFolder));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(n => 
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  });

  let currentNote = $derived.by(() => {
    return vaultData.notes.find(n => n.id === selectedNoteId || n.id.toLowerCase() === selectedNoteId.toLowerCase()) || vaultData.notes[0];
  });

  let currentBacklinks = $derived.by(() => {
    if (!currentNote) return [];
    return vaultData.notes.filter(n => 
      n.id !== currentNote.id && 
      n.wikilinks.some(wl => wl.target === currentNote.id || wl.target === currentNote.title)
    );
  });

  function selectNote(noteId, addToHistory = true) {
    selectedNoteId = noteId;
    isMobileSidebarOpen = false;
    if (addToHistory) {
      historyStack = [...historyStack.slice(0, historyIndex + 1), noteId];
      historyIndex = historyStack.length - 1;
    }
  }

  function goBack() {
    if (historyIndex > 0) {
      historyIndex--;
      selectedNoteId = historyStack[historyIndex];
    }
  }

  function goForward() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      selectedNoteId = historyStack[historyIndex];
    }
  }

  // Parse markdown into formatted HTML with Callouts & WikiLinks
  function formatMarkdown(content) {
    if (!content) return '';

    let html = content;

    // 1. Process Obsidian Callouts: > [!type] Title
    html = html.replace(/>\s*\[!(important|tip|note|abstract|warning|danger)\]\s*(.*?)\n((?:>.*(?:\n|$))*)/gi, (match, type, title, body) => {
      const cleanBody = body.replace(/^>\s?/gm, '').trim();
      const typeLower = type.toLowerCase();
      let borderClass = 'border-blue-500 bg-blue-500/10 text-blue-900 dark:text-blue-200';
      let icon = 'ℹ️';

      if (typeLower === 'important') {
        borderClass = 'border-purple-500 bg-purple-500/10 text-purple-900 dark:text-purple-200';
        icon = '⚡';
      } else if (typeLower === 'tip') {
        borderClass = 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200';
        icon = '💡';
      } else if (typeLower === 'abstract') {
        borderClass = 'border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200';
        icon = '🗺️';
      } else if (typeLower === 'warning' || typeLower === 'danger') {
        borderClass = 'border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-200';
        icon = '⚠️';
      }

      return `<div class="my-4 p-4 rounded-2xl border-l-4 ${borderClass} space-y-1.5 shadow-sm">
        <div class="font-bold flex items-center gap-2 text-xs uppercase tracking-wider">
          <span>${icon}</span> <span>${title || type.toUpperCase()}</span>
        </div>
        <div class="text-xs leading-relaxed opacity-95">${cleanBody}</div>
      </div>\n`;
    });

    // 2. Process WikiLinks: [[Target|Label]] or [[Target]]
    html = html.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
      const parts = inner.split('|');
      const target = parts[0].trim();
      const label = parts[1] ? parts[1].trim() : target;
      return `<button type="button" class="obsidian-wikilink text-emerald-600 dark:text-emerald-400 font-bold underline hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-0.5 cursor-pointer bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-lg border border-emerald-500/20 text-xs" data-target="${target}">🔗 ${label}</button>`;
    });

    // 3. Process Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-slate-900 dark:text-white mt-6 mb-2 flex items-center gap-2">📌 $1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-black text-slate-900 dark:text-white mt-8 mb-3 pb-1 border-b border-slate-200 dark:border-slate-800">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-black text-slate-900 dark:text-white mt-4 mb-4">$1</h1>');

    // 4. Process Lists & Bullets
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-slate-700 dark:text-slate-300 mb-1 leading-relaxed">$1</li>');

    // 5. Process Bold & Italics
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-slate-900 dark:text-white">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

    // 6. Process Paragraph breaks
    html = html.replace(/\n\n+/g, '<div class="h-3"></div>');

    return html;
  }

  function handleContentClick(e) {
    const btn = e.target.closest('.obsidian-wikilink');
    if (btn) {
      const target = btn.getAttribute('data-target');
      if (target) {
        selectNote(target);
      }
    }
  }
</script>

<svelte:head>
  <title>Second Brain Tri Thức - Tiếng Anh Cô Dung (Obsidian Knowledge Vault)</title>
  <meta name="description" content="Lớp tri thức thứ hai (Second Brain) chuẩn hóa 12 năm GDPT và CEFR quốc tế, liên kết đồ thị WikiLinks đa chiều." />
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 flex flex-col">
  <!-- Top Banner / Header -->
  <header class="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-950 text-white border-b border-teal-500/20 px-4 py-4 sm:px-6 shadow-md">
    <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-2xl shadow-inner shadow-teal-500/30">
          🧠
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-heading font-black text-white tracking-tight">Obsidian Second Brain</h1>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              v{vaultData.version}
            </span>
          </div>
          <p class="text-xs text-teal-200/80">Lớp tri thức thứ hai • Bản đồ liên kết WikiLinks [[...]] chuẩn GDPT &amp; CEFR</p>
        </div>
      </div>

      <div class="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
        <!-- Download Vault Zip -->
        <a
          href="/downloads/obsidian_second_brain_vault.zip"
          download
          class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-600/25 transition-all hover:scale-[1.02]"
          title="Tải trọn bộ folder để mở trực tiếp trong Obsidian"
        >
          <span>📥</span> Tải Trọn Bộ Vault (.zip)
        </a>

        <!-- Mobile Toggle Button -->
        <button
          type="button"
          onclick={() => isMobileSidebarOpen = !isMobileSidebarOpen}
          class="sm:hidden px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold"
        >
          {isMobileSidebarOpen ? '✕ Đóng mục lục' : '📂 Danh mục'}
        </button>
      </div>
    </div>
  </header>

  <!-- Main Dual-Pane Workspace -->
  <div class="max-w-7xl mx-auto w-full flex-1 flex flex-col sm:flex-row p-4 sm:p-6 gap-6 relative">
    
    <!-- LEFT SIDEBAR: Index & Filter -->
    <aside class="w-full sm:w-80 md:w-96 flex-shrink-0 flex flex-col space-y-4 {isMobileSidebarOpen ? 'block' : 'hidden sm:flex'}">
      
      <!-- Search Input -->
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Tìm khái niệm, ngữ pháp, đề thi..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl pl-10 pr-8 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 shadow-sm"
        />
        <span class="absolute left-3.5 top-2.5 text-sm text-slate-400">🔍</span>
        {#if searchQuery}
          <button
            onclick={() => searchQuery = ''}
            class="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        {/if}
      </div>

      <!-- Folder Pills -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {#each folders as f}
          <button
            type="button"
            onclick={() => selectedFolder = f.id}
            class="px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 border {selectedFolder === f.id ? 'bg-teal-600 text-white border-teal-500 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}"
          >
            <span>{f.name}</span>
            <span class="px-1.5 py-0.2 rounded-full text-[9px] {selectedFolder === f.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
              {f.count}
            </span>
          </button>
        {/each}
      </div>

      <!-- Notes List -->
      <div class="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-3 shadow-sm flex flex-col max-h-[68vh] overflow-y-auto space-y-2">
        <div class="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 px-2 py-1 flex items-center justify-between">
          <span>Ghi Chú ({filteredNotes.length})</span>
          <span>Vault: second_brain</span>
        </div>

        {#if filteredNotes.length === 0}
          <div class="p-6 text-center text-xs text-slate-500">
            Không tìm thấy ghi chú phù hợp với từ khóa "{searchQuery}"
          </div>
        {:else}
          {#each filteredNotes as note}
            <button
              type="button"
              onclick={() => selectNote(note.id)}
              class="w-full text-left p-3 rounded-2xl transition-all border {currentNote?.id === note.id ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-500 dark:border-teal-500 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/60'}"
            >
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-bold text-xs truncate text-slate-900 dark:text-white">
                  {note.title}
                </span>
                {#if note.folder === 'Root'}
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    HUB
                  </span>
                {/if}
              </div>

              <div class="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span class="truncate">📁 {note.folder}</span>
                <span>•</span>
                <span>{note.wikilinks.length} liên kết</span>
              </div>

              {#if note.tags.length > 0}
                <div class="flex items-center gap-1 mt-2 flex-wrap">
                  {#each note.tags.slice(0, 3) as tag}
                    <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {tag}
                    </span>
                  {/each}
                </div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

    </aside>

    <!-- RIGHT MAIN: Markdown Note Reader & Knowledge Connections -->
    <main class="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col min-w-0 max-h-[85vh] overflow-y-auto">
      {#if currentNote}
        <!-- Breadcrumb & History Navigation -->
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onclick={goBack}
              disabled={historyIndex === 0}
              class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
              title="Quay lại ghi chú trước"
            >
              ⬅️
            </button>
            <button
              type="button"
              onclick={goForward}
              disabled={historyIndex >= historyStack.length - 1}
              class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
              title="Tới ghi chú sau"
            >
              ➡️
            </button>
            <span>📁 second_brain / {currentNote.folder} / {currentNote.filename}</span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              WikiLinks Active
            </span>
          </div>
        </div>

        <!-- Note Tags & Metadata -->
        {#if currentNote.tags.length > 0}
          <div class="flex items-center gap-1.5 flex-wrap mb-4">
            {#each currentNote.tags as tag}
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                {tag}
              </span>
            {/each}
          </div>
        {/if}

        <!-- Rendered Note Content with Interactive Click delegation -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <article
          onclick={handleContentClick}
          class="prose prose-slate dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed"
        >
          {@html formatMarkdown(currentNote.content)}
        </article>

        <!-- BI-DIRECTIONAL CONNECTIONS & KNOWLEDGE GRAPH ATTACHMENTS -->
        <div class="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <span>🕸️</span> Mạng Lưới Liên Kết 2 Chiều (Bi-directional Graph)
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Outgoing Links -->
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>🔗 Liên Kết Trỏ Tới ({currentNote.wikilinks.length})</span>
                <span class="text-[9px] text-slate-400">Outgoing</span>
              </div>
              {#if currentNote.wikilinks.length === 0}
                <div class="text-[11px] text-slate-400 italic">Không có liên kết ngoại vi nào.</div>
              {:else}
                <div class="flex flex-wrap gap-1.5">
                  {#each currentNote.wikilinks as wl}
                    <button
                      type="button"
                      onclick={() => selectNote(wl.target)}
                      class="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500 text-[11px] font-semibold text-slate-700 dark:text-slate-300 transition-all hover:scale-[1.02]"
                    >
                      {wl.label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Backlinks -->
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>↩️ Được Trích Dẫn Từ ({currentBacklinks.length})</span>
                <span class="text-[9px] text-slate-400">Backlinks</span>
              </div>
              {#if currentBacklinks.length === 0}
                <div class="text-[11px] text-slate-400 italic">Chưa có ghi chú nào khác trích dẫn node này.</div>
              {:else}
                <div class="flex flex-wrap gap-1.5">
                  {#each currentBacklinks as bl}
                    <button
                      type="button"
                      onclick={() => selectNote(bl.id)}
                      class="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500 text-[11px] font-semibold text-teal-700 dark:text-teal-300 transition-all hover:scale-[1.02]"
                    >
                      {bl.title}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="text-center py-12 text-slate-500 text-xs">
          Vui lòng chọn một ghi chú từ danh mục bên trái.
        </div>
      {/if}
    </main>

  </div>
</div>
