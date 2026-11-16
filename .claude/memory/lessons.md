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

## 2026-11-16 — Token GHN trong Action chết → số 0 giả bị ghi đè
- GHN trả token hỏng bằng HTTP **400** `{code:1003 "Token is not alive" | 1004 | 401, data:null}` (KHÔNG phải 401/403) → `api()` cũ coi là rỗng → toàn Vùng ra GTC=0 và bot commit số 0. Đã thêm guard `AUTH_BAD/AUTH_OK` trong scripts/pull_gtc.js: mọi phản hồi là lỗi quyền → exit 2, không ghi đè. Token đại nhân cập nhật 13:22 VN chỉ sống ~6 phút (khác token trong Chrome vẫn sống) → cần tìm cách lấy token bền.
- `api()` trả `{data:[]}` khi lỗi nên "rỗng" ≠ "0 đơn": mọi khối mới phải kiểm phản hồi hợp lệ + thử lại, lỗi thì ghi err (xem khối tonLC).

## 2026-11-16 — Tồn LC: "Chưa đóng kiện" = packing_type `UNPACKED`, KHÔNG phải NOT_PACKED
- get-backlog-transport-info nhận packing_type sai thì trả 200 OK + 0 đơn (im lặng). 3 giá trị đúng: **UNPACKED** (chưa đóng kiện) · PACKED · NO_NEED_TO_PACK. Cộng thiếu UNPACKED làm Vùng báo 16/64 thay vì 166/259 (Móng Cái 1: 13 thay vì 36 đơn trả). Bài học: số mới phải đối chiếu TỪNG Ô với UI cả khi chọn "tất cả" (bỏ chọn trạng thái), không chỉ 1 BC nhỏ. Lỗi này cũng làm báo cáo 2 BC (p49) LC>36h thiếu từ trước.
- Chạy workflow gtc-live 2 lần sát nhau → lần sau checkout SHA cũ → commit data xung đột, không push được. Chỉ chạy 1 lần/đợt, chờ xong mới chạy tiếp.

## 2026-11-16 — Bộ lọc 2 tỉnh BỎ dòng Tổng (AM trống) của sheet "- AM" → trang nào đọc dòng Tổng sẽ mất số
- `_2TConfig` mode 'am' (mọi sheet `... theo AM` / `... - AM`) loại dòng Grand Total để các trang tự cộng lại. p27 Rớt LC lấy số Vùng từ dòng Tổng của "LTC - AM" nên hộp "Tổng quan Lấy & Luân chuyển" báo "chưa có dữ liệu LTC" dù sheet có đủ (đại nhân bắt 16/11). Fix: Vùng = cộng các dòng AM (Σvol, %LTC/%LC gia quyền Volume — khớp dòng Tổng tuyệt đối 4 ngày). Quy tắc: trang mới KHÔNG được phụ thuộc dòng Tổng của sheet theo AM/BC; tự cộng. Và không đổ lỗi "sheet cập nhật trễ"/"bộ lọc" khi chưa kiểm — đối chiếu số dòng thật (app 550 vs sheet 610 = thiếu đúng 1 dòng/ngày).
