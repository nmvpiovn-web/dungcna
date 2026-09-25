import zipfile
import xml.etree.ElementTree as ET
import json
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

docx_path = r'C:\Users\admin\Desktop\thuvienhoclieu.com-De-cuong-on-tap-TIENG-ANH-7-giua-HK1-2022-2023.docx'
z = zipfile.ZipFile(docx_path)
tree = ET.fromstring(z.read('word/document.xml'))

# Extract paragraphs
namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
paragraphs = []
for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    texts = [t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
    if texts:
        paragraphs.append(''.join(texts).strip())

print(f"Total paragraphs extracted: {len(paragraphs)}")

# Print sample paragraphs
for i, p in enumerate(paragraphs[:40]):
    print(f"P{i+1}: {p}")

with open('scripts/extracted_doc_paragraphs.json', 'w', encoding='utf-8') as f:
    json.dump(paragraphs, f, ensure_ascii=False, indent=2)
print("Saved extracted_doc_paragraphs.json")
