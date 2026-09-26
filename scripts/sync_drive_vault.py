"""Import downloaded teaching documents without modifying the originals.

Run with the bundled Python runtime and --legacy-docx pointing to a Word-converted
copy of GRADE 6- U8- GLOBAL SUCCESS.doc. Output is deterministic and repeatable.
"""
import argparse
import hashlib
import json
import re
import shutil
import unicodedata
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FOLDER = '07_GOOGLE_DRIVE_LIBRARY'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'


def slug(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:80]


def extract(path, asset_dirs):
    with zipfile.ZipFile(path) as z:
        rels = ET.fromstring(z.read('word/_rels/document.xml.rels'))
        relationships = {r.attrib['Id']: r.attrib.get('Target', '') for r in rels}
        doc = ET.fromstring(z.read('word/document.xml'))
        blocks, unsupported, images = [], [], set()
        # Paragraph iteration includes table cells, preserving their document order.
        for p in doc.iter(W + 'p'):
            pieces = []
            for e in p.iter():
                if e.tag == W + 't':
                    pieces.append(e.text or '')
                elif e.tag == W + 'tab':
                    pieces.append(' | ')
                elif e.tag in (W + 'br', W + 'cr'):
                    pieces.append('\n')
                elif e.tag == A + 'blip':
                    target = relationships.get(e.attrib.get(R + 'embed', ''), '')
                    if not target:
                        continue
                    member = 'word/' + target if not target.startswith('/') else target.lstrip('/')
                    if member not in z.namelist():
                        unsupported.append(target)
                        continue
                    data = z.read(member)
                    ext = Path(target).suffix.lower()
                    if ext not in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
                        try:
                            from PIL import Image
                            with Image.open(BytesIO(data)) as img:
                                img.load()
                                out = BytesIO()
                                img.save(out, format='PNG')
                                data, ext = out.getvalue(), '.png'
                        except Exception:
                            unsupported.append(target)
                            pieces.append('\n[Hình định dạng ' + ext + ': xem tài liệu gốc]\n')
                            continue
                    name = hashlib.sha256(data).hexdigest()[:24] + ext
                    for dest in asset_dirs:
                        dest.mkdir(parents=True, exist_ok=True)
                        (dest / name).write_bytes(data)
                    images.add(name)
                    pieces.append('\n![Hình trong tài liệu](../drive-media/' + name + ')\n')
            text = ''.join(pieces).strip()
            if text:
                blocks.append(text)
        return '\n\n'.join(blocks), sorted(images), unsupported


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--legacy-docx', type=Path, required=True)
    args = parser.parse_args()
    vaults = [ROOT / 'obsidian_vault', ROOT / 'second_brain']
    media_dirs = [v / 'drive-media' for v in vaults] + [ROOT / 'static' / 'drive-media']
    sources = sorted((ROOT / 'data/gdrive_downloads').glob('*'), key=lambda p: p.name.casefold())
    sources = [p for p in sources if p.suffix.lower() in ('.doc', '.docx')]
    manifest, seen, index = [], {}, []
    for source in sources:
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        note_id = 'drive-' + slug(source.stem) + '-' + digest[:8]
        converted = args.legacy_docx if source.suffix.lower() == '.doc' else source
        content, images, unsupported = extract(converted, media_dirs)
        if not content.strip():
            raise ValueError('No content extracted: ' + source.name)
        content_digest = hashlib.sha256(content.encode('utf-8')).hexdigest()
        duplicate = seen.get(content_digest)
        seen.setdefault(content_digest, note_id)
        title = source.stem.replace('_', ' ')
        header = ('---\ntitle: ' + json.dumps(title, ensure_ascii=False)
                  + '\ntags: [google-drive, tai-lieu-goc]\nsource_file: '
                  + json.dumps(source.name, ensure_ascii=False) + '\nsha256: ' + digest + '\n---\n\n')
        intro = '# ' + title + '\n\nNguồn: ' + source.name + '\n\n[[00_GOOGLE_DRIVE_INDEX|Mục lục tài liệu Google Drive]]\n\n'
        if duplicate:
            body = 'Tài liệu trùng nội dung với [[' + duplicate + '|bản đã nhập]].\n'
        else:
            body = ('Nội dung trích xuất từ tài liệu gốc; các ô bảng được đọc lần lượt. '
                    'Bố cục và định dạng có thể khác bản Word.\n\n## Nội dung tài liệu\n\n' + content + '\n')
        for vault in vaults:
            dest = vault / FOLDER
            dest.mkdir(parents=True, exist_ok=True)
            (dest / (note_id + '.md')).write_text(header + intro + body, encoding='utf-8')
        index.append('- [[' + note_id + '|' + title + ']]' + (' (bản trùng)' if duplicate else ''))
        manifest.append(dict(source=source.name, sha256=digest, note_id=note_id,
                             characters=len(content), images=len(images),
                             unsupported_images=unsupported, duplicate_of=duplicate))
    index_text = ('---\ntitle: "Kho tài liệu Google Drive"\ntags: [google-drive, muc-luc]\n---\n\n'
                  '# Kho tài liệu Google Drive\n\n' + str(len(sources)) + ' tệp nguồn, '
                  + str(len(seen)) + ' tài liệu không trùng.\n\n' + '\n'.join(index) + '\n')
    for vault in vaults:
        (vault / FOLDER / '00_GOOGLE_DRIVE_INDEX.md').write_text(index_text, encoding='utf-8')
    (ROOT / 'src/lib/data/drive_sync_manifest.json').write_text(
        json.dumps({'files': manifest, 'total': len(sources), 'unique': len(seen)}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'sources': len(sources), 'unique': len(seen),
                      'unsupported_images': sum(len(x['unsupported_images']) for x in manifest)}))


if __name__ == '__main__':
    main()
