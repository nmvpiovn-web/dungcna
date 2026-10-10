<script>
  let {
    isOpen = $bindable(false),
    credential = { username: '', temp_password: '', candidate_name: '', user_id: '' },
    onClose = () => {}
  } = $props();

  let copiedUser = $state(false);
  let copiedPass = $state(false);
  let copiedAll = $state(false);
  let copyFeedback = $state('');

  async function copyToClipboard(text, type) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      if (type === 'username') {
        copiedUser = true;
        copyFeedback = 'Đã sao chép tên đăng nhập!';
        setTimeout(() => copiedUser = false, 2500);
      } else if (type === 'password') {
        copiedPass = true;
        copyFeedback = 'Đã sao chép mật khẩu tạm!';
        setTimeout(() => copiedPass = false, 2500);
      } else if (type === 'all') {
        copiedAll = true;
        copyFeedback = 'Đã sao chép toàn bộ thông tin đăng nhập!';
        setTimeout(() => copiedAll = false, 2500);
      }
    } catch (e) {
      copyFeedback = 'Không thể tự động sao chép: Hãy bôi đen và copy thủ công.';
    }
  }

  function handleClose() {
    isOpen = false;
    copyFeedback = '';
    copiedUser = false;
    copiedPass = false;
    copiedAll = false;
    onClose();
  }
</script>

{#if isOpen}
<div 
  class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
  role="dialog"
  aria-modal="true"
  aria-labelledby="cred-modal-title"
>
  <div 
    class="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-5 text-white my-auto max-h-[92vh] overflow-y-auto min-w-[320px]"
  >
    <!-- Modal Header -->
    <div class="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xl shrink-0">
          🔑
        </div>
        <div>
          <h2 id="cred-modal-title" class="text-base sm:text-lg font-black tracking-tight text-white">
            Tài Khoản Giáo Viên Đã Cấp
          </h2>
          <p class="text-xs text-slate-400">
            Thông tin mật khẩu dùng một lần (One-Time Credential)
          </p>
        </div>
      </div>
      <button 
        type="button" 
        onclick={handleClose}
        class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        aria-label="Đóng modal"
      >
        ✕
      </button>
    </div>

    <!-- Security Alert Box -->
    <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
      <div class="font-bold flex items-center gap-1.5">
        <span>⚠️</span>
        <span>Lưu ý quan trọng cho Quản trị viên:</span>
      </div>
      <p class="text-[11px] leading-relaxed text-amber-200/90">
        Mật khẩu tạm chỉ hiển thị <strong>DUY NHẤT một lần</strong> tại màn hình này và <strong>không được lưu trữ dạng thô</strong> trong hệ thống. Hãy sao chép và gửi trực tiếp cho giáo viên trước khi đóng hộp thoại.
      </p>
    </div>

    <!-- Candidate Info -->
    {#if credential.candidate_name}
    <div class="text-xs text-slate-300 flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
      <span class="text-slate-400">Giáo viên:</span>
      <span class="font-bold text-white">{credential.candidate_name}</span>
    </div>
    {/if}

    <!-- Credentials Display -->
    <div class="space-y-3">
      <!-- Username Field -->
      <div class="space-y-1">
        <label for="cred-username-val" class="block text-xs font-semibold text-slate-400">
          Tên đăng nhập (Username):
        </label>
        <div class="flex items-center gap-2">
          <input 
            id="cred-username-val"
            type="text" 
            readonly 
            value={credential.username}
            class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500 select-all"
          />
          <button 
            type="button"
            onclick={() => copyToClipboard(credential.username, 'username')}
            class="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 shrink-0"
            title="Sao chép username"
          >
            {copiedUser ? '✓ Đã chép' : 'Sao chép'}
          </button>
        </div>
      </div>

      <!-- Password Field -->
      <div class="space-y-1">
        <label for="cred-password-val" class="block text-xs font-semibold text-slate-400">
          Mật khẩu tạm thời (Temporary Password):
        </label>
        <div class="flex items-center gap-2">
          <input 
            id="cred-password-val"
            type="text" 
            readonly 
            value={credential.temp_password}
            class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-amber-400 font-bold tracking-wider focus:outline-none focus:border-amber-500 select-all"
          />
          <button 
            type="button"
            onclick={() => copyToClipboard(credential.temp_password, 'password')}
            class="px-3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shrink-0 shadow-md shadow-amber-600/20"
            title="Sao chép mật khẩu tạm"
          >
            {copiedPass ? '✓ Đã chép' : 'Sao chép'}
          </button>
        </div>
      </div>
    </div>

    <!-- Copy Status Notification -->
    {#if copyFeedback}
    <div class="text-center text-xs font-semibold text-emerald-400 animate-in fade-in duration-150">
      {copyFeedback}
    </div>
    {/if}

    <!-- Workflow Instructions -->
    <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed">
      <div class="font-bold text-slate-300">Quy trình bắt buộc tiếp theo:</div>
      <ol class="list-decimal list-inside space-y-0.5 pl-1">
        <li>Giáo viên sử dụng tài khoản trên để đăng nhập tại trang chủ hoặc cpanel.</li>
        <li>Hệ thống <strong>tự động chặn truy cập lịch dạy & tính lương</strong> và yêu cầu đổi mật khẩu lần đầu ngay lập tức.</li>
        <li>Sau khi đổi mật khẩu thành công, toàn quyền giáo viên sẽ tự động được kích hoạt.</li>
      </ol>
    </div>

    <!-- Actions Bar -->
    <div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-800">
      <button 
        type="button"
        onclick={handleClose}
        class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors text-center"
      >
        Đóng Hộp Thoại
      </button>

      <button 
        type="button"
        onclick={() => copyToClipboard(`Tài khoản Tiếng Anh Cô Dung:\nTên đăng nhập: ${credential.username}\nMật khẩu tạm: ${credential.temp_password}\n(Lưu ý: Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên)`, 'all')}
        class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all"
      >
        <span>📋</span>
        <span>{copiedAll ? '✓ Đã Sao Chép Toàn Bộ' : 'Sao Chép Cả Hai (Gửi GV)'}</span>
      </button>
    </div>
  </div>
</div>
{/if}
