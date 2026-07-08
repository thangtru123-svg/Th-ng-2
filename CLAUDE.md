# Ghi nhớ dự án — Dashboard Báo Cáo Vận Hành XBG

## Quy tắc bắt buộc
- **NGHIÊM CẤM TỰ BỊA SỐ** — mọi con số phải có nguồn từ dashboard/sheet thực tế. Nếu không có dữ liệu, ghi rõ "không có dữ liệu".
- **Luôn trả lời bằng tiếng Việt**
- **Xưng hô**: Gọi người dùng là **"đại nhân"**, tự xưng là **"con"**, mở đầu bằng **"Bẩm đại nhân"**
- **Luôn auto-commit và push** sau khi sửa, không hỏi lại
- **Push qua GitHub Desktop** (`bash git push` lỗi 403 proxy)
- **Hosting: VERCEL** — https://th-ng-2.vercel.app (Netlify hết credit, KHÔNG dùng)
- **Không bao giờ dùng aging-dashboard.html riêng lẻ** — đã tích hợp vào index.html
- **Trước khi bắn Telegram**: LUÔN hard reload tab trước rồi navigate đúng page, chờ data load xong mới chụp
- **NGHIÊM CẤM BỊA DỮ LIỆU** — không tự tạo/ước đoán bất kỳ dữ liệu nào. Không có nguồn thật thì ghi rõ "không có dữ liệu".
- **BACKEND TRƯỚC, FRONTEND SAU** — luôn làm backend API (có dữ liệu thật) xong rồi mới làm Frontend, để không có dữ liệu ảo.
- **KHÔNG DÙNG Fable 5** — tuyệt đối không dùng model `claude-fable-5`.
- **PHÂN TÍCH PHẢI XUỐNG DÒNG TỪNG Ý** — mọi ô/box nhận định (analysis-box) dưới bảng phải chi tiết và **mỗi ý một dòng** (dùng `<br>`), KHÔNG gộp thành 1 dòng dài. Cấu trúc chuẩn: (1) nêu tổng thể (VD tổng doanh thu Vùng), (2) tăng/giảm so với kỳ liền trước, (3) so sánh cùng kỳ trước → xuống dòng 🟢 Tốt nhất … / 🔴 Tệ nhất …

### Quy tắc chọn model theo loại việc
| Loại việc | Model | Model ID |
|-----------|-------|----------|
| Đọc (đọc file, tra cứu, tóm tắt đơn giản) | Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Suy luận, tính toán, viết code, việc cần tư duy cao | Opus 4.8 | `claude-opus-4-8` |
| Viết (soạn văn bản, nội dung) | Sonnet 5 | `claude-sonnet-5` |

> ⚠️ **Lưu ý cơ chế**: Trong 1 phiên chat, con KHÔNG tự đổi được model chính giữa chừng — model chính do đại nhân chọn qua `/model`. Con chỉ áp được quy tắc này khi giao việc phụ cho **subagent** (Agent tool): chỉ định `model` tương ứng theo loại việc.

---

## Thông tin dự án

| Mục | Giá trị |
|-----|---------|
| Website PROD (Vercel) | https://th-ng-2.vercel.app |
| Repo GitHub | https://github.com/thangtru123-svg/Th-ng-2 |
| Repo local | `/Users/abc/Documents/GitHub/Th-ng/` |
| Repo bash (Claude Code) | `/sessions/adoring-inspiring-planck/mnt/Th-ng/` |
| File chính | `index.html` (toàn bộ code frontend trong 1 file) |
| Người làm | Phạm Đức Thắng — thangtru123@gmail.com |

---

## Cấu trúc trang (Sidebar) — ĐẦY ĐỦ

| ID | Tên trang | Nguồn dữ liệu | Hàm build |
|----|-----------|---------------|-----------|
| p0 | Dashboard Tổng Quan | Tổng hợp từ các trang | `buildOverviewPage()` |
| p1 | Tổng quan GTC Total | SID (sheet `GTC Total theo AM` + `GTC Total theo Bưu Cục`) | `buildGTCPage()` |
| p2 | Tổng quan GTC TTS | SID (sheet `GTC TTS theo AM` + `GTC TTS theo Bưu Cục`) | `buildGTCPage()` |
| p3 | TLT theo Ngày | SID (nhiều sheet FD) | `buildFDDayPage()` |
| p4 | TLT theo Tuần | SID (nhiều sheet FD) | `buildFDWeekPage()` |
| p5 | Tổng quan ODR TTS | SID (sheet `ODR TTS - AM` + `ODR TTS - Bưu Cục`) | `buildOntimePage()` |
| p6 | Tổng quan OPR TTS | SID (sheet `OPR TTS - AM` + `OPR TTS - Bưu Cục`) | `buildOntimePage()` |
| p7 | Aging > 5 ngày | `AGING_SHEET_ID` (CSV riêng) | `buildAgingPage()` |
| p12 | AI - Phân tích tổng quan | Groq API (key lưu localStorage) | `buildAIPage()` |
| p16 | Báo Cáo Vận Hành Ngày | SID (nhiều sheet) | `buildDailyReportPage()` |
| p17 | Báo Cáo Vận Hành Tuần | SID | `buildWeeklyReport()` |
| p18 | Tổng quan Volume | `SHEET_VOL_ID` | `buildVolumeReport()` |
| p19 | GTC TTS Ca 1,2 theo BC | `SHEET_GTC_BC_ID` | `buildGTCBCReport()` |
| p20 | Năng suất nhân viên | SID | `buildNangSuatPage()` |
| p21 | Tỉ lệ NVPTTT nộp COD | `SHEET_COD_ID` | `buildCODPage()` |

> p8, p9, p10, p11, p13, p14, p15 là các ID cũ từ Looker Studio embed — không còn dùng trong codebase hiện tại.

---

## Sheet IDs & Constants (~line 260–365 trong index.html)

```javascript
/* ===== AUTH ===== */
const AUTH_CLIENT_ID = '307904146149-7kg0dkc0rbcm5vdjfe1ltnvrlg3mv1uv.apps.googleusercontent.com';
const WHITELIST_SHEET_ID = '1w4Ufjf6_P46bfK5LxW0ORqUhr__q1ghNqfGZ3_w6KQ0';

/* ===== MAIN SHEET (SID) — nguồn dữ liệu chính ===== */
const SID = '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8'; // "Chạy Báo cáo Dashboard - Thắng"

/* ===== SHEET RIÊNG ===== */
const SHEET_GTC_BC_ID = '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8'; // GID=201703493
const SHEET_COD_ID    = '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8'; // GID=1639392945
const SHEET_VOL_ID    = '1BsqjKaWRHSq8RaiQ0AD-cGBU3jsF-fu0fEwqHmt6gu4'; // GID=375236641
const AGING_SHEET_ID  = '1jCWPRvfGA7d2uHL6_xT8ZxU3tgpOdlBK1-c4QT961ew'; // GID=1424919323, sheet "Export"

/* ===== TELEGRAM ===== */
const TG_TOKEN        = '7471088067:AAGje2KrjUTzlkIiU05h1bm21IUkB0J2J0s';
const TG_AGING_CHAT   = -1003802272887;
const TG_AGING_THREAD = 4;    // topic "Aging/ Backlog"
const TG_VH_THREAD    = 5;    // topic "Vận hành chung"
const TG_FD_THREAD    = 8250; // topic "FD - Mục tiêu toàn vùng 8%"
const TG_PICKUP_THREAD = 7;   // topic "Pickup / Luân chuyển"
const TG_TTS_THREAD   = 3;    // topic "TTS - Vận hành"
```

### Cách fetch SID
```javascript
// Dùng gviz (cần đăng nhập Google)
`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`

// Aging dùng export CSV trực tiếp (không dùng gviz)
`https://docs.google.com/spreadsheets/d/${AGING_SHEET_ID}/export?format=csv&gid=${AGING_GID}`
```

### Các sheet tab trong SID
`GTC Total theo AM`, `GTC Total theo Bưu Cục`, `GTC TTS theo AM`, `GTC TTS theo Bưu Cục`,
`FD Total theo AM`, `FD Total theo Bưu Cục`, `FD SME theo AM`, `FD SME theo Bưu Cục`,
`FD TTS theo AM`, `FD TTS theo Bưu Cục`, `FD Shopee theo AM`, `FD Shopee theo Bưu Cục`,
`ODR TTS - AM`, `ODR TTS - Bưu Cục`, `OPR TTS - AM`, `OPR TTS - Bưu Cục`,
`GTC ca 1,2 theo AM`, `GTC ca 1,2 TTS theo AM`, `LTC - AM`

---

## Cấu trúc dữ liệu các sheet (cột)

### GTC Total theo AM
`AM(0), Ngày(1), Vol(2), %Gán(3), %GTC(4), nGTC(5)`

### GTC Total theo Bưu Cục
`AM(0), BC(1), Ngày(2), Vol(3), %Gán(4), %GTC(5), nGTC(6)`

### FD Total theo AM / BC
`name(0), Ngày(1), %Vol(2), %FD(3)` — **%FD lưu dạng fraction 0–1**, nhân 100 mới ra %

### ODR / OPR TTS - AM
`AM(0), Ngày(1), Vol(2), %Ontime(3 — fraction 0-1), Count(4)`

### ODR / OPR TTS - Bưu Cục
`AM(0), BC(1), Ngày(2), Vol(3), %Ontime(4 — fraction 0-1), Count(5)`

### Aging (AGING_SHEET_ID — sheet "Export")
```
A(0): Vùng     | B(1): Tỉnh    | C(2): BC       | D(3): Mã đơn
E(4): Tệp khách | F(5): Ngày nhập | G(6): Số ngày | H(7): Giờ CN
I(8): SL giao  | J(9): Nhóm BL | K(10): AM      | L(11): Date (YYYY-MM-DD)
M(12): Note    ← "Bưu Cục bất ổn" nếu BC đang bất ổn
```
- **Format ngày cột L**: `YYYY-MM-DD` (ví dụ: `2026-07-06`)
- **Lọc ngày cụ thể**: `rows.filter(r => r[11] === '2026-07-06')`
- **BC bất ổn**: `r[12] && r[12].includes('bất ổn')`

---

## Telegram — Hàm send & Mapping trang

### Hàm send cơ bản
```javascript
_tgSend(chatId, threadId, text)        // gửi tin nhắn text (HTML parse_mode)
_tgSendPhoto(chatId, threadId, blob, caption)  // gửi ảnh
_tgSendDoc(chatId, threadId, blob, caption)    // gửi document (ảnh quá rộng)
_captureEl(elId)                       // chụp element → Blob
```

### Mapping trang → hàm send riêng → Topic TG
| Trang | Hàm | Topic |
|-------|-----|-------|
| p1 | `sendGTCTotalToTelegram()` | Vận hành chung (TG_VH_THREAD=5) |
| p3 | `sendTLTToTelegram()` | FD (TG_FD_THREAD=8250) |
| p7 | `sendAgingToTelegram()` | Aging/Backlog (TG_AGING_THREAD=4) |
| p16 | `sendP16ToTelegram()` | Vận hành chung (TG_VH_THREAD=5) |
| Tất cả | `sendAllToTelegram()` | Bắn tuần tự tất cả các trang |

### Nút TG in-page (đã thêm)
- **Vị trí**: nằm trong `.page-meta` của header mỗi trang
- **ID nút**: `tgInpage_p1`, `tgInpage_p3`, `tgInpage_p7`, `tgInpage_p16`
- **Class CSS**: `.tg-inpage-btn`
- **Hàm inject**: `injectTgBtn(pageId, fn, label)` — gọi sau build
- **Hàm inject all**: `injectAllTgBtns()` — gọi trong `setTimeout(..., 200)` cuối main build

### `sendAgingToTelegram()` — Logic caption 4 ảnh
Gửi 4 ảnh mỗi ảnh có phân tích đính kèm trong caption:
1. `aging-cards` → cap1: Tổng quan + nhận định + cảnh báo
2. `aging-tbl-am` → cap2: Top 5 AM với delta ▲▼
3. `aging-tbl-batOn` → cap3: Top 5 BC bất ổn với delta
4. `aging-tbl-bc` (trim 20 rows) → cap4: Top 5 BC ổn định với delta

**Không có tin nhắn text riêng** — phân tích nằm hết trong caption từng ảnh.

### `trimCap(s)` — giới hạn 1020 ký tự (Telegram max 1024)

---

## Quy tắc chụp ảnh Telegram — QUAN TRỌNG

### Tránh nhầm table dropdown search
Tất cả dashboard có `addBCSearch` có **2 tables**:
- `table[0]` = dropdown search (hidden, `width:100%`, `scrollWidth=0`)
- `table[1]` = data table (visible, `width:Xpx`)

```javascript
// ĐÚNG — luôn dùng 1 trong 2 cách này:
el.querySelector('.table-wrap>table')
[...el.querySelectorAll('table')].find(t => t.offsetWidth > 0)

// SAI — đừng dùng:
el.querySelector('table')  // lấy nhầm dropdown search
el.querySelector('tbody')  // lấy nhầm tbody của dropdown
```

### Pattern chụp ảnh clone card (cho p3, p1-BC)
```javascript
const cl = card.cloneNode(true);
cl.querySelectorAll('.table-wrap>div').forEach(e => e.remove()); // ẩn search bar
cl.querySelectorAll('thead,th').forEach(el => {
  el.style.position = ''; el.style.top = ''; el.style.zIndex = '';
}); // unstick header để capture đúng
const tmp = document.createElement('div');
tmp.style.cssText = 'position:fixed;top:-9999px;left:0;z-index:-1;width:960px;padding:0';
tmp.appendChild(cl);
document.body.appendChild(tmp);
await new Promise(r => setTimeout(r, 300));
try { const img = await _captureEl(tmp.id); /* ... */ } finally { tmp.remove(); }
```

### Width chuẩn khi clone
- AM card (p3): `width: 960px`
- BC card (p3): `width: 1200px`
- P1 BC card: `width: 1400px`

---

## Logic Năng Suất (p20)

```javascript
// NS TB = GTC ÷ số NV duy nhất ÷ số ngày được chọn
const nsTB = d.nvs.size > 0 ? Math.round(d.gtc / d.nvs.size / selDates.length) : 0;
```
- `d.nvs` = Set tên nhân viên duy nhất trong tất cả ngày được chọn
- Bias: NV chỉ làm 1/2 ngày vẫn bị tính đủ vào mẫu → NS bị thấp hơn thực tế

---

## TONG_CONG (hardcoded — 2 chỗ trong index.html)

- **Khoảng**: ~line 502 và ~line 689
- **Nguồn**: Looker Studio "Tỉ lệ trả (Kết thúc giao)" — bộ lọc: Chi tiết=AM, Loại ngày=Ngày
- **Lấy giá trị**: dòng "Tổng số", cột **% Return**
- **Cập nhật hàng ngày** — format: `'2026-06-21': 11.8`

---

## Looker Studio — Report IDs

| Report | ID |
|--------|-----|
| TLT (Tỉ lệ trả) | `fcc2cc6e-17c0-4cf8-9c88-1258e4a76e48`, page: `p_b5du2yhowd` |
| XL/TTS | `5c7ad323-d293-4da2-9d88-d77034000af7` |
| Ontime | `b8742a59-eda0-477f-8352-ac3bbcdb5ded`, page Ontime Pickup: `p_cojbhmb6gd` |

**Cách xuất Sheet mới:**
1. Vào đúng tab "Tỉ lệ trả (Kết thúc giao)" (KHÔNG phải "Tỉ lệ trả")
2. Chuột phải vào bảng → "Xuất biểu đồ" → "Xuất dữ liệu" → "Google Trang tính"
3. Lấy Sheet ID từ URL file vừa tạo → cập nhật vào `index.html`

**Vấn đề Looker Studio trong iframe:**
- baocao.ghn.vn nhúng Looker Studio qua cross-origin iframe → Chrome MCP KHÔNG click được
- Fix: lấy `src` của iframe → mở tab mới trực tiếp → click bình thường
- Scroll trong Looker: `document.querySelector('.mainBlock').scrollTop = value` (KHÔNG dùng `window.scrollTo`)
- "Xuất dữ liệu" bị grayed out = đang right-click bảng LOGIC CŨ → phải dùng bảng LOGIC MỚI

---

## Quy trình cập nhật dữ liệu hàng ngày

1. Vào Looker Studio → xuất Sheet mới → lấy Sheet ID
2. Cập nhật Sheet IDs trong `index.html` (~line 46–59)
3. Cập nhật `TONG_CONG` (2 chỗ) với % Return ngày mới
4. Commit + Push → Vercel tự deploy (không cần làm gì thêm)

---

## Lỗi đã gặp & cách xử lý

| Lỗi | Nguyên nhân | Xử lý |
|-----|-------------|-------|
| `git push` lỗi 403 | Proxy chặn | Dùng GitHub Desktop, KHÔNG dùng bash |
| GitHub Pages stuck deployment_queued | CDN GitHub Pages | Đã chuyển sang Vercel — bỏ qua |
| Google OAuth `origin_mismatch` | Đổi domain | GCP Console → OAuth credentials → thêm domain mới vào Authorized JS Origins |
| Chụp TG ra ảnh toàn checkbox | `querySelector('table')` lấy dropdown search | Dùng `.table-wrap>table` hoặc `.find(t=>t.offsetWidth>0)` |
| `_captureEl` ra khoảng trắng / scrollWidth=0 | Lấy nhầm dropdown search table (hidden) | Dùng `.table-wrap>table` ưu tiên |
| Trim BC rows nhầm tbody dropdown | `querySelector('#id tbody')` = tbody đầu tiên = dropdown | `querySelector('#id .table-wrap>table tbody')` |
| Caption TG bị ẩn "Xem thêm" | Caption > 1024 ký tự, Telegram collapse | Đã chuyển sang gửi phân tích trong caption từng ảnh (mỗi cap <= 1020 chars) |
| So sánh tuần mũi tên ngược | `fd2-fd1` thay vì `fd1-fd2` | `buildFDWeekTable`: diff = `fd1-fd2` (mới - cũ) |
| Scroll Looker Studio không hoạt động | `window.scrollTo` không scroll được iframe content | Dùng `.mainBlock` container |
| FD value hiển thị 0.1% thay vì 10% | FD sheet lưu fraction 0–1 | Nhân 100 hoặc dùng `parsePct()` |
| Chrome MCP không click Looker Studio | Cross-origin iframe từ baocao.ghn.vn | Mở tab mới với URL embed trực tiếp (có session params) |
| Push origin bị che bởi dock | GitHub Desktop window bị dock | `key("cmd+p")` sau khi `open_application("GitHub Desktop")` |
| Aging data quá lớn (cumulative) | Sheet aging lưu snapshot từng ngày | Filter `r[11] === 'YYYY-MM-DD'` để lấy đúng 1 ngày |
| Nút TG in-page mất sau khi đổi ngày p16 | `_rerenderDaily` reset innerHTML | Gọi `injectTgBtn('p16',...)` trong `_rerenderDaily` sau khi set innerHTML |

---

## Cấu trúc CSS quan trọng

```css
.page-header     { margin-bottom: 18px }
.page-title      { font-size: 22px; font-weight: 800 }
.page-meta       { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.analysis-box    { background: #FFF7ED; border-left: 3px solid var(--orange) }
.tg-inpage-btn   { /* nút TG xanh nhỏ trong page-meta */ }
.table-wrap      { overflow-x: auto; overflow-y: auto }
```

---

## Cách commit/push đúng

```bash
# Bash: git add + commit ONLY (KHÔNG push)
cd /sessions/adoring-inspiring-planck/mnt/Th-ng
git add index.html
git commit -m "feat/fix: mô tả"
```

### Push — 2 cách (ưu tiên cách 1):
1. **Auto**: `open_application("GitHub Desktop")` → `key("cmd+p")` → "Last fetched just now" = done ✓
2. **Thủ công**: Mở GitHub Desktop → click "Push origin"

> ⚠️ `bash git push` lỗi 403 proxy — TUYỆT ĐỐI KHÔNG DÙNG

---

## Ghi chú Database (kế hoạch)

- Hướng đề xuất: **Neon** (serverless Postgres) + **Vercel Functions** (`/api/*.js`)
- Dùng để lưu lịch sử dài hạn (aging, GTC, FD...) thay Google Sheet
- Frontend gọi `fetch('/api/aging?from=...&to=...')` thay vì fetch CSV
- Package cần: `@neondatabase/serverless` (npm install)
- Chưa implement — chỉ là kế hoạch

---

# ========== KIẾN TRÚC LÀM VIỆC (setup 2026-07-08) ==========

## THÔNG TIN DỰ ÁN (tóm tắt kiến trúc)

| Mục | Giá trị thật |
|-----|--------------|
| Tên dự án | Dashboard Báo Cáo Vận Hành XBG (thư mục `Th-ng`, repo `Th-ng-2`) |
| Mục tiêu | Tổng hợp & báo cáo vận hành (GTC/FD/ODR/OPR/Aging...), bắn Telegram tự động |
| Tech stack | **Static site — 1 file `index.html`**, vanilla JS, KHÔNG build system / KHÔNG npm |
| Database | Không có — Google Sheets làm nguồn (Neon Postgres mới là kế hoạch, xem trên) |
| Deploy platform | **Vercel** (auto-deploy khi push `main`) |
| Repo | https://github.com/thangtru123-svg/Th-ng-2.git |

## QUY TẮC BẮT BUỘC (R1–R9)

- **R1 — Bám sát yêu cầu.** Làm đúng việc đại nhân giao, không tự ý mở rộng.
- **R2 — Không fake / mock khi chưa xong.** Trùng với rule "NGHIÊM CẤM BỊA DỮ LIỆU".
- **R3 — KHÔNG hardcode secret mới.** ⚠️ Lưu ý thực tế: site client-only, không có server/`.env` → `TG_TOKEN`, `AUTH_CLIENT_ID`... đang buộc phải nằm trong `index.html`. KHÔNG thêm secret mới; khi có backend (Neon/Vercel Functions) thì chuyển sang env.
- **R4 — Phát hiện bug → phải fix hoặc báo.** Không im lặng bỏ qua.
- **R5 — Verify trước khi báo "done".** Không có build → verify = mở `index.html` (hoặc `python3 -m http.server`), console sạch, trang render đúng.
- **R6 — Nhất quán design system.** Dùng đúng CSS class hiện có (`.page-header`, `.analysis-box`, `.tg-inpage-btn`, `.table-wrap`), biến màu `var(--orange)`...
- **R7 — KHÔNG commit `.env` / thông tin nhạy cảm mới.** Đã có `.gitignore` chặn `.env*`.
- **R8 — Hỏi trước khi xóa data / drop table / đổi kiến trúc lớn.**
- **R9 — Ghi bài học vào `.claude/memory/lessons.md` sau mỗi incident.**

## DEPLOY PIPELINE

1. Sửa `index.html` → verify (mở trình duyệt, console sạch).
2. `git add index.html && git commit -m "..."` (bash — chỉ add + commit).
3. Push qua **GitHub Desktop** (`cmd+p`) — KHÔNG dùng `bash git push` (403 proxy).
4. **Vercel tự deploy** `main` → verify https://th-ng-2.vercel.app.
> `.github/workflows/deploy.yml` (GitHub Pages) còn tồn tại nhưng ĐÃ BỎ.

## ENV VARIABLES

- Không có file `.env` / `.env.example` — site client-only.
- Cấu hình (Sheet IDs, TG token, OAuth client) nằm trực tiếp trong `index.html` (~line 260–365).

## CẤU TRÚC DỰ ÁN (tree thật)

```
Th-ng/
├── index.html                 # Toàn bộ frontend (HTML/CSS/JS) — file chính
├── bg.jpg                     # Ảnh nền
├── .nojekyll                  # (di sản GitHub Pages)
├── CLAUDE.md                  # File này
├── .gitignore
├── .github/workflows/deploy.yml   # GitHub Pages — ĐÃ BỎ
└── .claude/
    ├── settings.local.json    # (gitignored)
    ├── memory/
    │   ├── lessons.md         # Bài học (append-only)
    │   └── decisions.md       # Quyết định kiến trúc
    └── agents/
        ├── builder.md         # Viết code (model: opus-4-8)
        ├── checker.md         # Review/verify (model: opus-4-8)
        └── deployer.md        # Deploy Vercel (model: haiku-4-5)
```

## AGENTS

- **builder** — implement feature/fix (Opus 4.8). Spawn khi cần build.
- **checker** — review bug/security, verify (Opus 4.8). Spawn SAU builder, TRƯỚC deploy.
- **deployer** — commit + push GitHub Desktop, verify Vercel (Haiku 4.5). Spawn khi checker PASS.

## BÀI HỌC ĐÃ HỌC
Xem [`.claude/memory/lessons.md`](.claude/memory/lessons.md) và bảng "Lỗi đã gặp & cách xử lý" ở trên.
