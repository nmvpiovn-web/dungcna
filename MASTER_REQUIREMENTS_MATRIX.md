# BẢNG MA TRẬN YÊU CẦU TOÀN DIỆN V4 (MASTER REQUIREMENTS MATRIX V4)
**Authoritative Reference:** `CODEX_COORDINATION.md`, `ANTIGRAVITY_REQUIREMENTS_FULL_SCOPE_AND_DRIVE_2026-09-27.md` & `AUDIT_FEEDBACK_9f47b92_G1_UI_EVIDENCE_2026-09-28.md`  
**Worker:** Antigravity (Implementation & Self-Audit)  
**Auditor:** OpenAI Codex Desktop (Formal Verification & Sign-off)  
**Ngày cập nhật:** 2026-09-28  
**Chính sách trạng thái:**
- `Worker Status`: `NOT_STARTED` | `WORKER_TESTED` | `OPEN` | `BLOCKED` | `DEFERRED`
- `Auditor Status`: Chỉ Codex Desktop cập nhật `AUDITOR_VERIFIED`. Trạng thái hiện tại: `AUDIT_IN_PROGRESS / HOLD`.
- **Nguyên tắc cốt lõi:** Không tính phần trăm phát hành (release percentage) từ số assertion PASS. Mọi quyết định phát hành phụ thuộc hoàn toàn vào chứng chỉ nghiệm thu của Auditor.

---

## BẢNG CHI TIẾT 12 GÓI YÊU CẦU HỆ THỐNG V4

### GÓI 1: ACADEMIC LEDGER UI REBUILD
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-UI-01** | Root Typography Standard | Body font: 16px (1rem), weight 400; label weight 500; heading weight 600 strictly enforced with `!important` in `src/app.css`; triệt tiêu `font-black` (900) và `font-extrabold` (800). | `src/app.css`, `src/routes/+page.svelte` | `scripts/verify_g1_real_browser_evidence.mjs` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-02** | Tabular Numbers for Money/Scores | Áp dụng `font-feature-settings: 'tnum'` và lớp `tabular-nums` cho tiền tệ, điểm số, đồng hồ đếm ngược. | `src/app.css`, `cpanel/parent/+page.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-03** | Academic Ledger Palette | Bảng màu Sky Blue (`--primary: #0284c7`), Slate 900 (`#0f172a`), viền mảnh 1px (`#cbd5e1`), bo góc tinh gọn 4–8px, loại bỏ gradient neon sặc sỡ. | `src/app.css`, `src/routes/+page.svelte` | `scripts/verify_g1_real_browser_evidence.mjs` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-04** | Purge Business Emojis | Loại bỏ emoji khỏi nút bấm, tab và thẻ quản trị trong Cpanel; thay thế 100% bằng SVG icons chuẩn mực. | `src/routes/cpanel/+layout.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-05** | Theme Instant Initializer | Chuyển đổi theme Light / Sky / Dark lưu LocalStorage, script khởi tạo tức thì chống chớp nháy (Flash-free). Đo kiểm computed styles trên real elements. | `src/app.html`, `src/app.css` | `scripts/verify_g1_real_browser_evidence.mjs` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-06** | Multi-Viewport Responsive | Giao diện sắc nét, không vỡ layout, không tràn ngang tại 390px (Mobile `scrollWidth <= 390`), 768px (Tablet), 1280px (Desktop). | `src/routes/+page.svelte`, `+layout.svelte` | `scripts/verify_g1_real_browser_evidence.mjs` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-07** | Focus, Keyboard & A11y States | Focus ring rõ ràng (`ring-2 ring-sky-500`), điều hướng bàn phím đầy đủ, độ tương phản WCAG AA, zoom 200% không cắt chữ. | `src/app.css` | `scripts/verify_g1_real_browser_evidence.mjs` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-UI-08** | Full State Handlers | Mọi bảng dữ liệu có đủ 5 trạng thái: loading skeleton, empty state, error banner, retry button, và success view. | `cpanel/teacher`, `cpanel/parent` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 2: ROLES & BOOKS (3 SỔ HỌC VỤ & RBAC V4)
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-RBAC-01** | Sổ Phụ Huynh & ActiveChildId | Phụ huynh chỉ xem được dữ liệu con mình theo `parent_student_links`; chuyển đổi `activeChildId` mượt mà; chặn 403 con lạ. | `cpanel/parent/+page.svelte`, `api/parents/children` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-02** | Sổ Giáo Viên & Quyền Riêng Tư | Giáo viên chỉ quản lý ca học, chấm bài, điểm danh và xem lương của chính mình; không xem dữ liệu giáo viên khác. | `cpanel/teacher/+page.svelte` | `tests/verify_role_scoping.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-03** | Sổ Quản Trị & Khảo Thí Leader | Leader/Admin kiểm duyệt toàn hệ thống, đối soát học vụ, duyệt đơn nghỉ phép, quản lý chi nhánh cơ sở. | `cpanel/leader/+page.svelte`, `admincp` | `tests/verify_leader_notifications.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-04** | Trải Nghiệm Khách (Guest) | Khách vãng lai xem khóa học, làm bài test thử không bị ép đăng nhập; tài khoản dùng thử mang nhãn Trial rõ ràng. | `courses/+page.svelte`, `api/exams/guest` | `tests/verify_real_behavioral_audit.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-RBAC-05** | Server-Level Fail-Closed RBAC | Mọi route API yêu cầu đăng nhập trả về 401 nếu thiếu token; 403 nếu sai quyền; không lộ mật khẩu trong response. | `src/lib/server/auth.js`, `api/students` | `tests/verify_real_handlers_security.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-AUTH-V4-01** | Family Switch (Multi-Child Profile) | Cho phép phụ huynh liên kết nhiều con, chuyển đổi context xem bài tập, học phí, chuyên cần; nếu liên kết bị thu hồi (`revoked`) thì lập tức cách ly, không rò rỉ thông báo hoặc điểm thi. | `api/parents/children`, `src/routes/api/notifications` | `tests/verify_g1_notification_policy.test.js` (Fixture A & B) | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-AUTH-V4-02** | Password Step-up / Re-authentication | Yêu cầu xác thực mật khẩu bổ sung cho các thao tác học vụ nhạy cảm (đổi thông tin ngân hàng, hủy tài khoản, đổi số điện thoại Zalo). | `src/lib/server/auth.js`, `api/auth/token` | `tests/verify_p1_feedback_94f88ea.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-AUTH-V4-03** | Trusted Device / Session Revocation | Quản lý phiên làm việc tin cậy (trusted session token); nút đăng xuất UI thực hiện xóa token cả client lẫn cookie, khiến protected API lập tức trả về HTTP 401. | `src/routes/+layout.svelte`, `src/lib/unifiedStore.js` | `scripts/verify_g1_real_browser_evidence.mjs` (Section 2) | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 3: TEACHER & STAFF WORKFLOWS & RECRUITMENT TOUR
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-WF-01** | Leave Request Session Binding | Đơn xin nghỉ phép gắn chặt với 1 ca học sở hữu cụ thể; Teacher A chỉ định Teacher B làm người dạy thay. | `api/teachers/workflows` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-WF-02** | Substitute 2-Step Precondition | Leader phê duyệt BẮT BUỘC bị chặn (HTTP 400) nếu Teacher B chưa bấm xác nhận `accepted`. | `api/teachers/workflows` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-WF-03** | Atomic Session Reassignment | Khi Leader duyệt, thực thi D1 batch cập nhật đồng thời đơn nghỉ và chuyển đổi `teacher_id` trên ca học chính thức. | `api/teachers/workflows` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-WF-04** | Candidate Role Isolation | Ứng viên nộp hồ sơ tuyển dụng chỉ lưu trạng thái `applied` vào `teacher_recruitment`; tuyệt đối không cấp quyền teacher. | `api/teachers/workflows`, `recruitment` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-WF-05** | Interview Schedule & Status Flow | Quản lý lịch phỏng vấn, đổi lịch, ghi nhận kết quả và phê duyệt tuyển dụng; hồ sơ CV bảo mật riêng tư. | `src/routes/recruitment/+page.svelte` | `tests/verify_teacher_workflows_e2e.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-TOUR-V4-01** | Recruitment Form Dirty & Tour | Form ứng tuyển `/recruitment` tự động đăng ký trạng thái bận (`dirty`, `isAppBusy() === true`) khi nhập liệu; tour giới thiệu tính năng không làm mất dữ liệu đã nhập. | `src/routes/recruitment/+page.svelte` | `scripts/verify_g1_real_browser_evidence.mjs` (Section 5) | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 4: PAYROLL ENGINE & ATOMIC DEBT LEDGER
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-PAY-01** | Integer VND Rounding | Tính thù lao chuẩn xác theo số nguyên VND (zero fractional decimals), nhân theo hệ số vai trò và thời lượng ca dạy. | `src/lib/server/payrollEngine.js` | `tests/verify_payroll_engine.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-02** | Locked Period Defense | Kỳ lương đã khóa (`locked`, `closed`, `paid`, `approved`) được bảo toàn bất biến; payload snapshot đồng bộ tuyệt đối với `existing_record.status`; chặn tính lại khi giải ngân. | `payrollEngine.js`, `api/teachers/payroll` | `tests/verify_payroll_engine.test.js`, `tests/verify_phase1_audit_hardening.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-03** | Carried-Over Debt Recovery | Xóa bỏ `Math.max(0)` che nợ; tạm ứng vượt lương thì `net_pay = 0` và lưu nợ âm vào `carried_over_debt` chuyển nạp kỳ sau. | `payrollEngine.js`, `api/teachers/payroll` | `tests/verify_payroll_engine.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-04** | Disbursed Advances Deduction | Chỉ các khoản tạm ứng có trạng thái `disbursed` mới được khấu trừ vào bảng lương; trạng thái `pending`/`approved` không trừ. | `payrollEngine.js`, `api/teachers/payroll` | `tests/verify_payroll_engine.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PAY-05** | Production Payroll Endpoint & Cpanel UI | Endpoint `/api/teachers/payroll` kết nối D1 `teacher_payrolls` & `finance_ledger`; giải ngân nguyên tử bắt buộc qua `db.batch`; thiếu `db.batch` trả về HTTP 500 fail-closed; không dùng compensating DELETE. | `api/teachers/payroll`, `cpanel/teacher`, `cpanel/leader` | `tests/verify_p1_feedback_94f88ea.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-TUIT-01** | Star Discount Calculation | Công thức quy đổi sao thưởng: mỗi 100 sao tích lũy = giảm trừ 1.000 VND trực tiếp trên hóa đơn học phí. | `src/routes/api/tuition/+server.js` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-TUIT-02** | VietQR Reconciliation Notice | Mã QR là công cụ hỗ trợ thanh toán, không cấu thành chứng từ quyết toán; trạng thái Paid chỉ cấp sau khi kế toán đối soát. | `cpanel/parent/+page.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-TUIT-03** | Tuition Modes & Debt Lifecycle | Quản lý học phí tháng/ca/khóa; theo dõi nghỉ, bù, giảm, thu, hoàn và nợ học phí xuyên suốt. | `src/routes/api/tuition/+server.js` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-LEDGER-V4** | Real Transactional Debt Ledger | Bảng `student_star_ledger` lưu trữ nguyên tử `debt_delta` và `debt_after` bằng subquery SQL trong cùng transaction; không dùng hardcoded 0 placeholder; tổng `debt_delta` đối soát chính xác với `debt_after`. | `src/routes/api/homework/+server.js`, `api/tuition/+server.js` | `tests/verify_g1_notification_policy.test.js` (Fixture F.5) | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 5: EXAMS & KHẢO THÍ CHUẨN MỰC
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-EXAM-01** | Exam Blueprints & Matrices | Hỗ trợ đầy đủ ma trận 5m (5 câu), 15m (15 câu), 30m (20 câu), 45m (30 câu) và THPT QG 40 câu theo chuẩn BGDĐT 2025. | `api/exams/random`, `api/exams` | `tests/verify_exam_matrix_and_random_generator.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-02** | Zero Answer Leakage | Phục vụ đề cho thí sinh BẮT BUỘC loại bỏ triệt để `correct_answer`, `correct_option_id`, `explanation` khỏi client response. | `api/exams/+server.js`, `api/exams/random` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-03** | Server-Side Score Computation | Điểm thi do Server tự động chấm dựa trên đối soát bài làm với DB snapshot; client-supplied `body.score` bị vứt bỏ. | `api/exams/+server.js`, `api/exams/random` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-04** | Server Enforced Max Score | Client `body.max_score` bị chặn không cho phép phóng đại scale; thang điểm 10 chuẩn mực do Server quyết định. | `src/routes/api/exams/+server.js` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-05** | D1 Exam Persistence & Safe Migration | Migration DDL fail-closed (HTTP 500) khi gặp lỗi DB/IO/constraint thật, chỉ bỏ qua duplicate column; chặn tạo session khi migration lỗi. | `src/routes/api/exams/+server.js` | `tests/verify_p1_feedback_94f88ea.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-06** | Server-Owned Lifecycle & Mandatory Batch | `duration_minutes` server-owned; bắt buộc dùng `db.batch`; học sinh nộp bài phải qua active session; chấm điểm từ `answer_key_snapshot_json` đóng băng. | `src/routes/api/exams/+server.js` | `tests/verify_p1_feedback_94f88ea.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-EXAM-07** | Bank Shortage Handling | Nếu ngân hàng câu hỏi thiếu số lượng cho mức nhận thức/khối lớp, báo lỗi thiếu câu hỏi cụ thể, không trộn sai khối/kỹ năng. | `api/exams/random`, `api/exams` | `tests/verify_real_behavioral_audit.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 6: SECOND BRAIN & KNOWLEDGE VAULT
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-VAULT-01** | 102 Note Obsidian Vault | Bảo tồn toàn vẹn 102 ghi chú giáo án, 35 tài liệu Drive và 308 media; định danh stable ID và nguồn provenance. | `src/lib/data/second_brain_vault.json` | `tests/verify_d1_fts5_schema.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-02** | D1 FTS5 Idempotent Migration | Migration 0002 tạo bảng ảo `knowledge_fts`; chạy lặp lại nhiều lần sinh 0 bản ghi trùng lặp (`WHERE id NOT IN`). | `migrations/0002_create_knowledge_fts.sql` | `tests/verify_d1_fts5_schema.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-03** | FTS5 Vietnamese Unicode Search | Hỗ trợ truy vấn FTS5 Unicode tiếng Việt bóc tách dấu, phân đoạn snippet() ngữ cảnh bài giảng. | `src/routes/api/second-brain/+server.js` | `tests/verify_d1_fts5_schema.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-04** | Auto-Sync SQLite Triggers | Trigger tự động cập nhật FTS khi INSERT, UPDATE, DELETE trên bảng nguồn `knowledge_vault`. | `migrations/0002_create_knowledge_fts.sql` | `tests/verify_d1_fts5_schema.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-VAULT-05** | Vault Pagination & Lazy Detail | Giao diện `/second-brain` phân trang mượt mà, tải chi tiết lười (lazy load), hiển thị backlinks và chặn XSS. | `src/routes/second-brain/+page.svelte` | `tests/verify_d1_fts5_schema.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 7: VOCABULARY, AUDIO & PHONICS (TRUNG THỰC NGUỒN DRIVE)
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-VOCAB-01** | Pedagogical Dictionary | Từ vựng chuẩn kèm POS, CEFR, phát âm IPA, ví dụ ngữ pháp; từ ngoài mẫu trả về 422, không sinh dữ liệu ảo. | `api/ai/deepseek/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-VOCAB-02** | Stealth SRS Spaced Repetition | Từ điển ghi nhớ ngắt quãng (SRS), ẩn từ đã thuộc nhưng định kỳ hẹn ôn lại, ghi nhận lịch sử học tập. | `src/routes/dictionary/+page.svelte` | `tests/verify_master_plan_v3.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-AUDIO-01** | Real Audio Manifest Mapping | Lập manifest kiểm kê 2.254 file Drive; tách bạch: `discovered` (2.254), `mapped` (15), `playable` (15 track Lớp 7 local). File chưa đồng bộ trả về HTTP 503 `source_pending_download` kèm Drive path & transcript đối chiếu. Drive là luồng học liệu thật, không deferred. | `src/lib/data/audio_manifest.json`, `api/audio/stream` | `tests/verify_parent_multichild_and_audio.test.js` | OPEN (SOURCE_PENDING_DOWNLOAD) | OPEN (FAIL-CLOSED) |
| **REQ-AUDIO-02** | Elimination of Fake Audio | Gỡ bỏ hoàn toàn âm thanh sine và fake MP3; 15 bài nghe Lớp 7 phục vụ bằng nhị phân MPEG-1 Layer 3 thật. | `src/routes/api/audio/stream/+server.js` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_TESTED | AUDITED_OPEN_FAIL_CLOSED |
| **REQ-AUDIO-03** | HTTP 206 Partial Content Range | Hỗ trợ stream âm thanh phân đoạn HTTP 206 Partial Content (Range header), kiểm thử tua thanh phát trong browser DOM. | `src/routes/api/audio/stream/+server.js` | `tests/verify_parent_multichild_and_audio.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PHON-01** | Acoustic / Phoneme Model ASR | Mô hình âm học chấm phát âm cấp âm vị (Phoneme-level ASR). Hiện chưa có tệp weights mô hình cục bộ. | `src/routes/dictionary/+page.svelte` | N/A | BLOCKED (PENDING MODEL) | OPEN |
| **REQ-PHON-02** | Pronunciation Rubric Math | Công thức chấm điểm phát âm 3 thành phần: 60% nguyên âm + 25% trọng âm + 15% độ trôi chảy (Web Audio API). | `src/routes/dictionary/+page.svelte` | `tests/verify_master_plan_v3.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 8: GUEST, LEADS, BADGES, GAMES & STARS
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-GST-01** | Expiring Guest Sessions | Khách làm bài thử có token định danh, TTL hết hạn, chống nộp lại (anti-replay); server chấm điểm. | `src/routes/api/exams/guest/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-LEAD-01** | Voluntary Contact Opt-In | Thu thập số điện thoại/Zalo tư vấn phụ huynh là tùy chọn tự nguyện, không gửi tin nhắn tự động khi chưa đồng ý. | `src/routes/api/bot/zalo/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-BADGE-01** | Server Rules for Badges | Huy hiệu do server cấp theo quy tắc minh bạch, có phiên bản và căn cứ; không tự cấp quyền quản trị. | `src/lib/unifiedStore.js` | `tests/verify_role_scoping.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-STAR-01** | Star Reward Integrity | Thưởng sao BTVN tự động: đúng hạn & điểm >= 8.5 (+50 sao), điểm 10 (+100 sao); nộp muộn = 0 sao. | `src/routes/api/homework/+server.js` | `tests/verify_g1_notification_policy.test.js` (Fixture F) | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-GAME-01** | Pedagogical Vocabulary Games | Trò chơi học tập từ vựng (Flashcards, Ghép thẻ) kết nối kho bài tập, cập nhật tiến độ học tập thật. | `src/routes/games/+page.svelte` | `tests/verify_games_and_ota.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 9: NOTIFICATIONS, MODAL BEHAVIOR & PWA BUSY REGISTRY
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-NOTIF-01** | Personal Read Isolation | Thông báo nhắm đích theo `target_user_id`; trạng thái đã đọc lưu tách biệt theo từng người dùng. | `api/notifications/+server.js` | `tests/verify_g1_notification_policy.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-NOTIF-02** | In-App & Background Push Separation | Phân biệt thông báo in-app và push; targeting chính xác theo role/con/lớp/ca học; khóa màn hình không lộ dữ liệu tài chính. | `cpanel/notifications/+page.svelte` | `tests/verify_leader_notifications.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PWA-01** | SW Network-Only for API | Service Worker bỏ qua cache cho mọi request `/api/` và request có header `Authorization` để bảo mật. | `static/sw.js` | `tests/audit_full_suite.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PWA-02** | PWA Manifest & App Shell | File `manifest.webmanifest` chuẩn chỉnh, icon đầy đủ, hỗ trợ cài đặt standalone trên mobile/desktop. | `static/manifest.webmanifest`, `app.html` | `tests/verify_games_and_ota.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-PWA-03** | Real Busy Producers & Safe Controllerchange | Producer thật (`/exam` active exam, `/recruitment` dirty form) tự động đăng ký `isAppBusy() === true`; khi SW `controllerchange` phát tín hiệu, hệ thống hiển thị `#sw-update-banner` và KHÔNG reload trang; bảo toàn 100% câu trả lời/nội dung form. | `src/app.html`, `src/routes/exam`, `src/routes/recruitment` | `scripts/verify_g1_real_browser_evidence.mjs` (Section 5) | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-MODAL-01** | Real Modal Pointer Dismiss & Answer Safety | Modal đóng được bằng click pointer trên backdrop (`#guest-modal-backdrop`), sau khi đóng trang tiếp tục bấm được bình thường; khi đang làm bài thi, bấm hủy confirm dialog BẮT BUỘC giữ nguyên câu trả lời đã tích và đồng hồ đếm ngược; hỗ trợ popstate back navigation. | `src/lib/components/GuestExamModal.svelte` | `scripts/verify_g1_real_browser_evidence.mjs` (Section 6) | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 10: MAPS, STEM, AI & SEO
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-STEM-01** | KaTeX Scientific Formulas | Hiển thị công thức toán/lý/hóa tiếng Anh bằng KaTeX an toàn, có phương án dự phòng khi công thức lỗi. | `src/routes/grammar/+page.svelte` | `tests/homework_and_cpanel.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-AI-01** | DeepSeek Server-Only Key | API key bảo mật phía server; rate limiting (HTTP 429) chống cạn kiệt ngân sách; không có backdoor bỏ qua giới hạn. | `src/routes/api/ai/deepseek/+server.js` | `tests/verify_real_behavioral_audit.test.js` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-MAP-01** | Verified Campus Coordinates | Xác thực tọa độ 3 cơ sở (Trường Đào Sơn Tây, Nhà Cô Dung Linh Xuân, Cơ Dũng), vị trí địa lý có opt-in. | `src/routes/api/campuses/+server.js` | `tests/verify_master_plan_v3.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-SEO-01** | Canonical & Robots Isolation | Tên miền chuẩn `https://timbk.io.vn`, sitemap chứa `/courses`, robots chặn cpanel nội bộ không cho Google lập chỉ mục. | `static/robots.txt`, `static/sitemap.xml` | `tests/audit_full_suite.test.py` | WORKER_TESTED | PENDING_CODEX_AUDIT |

---

### GÓI 11: DEFERRED EXTERNAL PAYMENTS & OCR
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-DEFER-01** | Automated SePay Payment Gateway | Cổng tự động thanh toán qua SePay Webhook. Đánh dấu `DEFERRED / FUTURE`, ngoài phạm vi đợt release hiện tại. | `src/routes/api/webhook/sepay/+server.js` | `tests/verify_sepay_webhook_contract.test.js` | DEFERRED | DEFERRED |
| **REQ-DEFER-02** | MoMo / VNPay QR Automation | Tự động hóa cổng MoMo/VNPay. Đánh dấu `DEFERRED / FUTURE`, ngoài phạm vi đợt release hiện tại. | N/A | N/A | DEFERRED | DEFERRED |
| **REQ-DEFER-03** | Automated PDF OCR Pipeline | Pipeline tự động bóc tách đề thi PDF bằng OCR thị giác máy tính. Đánh dấu `DEFERRED / FUTURE`, ngoài phạm vi release hiện tại. | `src/lib/components/ParentTestOcrModal.svelte` | N/A | DEFERRED | DEFERRED |

---

### GÓI 12: AUDIT GATE & FORMAL SIGN-OFF POLICY
| ID | Yêu cầu Kỹ thuật / Nghiệp vụ | Tiêu chí đạt (Acceptance Criteria) | Route / Source File | Test Verification File | Worker Status | Auditor Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-GATE-01** | Zero Premature Deployment | Tuyệt đối không chạy lệnh `wrangler pages deploy` trước khi Codex Desktop hoàn tất audit và kết luận toàn diện. | Toàn repository | Git HEAD & CI Logs | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-GATE-02** | Independent Verification | 100% test chạy trên database biệt lập (SQLite memory/isolated D1 adapter), không có mock rò rỉ vào production. | `tests/*.test.js`, `scripts/verify_g1_real_browser_evidence.mjs` | `npm test` & Playwright browser | WORKER_TESTED | PENDING_CODEX_AUDIT |
| **REQ-GATE-03** | Strict Gate Status Accounting | G1 Gate luôn ở trạng thái `HOLD / IN_PROGRESS` cho đến khi có sign-off chính thức từ Codex Desktop; không tự ý tuyên bố ACCEPTED. | `MASTER_REQUIREMENTS_MATRIX.md` | Audit correspondence log | WORKER_TESTED | AUDIT_IN_PROGRESS |

---

## TỔNG KẾT TRẠNG THÁI TOÀN HỆ THỐNG V4

- **Release Gate G1 Status:** **HOLD / IN_PROGRESS** (Chờ thẩm định độc lập từ OpenAI Codex Desktop).
- **Môi trường đo kiểm Browser:**
  - Local Dev Server: `http://127.0.0.1:4173` (Wrangler Pages Dev chạy trên build Cloudflare Pages functions thật).
  - Trình duyệt: Google Chrome 128+ thực tế (`C:\Program Files\Google\Chrome\Application\chrome.exe`).
  - Kết quả kiểm thử trình duyệt: **42/42 Assertions PASS** (bao gồm 4 negative controls, real typography measured styles, real UI profile dropdown & logout click, real navigation dropdowns desktop & mobile drawer 390px, real PWA busy producers `/exam` và `/recruitment`, real modal pointer backdrop click & answer preservation).
- **Kết quả kiểm thử Database (DB Handlers & Isolation):** **38/38 PASS** (`verify_g1_notification_policy.test.js` 17 tests + `verify_p1_feedback_94f88ea.test.js` 21 tests/subtests).
- **Kế toán nợ sao (Star Debt Ledger):** Đã sửa công thức nguyên tử `debt_delta` trong SQL subquery và kiểm chứng `sum(debt_delta) === debt_after`.
- **Hạng mục bảo lưu:**
  - `REQ-AUDIO-01`: Giữ trạng thái OPEN (source_pending_download) trung thực theo hiện trạng Drive.
  - `REQ-PHON-01`: Giữ trạng thái BLOCKED do chưa có weights mô hình âm học cục bộ.
  - `REQ-DEFER-01..03`: SePay, MoMo, VNPay, PDF OCR bảo lưu DEFERRED.
