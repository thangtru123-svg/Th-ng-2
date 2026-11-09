#!/usr/bin/env python3
# chot_cod.py — chốt COD >= 1tr (2 tỉnh Lạng Sơn + Quảng Ninh) lúc 23h30 / 23h45: Excel + ảnh thống kê → Telegram nhóm XBG, topic "Vấn đề chung".
# Dữ liệu: cod_chot.json do `COD_ONLY=1 node scripts/pull_gtc.js` ghi ra.
#   GTB (giao thất bại) = isSucceeded=false VÀ có failCode · Chưa chốt = chưa giao xong & chưa có lý do thất bại.
# Dùng:  python3 scripts/chot_cod.py            → gửi Telegram
#        python3 scripts/chot_cod.py --dry out_dir   → chỉ tạo file vào out_dir, KHÔNG gửi
import json, os, sys, io, datetime, urllib.request, uuid, collections
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TG_TOKEN = os.environ.get('TG_TOKEN') or '7471088067:AAGje2KrjUTzlkIiU05h1bm21IUkB0J2J0s'
TG_CHAT = int(os.environ.get('TG_CHAT') or -1003802272887)   # nhóm XBG (topic "Vấn đề chung" = General → không kèm thread)
DRY = '--dry' in sys.argv
OUT = sys.argv[sys.argv.index('--dry') + 1] if DRY and len(sys.argv) > sys.argv.index('--dry') + 1 else os.path.join(ROOT, 'out_chot')
os.makedirs(OUT, exist_ok=True)

D = json.load(open(os.path.join(ROOT, 'cod_chot.json'), encoding='utf-8'))
GTB = D['cod']['orders']; PEND = D['codPending']['orders']
upd = datetime.datetime.fromisoformat(D['updatedAt'].replace('Z', '+00:00')) + datetime.timedelta(hours=7)
STAMP = upd.strftime('%H:%M %d/%m/%Y')
vn = lambda n: f"{round(n):,}".replace(',', '.')
tr = lambda n: f"{n/1e6:,.1f}".replace(',', 'X').replace('.', ',').replace('X', '.') + ' tr'

def agg(keyf):
    m = collections.OrderedDict()
    for tag, lst in (('g', GTB), ('p', PEND)):
        for o in lst:
            k = keyf(o); r = m.setdefault(k, dict(key=k, gn=0, gc=0, pn=0, pc=0, am=o.get('am', ''), tinh=o.get('tinh', '')))
            r[tag + 'n'] += 1; r[tag + 'c'] += o['cod']
    return sorted(m.values(), key=lambda r: (-(r['gn'] + r['pn']), -(r['gc'] + r['pc'])))
BY_AM = agg(lambda o: o.get('am') or '—'); BY_BC = agg(lambda o: o.get('bc') or '—'); BY_T = agg(lambda o: o.get('tinh') or '—')
G_N, G_C = len(GTB), sum(o['cod'] for o in GTB); P_N, P_C = len(PEND), sum(o['cod'] for o in PEND)
NV_MIN = 3        # NV nghi ngờ gối COD: có >= 3 đơn GTB trong ngày
NV_HIGH = 3000000 # HOẶC có >= 1 đơn GTB COD >= 3.000.000đ (dù chỉ 1-2 đơn) → tính vào, cộng luôn các đơn còn lại của NV đó
def nv_agg():
    m = {}
    for tag, lst in (('g', GTB), ('p', PEND)):
        for o in lst:
            k = str(o.get('idnv') or o.get('nv') or '?')
            r = m.setdefault(k, dict(nv=o.get('nv') or '(không rõ)', idnv=o.get('idnv', ''), gn=0, gc=0, pn=0, pc=0, gmax=0, bcs=collections.Counter(), am=o.get('am', '')))
            r[tag + 'n'] += 1; r[tag + 'c'] += o['cod']; r['bcs'][o.get('bc', '')] += 1
            if tag == 'g' and o['cod'] > r['gmax']: r['gmax'] = o['cod']
    out = []
    for r in m.values():
        bc, _ = r['bcs'].most_common(1)[0]; r['bc'] = bc; out.append(r)
    return sorted(out, key=lambda r: (-r['gn'], -r['gc']))
BY_NV = nv_agg()
def why(r):
    w = []
    if r['gn'] >= NV_MIN: w.append(f"≥{NV_MIN} đơn")
    if r['gmax'] >= NV_HIGH: w.append(f"có đơn ≥{NV_HIGH//1000000}tr")
    return ' + '.join(w)
NV3 = [r for r in BY_NV if r['gn'] > 0 and why(r)]
for r in NV3: r['why'] = why(r)

# ===================== EXCEL =====================
NAVY = '1F3864'; thin = Side(style='thin', color='A6A6A6'); brd = Border(left=thin, right=thin, top=thin, bottom=thin)
HF = Font(bold=True, color='FFFFFF', size=11, name='Arial'); HFILL = PatternFill('solid', fgColor=NAVY); SUB = PatternFill('solid', fgColor='DCE6F1')
ctr = Alignment(horizontal='center', vertical='center', wrap_text=True); lft = Alignment(horizontal='left', vertical='center', wrap_text=True)
def cell(ws, r, c, v, fmt=None, bold=False, fill=None, al=ctr, color=None):
    x = ws.cell(r, c, v); x.border = brd; x.alignment = al; x.font = Font(name='Arial', size=10, bold=bold, color=color)
    if fmt: x.number_format = fmt
    if fill: x.fill = fill
def hdr(ws, r, vals):
    for i, v in enumerate(vals, 1):
        x = ws.cell(r, i, v); x.font = HF; x.fill = HFILL; x.alignment = ctr; x.border = brd
    ws.row_dimensions[r].height = 34
wb = Workbook(); ws = wb.active; ws.title = 'Tổng hợp theo AM'
def summary(ws, rows, key_label, with_am=False):
    ws['A1'] = f'CHỐT COD ≥ 1.000.000đ — Lạng Sơn + Quảng Ninh — {STAMP}'; ws['A1'].font = Font(bold=True, size=13, color=NAVY, name='Arial')
    ws['A2'] = 'GTB = giao thất bại (có lý do thất bại) · Chưa chốt = chưa giao xong, chưa có lý do thất bại. Đã giao thành công thì không tính.'; ws['A2'].font = Font(italic=True, size=9, name='Arial')
    H = ([key_label, 'AM'] if with_am else [key_label]) + ['Đơn GTB', 'COD GTB (đ)', 'Đơn chưa chốt', 'COD chưa chốt (đ)', 'Tổng đơn', 'Tổng COD (đ)']
    hdr(ws, 4, H); r = 5
    for x in rows:
        v = ([x['key'], x['am']] if with_am else [x['key']]) + [x['gn'], x['gc'], x['pn'], x['pc'], x['gn'] + x['pn'], x['gc'] + x['pc']]
        for c, vv in enumerate(v, 1): cell(ws, r, c, vv, '#,##0' if c > (2 if with_am else 1) else None, al=lft if c <= (2 if with_am else 1) else ctr)
        r += 1
    n0 = 3 if with_am else 2
    tot = ['TỔNG'] + (['—'] if with_am else []) + [G_N, G_C, P_N, P_C, G_N + P_N, G_C + P_C]
    for c, vv in enumerate(tot, 1): cell(ws, r, c, vv, '#,##0' if c >= n0 else None, True, SUB, lft if c < n0 else ctr)
    for i, w in enumerate(([22, 18] if with_am else [26]) + [11, 17, 13, 18, 11, 17], 1): ws.column_dimensions[L(i)].width = w
    ws.freeze_panes = 'A5'
summary(ws, BY_AM, 'AM')
w2 = wb.create_sheet('Theo Bưu Cục'); summary(w2, BY_BC, 'Bưu Cục', True)
w3 = wb.create_sheet('Theo Tỉnh'); summary(w3, BY_T, 'Tỉnh')
def olist(title, lst, note):
    w = wb.create_sheet(title)
    hdr(w, 1, ['STT', 'Mã đơn', 'COD (đ)', 'NV giao', 'ID NV', 'Bưu Cục', 'AM', 'Tỉnh', note])
    for i, o in enumerate(lst, 2):
        for c, vv in enumerate([i - 1, o['ma'], o['cod'], o.get('nv', ''), o.get('idnv', ''), o.get('bc', ''), o.get('am', ''), o.get('tinh', ''), o.get('note', '')], 1):
            cell(w, i, c, vv, '#,##0' if c == 3 else None, al=lft if c in (2, 4, 6, 7, 8, 9) else ctr)
    for i, wd in enumerate([6, 18, 14, 22, 10, 20, 20, 12, 40], 1): w.column_dimensions[L(i)].width = wd
    w.freeze_panes = 'A2'; w.auto_filter.ref = f"A1:I{max(2, len(lst) + 1)}"
wn = wb.create_sheet('NV nghi ngờ gối COD')
hdr(wn, 1, ['STT', 'NV', 'ID NV', 'AM', 'Bưu Cục', 'Đơn GTB', 'COD GTB (đ)', 'Đơn GTB lớn nhất (đ)', 'Lý do vào danh sách', 'Đơn chưa chốt', 'COD chưa chốt (đ)'])
for i, r in enumerate(NV3, 2):
    for c, vv in enumerate([i - 1, r['nv'], r['idnv'], r['am'], r['bc'], r['gn'], r['gc'], r['gmax'], r['why'], r['pn'], r['pc']], 1): cell(wn, i, c, vv, '#,##0' if c in (6, 7, 8, 10, 11) else None, al=lft if c in (2, 4, 5, 9) else ctr)
for i, wd in enumerate([6, 26, 11, 20, 20, 11, 16, 18, 22, 13, 17], 1): wn.column_dimensions[L(i)].width = wd
wn.freeze_panes = 'A2'
olist('Đơn GTB', GTB, 'Lý do thất bại'); olist('Đơn chưa chốt', PEND, 'Ghi chú')
fn = f"COD_Chot_{upd.strftime('%Y%m%d_%H%M')}.xlsx"; XLSX = os.path.join(OUT, fn); wb.save(XLSX)

# ===================== ẢNH THỐNG KÊ =====================
def table_png(rows, title, path, key_label, maxrows, total_label='TỔNG'):
    rows = rows[:maxrows]
    n = len(rows) + 1
    fig_h = 2.2 + 0.36 * n + 0.3
    fig = plt.figure(figsize=(11.5, fig_h), dpi=140); fig.patch.set_facecolor('white')
    ax = fig.add_axes([0.01, 0.01, 0.98, max(0.3, 1 - 1.55 / fig_h)]); ax.axis('off')
    fig.text(0.02, 1 - 0.30 / fig_h, f'CHỐT COD ≥ 1.000.000đ — LẠNG SƠN + QUẢNG NINH — {STAMP}', fontsize=14, fontweight='bold', color='#1F3864', va='top')
    fig.text(0.02, 1 - 0.78 / fig_h, f'GTB: {vn(G_N)} đơn · {tr(G_C)}      Chưa chốt trạng thái: {vn(P_N)} đơn · {tr(P_C)}      Tổng: {vn(G_N + P_N)} đơn · {tr(G_C + P_C)}', fontsize=11.5, fontweight='bold', color='#C00000', va='top')
    fig.text(0.02, 1 - 1.22 / fig_h, title, fontsize=11, fontweight='bold', color='#444', va='top')
    cols = [key_label, 'Đơn GTB', 'COD GTB', 'Đơn chưa chốt', 'COD chưa chốt', 'Tổng đơn', 'Tổng COD']
    data = [[r['key'], vn(r['gn']), tr(r['gc']), vn(r['pn']), tr(r['pc']), vn(r['gn'] + r['pn']), tr(r['gc'] + r['pc'])] for r in rows]
    data.append([total_label, vn(G_N), tr(G_C), vn(P_N), tr(P_C), vn(G_N + P_N), tr(G_C + P_C)])
    tb = ax.table(cellText=data, colLabels=cols, loc='upper center', cellLoc='center', colWidths=[0.24, 0.10, 0.13, 0.13, 0.14, 0.10, 0.13], bbox=[0.0, 0.0, 1.0, 1.0])
    tb.auto_set_font_size(False); tb.set_fontsize(10)
    for (r_, c_), ce in tb.get_celld().items():
        ce.set_edgecolor('#9aa5b5'); ce.set_linewidth(0.6)
        if r_ == 0: ce.set_facecolor('#1F3864'); ce.get_text().set_color('white'); ce.get_text().set_fontweight('bold')
        elif r_ == len(data): ce.set_facecolor('#DCE6F1'); ce.get_text().set_fontweight('bold')
        else:
            ce.set_facecolor('#F5F7FA' if r_ % 2 == 0 else 'white')
            if c_ in (1, 2): ce.get_text().set_color('#C00000'); ce.get_text().set_fontweight('bold')
            if c_ in (3, 4): ce.get_text().set_color('#B45309')
        if c_ == 0 and r_ > 0: ce._loc = 'left'; ce.get_text().set_ha('left'); ce.PAD = 0.03
    fig.savefig(path, bbox_inches='tight', facecolor='white'); plt.close(fig)
def nv_png(rows, path, maxrows=40):
    rows = rows[:maxrows]; n = len(rows) + 1
    fig_h = 2.2 + 0.36 * n + 0.3
    fig = plt.figure(figsize=(13.5, fig_h), dpi=140); fig.patch.set_facecolor('white')
    ax = fig.add_axes([0.01, 0.01, 0.98, max(0.3, 1 - 1.55 / fig_h)]); ax.axis('off')
    fig.text(0.02, 1 - 0.30 / fig_h, f'NV NGHI NGỜ GỐI COD (≥{NV_MIN} ĐƠN GTB HOẶC CÓ ĐƠN ≥{NV_HIGH//1000000}TR) — LẠNG SƠN + QUẢNG NINH — {STAMP}', fontsize=13.5, fontweight='bold', color='#1F3864', va='top')
    fig.text(0.02, 1 - 0.78 / fig_h, f'{len(NV3)} nhân viên · {vn(sum(r["gn"] for r in NV3))} đơn GTB · {tr(sum(r["gc"] for r in NV3))}   (chiếm {sum(r["gn"] for r in NV3) * 100 // max(1, G_N)}% số đơn GTB toàn cụm)', fontsize=11.5, fontweight='bold', color='#C00000', va='top')
    fig.text(0.02, 1 - 1.22 / fig_h, f'Sắp theo số đơn GTB giảm dần' + (f' — hiển thị {len(rows)}/{len(NV3)} NV, đủ danh sách trong file Excel' if len(NV3) > len(rows) else ''), fontsize=11, fontweight='bold', color='#444', va='top')
    cols = ['NV', 'AM', 'Bưu Cục', 'Đơn GTB', 'COD GTB', 'Đơn lớn nhất', 'Lý do', 'Đơn chưa chốt']
    data = [[r['nv'], r['am'], r['bc'], vn(r['gn']), tr(r['gc']), tr(r['gmax']), r['why'], f"{vn(r['pn'])} · {tr(r['pc'])}"] for r in rows]
    data.append([f'TỔNG {len(NV3)} NV', '', '', vn(sum(r['gn'] for r in NV3)), tr(sum(r['gc'] for r in NV3)), '', '', f"{vn(sum(r['pn'] for r in NV3))} · {tr(sum(r['pc'] for r in NV3))}"])
    tb = ax.table(cellText=data, colLabels=cols, loc='upper center', cellLoc='center', colWidths=[0.17, 0.14, 0.15, 0.07, 0.10, 0.09, 0.15, 0.13], bbox=[0.0, 0.0, 1.0, 1.0])
    tb.auto_set_font_size(False); tb.set_fontsize(10)
    for (r_, c_), ce in tb.get_celld().items():
        ce.set_edgecolor('#9aa5b5'); ce.set_linewidth(0.6)
        if r_ == 0: ce.set_facecolor('#1F3864'); ce.get_text().set_color('white'); ce.get_text().set_fontweight('bold')
        elif r_ == len(data): ce.set_facecolor('#DCE6F1'); ce.get_text().set_fontweight('bold')
        else:
            ce.set_facecolor('#F5F7FA' if r_ % 2 == 0 else 'white')
            if c_ in (3, 4): ce.get_text().set_color('#C00000'); ce.get_text().set_fontweight('bold')
            if c_ in (5, 7): ce.get_text().set_color('#B45309')
        if c_ in (0, 1, 2) and r_ > 0: ce.get_text().set_ha('left'); ce._loc = 'left'; ce.PAD = 0.03
    fig.savefig(path, bbox_inches='tight', facecolor='white'); plt.close(fig)
IMG1 = os.path.join(OUT, 'chot_cod_AM.png'); IMG2 = os.path.join(OUT, 'chot_cod_BC.png'); IMG3 = os.path.join(OUT, 'chot_cod_NV.png')
if NV3: nv_png(NV3, IMG3)
table_png(BY_AM, 'Theo AM quản lý', IMG1, 'AM', 30, f'TỔNG ({len(BY_AM)} AM)')
table_png(BY_BC, f'Theo Bưu Cục — {min(18,len(BY_BC))} BC nhiều đơn nhất (đủ {len(BY_BC)} BC trong file Excel)', IMG2, 'Bưu Cục', 18, f'TỔNG cả {len(BY_BC)} BC')

# ===================== CAPTION + GỬI TELEGRAM =====================
top_am = ' · '.join(f"{r['key']} {r['gn']}+{r['pn']}" for r in BY_AM[:5])
CAP = (f"CHỐT COD ≥ 1 triệu — Lạng Sơn + Quảng Ninh — {STAMP}\n"
       f"- Đơn GTB (giao thất bại): {vn(G_N)} đơn · {tr(G_C)}\n"
       f"- Đơn chưa chốt trạng thái: {vn(P_N)} đơn · {tr(P_C)}\n"
       f"- Tổng cần đối soát: {vn(G_N + P_N)} đơn · {tr(G_C + P_C)}\n"
       f"AM nhiều đơn nhất (GTB+chưa chốt): {top_am}\n"
       f"NV nghi ngờ gối COD (≥{NV_MIN} đơn GTB hoặc có đơn ≥{NV_HIGH//1000000}tr): {len(NV3)} người (xem ảnh NV).\n"
       f"Chi tiết theo AM, Bưu Cục, danh sách đơn: file Excel đính kèm.")[:1020]
def tg(method, fields, files=None):
    b = uuid.uuid4().hex; body = io.BytesIO()
    for k, v in fields.items(): body.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (name, data, ctype) in (files or {}).items():
        body.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode()); body.write(data); body.write(b'\r\n')
    body.write(f'--{b}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/{method}', data=body.getvalue(), headers={'Content-Type': f'multipart/form-data; boundary={b}'})
    import time
    last = None
    for k in range(6):   # thử lại cả khi lỗi mạng / quá thời gian chờ (runner GitHub đôi lúc kẹt kết nối Telegram)
        try:
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except urllib.error.HTTPError as e:
            t = e.read().decode('utf-8', 'ignore')
            if e.code == 429:
                time.sleep(int((json.loads(t).get('parameters') or {}).get('retry_after', 5)) + 1); continue
            if e.code >= 500: last = f'HTTP {e.code}'; time.sleep(3 * (k + 1)); continue
            raise RuntimeError(f'Telegram {method} HTTP {e.code}: {t[:200]}')
        except (TimeoutError, OSError, urllib.error.URLError) as e:   # gồm socket.timeout, ConnectionError, SSL
            last = repr(e)[:120]; print(f'[tg] {method} lần {k + 1} lỗi mạng: {last} → thử lại'); time.sleep(3 * (k + 1)); continue
    raise RuntimeError(f'Telegram {method} thất bại sau 6 lần: {last}')
# ===== LƯU DATA CUỐI NGÀY (1 file / ngày — mỗi ngày chỉ chốt + bắn 1 lần) — dùng cho mục "NV nghi ngờ gối COD" trong báo cáo vận hành tuần =====
def save_day():
    t = str(D.get('today') or upd.strftime('%Y%m%d')); day = f'{t[:4]}-{t[4:6]}-{t[6:8]}'
    folder = os.path.join(ROOT, 'data_cod'); os.makedirs(folder, exist_ok=True)
    row = lambda o: [o['ma'], o['cod'], str(o.get('idnv', '')), o.get('nv', ''), o.get('bc', ''), o.get('am', '')]
    doc = {'date': day, 'savedAt': D['updatedAt'], 'scope': 'LSO+QNI, COD>=1.000.000', 'cols': ['ma', 'cod', 'idnv', 'nv', 'bc', 'am'],
           'gtb': [row(o) + [o.get('note', '')] for o in GTB], 'chuaChot': [row(o) for o in PEND]}
    json.dump(doc, open(os.path.join(folder, day + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return day
# ---- KHUNG GIỜ CHỐT 23h15–00h45 VN: chỉ trong khung này mới là "chốt cuối ngày" (bắn + LƯU, mỗi ngày đúng 1 lần) ----
_vn = datetime.datetime.utcnow() + datetime.timedelta(hours=7); _m = _vn.hour * 60 + _vn.minute
IN_WIN = (_m >= 23 * 60 + 15) or (_m < 45)
_day = str(D.get('today') or upd.strftime('%Y%m%d')); _day = f'{_day[:4]}-{_day[4:6]}-{_day[6:8]}'
_saved = os.path.exists(os.path.join(ROOT, 'data_cod', _day + '.json'))
EVENT = os.environ.get('GITHUB_EVENT_NAME', '')
if not DRY:
    if EVENT == 'schedule' and not IN_WIN:
        print(f'[chot] lịch GitHub chạy TRỄ quá khung 23h15–00h45 (bây giờ {_vn:%H:%M}) → bỏ qua, không bắn.'); sys.exit(0)
    if IN_WIN and _saved:
        print(f'[chot] ngày {_day} ĐÃ chốt + lưu rồi → không bắn lần 2.'); sys.exit(0)
SAVED = save_day() if ((IN_WIN and not DRY) or os.environ.get('CHOT_SAVE') == '1') else None
print(f'[chot] GTB={G_N} chuaChot={P_N} AM={len(BY_AM)} BC={len(BY_BC)} inWin={IN_WIN} saved={SAVED} → {XLSX}')
if DRY:
    print(CAP); print('DRY — không gửi'); sys.exit(0)
r1 = tg('sendPhoto', {'chat_id': TG_CHAT, 'caption': CAP}, {'photo': (os.path.basename(IMG1), open(IMG1, 'rb').read(), 'image/png')})
r2 = tg('sendPhoto', {'chat_id': TG_CHAT, 'caption': 'Theo Bưu Cục — ' + STAMP}, {'photo': (os.path.basename(IMG2), open(IMG2, 'rb').read(), 'image/png')})
if NV3:
    rn = tg('sendPhoto', {'chat_id': TG_CHAT, 'caption': f'NV nghi ngờ gối COD (≥{NV_MIN} đơn GTB hoặc có đơn ≥{NV_HIGH//1000000}tr) — kèm AM, Bưu Cục — ' + STAMP}, {'photo': (os.path.basename(IMG3), open(IMG3, 'rb').read(), 'image/png')})
r3 = tg('sendDocument', {'chat_id': TG_CHAT, 'caption': 'File chốt COD ≥ 1tr — ' + STAMP}, {'document': (fn, open(XLSX, 'rb').read(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
print('[chot] đã gửi', [r.get('ok') for r in (r1, r2, r3)])
