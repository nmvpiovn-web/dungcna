import fs from 'fs';

const file = 'src/routes/cpanel/leader/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Add import ProvisionCredentialModal
const importTarget = "import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';";
const importReplace = "import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';\n\timport ProvisionCredentialModal from '$lib/components/ProvisionCredentialModal.svelte';";
if (!content.includes(importTarget)) {
  console.error('import target not found');
  process.exit(1);
}
content = content.replace(importTarget, importReplace);

// 2. Add state
const stateTarget = "let trialFeedback = $state('');";
const stateReplace = "let trialFeedback = $state('');\n\tlet showProvisionModal = $state(false);\n\tlet provisionedCredential = $state({ username: '', temp_password: '', candidate_name: '', user_id: '' });";
content = content.replace(stateTarget, stateReplace);

// 3. Add handleProvisionCandidateAccount function
const funcTarget = "async function saveCandidateUpdates() {";
const newFunc = `\tasync function handleProvisionCandidate(cand) {
\t\tif (!cand || isProcessing) return;
\t\tif (!confirm(\`Cấp tài khoản giáo viên cho ứng viên "\${cand.candidate_name}"? Hệ thống sẽ tạo tài khoản teacher và bắt buộc đổi mật khẩu lần đầu.\`)) return;
\t\tisProcessing = true;
\t\ttry {
\t\t\tconst token = localStorage.getItem('tienganh_token') || getAuthToken() || '';
\t\t\tconst res = await fetch('/api/teachers/workflows', {
\t\t\t\tmethod: 'POST',
\t\t\t\theaders: {
\t\t\t\t\t'Content-Type': 'application/json',
\t\t\t\t\t'Authorization': \`Bearer \${token}\`
\t\t\t\t},
\t\t\t\tbody: JSON.stringify({ action: 'provision_account', recruitment_id: cand.id })
\t\t\t});
\t\t\tconst data = await res.json();
\t\t\tif (data.success) {
\t\t\t\tprovisionedCredential = {
\t\t\t\t\tusername: data.username || '',
\t\t\t\t\ttemp_password: data.temp_password || '',
\t\t\t\t\tcandidate_name: cand.candidate_name,
\t\t\t\t\tuser_id: data.user_id || ''
\t\t\t\t};
\t\t\t\tshowProvisionModal = true;
\t\t\t\tshowInterviewModal = false;
\t\t\t\tshowMessage(\`✅ Đã cấp tài khoản giáo viên: \${data.username || ''}\`);
\t\t\t\tloadData();
\t\t\t} else {
\t\t\t\tshowMessage('Lỗi cấp tài khoản: ' + data.error, false);
\t\t\t}
\t\t} catch (e) {
\t\t\tshowMessage('Lỗi kết nối: ' + e.message, false);
\t\t} finally {
\t\t\tisProcessing = false;
\t\t}
\t}

\tasync function saveCandidateUpdates() {`;

content = content.replace(funcTarget, newFunc);

// 4. In recruitment card, if status === 'accepted', show "🔑 Cấp Tài Khoản" button
const cardBtnTarget = `\t\t\t\t\t\t<div>
\t\t\t\t\t\t\t<button 
\t\t\t\t\t\t\t\tonclick={() => openInterviewModal(cand)}
\t\t\t\t\t\t\t\tclass="px-4 py-2 rounded-md text-xs font-semibold bg-cx-600 hover:bg-cx-700 text-white transition-colors"
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\tXử Lý Hồ Sơ / Phỏng Vấn
\t\t\t\t\t\t\t</button>
\t\t\t\t\t\t</div>`;

// Fuzzy replace card button block
const openModalStr = "onclick={() => openInterviewModal(cand)}";
const openModalIdx = content.indexOf(openModalStr);
if (openModalIdx === -1) {
  console.error('openModalStr not found');
  process.exit(1);
}

// In candidate card actions
const cardDivStart = content.lastIndexOf('<div', openModalIdx);
const cardDivEnd = content.indexOf('</div>', openModalIdx) + 6;

const newCardActions = `\t\t\t\t\t\t<div class="flex items-center gap-2">
\t\t\t\t\t\t\t{#if cand.status === 'accepted'}
\t\t\t\t\t\t\t\t<button 
\t\t\t\t\t\t\t\t\tonclick={() => handleProvisionCandidate(cand)}
\t\t\t\t\t\t\t\t\tdisabled={isProcessing}
\t\t\t\t\t\t\t\t\tclass="px-3.5 py-2 rounded-md text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-colors"
\t\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t\t🔑 Cấp Tài Khoản GV
\t\t\t\t\t\t\t\t</button>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t<button 
\t\t\t\t\t\t\t\tonclick={() => openInterviewModal(cand)}
\t\t\t\t\t\t\t\tclass="px-4 py-2 rounded-md text-xs font-semibold bg-cx-600 hover:bg-cx-700 text-white transition-colors"
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\tXử Lý Hồ Sơ / Phỏng Vấn
\t\t\t\t\t\t\t</button>
\t\t\t\t\t\t</div>`;

content = content.slice(0, cardDivStart) + newCardActions + content.slice(cardDivEnd);

// 5. In Interview Modal footer, also offer provision button if accepted
const modalFooterTarget = `<button onclick={() => showInterviewModal = false} class="px-4 py-2 rounded-md font-medium text-slate-600 hover:bg-slate-100">Đóng</button>`;
const newModalFooter = `{#if candidateStatus === 'accepted' || selectedCandidate?.status === 'accepted'}
\t\t\t\t<button 
\t\t\t\t\ttype="button"
\t\t\t\t\tonclick={() => handleProvisionCandidate(selectedCandidate)}
\t\t\t\t\tdisabled={isProcessing}
\t\t\t\t\tclass="px-4 py-2 rounded-md font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-colors mr-auto"
\t\t\t\t>
\t\t\t\t\t🔑 Cấp Tài Khoản Ngay
\t\t\t\t</button>
\t\t\t{/if}
\t\t\t<button onclick={() => showInterviewModal = false} class="px-4 py-2 rounded-md font-medium text-slate-600 hover:bg-slate-100">Đóng</button>`;

content = content.replace(modalFooterTarget, newModalFooter);

// 6. Add ProvisionCredentialModal at bottom
const modalMarkup = `
<!-- MODAL: One-Time Teacher Credential Dialog -->
<ProvisionCredentialModal
\tbind:isOpen={showProvisionModal}
\tcredential={provisionedCredential}
\tonClose={() => { provisionedCredential = { username: '', temp_password: '', candidate_name: '', user_id: '' }; }}
/>
`;

content = content + modalMarkup;

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched src/routes/cpanel/leader/+page.svelte');
