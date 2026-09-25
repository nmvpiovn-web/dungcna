# -*- coding: utf-8 -*-
"""
Script to generate comprehensive Code & UI/UX Audit Payload for GPT-6 / ChatGPT Desktop.
Includes system architecture, metrics, concrete findings, code snippets, and structured questions.
"""
import os
import json
import sqlite3
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(BASE_DIR, 'src', 'lib', 'data')
DB_PATH = os.path.join(BASE_DIR, 'data', 'tienganh7.db')
VAULT_DIR = os.path.join(BASE_DIR, 'obsidian_vault')
OUTPUT_PROMPT_PATH = os.path.join(BASE_DIR, 'scripts', 'audit_prompt_for_gpt.md')

def gather_metrics():
    # Exams & Questions
    exams_file = os.path.join(DATA_DIR, 'exams.json')
    questions_file = os.path.join(DATA_DIR, 'questions.json')
    vocab_file = os.path.join(DATA_DIR, 'vocabulary.json')
    
    exam_count = 0
    question_count = 0
    vocab_count = 0
    
    if os.path.exists(exams_file):
        with open(exams_file, 'r', encoding='utf-8') as f:
            exams = json.load(f)
            exam_count = len(exams)
            
    if os.path.exists(questions_file):
        with open(questions_file, 'r', encoding='utf-8') as f:
            questions = json.load(f)
            question_count = len(questions)
            
    if os.path.exists(vocab_file):
        with open(vocab_file, 'r', encoding='utf-8') as f:
            vocab = json.load(f)
            vocab_count = len(vocab)
            
    # SQLite Metrics
    db_metrics = {}
    if os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        for tbl in ['exams', 'questions', 'users', 'class_sessions', 'games_progress', 'notifications']:
            try:
                c.execute(f"SELECT COUNT(*) FROM {tbl}")
                db_metrics[tbl] = c.fetchone()[0]
            except Exception:
                db_metrics[tbl] = 'N/A'
        conn.close()

    # Obsidian Vault Metrics
    vault_notes = 0
    if os.path.exists(VAULT_DIR):
        for root, _, files in os.walk(VAULT_DIR):
            for file in files:
                if file.endswith('.md'):
                    vault_notes += 1

    return {
        'exam_count': exam_count,
        'question_count': question_count,
        'vocab_count': vocab_count,
        'db_metrics': db_metrics,
        'vault_notes': vault_notes
    }

def generate_audit_payload():
    metrics = gather_metrics()
    
    prompt = f"""# BÁO CÁO TOÀN DIỆN AUDIT HỆ THỐNG CODE & GIAO DIỆN UI/UX
# NỀN TẢNG TIẾNG ANH CÔ DUNG (SVELTEKIT 5 + TAILWIND + DUAL PERSISTENCE + PWA)
*Mục tiêu:* Đánh giá kiến trúc mã nguồn, hiệu năng, chuẩn Accessibility (a11y), bảo mật phân quyền RBAC và trải nghiệm người dùng (UI/UX) cho học sinh/giáo viên K-12.

---

## 1. TỔNG QUAN HỆ THỐNG & METRICS HIỆN TẠI
- **Framework & Core Tech:**
  - Frontend: SvelteKit 5 (Modern Runes `$state`, `$derived`, `$effect`, snippets), Vite 5, Tailwind CSS v3.
  - State Management: `src/lib/stores/unifiedStore.js` (Reactive LocalStorage + Telegram Bot Push + SQLite Sync).
  - Dual Persistence Architecture:
    - SQLite DB: `data/tienganh7.db` (Bảo đảm ACID, ràng buộc khóa ngoại, query nhanh trên server).
    - JSON Local Database: `src/lib/data/*.json` (Phục vụ Static Web / Cloudflare Pages / Offline Edge).
  - PWA & Offline: Service Worker CacheFirst/NetworkFirst, Web App Manifest, OTA In-app Update Banner.
  - Second Brain: Obsidian Vault với 15 nguồn học liệu cào tự động, liên kết 2 chiều (bi-directional wiki-links), hơn {metrics['vault_notes']} tài liệu markdown.
- **Dữ liệu hiện hành:**
  - Bộ đề thi: **{metrics['exam_count']} đề thi** chuẩn hóa cho 12 khối lớp (Lớp 1 -> Lớp 12) + KET (A2), PET (B1), IELTS. Mỗi khối lớp đều đủ bộ 3: 5 phút, 15 phút, 45 phút.
  - Ngân hàng câu hỏi: **{metrics['question_count']} câu hỏi** trắc nghiệm có phân loại độ khó, giải thích chi tiết, gắn tag ngữ pháp.
  - Ngân hàng từ vựng: **{metrics['vocab_count']} từ vựng**.
  - Dual SQLite Database: {json.dumps(metrics['db_metrics'], ensure_ascii=False)}.

---

## 2. KIẾN TRÚC MÃ NGUỒN (CODEBASE ARCHITECTURE)
### 2.1 Luồng Dữ Liệu & Phân Quyền (RBAC Flow)
- **Role Hierarchy:**
  - `admin` (Toàn quyền quản trị học sinh, học phí, lịch học, đề thi, role transfer).
  - `leader` (Tổ trưởng học tập: xem tiến độ, phê duyệt ca học, nhận thông báo Telegram & Push).
  - `teacher` (Giáo viên: chấm bài, điểm danh, tạo game học tập).
  - `student` (Học sinh: làm bài thi theo đúng lớp phân quyền, học từ vựng, chơi game ôn luyện).
- **Cơ chế Grade Locking (Khóa lớp nghiêm ngặt):**
  - Học sinh chỉ nhìn thấy và làm được các bài thi thuộc đúng khối lớp của mình (hoặc các bài KET/PET/IELTS nếu có nguyện vọng đăng ký).
  - Việc chuyển lớp chỉ thực hiện được thông qua Admin/Leader tại `/admincp` (được bảo vệ qua modal xác nhận và API cập nhật).

### 2.2 SvelteKit 5 Runes & Reactive Store
- `unifiedStore.js` đóng vai trò Single Source of Truth (SSOT). Mọi tương tác (login, submit exam, update profile, toggle dark mode) đều chạy qua unifiedStore và lưu vào localStorage.

---

## 3. PHÂN TÍCH AUDIT: CÁC ĐIỂM CẦN NÂNG CẤP & CẢI THIỆN
Dưới đây là 5 khu vực trọng tâm cần sự phân tích, mổ xẻ và đề xuất giải pháp từ GPT-6:

### A. GIAO DIỆN PHÒNG THI & TRẢI NGHIỆM LÀM BÀI (EXAM ENGINE UI/UX)
1. **Thiếu Bảng Điều Hướng Câu Hỏi (Question Palette / Navigator):**
   - *Hiện trạng:* Đề thi 45 phút (25-40 câu) hiện hiển thị dưới dạng một danh sách cuộn dọc dài. Học sinh phải cuộn mỏi tay để kiểm tra xem câu nào chưa làm.
   - *Vấn đề:* Dễ bỏ sót câu hỏi ở cuối hoặc mất thời gian tìm lại câu hỏi khó.
   - *Đề xuất:* Cần 1 thanh Floating Drawer hoặc Sidebar dạng lưới ô vuông (1..N) hiển thị trạng thái màu:
     - Xám: Chưa trả lời.
     - Xanh lá: Đã chọn đáp án.
     - Vàng cam: Đã đánh dấu cần xem lại (Flag for review).
     - Nhấp vào ô bất kỳ sẽ cuộn mượt (smooth scroll) hoặc chuyển ngay đến câu hỏi đó.
2. **Thiếu Tính Năng "Đánh Dấu Xem Lại" (Flag for Review):**
   - Học sinh khi gặp câu khó cần gắn cờ `🚩 Đánh dấu xem lại` để sau khi hoàn thành các câu dễ có thể lọc nhanh và xem lại trước khi bấm nộp bài.
3. **Phím Tắt Bàn Phím (Keyboard Hotkeys):**
   - Cho phép học sinh dùng bàn phím máy tính: Phím `1, 2, 3, 4` hoặc `A, B, C, D` để chọn đáp án; Phím `Mũi tên Trái / Phải` hoặc `J / K` để chuyển câu tiếp theo/trước đó.
4. **Visual Timer Micro-interaction & Focus Mode:**
   - Đồng hồ đếm ngược cần đổi màu sinh động: Xanh lá (> 50% thời gian) -> Vàng (10%-50%) -> Đỏ nhấp nháy (< 2 phút).
   - Chế độ "Tập trung tối đa" (Focus Mode / Fullscreen) giúp học sinh không bị phân tâm bởi thanh điều hướng bên ngoài.

### B. CHUẨN ACCESSIBILITY (A11Y) & CODING STANDARDS (SVELTE 5)
1. **Unassociated Form Labels (`a11y_label_has_associated_control`):**
   - Trong `src/routes/evaluations/+page.svelte` (dòng 894, 903, 916, 925, 937, 946, 957, 979, 987, 995, 1086, 1097, 1119, 1130, 1141, 1150, 1197, 1213, 1229) và `SessionEditModal.svelte`: Các thẻ `<label>` không có thuộc tính `for="..."` trỏ tới `id="..."` của control, hoặc dùng `<label>` để bọc nút bấm không theo chuẩn ngữ nghĩa.
2. **Reactivity Trap (`state_referenced_locally`):**
   - Trong `src/routes/grammar/+page.svelte` (dòng 6, 7, 8):
     `let searchQuery = $state(data.initialSearch || '');`
     Svelte 5 compiler cảnh báo biến `$state` này chỉ bắt giá trị ban đầu của prop `data`, khi SSR hoặc routing điều hướng thì không cập nhật theo reactive context. Cần chuyển sang `$derived` hoặc đồng bộ thông qua `$effect`.
3. **Modal Dialog Semantics & Focus Management:**
   - Các modal hiện đang dùng thẻ `<div>` hoặc `<aside>` với `role="dialog"`. Cần bổ sung `aria-modal="true"`, `aria-labelledby="modal-title"`, xử lý phím `Escape` và Focus Trap.

### C. HIỆU NĂNG TẢI TRANG & CHUNKING (BUNDLE PERFORMANCE)
1. **Phân tích kích thước Chunks thực tế từ Vite Build:**
   - `chunks/staticDb.js`: **327.31 kB** (gzip: 59.35 kB)
   - `chunks/unifiedStore.js`: **176.87 kB** (gzip: 42.18 kB)
   - `chunks/second_brain_vault.js`: **143.23 kB** (gzip: 27.69 kB)
   - `chunks/grammar_topics.js`: **68.15 kB** (gzip: 21.73 kB)
   - Tổng payload JS tải xuống khi vào ứng dụng vượt ngưỡng 700KB. Cần phân tách dynamic import / lazy load theo route (Code Splitting).
2. **Kích thước unifiedStore.js:**
   - Store hiện chứa cả mock data, business logic quản lý lớp học, bot dispatcher và logic tạo đề ngẫu nhiên. Cần tách thành các sub-stores modular (`authStore.js`, `examStore.js`, `classStore.js`, `notificationStore.js`).

### D. OFFLINE RESILIENCE & QUEUE ĐỒNG BỘ (PWA / NETWORK)
1. **Bộ Đệm Chống Mất Dữ Liệu Khi Rớt Mạng:**
   - Khi học sinh bấm nộp bài thi trong điều kiện mạng 4G/Wi-Fi chập chờn, nếu request gửi về Telegram Bot hoặc server thất bại, bài thi hiện được lưu trong localStorage nhưng chưa có cơ chế Background Sync Queue tự động thử lại (exponential backoff retry).
   - Cần bổ sung một Offline Sync Queue bằng IndexedDB để tự động đồng bộ khi có mạng trở lại (`navigator.onLine`).

### E. THIẾT KẾ CHO ĐIỆN THOẠI MÀN HÌNH NHỎ (MOBILE SCREEN DENSITY < 375PX)
1. **Căn chỉnh Mobile UI:**
   - Ở các thiết bị iPhone SE hoặc màn hình hẹp (360px - 375px), bộ lọc thí sinh và các nút bấm tại modal chân trang bị sát mép hoặc rớt dòng không đẹp.
   - Cần tinh chỉnh padding (`px-2 sm:px-4`), kích thước font (`text-xs`), và touch target tối thiểu 44x44px theo chuẩn Apple HIG / Google Material.

---

## 4. YÊU CẦU ĐÁNH GIÁ DÀNH CHO GPT-6
Dựa trên kiến trúc và các phát hiện trên, xin GPT-6 thực hiện đánh giá chi tiết theo 4 phần:
1. **Đánh giá kiến trúc SvelteKit 5 & State Management:**
   - Đưa ra giải pháp phân rã `unifiedStore.js` thành các Runes module nhỏ gọn, hiệu năng cao nhất theo chuẩn Svelte 5.
2. **Thiết kế chi tiết cho Giao diện Phòng Thi (Exam UI/UX Blueprint):**
   - Đề xuất layout mẫu (Wireframe code bằng Tailwind CSS) cho Floating Question Navigator Palette (lưới câu hỏi 1..N kèm trạng thái Đã làm / Chưa làm / Cờ xem lại).
   - Cách bổ sung Keyboard Hotkeys (A/B/C/D, Navigation) gọn gàng trong Svelte 5 component.
3. **Chiến lược Offline Sync Queue với IndexedDB / Service Worker:**
   - Kiến trúc giải pháp lưu bài thi offline khi rớt mạng và cơ chế retry tự động gửi lên server/Telegram khi có kết nối lại.
4. **Lộ trình thực hiện ưu tiên (Actionable Prioritization Roadmap):**
   - Phân loại rõ các hạng mục: P0 (Làm ngay), P1 (Cải thiện trong tuần), P2 (Dài hạn).
"""
    
    with open(OUTPUT_PROMPT_PATH, 'w', encoding='utf-8') as f:
        f.write(prompt)
        
    print(f"Audit prompt generated successfully at: {OUTPUT_PROMPT_PATH}")
    print(f"Total prompt length: {len(prompt)} characters")
    return OUTPUT_PROMPT_PATH

if __name__ == '__main__':
    generate_audit_payload()
