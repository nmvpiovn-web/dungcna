import fs from 'fs';

const filePath = 'C:/Users/admin/.codex/sessions/2026/09/29/rollout-2026-09-29T21-37-26-01a0ed99-5c76-7301-ba25-edc288300046.jsonl';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.trim().split('\n');

const lastObj = JSON.parse(lines[874]);
console.log('=== CODEX FULL RESPONSE ===');
if (lastObj.payload && lastObj.payload.content) {
  for (const part of lastObj.payload.content) {
    if (part.text) {
      console.log(part.text);
    }
  }
} else if (lastObj.content) {
  for (const part of lastObj.content) {
    if (part.text) {
      console.log(part.text);
    }
  }
} else {
  console.log(JSON.stringify(lastObj, null, 2));
}
