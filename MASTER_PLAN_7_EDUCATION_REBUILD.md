# Master Plan 7 — Education UI, Learning Data, Assessment and Games

## Mục tiêu

Tái cấu trúc sản phẩm quanh bốn hành động học tiếng Anh: **Học theo lớp**, **Luyện từ vựng**, **Luyện kỹ năng**, **Làm bài đánh giá**. Mọi thay đổi phải được đo trên trình duyệt ở 390×844, 768×1024 và 1440×1000 trước và sau khi sửa.

## Phân công

- **Codex:** kiến trúc điều hướng, dữ liệu Drive → D1, quyền truy cập, bảng đánh giá, browser audit, schema/migration và hard gate.
- **Antigravity:** hiệu ứng chúc mừng game, responsive game result và test riêng. Không sửa navigation, schema hoặc quyền truy cập.

## 7 lát cắt

### 1. Baseline bằng browser automation

- Chụp `/`, `/flashcards`, `/dictionary`, `/grammar`, `/exam`, `/games`, `/evaluations`, `/courses`.
- Đo chiều cao trang, tràn ngang, số mục điều hướng, số CTA/card, vùng sticky/fixed che nội dung.
- **RED:** fixture cố ý rộng hơn viewport và menu thiếu accessible name phải bị gate bắt.
- **GREEN:** route thật không tràn ngang; menu mở/đóng bằng chuột và bàn phím; ảnh evidence đủ ba viewport.

### 2. Information architecture và global shell

- Desktop giữ bốn mục chính: Học, Luyện tập, Kiểm tra, Tiến độ.
- Mobile dùng thanh tác vụ dưới với 4 đích chính; “Thêm” mở sheet, không nhồi toàn bộ hệ thống vào drawer.
- Công cụ giáo viên/quản trị nằm trong menu tài khoản theo role.
- Loại thuật ngữ hạ tầng khỏi UI người học.
- **RED:** link trùng, link bị nhốt chỉ trong drawer, focus rơi ra khỏi menu.
- **GREEN:** route chính truy cập trong tối đa hai thao tác; touch target ≥44px; không che nội dung.

### 3. Kho học liệu Drive → D1

- Dùng manifest hiện có làm nguồn có provenance; không giả lập file chưa đọc.
- Chuẩn hóa `resource_catalog`: nguồn, hash, loại tài liệu, khối lớp, kỹ năng, độ khó, trạng thái kiểm duyệt, quyền xem và liên kết vault.
- Deduplicate theo SHA-256; bản trùng liên kết bản gốc.
- **RED:** thiếu hash/source, duplicate tạo bản ghi mới, tài liệu chưa duyệt xuất hiện cho học sinh.
- **GREEN:** import idempotent; số unique khớp manifest; FTS tìm được theo title/tag/grade/skill.

### 4. Bảng đánh giá học viên

- Theo nguyên tắc rubric của Yale: tiêu chí rõ, tối đa bảy trục, 3–5 mức mô tả, tách formative/summative.
- Theo hướng dẫn Harvard: contrast chữ ≥4.5:1, component ≥3:1, màu luôn kèm nhãn/icon.
- Viền học thuật hai lớp: navy mảnh bên ngoài, sky rule bên trong, header gọn, không dùng huy hiệu trường.
- **RED:** thiếu descriptor, chỉ dùng màu để biểu thị mức, modal vượt viewport, guest đọc PII.
- **GREEN:** rubric có mô tả quan sát được; modal đóng bằng nút/Escape/backdrop; không lộ PII.

### 5. Game celebration

- Result celebration có điểm, sao, streak, thông điệp theo mức và nút chơi lại/tiếp tục.
- Motion ngắn, hỗ trợ `prefers-reduced-motion`; không dùng hiệu ứng gây nhấp nháy.
- **RED:** hoàn thành game nhưng không có summary hoặc thưởng lặp khi rerender.
- **GREEN:** mỗi lượt chỉ thưởng một lần; UI 390px không tràn; keyboard/focus hợp lệ.

### 6. Rebuild từng module

- Thứ tự: shell → home → flashcard/dictionary → exam → evaluation → role panels.
- Mỗi module có ảnh trước/sau và test hành vi thật.
- **RED:** test fixture chứng minh gate thất bại khi tái tạo lỗi cũ.
- **GREEN:** check, contract, browser và build cùng xanh.

### 7. Release gate production

- Migration remote có bookmark/backup trước khi ghi.
- Smoke production theo role; metadata build phải trùng commit.
- Gate: `npm run check`, contract suites, V5 gate, MP7 browser gate, build.
- Không deploy nếu còn P0/P1 về auth, PII, ghi D1 hoặc layout che thao tác.

## Baseline dữ liệu ngày 30/09/2026

- Manifest Drive cục bộ: 35 file, 33 nội dung unique, 2 duplicate, 1.994.558 ký tự, 308 ảnh.
- `teaching_resources.json`: 36 tài nguyên đã trích xuất.
- Production D1: 102 knowledge notes; 36 bản ghi thuộc `07_GOOGLE_DRIVE_LIBRARY`.
- Google Drive connector chưa khả dụng trong phiên; ingestion hiện dùng mirror có hash/provenance trong repository. Khi connector được kết nối, chỉ nhập delta mới sau khi so SHA-256.
