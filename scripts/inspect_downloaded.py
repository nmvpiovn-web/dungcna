import zipfile, xml.etree.ElementTree as ET, sys

sys.stdout.reconfigure(encoding='utf-8')

def extract_paragraphs(docx_path):
    z = zipfile.ZipFile(docx_path)
    tree = ET.fromstring(z.read('word/document.xml'))
    paragraphs = []
    for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
        texts = [t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
        if texts:
            t = ''.join(texts).strip()
            if t: paragraphs.append(t)
    return paragraphs

for fname in ['chuyen_de_ngu_phap.docx', '1000_word_formation.docx', 'hsg_lop_11.docx', 'hsg_lop_12_quang_nam.docx']:
    path = f'data/gdrive_downloads/{fname}'
    p = extract_paragraphs(path)
    print(f"=== {fname}: {len(p)} paragraphs ===")
    for i, line in enumerate(p[:15]):
        print(f"  [{i}]: {line[:100]}")
    print()
