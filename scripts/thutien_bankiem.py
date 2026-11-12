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
import re, base64, threading, functools, http.server

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
# ---- Khung chốt 22h55–00h45 VN. Lịch GitHub hay trễ hàng giờ → bản bắn đúng giờ do cron ngoài (cron-job.org) gọi /api/xbg-refresh ~23h rồi dispatch workflow này (giống cod-chot) ----
_n = vnow(); _m = _n.hour * 60 + _n.minute
IN_WIN = (_m >= 22 * 60 + 55) or (_m < 45)
_dd = (_n - datetime.timedelta(days=1)) if _n.hour < 6 else _n
GROUP_MODE = (not DRY) and (bool(os.environ.get('TG_CHAT')) or (EVENT in ('schedule', 'workflow_dispatch') and IN_WIN))   # trong khung → bắn nhóm; chạy tay NGOÀI khung = chạy thử → chỉ DM @thangquada
if EVENT == 'schedule' and not IN_WIN and not DRY:
    print(f'[thutien] lịch GitHub chạy TRỄ quá khung 22h55–00h45 (bây giờ {_n:%H:%M}) → bỏ qua, không bắn.'); sys.exit(0)
if GROUP_MODE:
    try: _prev = json.load(open(os.path.join(ROOT, 'data_thutien', _dd.strftime('%Y-%m-%d') + '.json'), encoding='utf-8'))
    except Exception: _prev = {}
    if _prev.get('sentGroup') and not os.environ.get('TG_CHAT'):
        print(f'[thutien] ngày {_dd:%Y-%m-%d} ĐÃ bắn nhóm rồi → không bắn lần 2.'); sys.exit(0)

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

PUB = [{**h, 'rows': [{k: v for k, v in r.items() if k not in ('idnv', 'nv', 'trip')} for r in h['rows']]} for h in HUBROWS]   # file json công khai trên web → bỏ tên/mã NV, chỉ giữ số đơn + số tiền
doc = {'date': DAY, 'updatedAt': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z', 'scope': 'LSO+QNI', 'hubsTotal': len(HUBROWS), 'hubsOk': hubs_ok,
       'hubs': [h for h in PUB if h['rows'] or h.get('err')], 'allHubs': [{'name': h['name'], 'am': h['am'], 'tinh': h['tinh']} for h in HUBROWS]}
if DRY: json.dump(doc, open(os.path.join(OUT, 'thutien_bankiem.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
if not DRY:
    json.dump(doc, open(os.path.join(ROOT, 'thutien_bankiem.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.makedirs(os.path.join(ROOT, 'data_thutien'), exist_ok=True)
    json.dump(doc, open(os.path.join(ROOT, 'data_thutien', DAY + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ---------- ảnh: CHỤP bằng đúng mã vẽ + _captureEl (html2canvas) của dashboard p53 trong index.html → y hệt nút "Bắn TG" (đại nhân duyệt kiểu này 12/11) ----------
IMG1 = os.path.join(OUT, 'thutien_phieuthu.png'); IMG2 = os.path.join(OUT, 'thutien_bankiem.png')
def render_images():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    a0 = html.index('async function buildThuTienPage'); b0 = html.index('/* ===== p48/p49', a0)
    c0 = html.index('async function _captureEl'); c1 = html.index('\n}\n', c0) + 3
    styles = '\n'.join(re.findall(r'<style[^>]*>.*?</style>', html, re.S)); links = '\n'.join(re.findall(r'<link[^>]+fonts[^>]*>', html))
    shell = ('<!doctype html><html><head><meta charset="utf-8">' + links + styles + '</head><body style="display:block;background:#fff">'
             '<div id="p53" class="page active" style="max-width:1200px;padding:16px"></div><script>function injectTgBtn(){}\n' + html[a0:b0] + '\n' + html[c0:c1] + '\nbuildThuTienPage();</script></body></html>')
    open(os.path.join(OUT, 'render.html'), 'w', encoding='utf-8').write(shell)
    json.dump(doc, open(os.path.join(OUT, 'thutien_bankiem.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=OUT)
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
    from playwright.sync_api import sync_playwright
    got = {}
    try:
        with sync_playwright() as pw:
            try: br = pw.chromium.launch(channel='chrome')
            except Exception: br = pw.chromium.launch()
            pg = br.new_page(viewport={'width': 1300, 'height': 900}); pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/render.html')
            pg.wait_for_selector('#ttCardPT, #ttCardBK, .analysis-box', timeout=30000); pg.wait_for_timeout(1500)
            for cid in ('ttCardPT', 'ttCardBK'):
                if pg.query_selector('#' + cid):
                    b64 = pg.evaluate("async (id) => { const b = await _captureEl(id, 2); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; buf.forEach(x => s += String.fromCharCode(x)); return btoa(s); }", cid)
                    got[cid] = base64.b64decode(b64)
            br.close()
    finally: srv.shutdown()
    return got
SHOTS = render_images() if (PT or BK) else {}
if 'ttCardPT' in SHOTS: open(IMG1, 'wb').write(SHOTS['ttCardPT'])
if 'ttCardBK' in SHOTS: open(IMG2, 'wb').write(SHOTS['ttCardBK'])
if (PT and 'ttCardPT' not in SHOTS) or (BK and 'ttCardBK' not in SHOTS): print('[thutien] LỖI: không chụp được ảnh bảng'); sys.exit(3)

# ---------- chú thích — GIỮ Y HỆT sendThuTienToTelegram() trong index.html (đại nhân duyệt 12/11): mỗi ảnh mang chú thích của RIÊNG mục đó ----------
LN_PT = (f'❌ Chưa tạo phiếu thu: <b>{len(PT)}/{len(HUBROWS)} BC</b> · {sum(x["nv"] for x in PT)} NV · {vn(sum(x["don"] for x in PT))} đơn · <b>{tr(sum(x["tien"] for x in PT))}</b>' if PT else '✅ Tạo phiếu thu: tất cả BC đã hoàn tất')
LN_BK = (f'❌ Chưa bắn kiểm: <b>{len(BK)}/{len(HUBROWS)} BC</b> · {sum(x["nv"] for x in BK)} NV · {vn(sum(x["luu"] for x in BK))} đơn cần lưu kho · {vn(sum(x["scan"] for x in BK))} đơn cần bắn kiểm' if BK else '✅ Bắn kiểm: tất cả BC đã hoàn tất')
ERR_LN = ('\n⚠️ Không quét được ' + str(len(errs)) + ' BC (lỗi GHN): ' + ', '.join(errs)) if errs else ''
HDR1 = f'💵 <b>THU TIỀN - BẮN KIỂM — LẠNG SƠN + QUẢNG NINH</b>\n🕒 Chốt {STAMP}\n\n'
HDR2 = f'📷 <b>Tình trạng BẮN KIỂM</b> — chốt {STAMP}\n\n'
PARTS = []   # (ảnh, chú thích)
if PT: PARTS.append((IMG1, HDR1 + LN_PT + ('' if BK else '\n' + LN_BK)))
if BK: PARTS.append((IMG2, (HDR2 if PT else HDR1 + LN_PT + '\n\n') + LN_BK))
CAP = (HDR1 + LN_PT + '\n' + LN_BK + ERR_LN)[:1020]   # dùng cho tin chữ (cả hai mục xong hết) / log / báo @thangquada khi 0 dòng

def tg(method, fields, files=None):
    if 'caption' in fields or 'text' in fields: fields = {**fields, 'parse_mode': 'HTML', 'disable_web_page_preview': 'true'}
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

[print(re.sub(r'<[^>]+>', '', c) + '\n-----') for _, c in PARTS] or print(re.sub(r'<[^>]+>', '', CAP))
if DRY: print('DRY — không gửi'); sys.exit(0)
chat = TG_GROUP if GROUP_MODE else TG_ADMIN
if not GROUP_MODE: print('[thutien] CHẠY THỬ (ngoài khung chốt) → gửi riêng @thangquada')
# Không có dòng nào + không lỗi = có thể thật sự xong hết, nhưng cũng là dấu hiệu token trả rỗng → không tự khẳng định với nhóm, chỉ báo @thangquada kiểm tra
if n_rows == 0 and chat == TG_GROUP:
    chat = TG_ADMIN; CAP = 'KIỂM TRA: quét Thu tiền - Bắn kiểm ra 0 dòng ở cả ' + str(hubs_ok) + ' BC. Có thể toàn vùng đã xong, cũng có thể token GHN trả rỗng — đại nhân xem lại rồi mới báo nhóm.\n' + CAP
sent = []
for i, (img, cap) in enumerate(PARTS):
    sent.append(tg('sendPhoto', {'chat_id': chat, 'caption': (cap + (ERR_LN if i == 0 else ''))[:1020]}, {'photo': (os.path.basename(img), open(img, 'rb').read(), 'image/png')}).get('ok'))
if not PARTS: sent.append(tg('sendMessage', {'chat_id': chat, 'text': CAP}).get('ok'))
print('[thutien] đã gửi', sent)
if chat == TG_GROUP and sent and all(sent):   # đánh dấu đã bắn nhóm hôm nay → lần dispatch/lịch thứ 2 không bắn lại
    doc['sentGroup'] = True
    for pth in (os.path.join(ROOT, 'thutien_bankiem.json'), os.path.join(ROOT, 'data_thutien', DAY + '.json')):
        json.dump(doc, open(pth, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
