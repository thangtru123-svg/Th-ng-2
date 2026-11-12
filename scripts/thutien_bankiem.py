#!/usr/bin/env python3
# thutien_bankiem.py — quét mục "Thu tiền - Bắn kiểm" (nhanh.ghn.vn/lastmile/receipt/collect-money-management) của 32 BC Lạng Sơn + Quảng Ninh
# lúc 23h hàng ngày → thutien_bankiem.json (dashboard p53) + ảnh 2 bảng bắn vào nhóm XBG, topic "Vấn đề chung".
# API: POST nhanh-api.ghn.vn/api/lastmile/order/get-collect-scan-orders {hub_id, paging:{offset,limit}, hubId}  (Bearer GHN_SESSION)
#   Mỗi phần tử data.data = 1 NV còn tồn:  paid_orders[] (đơn cần tạo phiếu thu) + paid_amount (tiền cần thu)
#                                           storing_orders[] (đơn cần lưu kho → còn nút Bắn kiểm) + scan_orders[] (đơn cần bắn kiểm) + deadline
#   Dòng nào xong hết thì GHN tự bỏ khỏi danh sách → BC không có dòng = đã hoàn tất.
# Dùng:  GHN_SESSION=... python3 scripts/thutien_bankiem.py            → quét + gửi Telegram (theo luật khung giờ bên dưới)
#        GHN_SESSION=... python3 scripts/thutien_bankiem.py --dry DIR  → quét + tạo ảnh vào DIR, KHÔNG gửi, KHÔNG ghi json
import json, os, sys, io, time, datetime, urllib.request, urllib.error, uuid
from concurrent.futures import ThreadPoolExecutor
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SES = os.environ.get('GHN_SESSION')
if not SES and not os.environ.get('THUTIEN_FIXTURE'): print('THIEU env GHN_SESSION'); sys.exit(1)
TG_TOKEN = os.environ.get('TG_TOKEN') or '7471088067:AAGje2KrjUTzlkIiU05h1bm21IUkB0J2J0s'
TG_GROUP = int(os.environ.get('TG_CHAT') or -1003802272887)   # nhóm XBG; topic "Vấn đề chung" = General → không kèm thread
TG_ADMIN = 1747498029                                          # @thangquada
TINH = ['Lạng Sơn', 'Quảng Ninh']
DRY = '--dry' in sys.argv
OUT = sys.argv[sys.argv.index('--dry') + 1] if DRY and len(sys.argv) > sys.argv.index('--dry') + 1 else os.path.join(ROOT, 'out_thutien')
os.makedirs(OUT, exist_ok=True)
EVENT = os.environ.get('GITHUB_EVENT_NAME', '')

vnow = lambda: datetime.datetime.utcnow() + datetime.timedelta(hours=7)
# Lịch GitHub hay trễ: chạy cron sớm (22h47) rồi CHỜ tới 23h00 mới quét để số liệu đúng mốc 23h
if EVENT == 'schedule' and not DRY:
    n = vnow(); tgt = n.replace(hour=23, minute=0, second=5, microsecond=0)
    if n.hour >= 22 and n < tgt:
        w = (tgt - n).total_seconds()
        if w <= 20 * 60: print(f'[thutien] chờ {int(w)}s tới 23h00'); time.sleep(w)

HUBS = [h for h in json.load(open(os.path.join(ROOT, 'hub_map_bc.json'), encoding='utf-8')) if h['tinh'] in TINH]
BASE = 'https://nhanh-api.ghn.vn/api/lastmile/order/get-collect-scan-orders'

class AuthErr(Exception): pass
def call(hub_id, offset, limit=100):
    body = json.dumps({'hub_id': str(hub_id), 'paging': {'offset': offset, 'limit': limit}, 'hubId': str(hub_id)}).encode()
    last = None
    for k in range(5):
        req = urllib.request.Request(BASE, data=body, headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + SES})
        try:
            j = json.loads(urllib.request.urlopen(req, timeout=40).read())
            if isinstance(j.get('data'), dict) and (j['data'].get('data') is None or isinstance(j['data'].get('data'), list)): return j   # BC đã xong hết → data.data = null, total = 0
            last = f"code {j.get('code')} {str(j.get('message'))[:60]}"; time.sleep(1 + k)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403): raise AuthErr()
            last = f'HTTP {e.code}'; time.sleep(1.5 * (k + 1))
        except Exception as e:
            last = repr(e)[:80]; time.sleep(1.5 * (k + 1))
    raise RuntimeError(last or 'lỗi')

FIX = json.load(open(os.environ['THUTIEN_FIXTURE'], encoding='utf-8')) if os.environ.get('THUTIEN_FIXTURE') else None   # chỉ để thử bố cục ảnh bằng dữ liệu giả — KHÔNG dùng khi chạy thật
def scan(h):
    rows = []; off = 0; total = None
    while FIX is None:
        j = call(h['id'], off); d = j.get('data') or {}
        part = d.get('data') or []; total = d.get('total', len(part)) if total is None else total
        rows += part; off += len(part)
        if not part or off >= (total or 0) or off > 2000: break
    if FIX is not None: rows = FIX.get(str(h['id']), [])
    out = []
    for r in rows:
        paid = r.get('paid_orders') or []; stor = r.get('storing_orders') or []; scn = r.get('scan_orders') or []
        out.append({'idnv': str(r.get('paid_user_id', '')), 'nv': r.get('paid_user_name') or '(không rõ)', 'trip': r.get('trip_code', ''),
                    'phieuThu': {'don': len(paid), 'tien': int(r.get('paid_amount') or sum(x.get('amount', 0) for x in paid))},
                    'banKiem': {'luuKho': len(stor), 'canBan': len(scn)}, 'deadline': r.get('deadline', '')})
    return out

def work(h):
    try: return {'name': h['name'], 'hubId': str(h['id']), 'am': h['am'], 'tinh': h['tinh'], 'rows': scan(h)}
    except AuthErr: raise
    except Exception as e: return {'name': h['name'], 'hubId': str(h['id']), 'am': h['am'], 'tinh': h['tinh'], 'rows': [], 'err': str(e)}

try:
    with ThreadPoolExecutor(4) as ex: HUBROWS = list(ex.map(work, HUBS))
except AuthErr:
    print('TOKEN GHN het han / khong hop le — can cap nhat GHN_SESSION'); sys.exit(2)

now = vnow(); day_dt = now - datetime.timedelta(days=1) if now.hour < 6 else now   # job trễ qua 00h vẫn tính ngày hôm trước
DAY = day_dt.strftime('%Y-%m-%d'); STAMP = now.strftime('%H:%M %d/%m/%Y')
errs = [h['name'] for h in HUBROWS if h.get('err')]
hubs_ok = len(HUBROWS) - len(errs)
for h in HUBROWS:
    for r in h['rows']:
        r['conPhieuThu'] = r['phieuThu']['don'] > 0
        r['conBanKiem'] = (r['banKiem']['luuKho'] + r['banKiem']['canBan']) > 0
    h['rows'] = [r for r in h['rows'] if r['conPhieuThu'] or r['conBanKiem']]   # dòng trống hẳn = đã xong → bỏ
n_rows = sum(len(h['rows']) for h in HUBROWS)
print(f'[thutien] {DAY} hubs={len(HUBROWS)} ok={hubs_ok} err={len(errs)} dòng tồn={n_rows}')
if errs: print('[thutien] BC lỗi:', ', '.join(errs))

# ---------- gộp theo BC ----------
vn = lambda n: f'{round(n):,}'.replace(',', '.')
tr = lambda n: f'{n/1e6:,.1f}'.replace(',', 'X').replace('.', ',').replace('X', '.') + ' tr'
def short(n):
    p = n.split(); return ' '.join(p[-2:]) if len(p) > 2 else n
PT = []; BK = []
for h in HUBROWS:
    a = [r for r in h['rows'] if r['conPhieuThu']]; b = [r for r in h['rows'] if r['conBanKiem']]
    if a: PT.append({'am': h['am'], 'bc': h['name'], 'nv': len(a), 'don': sum(r['phieuThu']['don'] for r in a), 'tien': sum(r['phieuThu']['tien'] for r in a), 'ten': [r['nv'] for r in sorted(a, key=lambda r: -r['phieuThu']['tien'])]})
    if b: BK.append({'am': h['am'], 'bc': h['name'], 'nv': len(b), 'luu': sum(r['banKiem']['luuKho'] for r in b), 'scan': sum(r['banKiem']['canBan'] for r in b), 'ten': [r['nv'] for r in sorted(b, key=lambda r: -(r['banKiem']['luuKho'] + r['banKiem']['canBan']))]})
PT.sort(key=lambda x: (x['am'], -x['tien'])); BK.sort(key=lambda x: (x['am'], -(x['luu'] + x['scan'])))

doc = {'date': DAY, 'updatedAt': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z', 'scope': 'LSO+QNI', 'hubsTotal': len(HUBROWS), 'hubsOk': hubs_ok,
       'hubs': [h for h in HUBROWS if h['rows'] or h.get('err')], 'allHubs': [{'name': h['name'], 'am': h['am'], 'tinh': h['tinh']} for h in HUBROWS]}
if DRY: json.dump(doc, open(os.path.join(OUT, 'thutien_bankiem.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
if not DRY:
    json.dump(doc, open(os.path.join(ROOT, 'thutien_bankiem.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.makedirs(os.path.join(ROOT, 'data_thutien'), exist_ok=True)
    json.dump(doc, open(os.path.join(ROOT, 'data_thutien', DAY + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ---------- ảnh ----------
def png(rows, cols, data, widths, title, sub, path, maxrows=40):
    shown = data[:maxrows]; n = len(shown) + 1
    fig_h = 1.9 + 0.38 * n + 0.2
    fig = plt.figure(figsize=(10.5, fig_h), dpi=140); fig.patch.set_facecolor('white')
    ax = fig.add_axes([0.01, 0.01, 0.98, max(0.3, 1 - 1.3 / fig_h)]); ax.axis('off')
    fig.text(0.02, 1 - 0.28 / fig_h, title, fontsize=14, fontweight='bold', color='#1F3864', va='top')
    fig.text(0.02, 1 - 0.80 / fig_h, sub, fontsize=11.5, fontweight='bold', color='#C00000', va='top')
    tb = ax.table(cellText=shown, colLabels=cols, loc='upper center', cellLoc='center', colWidths=widths, bbox=[0, 0, 1, 1])
    tb.auto_set_font_size(False); tb.set_fontsize(10)
    last = len(shown)
    for (r_, c_), ce in tb.get_celld().items():
        ce.set_edgecolor('#9aa5b5'); ce.set_linewidth(0.6)
        if r_ == 0: ce.set_facecolor('#1F3864'); ce.get_text().set_color('white'); ce.get_text().set_fontweight('bold')
        elif r_ == last and shown[-1][0] == 'TỔNG': ce.set_facecolor('#DCE6F1'); ce.get_text().set_fontweight('bold')
        else: ce.set_facecolor('#F5F7FA' if r_ % 2 == 0 else 'white')
        if c_ == 1 and r_ > 0: ce.get_text().set_ha('left'); ce._loc = 'left'; ce.PAD = 0.02
        if c_ == 0 and r_ > 0: ce.get_text().set_ha('left'); ce._loc = 'left'; ce.PAD = 0.02
    fig.savefig(path, bbox_inches='tight', facecolor='white'); plt.close(fig)
def names(ten, k=3): return ', '.join(short(x) for x in ten[:k]) + (f' +{len(ten) - k}' if len(ten) > k else '')
IMG1 = os.path.join(OUT, 'thutien_phieuthu.png'); IMG2 = os.path.join(OUT, 'thutien_bankiem.png')
if PT:
    d = [[x['am'], x['bc'], str(x['nv']), vn(x['don']), tr(x['tien'])] for x in PT]
    d.append(['TỔNG', f'{len(PT)} BC', str(sum(x['nv'] for x in PT)), vn(sum(x['don'] for x in PT)), tr(sum(x['tien'] for x in PT))])
    png(PT, ['AM', 'Bưu Cục', 'Số NV chưa tạo', 'Đơn cần thu', 'Tiền cần thu'], d, [0.26, 0.28, 0.14, 0.14, 0.18],
        f'CHƯA TẠO PHIẾU THU — LẠNG SƠN + QUẢNG NINH — chốt {STAMP}',
        f'{len(PT)} BC · {sum(x["nv"] for x in PT)} NV · {vn(sum(x["don"] for x in PT))} đơn · {tr(sum(x["tien"] for x in PT))} chưa tạo phiếu thu', IMG1)
if BK:
    d = [[x['am'], x['bc'], str(x['nv']), vn(x['luu']), vn(x['scan'])] for x in BK]
    d.append(['TỔNG', f'{len(BK)} BC', str(sum(x['nv'] for x in BK)), vn(sum(x['luu'] for x in BK)), vn(sum(x['scan'] for x in BK))])
    png(BK, ['AM', 'Bưu Cục', 'Số NV chưa bắn kiểm', 'ĐH cần lưu kho', 'ĐH cần bắn kiểm'], d, [0.24, 0.26, 0.17, 0.15, 0.18],
        f'CHƯA BẮN KIỂM — LẠNG SƠN + QUẢNG NINH — chốt {STAMP}',
        f'{len(BK)} BC · {sum(x["nv"] for x in BK)} NV · {vn(sum(x["luu"] for x in BK))} đơn cần lưu kho · {vn(sum(x["scan"] for x in BK))} đơn cần bắn kiểm', IMG2)

# ---------- caption ----------
L = [f'THU TIỀN - BẮN KIỂM — Lạng Sơn + Quảng Ninh — chốt {STAMP}']
if PT: L.append(f'- Chưa tạo phiếu thu: {len(PT)}/{len(HUBROWS)} BC · {sum(x["nv"] for x in PT)} NV · {vn(sum(x["don"] for x in PT))} đơn · {tr(sum(x["tien"] for x in PT))}')
else: L.append('- Tạo phiếu thu: tất cả BC đã hoàn tất')
if BK: L.append(f'- Chưa bắn kiểm: {len(BK)}/{len(HUBROWS)} BC · {sum(x["nv"] for x in BK)} NV · {vn(sum(x["luu"] for x in BK))} đơn cần lưu kho · {vn(sum(x["scan"] for x in BK))} đơn cần bắn kiểm')
else: L.append('- Bắn kiểm: tất cả BC đã hoàn tất')
if errs: L.append(f'- Không quét được {len(errs)} BC (lỗi GHN): ' + ', '.join(e.split(') ')[-1] for e in errs))
L.append('Xem dashboard "Thu tiền - Bắn kiểm" (th-ng-2.vercel.app).')
CAP = '\n'.join(L)[:1020]

def tg(method, fields, files=None):
    b = uuid.uuid4().hex; body = io.BytesIO()
    for k, v in fields.items(): body.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (name, data, ctype) in (files or {}).items():
        body.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode()); body.write(data); body.write(b'\r\n')
    body.write(f'--{b}--\r\n'.encode())
    last = None
    for k in range(6):
        req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/{method}', data=body.getvalue(), headers={'Content-Type': f'multipart/form-data; boundary={b}'})
        try: return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except urllib.error.HTTPError as e:
            t = e.read().decode('utf-8', 'ignore')
            if e.code == 429: time.sleep(int((json.loads(t).get('parameters') or {}).get('retry_after', 5)) + 1); continue
            if e.code >= 500: last = f'HTTP {e.code}'; time.sleep(3 * (k + 1)); continue
            raise RuntimeError(f'Telegram {method} HTTP {e.code}: {t[:200]}')
        except (TimeoutError, OSError, urllib.error.URLError) as e: last = repr(e)[:120]; time.sleep(3 * (k + 1))
    raise RuntimeError(f'Telegram {method} thất bại: {last}')

print(CAP)
if DRY: print('DRY — không gửi'); sys.exit(0)
chat = TG_GROUP
# Chạy tay (workflow_dispatch) = chạy thử → chỉ gửi riêng @thangquada, trừ khi đặt TG_CHAT
if EVENT == 'workflow_dispatch' and not os.environ.get('TG_CHAT'): chat = TG_ADMIN; print('[thutien] CHẠY THỬ → gửi riêng @thangquada')
# Không có dòng nào + không lỗi = có thể thật sự xong hết, nhưng cũng là dấu hiệu token trả rỗng → không tự khẳng định với nhóm, chỉ báo @thangquada kiểm tra
if n_rows == 0 and chat == TG_GROUP:
    chat = TG_ADMIN; CAP = 'KIỂM TRA: quét Thu tiền - Bắn kiểm ra 0 dòng ở cả ' + str(hubs_ok) + ' BC. Có thể toàn vùng đã xong, cũng có thể token GHN trả rỗng — đại nhân xem lại rồi mới báo nhóm.\n' + CAP
sent = []
photos = [(IMG1, CAP if PT else None), (IMG2, (CAP if not PT else 'Chưa bắn kiểm — ' + STAMP) if BK else None)]
first = True
for img, cap in photos:
    if cap is None: continue
    sent.append(tg('sendPhoto', {'chat_id': chat, 'caption': cap}, {'photo': (os.path.basename(img), open(img, 'rb').read(), 'image/png')}).get('ok'))
if not sent: sent.append(tg('sendMessage', {'chat_id': chat, 'text': CAP}).get('ok'))
print('[thutien] đã gửi', sent)
