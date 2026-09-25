import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const db = new DatabaseSync('data/tienganh7.db');

const outDir = path.resolve('src/lib/data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Export Words
const words = db.prepare('SELECT * FROM words ORDER BY id ASC').all();
fs.writeFileSync(path.join(outDir, 'words.json'), JSON.stringify(words, null, 2), 'utf-8');
console.log(`Exported ${words.length} words to src/lib/data/words.json`);

// 2. Export Questions
const questions = db.prepare('SELECT * FROM questions ORDER BY qnum ASC').all();
fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(questions, null, 2), 'utf-8');
console.log(`Exported ${questions.length} questions to src/lib/data/questions.json`);

// 3. Export Units
const units = db.prepare('SELECT * FROM units ORDER BY id ASC').all();
fs.writeFileSync(path.join(outDir, 'units.json'), JSON.stringify(units, null, 2), 'utf-8');
console.log(`Exported ${units.length} units to src/lib/data/units.json`);

// Also save to static/data/ so they can be fetched via HTTP if needed
const staticDataDir = path.resolve('static/data');
if (!fs.existsSync(staticDataDir)) {
  fs.mkdirSync(staticDataDir, { recursive: true });
}
fs.writeFileSync(path.join(staticDataDir, 'words.json'), JSON.stringify(words, null, 2), 'utf-8');
fs.writeFileSync(path.join(staticDataDir, 'questions.json'), JSON.stringify(questions, null, 2), 'utf-8');
fs.writeFileSync(path.join(staticDataDir, 'units.json'), JSON.stringify(units, null, 2), 'utf-8');

console.log('Static database export complete!');
