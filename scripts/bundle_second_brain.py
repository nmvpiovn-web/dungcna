import os
import json
import re
from datetime import date

vault_dir = 'second_brain'
notes = []

for root, dirs, files in os.walk(vault_dir):
    dirs.sort()
    if '.obsidian' in root:
        continue
    for f in sorted(files):
        if not f.endswith('.md'):
            continue
        full_path = os.path.join(root, f)
        rel_folder = os.path.relpath(root, vault_dir)
        if rel_folder == '.':
            rel_folder = 'Root'
        with open(full_path, 'r', encoding='utf-8') as mf:
            raw = mf.read()
        
        # Parse YAML frontmatter
        title = f.replace('.md', '')
        tags = []
        cefr = ''
        frontmatter_match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', raw, re.DOTALL)
        content = raw
        if frontmatter_match:
            fm_text, content = frontmatter_match.group(1), frontmatter_match.group(2)
            title_match = re.search(r'title:\s*\"?([^\n\"]+)\"?', fm_text)
            if title_match:
                title = title_match.group(1)
            tags_match = re.search(r'tags:\s*\[(.*?)\]', fm_text)
            if tags_match:
                tags = [t.strip().strip('"\'') for t in tags_match.group(1).split(',')]
            cefr_match = re.search(r'cefr:\s*\"?([^\n\"]+)\"?', fm_text)
            if cefr_match:
                cefr = cefr_match.group(1)

        # Extract WikiLinks: [[target]] or [[target|label]]
        wikilinks = []
        for wl in re.findall(r'\[\[(.*?)\]\]', raw):
            target = wl.split('|')[0].strip()
            label = wl.split('|')[1].strip() if '|' in wl else target
            wikilinks.append({'target': target, 'label': label})

        notes.append({
            'id': f.replace('.md', ''),
            'filename': f,
            'folder': rel_folder,
            'title': title,
            'tags': tags,
            'cefr_level': cefr,
            'content': content.strip(),
            'raw': raw,
            'wikilinks': wikilinks,
            'char_count': len(raw)
        })

print(f'Total notes cataloged: {len(notes)}')
with open('src/lib/data/second_brain_vault.json', 'w', encoding='utf-8') as out:
    json.dump({'notes': notes, 'total': len(notes), 'version': '2.5.0', 'updated_at': date.today().isoformat()}, out, ensure_ascii=False, indent=2)
print('Saved to src/lib/data/second_brain_vault.json')
