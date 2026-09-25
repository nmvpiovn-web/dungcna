import json
import requests

try:
    token_info = json.load(open('scripts/gdrive_token.json', 'r', encoding='utf-8'))
    headers = {'Authorization': 'Bearer ' + token_info['access_token']}
    r = requests.get('https://www.googleapis.com/drive/v3/about?fields=user', headers=headers)
    print('Drive API Status:', r.status_code)
    if r.status_code == 200:
        print('User:', r.json().get('user', {}).get('displayName'))
    else:
        print('Token expired or invalid, attempting refresh...')
        # Refresh token via playground endpoint
        ref_url = "https://developers.google.com/oauthplayground/refreshAccessToken"
        payload = {
            "token_uri": "https://oauth2.googleapis.com/token",
            "refresh_token": token_info.get("refresh_token")
        }
        res = requests.post(ref_url, json=payload, timeout=15)
        print('Refresh response status:', res.status_code)
        if res.status_code == 200:
            new_data = res.json()
            token_info['access_token'] = new_data['access_token']
            with open('scripts/gdrive_token.json', 'w', encoding='utf-8') as f:
                json.dump(token_info, f, indent=2)
            print('Successfully refreshed and saved token!')
        else:
            print('Failed to refresh:', res.text[:200])
except Exception as e:
    print('Error:', e)
