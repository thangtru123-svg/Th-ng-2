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

## 2026-11-06 — Kết quả async cũ GHI ĐÈ lên lựa chọn mới (race condition) — app xbg-live tab N-1
- **Triệu chứng:** Chọn "Từ 03/11 → đến 03/11" nhưng số hiện là tổng 03/11+04/11 (Quảng Hà 2.067 đơn/69,2% thay vì 1.022 đơn/54,3%). Hai ô ngày vẫn ghi 03/11 nên nhìn như đúng.
- **Root cause:** đổi ô "Từ" khiến "đến" (còn 04/11) lệch → gửi `fetch` gộp khoảng (async). Người dùng chỉnh "đến" về 03/11 → `n1PickDay` vẽ đúng 1 ngày, nhưng response gộp khoảng về SAU và ghi đè vì `n1PickDay` không huỷ yêu cầu cũ (`_n1rangeSeq`).
- **Fix:** đổi "Từ" thì "đến" về cùng ngày (`n1FromChange`); mọi đường vẽ trực tiếp (`n1PickDay`) phải `_n1rangeSeq++` để vô hiệu hoá yêu cầu đang bay.
- **Ngăn ngừa:** Với MỌI chỗ có "gọi async rồi render kết quả" (chọn ngày/tuần/BC, tìm kiếm, nút Cập nhật): dùng bộ đếm thứ tự (seq) và **tăng seq ở TẤT CẢ đường render khác**, không chỉ ở đường async; callback kiểm `seq` trước khi vẽ. Ô lọc phụ thuộc nhau (từ/đến) phải đồng bộ khi 1 ô đổi. Khi con số trên app lệch số trong sheet: kiểm trước xem có đang cộng nhiều ngày không (thử cộng ngày liền kề) rồi mới nghi dữ liệu.

## 2026-11-06 — Sheet đang bật BỘ LỌC → gviz CSV chỉ trả dòng đã lọc
- gviz đọc theo trạng thái lọc (basic filter) của tab; Sheets API v4 (`/api/sheet`, `/api/n1`) thì không. Khi dữ liệu đọc bằng gviz bỗng thiếu dòng: soi tab có đang lọc không, báo đại nhân tắt lọc / dùng "Filter views". Luôn đếm số dòng theo ngày trước khi tin dữ liệu gviz.

_Các bài học chi tiết khác xem bảng "Lỗi đã gặp & cách xử lý" trong CLAUDE.md. File này append sau mỗi incident mới._
