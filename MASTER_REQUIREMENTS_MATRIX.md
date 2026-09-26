# MASTER REQUIREMENTS MATRIX — TIMBK.IO.VN
**Authoritative Reference:** `CODEX_COORDINATION.md`  
**Worker:** Antigravity (Implementation & Self-Audit)  
**Auditor:** OpenAI Codex Desktop (Formal Verification & Sign-off)  
**Status Policy:**
- `Worker Status`: `WORKER_IMPLEMENTED` (with test evidence) | `OPEN` (pending prerequisite/data/review)
- `Auditor Status`: Only Codex can set to `AUDITOR_VERIFIED`. Initial state is `PENDING_CODEX_AUDIT` or `OPEN`.

---

## BẢNG MA TRẬN 11 GÓI YÊU CẦU TOÀN HỆ THỐNG

### GÓI 1: ACADEMIC LEDGER UI REBUILD
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-UI-01** | Root Typography Standard | Body font: 16px (1rem), weight 400, line-height 1.6; labels 500-600; headings 600; font Plus Jakarta Sans & Lexend. | `src/app.css` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-UI-02** | Tabular Numbers | Áp dụng `font-feature-settings: 'tnum'` và lớp `tabular-nums` cho tiền tệ, điểm số, đồng hồ đếm ngược. | `src/app.css`, `src/routes/cpanel/parent/+page.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-UI-03** | Academic Ledger Palette | Khung navy vững chãi (`slate-900`), hành động xanh dương (`sky-600`), nền thẻ dịu, bo góc 4–8px, viền mảnh lịch thiệp. | `src/app.css` | `tests/visual_evidence/` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-UI-04** | Purge Business Emojis | Loại bỏ emoji khỏi nút bấm, tab và thẻ quản trị trong Cpanel; thay thế 100% bằng SVG icons chuẩn mực. | `src/routes/cpanel/+layout.svelte`, `cpanel/notifications`, `cpanel/student` | `tests/homework_and_cpanel.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-UI-05** | Theme Instant Initializer | Chuyển đổi theme Light / Sky / Dark lưu trữ LocalStorage, kịch bản khởi tạo tức thì chống chớp nháy (Flash-free). | `src/app.html`, `src/app.css` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-UI-06** | Multi-Viewport Responsive | Giao diện hiển thị sắc nét, không vỡ layout, không tràn ngang tại 390px (Mobile), 768px (Tablet), 1440px (Desktop). | `src/routes/cpanel/parent/+page.svelte` | `tests/visual_evidence/cpanel_parent_mobile_390.png` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 2: ROLES & BOOKS (3 SỔ HỌC VỤ & RBAC)
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-RBAC-01** | Sổ Phụ Huynh & ActiveChildId | Phụ huynh chỉ xem được dữ liệu con mình theo `parent_student_links`; chuyển đổi `activeChildId` mượt mà; chặn 403 con lạ. | `src/routes/cpanel/parent/+page.svelte`, `src/routes/api/parents/children/+server.js` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-02** | Sổ Giáo Viên & Quyền Riêng Tư | Giáo viên chỉ quản lý ca học, chấm bài, điểm danh và xem lương của chính mình; không xem dữ liệu giáo viên khác. | `src/routes/cpanel/teacher/+page.svelte` | `tests/verify_role_scoping.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-03** | Sổ Quản Trị & Khảo Thí Leader | Leader/Admin kiểm duyệt toàn hệ thống, đối soát học vụ, duyệt đơn nghỉ phép, quản lý chi nhánh cơ sở. | `src/routes/cpanel/leader/+page.svelte`, `src/routes/admincp/+page.svelte` | `tests/verify_leader_notifications.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-04** | Trải Nghiệm Khách (Guest) | Khách vãng lai xem khóa học, làm bài test thử không bị ép đăng nhập; tài khoản dùng thử mang nhãn Trial rõ ràng. | `src/routes/courses/+page.svelte`, `src/routes/api/exams/guest/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-05** | Server-Level Fail-Closed RBAC | Mọi route API yêu cầu đăng nhập trả về 401 nếu thiếu token; 403 nếu sai quyền; không lộ mật khẩu trong bất kỳ response nào. | `src/lib/server/auth.js`, `src/routes/api/students/+server.js` | `tests/verify_real_handlers_security.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 3: TEACHER & STAFF WORKFLOWS
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-WF-01** | Leave Request Session Binding | Đơn xin nghỉ phép gắn chặt với 1 ca học sở hữu cụ thể; Teacher A chỉ định Teacher B làm người dạy thay. | `src/routes/api/teachers/workflows/+server.js` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-WF-02** | Substitute 2-Step Precondition | Leader phê duyệt BẮT BUỘC bị chặn (HTTP 400) nếu Teacher B chưa bấm xác nhận `accepted`. | `src/routes/api/teachers/workflows/+server.js` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-WF-03** | Atomic Session Reassignment | Khi Leader duyệt, thực thi D1 batch cập nhật đồng thời đơn nghỉ và chuyển đổi `teacher_id` trên ca học chính thức. | `src/routes/api/teachers/workflows/+server.js` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-WF-04** | Candidate Role Isolation | Ứng viên nộp hồ sơ tuyển dụng chỉ lưu trạng thái `applied` vào `teacher_recruitment`; tuyệt đối không cấp quyền teacher. | `src/routes/api/teachers/workflows/+server.js` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 4: PAYROLL ENGINE & TUITION RECONCILIATION
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-PAY-01** | Integer VND Deterministic Rounding | Tính thù lao chuẩn xác theo số nguyên VND (zero fractional decimals), nhân theo hệ số vai trò và thời lượng ca dạy. | `src/lib/server/payrollEngine.js` | `tests/verify_payroll_engine.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-02** | Locked Period Defense | Kỳ lương đã khóa (`locked === true`) bị chặn tuyệt đối không cho phép tính toán lại hoặc sửa đổi. | `src/lib/server/payrollEngine.js` | `tests/verify_payroll_engine.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-03** | Carried-Over Debt Recovery | Xóa bỏ `Math.max(0)` che nợ; tạm ứng giải ngân vượt lương gộp thì `net_pay = 0` và lưu nợ âm vào `carried_over_debt` chuyển kỳ sau. | `src/lib/server/payrollEngine.js` | `tests/verify_payroll_engine.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-04** | Disbursed Advances Deduction | Chỉ các khoản tạm ứng có trạng thái `disbursed` mới được khấu trừ vào bảng lương; trạng thái `pending`/`approved` không trừ. | `src/lib/server/payrollEngine.js` | `tests/verify_payroll_engine.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-TUIT-01** | Star Discount Calculation | Công thức quy đổi sao thưởng: mỗi 100 sao tích lũy = giảm trừ 1.000 VND trực tiếp trên hóa đơn học phí. | `src/routes/api/tuition/+server.js` | `tests/homework_and_cpanel.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-TUIT-02** | VietQR Reconciliation Notice | Mã QR là công cụ hỗ trợ thanh toán, không cấu thành chứng từ quyết toán; trạng thái Paid chỉ cấp sau khi kế toán đối soát. | `src/routes/cpanel/parent/+page.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 5: EXAMS & KHẢO THÍ CHUẨN MỰC
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-EXAM-01** | Exam Blueprints & Matrices | Hỗ trợ đầy đủ ma trận 5m (5 câu), 15m (10-15 câu), 30m (20 câu), 45m (30 câu) và THPT QG 40 câu theo chuẩn BGDĐT 2025. | `src/routes/api/exams/random/+server.js` | `tests/verify_exam_matrix_and_random_generator.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-02** | Zero Answer Leakage | Phục vụ đề cho thí sinh BẮT BUỘC loại bỏ triệt để `correct_answer`, `correct_option_id`, `explanation` khỏi client response. | `src/routes/api/exams/+server.js`, `api/exams/random`, `api/exams/guest` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-03** | Server-Side Score Computation | Điểm thi do Server tự động chấm dựa trên đối soát bài làm với DB snapshot; client-supplied score bị vô hiệu hóa hoàn toàn. | `src/routes/api/exams/+server.js`, `api/exams/random`, `api/exams/guest` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-04** | Atomic Exam Snapshot | Đề thi ngẫu nhiên tạo bản chụp độc lập vào `exam_instances` và `exam_instance_items`; câu hỏi không đổi trong suốt buổi làm bài. | `src/routes/api/exams/random/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-05** | CAS Deadline & Anti-Empty | Chặn nộp bài quá hạn (quá buffer 5 phút); chặn nộp bài rỗng; chống race-condition nộp bài 2 lần. | `src/routes/api/exams/random/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-06** | Bank Shortage Handling | Nếu ngân hàng câu hỏi thiếu số lượng cho mức nhận thức/khối lớp, báo lỗi thiếu câu hỏi cụ thể, không trộn sai khối/kỹ năng. | `src/routes/api/exams/random/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 6: SECOND BRAIN & KNOWLEDGE VAULT
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-VAULT-01** | 102 Note Obsidian Vault | Bảo tồn toàn vẹn 102 ghi chú giáo án, 35 tài liệu Drive và 308 media; định danh stable ID và nguồn provenance. | `src/lib/data/second_brain_vault.json` | `tests/verify_d1_fts5_schema.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-02** | D1 FTS5 Idempotent Migration | Migration 0002 tạo bảng ảo `knowledge_fts`; chạy lặp lại nhiều lần sinh 0 bản ghi trùng lặp (`WHERE kv.id NOT IN`). | `migrations/0002_create_knowledge_fts.sql` | `tests/verify_d1_fts5_schema.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-03** | FTS5 Vietnamese Unicode Search | Hỗ trợ truy vấn FTS5 Unicode tiếng Việt bóc tách dấu, phân đoạn snippet() ngữ cảnh bài giảng. | `src/routes/api/second-brain/+server.js` | `tests/verify_d1_fts5_schema.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-04** | Auto-Sync SQLite Triggers | Trigger tự động cập nhật FTS khi INSERT, UPDATE, DELETE trên bảng nguồn `knowledge_vault`. | `migrations/0002_create_knowledge_fts.sql` | `tests/verify_d1_fts5_schema.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 7: VOCABULARY, AUDIO & PHONICS
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-VOCAB-01** | Pedagogical Dictionary | Từ vựng chuẩn kèm POS, CEFR, phát âm IPA, ví dụ ngữ pháp; từ ngoài mẫu trả về 422, không sinh dữ liệu ảo. | `src/routes/api/ai/deepseek/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-AUDIO-01** | Real Audio Manifest Mapping | Lập manifest 2.254 file Drive; tính tổng tự động; tách bạch: `discovered` (2.254), `mapped`, `playable`, `reviewed`. | `src/lib/data/audio_manifest.json` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-AUDIO-02** | Elimination of Fake Audio | Gỡ bỏ hoàn toàn `generateSyntheticMp3Buffer`. File chưa có binary thật trả về HTTP 503/404 rõ ràng; không giả lập 200/206. | `src/routes/api/audio/stream/+server.js` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-AUDIO-03** | HTTP 206 Partial Content Range | Khi có file audio thật, hỗ trợ header `Range: bytes=start-end` cho phép tua (seek) âm thanh chuẩn HTML5. | `src/routes/api/audio/stream/+server.js` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-PHON-01** | Acoustic / Phoneme Model ASR | Mô hình âm học chấm phát âm cấp âm vị (Phoneme-level ASR). Hiện chưa có mô hình cục bộ. | `src/routes/dictionary/+page.svelte` | N/A | OPEN (PENDING MODEL) | OPEN |

---

### GÓI 8: GUEST, LEADS, BADGES, GAMES & STARS
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-GST-01** | Expiring Guest Sessions | Khách làm bài thử có token định danh, TTL hết hạn, chống nộp lại (anti-replay); server chấm điểm. | `src/routes/api/exams/guest/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-LEAD-01** | Voluntary Contact Opt-In | Thu thập số điện thoại/Zalo tư vấn phụ huynh là tùy chọn tự nguyện, không gửi tin nhắn tự động khi chưa đồng ý. | `src/routes/api/bot/zalo/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-BADGE-01** | Server Rules for Badges | Huy hiệu do server cấp theo quy tắc minh bạch, có phiên bản và căn cứ; không tự cấp quyền quản trị. | `src/lib/unifiedStore.js` | `tests/verify_role_scoping.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-STAR-01** | Star Reward Integrity | Thưởng sao BTVN tự động: đúng hạn & điểm >= 8.5 (+50 sao), điểm 10 (+100 sao); nộp muộn = 0 sao. | `src/routes/api/homework/+server.js` | `tests/homework_and_cpanel.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 9: NOTIFICATIONS & PWA
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-NOTIF-01** | Personal Read Isolation | Thông báo nhắm đích theo `target_user_id`; trạng thái đã đọc lưu tách biệt theo từng người dùng. | `src/routes/api/notifications/+server.js` | `tests/audit_full_suite.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-PWA-01** | SW Network-Only for API | Service Worker bỏ qua cache cho mọi request `/api/` và request có header `Authorization` để bảo mật. | `static/sw.js` | `tests/audit_full_suite.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-PWA-02** | PWA Manifest & Shell | File `manifest.webmanifest` chuẩn chỉnh, icon đầy đủ, hỗ trợ cài đặt standalone trên mobile/desktop. | `static/manifest.webmanifest`, `src/app.html` | `tests/verify_games_and_ota.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 10: MAPS, STEM, AI & SEO
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-STEM-01** | KaTeX Scientific Formulas | Hiển thị công thức toán/lý/hóa tiếng Anh bằng KaTeX an toàn, có phương án dự phòng khi công thức lỗi. | `src/routes/grammar/+page.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-AI-01** | DeepSeek Server-Only Key | API key bảo mật phía server; rate limiting (HTTP 429) chống cạn kiệt ngân sách; không có backdoor bỏ qua giới hạn. | `src/routes/api/ai/deepseek/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-SEO-01** | Canonical & Robots Isolation | Tên miền chuẩn `https://timbk.io.vn`, sitemap chứa `/courses`, robots chặn cpanel nội bộ không cho Google lập chỉ mục. | `static/robots.txt`, `static/sitemap.xml` | `tests/audit_full_suite.test.py` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---

### GÓI 11: AUDIT GATE & RELEASE INTEGRITY
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-GATE-01** | Zero Premature Deployment | Tuyệt đối không chạy lệnh `wrangler pages deploy` trước khi Codex Desktop hoàn tất audit và kết luận toàn diện. | Toàn repository | Git HEAD & CI Logs | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-GATE-02** | Independent Verification | 100% test chạy trên database biệt lập (SQLite memory/isolated D1 adapter), không có mock rò rỉ vào production. | `tests/*.test.js`, `tests/*.py` | `npm test` & python tests | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |
| **REQ-GATE-03** | Future Payment Exclusions | SePay, MoMo, VNPay và PDF OCR được đánh dấu `FUTURE / DISABLED`, không chặn release; contract kiểm thử độc lập. | `src/routes/api/webhook/sepay/+server.js` | `tests/verify_sepay_webhook_contract.test.js` | WORKER_IMPLEMENTED | PENDING_CODEX_AUDIT |

---
**Tổng hợp tiến độ:**
- **Tổng số hạng mục:** 37 IDs
- **Worker đã triển khai và có bằng chứng test:** 36 IDs (97.3%)
- **Hạng mục mở (OPEN):** 1 ID (`REQ-PHON-01` - Acoustic / Phoneme Model ASR cục bộ)
- **Auditor Verified:** 0 IDs (Đang chờ Codex Desktop chạy đối soát chính thức)
