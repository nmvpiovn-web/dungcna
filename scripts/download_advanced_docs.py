import urllib.request, json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
with open('scripts/gdrive_token.json', 'r', encoding='utf-8') as f:
    token = json.load(f)['access_token']

os.makedirs('data/gdrive_downloads', exist_ok=True)

targets = [
    ('1RVV1T_LWPlxPqeaSv_-G7q0l3FFONEhM', 'chuyen_de_ngu_phap.docx'),
    ('1z0_zc_iCDwb7_G7ohgVsM9FAv6kXzVwQ', '1000_word_formation.docx'),
    ('1wtTaYHjdn0iznK4aL630Vf7h-osBfi2a', 'hsg_lop_11.docx'),
    ('1YY02M-Q8gNbFq_AAPImw7vt4FJxDMcaC', 'hsg_lop_12_quang_nam.docx')
]

for fid, fname in targets:
    dest = os.path.join('data/gdrive_downloads', fname)
    if os.path.exists(dest):
        print(f"Skipping {fname}, already exists.")
        continue
    print(f"Downloading {fname} (ID: {fid})...")
    url = f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req) as resp, open(dest, 'wb') as out:
            out.write(resp.read())
        print(f"Saved {dest} ({os.path.getsize(dest)} bytes)")
    except Exception as e:
        print(f"Error downloading {fname}:", e)
