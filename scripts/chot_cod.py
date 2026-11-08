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
IMG1 = os.path.join(OUT, 'chot_cod_AM.png'); IMG2 = os.path.join(OUT, 'chot_cod_BC.png')
table_png(BY_AM, 'Theo AM quản lý', IMG1, 'AM', 30, f'TỔNG ({len(BY_AM)} AM)')
table_png(BY_BC, f'Theo Bưu Cục — {min(18,len(BY_BC))} BC nhiều đơn nhất (đủ {len(BY_BC)} BC trong file Excel)', IMG2, 'Bưu Cục', 18, f'TỔNG cả {len(BY_BC)} BC')

# ===================== CAPTION + GỬI TELEGRAM =====================
top_am = ' · '.join(f"{r['key']} {r['gn']}+{r['pn']}" for r in BY_AM[:5])
CAP = (f"CHỐT COD ≥ 1 triệu — Lạng Sơn + Quảng Ninh — {STAMP}\n"
       f"- Đơn GTB (giao thất bại): {vn(G_N)} đơn · {tr(G_C)}\n"
       f"- Đơn chưa chốt trạng thái: {vn(P_N)} đơn · {tr(P_C)}\n"
       f"- Tổng cần đối soát: {vn(G_N + P_N)} đơn · {tr(G_C + P_C)}\n"
       f"AM nhiều đơn nhất (GTB+chưa chốt): {top_am}\n"
       f"Chi tiết theo AM, Bưu Cục, danh sách đơn: file Excel đính kèm.")[:1020]
def tg(method, fields, files=None):
    b = uuid.uuid4().hex; body = io.BytesIO()
    for k, v in fields.items(): body.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (name, data, ctype) in (files or {}).items():
        body.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode()); body.write(data); body.write(b'\r\n')
    body.write(f'--{b}--\r\n'.encode())
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/{method}', data=body.getvalue(), headers={'Content-Type': f'multipart/form-data; boundary={b}'})
    for k in range(4):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=120).read())
        except urllib.error.HTTPError as e:
            t = e.read().decode('utf-8', 'ignore')
            if e.code == 429:
                import time; time.sleep(int((json.loads(t).get('parameters') or {}).get('retry_after', 5)) + 1); continue
            raise RuntimeError(f'Telegram {method} HTTP {e.code}: {t[:200]}')
    raise RuntimeError('Telegram retry hết')
print(f'[chot] GTB={G_N} chuaChot={P_N} AM={len(BY_AM)} BC={len(BY_BC)} → {XLSX}')
if DRY:
    print(CAP); print('DRY — không gửi'); sys.exit(0)
r1 = tg('sendPhoto', {'chat_id': TG_CHAT, 'caption': CAP}, {'photo': (os.path.basename(IMG1), open(IMG1, 'rb').read(), 'image/png')})
r2 = tg('sendPhoto', {'chat_id': TG_CHAT, 'caption': 'Theo Bưu Cục — ' + STAMP}, {'photo': (os.path.basename(IMG2), open(IMG2, 'rb').read(), 'image/png')})
r3 = tg('sendDocument', {'chat_id': TG_CHAT, 'caption': 'File chốt COD ≥ 1tr — ' + STAMP}, {'document': (fn, open(XLSX, 'rb').read(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
print('[chot] đã gửi', [r.get('ok') for r in (r1, r2, r3)])
