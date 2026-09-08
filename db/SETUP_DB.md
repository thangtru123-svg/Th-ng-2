# Dựng Database ngoài lưu lịch sử Aging (Hybrid) — Hướng dẫn setup

**Mô hình:** Neon (Postgres) + Vercel Functions, nạp bằng Apps Script.
- `aging_snapshots` = RAW từng đơn, tự giữ **180 ngày** gần nhất (tra chi tiết).
- `aging_daily_agg` = TỔNG HỢP theo ngày × AM × BC × nhóm ngày, giữ **VĨNH VIỄN** (rất nhẹ).
- Đại nhân **không phải copy tay** nữa: Apps Script tự chạy 23:30 mỗi ngày (máy tắt vẫn chạy).

Con (Claude) đã viết sẵn toàn bộ code. Đại nhân chỉ làm **3 bước** dưới (phần bí mật đại nhân tự dán, con không cầm mật khẩu DB).

---

## Bước 1 — Tạo Neon DB & lấy chuỗi kết nối  (~5 phút)
1. Vào https://neon.tech → đăng nhập (Google) → **Create project** (chọn region gần: Singapore).
2. Vào **SQL Editor** của project → dán toàn bộ nội dung `db/schema.sql` → **Run** (tạo 2 bảng).
3. Vào **Dashboard → Connection string** → copy chuỗi dạng
   `postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

## Bước 2 — Khai báo biến môi trường trên Vercel  (~5 phút)
1. Vào https://vercel.com → project **Th-ng-2** → **Settings → Environment Variables**.
2. Thêm 2 biến (chọn cả Production + Preview):
   - `DATABASE_URL` = chuỗi kết nối Neon ở Bước 1.
   - `INGEST_TOKEN` = một chuỗi bí mật tự đặt (VD `xbg-aging-7h3k9`), nhớ để dùng ở Bước 3.
3. **Redeploy** (Deployments → … → Redeploy) để nạp biến mới.
4. Kiểm tra: mở `https://th-ng-2.vercel.app/api/aging?dates=1` → phải trả `[]` (chưa có dữ liệu) chứ không phải lỗi 500.

## Bước 3 — Cài Apps Script tự đồng bộ  (~5 phút)
1. Mở file **"Vùng XBG - Báo cáo AM"** → **Tiện ích mở rộng → Apps Script**.
2. Xoá code mẫu, dán toàn bộ `apps-script/aging-sync.gs`.
3. Sửa đúng 1 dòng: `INGEST_TOKEN = '...'` cho **trùng khớp** token đặt ở Bước 2.
4. Chọn hàm **`setup`** → **Run** → cấp quyền (Google hỏi lần đầu). Nó sẽ:
   - đặt lịch chạy **23:30 mỗi ngày**, và chạy thử ngay 1 lần.
5. Kiểm tra: mở lại `https://th-ng-2.vercel.app/api/aging?dates=1` → thấy ngày hôm nay.

---

## Dùng dữ liệu (API đọc)
- Xu hướng tổng theo ngày:      `/api/aging?group=day`  (hoặc `&from=YYYY-MM-DD&to=YYYY-MM-DD`)
- Theo AM ngày mới nhất:        `/api/aging?group=am`
- Theo Bưu Cục 1 ngày:          `/api/aging?group=bc&date=2026-09-08`
- Theo nhóm ngày (bucket):      `/api/aging?group=bucket&date=2026-09-08`
- RAW từng đơn 1 ngày (≤180N):  `/api/aging?raw=1&date=2026-09-08`
- Danh sách ngày có dữ liệu:    `/api/aging?dates=1`

## Chi phí
- Free Neon 0,5GB đủ cho ~180 ngày raw + tổng hợp vĩnh viễn (nhờ Hybrid tự dọn raw cũ) → **miễn phí lâu dài**.
- Nếu sau này muốn giữ raw > 180 ngày: sửa `RAW_KEEP_DAYS` trong `api/ingest-aging.js` (có thể cần nâng gói Neon).

> Sau khi 3 bước xong và dữ liệu chảy đều, báo Claude để nối trang Aging dashboard đọc xu hướng dài hạn từ API này.
