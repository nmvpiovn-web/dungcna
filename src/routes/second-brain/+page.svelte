<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getAuthToken, isTeacherOrAdmin, isSuperAdmin } from '$lib/unifiedStore';

  let currentUser = $state(null);
  let vaultNotes = $state([]);
  let vaultFolders = $state([]);
  let vaultVersion = $state('2.2.0');
  let isLoading = $state(true);
  let isForbidden = $state(false);
  let errorMessage = $state('');

  let searchQuery = $state('');
  let selectedFolder = $state('all');
  let selectedNoteId = $state('00_INDEX_MOC');
  let historyStack = $state(['00_INDEX_MOC']);
  let historyIndex = $state(0);
  let isMobileSidebarOpen = $state(false);
  let copiedPath = $state(false);

  const LOCAL_VAULT_PATH = 'c:\\Users\\admin\\.gemini\\antigravity\\scratch\\tienganh7-sveltekit\\obsidian_vault';

  async function loadVault() {
    currentUser = getCurrentUser();
    if (!currentUser || !isTeacherOrAdmin(currentUser)) {
      isForbidden = true;
      isLoading = false;
      vaultNotes = [];
      return;
    }

    const token = getAuthToken();
    if (!token) {
      isForbidden = true;
      isLoading = false;
      vaultNotes = [];
      return;
    }

    try {
      isLoading = true;
      const res = await fetch('/api/second-brain', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401 || res.status === 403) {
        isForbidden = true;
        isLoading = false;
        vaultNotes = [];
        return;
      }

      const data = await res.json();
      if (data.success) {
        vaultNotes = data.notes || [];
        vaultFolders = data.folders || [];
        vaultVersion = data.version || '2.5.0-D1';
        isForbidden = false;
        // Fetch detailed content for active note
        fetchNoteDetail(selectedNoteId);
      } else {
        errorMessage = data.error || 'Lỗi khi tải kho tri thức';
        isForbidden = true;
        vaultNotes = [];
      }
    } catch (err) {
      errorMessage = err.message || 'Lỗi kết nối';
      isForbidden = true;
      vaultNotes = [];
    } finally {
      isLoading = false;
    }
  }

  let isNoteLoading = $state(false);
  let isSearching = $state(false);
  let searchTimer = null;

  function onSearchChange(e) {
    searchQuery = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      fetchVaultList();
    }, 300);
  }

  function setFolder(folderId) {
    selectedFolder = folderId;
    fetchVaultList();
  }

  async function fetchVaultList() {
    const token = getAuthToken();
    if (!token) return;
    try {
      isSearching = true;
      let url = `/api/second-brain?limit=200`;
      const q = searchQuery.trim();
      if (q) url += `&q=${encodeURIComponent(q)}`;
      if (selectedFolder !== 'all') url += `&folder=${encodeURIComponent(selectedFolder)}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.notes)) {
        // Merge notes preserving already fetched full content
        vaultNotes = data.notes.map(n => {
          const cached = vaultNotes.find(c => c.id === n.id);
          return cached && cached.content ? { ...n, ...cached, snippet: n.snippet } : n;
        });
      }
    } catch (err) {
      console.error('Error querying vault from server:', err);
    } finally {
      isSearching = false;
    }
  }

  async function fetchNoteDetail(noteId) {
    if (!noteId) return;
    const existing = vaultNotes.find(n => n.id === noteId);
    if (existing && existing.content && existing.wikilinks && existing.backlinks) return;

    const token = getAuthToken();
    if (!token) return;

    try {
      isNoteLoading = true;
      const res = await fetch(`/api/second-brain?id=${encodeURIComponent(noteId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.note) {
        const found = vaultNotes.some(n => n.id === data.note.id);
        if (found) {
          vaultNotes = vaultNotes.map(n => n.id === data.note.id ? { ...n, ...data.note } : n);
        } else {
          // Prepend newly fetched note if it was outside initial list
          vaultNotes = [data.note, ...vaultNotes];
        }
      }
    } catch (e) {
      console.error('Failed to load note content:', e);
    } finally {
      isNoteLoading = false;
    }
  }

  onMount(() => {
    loadVault();
    const handleAuth = (e) => {
      currentUser = e.detail;
      loadVault();
    };
    window.addEventListener('tienganh:auth-change', handleAuth);
    return () => {
      window.removeEventListener('tienganh:auth-change', handleAuth);
    };
  });

  let folders = $derived.by(() => {
    if (vaultFolders.length > 0) return vaultFolders;
    return [
      { id: 'all', name: '📂 Toàn Bộ Tri Thức', count: vaultNotes.length },
      { id: 'Root', name: '🏠 Bản Đồ Tổng (MOC)', count: vaultNotes.filter(n => n.folder === 'Root').length },
      { id: '01_CURRICULUM_GDPT', name: '📚 01. Chương Trình GDPT', count: vaultNotes.filter(n => n.folder && n.folder.includes('01')).length },
      { id: '02_GRAMMAR_KNOWLEDGE_BASE', name: '📐 02. Chuyên Đề Ngữ Pháp', count: vaultNotes.filter(n => n.folder && n.folder.includes('02')).length },
      { id: '03_VOCABULARY_ATLAS', name: '🔤 03. Từ Vựng & Phonics', count: vaultNotes.filter(n => n.folder && n.folder.includes('03')).length },
      { id: '04_EXAMS_AND_QUESTION_BANK', name: '📝 04. Ngân Hàng Đề Thi', count: vaultNotes.filter(n => n.folder && n.folder.includes('04')).length },
      { id: '05_TEACHING_SOP_AND_PEDAGOGY', name: '👩‍🏫 05. Sư Phạm & SOP', count: vaultNotes.filter(n => n.folder && n.folder.includes('05')).length },
      { id: '06_CROSS_DISCIPLINARY_SYNAPSES', name: '⚡ 06. Mạng Nơ-ron & Synapses', count: vaultNotes.filter(n => n.folder && n.folder.includes('06')).length },
      { id: '07_GOOGLE_DRIVE_LIBRARY', name: '📄 07. Tài liệu Google Drive', count: vaultNotes.filter(n => n.folder === '07_GOOGLE_DRIVE_LIBRARY').length }
    ];
  });

  let filteredNotes = $derived.by(() => {
    return vaultNotes;
  });

  let currentNote = $derived.by(() => {
    if (vaultNotes.length === 0) return null;
    return vaultNotes.find(n => n.id === selectedNoteId || n.id.toLowerCase() === selectedNoteId.toLowerCase()) || vaultNotes[0];
  });

  let currentBacklinks = $derived.by(() => {
    if (!currentNote) return [];
    if (currentNote.backlinks && currentNote.backlinks.length > 0) {
      return currentNote.backlinks;
    }
    return vaultNotes.filter(n => 
      n.id !== currentNote.id && 
      Array.isArray(n.wikilinks) && n.wikilinks.some(wl => wl.target === currentNote.id || wl.target === currentNote.title)
    );
  });

  function selectNote(noteId, addToHistory = true) {
    selectedNoteId = noteId;
    isMobileSidebarOpen = false;
    fetchNoteDetail(noteId);
    if (addToHistory) {
      historyStack = [...historyStack.slice(0, historyIndex + 1), noteId];
      historyIndex = historyStack.length - 1;
    }
  }

  function goBack() {
    if (historyIndex > 0) {
      historyIndex--;
      selectedNoteId = historyStack[historyIndex];
      fetchNoteDetail(selectedNoteId);
    }
  }

  function goForward() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      selectedNoteId = historyStack[historyIndex];
      fetchNoteDetail(selectedNoteId);
    }
  }

  let currentNoteLocalFullPath = $derived.by(() => {
    if (!currentNote) return '';
    const sub = currentNote.folder === 'Root' ? '' : currentNote.folder + '\\';
    return `${LOCAL_VAULT_PATH}\\${sub}${currentNote.filename}`;
  });

  let obsidianUriByPath = $derived.by(() => {
    if (!currentNoteLocalFullPath) return '';
    return `obsidian://open?path=${encodeURIComponent(currentNoteLocalFullPath)}`;
  });

  let obsidianUriByVault = $derived.by(() => {
    if (!currentNote) return '';
    const rel = currentNote.folder === 'Root' ? currentNote.filename : `${currentNote.folder}/${currentNote.filename}`;
    return `obsidian://open?vault=obsidian_vault&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}`;
  });

  function copyAbsolutePath() {
    if (!currentNoteLocalFullPath) return;
    navigator.clipboard.writeText(currentNoteLocalFullPath);
    copiedPath = true;
    setTimeout(() => copiedPath = false, 2500);
  }

  // Parse markdown into formatted HTML with Callouts & WikiLinks
  function formatMarkdown(content) {
    if (!content) return '';

    let html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    // Restore only the Markdown quote marker used by the callout parser.
    html = html.replace(/^&gt;/gm, '>');

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

    // Imported images use generated, content-addressed local asset paths.
    html = html.replace(/!\[([^\]]*)\]\((?:\.\.\/|\/)?drive-media\/([a-f0-9]{24}\.(?:png|jpe?g|gif|webp))\)/g,
      '<img src="/drive-media/$2" alt="$1" loading="lazy" class="max-w-full h-auto rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 my-4" />');

    // 6. Process table/box lines
    html = html.replace(/^\|(.*)$/gim, (m, content) => {
      const trimmed = content.trim();
      if (!trimmed || trimmed === '---' || /^[-| :]+$/.test(trimmed)) return '';
      return `<div class="my-1.5 px-3.5 py-2 bg-slate-100/90 dark:bg-slate-800/60 rounded-lg border-l-4 border-teal-500 text-xs text-slate-800 dark:text-slate-200 shadow-xs font-mono">${trimmed}</div>`;
    });

    // 7. Process Paragraph breaks
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
              v{vaultVersion}
            </span>
          </div>
          <p class="text-xs text-teal-200/80">Lớp tri thức thứ hai • Bản đồ liên kết WikiLinks [[...]] chuẩn GDPT &amp; CEFR</p>
        </div>
      </div>

      <div class="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
        <!-- Direct Obsidian Local Vault Open Button -->
        <a
          href="obsidian://open?vault=obsidian_vault"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold shadow-md shadow-purple-900/30 transition-all hover:scale-[1.02]"
          title="Mở toàn bộ Vault trên ứng dụng Obsidian của máy tính"
        >
          <span>🟣</span> Mở Vault Obsidian Máy
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

  {#if isLoading}
    <div class="max-w-2xl mx-auto my-24 p-8 text-center space-y-4">
      <div class="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-sm font-bold text-slate-500 dark:text-slate-400">Đang nạp kho tri thức bảo mật từ server...</p>
    </div>
  {:else if isForbidden || !currentUser || !isTeacherOrAdmin(currentUser)}
    <!-- Restricted Access Warning for Students / Guests -->
    <div class="max-w-2xl mx-auto my-12 p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
      <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-3xl mx-auto border border-amber-500/30">
        🔒
      </div>
      <h2 class="text-xl font-black text-slate-900 dark:text-white">
        Khu Vực Tri Thức Nội Bộ (Obsidian Second Brain)
      </h2>
      <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
        Kho tài liệu và ma trận bài giảng chuyên sâu này dành riêng cho <strong>Ban Giám Hiệu (Cô Dung, SuperAdmin)</strong> và đội ngũ <strong>Giáo viên</strong>. Tài khoản học sinh của bạn chỉ được truy cập vào phần bài tập và lộ trình đào tạo chính quy.
      </p>
      <div class="pt-4 flex items-center justify-center gap-3">
        <a
          href="/"
          class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md"
        >
          Quay Về Trang Chủ Học Tập
        </a>
      </div>
    </div>
  {:else}
    <!-- Main Dual-Pane Workspace -->
    <div class="max-w-7xl mx-auto w-full flex-1 flex flex-col sm:flex-row p-4 sm:p-6 gap-6 relative">
    
    <!-- LEFT SIDEBAR: Index & Filter -->
    <aside class="w-full sm:w-80 md:w-96 flex-shrink-0 flex flex-col space-y-4 {isMobileSidebarOpen ? 'block' : 'hidden sm:flex'}">
      
      <!-- Search Input -->
      <div class="relative">
        <input
          type="text"
          value={searchQuery}
          oninput={onSearchChange}
          placeholder="Tìm khái niệm, ngữ pháp, đề thi (FTS5)..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl pl-10 pr-8 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 shadow-sm"
        />
        <span class="absolute left-3.5 top-2.5 text-sm text-slate-400">
          {#if isSearching}
            <span class="inline-block animate-spin">⏳</span>
          {:else}
            🔍
          {/if}
        </span>
        {#if searchQuery}
          <button
            onclick={() => { searchQuery = ''; fetchVaultList(); }}
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
            onclick={() => setFolder(f.id)}
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
                <span>{note.wikilinks ? note.wikilinks.length : 0} liên kết</span>
              </div>

              {#if note.snippet}
                <div class="text-[11px] text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2 bg-amber-500/10 dark:bg-amber-950/30 p-1.5 rounded-lg border border-amber-500/20 leading-relaxed font-mono">
                  {@html note.snippet}
                </div>
              {/if}

              {#if note.tags && note.tags.length > 0}
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

          <div class="flex items-center gap-2 flex-wrap">
            <span class="hidden sm:inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              WikiLinks
            </span>

            <!-- Direct Link to Open File in Obsidian -->
            <a
              href={obsidianUriByPath}
              class="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-sm transition-all hover:scale-105"
              title="Mở file markdown này trực tiếp trong phần mềm Obsidian trên máy tính"
            >
              <span>🟣</span> <span>Mở Trong Obsidian Local</span>
            </a>

            <!-- Copy Full Path Button -->
            <button
              type="button"
              onclick={copyAbsolutePath}
              class="px-2.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1"
              title="Sao chép đường dẫn tuyệt đối của file trên máy tính"
            >
              <span>{copiedPath ? '✓ Đã Copy Path' : '📋 Copy Path'}</span>
            </button>
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
  {/if}
</div>
