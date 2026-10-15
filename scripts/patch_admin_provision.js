import fs from 'fs';

const file = 'src/routes/admin/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Add import
const importTarget = "import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';";
const importReplace = "import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';\n\timport ProvisionCredentialModal from '$lib/components/ProvisionCredentialModal.svelte';";
if (!content.includes(importTarget)) {
  console.error('import target not found');
  process.exit(1);
}
content = content.replace(importTarget, importReplace);

// 2. Add state
const stateTarget = "let editingStaffProfile = $state(null);";
const stateReplace = "let editingStaffProfile = $state(null);\n\tlet showProvisionModal = $state(false);\n\tlet provisionedCredential = $state({ username: '', temp_password: '', candidate_name: '', user_id: '' });";
content = content.replace(stateTarget, stateReplace);

// 3. Update handleProvisionAccount
const fnIdx = content.indexOf('async function handleProvisionAccount(recId)');
if (fnIdx === -1) {
  console.error('handleProvisionAccount fn not found');
  process.exit(1);
}
const fnEnd = content.indexOf('function loadData()', fnIdx);
if (fnEnd === -1) {
  console.error('loadData fn not found');
  process.exit(1);
}

const newHandler = `\tasync function handleProvisionAccount(recId, candidateName = '') {
\t\tconst token = localStorage.getItem('tienganh_token');
\t\tif (!token) return;
\t\tif (!confirm('Cấp tài khoản giáo viên từ hồ sơ này? Hệ thống sẽ tạo user (role=teacher) + teacher_profiles.')) return;
\t\ttry {
\t\t\tconst res = await fetch('/api/teachers/workflows', {
\t\t\t\tmethod: 'POST',
\t\t\t\theaders: {
\t\t\t\t\t'Content-Type': 'application/json',
\t\t\t\t\t'Authorization': \`Bearer \${token}\`
\t\t\t\t},
\t\t\t\tbody: JSON.stringify({ action: 'provision_account', recruitment_id: recId })
\t\t\t});
\t\t\tconst data = await res.json();
\t\t\tif (data.success) {
\t\t\t\tprovisionedCredential = {
\t\t\t\t\tusername: data.username || '',
\t\t\t\t\ttemp_password: data.temp_password || '',
\t\t\t\t\tcandidate_name: candidateName,
\t\t\t\t\tuser_id: data.user_id || ''
\t\t\t\t};
\t\t\t\tshowProvisionModal = true;
\t\t\t\tshowToast(\`✅ Đã cấp tài khoản: \${data.username || ''}\`);
\t\t\t\tloadAdminWorkflows();
\t\t\t} else {
\t\t\t\tshowToast('Lỗi: ' + data.error);
\t\t\t}
\t\t} catch (e) {
\t\t\tshowToast('Lỗi kết nối: ' + e.message);
\t\t}
\t}`;

content = content.slice(0, fnIdx) + newHandler.trim() + '\n\n\t' + content.slice(fnEnd);

// 4. Update button onclick
content = content.replace(
  'handleProvisionAccount(rec.id)',
  'handleProvisionAccount(rec.id, rec.candidate_name)'
);

// 5. Add Modal before the very last </div>
const modalMarkup = `
\t<!-- MODAL: One-Time Teacher Credential Dialog -->
\t<ProvisionCredentialModal
\t\tbind:isOpen={showProvisionModal}
\t\tcredential={provisionedCredential}
\t\tonClose={() => { provisionedCredential = { username: '', temp_password: '', candidate_name: '', user_id: '' }; }}
\t/>
`;

const lastDivIdx = content.lastIndexOf('</div>');
content = content.slice(0, lastDivIdx) + modalMarkup + content.slice(lastDivIdx);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched src/routes/admin/+page.svelte');
