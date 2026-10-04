// Proxy đọc Google Sheet phía SERVER bằng refresh token của tài khoản @ghn (đại nhân).
// Mục tiêu: ai đăng nhập dashboard (@ghn) đều xem được dữ liệu — KHÔNG cần cấp quyền sheet cho từng người.
// Env cần: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// Tuỳ chọn: ALLOWED_DOMAIN (mặc định "ghn.vn")
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'ghn.vn').toLowerCase();

// Chỉ cho đọc đúng các sheet nguồn của dashboard (chống lạm dụng làm proxy mở).
const ALLOW_IDS = new Set([
  '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8', // SID (GTC/FD/ODR/OPR/KD/COD/Năng suất/Định biên)
  '1jCWPRvfGA7d2uHL6_xT8ZxU3tgpOdlBK1-c4QT961ew', // Aging + Cơ cấu AM
  '1BsqjKaWRHSq8RaiQ0AD-cGBU3jsF-fu0fEwqHmt6gu4', // Volume
  '1kNe1tsvV_kqXqMUsr2pnxN9lfG3_CwGFyN5JtiVldrs', // Rớt LC + Tồn đọng
  '11hgHBTqUw8pjeMqCG-JrEvlaY9uFbeekbTCL9Uh61uQ', // Quá hạn TTS + Shopee
  '1dURlj_qQsWLjDBFeUylbWirWs0bPp3AkqLEggvx41Ks', // Thưởng NS
  '1VB4bdj6dMftDF8RgTG_vpYPl3YaDF1RN28u-AKqC4zY', // Khoá ID
  '18-oZRCYgehTY84K9ylQAkVU3DzDl9yyfQ6eUSI9139M', // Báo cáo Tồn/LC/48H
  '1kDVp2soHOAgp_AhhTddSlocXCUjB07kbLi1EHcCqay8', // Truy thu LC
  '1w4Ufjf6_P46bfK5LxW0ORqUhr__q1ghNqfGZ3_w6KQ0'  // Whitelist (nếu còn dùng)
]);

// ===== Cache token chủ sheet (refresh -> access) =====
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

// ===== Xác thực người gọi: phải là email @ghn (token Google của người xem) =====
const _caller = new Map(); // token -> {email, exp}
async function verifyCaller(tok) {
  if (!tok) return null;
  const now = Date.now();
  const c = _caller.get(tok);
  if (c && now < c.exp) return c.email;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) return null;
  const j = await r.json();
  const email = (j.email || '').toLowerCase();
  _caller.set(tok, { email, exp: now + 10 * 60 * 1000 });
  return email;
}

// ===== Cache nội dung sheet ngắn hạn (giảm tải quota tài khoản chủ khi nhiều người xem) =====
const _data = new Map(); // id|name -> {csv, exp}
const DATA_TTL = 30 * 1000;

const _titleCache = {};
async function gidToTitle(tok, id, gid) {
  if (!_titleCache[id]) {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId,title))`, { headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) throw new Error('meta ' + r.status);
    const j = await r.json();
    const m = { _first: (j.sheets && j.sheets[0] && j.sheets[0].properties.title) || 'Sheet1' };
    (j.sheets || []).forEach(s => { m[String(s.properties.sheetId)] = s.properties.title; });
    _titleCache[id] = m;
  }
  if (gid == null || gid === '') return _titleCache[id]._first;
  return _titleCache[id][String(gid)] || _titleCache[id]._first;
}

function rowsToCsv(rows) {
  return (rows || []).map(r => (r || []).map(c => {
    c = (c == null ? '' : String(c));
    return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  }).join(',')).join('\n');
}

export default async function handler(req, res) {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      res.status(500).json({ error: 'not_configured' }); return;
    }
    const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const email = await verifyCaller(auth);
    if (!email || !email.endsWith('@' + ALLOWED_DOMAIN)) { res.status(403).json({ error: 'forbidden' }); return; }

    const id = (req.query.id || '').toString();
    const gid = (req.query.gid || '').toString();
    let name = (req.query.sheet || '').toString();
    if (!ALLOW_IDS.has(id)) { res.status(403).json({ error: 'sheet_not_allowed' }); return; }

    const tok = await ownerToken();
    if (!name) name = await gidToTitle(tok, id, gid);

    const key = id + '|' + name;
    const now = Date.now();
    const cached = _data.get(key);
    if (!(req.query.fresh === '1') && cached && now < cached.exp) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(cached.csv); return;
    }

    const range = encodeURIComponent("'" + name.replace(/'/g, "''") + "'");
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, { headers: { Authorization: 'Bearer ' + tok } });
    if (!r.ok) { const t = await r.text(); res.status(502).json({ error: 'sheets_' + r.status, detail: t.slice(0, 200) }); return; }
    const j = await r.json();
    const vals = j.values || [];
    const w = vals.reduce((m, rw) => Math.max(m, (rw || []).length), 0);
    const padded = vals.map(rw => { const c = (rw || []).slice(); while (c.length < w) c.push(''); return c; });
    const csv = rowsToCsv(padded);
    _data.set(key, { csv, exp: now + DATA_TTL });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
