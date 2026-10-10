import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MODAL-01: ProvisionCredentialModal exists and implements accessibility and one-time password safeguards', () => {
  const filePath = 'src/lib/components/ProvisionCredentialModal.svelte';
  assert.equal(fs.existsSync(filePath), true, 'ProvisionCredentialModal.svelte must exist');

  const content = fs.readFileSync(filePath, 'utf8');

  // Must have dialog accessibility roles
  assert.match(content, /role="dialog"/, 'Modal must have role="dialog"');
  assert.match(content, /aria-modal="true"/, 'Modal must have aria-modal="true"');
  assert.match(content, /aria-labelledby/, 'Modal must have aria-labelledby');

  // Must have copy button functionality
  assert.match(content, /copyToClipboard/, 'Modal must implement clipboard copying');
  assert.match(content, /navigator\.clipboard/, 'Modal must support clipboard API');

  // Must NOT persist password to localStorage or sessionStorage
  assert.doesNotMatch(content, /localStorage\.setItem.*password/i, 'Modal must NEVER store password in localStorage');
  assert.doesNotMatch(content, /sessionStorage\.setItem.*password/i, 'Modal must NEVER store password in sessionStorage');

  // Must enforce confirmation of credential saving before closing (cannot close immediately)
  assert.match(content, /hasConfirmedSaved/, 'Modal must require user confirmation before closing');
  assert.match(content, /confirm-saved-cred/, 'Modal must have confirmation checkbox');
  assert.match(content, /disabled=\{!hasConfirmedSaved\}/, 'Close button must be disabled until confirmed');

  // Responsive padding: no rigid min-w-[320px] that breaks 320px screens with outer padding
  assert.doesNotMatch(content, /min-w-\[320px\]/, 'Modal should not enforce rigid min-w-[320px] causing horizontal overflow on 320px screens');
  assert.match(content, /max-w-lg/, 'Modal must constrain max width');

  // Neutral branding in credential copy text
  assert.doesNotMatch(content, /Tiếng Anh Cô Dung/i, 'Copy text should not re-introduce removed brand name');
  assert.match(content, /Tài khoản Giáo viên/i, 'Copy text should use neutral teacher account label');
});

test('MODAL-02: Admin CP integrates ProvisionCredentialModal and captures one-time credential', () => {
  const adminPage = fs.readFileSync('src/routes/admin/+page.svelte', 'utf8');
  assert.match(adminPage, /ProvisionCredentialModal/, 'Admin page must import ProvisionCredentialModal');
  assert.match(adminPage, /showProvisionModal/, 'Admin page must maintain showProvisionModal state');
  assert.match(adminPage, /provisionedCredential/, 'Admin page must maintain provisionedCredential state');
  assert.match(adminPage, /temp_password/, 'Admin page must capture temp_password on provision');

  // RBAC scope check: Leader CP must not expose provision button because API is strictly admin/superadmin
  const leaderPage = fs.readFileSync('src/routes/cpanel/leader/+page.svelte', 'utf8');
  assert.doesNotMatch(leaderPage, /handleProvisionCandidate/, 'Leader page must not have provision button calling admin-only endpoint');
  assert.doesNotMatch(leaderPage, /action:\s*['"]provision_account['"]/, 'Leader page must not invoke provision_account');
});
