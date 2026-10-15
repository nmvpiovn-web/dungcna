import { execSync, execFileSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();
const out = execFileSync('gh', ['issue', 'view', '22', '--repo', 'nmvpiovn-web/dungcna'], {
  env: { ...process.env, GH_TOKEN: token },
  encoding: 'utf8'
});

console.log(out);
