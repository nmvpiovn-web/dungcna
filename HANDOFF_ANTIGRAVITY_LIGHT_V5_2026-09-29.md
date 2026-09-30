# Antigravity: phần việc UI nhẹ sau audit V5

Người dùng đã yêu cầu Codex giữ phần debug quan trọng, giao Antigravity phần nhẹ và kiểm tra lại kết quả.
Repo: C:\Users\admin\.gemini\antigravity\scratch\tienganh7-sveltekit
Baseline: 8390ea946338288e5e916c4c705ee9b4043d8be0.

## Phân công

Codex giữ audit/sửa backend: schedule, notify, campuses, evaluations/discussions identity và persistence, session/revoke, replay. Không sửa các file backend, auth, migrations, unifiedStore hoặc script queue handoff trong đợt UI này.

Antigravity nhận phạm vi nhỏ: audit và sửa layout flashcard tại src/routes/flashcards/+page.svelte; thêm browser test và bằng chứng riêng. Không mở rộng sang Drive, APK hoặc cấu hình token. Không deploy, push hay commit toàn bộ working tree đang dùng chung.

## Việc cần làm

1. Đọc trang flashcard và tái hiện ở 320/360/390px, portrait và landscape.
2. Sửa overflow mặt trước/mặt sau, chiều cao card, action bar, progress, safe-area và touch target tối thiểu 44px nếu tái hiện lỗi. Giữ thay đổi trong trang flashcard; nếu cần sửa shared component, báo đường dẫn và lý do trước khi đụng phần dùng chung.
3. Browser E2E thực sự click flip liên tục, next/prev, chuyển unit, reload. Kiểm tra autoplay cleanup bằng hành vi; chỉ chỉnh lifecycle cục bộ khi đã có test tái hiện. Screenshot chỉ là bằng chứng phụ.
4. Dùng local preview, không mutation production. Ghi viewport, bước thao tác, expected/actual, console errors, lệnh chạy và exit code. Không gọi kiểm tra tĩnh/screenshot là E2E PASS.
5. Trả kết quả vào ANTIGRAVITY_LIGHT_V5_RESULT.md ở root repo: file đã sửa, diff tóm tắt, test, đường dẫn bằng chứng và điểm chưa xử lý. Codex sẽ review diff và chạy lại kiểm tra trước khi nhận gate.

## Trạng thái tiếp nhận

Hãy ghi ACK và thời điểm vào ANTIGRAVITY_LIGHT_V5_RESULT.md ngay khi nhận được công việc, sau đó cập nhật kết quả khi hoàn tất. Không sửa báo cáo audit hay bằng chứng backend của Codex.
