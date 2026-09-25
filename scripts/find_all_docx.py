import urllib.request, urllib.parse, json, sys

sys.stdout.reconfigure(encoding='utf-8')
with open('scripts/gdrive_token.json', 'r', encoding='utf-8') as f:
    token = json.load(f)['access_token']

q = urllib.parse.quote("mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and trashed = false")
url = f"https://www.googleapis.com/drive/v3/files?q={q}&pageSize=50&fields=files(id,name,parents)"
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(req) as resp:
        files = json.loads(resp.read().decode('utf-8')).get('files', [])
    print(f"Total docx files found: {len(files)}")
    for f in files[:35]:
        print(f"{f['id']} | {f['name']}")
except Exception as e:
    print("Error:", e)
