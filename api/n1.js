// /api/n1 — chỉ số 10 ngày gần nhất (gồm N-1) cho app XBG.
// GTC Total + Tỉ lệ trả 4 loại + GTC TTS + ODR/OPR + Năng suất NV, mỗi ngày 1 khối (Vùng/AM/BC/NV).
// Trả { days:[...], data:{ day:{vung,am} }, + day/vung/am = ngày mới nhất (tương thích app cũ) }.
// Dùng GOOGLE_REFRESH_TOKEN (env Vercel, giống /api/sheet). KHÔNG cần caller login.
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SID = '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8';
const NDAYS = 10;

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
async function getSheet(tok, name) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(name)}?majorDimension=ROWS`, { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('sheet ' + name + ' ' + r.status);
  const j = await r.json();
  return j.values || [];
}
const dstr = s => { const m = /(\d{4}-\d{2}-\d{2})/.exec(s || ''); return m ? m[1] : null; };
const f = x => { const v = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isNaN(v) ? 0 : v; };
const i = x => { const v = parseInt(String(x == null ? '' : x).replace(/[^0-9\-]/g, '')); return isNaN(v) ? 0 : v; };

let _cache = { t: 0, data: null };
export default async function handler(req, res) {
  try {
    if (!REFRESH_TOKEN) { res.status(500).json({ ok: false, error: 'Chưa cấu hình GOOGLE_REFRESH_TOKEN' }); return; }
    const now = Date.now();
    // Cache CDN: phục vụ ngay từ edge + revalidate nền → không phải chờ cold-start ~9s
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    if (_cache.data && now - _cache.t < 20 * 60 * 1000) { res.setHeader('x-cache', 'hit'); res.status(200).json(_cache.data); return; }
    const tok = await ownerToken();
    const [gAM, gBC, fTA, fTB, fSA, fSB, fTtA, fTtB, fShA, fShB, nsNV, gTtsA, gTtsB, odrA, odrB, oprA, oprB] = await Promise.all([
      getSheet(tok, 'GTC Total theo AM'), getSheet(tok, 'GTC Total theo Bưu Cục'),
      getSheet(tok, 'FD Total theo AM'), getSheet(tok, 'FD Total theo Bưu Cục'),
      getSheet(tok, 'FD SME theo AM'), getSheet(tok, 'FD SME theo Bưu Cục'),
      getSheet(tok, 'FD TTS theo AM'), getSheet(tok, 'FD TTS theo Bưu Cục'),
      getSheet(tok, 'FD Shopee theo AM'), getSheet(tok, 'FD Shopee theo Bưu Cục'),
      getSheet(tok, 'Năng suất NV'),
      getSheet(tok, 'GTC TTS theo AM'), getSheet(tok, 'GTC TTS theo Bưu Cục'),
      getSheet(tok, 'ODR TTS - AM'), getSheet(tok, 'ODR TTS - Bưu Cục'),
      getSheet(tok, 'OPR TTS - AM'), getSheet(tok, 'OPR TTS - Bưu Cục')
    ]);

    // ===== index helpers (lọc theo đúng 1 ngày) =====
    const r1 = x => x == null ? null : Math.round(x * 10) / 10;
    const gtcAMidx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const nm = r[0]; if (!nm || nm === 'Grand Total') continue; if (dstr(r[1]) !== day) continue; m[nm] = { vol: i(r[2]), gan: f(r[3]) * 100, pct: f(r[4]) * 100, ngtc: i(r[5]) }; } return m; };
    const gtcBCidx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const bc = r[1]; if (!bc || bc === 'Grand Total') continue; if (dstr(r[2]) !== day) continue; m[bc] = { am: (r[0] || '').trim(), vol: i(r[3]), gan: f(r[4]) * 100, pct: f(r[5]) * 100, ngtc: i(r[6]) }; } return m; };
    const fdAMidx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const name = r[0]; if (!name || name === 'Grand Total') continue; if (dstr(r[1]) !== day) continue; m[name] = { fd: f(r[3]) * 100, vol: f(r[2]) }; } return m; };
    const fdBCidx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const bc = r[0]; if (!bc || bc === 'Grand Total') continue; if (dstr(r[1]) !== day) continue; m[bc] = f(r[3]) * 100; } return m; };
    const otAMidx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const nm = r[0]; if (!nm || nm === 'Grand Total') continue; if (dstr(r[1]) !== day) continue; m[nm] = { vol: i(r[2]), ot: f(r[3]) * 100 }; } return m; };
    const otBCidx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const bc = r[1]; if (!bc || bc === 'Grand Total') continue; if (dstr(r[2]) !== day) continue; m[bc] = { vol: i(r[3]), ot: f(r[4]) * 100 }; } return m; };
    const nsIdx = (rows, day) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const bc = r[0]; if (!bc) continue; if (dstr(r[2]) !== day) continue; const nv = String(r[1] || '').replace(/^\d+_/, '').trim(); const gan = i(r[3]), gtc = i(r[4]); const pct = gan > 0 ? Math.round(gtc / gan * 1000) / 10 : 0; (m[bc] = m[bc] || []).push({ nv, gan, gtc, pct }); } for (const bc in m) m[bc].sort((a, b) => b.gan - a.gan); return m; };

    function buildDay(gDay) {
      const amGTC = gtcAMidx(gAM, gDay);
      const bcm = gtcBCidx(gBC, gDay);
      const bcGTC = {}, bc2am = {}; let vVol = 0, vNgtc = 0, vGanNum = 0;
      for (const bc in bcm) { const b = bcm[bc]; bc2am[bc] = b.am; bcGTC[bc] = b; vVol += b.vol; vNgtc += b.ngtc; vGanNum += (b.gan / 100) * b.vol; }
      const FA = { total: fdAMidx(fTA, gDay), sme: fdAMidx(fSA, gDay), tts: fdAMidx(fTtA, gDay), shopee: fdAMidx(fShA, gDay) };
      const FB = { total: fdBCidx(fTB, gDay), sme: fdBCidx(fSB, gDay), tts: fdBCidx(fTtB, gDay), shopee: fdBCidx(fShB, gDay) };
      const vungFD = {}; for (const cat of ['total', 'sme', 'tts', 'shopee']) { let num = 0, den = 0; for (const a in FA[cat]) { num += FA[cat][a].fd * FA[cat][a].vol; den += FA[cat][a].vol; } vungFD[cat] = den > 0 ? Math.round(num / den * 10) / 10 : null; }
      const nsBC = nsIdx(nsNV, gDay);
      const ttsAMm = gtcAMidx(gTtsA, gDay), ttsBCm = gtcBCidx(gTtsB, gDay);
      const odrAMm = otAMidx(odrA, gDay), odrBCm = otBCidx(odrB, gDay);
      const oprAMm = otAMidx(oprA, gDay), oprBCm = otBCidx(oprB, gDay);
      let ttV = 0, ttN = 0; for (const bc in ttsBCm) { ttV += ttsBCm[bc].vol; ttN += ttsBCm[bc].ngtc; }
      const vGtcTts = ttV > 0 ? Math.round(ttN / ttV * 1000) / 10 : null;
      const vungOt = m => { let n = 0, d = 0; for (const bc in m) { n += m[bc].ot * m[bc].vol; d += m[bc].vol; } return d > 0 ? Math.round(n / d * 10) / 10 : null; };
      const vOdr = vungOt(odrBCm), vOpr = vungOt(oprBCm);
      const amNames = new Set([...Object.keys(amGTC), ...Object.values(bc2am)]);
      const am = [];
      amNames.forEach(name => {
        const g = amGTC[name] || { vol: 0, gan: 0, pct: 0, ngtc: 0 };
        const fdOf = cat => (FA[cat][name] ? Math.round(FA[cat][name].fd * 10) / 10 : null);
        const bcs = Object.keys(bcGTC).filter(b => bc2am[b] === name).map(b => {
          const bg = bcGTC[b];
          return { bc: b, vol: bg.vol, gan: Math.round(bg.gan * 10) / 10, pct: Math.round(bg.pct * 10) / 10, ngtc: bg.ngtc, fdTotal: FB.total[b] != null ? Math.round(FB.total[b] * 10) / 10 : null, fdSme: FB.sme[b] != null ? Math.round(FB.sme[b] * 10) / 10 : null, fdTts: FB.tts[b] != null ? Math.round(FB.tts[b] * 10) / 10 : null, fdShopee: FB.shopee[b] != null ? Math.round(FB.shopee[b] * 10) / 10 : null, nv: nsBC[b] || [], ttsVol: ttsBCm[b] ? ttsBCm[b].vol : null, ttsGan: ttsBCm[b] ? r1(ttsBCm[b].gan) : null, ttsPct: ttsBCm[b] ? r1(ttsBCm[b].pct) : null, ttsNgtc: ttsBCm[b] ? ttsBCm[b].ngtc : null, odr: odrBCm[b] ? r1(odrBCm[b].ot) : null, opr: oprBCm[b] ? r1(oprBCm[b].ot) : null };
        }).sort((a, b) => b.vol - a.vol);
        am.push({ am: name, vol: g.vol, gan: Math.round(g.gan * 10) / 10, pct: Math.round(g.pct * 10) / 10, ngtc: g.ngtc, fdTotal: fdOf('total'), fdSme: fdOf('sme'), fdTts: fdOf('tts'), fdShopee: fdOf('shopee'), ttsVol: ttsAMm[name] ? ttsAMm[name].vol : null, ttsGan: ttsAMm[name] ? r1(ttsAMm[name].gan) : null, ttsPct: ttsAMm[name] ? r1(ttsAMm[name].pct) : null, ttsNgtc: ttsAMm[name] ? ttsAMm[name].ngtc : null, odr: odrAMm[name] ? r1(odrAMm[name].ot) : null, opr: oprAMm[name] ? r1(oprAMm[name].ot) : null, bc: bcs });
      });
      am.sort((a, b) => b.vol - a.vol);
      const vung = { vol: vVol, gan: vVol > 0 ? Math.round(vGanNum / vVol * 1000) / 10 : 0, pct: vVol > 0 ? Math.round(vNgtc / vVol * 1000) / 10 : 0, ngtc: vNgtc, fdTotal: vungFD.total, fdSme: vungFD.sme, fdTts: vungFD.tts, fdShopee: vungFD.shopee, gtcTts: vGtcTts, odrTts: vOdr, oprTts: vOpr };
      return { day: gDay, vung, am };
    }

    // 10 ngày mới nhất lấy từ GTC Total theo Bưu Cục (cột Ngày = col 2)
    const daySet = new Set(); for (let k = 1; k < gBC.length; k++) { const d = dstr(gBC[k][2]); if (d) daySet.add(d); }
    const days = [...daySet].sort().reverse().slice(0, NDAYS);
    const data = {}; days.forEach(d => { data[d] = buildDay(d); });
    const d0 = days[0] ? data[days[0]] : { day: null, vung: {}, am: [] };
    const out = { days, data, updatedAt: new Date().toISOString(), day: d0.day, vung: d0.vung, am: d0.am };
    _cache = { t: now, data: out };
    res.setHeader('x-cache', 'miss');
    res.status(200).json(out);
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
}
