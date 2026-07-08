# Architecture Decisions — Dashboard Báo Cáo Vận Hành XBG

> Ghi lại các quyết định kỹ thuật quan trọng để không phải giải thích lại.

---

## D-1 (2026-07-08) | Hosting: Vercel thay GitHub Pages
- **Quyết định:** PROD chạy trên **Vercel** (https://th-ng-2.vercel.app), auto-deploy khi push `main`.
- **Lý do:** GitHub Pages kẹt `deployment_queued` do CDN; Netlify hết credit.
- **Hệ quả:** `.github/workflows/deploy.yml` (GitHub Pages) còn lại nhưng KHÔNG dùng.

## D-2 (2026-07-08) | Toàn bộ frontend trong 1 file index.html
- **Quyết định:** Không tách module, không build system — tất cả HTML/CSS/JS trong `index.html`.
- **Lý do:** Deploy tĩnh đơn giản, không cần bundler; dễ sửa nhanh.
- **Hệ quả:** File lớn (~328KB). Không có bước build; "verify" = mở trình duyệt, kiểm tra console.

## D-3 (2026-07-08 — kế hoạch, chưa làm) | Database Neon + Vercel Functions
- **Quyết định (dự kiến):** Chuyển nguồn dài hạn sang **Neon** (serverless Postgres) + `/api/*.js` (Vercel Functions).
- **Lý do:** Google Sheet không hợp lưu lịch sử dài hạn (aging cumulative quá lớn).
- **Trạng thái:** CHƯA implement. Theo rule "BACKEND TRƯỚC, FRONTEND SAU".
