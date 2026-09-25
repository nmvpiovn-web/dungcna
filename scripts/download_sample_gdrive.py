import urllib.request
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ACCESS_TOKEN = "ya29.a0AX07CmvARPoFKRkiMTjG_AOCKUzv4wfw23Eb0HJFyJNdpBPw3aLJyz_4iqsmpElSaZpKNU_dXvVCVGiNImM1xBwZvyvsAON404ahL4LYZA4BICN6rNblb3sQoUAAgELCrnEeCLW_Tbcb60dfTPihBqsVbUVy_45p9iGr4kUIIb11XXffhedU0qT436TR_o8XI8BYuM8aCgYKAUQSARUSFQHGX2MipM65m4SEVJIISeVOP9m-Bg0206"
headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}

os.makedirs('data/gdrive_downloads', exist_ok=True)

test_files = [
    {"id": "1BqIl95zgT95aKVEDApIYphcCa6F4bN4X", "name": "g7_hsg_de2.docx"},
    {"id": "1dxa2KZRyUtIaTB65L3kfmzynVLfojsmp", "name": "g3_ck1_test.docx"},
    {"id": "1oayZmI_nlS1exoYlQpnexdlk0cdaIqIj", "name": "g4_ck1_test.docx"},
    {"id": "10nK6z5hPuOMkzVOzLS2vaIBXgaTS_xvF", "name": "g5_ck1_test.docx"}
]

for tf in test_files:
    dest = os.path.join('data/gdrive_downloads', tf['name'])
    url = f"https://www.googleapis.com/drive/v3/files/{tf['id']}?alt=media"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp, open(dest, 'wb') as out_file:
            out_file.write(resp.read())
        print(f"✅ Downloaded {tf['name']} ({os.path.getsize(dest)} bytes)")
    except Exception as e:
        print(f"❌ Error downloading {tf['name']}: {e}")
