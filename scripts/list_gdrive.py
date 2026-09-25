import urllib.request
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ACCESS_TOKEN = "ya29.a0AX07CmvARPoFKRkiMTjG_AOCKUzv4wfw23Eb0HJFyJNdpBPw3aLJyz_4iqsmpElSaZpKNU_dXvVCVGiNImM1xBwZvyvsAON404ahL4LYZA4BICN6rNblb3sQoUAAgELCrnEeCLW_Tbcb60dfTPihBqsVbUVy_45p9iGr4kUIIb11XXffhedU0qT436TR_o8XI8BYuM8aCgYKAUQSARUSFQHGX2MipM65m4SEVJIISeVOP9m-Bg0206"

headers = {
    "Authorization": f"Bearer {ACCESS_TOKEN}"
}

# List files
url = "https://www.googleapis.com/drive/v3/files?pageSize=100&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)&q=trashed%3Dfalse"

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        files = res_data.get('files', [])
        print(f"Total files returned: {len(files)}")
        for f in files:
            size_mb = round(int(f.get('size', 0)) / (1024 * 1024), 2) if f.get('size') else "DIR/DOC"
            print(f"- [{f.get('mimeType')}] {f.get('name')} (Size: {size_mb} MB, ID: {f.get('id')})")
            
        with open('scripts/gdrive_files.json', 'w', encoding='utf-8') as out:
            json.dump(files, out, ensure_ascii=False, indent=2)
        print("\nSaved gdrive_files.json successfully!")
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code} - {e.read().decode('utf-8')}")
except Exception as ex:
    print(f"Error: {ex}")
