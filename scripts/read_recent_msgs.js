import fs from 'fs';

const file = 'C:/Users/admin/.codex/sessions/2026/09/30/rollout-2026-09-30T19-29-06-01a0f24a-3c1d-74b3-a760-ed77a4668f05.jsonl';
if (!fs.existsSync(file)) {
  console.log(JSON.stringify({ error: 'file_not_found' }));
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
const items = [];
for (let i = lines.length - 1; i >= 0 && items.length < 5; i--) {
  try {
    const o = JSON.parse(lines[i]);
    if (o.type === 'response_item' && o.payload?.type === 'message') {
      items.push({
        time: o.timestamp,
        role: o.payload.role,
        text: o.payload.content?.[0]?.text
      });
    }
  } catch(e) {}
}

console.log(JSON.stringify(items, null, 2));
