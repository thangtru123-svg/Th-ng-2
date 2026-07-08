# Lessons Learned — Dashboard Báo Cáo Vận Hành XBG

> Append-only. KHÔNG xóa entries cũ. Claude tự cập nhật sau mỗi incident/fix quan trọng.
> Format: ## L-[số] ([ngày]) | Vấn đề | Root cause | Fix | Ngăn ngừa

---

## L-1 (2026-07-08) | git push lỗi 403 / auth
- **Vấn đề:** `git push` qua bash lỗi `403 proxy` / `could not read Username`.
- **Root cause:** Môi trường bị proxy chặn, không có credential cho HTTPS remote.
- **Fix:** Push qua **GitHub Desktop** (`cmd+p`), không dùng bash push.
- **Ngăn ngừa:** Luôn commit bằng bash, push bằng GitHub Desktop. Xem [[CLAUDE.md]] mục "Cách commit/push đúng".

## L-2 (2026-07-08) | Chụp Telegram ra ảnh toàn checkbox
- **Vấn đề:** `_captureEl` ra ảnh dropdown search (checkbox), scrollWidth=0.
- **Root cause:** `querySelector('table')` lấy nhầm table dropdown search (hidden) thay vì data table.
- **Fix:** Dùng `.table-wrap>table` hoặc `[...el.querySelectorAll('table')].find(t=>t.offsetWidth>0)`.
- **Ngăn ngừa:** Mọi dashboard có `addBCSearch` đều có 2 table — luôn lọc table visible.

_Các bài học chi tiết khác xem bảng "Lỗi đã gặp & cách xử lý" trong CLAUDE.md. File này append sau mỗi incident mới._
