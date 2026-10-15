import fs from 'fs';

const file = 'C:/Users/admin/.codex/sessions/2026/09/30/rollout-2026-09-30T19-29-06-01a0f24a-3c1d-74b3-a760-ed77a4668f05.jsonl';
if (!fs.existsSync(file)) {
  console.log(JSON.stringify({ error: 'file_not_found' }));
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
let codexRateLimits = null;
const messages = [];

for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const o = JSON.parse(lines[i]);
    if (!codexRateLimits && o.type === 'event_msg' && o.payload?.type === 'token_count') {
      if (o.payload.rate_limits?.limit_id === 'codex') {
        codexRateLimits = o.payload.rate_limits;
      }
    }
    if (o.type === 'response_item' && o.payload?.type === 'message') {
      messages.push({
        timestamp: o.timestamp,
        role: o.payload.role || 'unknown',
        text: o.payload.content?.[0]?.text
      });
      if (messages.length >= 6) {
        if (codexRateLimits) break;
      }
    }
  } catch(e) {}
}

const nowSec = Math.floor(Date.now() / 1000);
let secondsUntilReset = 0;
let isExceeded = false;

if (codexRateLimits?.primary?.resets_at) {
  secondsUntilReset = Math.max(0, codexRateLimits.primary.resets_at - nowSec);
  if (codexRateLimits.primary.used_percent >= 100 || codexRateLimits.rate_limit_reached_type) {
    isExceeded = true;
  }
}

console.log(JSON.stringify({
  isExceeded,
  secondsUntilReset,
  codexRateLimits,
  recentMessages: messages
}, null, 2));
