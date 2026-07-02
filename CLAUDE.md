# Ghi nhớ dự án — Báo Cáo Vận Hành XBG

## Quy tắc bắt buộc
- **Luôn trả lời bằng tiếng Việt**
- **Luôn auto-commit và push** sau khi sửa, không hỏi lại
- **Push qua GitHub Desktop** (bash git push lỗi 403 proxy)
- **Không bao giờ dùng aging-dashboard.html riêng lẻ** — đã tích hợp vào index.html

---

## Thông tin dự án

| Mục | Giá trị |
|-----|---------|
| Website | https://thangtru123-svg.github.io/Th-ng/ |
| Repo local | `/Users/abc/Documents/GitHub/Th-ng/` |
| Repo bash | `/sessions/adoring-inspiring-planck/mnt/Th-ng/` |
| Người làm | Phạm Đức Thắng |

---

## Cấu trúc trang (Sidebar)

| ID | Tên trang | Ghi chú |
|----|-----------|---------|
| p8 | Tổng quan 7 ngày theo AM | SHEET_XL_A + SHEET_XL_B |
| p9 | Tổng quan 7 ngày theo BC | SHEET_XL_C + SHEET_XL_D |
| p10 | Tổng quan GTC đơn TTS | SHEET_TTS_AM + SHEET_TTS_BC |
| p11 | Tỉ lệ trả (Kết thúc giao) | SHEET_TLT_AM + SHEET_TLT_BC |
| p13 | Aging > 5 ngày | Google Sheet riêng (export CSV) |
| p12 | AI - Phân tích tổng quan | Groq API |
| p14 | Ontime Giao TTS | SHEET_OTG_AM + SHEET_OTG_BC |
| p15 | Ontime Lấy TTS | SHEET_OTL_AM + SHEET_OTL_BC |

---

## Sheet IDs (trong index.html ~line 260-272)

```javascript
const SHEET_XL_A  = '13Db4y1xGRsZQI3xRDIjhIxxCDx8GNU0B_LTmorQDeQ8';
const SHEET_XL_B  = '1WEBW0hXdKSK1JKiehMlSpjaKezNB3xJ3HeNvT-9ZMpA';
const SHEET_XL_C  = '1LaBA_B9wo2ptF2VOmzeH9uzrZe0x4u5ymIiX6ahRInw';  // Lấy - BC
const SHEET_XL_D  = '1yi0sjWp29bwPOR3E-YLkr4njCbWTm15NoUge3AQIXkQ';  // Giao - BC
const SHEET_TTS_AM= '1n9Oxys1HPm6bgYIh6GO_B0Vhz2LikvM0n4t3QqP0ml0'; // TTS Giao - AM
const SHEET_TTS_BC= '1j6OLDLv5F4C-MHqI2vVRVfENGRnYlcZP2k_Z9fAl0Dg'; // TTS Giao - BC
const SHEET_TLT_AM= '1PZ_Kglh1-CIdQoMfF2pjc4MxjxE97-eT7qqYgn98F1A'; // Tỉ lệ trả - AM
const SHEET_TLT_BC= '1j1BHlG14NxnViEfuc8ttX48Wm3J5cN1CDOuAGunIaUs'; // Tỉ lệ trả - BC
const SHEET_OTG_AM= '1BAJ9cjpklSOsBOXHeRBUQMJYmxbCbDCL9P9RsmaTrI0'; // Ontime Giao - AM
const SHEET_OTG_BC= '1DjwtemKoInHsaIPjndTYYK1DxJOE2Xtmoq2BjQxvY0U'; // Ontime Giao - BC
const SHEET_OTL_AM= '13-2HDi4b5URdvvJlz6rYkTe9ot1isSImkOTuFfxqPPI'; // Ontime Lấy - AM
const SHEET_OTL_BC= '1UuQHYdFx_8APXS-soTOesfLLYehpNTH8SO7JgxPQM8k'; // Ontime Lấy - BC
```

---

## Aging > 5 ngày (p13)

- **Sheet ID**: `1jCWPRvfGA7d2uHL6_xT8ZxU3tgpOdlBK1-c4QT961ew`
- **GID**: `1424919323` (sheet tên "Export")
- **URL fetch**: `export?format=csv&gid=1424919323` (không dùng gviz)
- **Cột dữ liệu**:
  - A(0): Vùng | B(1): Tỉnh | C(2): BC | D(3): Mã đơn
  - E(4): Tệp khách | F(5): Ngày nhập | G(6): Số ngày
  - H(7): Giờ cập nhật | I(8): Số lần giao | J(9): Nhóm BL
  - **K(10): AM** | **L(11): Date** | **M(12): Note** (Bưu Cục bất ổn)
- **Format ngày**: `DD/MM/YYYY` (ví dụ: `15/06/2026`)
- **Bưu Cục bất ổn**: cột M chứa text `"Bưu Cục bất ổn"`

---

## TONG_CONG (hardcoded trong index.html — 2 chỗ: ~line 502 và ~line 689)

- **Nguồn**: Looker Studio "Tỉ lệ trả (Kết thúc giao)" (KHÔNG phải "Tỉ lệ trả")
- **Bộ lọc**: Chi tiết = AM, Loại ngày = Ngày
- **Lấy giá trị**: dòng "Tổng số", cột **% Return**
- **Cập nhật hàng ngày** khi có data mới
- **Format**: `'2026-06-21': 11.8`

---

## Looker Studio — Cách xuất Sheet mới

1. Vào đúng tab **"Tỉ lệ trả (Kết thúc giao)"** (không phải "Tỉ lệ trả")
2. Report TLT: `fcc2cc6e-17c0-4cf8-9c88-1258e4a76e48`, page: `p_b5du2yhowd`
3. Report XL/TTS: `5c7ad323-d293-4da2-9d88-d77034000af7`
4. **Report Ontime**: `b8742a59-eda0-477f-8352-ac3bbcdb5ded`, page ONTIME PICKUP: `p_cojbhmb6gd`
5. **Cách xuất**: Chuột phải vào bảng → "Xuất biểu đồ" → "Xuất dữ liệu" → "Google Trang tính"
6. Lấy Sheet ID từ URL của file vừa tạo

---

## Xuất ONTIME PICKUP (SLA TTS) — p14 & p15

- **Link báo cáo**: https://baocao.ghn.vn/dashboards/63bd175cd4435a369fade8bd → mục 8 "ONTIME PICKUP (SLA TTS)"
- **Vấn đề cross-origin iframe**: Chrome MCP KHÔNG click được vào iframe Looker Studio từ baocao.ghn.vn
- **Cách giải quyết**: Lấy `src` của iframe → mở tab mới trực tiếp tới URL đó (có session params) → click được bình thường
- **Session params**: `{"session":{"id0":"3206259966",...,"id30":"3206259966"}}` (31 keys, tất cả cùng value)
- **Scroll trong Looker Studio**: KHÔNG dùng `window.scrollTo()` — phải dùng `document.querySelector('.mainBlock').scrollTop = value` hoặc `el.scrollIntoView()`

### Quy trình xuất LOGIC MỚI (Ontime Lấy):
1. Mở tab embed Looker Studio (với session params)
2. Kéo xuống phần **LOGIC MỚI** ở cuối trang
3. Chọn filter: **Loại: Ngày** | **Chi tiết: AM** (hoặc Bưu Cục) | **Loại khách: TTS** (bỏ chọn tất cả → chọn TTS)
4. Chuột phải vào bảng LOGIC MỚI → Xuất biểu đồ → Xuất dữ liệu → Google Trang tính → Xuất
5. Lặp lại với Chi tiết: Bưu Cục để có sheet BC
- **Lưu ý**: Bảng LOGIC CŨ (trên) chỉ có CSV, KHÔNG có Google Trang tính — phải dùng bảng LOGIC MỚI

---

## Quy trình cập nhật dữ liệu hàng ngày

1. Vào Looker Studio, xuất các bảng → lấy Sheet ID mới
2. Cập nhật Sheet IDs trong `index.html`
3. Cập nhật `TONG_CONG` (2 chỗ) với % Return ngày mới
4. Commit + Push qua GitHub Desktop

---

## Quy tắc chụp ảnh gửi Telegram

### TLT Theo Ngày (p3) — sendAllToTelegram
- **KHÔNG dùng `sendPhoto()` thẳng** — sẽ chụp cả search bar, ảnh bị dư
- **Phải clone card, ẩn search bar, set width** trước khi chụp
- **A. Theo AM** (`#p3-card-am`): clone → xóa `.table-wrap>div` → width **960px**
- **B. Theo BC** (`#p3-card-bc`): clone → xóa `.table-wrap>div` → dùng `table[data-bc-srch]` → trim Top 15 rows → width **1200px**
- **Search bar** nằm trong `.table-wrap` dưới dạng `div` trước `table` → xóa bằng: `cl.querySelectorAll('.table-wrap>div').forEach(e=>e.remove())`
- **Table dữ liệu** (BC): dùng `table[data-bc-srch]` — KHÔNG dùng `table` thông thường (sẽ lấy nhầm table dropdown search có checkboxes)
- **Analysis box** (`buildFDDayTable`): áp dụng cho cả AM lẫn BC (không giới hạn `nameLabel==='AM'`)

---

## Lỗi đã gặp & cách xử lý

| Lỗi | Xử lý |
|-----|-------|
| `git push` lỗi 403 | Dùng GitHub Desktop, KHÔNG dùng bash |
| Xuất nhầm bảng Looker | Phải chọn đúng trang "Tỉ lệ trả (Kết thúc giao)" |
| Ngày hiển thị sai format | `agingFmtDate`: `${p[2]}/${p[1]}/${p[0]}` |
| Push origin bị che bởi dock | Dùng `key: cmd+Return` để commit khi GitHub Desktop focus |
| Chrome MCP không click được vào Looker Studio | Looker Studio nằm trong cross-origin iframe → mở tab mới với URL embed trực tiếp |
| Scroll Looker Studio không hoạt động | Dùng `.mainBlock` container, không phải `window` |
| "Xuất dữ liệu" bị grayed out | Đang right-click bảng LOGIC CŨ — phải right-click bảng LOGIC MỚI |
| Chụp TG ra ảnh chỉ có checkbox list | Đang dùng `querySelector('table')` lấy nhầm table dropdown search — phải dùng `table[data-bc-srch]` |
| So sánh tuần mũi tên ngược | `buildFDWeekTable`: diff phải là `fd1-fd2` (mới-cũ), không phải `fd2-fd1` |

---

## Cách commit/push đúng

```bash
# Bash chỉ dùng để git add + commit (KHÔNG push)
cd /sessions/adoring-inspiring-planck/mnt/Th-ng
git add index.html
git commit -m "message"
# Sau đó mở GitHub Desktop → click Push origin
```
