import sys, json, urllib.request, urllib.parse

sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/gdrive_token.json', 'r', encoding='utf-8') as f:
    token_data = json.load(f)
token = token_data['access_token']

folder_ids = {
    'Vao10_80de': '1Aki8mfGP7C_X8EVe9D8kMW0UTy6FBtMM',
    'THPTQG_DeOn': '1tb8AOXmUc_mJeLr1sPZ-3_8he0sBiCJ1',
    'DocHieu_12': '191X7wkLrwFDpvCAKfb8nb0ISiyS7onwC',
    'HSG_7': '1gW1H45kvWdTd5oNw9FPcmd5SFkmo7M6t'
}

for name, fid in folder_ids.items():
    print(f'=== Scanning {name} ({fid}) ===')
    q = urllib.parse.quote(f"'{fid}' in parents and trashed = false")
    url = f'https://www.googleapis.com/drive/v3/files?q={q}&pageSize=20&fields=files(id,name,mimeType,size)'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            files = data.get('files', [])
            print(f'Found {len(files)} files/subfolders:')
            for item in files[:10]:
                print(f"  - {item['id']} | {item['name']} | {item.get('mimeType')}")
    except Exception as e:
        print('Error:', e)
