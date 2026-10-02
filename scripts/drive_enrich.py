#!/usr/bin/env python3
"""
drive_enrich.py — Làm giàu D1 từ Google Drive bằng metadata + phân loại thông minh.

KHÔNG parse nội dung PDF. Chỉ dùng metadata (tên file, tên folder, mimeType, size)
để phân loại thông minh vào D1.

Chức năng:
  1. Lấy Service Account (email + private key) từ D1 site_settings
  2. Đổi JWT RS256 -> OAuth access token
  3. Quét đệ quy Drive từ folder root (tối đa 500 files), lấy metadata:
     id, name, mimeType, size, modifiedTime, parents, webViewLink
  4. Phân loại thông minh mỗi file:
     - grade từ tên folder cha ("Tiếng Anh Lớp 7" -> "Lớp 7")
     - category từ tên file/folder (de_thi -> exam, tu_vung -> vocabulary, ...)
     - mimeType (audio -> listening, video -> video)
     - size (file PDF lớn không keyword -> curriculum)
  5. Ghi vào D1:
     - drive_file_index  (index toàn bộ file + phân loại)
     - drive_folder_tree (cây thư mục + số file)
  6. In báo cáo: tổng files, phân loại theo grade/category, folders

Tái sử dụng:
  python3 scripts/drive_enrich.py [--max-files 500] [--root <folder_id>]

Dấu vết cho codex/antigravity:
  - Bảng D1 `drive_file_index`  : tra cứu file Drive đã phân loại
  - Bảng D1 `drive_folder_tree` : cây thư mục Drive
  - Bảng D1 `drive_sync_logs`   : lịch sử mỗi lần chạy (do /api/drive/sync ghi)
"""

import argparse
import base64
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import (  # noqa: E402
    add_surrogate_to_request,
    read_json_response,
)

# ---------------------------------------------------------------- config
CF_BASE = "https://api.cloudflare.com"
CF_CRED = "custom.cloudflare"
ACCOUNT_ID = "9bca45c9a8ff34be86d4a4bf0cc0245f"
DATABASE_ID = "a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218"
DEFAULT_ROOT = "1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou"
GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"
BATCH_SIZE = 50


# ---------------------------------------------------------------- D1 helpers
def cf_api(method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(CF_BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, CF_CRED, entry_name="access_token",
                             allowed_hosts=["api.cloudflare.com"])
    with urllib.request.urlopen(req, timeout=90) as resp:
        return read_json_response(resp)


def d1_query(sql):
    out = cf_api(
        "POST",
        f"/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query",
        {"sql": sql},
    )
    if not out.get("success"):
        raise RuntimeError(f"D1 query failed: {out.get('errors')}")
    return out["result"]


def d1_first(sql):
    res = d1_query(sql)
    rows = res[0].get("results", []) if res else []
    return rows[0] if rows else None


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


# ---------------------------------------------------------------- Google auth
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def get_service_account_token():
    email_row = d1_first(
        "SELECT value FROM site_settings "
        "WHERE key = 'google_service_account_email' LIMIT 1"
    )
    key_row = d1_first(
        "SELECT value FROM site_settings "
        "WHERE key = 'google_service_account_private_key' LIMIT 1"
    )
    email = email_row["value"] if email_row else None
    private_key = key_row["value"] if key_row else None
    if not email or not private_key:
        raise RuntimeError("Chua cau hinh service account trong D1 site_settings")

    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({
        "iss": email,
        "scope": "https://www.googleapis.com/auth/drive.readonly",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }).encode())

    key = serialization.load_pem_private_key(private_key.encode(), password=None)
    sig = key.sign(f"{header}.{payload}".encode(), padding.PKCS1v15(), hashes.SHA256())
    jwt_assertion = f"{header}.{payload}.{b64url(sig)}"

    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_assertion,
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token", data=body, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    if "access_token" not in data:
        raise RuntimeError(f"Token exchange failed: {data}")
    return data["access_token"]


# ---------------------------------------------------------------- Drive scan
class DriveScanner:
    def __init__(self, token, max_files=500, max_depth=8):
        self.token = token
        self.max_files = max_files
        self.max_depth = max_depth
        self.files = []     # dicts: drive file metadata + classification
        self.folders = {}   # folder_id -> {folder_id, name, parent_id, full_path}

    def _get(self, url):
        req = urllib.request.Request(
            url, headers={"Authorization": f"Bearer {self.token}"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    def list_children(self, folder_id):
        q = f"'{folder_id}' in parents and trashed = false"
        fields = ("files(id,name,mimeType,size,modifiedTime,parents,webViewLink),"
                  "nextPageToken")
        items, page_token = [], ""
        while True:
            url = ("https://www.googleapis.com/drive/v3/files?"
                   f"q={urllib.parse.quote(q)}"
                   f"&fields={urllib.parse.quote(fields)}"
                   "&pageSize=100&orderBy=name")
            if page_token:
                url += f"&pageToken={page_token}"
            data = self._get(url)
            if data.get("error"):
                raise RuntimeError(f"Drive list error: {data['error']}")
            items.extend(data.get("files", []))
            page_token = data.get("nextPageToken", "")
            if not page_token:
                break
        return items

    def walk(self, folder_id, parent_id=None, path="", depth=0):
        if depth > self.max_depth or len(self.files) >= self.max_files:
            return
        children = self.list_children(folder_id)
        for f in children:
            if len(self.files) >= self.max_files:
                break
            fid = f["id"]
            name = f.get("name", "")
            mime = f.get("mimeType", "")
            if mime == GOOGLE_FOLDER_MIME:
                fpath = f"{path}/{name}" if path else name
                self.folders[fid] = {
                    "folder_id": fid, "name": name,
                    "parent_id": parent_id, "full_path": fpath,
                }
                self.walk(fid, parent_id=folder_id, path=fpath, depth=depth + 1)
            else:
                grade, category, tags = classify(name, path, mime,
                                                 int(f.get("size") or 0))
                self.files.append({
                    "drive_id": fid,
                    "name": name,
                    "mime_type": mime,
                    "size_bytes": int(f.get("size") or 0),
                    "modified_time": f.get("modifiedTime"),
                    "folder_path": path,
                    "web_view_link": f.get("webViewLink"),
                    "grade": grade,
                    "category": category,
                    "tags": json.dumps(tags, ensure_ascii=False),
                })


# ---------------------------------------------------------------- classification
def strip_accents(s):
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def classify(name, folder_path, mime_type="", size=0):
    """Phân loại thông minh từ metadata. Trả về (grade, category, tags)."""
    raw = f"{folder_path} {name}"
    text = strip_accents(raw).lower()

    # ---- grade: "Tiếng Anh Lớp 7", "lop 7", "L07", "grade 7", "khối 7"
    grade = None
    m = re.search(r"(?:lop|grade|khoi|l)\s*[-_]?\s*(\d{1,2})\b", text)
    if m:
        g = int(m.group(1))
        if 1 <= g <= 12:
            grade = f"Lớp {g}"

    # ---- category theo keyword (uu tien tu khoa dac thu truoc)
    category = "document"
    tags = ["google_drive"]
    rules = [
        ("ielts", [r"\bielts\b"]),
        ("toeic", [r"\btoeic\b"]),
        ("hsg", [r"\bhsg\b", r"olympic", r"chuyen",
                 r"hoc[_\-\s]?sinh[_\-\s]?gioi"]),
        ("listening", [r"listening", r"luyen[_\-\s]?nghe", r"\baudio\b",
                        r"luyennghe"]),
        ("exam", [r"de[_\-\s]?thi", r"\bexam\b", r"\btest\b",
                  r"kiem[_\-\s]?tra", r"bai[_\-\s]?kiem", r"dethi"]),
        ("vocabulary", [r"tu[_\-\s]?vung", r"\bvocab\w*", r"\bwords?\b",
                        r"flashcard", r"tuvung"]),
        ("grammar", [r"ngu[_\-\s]?phap", r"\bgrammar\b", r"nguphap"]),
        ("teaching", [r"giao[_\-\s]?an", r"lesson[_\-\s]?plan",
                      r"bai[_\-\s]?giang", r"\bsop\b", r"giaoan"]),
        ("curriculum", [r"giao[_\-\s]?trinh", r"\bcurriculum\b", r"\bgdpt\b",
                        r"\bsgk\b", r"giaotrinh"]),
        ("worksheet", [r"worksheet", r"bai[_\-\s]?tap", r"baitap"]),
        ("speaking", [r"speaking", r"luyen[_\-\s]?noi"]),
        ("reading", [r"\breading\b", r"luyen[_\-\s]?doc", r"doc[_\-\s]?hieu"]),
        ("writing", [r"\bwriting\b", r"luyen[_\-\s]?viet"]),
    ]
    for cat, patterns in rules:
        if any(re.search(p, text) for p in patterns):
            category = cat
            tags.append(cat)
            break

    # ---- mimeType override khi chưa phân loại được
    if category == "document":
        if mime_type.startswith("audio/"):
            category = "listening"
            tags.append("listening")
        elif mime_type.startswith("video/"):
            category = "video"
            tags.append("video")

    # ---- file PDF/DOCX lớn không keyword -> nhiều khả năng là giáo trình
    if category == "document" and size >= 3 * 1024 * 1024 and \
            mime_type in ("application/pdf",
                          "application/vnd.openxmlformats-officedocument."
                          "wordprocessingml.document"):
        category = "curriculum"
        tags.append("curriculum")
        tags.append("large_doc")

    if grade:
        tags.append(grade.lower().replace(" ", "_"))
    # tag loại file gọn
    short_mime = mime_type.split("/")[-1].replace(".", "_")[:24]
    if short_mime:
        tags.append(f"mime_{short_mime}")

    return grade, category, tags


# ---------------------------------------------------------------- D1 schema + upsert
SCHEMA_FILE_INDEX = """
CREATE TABLE IF NOT EXISTS drive_file_index (
  drive_id TEXT PRIMARY KEY,
  name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  modified_time TEXT,
  folder_path TEXT,
  web_view_link TEXT,
  grade TEXT,
  category TEXT,
  tags TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

SCHEMA_FOLDER_TREE = """
CREATE TABLE IF NOT EXISTS drive_folder_tree (
  folder_id TEXT PRIMARY KEY,
  name TEXT,
  parent_id TEXT,
  full_path TEXT,
  file_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""


def upsert_files(files):
    total = 0
    for i in range(0, len(files), BATCH_SIZE):
        batch = files[i:i + BATCH_SIZE]
        values = []
        for f in batch:
            values.append(
                "(" + ",".join([
                    sql_str(f["drive_id"]), sql_str(f["name"]),
                    sql_str(f["mime_type"]), str(f["size_bytes"]),
                    sql_str(f["modified_time"]), sql_str(f["folder_path"]),
                    sql_str(f["web_view_link"]), sql_str(f["grade"]),
                    sql_str(f["category"]), sql_str(f["tags"]),
                    "CURRENT_TIMESTAMP",
                ]) + ")"
            )
        sql = (
            "INSERT INTO drive_file_index (drive_id, name, mime_type, size_bytes,"
            " modified_time, folder_path, web_view_link, grade, category, tags,"
            " synced_at) VALUES " + ",".join(values) +
            " ON CONFLICT(drive_id) DO UPDATE SET name=excluded.name,"
            " mime_type=excluded.mime_type, size_bytes=excluded.size_bytes,"
            " modified_time=excluded.modified_time,"
            " folder_path=excluded.folder_path,"
            " web_view_link=excluded.web_view_link, grade=excluded.grade,"
            " category=excluded.category, tags=excluded.tags,"
            " synced_at=CURRENT_TIMESTAMP"
        )
        d1_query(sql)
        total += len(batch)
        print(f"  upsert files: {total}/{len(files)}", flush=True)
    return total


def upsert_folders(folders, file_counts):
    items = list(folders.values())
    total = 0
    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i:i + BATCH_SIZE]
        values = []
        for fo in batch:
            values.append(
                "(" + ",".join([
                    sql_str(fo["folder_id"]), sql_str(fo["name"]),
                    sql_str(fo["parent_id"]), sql_str(fo["full_path"]),
                    str(file_counts.get(fo["folder_id"], 0)),
                    "CURRENT_TIMESTAMP",
                ]) + ")"
            )
        sql = (
            "INSERT INTO drive_folder_tree (folder_id, name, parent_id,"
            " full_path, file_count, updated_at) VALUES " + ",".join(values) +
            " ON CONFLICT(folder_id) DO UPDATE SET name=excluded.name,"
            " parent_id=excluded.parent_id, full_path=excluded.full_path,"
            " file_count=excluded.file_count, updated_at=CURRENT_TIMESTAMP"
        )
        d1_query(sql)
        total += len(batch)
    return total


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-files", type=int, default=500)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--max-depth", type=int, default=8)
    args = ap.parse_args()

    print("[1/5] Tao schema D1...", flush=True)
    d1_query(SCHEMA_FILE_INDEX)
    d1_query(SCHEMA_FOLDER_TREE)
    print("  OK: drive_file_index, drive_folder_tree", flush=True)

    print("[2/5] Lay service account token...", flush=True)
    token = get_service_account_token()
    print("  OK", flush=True)

    print(f"[3/5] Quet Drive (root={args.root}, max={args.max_files})...",
          flush=True)
    scanner = DriveScanner(token, max_files=args.max_files,
                           max_depth=args.max_depth)
    root_name = "DriveRoot"
    try:
        meta = scanner._get(
            "https://www.googleapis.com/drive/v3/files/"
            f"{args.root}?fields=name")
        root_name = meta.get("name", root_name)
    except Exception as e:
        print(f"  (khong lay duoc ten root: {e})", flush=True)
    scanner.folders[args.root] = {
        "folder_id": args.root, "name": root_name,
        "parent_id": None, "full_path": root_name,
    }
    scanner.walk(args.root, parent_id=None, path=root_name, depth=0)
    print(f"  files: {len(scanner.files)}, folders: {len(scanner.folders)}",
          flush=True)

    # file_count trực tiếp cho từng folder: map folder_path -> folder_id
    path_to_id = {fo["full_path"]: fid
                  for fid, fo in scanner.folders.items()}
    file_counts = {}
    for f in scanner.files:
        fid = path_to_id.get(f["folder_path"])
        if fid:
            file_counts[fid] = file_counts.get(fid, 0) + 1

    print("[4/5] Upsert vao D1...", flush=True)
    n_files = upsert_files(scanner.files)
    n_folders = upsert_folders(scanner.folders, file_counts)
    print(f"  OK: {n_files} files, {n_folders} folders", flush=True)

    print("[5/5] Bao cao phan loai:", flush=True)
    by_grade = d1_query(
        "SELECT grade, COUNT(*) c FROM drive_file_index "
        "GROUP BY grade ORDER BY c DESC")
    by_cat = d1_query(
        "SELECT category, COUNT(*) c FROM drive_file_index "
        "GROUP BY category ORDER BY c DESC")
    tot = d1_first("SELECT COUNT(*) c FROM drive_file_index")
    tot_f = d1_first("SELECT COUNT(*) c FROM drive_folder_tree")

    print(f"\n=== DRIVE ENRICH REPORT ===")
    print(f"Tong files trong index : {tot['c']}")
    print(f"Tong folders trong tree: {tot_f['c']}")
    print("\nTheo grade:")
    for r in by_grade[0].get("results", []):
        print(f"  {r['grade'] or '(chua xac dinh)'}: {r['c']}")
    print("\nTheo category:")
    for r in by_cat[0].get("results", []):
        print(f"  {r['category']}: {r['c']}")

    report = {
        "total_files": tot["c"],
        "total_folders": tot_f["c"],
        "by_grade": {str(r["grade"]): r["c"]
                     for r in by_grade[0].get("results", [])},
        "by_category": {r["category"]: r["c"]
                         for r in by_cat[0].get("results", [])},
    }
    with open("/tmp/drive_enrich_report.json", "w") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print("\nReport JSON: /tmp/drive_enrich_report.json")


if __name__ == "__main__":
    main()
