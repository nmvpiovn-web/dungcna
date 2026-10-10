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

  // Must support mobile 360px (min-w-[320px] and max-w-lg)
  assert.match(content, /min-w-\[320px\]/, 'Modal must support small mobile screen down to 320-360px');
});

test('MODAL-02: Admin and Leader CP integrate ProvisionCredentialModal and pass one-time credential', () => {
  const adminPage = fs.readFileSync('src/routes/admin/+page.svelte', 'utf8');
  assert.match(adminPage, /ProvisionCredentialModal/, 'Admin page must import ProvisionCredentialModal');
  assert.match(adminPage, /showProvisionModal/, 'Admin page must maintain showProvisionModal state');
  assert.match(adminPage, /provisionedCredential/, 'Admin page must maintain provisionedCredential state');
  assert.match(adminPage, /temp_password/, 'Admin page must capture temp_password on provision');

  const leaderPage = fs.readFileSync('src/routes/cpanel/leader/+page.svelte', 'utf8');
  assert.match(leaderPage, /ProvisionCredentialModal/, 'Leader page must import ProvisionCredentialModal');
  assert.match(leaderPage, /showProvisionModal/, 'Leader page must maintain showProvisionModal state');
  assert.match(leaderPage, /handleProvisionCandidate/, 'Leader page must implement handleProvisionCandidate');
});
