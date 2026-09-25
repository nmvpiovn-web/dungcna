import urllib.request
import json
import re

token = ''
config_path = r'C:\Users\admin\AppData\Roaming\xdg.config\.wrangler\config\default.toml'
with open(config_path, 'r', encoding='utf-8') as f:
    content = f.read()
    m = re.search(r'oauth_token\s*=\s*["\']([^"\']+)["\']', content)
    if m:
        token = m.group(1)

account_id = '9bca45c9a8ff34be86d4a4bf0cc0245f'
zone_id = '054ecc44a1750c75002d7a5773c54836'

headers = {'Authorization': f'Bearer {token}'}

# 1. List all Pages projects
print('=== 1. ALL PAGES PROJECTS ===')
url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects'
try:
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        for p in res.get('result', []):
            print(f"Project: {p['name']} -> subdomain: {p.get('subdomain')}")
            # check domains for this project
            d_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/{p['name']}/domains"
            with urllib.request.urlopen(urllib.request.Request(d_url, headers=headers)) as d_resp:
                d_res = json.loads(d_resp.read().decode('utf-8'))
                domains = [d['name'] + f" ({d.get('status')})" for d in d_res.get('result', [])]
                print(f"  Domains: {domains}")
except Exception as e:
    print('Error listing projects:', e)

# 2. List DNS records of timbk.io.vn
print('\n=== 2. DNS RECORDS OF timbk.io.vn ===')
dns_url = f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records'
try:
    with urllib.request.urlopen(urllib.request.Request(dns_url, headers=headers)) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        for r in res.get('result', []):
            print(f"  {r['type']} {r['name']} -> {r['content']} (proxied: {r.get('proxied')})")
except Exception as e:
    print('Error listing DNS:', e)
