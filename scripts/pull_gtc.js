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
  let oPick = 0, oReturn = 0; // số đơn tồn kho lấy / trả (giao = canGiaoSnap)
  let dGiao5 = 0, dGiao8 = 0, dTra48 = 0; // tồn đọng giao>5ngày(120h), >8ngày(192h), trả>48h
  try {
    const gi = await api('/api/core/oss/v1/report/get-general-info', { hub_ids: [hub], view_mode: 'CLIENT', order_type: 'DAILY_TRIP_NONE' });
    const infos = (((gi.data || [])[0] || {}).general_infos) || [];
    const sumB = (g, set) => { let s = 0; (g.order_inventories || []).forEach(x => { if (set.has(x.duration)) s += x.total_order || 0; }); return s; };
    const RET48 = new Set(['48_72', '72_96', '96_120', '120_192', '192']);
    infos.forEach(g => {
      if (g.order_type === 'DELIVER' || g.order_type === 'DELIVER_PRIORITY') {
        const tot = g.total_order || 0; let u6 = 0;
        (g.order_inventories || []).forEach(x => { if (x.duration === '0_6') u6 += x.total_order || 0; });
        chuaGan += EXCL06 ? (tot - u6) : tot;
        canGiaoSnap += tot;
        wDeliver += g.total_weight || 0;
        dGiao8 += sumB(g, new Set(['192']));
        dGiao5 += sumB(g, new Set(['120_192', '192']));
      } else if (g.order_type === 'PICK') { wPick += g.total_weight || 0; oPick += g.total_order || 0; }
      else if (g.order_type === 'RETURN') { wReturn += g.total_weight || 0; dTra48 += sumB(g, RET48); oReturn += g.total_order || 0; }
    });
  } catch (e) { if (e.auth) throw e; }
  // --- chuyến tạo hôm nay: đã gán + GTC + theo nhân viên (tài xế) ---
  const seen = {}; let carry = 0; const nvM = {}; const hangM = {}; // hangM: chuyến treo qua ngày chưa kết thúc (ON_TRIP, tạo trước hôm nay)
  const codFail = []; // đơn giao thất bại có COD >= 1tr (cần đối soát tiền hàng)
  const nvOf = (name) => nvM[name] || (nvM[name] = { nv: name || '(không rõ)', ganGiao: 0, ganLay: 0, gtc: 0 });
  const fmtCd = (cd) => { const s = String(cd); return s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}` : String(cd); };
  for (const st of ['FINISHED', 'ON_TRIP']) {
    for (let pg = 1; pg <= 50; pg++) {
      const j = await api('/api/lastmile/trip/get-trip-list-by-hub', { hub_id: hub, status: st, is_ready: 0, offset: (pg - 1) * 100, limit: 100, reverse: 1, page: pg, size: 100 });
      const a = j.data || []; if (!a.length) break; let allOld = true;
      a.forEach(x => {
        const c = x.tripCode, cd = x.createDateIndex, ed = x.endDateIndex;
        if (cd === TODAY) {
          seen[c] = { dc: x.deliverCount || 0, ended: ed === TODAY, driver: x.driverName || '', driverId: String(x.driverId || '') };
          const nv = nvOf(x.driverName || '');
          nv.ganGiao += x.deliverCount || 0; nv.ganLay += x.pickCount || 0;
        }
        if (cd === YD && ed === TODAY) carry++;
        if (st === 'ON_TRIP' && cd < TODAY) hangM[c] = { nv: x.driverName || '(không rõ)', ngay: fmtCd(cd), cd };
        if (cd >= YD || ed >= TODAY) allOld = false;
      });
      if (a.length < 100 || (st === 'FINISHED' && allOld)) break;
    }
  }
  const trips = Object.entries(seen);
  const daGan = trips.reduce((s, [, v]) => s + v.dc, 0);
  const nTripToday = trips.length;
  const nChuaXong = trips.filter(([, v]) => !v.ended).length;
  let gtc = 0;
  for (const [c, v] of trips) {
    if (v.dc <= 0) continue;
    let g = 0;
    for (let pg = 1; pg <= 15; pg++) {
      const j = await api('/api/lastmile/trip/get-trip-items', { trip_code: c, tripCode: c, typeList: ['DELIVER'], offset: (pg - 1) * 100, limit: 100, page: pg, size: 100 });
      const a = j.data || []; if (!a.length) break;
      a.forEach(it => {
        if (it.isSucceeded === true) g++;
        else if (it.isSucceeded === false && (it.collectAmount || 0) >= 1000000) {
          codFail.push({ ma: it.orderCode, cod: it.collectAmount, nv: v.driver, idnv: v.driverId, note: it.failNote || '' });
        }
      });
      if (a.length < 100) break;
    }
    gtc += g; nvOf(v.driver).gtc += g;
  }
  const nv = Object.values(nvM).filter(n => n.ganGiao > 0 || n.ganLay > 0 || n.gtc > 0)
    .map(n => ({ nv: n.nv, ganGiao: n.ganGiao, ganLay: n.ganLay, gtc: n.gtc, pct: n.ganGiao > 0 ? Math.round(n.gtc / n.ganGiao * 1000) / 10 : 0 }))
    .sort((a, b) => b.ganGiao - a.ganGiao);
  const hangTrips = Object.values(hangM).sort((a, b) => a.cd - b.cd).map(t => ({ nv: t.nv, ngay: t.ngay }));
  return { name: h.name, am: h.am, tinh: h.tinh, chuaGan, daGan, gtc, nTripToday, nChuaXong, carry, canGiaoSnap, wPick, wDeliver, wReturn, oPick, oReturn, dGiao5, dGiao8, dTra48, nv, hangTrips, codFail };
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
  let sum = { chuaGan: 0, daGan: 0, gtc: 0, nTripToday: 0, nChuaXong: 0, carry: 0, wPick: 0, wDeliver: 0, wReturn: 0, oPick: 0, oReturn: 0, canGiaoSnap: 0, dGiao5: 0, dGiao8: 0, dTra48: 0 };
  let hangTotal = 0;
  const codMap = new Map(); // dedup đơn COD giao thất bại theo mã đơn
  for (const h of hubs) {
    const cg = h.chuaGan + h.daGan;
    const hangTrips = h.hangTrips || [];
    bcL.push({ bc: h.name, am: h.am, tinh: h.tinh, canGiao: cg, daGan: h.daGan, gtc: h.gtc, dGiao5: h.dGiao5, dGiao8: h.dGiao8, dTra48: h.dTra48, nv: h.nv || [], hang: hangTrips.length, hangTrips });
    const a = amM[h.am] || (amM[h.am] = { am: h.am, canGiao: 0, daGan: 0, gtc: 0, hang: 0 });
    a.canGiao += cg; a.daGan += h.daGan; a.gtc += h.gtc; a.hang += hangTrips.length;
    hangTotal += hangTrips.length;
    (h.codFail || []).forEach(o => codMap.set(o.ma, { ma: o.ma, cod: o.cod, nv: o.nv, idnv: o.idnv, bc: h.name, am: h.am, tinh: h.tinh, note: o.note }));
    for (const k in sum) sum[k] += h[k] || 0;
  }
  const vung = {
    canGiao: sum.chuaGan + sum.daGan, daGan: sum.daGan, gtc: sum.gtc, chuaGan: sum.chuaGan,
    nTrip: sum.nTripToday, nChuaXong: sum.nChuaXong,
    kgPick: Math.round(sum.wPick), kgDeliver: Math.round(sum.wDeliver), kgReturn: Math.round(sum.wReturn),
    oLay: sum.oPick, oGiao: sum.canGiaoSnap, oTra: sum.oReturn,
    dGiao5: sum.dGiao5, dGiao8: sum.dGiao8, dTra48: sum.dTra48, hang: hangTotal
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

  // ===== Đơn giao thất bại có COD >= 1tr (đối soát tiền hàng) → cod_live.json =====
  const codOrders = [...codMap.values()].sort((a, b) => b.cod - a.cod);
  const codAgg = (keyFn) => {
    const m = {};
    codOrders.forEach(o => { const k = keyFn(o); const g = m[k] || (m[k] = { key: k, soDon: 0, tongCod: 0, nvSet: new Set(), codMax: 0 }); g.soDon++; g.tongCod += o.cod; g.nvSet.add(o.idnv || o.nv); if (o.cod > g.codMax) g.codMax = o.cod; });
    return Object.values(m).map(g => ({ key: g.key, soDon: g.soDon, soNV: g.nvSet.size, tongCod: g.tongCod, codTB: g.soDon ? Math.round(g.tongCod / g.soDon) : 0, codMax: g.codMax })).sort((a, b) => b.tongCod - a.tongCod);
  };
  const codNV = new Set(); codOrders.forEach(o => codNV.add(o.idnv || o.nv));
  const codTong = codOrders.reduce((s, o) => s + o.cod, 0);
  const codOut = {
    updatedAt: out.updatedAt, nguong: 1000000, hubsOk: hubs.length,
    vung: { soDon: codOrders.length, tongCod: codTong, codTB: codOrders.length ? Math.round(codTong / codOrders.length) : 0, codMax: codOrders.length ? codOrders[0].cod : 0, soNV: codNV.size },
    byTinh: codAgg(o => o.tinh), byAM: codAgg(o => o.am), byBC: codAgg(o => o.bc),
    orders: codOrders
  };
  fs.writeFileSync(path.join(ROOT, 'cod_live.json'), JSON.stringify(codOut));
  console.log(`[pull] COD OK soDon=${codOut.vung.soDon} tongCod=${codTong} soNV=${codNV.size}`);

  // nối lịch sử (giữ 14 ngày gần nhất) để so cùng giờ hôm qua
  const hp = path.join(ROOT, 'gtc_history.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch (e) { hist = []; }
  hist.push({ t: out.updatedAt, hourVN: HOUR, gtc: vung.gtc, daGan: vung.daGan, canGiao: vung.canGiao });
  const cutoff = Date.now() - 15 * 86400000;
  hist = hist.filter(x => new Date(x.t).getTime() >= cutoff);
  fs.writeFileSync(hp, JSON.stringify(hist));
})().catch(e => { console.error('LOI:', e && e.message || e); process.exit(1); });
