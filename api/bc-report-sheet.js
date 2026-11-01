// /api/bc-report-sheet — phần số liệu lấy từ Google Sheet cho Báo cáo 2 Bưu Cục (Đông Kinh + Bình Gia).
// Trả %GTC Ngày N-1 (Total + TTS) và Aging > 5 ngày (toàn bộ + TTS). Phần realtime nằm ở gtc_live.json.bcReport.
// Dùng refresh token tài khoản @ghn của chủ (giống /api/n1) → app không cần đăng nhập Google.
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SID = '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8';            // sheet báo cáo chính
const AGING_SID = '1jCWPRvfGA7d2uHL6_xT8ZxU3tgpOdlBK1-c4QT961ew';     // sheet Aging (tab "Aging> 5 Ngày")

// 2 Bưu Cục cần báo cáo (name = tên đầy đủ, key = chuỗi để khớp dòng sheet)
const BCS = [
  { name: '(LSO) Đông Kinh', key: 'Đông Kinh' },
  { name: '(LSO) Bình Gia', key: 'Bình Gia' }
];

let _owner = { token: null, exp: 0 };
async function ownerToken() {
  const now = Date.now();
  if (_owner.token && now < _owner.exp - 60000) return _owner.token;
  const body = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!j.access_token) throw new Error('owner token: ' + (j.error_description || j.error || r.status));
  _owner = { token: j.access_token, exp: now + (j.expires_in || 3600) * 1000 };
  return _owner.token;
}
async function getSheet(tok, name, sid) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(name)}?majorDimension=ROWS`, { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('sheet ' + name + ' ' + r.status);
  const j = await r.json();
  return j.values || [];
}
const dstr = s => { const m = /(\d{4}-\d{2}-\d{2})/.exec(String(s || '')); return m ? m[1] : null; };
const f = x => { const v = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isNaN(v) ? null : v; };

// %GTC Ngày N-1 từ "GTC ... theo Bưu Cục": cột BC=1, Ngày=2, %GTC=5 (fraction 0-1). Lấy dòng có ngày MỚI NHẤT của BC.
function latestPct(rows, bcKey) {
  let best = null, bestD = '';
  for (const r of rows || []) {
    if (!(r[1] || '').includes(bcKey)) continue;
    const d = dstr(r[2]); if (!d) continue;
    if (d > bestD) { bestD = d; best = f(r[5]); }
  }
  return best == null ? null : { pct: Math.round(best * 1000) / 10, ngay: bestD };
}
// Aging: tab "Aging> 5 Ngày" là snapshot hiện tại — BC=cột3, order_code=cột4 (TTS = mã bắt đầu VNGH). Đếm dòng của BC.
function agingCount(rows, bcKey) {
  let total = 0, tts = 0;
  for (const r of (rows || []).slice(1)) {
    if (!(r[3] || '').includes(bcKey)) continue;
    total++;
    if (/^VNGH/.test(String(r[4] || '').trim())) tts++;
  }
  return { total, tts };
}

export default async function handler(req, res) {
  try {
    if (!REFRESH_TOKEN) { res.status(500).json({ ok: false, error: 'Chưa cấu hình GOOGLE_REFRESH_TOKEN' }); return; }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    const tok = await ownerToken();
    const [gcTotal, gcTts, aging] = await Promise.all([
      getSheet(tok, 'GTC Total theo Bưu Cục', SID),
      getSheet(tok, 'GTC TTS theo Bưu Cục', SID),
      getSheet(tok, 'Aging> 5 Ngày', AGING_SID)
    ]);
    const out = {};
    for (const bc of BCS) {
      const gN1 = latestPct(gcTotal, bc.key);
      const gN1Tts = latestPct(gcTts, bc.key);
      const ag = agingCount(aging, bc.key);
      out[bc.name] = {
        gtcN1: gN1 ? gN1.pct : null, gtcN1Ngay: gN1 ? gN1.ngay : null,
        gtcN1Tts: gN1Tts ? gN1Tts.pct : null,
        aging5: ag.total, aging5Tts: ag.tts
      };
    }
    res.status(200).json({ ok: true, generatedAt: new Date().toISOString(), bc: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
