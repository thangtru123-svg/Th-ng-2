// pull_gtc.js — kéo GTC realtime toàn Vùng XBG (100 bưu cục) từ nhanh.ghn.vn
// Chạy trên GitHub Actions (Node 20, global fetch). Token: env GHN_SESSION.
// Output: gtc_live.json (số hiện tại) + nối 1 dòng vào gtc_history.json (để so cùng giờ hôm qua).
// Logic mirror ns_run.js (bản trình duyệt đã chạy ổn): GTC = isSucceeded của chuyến TẠO hôm nay (bỏ carry).
'use strict';
const fs = require('fs');
const path = require('path');

const SES = process.env.GHN_SESSION;
if (!SES) { console.error('THIEU env GHN_SESSION'); process.exit(1); }
const BASE = 'https://nhanh-api.ghn.vn';
const ROOT = path.join(__dirname, '..');
const HUBS = JSON.parse(fs.readFileSync(path.join(ROOT, 'hub_map_bc.json'), 'utf8'));

// ----- thời gian VN (UTC+7) -----
const nowVN = new Date(Date.now() + 7 * 3600 * 1000); // dịch sang giờ VN
function idxOf(d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
const TODAY = idxOf(nowVN);
const YD = idxOf(new Date(nowVN.getTime() - 86400000));
const HOUR = nowVN.getUTCHours();
const EXCL06 = HOUR >= 18; // 6h-18h giữ 0-6h; sau 18h loại

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function api(p, body, tries = 5) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(BASE + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SES },
        body: JSON.stringify(body)
      });
      if (r.status === 401 || r.status === 403) { throw Object.assign(new Error('AUTH'), { auth: true }); }
      if (r.status === 429) { await sleep(500 * (k + 1)); continue; }
      return await r.json();
    } catch (e) {
      if (e.auth) throw e;
      await sleep(300 * (k + 1));
    }
  }
  return { data: [] };
}

async function proc(h) {
  const hub = String(h.id);
  // --- chưa gán + tồn + trọng lượng (general-info) ---
  let chuaGan = 0, canGiaoSnap = 0, wPick = 0, wDeliver = 0, wReturn = 0;
  try {
    const gi = await api('/api/core/oss/v1/report/get-general-info', { hub_ids: [hub], view_mode: 'CLIENT', order_type: 'DAILY_TRIP_NONE' });
    const infos = (((gi.data || [])[0] || {}).general_infos) || [];
    infos.forEach(g => {
      if (g.order_type === 'DELIVER' || g.order_type === 'DELIVER_PRIORITY') {
        const tot = g.total_order || 0; let u6 = 0;
        (g.order_inventories || []).forEach(x => { if (x.duration === '0_6') u6 += x.total_order || 0; });
        chuaGan += EXCL06 ? (tot - u6) : tot;
        canGiaoSnap += tot;
        wDeliver += g.total_weight || 0;
      } else if (g.order_type === 'PICK') { wPick += g.total_weight || 0; }
      else if (g.order_type === 'RETURN') { wReturn += g.total_weight || 0; }
    });
  } catch (e) { if (e.auth) throw e; }
  // --- chuyến tạo hôm nay: đã gán + GTC ---
  const seen = {}; let carry = 0;
  for (const st of ['FINISHED', 'ON_TRIP']) {
    for (let pg = 1; pg <= 50; pg++) {
      const j = await api('/api/lastmile/trip/get-trip-list-by-hub', { hub_id: hub, status: st, is_ready: 0, offset: (pg - 1) * 100, limit: 100, reverse: 1, page: pg, size: 100 });
      const a = j.data || []; if (!a.length) break; let allOld = true;
      a.forEach(x => {
        const c = x.tripCode, cd = x.createDateIndex, ed = x.endDateIndex;
        if (cd === TODAY) seen[c] = { dc: x.deliverCount || 0, ended: ed === TODAY };
        if (cd === YD && ed === TODAY) carry++;
        if (cd >= YD || ed >= TODAY) allOld = false;
      });
      if (a.length < 100 || allOld) break;
    }
  }
  const trips = Object.entries(seen);
  const daGan = trips.reduce((s, [, v]) => s + v.dc, 0);
  const nTripToday = trips.length;
  const nChuaXong = trips.filter(([, v]) => !v.ended).length;
  let gtc = 0;
  for (const [c, v] of trips) {
    if (v.dc <= 0) continue;
    for (let pg = 1; pg <= 15; pg++) {
      const j = await api('/api/lastmile/trip/get-trip-items', { trip_code: c, tripCode: c, typeList: ['DELIVER'], offset: (pg - 1) * 100, limit: 100, page: pg, size: 100 });
      const a = j.data || []; if (!a.length) break;
      a.forEach(it => { if (it.isSucceeded === true) gtc++; });
      if (a.length < 100) break;
    }
  }
  return { name: h.name, am: h.am, tinh: h.tinh, chuaGan, daGan, gtc, nTripToday, nChuaXong, carry, canGiaoSnap, wPick, wDeliver, wReturn };
}

// ----- pool song song -----
async function pool(items, n, fn) {
  const out = []; let i = 0; let authErr = null;
  const run = async () => { while (i < items.length && !authErr) { const cur = items[i++]; try { out.push(await fn(cur)); } catch (e) { if (e.auth) { authErr = e; } else { out.push({ err: true, name: cur.name }); } } } };
  await Promise.all(Array.from({ length: n }, run));
  if (authErr) throw authErr;
  return out;
}

(async () => {
  console.log(`[pull] today=${TODAY} hourVN=${HOUR} excl06=${EXCL06} hubs=${HUBS.length}`);
  let res;
  try { res = await pool(HUBS, 10, proc); }
  catch (e) { if (e.auth) { console.error('TOKEN GHN het han / khong hop le — can cap nhat GHN_SESSION'); process.exit(2); } throw e; }

  const hubs = res.filter(r => !r.err);
  const errN = res.length - hubs.length;
  // tổng hợp
  const amM = {}, bcL = [];
  let sum = { chuaGan: 0, daGan: 0, gtc: 0, nTripToday: 0, nChuaXong: 0, carry: 0, wPick: 0, wDeliver: 0, wReturn: 0 };
  for (const h of hubs) {
    const cg = h.chuaGan + h.daGan;
    bcL.push({ bc: h.name, am: h.am, tinh: h.tinh, canGiao: cg, daGan: h.daGan, gtc: h.gtc });
    const a = amM[h.am] || (amM[h.am] = { am: h.am, canGiao: 0, daGan: 0, gtc: 0 });
    a.canGiao += cg; a.daGan += h.daGan; a.gtc += h.gtc;
    for (const k in sum) sum[k] += h[k] || 0;
  }
  const vung = {
    canGiao: sum.chuaGan + sum.daGan, daGan: sum.daGan, gtc: sum.gtc, chuaGan: sum.chuaGan,
    nTrip: sum.nTripToday, nChuaXong: sum.nChuaXong,
    kgPick: Math.round(sum.wPick), kgDeliver: Math.round(sum.wDeliver), kgReturn: Math.round(sum.wReturn)
  };
  const out = {
    updatedAt: new Date().toISOString(), excl06: EXCL06, hourVN: HOUR, hubsOk: hubs.length, hubsErr: errN,
    note: 'Realtime GTC trong ngay - chuyen tao hom nay, bo carry',
    vung,
    am: Object.values(amM).sort((a, b) => b.canGiao - a.canGiao),
    bc: bcL.sort((a, b) => b.canGiao - a.canGiao)
  };
  fs.writeFileSync(path.join(ROOT, 'gtc_live.json'), JSON.stringify(out));
  console.log(`[pull] OK hubsOk=${hubs.length} err=${errN} GTC=${vung.gtc} daGan=${vung.daGan} canGiao=${vung.canGiao}`);

  // nối lịch sử (giữ 14 ngày gần nhất) để so cùng giờ hôm qua
  const hp = path.join(ROOT, 'gtc_history.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch (e) { hist = []; }
  hist.push({ t: out.updatedAt, hourVN: HOUR, gtc: vung.gtc, daGan: vung.daGan, canGiao: vung.canGiao });
  const cutoff = Date.now() - 15 * 86400000;
  hist = hist.filter(x => new Date(x.t).getTime() >= cutoff);
  fs.writeFileSync(hp, JSON.stringify(hist));
})().catch(e => { console.error('LOI:', e && e.message || e); process.exit(1); });
