import zipfile
import xml.etree.ElementTree as ET
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

def read_docx(path):
    with zipfile.ZipFile(path) as z:
        xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        texts = []
        for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            p_text = ''.join(t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text)
            if p_text.strip():
                texts.append(p_text.strip())
        return texts

for fname in ['31. VIET LAI CAU - THI HSG LOP 10_11_12.docx', '1000_word_formation.docx', 'PHRASAL VERBS.docx']:
    fpath = os.path.join('data/gdrive_downloads', fname)
    if os.path.exists(fpath):
        paras = read_docx(fpath)
        print(f"=== {fname} ({len(paras)} paragraphs) ===")
        for p in paras[:5]:
            print("  ", p[:120])
