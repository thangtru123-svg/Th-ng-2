// /api/n1 — chỉ số 45 ngày gần nhất + gộp theo TUẦN (T2→CN) cho app XBG.
// GTC Total + Tỉ lệ trả 4 loại + GTC TTS + ODR/OPR + Năng suất NV, gộp lại từ SỐ GỐC (không avg %).
// Trả { days:[...45], data:{d:{vung,am}}, weeks:[...], wdata:{key:{vung,am,label}}, + day/vung/am = ngày mới nhất (tương thích app cũ) }.
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SID = '1Ec4qUpehq5ruroCTmw20cRDzkQiGmj9GLpS5f18UFE8';
const VOL_ID = '1BsqjKaWRHSq8RaiQ0AD-cGBU3jsF-fu0fEwqHmt6gu4'; // chứa sheet Luong_NVBC (lương từng NV theo ngày)
const NDAYS = 45;      // số ngày lịch sử
const NV_DAYS = 12;    // số ngày gần nhất còn giữ chi tiết Năng suất NV (giữ payload gọn)

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
async function getSheet(tok, name, sid, opts) {
  const id = sid || SID;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(name)}?majorDimension=ROWS` + (opts || ''), { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('sheet ' + name + ' ' + r.status);
  const j = await r.json();
  return j.values || [];
}
// Luong_NVBC: cột ngày "26-10-29" (yy-mm-dd) → "2026-10-29"; cột O (idx 14) = Tổng lương
const lgDate = s => { const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(String(s || '').trim()); if (m) return '20' + m[1] + '-' + m[2] + '-' + m[3]; const m2 = /(\d{4}-\d{2}-\d{2})/.exec(String(s || '')); return m2 ? m2[1] : null; };
const codeOf = s => { const m = /^\s*(\d+)/.exec(String(s || '')); return m ? m[1] : ''; };
const dstr = s => { const m = /(\d{4}-\d{2}-\d{2})/.exec(s || ''); return m ? m[1] : null; };
const f = x => { const v = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isNaN(v) ? 0 : v; };
const i = x => { const v = parseInt(String(x == null ? '' : x).replace(/[^0-9\-]/g, '')); return isNaN(v) ? 0 : v; };
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
// ISO tuần (T2→CN)
const mondayOf = ds => { const dt = new Date(ds + 'T00:00:00Z'); const off = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - off); return dt; };
const isoWeekNum = ds => { const dt = new Date(ds + 'T00:00:00Z'); const off = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - off + 3); const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); const fOff = (firstThu.getUTCDay() + 6) % 7; return 1 + Math.round(((dt - firstThu) / 86400000 - 3 + fOff) / 7); };
const fmtDM = dt => String(dt.getUTCDate()).padStart(2, '0') + '/' + String(dt.getUTCMonth() + 1).padStart(2, '0');

let _cache = { t: 0, data: null };
export default async function handler(req, res) {
  try {
    if (!REFRESH_TOKEN) { res.status(500).json({ ok: false, error: 'Chưa cấu hình GOOGLE_REFRESH_TOKEN' }); return; }
    const now = Date.now();
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    if (_cache.data && now - _cache.t < 20 * 60 * 1000) { res.setHeader('x-cache', 'hit'); res.status(200).json(_cache.data); return; }
    const tok = await ownerToken();
    const [gAM, gBC, fTA, fTB, fSA, fSB, fTtA, fTtB, fShA, fShB, nsNV, gTtsA, gTtsB, odrA, odrB, oprA, oprB, luongRows] = await Promise.all([
      getSheet(tok, 'GTC Total theo AM'), getSheet(tok, 'GTC Total theo Bưu Cục'),
      getSheet(tok, 'FD Total theo AM'), getSheet(tok, 'FD Total theo Bưu Cục'),
      getSheet(tok, 'FD SME theo AM'), getSheet(tok, 'FD SME theo Bưu Cục'),
      getSheet(tok, 'FD TTS theo AM'), getSheet(tok, 'FD TTS theo Bưu Cục'),
      getSheet(tok, 'FD Shopee theo AM'), getSheet(tok, 'FD Shopee theo Bưu Cục'),
      getSheet(tok, 'Năng suất NV'),
      getSheet(tok, 'GTC TTS theo AM'), getSheet(tok, 'GTC TTS theo Bưu Cục'),
      getSheet(tok, 'ODR TTS - AM'), getSheet(tok, 'ODR TTS - Bưu Cục'),
      getSheet(tok, 'OPR TTS - AM'), getSheet(tok, 'OPR TTS - Bưu Cục'),
      getSheet(tok, 'Luong_NVBC', VOL_ID, '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING').catch(() => [])
    ]);
    // Lương từng NV theo ngày: key "yyyy-mm-dd|mã" → đồng (cột O = idx 14)
    const luongIdx = {};
    for (let k = 1; k < luongRows.length; k++) {
      const r = luongRows[k]; if (!r) continue;
      const cd = codeOf(r[0]), d = lgDate(r[5]); if (!cd || !d) continue;
      const raw = r[14]; const num = typeof raw === 'number' ? raw : parseFloat(String(raw == null ? '' : raw).replace(/\./g, '').replace(',', '.'));
      if (!isNaN(num)) luongIdx[d + '|' + cd] = Math.round(num);
    }

    // ===== accumulators: gộp SỐ GỐC trên tập ngày (ds=Set) → tính % ở cuối =====
    // GTC AM/BC (cũng dùng cho GTC TTS): cộng vol, gánCount(=%gán×vol), ngtc
    const accGTC = (rows, ds, bcMode) => {
      const m = {}; const dcol = bcMode ? 2 : 1, vcol = bcMode ? 3 : 2, gcol = bcMode ? 4 : 3, ncol = bcMode ? 6 : 5;
      for (let k = 1; k < rows.length; k++) { const r = rows[k]; const key = bcMode ? r[1] : r[0]; if (!key || key === 'Grand Total') continue; if (!ds.has(dstr(r[dcol]))) continue; const vol = i(r[vcol]); const o = m[key] || (m[key] = { vol: 0, ganCnt: 0, ngtc: 0, am: bcMode ? (r[0] || '').trim() : undefined }); o.vol += vol; o.ganCnt += f(r[gcol]) * vol; o.ngtc += i(r[ncol]); }
      return m;
    };
    // FD AM/BC: weighted Σ(%FD×%Vol)/Σ(%Vol) — cả AM lẫn BC đều có %Vol ở col2
    const accFd = (rows, ds) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const key = r[0]; if (!key || key === 'Grand Total') continue; if (!ds.has(dstr(r[1]))) continue; const vw = f(r[2]); const o = m[key] || (m[key] = { num: 0, vw: 0 }); o.num += f(r[3]) * vw; o.vw += vw; } return m; };
    // ODR/OPR AM/BC: weighted Σ(%ot×vol)/Σvol
    const accOt = (rows, ds, bcMode) => { const m = {}; const dcol = bcMode ? 2 : 1, vcol = bcMode ? 3 : 2, ocol = bcMode ? 4 : 3; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const key = bcMode ? r[1] : r[0]; if (!key || key === 'Grand Total') continue; if (!ds.has(dstr(r[dcol]))) continue; const vol = i(r[vcol]); const o = m[key] || (m[key] = { num: 0, vol: 0 }); o.num += f(r[ocol]) * vol; o.vol += vol; } return m; };
    // Năng suất NV theo BC: cộng gán, gtc từng NV qua các ngày
    const accNs = (rows, ds) => { const m = {}; for (let k = 1; k < rows.length; k++) { const r = rows[k]; const bc = r[0]; if (!bc) continue; if (!ds.has(dstr(r[2]))) continue; const nv = String(r[1] || '').replace(/^\d+_/, '').trim(); const cd = codeOf(r[1]); const mb = m[bc] || (m[bc] = {}); const e = mb[nv] || (mb[nv] = { nv, code: cd, gan: 0, gtc: 0 }); e.gan += i(r[3]); e.gtc += i(r[4]); } return m; };

    const pctGan = o => o.vol > 0 ? r1(o.ganCnt / o.vol * 100) : 0;
    const pctGtc = o => o.vol > 0 ? r1(o.ngtc / o.vol * 100) : 0;
    const fdv = o => (o && o.vw > 0) ? r1(o.num / o.vw * 100) : null;
    const otv = o => (o && o.vol > 0) ? r1(o.num / o.vol * 100) : null;

    function buildAgg(ds, includeNV) {
      const amGTC = accGTC(gAM, ds, false);
      const bcm = accGTC(gBC, ds, true);
      const bc2am = {}; let vVol = 0, vNgtc = 0, vGan = 0;
      for (const bc in bcm) { const b = bcm[bc]; bc2am[bc] = b.am; vVol += b.vol; vNgtc += b.ngtc; vGan += b.ganCnt; }
      const FA = { total: accFd(fTA, ds), sme: accFd(fSA, ds), tts: accFd(fTtA, ds), shopee: accFd(fShA, ds) };
      const FB = { total: accFd(fTB, ds), sme: accFd(fSB, ds), tts: accFd(fTtB, ds), shopee: accFd(fShB, ds) };
      const vungFD = {}; for (const cat of ['total', 'sme', 'tts', 'shopee']) { let num = 0, den = 0; for (const a in FA[cat]) { num += FA[cat][a].num; den += FA[cat][a].vw; } vungFD[cat] = den > 0 ? r1(num / den * 100) : null; }
      const nvByBC = {}; if (includeNV) { const raw = accNs(nsNV, ds); const dList = [...ds]; const luongOf = cd => { if (!cd) return null; let s = null; for (const dd of dList) { const v = luongIdx[dd + '|' + cd]; if (v != null) s = (s || 0) + v; } return s; }; for (const bc in raw) { nvByBC[bc] = Object.values(raw[bc]).map(e => ({ nv: e.nv, gan: e.gan, gtc: e.gtc, pct: e.gan > 0 ? r1(e.gtc / e.gan * 100) : 0, luong: luongOf(e.code) })).sort((a, b) => b.gan - a.gan); } }
      const ttsAMm = accGTC(gTtsA, ds, false), ttsBCm = accGTC(gTtsB, ds, true);
      const odrAMm = accOt(odrA, ds, false), odrBCm = accOt(odrB, ds, true);
      const oprAMm = accOt(oprA, ds, false), oprBCm = accOt(oprB, ds, true);
      let ttV = 0, ttN = 0; for (const bc in ttsBCm) { ttV += ttsBCm[bc].vol; ttN += ttsBCm[bc].ngtc; }
      const vGtcTts = ttV > 0 ? r1(ttN / ttV * 100) : null;
      let on = 0, ov = 0; for (const bc in odrBCm) { on += odrBCm[bc].num; ov += odrBCm[bc].vol; } const vOdr = ov > 0 ? r1(on / ov * 100) : null;
      let pn = 0, pv = 0; for (const bc in oprBCm) { pn += oprBCm[bc].num; pv += oprBCm[bc].vol; } const vOpr = pv > 0 ? r1(pn / pv * 100) : null;
      const amNames = new Set([...Object.keys(amGTC), ...Object.values(bc2am)]);
      const am = [];
      amNames.forEach(name => {
        const myBCs = Object.keys(bcm).filter(b => bc2am[b] === name);
        // GTC: ưu tiên sheet GTC theo AM; thiếu (AM tên ghép) → gộp từ BC con
        let g = amGTC[name];
        if (!g) { let v = 0, gc = 0, ng = 0; myBCs.forEach(b => { const o = bcm[b]; v += o.vol; gc += o.ganCnt; ng += o.ngtc; }); g = { vol: v, ganCnt: gc, ngtc: ng }; }
        // FD theo AM: ưu tiên sheet FD theo AM; thiếu → gộp Σnum/Σ%Vol từ BC con
        const fdOf = cat => { const fa = FA[cat][name]; if (fa && fa.vw > 0) return r1(fa.num / fa.vw * 100); let n = 0, w = 0; myBCs.forEach(b => { const o = FB[cat][b]; if (o) { n += o.num; w += o.vw; } }); return w > 0 ? r1(n / w * 100) : null; };
        // GTC TTS theo AM: thiếu → gộp BC con
        let tA = ttsAMm[name];
        if (!tA) { let has = false, v = 0, gc = 0, ng = 0; myBCs.forEach(b => { const o = ttsBCm[b]; if (o) { has = true; v += o.vol; gc += o.ganCnt; ng += o.ngtc; } }); tA = has ? { vol: v, ganCnt: gc, ngtc: ng } : null; }
        // ODR/OPR theo AM: thiếu → gộp weighted từ BC con
        const otOf = (amv, bcMap) => { if (amv && amv.vol > 0) return r1(amv.num / amv.vol * 100); let n = 0, v = 0; myBCs.forEach(b => { const o = bcMap[b]; if (o) { n += o.num; v += o.vol; } }); return v > 0 ? r1(n / v * 100) : null; };
        const bcs = myBCs.map(b => {
          const bg = bcm[b]; const tt = ttsBCm[b];
          return { bc: b, vol: bg.vol, gan: pctGan(bg), pct: pctGtc(bg), ngtc: bg.ngtc, fdTotal: fdv(FB.total[b]), fdSme: fdv(FB.sme[b]), fdTts: fdv(FB.tts[b]), fdShopee: fdv(FB.shopee[b]), nv: nvByBC[b] || [], ttsVol: tt ? tt.vol : null, ttsGan: tt ? pctGan(tt) : null, ttsPct: tt ? pctGtc(tt) : null, ttsNgtc: tt ? tt.ngtc : null, odr: otv(odrBCm[b]), opr: otv(oprBCm[b]) };
        }).sort((a, b) => b.vol - a.vol);
        am.push({ am: name, vol: g.vol, gan: pctGan(g), pct: pctGtc(g), ngtc: g.ngtc, fdTotal: fdOf('total'), fdSme: fdOf('sme'), fdTts: fdOf('tts'), fdShopee: fdOf('shopee'), ttsVol: tA ? tA.vol : null, ttsGan: tA ? pctGan(tA) : null, ttsPct: tA ? pctGtc(tA) : null, ttsNgtc: tA ? tA.ngtc : null, odr: otOf(odrAMm[name], odrBCm), opr: otOf(oprAMm[name], oprBCm), bc: bcs });
      });
      am.sort((a, b) => b.vol - a.vol);
      const vung = { vol: vVol, gan: vVol > 0 ? r1(vGan / vVol * 100) : 0, pct: vVol > 0 ? r1(vNgtc / vVol * 100) : 0, ngtc: vNgtc, fdTotal: vungFD.total, fdSme: vungFD.sme, fdTts: vungFD.tts, fdShopee: vungFD.shopee, gtcTts: vGtcTts, odrTts: vOdr, oprTts: vOpr };
      return { vung, am };
    }

    // ===== 45 ngày mới nhất (từ GTC Total theo Bưu Cục, cột Ngày = col2) =====
    const daySet = new Set(); for (let k = 1; k < gBC.length; k++) { const d = dstr(gBC[k][2]); if (d) daySet.add(d); }
    const days = [...daySet].sort().reverse().slice(0, NDAYS);
    const data = {};
    days.forEach((d, idx) => { const o = buildAgg(new Set([d]), idx < NV_DAYS); o.day = d; o.label = 'dữ liệu ngày ' + d.split('-').reverse().join('/'); data[d] = o; });

    // ===== gộp theo TUẦN (T2→CN) =====
    const weekMap = {}; days.forEach(d => { const key = mondayOf(d).toISOString().slice(0, 10); (weekMap[key] = weekMap[key] || []).push(d); });
    const weekKeys = Object.keys(weekMap).sort().reverse();
    const weeks = []; const wdata = {};
    weekKeys.forEach(mk => {
      const ds = weekMap[mk]; const mon = new Date(mk + 'T00:00:00Z'); const sun = new Date(mon); sun.setUTCDate(sun.getUTCDate() + 6);
      const label = 'Tuần ' + isoWeekNum(mk) + ' (' + fmtDM(mon) + '–' + fmtDM(sun) + ')';
      weeks.push({ key: mk, label, nDays: ds.length });
      const o = buildAgg(new Set(ds), true); o.day = mk; o.label = label + (ds.length < 7 ? ' · ' + ds.length + ' ngày' : ''); wdata[mk] = o; // includeNV=true: Tuần cũng xổ năng suất NV + lương (gán/GTC/lương cộng theo tuần)
    });

    const d0 = days[0] ? data[days[0]] : { vung: {}, am: [] };
    const out = { days, data, weeks, wdata, updatedAt: new Date().toISOString(), day: days[0] || null, vung: d0.vung, am: d0.am };
    _cache = { t: now, data: out };
    res.setHeader('x-cache', 'miss');
    res.status(200).json(out);
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
}
