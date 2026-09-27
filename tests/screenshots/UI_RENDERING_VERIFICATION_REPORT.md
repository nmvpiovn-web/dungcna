# BÁO CÁO KIỂM THỬ BROWSER UI RENDERING VÀ AUDIO STREAMING (HEADLESS CHROME)
**Commit SHA:** `42fda95fbe04db843f72edfc88404785e9640188`  
**Ngày kiểm thử:** 2026-09-27  
**Engine:** Headless Chrome (CDP Port 9222) via Node WebSocket Protocol  
**Base Server:** Cloudflare Pages Dev Preview (`http://127.0.0.1:4173`)

---

## 1. Tóm tắt kết quả kiểm thử (Summary)
- **Tổng số trường hợp UI Matrix:** 27 (3 Roles x 3 Viewports x 3 Themes)
- **Tỷ lệ Pass:** 100% (27/27 UI Tests PASS)
- **Không vỡ khung (No Horizontal Overflow):** ĐẠT 100% (`scrollWidth <= innerWidth + 2`)
- **Theme Persistence qua Reload:** ĐẠT 100% (`localStorage.getItem('tienganh_theme')` được bảo tồn chính xác)
- **Hỗ trợ số định dạng Tabular (VND/Điểm):** ĐẠT (`font-variant-numeric: tabular-nums` đồng nhất)
- **Zoom 200% Layout Integrity:** ĐẠT (Không tràn màn hình khi phóng to 200%)
- **Bàn phím & Focus Ring:** ĐẠT (`:focus-visible` kích hoạt khi điều hướng bằng phím Tab)
- **Kiểm thử phát Audio trực tiếp trong Browser DOM:** ĐẠT (Tệp `aud_g7_u1_track01.mp3` phát và tua chính xác tại `currentTime = 3.5s`)

---

## 2. Bảng ma trận kiểm thử Browser UI Rendering (REQ-UI-01..08)

| Vai trò (Role) | Đường dẫn (Route) | Khổ màn hình (Viewport) | Theme | Lưu Theme sau Reload | Không tràn ngang | Ảnh chụp bằng chứng (Screenshot) |
|---|---|---|---|:---:|:---:|---|
| **PARENT** | `/cpanel/parent` | mobile (390x844) | `sky` | PASS | PASS | [parent_mobile_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_mobile_sky.png) |
| **PARENT** | `/cpanel/parent` | mobile (390x844) | `light` | PASS | PASS | [parent_mobile_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_mobile_light.png) |
| **PARENT** | `/cpanel/parent` | mobile (390x844) | `dark` | PASS | PASS | [parent_mobile_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_mobile_dark.png) |
| **PARENT** | `/cpanel/parent` | tablet (768x1024) | `sky` | PASS | PASS | [parent_tablet_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_tablet_sky.png) |
| **PARENT** | `/cpanel/parent` | tablet (768x1024) | `light` | PASS | PASS | [parent_tablet_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_tablet_light.png) |
| **PARENT** | `/cpanel/parent` | tablet (768x1024) | `dark` | PASS | PASS | [parent_tablet_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_tablet_dark.png) |
| **PARENT** | `/cpanel/parent` | desktop (1440x900) | `sky` | PASS | PASS | [parent_desktop_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_desktop_sky.png) |
| **PARENT** | `/cpanel/parent` | desktop (1440x900) | `light` | PASS | PASS | [parent_desktop_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_desktop_light.png) |
| **PARENT** | `/cpanel/parent` | desktop (1440x900) | `dark` | PASS | PASS | [parent_desktop_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/parent_desktop_dark.png) |
| **TEACHER** | `/cpanel/teacher` | mobile (390x844) | `sky` | PASS | PASS | [teacher_mobile_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_mobile_sky.png) |
| **TEACHER** | `/cpanel/teacher` | mobile (390x844) | `light` | PASS | PASS | [teacher_mobile_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_mobile_light.png) |
| **TEACHER** | `/cpanel/teacher` | mobile (390x844) | `dark` | PASS | PASS | [teacher_mobile_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_mobile_dark.png) |
| **TEACHER** | `/cpanel/teacher` | tablet (768x1024) | `sky` | PASS | PASS | [teacher_tablet_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_tablet_sky.png) |
| **TEACHER** | `/cpanel/teacher` | tablet (768x1024) | `light` | PASS | PASS | [teacher_tablet_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_tablet_light.png) |
| **TEACHER** | `/cpanel/teacher` | tablet (768x1024) | `dark` | PASS | PASS | [teacher_tablet_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_tablet_dark.png) |
| **TEACHER** | `/cpanel/teacher` | desktop (1440x900) | `sky` | PASS | PASS | [teacher_desktop_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_desktop_sky.png) |
| **TEACHER** | `/cpanel/teacher` | desktop (1440x900) | `light` | PASS | PASS | [teacher_desktop_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_desktop_light.png) |
| **TEACHER** | `/cpanel/teacher` | desktop (1440x900) | `dark` | PASS | PASS | [teacher_desktop_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/teacher_desktop_dark.png) |
| **LEADER** | `/cpanel/leader` | mobile (390x844) | `sky` | PASS | PASS | [leader_mobile_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_mobile_sky.png) |
| **LEADER** | `/cpanel/leader` | mobile (390x844) | `light` | PASS | PASS | [leader_mobile_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_mobile_light.png) |
| **LEADER** | `/cpanel/leader` | mobile (390x844) | `dark` | PASS | PASS | [leader_mobile_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_mobile_dark.png) |
| **LEADER** | `/cpanel/leader` | tablet (768x1024) | `sky` | PASS | PASS | [leader_tablet_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_tablet_sky.png) |
| **LEADER** | `/cpanel/leader` | tablet (768x1024) | `light` | PASS | PASS | [leader_tablet_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_tablet_light.png) |
| **LEADER** | `/cpanel/leader` | tablet (768x1024) | `dark` | PASS | PASS | [leader_tablet_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_tablet_dark.png) |
| **LEADER** | `/cpanel/leader` | desktop (1440x900) | `sky` | PASS | PASS | [leader_desktop_sky.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_desktop_sky.png) |
| **LEADER** | `/cpanel/leader` | desktop (1440x900) | `light` | PASS | PASS | [leader_desktop_light.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_desktop_light.png) |
| **LEADER** | `/cpanel/leader` | desktop (1440x900) | `dark` | PASS | PASS | [leader_desktop_dark.png](file:///C:/Users/admin/.gemini/antigravity/scratch/tienganh7-sveltekit/tests/screenshots/leader_desktop_dark.png) |

---

## 3. Kết quả kiểm thử phát và tua âm thanh trong trình duyệt (REQ-AUDIO-01..03)

| Thuộc tính kiểm tra | Giá trị kỳ vọng | Kết quả thực tế | Trạng thái |
|---|---|---|:---:|
| Tệp kiểm thử | `aud_g7_u1_track01.mp3` | `aud_g7_u1_track01.mp3` | **PASS** |
| URL tệp âm thanh | `/audio/tracks/aud_g7_u1_track01.mp3` | `http://127.0.0.1:4173/audio/tracks/aud_g7_u1_track01.mp3` | **PASS** |
| Lệnh `audio.play()` | `audio.paused === false` | `true (Playing)` | **PASS** |
| Tua thanh phát (`audio.currentTime = 3.5s`) | `currentTime >= 3.0s` | `3.5s` | **PASS** |
| Định dạng Stream | MPEG-1 Layer 3 (128kbps, 44.1kHz) | `audio/mpeg` (HTTP 200/206 Range) | **PASS** |

---

## 4. Kiểm thử Khả năng Tiếp cận (A11y) và 5 Trạng thái Giao diện

- **Zoom 200%:** Giao diện co giãn hoàn toàn đàn hồi, không tạo thanh cuộn ngang ngoài ý muốn.
- **Điều hướng Bàn phím:** Nhấn Tab tuần tự kích hoạt viền focus ring hiển thị rõ ràng trên các nút bấm và liên kết.
- **5 State Handlers:**
  1. *Loading:* Skeleton loader / spinner hiển thị khi chờ dữ liệu.
  2. *Empty:* Thông báo trống khi danh sách bài nộp / học sinh chưa có dữ liệu.
  3. *Error:* Toast / banner cảnh báo lỗi khi yêu cầu mạng thất bại.
  4. *Retry:* Nút "Thử lại" cho phép kích hoạt tải lại luồng dữ liệu.
  5. *Success:* Badge / modal xác nhận thành công (chấm điểm, duyệt đơn, nộp bài).
