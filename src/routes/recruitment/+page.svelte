<svelte:head>
  <title>Tuyển Dụng Giáo Viên Tiếng Anh • Tiếng Anh Cô Dung</title>
  <meta name="description" content="Cổng thông tin tuyển dụng giáo viên cơ hữu và thời vụ dạy thay tại Tiếng Anh Cô Dung Thủ Đức." />
</svelte:head>

<script>
  import { onMount, onDestroy } from 'svelte';
  import { playAudioFeedback } from '$lib/speech';

  let candidateName = $state('');
  let phone = $state('');
  let email = $state('');
  let roleType = $state('lead'); // 'lead' (cơ hữu) | 'contractor' (thời vụ/dạy thay) | 'assistant'
  let experienceYears = $state(2);
  let certificates = $state('IELTS 7.5, Cử nhân Sư Phạm Tiếng Anh');
  let cvLink = $state('');
  let availability = $state('Tối thứ 2, 4, 6 (17:30 - 21:00)');
  let interviewPreference = $state('online'); // 'online' | 'in_person'
  let selectedGrades = $state(['Lớp 6', 'Lớp 7']);
  let selectedSubjects = $state(['Ngữ Pháp & Luyện Thi']);
  let notes = $state('');

  const allAvailableGrades = [
    'Lớp 3', 'Lớp 4', 'Lớp 5',
    'Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9',
    'Lớp 10', 'Lớp 11', 'Lớp 12',
    'IELTS Academic', 'Tiếng Anh Giao Tiếp'
  ];

  const allAvailableSubjects = [
    'Ngữ Pháp & Luyện Thi',
    'Phát Âm Chuẩn Phonics',
    '4 Kỹ Năng IELTS',
    'Luyện Thi Vào 10 Chuyên',
    'Tiếng Anh Tiểu Học Khởi Động'
  ];

  let isSubmitting = $state(false);
  let submitSuccess = $state(false);
  let errorMessage = $state('');

  function markFormDirty() {
    if (typeof window !== 'undefined') {
      window.__hasUnsavedChanges = true;
      window.registerBusyState?.('dirty_form_recruitment');
      const formEl = document.querySelector('form');
      if (formEl) formEl.classList.add('dirty');
    }
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.__hasUnsavedChanges = false;
      window.unregisterBusyState?.('dirty_form_recruitment');
    }
  });

  onMount(() => {
    try {
      const saved = localStorage.getItem('tienganh_recruitment_draft');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.candidateName) candidateName = d.candidateName;
        if (d.phone) phone = d.phone;
        if (d.email) email = d.email;
        if (d.roleType) roleType = d.roleType;
        if (d.experienceYears !== undefined) experienceYears = d.experienceYears;
        if (d.certificates) certificates = d.certificates;
        if (d.cvLink) cvLink = d.cvLink;
        if (d.availability) availability = d.availability;
        if (d.interviewPreference) interviewPreference = d.interviewPreference;
        if (Array.isArray(d.selectedGrades) && d.selectedGrades.length) selectedGrades = d.selectedGrades;
        if (Array.isArray(d.selectedSubjects) && d.selectedSubjects.length) selectedSubjects = d.selectedSubjects;
        if (d.notes) notes = d.notes;
      }
    } catch {}
  });

  function saveDraft() {
    markFormDirty();
    try {
      localStorage.setItem('tienganh_recruitment_draft', JSON.stringify({
        candidateName,
        phone,
        email,
        roleType,
        experienceYears,
        certificates,
        cvLink,
        availability,
        interviewPreference,
        selectedGrades,
        selectedSubjects,
        notes
      }));
    } catch {}
  }

  function toggleGrade(grade) {
    if (selectedGrades.includes(grade)) {
      if (selectedGrades.length > 1) {
        selectedGrades = selectedGrades.filter(g => g !== grade);
      }
    } else {
      selectedGrades = [...selectedGrades, grade];
    }
    saveDraft();
  }

  function toggleSubject(subj) {
    if (selectedSubjects.includes(subj)) {
      if (selectedSubjects.length > 1) {
        selectedSubjects = selectedSubjects.filter(s => s !== subj);
      }
    } else {
      selectedSubjects = [...selectedSubjects, subj];
    }
    saveDraft();
  }

  async function handleApply(e) {
    e.preventDefault();
    if (!candidateName.trim() || !phone.trim()) {
      errorMessage = 'Vui lòng điền họ tên và số điện thoại liên hệ.';
      return;
    }
    if (selectedGrades.length === 0) {
      errorMessage = 'Vui lòng chọn ít nhất một khối lớp có thể phụ trách giảng dạy.';
      return;
    }

    isSubmitting = true;
    errorMessage = '';

    try {
      const combinedNotes = [
        notes.trim(),
        `Khối lớp đăng ký dạy: ${selectedGrades.join(', ')}`,
        `Chuyên môn đăng ký: ${selectedSubjects.join(', ')}`,
        `Hình thức phỏng vấn mong muốn: ${interviewPreference === 'online' ? 'Trực tuyến (Zoom/Google Meet)' : 'Trực tiếp tại cơ sở'}`,
        cvLink.trim() ? `Link CV: ${cvLink.trim()}` : null,
        availability.trim() ? `Lịch rảnh có thể dạy: ${availability.trim()}` : null
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/teachers/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'candidate_apply',
          candidate_name: candidateName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          role_type: roleType,
          experience_years: Number(experienceYears) || 0,
          certificates: certificates.trim(),
          selected_grades: selectedGrades,
          selected_subjects: selectedSubjects,
          interview_preference: interviewPreference,
          availability: availability.trim(),
          cv_link: cvLink.trim(),
          notes: combinedNotes
        })
      });

      const data = await res.json();
      if (data.success) {
        submitSuccess = true;
        if (typeof window !== 'undefined') {
          window.__hasUnsavedChanges = false;
          window.unregisterBusyState?.('dirty_form_recruitment');
          const formEl = document.querySelector('form');
          if (formEl) formEl.classList.remove('dirty');
        }
        try { localStorage.removeItem('tienganh_recruitment_draft'); } catch {}
        playAudioFeedback(true);
      } else {
        errorMessage = data.error || 'Nộp hồ sơ thất bại. Vui lòng thử lại.';
      }
    } catch (err) {
      errorMessage = 'Lỗi kết nối máy chủ: ' + err.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="max-w-3xl mx-auto py-8 px-4 space-y-6">
  <!-- Header Banner (Academic Ledger Style) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-100 shadow-sm space-y-2">
    <div class="text-xs font-semibold text-sky-400 uppercase tracking-wider">
      Cổng Tuyển Dụng Sư Phạm • Tiếng Anh Cô Dung
    </div>
    <h1 class="text-2xl font-semibold text-white">Gia Nhập Đội Ngũ Giáo Viên Tiếng Anh</h1>
    <p class="text-slate-300 text-sm leading-relaxed max-w-2xl">
      Chúng tôi tìm kiếm các Thầy/Cô có chuyên môn vững vàng, phát âm chuẩn quốc tế và đam mê truyền cảm hứng cho học sinh từ Lớp 3 đến Lớp 12 tại cụm trường Đào Sơn Tây - Thủ Đức.
    </p>
  </header>

  {#if submitSuccess}
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-4 shadow-sm">
      <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
        ✓
      </div>
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Nộp Hồ Sơ Ứng Tuyển Thành Công!</h2>
      <p class="text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
        Cảm ơn Thầy/Cô <strong>{candidateName}</strong> đã quan tâm. Ban Điều Hành Tiếng Anh Cô Dung sẽ thẩm định hồ sơ chuyên môn và liên hệ qua số điện thoại <strong>{phone}</strong> để xếp lịch phỏng vấn và buổi dạy thử (demo teaching) trong vòng 48 giờ làm việc.
      </p>
      <div class="p-3 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 max-w-md mx-auto">
        🔒 Trạng thái hồ sơ: <strong>100% Chờ Duyệt (Pending)</strong>. Hồ sơ không tự cấp quyền giáo viên hoặc tài khoản nội bộ cho đến khi Ban Quản Trị thẩm định và phê duyệt chính thức.
      </div>
      <div class="pt-2">
        <a href="/" class="px-5 py-2.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors">
          Trở Về Trang Chủ
        </a>
      </div>
    </div>
  {:else}
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-6">
      <div class="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">Phiếu Đăng Ký Ứng Tuyển Sư Phạm</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Hồ sơ được tự động lưu bản nháp trên trình duyệt để tránh mất dữ liệu khi làm mới trang.</p>
      </div>

      {#if errorMessage}
        <div class="p-3 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {errorMessage}
        </div>
      {/if}

      <form onsubmit={handleApply} class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-name" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Họ và tên (*):</label>
            <input 
              id="cand-name"
              type="text" 
              required
              bind:value={candidateName}
              oninput={saveDraft}
              placeholder="VD: Nguyễn Văn Anh"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
          <div>
            <label for="cand-phone" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số điện thoại / Zalo (*):</label>
            <input 
              id="cand-phone"
              type="tel" 
              required
              bind:value={phone}
              oninput={saveDraft}
              placeholder="VD: 0912345678"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium tabular-nums"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-email" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email liên hệ:</label>
            <input 
              id="cand-email"
              type="email" 
              bind:value={email}
              oninput={saveDraft}
              placeholder="VD: gv.tienganh@gmail.com"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
          <div>
            <label for="cand-role" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hình thức hợp đồng:</label>
            <select 
              id="cand-role"
              bind:value={roleType}
              onchange={saveDraft}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
            >
              <option value="lead">Giáo Viên Cơ Hữu (Permanent / Biên Chế)</option>
              <option value="contractor">Giáo Viên Thời Vụ / Nhận Ca Dạy Thay (Contractor)</option>
              <option value="assistant">Trợ Giảng Sư Phạm (Teaching Assistant)</option>
            </select>
          </div>
        </div>

        <!-- Multi-Grade Checkbox Selection (REG requirement) -->
        <div class="space-y-1.5 pt-1">
          <span class="block font-semibold text-slate-700 dark:text-slate-300">
            Khối lớp Thầy/Cô có thể nhận dạy (Chọn nhiều khối) (*):
          </span>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {#each allAvailableGrades as gr}
              {@const isChecked = selectedGrades.includes(gr)}
              <button
                type="button"
                onclick={() => toggleGrade(gr)}
                class="flex items-center gap-2 p-2 rounded-md border text-left transition-colors {isChecked ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600 text-sky-800 dark:text-sky-200 font-semibold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700'}"
              >
                <span>{isChecked ? '☑' : '☐'}</span>
                <span>{gr}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Subject/Chuyên Môn Selection -->
        <div class="space-y-1.5 pt-1">
          <span class="block font-semibold text-slate-700 dark:text-slate-300">
            Lĩnh vực chuyên môn giảng dạy thế mạnh:
          </span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {#each allAvailableSubjects as subj}
              {@const isChecked = selectedSubjects.includes(subj)}
              <button
                type="button"
                onclick={() => toggleSubject(subj)}
                class="flex items-center gap-2 p-2 rounded-md border text-left transition-colors {isChecked ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 font-semibold' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700'}"
              >
                <span>{isChecked ? '☑' : '☐'}</span>
                <span>{subj}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-exp" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số năm kinh nghiệm giảng dạy:</label>
            <input 
              id="cand-exp"
              type="number" 
              min="0"
              max="40"
              bind:value={experienceYears}
              oninput={saveDraft}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold tabular-nums"
            />
          </div>
          <div>
            <label for="cand-certs" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Chứng chỉ chuyên môn (IELTS/TESOL/Cử nhân):</label>
            <input 
              id="cand-certs"
              type="text" 
              bind:value={certificates}
              oninput={saveDraft}
              placeholder="VD: IELTS 7.5, TESOL 120h, ĐH Sư Phạm TP.HCM"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-interview" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hình thức phỏng vấn mong muốn:</label>
            <select 
              id="cand-interview"
              bind:value={interviewPreference}
              onchange={saveDraft}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
            >
              <option value="online">Phỏng vấn Trực Tuyến (Online Google Meet / Zoom)</option>
              <option value="in_person">Phỏng vấn Trực Tiếp tại Cơ Sở (Thủ Đức)</option>
            </select>
          </div>
          <div>
            <label for="cand-avail" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Lịch rảnh có thể nhận lớp (Availability):</label>
            <input 
              id="cand-avail"
              type="text" 
              bind:value={availability}
              oninput={saveDraft}
              placeholder="VD: Tối 2-4-6 từ 17h30, hoặc Sáng T7-CN"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
        </div>

        <div>
          <label for="cand-cv" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Đường dẫn CV / Hồ sơ năng lực (Google Drive / Dropbox):</label>
          <input 
            id="cand-cv"
            type="url" 
            bind:value={cvLink}
            oninput={saveDraft}
            placeholder="https://drive.google.com/file/d/..."
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
          />
        </div>

        <div>
          <label for="cand-notes-input" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Giới thiệu ngắn gọn về thế mạnh & phương pháp giảng dạy:</label>
          <textarea 
            id="cand-notes-input"
            bind:value={notes}
            oninput={saveDraft}
            rows="3"
            placeholder="Phương pháp rèn phát âm, luyện thi học sinh giỏi, thế mạnh ngữ pháp..."
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
          ></textarea>
        </div>

        <div class="pt-3 flex items-center justify-between">
          <span class="text-[11px] text-slate-500">
            Hồ sơ được gửi trực tiếp đến Leader Cô Dung để xét duyệt.
          </span>
          <button 
            type="submit"
            disabled={isSubmitting}
            class="px-6 py-2.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSubmitting ? 'Đang gửi hồ sơ...' : 'Nộp Hồ Sơ Ứng Tuyển Giáo Viên'}
          </button>
        </div>
      </form>
    </div>
  {/if}
</div>
