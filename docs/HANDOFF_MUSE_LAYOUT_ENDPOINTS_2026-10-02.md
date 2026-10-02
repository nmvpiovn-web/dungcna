# Biên bản bàn giao cho Muse — Layout và endpoint

**Ngày bàn giao:** 02/10/2026  
**Repository:** `nmvpiovn-web/dungcna`  
**Pull request:** https://github.com/nmvpiovn-web/dungcna/pull/1  
**Nhánh:** `codex/layout-endpoint-audit`  
**Commit chính:** `abfb089`

## Mục tiêu đã hoàn thành

1. Đồng nhất phần giao diện lệch chuẩn nhất giữa AdminCP, Cpanel và trang lịch.
2. Thêm lịch tuần dạng ma trận để phụ huynh xem các ngày tiếp theo.
3. Siết `GET /api/schedule` theo vai trò và quan hệ dữ liệu thật trong D1.
4. Kiểm kê mức sẵn sàng của 38 route API trước khi nối UI production.

## Thay đổi cần Muse tiếp nhận

### `src/routes/schedule/+page.svelte`

- Có ma trận tuần T2–CN và hàng theo giờ bắt đầu.
- Hai nút chuyển tuần cập nhật khoảng ngày thật.
- Chọn ngày trên ma trận sẽ lọc danh sách ca học chi tiết phía dưới.
- Bảng dùng `min-width` và cuộn ngang trên mobile để không ép vỡ cột.
- Kiểu card đã đưa về `rounded-lg`, viền slate và bóng nhẹ giống Cpanel.

### `src/routes/api/schedule/+server.js`

- Student: lọc bằng `class_enrollments` đang active hoặc `student_ids` của ca học.
- Parent: chỉ lấy lớp của con có `parent_student_links.verification_status = 'verified'`.
- Teacher: chỉ lấy ca là giáo viên chính, trợ giảng hoặc dạy thay.
- Leader/Admin/Superadmin: giữ quyền xem lịch vận hành toàn hệ thống.
- Khi thiếu D1, lịch phụ huynh trả 503 để tránh rò dữ liệu fixture.
- `class_id` và `teacher_id` chỉ thu hẹp kết quả sau khi áp dụng scope quyền.

### `src/routes/admincp/+page.svelte`

- Giảm gradient, bóng lớn, chữ `font-black` và bo góc quá lớn.
- Đưa header, metric, tab và panel về cùng nhịp hình ảnh với Cpanel.

### Cloudflare và kiểm thử

- `package.json` và lockfile có thêm `@types/node` theo yêu cầu của Wrangler.
- `tests/schedule_scope.test.js` kiểm tra đủ student, parent, teacher và leader.
- Báo cáo kỹ thuật đầy đủ ở `docs/AUDIT_LAYOUT_ENDPOINTS_2026-10-02.md`.

## Kết quả kiểm tra

```text
npm run check
→ 0 lỗi, 89 cảnh báo hiện hữu trong 19 file

npm run build
→ thành công với adapter Cloudflare

node --test tests/schedule_scope.test.js
→ 4/4 đạt
```

## Lỗi nền chưa thuộc PR này

Full test suite của `origin/main` chưa xanh trước khi áp dụng thay đổi:

- Nhiều fixture tạo signed token có `sid` nhưng không tạo dòng tương ứng trong `auth_sessions`, nên auth mới trả 401.
- `verify_real_behavioral_audit.test.js` gọi `127.0.0.1:5173` nhưng script `npm test` không tự khởi động dev server.
- Một số assertion cũ kỳ vọng dữ liệu trước khi áp dụng session revocation và liên kết phụ huynh đã xác minh.

Không sửa bằng cách bỏ kiểm tra `auth_sessions`. Muse nên cập nhật fixture chung để insert session hợp lệ, sau đó tách nhóm test HTTP thành script tự khởi động server.

## Checklist tích hợp cho Muse

1. Rebase PR lên `main` nếu có commit mới sau `4b89aa9`.
2. Giữ nguyên điều kiện `verified` trong scope phụ huynh.
3. Chạy migration có `auth_sessions`, `class_enrollments` và `parent_student_links.verification_status` trên môi trường staging.
4. Chạy `npm run check`, `npm run build` và `node --test tests/schedule_scope.test.js`.
5. Smoke test bằng bốn tài khoản: student, parent đã link, teacher và leader.
6. Với parent, kiểm tra thêm một liên kết pending để xác nhận lịch học không bị lộ.
7. Sau deploy, kiểm tra `/api/schedule` không trả lịch lớp khác khi tự truyền `class_id` hoặc `teacher_id`.

## Dữ liệu và secret

- D1 binding: `DB` → `tienganh-pro-db`.
- Không đưa GitHub key, `AUTH_SECRET`, `DEEPSEEK_API_KEY` hoặc secret webhook vào source.
- Nhánh audit không sửa dữ liệu production và không thay đổi migration.

## Trạng thái bàn giao

Mã nguồn đã commit, push và gắn vào PR #1. Phần còn lại của Muse là review, cập nhật fixture test nền, chạy staging smoke test và merge khi đạt.
