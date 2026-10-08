<script>
 // Modal đăng ký giáo viên mới — chuẩn form + validation inline.
 // Submit → POST /api/teachers/register (tạo teacher_profiles trong D1).
 let { isOpen = $bindable(false), onRegistered = () => {} } = $props();

 const SPECIALTY_OPTIONS = [
  { value: 'IELTS', label: 'IELTS' },
  { value: 'Cambridge', label: 'Cambridge (Starters / Movers / Flyers / KET / PET)' },
  { value: 'Giao tiếp', label: 'Giao tiếp' },
  { value: 'Ngữ pháp', label: 'Ngữ pháp' },
  { value: 'Thiếu nhi / Phonics', label: 'Thiếu nhi / Phonics' },
  { value: 'Ngữ âm', label: 'Ngữ âm' },
  { value: 'Luyện thi ĐH', label: 'Luyện thi ĐH' },
  { value: 'Khác', label: 'Khác' }
 ];

 const SALARY_TYPE_OPTIONS = [
  { value: 'monthly', label: 'Lương tháng (cố định)' },
  { value: 'per_session', label: 'Lương theo buổi dạy' }
 ];

 const ROLE_TYPE_OPTIONS = [
  { value: 'lead', label: 'Giáo viên chính / Lead' },
  { value: 'vietnamese', label: 'Giáo viên Việt Nam' },
  { value: 'native', label: 'Giáo viên bản ngữ' },
  { value: 'assistant', label: 'Trợ giảng' }
 ];

 const VN_PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;
 const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

 function emptyForm() {
 return {
 teacher_name: '',
 phone: '',
 email: '',
 specialty: 'IELTS',
 experience_years: '',
 base_salary_vnd: '',
 salary_type: 'per_session',
 role_type: 'vietnamese',
 role_title: 'Giáo viên',
 address: '',
 notes: ''
 };
 }

 let form = $state(emptyForm());
 let errors = $state({});
 let touched = $state({});
 let isSubmitting = $state(false);
 let submitError = $state('');
 let submitSuccess = $state('');
 let wasOpen = false;

 $effect(() => {
 if (isOpen) {
 if (!wasOpen) {
 wasOpen = true;
 form = emptyForm();
 errors = {};
 touched = {};
 isSubmitting = false;
 submitError = '';
 submitSuccess = '';
 }
 } else {
 wasOpen = false;
 }
 });

 function parseNumber(v) {
 if (v === '' || v === null || v === undefined) return null;
 const n = Number(String(v).replace(/[.,\s]/g, ''));
 return Number.isFinite(n) ? n : NaN;
 }

 function validateField(name) {
 const f = form;
 switch (name) {
 case 'teacher_name':
 if (!f.teacher_name.trim()) return 'Vui lòng nhập họ tên giáo viên';
 if (f.teacher_name.trim().length < 3) return 'Họ tên quá ngắn (tối thiểu 3 ký tự)';
 return '';
 case 'phone':
 if (!f.phone.trim()) return 'Vui lòng nhập số điện thoại';
 if (!VN_PHONE_RE.test(f.phone.trim())) return 'SĐT chưa đúng — cần 10 số, bắt đầu 03/05/07/08/09 (VD: 0912345678)';
 return '';
 case 'email':
 if (!f.email.trim()) return '';
 if (!EMAIL_RE.test(f.email.trim())) return 'Email chưa đúng định dạng (VD: gv@tienganhcodung.vn)';
 return '';
 case 'experience_years': {
 if (f.experience_years === '') return '';
 const n = parseNumber(f.experience_years);
 if (Number.isNaN(n)) return 'Số năm kinh nghiệm phải là số';
 if (n < 0 || n > 60) return 'Số năm kinh nghiệm không hợp lệ (0–60)';
 return '';
 }
 case 'base_salary_vnd': {
 if (f.base_salary_vnd === '') return 'Vui lòng nhập lương khởi điểm';
 const n = parseNumber(f.base_salary_vnd);
 if (Number.isNaN(n)) return 'Lương phải là số (VD: 8000000 hoặc 8.000.000)';
 if (n <= 0) return 'Lương phải lớn hơn 0';
 if (!Number.isSafeInteger(n)) return 'Lương vượt giới hạn cho phép';
 return '';
 }
 case 'address':
 if (f.address.trim().length > 300) return 'Địa chỉ quá dài (tối đa 300 ký tự)';
 return '';
 case 'notes':
 if (f.notes.trim().length > 1000) return 'Ghi chú quá dài (tối đa 1000 ký tự)';
 return '';
 default:
 return '';
 }
 }

 function validateAll() {
 const fields = ['teacher_name', 'phone', 'email', 'experience_years', 'base_salary_vnd', 'address', 'notes'];
 const next = {};
 for (const f of fields) {
 const msg = validateField(f);
 if (msg) next[f] = msg;
 }
 errors = next;
 return Object.keys(next).length === 0;
 }

 function blur(name) {
 touched = { ...touched, [name]: true };
 const msg = validateField(name);
 errors = { ...errors };
 if (msg) errors[name] = msg;
 else delete errors[name];
 }

 function fieldError(name) {
 return (touched[name] || isSubmitting) && errors[name] ? errors[name] : '';
 }

 const inputCls = (name) =>
 `w-full bg-slate-50 border rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none transition-colors ${
 fieldError(name) ? 'border-rose-400 focus:border-rose-500 bg-rose-50/50' : 'border-slate-200 focus:border-emerald-500'
 }`;

 async function handleSubmit() {
 touched = { teacher_name: true, phone: true, email: true, experience_years: true, base_salary_vnd: true, address: true, notes: true };
 submitError = '';
 submitSuccess = '';
 if (!validateAll()) return;

 isSubmitting = true;
 try {
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 const res = await fetch('/api/teachers/register', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(token ? { Authorization: `Bearer ${token}` } : {})
 },
 body: JSON.stringify({
 teacher_name: form.teacher_name.trim(),
 phone: form.phone.trim(),
 email: form.email.trim(),
 specialty: form.specialty,
 experience_years: form.experience_years === '' ? null : parseNumber(form.experience_years),
 base_salary_vnd: parseNumber(form.base_salary_vnd),
 salary_type: form.salary_type,
 role_type: form.role_type,
 role_title: form.role_title.trim() || 'Giáo viên',
 address: form.address.trim(),
 notes: form.notes.trim()
 })
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) {
 submitError = data.error || `Lỗi máy chủ (mã ${res.status})`;
 return;
 }
 submitSuccess = `Đã đăng ký giáo viên "${data.profile?.teacher_name || form.teacher_name}" (@${data.profile?.username || '—'}) thành công!`;
 try { onRegistered(data.profile); } catch {}
 setTimeout(() => { isOpen = false; }, 1600);
 } catch (err) {
 submitError = 'Lỗi kết nối: ' + (err.message || err);
 } finally {
 isSubmitting = false;
 }
 }

 function close() {
 if (!isSubmitting) isOpen = false;
 }
</script>

{#if isOpen}
 <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
 <div class="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 md:p-8 space-y-5 max-h-[90vh] overflow-y-auto">

 <!-- Header -->
 <div class="flex items-start justify-between border-b border-slate-100 pb-3">
 <div>
 <span class="text-xs font-bold text-emerald-600 uppercase tracking-wider">Tuyển dụng</span>
 <h2 class="text-xl font-black text-slate-900 mt-0.5">Đăng Ký Giáo Viên Mới 👩‍🏫</h2>
 <p class="text-xs text-slate-500 mt-1">Hồ sơ mới được tạo trong bảng <code class="font-mono">teacher_profiles</code>. Tài khoản đăng nhập cấp riêng ở tab Người dùng.</p>
 </div>
 <button type="button" onclick={close} class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center font-bold" aria-label="Đóng">✕</button>
 </div>

 {#if submitError}
 <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">⚠️ {submitError}</div>
 {/if}
 {#if submitSuccess}
 <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">✅ {submitSuccess}</div>
 {/if}

 <!-- Form -->
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-name">Họ tên <span class="text-rose-500">*</span></label>
 <input id="treg-name" type="text" bind:value={form.teacher_name} onblur={() => blur('teacher_name')} placeholder="VD: Nguyễn Thị Hương" class={inputCls('teacher_name')} />
 {#if fieldError('teacher_name')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('teacher_name')}</p>{/if}
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-phone">Số điện thoại <span class="text-rose-500">*</span></label>
 <input id="treg-phone" type="tel" inputmode="numeric" bind:value={form.phone} onblur={() => blur('phone')} placeholder="VD: 0912345678" class={inputCls('phone')} />
 {#if fieldError('phone')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('phone')}</p>{:else}<p class="mt-1 text-[11px] text-slate-400">10 số, đầu 03 / 05 / 07 / 08 / 09</p>{/if}
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-email">Email</label>
 <input id="treg-email" type="email" bind:value={form.email} onblur={() => blur('email')} placeholder="VD: gv@tienganhcodung.vn" class={inputCls('email')} />
 {#if fieldError('email')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('email')}</p>{/if}
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-specialty">Chuyên môn</label>
 <select id="treg-specialty" bind:value={form.specialty} class={inputCls('specialty')}>
 {#each SPECIALTY_OPTIONS as opt}
 <option value={opt.value}>{opt.label}</option>
 {/each}
 </select>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-exp">Kinh nghiệm (số năm)</label>
 <input id="treg-exp" type="number" min="0" max="60" step="1" bind:value={form.experience_years} onblur={() => blur('experience_years')} placeholder="VD: 3" class={inputCls('experience_years')} />
 {#if fieldError('experience_years')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('experience_years')}</p>{/if}
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-salarytype">Loại lương</label>
 <select id="treg-salarytype" bind:value={form.salary_type} class={inputCls('salary_type')}>
 {#each SALARY_TYPE_OPTIONS as opt}
 <option value={opt.value}>{opt.label}</option>
 {/each}
 </select>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-salary">
 {form.salary_type === 'monthly' ? 'Lương tháng khởi điểm (VND)' : 'Lương mỗi buổi dạy (VND)'} <span class="text-rose-500">*</span>
 </label>
 <input id="treg-salary" type="text" inputmode="numeric" bind:value={form.base_salary_vnd} onblur={() => blur('base_salary_vnd')} placeholder="VD: 8000000" class={inputCls('base_salary_vnd')} />
 {#if fieldError('base_salary_vnd')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('base_salary_vnd')}</p>{/if}
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-roletype">Loại vai trò</label>
 <select id="treg-roletype" bind:value={form.role_type} class={inputCls('role_type')}>
 {#each ROLE_TYPE_OPTIONS as opt}
 <option value={opt.value}>{opt.label}</option>
 {/each}
 </select>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-roletitle">Chức danh</label>
 <input id="treg-roletitle" type="text" bind:value={form.role_title} placeholder="VD: Giáo viên IELTS" class={inputCls('role_title')} />
 </div>

 <div class="sm:col-span-2">
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-address">Địa chỉ</label>
 <input id="treg-address" type="text" bind:value={form.address} onblur={() => blur('address')} placeholder="VD: 123 Phố Vọng, Hai Bà Trưng, Hà Nội" class={inputCls('address')} />
 {#if fieldError('address')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('address')}</p>{/if}
 </div>

 <div class="sm:col-span-2">
 <label class="block text-xs font-bold text-slate-700 mb-1" for="treg-notes">Ghi chú</label>
 <textarea id="treg-notes" rows="2" bind:value={form.notes} onblur={() => blur('notes')} placeholder="VD: Có thể dạy ca tối T2–T6, ưu tiên lớp IELTS" class={inputCls('notes')}></textarea>
 {#if fieldError('notes')}<p class="mt-1 text-[11px] text-rose-600 font-semibold">⚠ {fieldError('notes')}</p>{/if}
 </div>
 </div>

 <!-- Actions -->
 <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
 <button type="button" onclick={close} disabled={isSubmitting} class="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 disabled:opacity-50">
 Hủy
 </button>
 <button
 type="button"
 onclick={handleSubmit}
 disabled={isSubmitting}
 class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all disabled:opacity-60"
 >
 {isSubmitting ? '⏳ Đang lưu...' : '✅ Đăng Ký Giáo Viên'}
 </button>
 </div>
 </div>
 </div>
{/if}
