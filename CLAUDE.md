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

---

## Sheet IDs (trong index.html ~line 250-259)

```javascript
const SHEET_XL_A  = '13Db4y1xGRsZQI3xRDIjhIxxCDx8GNU0B_LTmorQDeQ8';
const SHEET_XL_B  = '1WEBW0hXdKSK1JKiehMlSpjaKezNB3xJ3HeNvT-9ZMpA';
const SHEET_XL_C  = '1LaBA_B9wo2ptF2VOmzeH9uzrZe0x4u5ymIiX6ahRInw';  // Lấy - BC
const SHEET_XL_D  = '1yi0sjWp29bwPOR3E-YLkr4njCbWTm15NoUge3AQIXkQ';  // Giao - BC
const SHEET_TTS_AM= '1n9Oxys1HPm6bgYIh6GO_B0Vhz2LikvM0n4t3QqP0ml0'; // TTS Giao - AM
const SHEET_TTS_BC= '1j6OLDLv5F4C-MHqI2vVRVfENGRnYlcZP2k_Z9fAl0Dg'; // TTS Giao - BC
const SHEET_TLT_AM= '1PZ_Kglh1-CIdQoMfF2pjc4MxjxE97-eT7qqYgn98F1A'; // Tỉ lệ trả - AM
const SHEET_TLT_BC= '1j1BHlG14NxnViEfuc8ttX48Wm3J5cN1CDOuAGunIaUs'; // Tỉ lệ trả - BC
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
4. **Cách xuất**: Chuột phải vào bảng → "Xuất biểu đồ" → "Xuất dữ liệu" → "Google Trang tính"
5. Lấy Sheet ID từ URL của file vừa tạo

---

## Quy trình cập nhật dữ liệu hàng ngày

1. Vào Looker Studio, xuất các bảng → lấy Sheet ID mới
2. Cập nhật Sheet IDs trong `index.html`
3. Cập nhật `TONG_CONG` (2 chỗ) với % Return ngày mới
4. Commit + Push qua GitHub Desktop

---

## Lỗi đã gặp & cách xử lý

| Lỗi | Xử lý |
|-----|-------|
| `git push` lỗi 403 | Dùng GitHub Desktop, KHÔNG dùng bash |
| Xuất nhầm bảng Looker | Phải chọn đúng trang "Tỉ lệ trả (Kết thúc giao)" |
| Ngày hiển thị sai format | `agingFmtDate`: `${p[2]}/${p[1]}/${p[0]}` |
| Push origin bị che bởi dock | Dùng `key: cmd+Return` để commit khi GitHub Desktop focus |

---

## Cách commit/push đúng

```bash
# Bash chỉ dùng để git add + commit (KHÔNG push)
cd /sessions/adoring-inspiring-planck/mnt/Th-ng
git add index.html
git commit -m "message"
# Sau đó mở GitHub Desktop → click Push origin
```
