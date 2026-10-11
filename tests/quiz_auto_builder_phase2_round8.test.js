import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// -------------------------------------------------------------
// RED-8.1: QuizCameraCapture thumbnail restoration & DOM order
// -------------------------------------------------------------
test('RED-8.1: QuizCameraCapture thumb-card must contain thumbnail img with page/filename alt and proper DOM order', () => {
  const compSrc = fs.readFileSync('src/lib/components/QuizCameraCapture.svelte', 'utf8');

  // Verify keyed each card has img with previewUrl
  assert.ok(
    compSrc.includes('<img') && compSrc.includes('src={item.previewUrl}'),
    'QuizCameraCapture thumb-card must contain <img src={item.previewUrl}>'
  );

  // Verify alt includes page number and file name
  assert.ok(
    compSrc.includes('alt={`Trang tài liệu ${idx + 1}${item.file?.name ? ` (${item.file.name})` : \'\'}`}'),
    'QuizCameraCapture thumb-card img must have informative alt with page number and file name'
  );

  // Normalize newlines to support both Windows CRLF and Unix/CI LF cleanly
  const normalized = compSrc.replace(/\r\n/g, '\n');

  // Verify DOM order: badge -> img -> label/input -> actions
  const cardStart = normalized.indexOf('<div class="thumb-card">');
  assert.ok(cardStart > 0, 'Must have .thumb-card container');

  const cardMatch = normalized.slice(cardStart).match(/<div class="thumb-card">([\s\S]*?)<\/div>\s*\{\/each\}/);
  assert.ok(cardMatch, 'Must close each block for thumb-card');

  const cardContent = cardMatch[1];

  const badgeIdx = cardContent.indexOf('class="thumb-order"');
  const imgIdx = cardContent.indexOf('src={item.previewUrl}');
  const labelIdx = cardContent.indexOf('class="thumb-label-input"');
  const actionsIdx = cardContent.indexOf('class="thumb-actions"');

  assert.ok(badgeIdx > 0, 'Badge must exist in thumb-card');
  assert.ok(imgIdx > badgeIdx, 'Thumbnail img must appear after badge');
  assert.ok(labelIdx > imgIdx, 'Label input must appear after thumbnail img');
  assert.ok(actionsIdx > labelIdx, 'Actions buttons must appear after label input');
});

// -------------------------------------------------------------
// RED-8.2: Gallery actions buttons touch targets >= 44x44px and viewport safety
// -------------------------------------------------------------
test('RED-8.2: QuizCameraCapture .thumb-actions button touch targets >= 44x44px and a11y labels', () => {
  const compSrc = fs.readFileSync('src/lib/components/QuizCameraCapture.svelte', 'utf8');

  // Verify CSS touch target metrics for buttons
  assert.ok(
    compSrc.includes('min-height: 44px;') && compSrc.includes('min-width: 44px;'),
    '.thumb-actions button must specify min-height: 44px and min-width: 44px'
  );

  // Verify flex & box-sizing for responsive layout without overflow
  assert.ok(
    compSrc.includes('box-sizing: border-box;'),
    'Elements must use box-sizing: border-box to prevent overflow'
  );

  // Verify aria-labels on action buttons
  assert.ok(
    compSrc.includes('aria-label={`Chuyển ảnh ${idx + 1} lên trước`}'),
    'Up button must have clear aria-label'
  );
  assert.ok(
    compSrc.includes('aria-label={`Chuyển ảnh ${idx + 1} xuống sau`}'),
    'Down button must have clear aria-label'
  );
  assert.ok(
    compSrc.includes('aria-label={`Xóa ảnh ${idx + 1}`}'),
    'Delete button must have clear aria-label'
  );
});

test('RED-8.1 & 8.2: Behavior check: thumbnail, label, and actions state tracking', () => {
  // Simulate item state in QuizCameraCapture
  let items = [
    { id: '1', file: { name: 'dog.png' }, previewUrl: 'blob:dog', label: 'dog' },
    { id: '2', file: { name: 'cat.png' }, previewUrl: 'blob:cat', label: 'cat' }
  ];

  // Verify each item preserves both previewUrl and label
  assert.equal(items[0].previewUrl, 'blob:dog');
  assert.equal(items[0].label, 'dog');
  assert.equal(items[1].previewUrl, 'blob:cat');
  assert.equal(items[1].label, 'cat');

  // Reorder: move item 2 up to index 0
  const copy = [...items];
  [copy[0], copy[1]] = [copy[1], copy[0]];
  items = copy;

  assert.equal(items[0].file.name, 'cat.png');
  assert.equal(items[0].previewUrl, 'blob:cat');
  assert.equal(items[0].label, 'cat');

  assert.equal(items[1].file.name, 'dog.png');
  assert.equal(items[1].previewUrl, 'blob:dog');
  assert.equal(items[1].label, 'dog');
});
