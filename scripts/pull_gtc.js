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
  const ttsCod = []; // đơn TTS (mã VNGH) có COD < 50k, mọi trạng thái — chỉ gom ở 2 tỉnh LSO+QNI
  const wantTts = (h.tinh === 'Lạng Sơn' || h.tinh === 'Quảng Ninh');
  const okOrders = new Set(); // mã đơn ĐÃ giao thành công (isSucceeded) ở bất kỳ chuyến nào → loại khỏi codFail
  const nvOf = (name, id) => { const e = nvM[name] || (nvM[name] = { nv: name || '(không rõ)', id: id || '', ganGiao: 0, ganLay: 0, gtc: 0 }); if (id && !e.id) e.id = id; return e; };
  const fmtCd = (cd) => { const s = String(cd); return s.length === 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}` : String(cd); };
  for (const st of ['FINISHED', 'ON_TRIP']) {
    for (let pg = 1; pg <= 50; pg++) {
      const j = await api('/api/lastmile/trip/get-trip-list-by-hub', { hub_id: hub, status: st, is_ready: 0, offset: (pg - 1) * 100, limit: 100, reverse: 1, page: pg, size: 100 });
      const a = j.data || []; if (!a.length) break; let allOld = true;
      a.forEach(x => {
        const c = x.tripCode, cd = x.createDateIndex, ed = x.endDateIndex;
        if (cd === TODAY) {
          seen[c] = { dc: x.deliverCount || 0, ended: ed === TODAY, driver: x.driverName || '', driverId: String(x.driverId || '') };
          const nv = nvOf(x.driverName || '', String(x.driverId || ''));
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
        if (it.isSucceeded === true) { g++; okOrders.add(it.orderCode); }
        else if (it.isSucceeded === false && (it.collectAmount || 0) >= 1000000) {
          codFail.push({ ma: it.orderCode, cod: it.collectAmount, nv: v.driver, idnv: v.driverId, note: it.failNote || '' });
        }
        // TTS COD < 50k (mã VNGH) — mọi trạng thái, chỉ 2 tỉnh
        if (wantTts) {
          const _cod = it.collectAmount || 0; const _oc = String(it.orderCode || '');
          if (_oc.startsWith('VNGH') && _cod > 0 && _cod < 50000) {
            // Giao thành công = isSucceeded true; Giao thất bại = false VÀ CÓ failCode (lý do lỗi);
            // Đang giao = chưa giao xong (isSucceeded false mà failCode rỗng, hoặc null/undefined)
            const _st = it.isSucceeded === true ? 'Giao thành công'
              : ((it.isSucceeded === false && it.failCode) ? 'Giao thất bại' : 'Đang giao');
            ttsCod.push({ ma: _oc, cod: _cod, st: _st, nv: v.driver, idnv: v.driverId });
          }
        }
      });
      if (a.length < 100) break;
    }
    gtc += g; nvOf(v.driver, v.driverId).gtc += g;
  }
  const nv = Object.values(nvM).filter(n => n.ganGiao > 0 || n.ganLay > 0 || n.gtc > 0)
    .map(n => ({ nv: n.nv, id: n.id, ganGiao: n.ganGiao, ganLay: n.ganLay, gtc: n.gtc, pct: n.ganGiao > 0 ? Math.round(n.gtc / n.ganGiao * 1000) / 10 : 0 }))
    .sort((a, b) => b.ganGiao - a.ganGiao);
  const hangTrips = Object.values(hangM).sort((a, b) => a.cd - b.cd).map(t => ({ nv: t.nv, ngay: t.ngay }));
  return { name: h.name, am: h.am, tinh: h.tinh, chuaGan, daGan, gtc, nTripToday, nChuaXong, carry, canGiaoSnap, wPick, wDeliver, wReturn, oPick, oReturn, dGiao5, dGiao8, dTra48, nv, hangTrips, codFail, ttsCod, okOrders: [...okOrders] };
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
  const okAll = new Set();  // mã đơn ĐÃ giao thành công (toàn Vùng) → loại khỏi danh sách COD
  for (const h of hubs) (h.okOrders || []).forEach(c => okAll.add(c));
  for (const h of hubs) {
    const cg = h.chuaGan + h.daGan;
    const hangTrips = h.hangTrips || [];
    bcL.push({ bc: h.name, am: h.am, tinh: h.tinh, canGiao: cg, daGan: h.daGan, gtc: h.gtc, dGiao5: h.dGiao5, dGiao8: h.dGiao8, dTra48: h.dTra48, nv: h.nv || [], hang: hangTrips.length, hangTrips });
    const a = amM[h.am] || (amM[h.am] = { am: h.am, canGiao: 0, daGan: 0, gtc: 0, hang: 0 });
    a.canGiao += cg; a.daGan += h.daGan; a.gtc += h.gtc; a.hang += hangTrips.length;
    hangTotal += hangTrips.length;
    (h.codFail || []).forEach(o => { if (okAll.has(o.ma)) return; codMap.set(o.ma, { ma: o.ma, cod: o.cod, nv: o.nv, idnv: o.idnv, bc: h.name, am: h.am, tinh: h.tinh, note: o.note }); });
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
  // ===== Đơn giao thất bại có COD >= 1tr (đối soát tiền hàng) — nhúng vào gtc_live.json =====
  const codOrders = [...codMap.values()].sort((a, b) => b.cod - a.cod);
  const codAgg = (keyFn) => {
    const m = {};
    codOrders.forEach(o => { const k = keyFn(o); const g = m[k] || (m[k] = { key: k, soDon: 0, tongCod: 0, nvSet: new Set(), codMax: 0 }); g.soDon++; g.tongCod += o.cod; g.nvSet.add(o.idnv || o.nv); if (o.cod > g.codMax) g.codMax = o.cod; });
    return Object.values(m).map(g => ({ key: g.key, soDon: g.soDon, soNV: g.nvSet.size, tongCod: g.tongCod, codTB: g.soDon ? Math.round(g.tongCod / g.soDon) : 0, codMax: g.codMax })).sort((a, b) => b.tongCod - a.tongCod);
  };
  const codNV = new Set(); codOrders.forEach(o => codNV.add(o.idnv || o.nv));
  const codTong = codOrders.reduce((s, o) => s + o.cod, 0);
  out.cod = {
    nguong: 1000000, hubsOk: hubs.length,
    vung: { soDon: codOrders.length, tongCod: codTong, codTB: codOrders.length ? Math.round(codTong / codOrders.length) : 0, codMax: codOrders.length ? codOrders[0].cod : 0, soNV: codNV.size },
    byTinh: codAgg(o => o.tinh), byAM: codAgg(o => o.am), byBC: codAgg(o => o.bc),
    orders: codOrders
  };

  // ===== Đơn TTS (mã VNGH) có COD < 50k — LSO+QNI, mọi trạng thái (dedup theo mã, ưu tiên: thành công > đang giao > thất bại) =====
  const _stPri = { 'Giao thành công': 3, 'Đang giao': 2, 'Giao thất bại': 1 };
  const ttsMap = new Map();
  for (const h of hubs) (h.ttsCod || []).forEach(o => {
    const ex = ttsMap.get(o.ma);
    if (!ex || (_stPri[o.st] || 0) > (_stPri[ex.st] || 0)) ttsMap.set(o.ma, { ma: o.ma, cod: o.cod, st: o.st, nv: o.nv, idnv: o.idnv, bc: h.name, tinh: h.tinh });
  });
  const ttsOrders = [...ttsMap.values()].sort((a, b) => b.cod - a.cod);
  const ttsStCount = {}; ttsOrders.forEach(o => { ttsStCount[o.st] = (ttsStCount[o.st] || 0) + 1; });
  out.ttsCod = {
    nguong: 50000, hubsOk: hubs.length,
    soDon: ttsOrders.length, tongCod: ttsOrders.reduce((s, o) => s + o.cod, 0), byStatus: ttsStCount,
    orders: ttsOrders
  };

  // ===== BÁO CÁO VẬN HÀNH 2 BƯU CỤC (Đông Kinh + Bình Gia) — realtime chi tiết =====
  // Báo cáo 1 (cần giao Total + TTS) + Báo cáo 2 realtime (48h chưa gán, LC giao/trả>36h, hàng trả Shop>48h).
  // Aging>5N (total+TTS) và %GTC N-1 lấy riêng từ Sheet qua /api/bc-report-sheet (Action không đọc được Google).
  const BC_REPORT_HUBS = [
    { id: '21995000', name: '(LSO) Đông Kinh', dinhBien: 12 },
    { id: '21301000', name: '(LSO) Bình Gia', dinhBien: 7 }
  ];
  const _MOI = HOUR >= 14 ? new Set(['0_6', '6_12']) : new Set(['0_6']); // đơn mới: sáng(<14h)=0-6h · chiều(≥14h)=0-6h+6-12h
  const _GE48 = new Set(['48_72', '72_96', '96_120', '120_192', '192']);
  const _GE36 = new Set(['36_48', '48_72', '72_96', '96_120', '120_192', '192']);
  const _sumBk = (inv, set) => { let s = 0; (inv || []).forEach(x => { if (set.has(x.duration)) s += x.total_order || 0; }); return s; };
  const STATES3 = ['DAILY_TRIP_NONE', 'DAILY_TRIP_COMPLETED', 'DAILY_TRIP_IN_PROGRESS'];
  // ĐƠN MỚI KHÔNG ĐƯỢC GIẢM TRONG NGÀY: đơn giao xong biến mất khỏi báo cáo tồn đọng GHN → ghi nhớ MÃ đơn mới của mọi lần quét (lưu trong gtc_live.json.bcReport.seen,
  // reset theo ngày). Từ 09h: gom mã mốc 0-6h (từ 14h thêm 6-12h) Σ3 trạng thái; đơn mới = |hợp các mã đã thấy| (không tụt dù đơn đã giao).
  let prevBc = null; try { prevBc = JSON.parse(fs.readFileSync(path.join(ROOT, 'gtc_live.json'), 'utf8')).bcReport || null; } catch (e) { prevBc = null; }
  const TTS_FLOOR_SEED = { 20261102: { '21995000': 79, '21301000': 54 } }; // đơn mới TTS đo thật 09:44 sáng 02/11
  const MOI_FLOOR_SEED = { 20261102: { '21995000': 411, '21301000': 260 } }; // 1 lần: số đơn mới đo thật lúc 09:44 sáng 02/11 (trước khi bắt đầu lưu mã) — xoá được sau ngày 02/11
  const _stTypes = { DAILY_TRIP_NONE: ['DELIVER', 'DELIVER_PRIORITY'], DAILY_TRIP_COMPLETED: ['DELIVER', 'DELIVER_PRIORITY'], DAILY_TRIP_IN_PROGRESS: ['DELIVERING', 'DELIVERING_PRIORITY'] };
  async function bcReportFor(cfg) {
    const id = cfg.id;
    // get-general-info × 3 trạng thái chuyến (Chưa có chuyến / Đã có chuyến / Đang có chuyến):
    //  chưa gán = NONE · đơn mới = Giao + Ưu tiên giao mốc 0-6h (chiều +6-12h) Σ3 trạng thái · hàng trả Shop>48h = Trả Σ3.
    //  ⚠️ Tên loại đổi theo trạng thái: NONE/COMPLETED = DELIVER·DELIVER_PRIORITY·RETURN; IN_PROGRESS = DELIVERING·DELIVERING_PRIORITY·RETURNING → khớp bằng regex.
    let chuaGan = 0, donMoi = 0, returnShop48 = 0;
    for (const st of STATES3) {
      const gi = await api('/api/core/oss/v1/report/get-general-info', { hub_ids: [id], view_mode: 'CLIENT', order_type: st });
      const infos = (((gi.data || [])[0] || {}).general_infos) || [];
      infos.forEach(g => {
        if (/^DELIVER/.test(g.order_type)) {
          donMoi += _sumBk(g.order_inventories, _MOI);
          if (st === 'DAILY_TRIP_NONE') chuaGan += g.total_order || 0;
        } else if (/^RETURN/.test(g.order_type)) returnShop48 += _sumBk(g.order_inventories, _GE48);
      });
    }
    // get-detail-by-status: 48h chưa gán (NONE; total+TTS) + TTS mới (NONE + IN_PROGRESS) — TTS = nhóm TIKTOK SHOP, code |TTS|
    let cg48 = 0, cg48tts = 0, ttsChuaGan = 0, ttsDonMoi = 0;
    for (const [st, status] of [['DAILY_TRIP_NONE', ['DELIVER', 'DELIVER_PRIORITY']], ['DAILY_TRIP_IN_PROGRESS', ['DELIVERING', 'DELIVERING_PRIORITY']]]) {
      const j = await api('/api/core/oss/v1/report/get-detail-by-status', { hub_id: id, order_type: st, view_mode: 'CLIENT', status });
      const dts = ((j.data || {}).detail_backlog_types) || [];
      dts.forEach(t => (t.details || []).forEach(d => {
        const isT = /\|TTS\|/.test(d.code);
        if (isT) ttsDonMoi += _sumBk(d.order_inventories, _MOI);
        if (st === 'DAILY_TRIP_NONE') { cg48 += _sumBk(d.order_inventories, _GE48); if (isT) { cg48tts += _sumBk(d.order_inventories, _GE48); ttsChuaGan += d.total_order || 0; } }
      }));
    }
    // ---- đơn mới lũy kế trong ngày (mã đơn mốc 0-6h, chiều +6-12h) ----
    const seenPrev = (prevBc && prevBc.seen && prevBc.seen.date === TODAY && prevBc.seen.hubs && prevBc.seen.hubs[id]) || [];
    const seen = new Set(seenPrev);
    if (HOUR >= 9) {
      const buckets = HOUR >= 14 ? ['0_6', '6_12'] : ['0_6'];
      for (const st of STATES3) for (const ty of _stTypes[st]) for (const bk of buckets) {
        const j = await api('/api/core/oss/v1/report/get-detail-by-code', { code: `${id}|${ty}|${bk}`, view_mode: 'CLIENT', order_type: st });
        ((j.data || {}).order_codes || []).forEach(c => seen.add(String(c)));
      }
    }
    const prevHub = (prevBc && prevBc.date === TODAY && (prevBc.hubs || []).find(h => h.hubId === id)) || null;
    const floorMoi = Math.max(prevHub && prevHub.donMoi || 0, (MOI_FLOOR_SEED[TODAY] || {})[id] || 0);
    const floorTts = Math.max(prevHub && prevHub.tts && prevHub.tts.donMoi || 0, (TTS_FLOOR_SEED[TODAY] || {})[id] || 0);
    if (HOUR >= 9) {
      donMoi = Math.max(donMoi, seen.size, floorMoi);
      let tSeen = 0; seen.forEach(c => { if (c.startsWith('VNGH')) tSeen++; });
      ttsDonMoi = Math.max(ttsDonMoi, tSeen, floorTts);
    }
    // get-backlog-transport-info × 3 packing_type (đã/chưa/không cần đóng kiện): LC giao/trả >36h
    let lcGiao36 = 0, lcTra36 = 0;
    for (const pt of ['NOT_PACKED', 'PACKED', 'NO_NEED_TO_PACK']) {
      const j = await api('/api/core/oss/v1/report/get-backlog-transport-info', { hub_ids: [id], packing_type: pt });
      const infos = (((j.data || [])[0] || {}).general_infos) || [];
      infos.forEach(g => { const s = _sumBk(g.order_inventories, _GE36); if (g.order_type === 'TRANSPORT_DELIVERY') lcGiao36 += s; else if (g.order_type === 'TRANSPORT_RETURN') lcTra36 += s; });
    }
    // đã gán + NV thực đi phát: chuyến giao TẠO HÔM NAY ở cả FINISHED + ON_TRIP (sáng sớm chuyến còn ON_TRIP — bản cũ chỉ quét FINISHED nên ra 0)
    let daGan = 0; const drv = new Set(); const tripCodes = [];
    for (const st of ['FINISHED', 'ON_TRIP']) {
      for (let pg = 1; pg <= 40; pg++) {
        const j = await api('/api/lastmile/trip/get-trip-list-by-hub', { hub_id: id, status: st, is_ready: 0, offset: (pg - 1) * 100, limit: 100, reverse: 1, page: pg, size: 100 });
        const a = j.data || []; if (!a.length) break; let allOld = true;
        a.forEach(x => {
          if (x.createDateIndex === TODAY) { const dc = x.deliverCount || 0; daGan += dc; if (dc > 0) { tripCodes.push(x.tripCode); if (x.driverName) drv.add(x.driverName); } }
          if (x.createDateIndex >= YD || x.endDateIndex >= TODAY) allOld = false;
        });
        if (a.length < 100 || (st === 'FINISHED' && allOld)) break;
      }
    }
    // TTS đã gán = đơn mã VNGH trong các chuyến giao hôm nay (kể cả đã giao xong) — dedup theo mã
    const ttsAssigned = new Set();
    for (const c of tripCodes) {
      for (let pg = 1; pg <= 15; pg++) {
        const j = await api('/api/lastmile/trip/get-trip-items', { trip_code: c, tripCode: c, typeList: ['DELIVER'], offset: (pg - 1) * 100, limit: 100, page: pg, size: 100 });
        const a = j.data || []; if (!a.length) break;
        a.forEach(it => { if (String(it.orderCode || '').startsWith('VNGH')) ttsAssigned.add(it.orderCode); });
        if (a.length < 100) break;
      }
    }
    const canGiao = daGan + chuaGan;
    const ttsDaGan = ttsAssigned.size; const ttsCan = ttsDaGan + ttsChuaGan;
    return {
      name: cfg.name, hubId: id, dinhBien: cfg.dinhBien,
      canGiao, daGan, chuaGan, pctGan: canGiao ? Math.round(daGan / canGiao * 1000) / 10 : 0,
      donMoi, donTon: Math.max(0, canGiao - donMoi), nvPhat: drv.size,
      tts: { canGiao: ttsCan, daGan: ttsDaGan, chuaGan: ttsChuaGan, pctGan: ttsCan ? Math.round(ttsDaGan / ttsCan * 1000) / 10 : 0, donMoi: ttsDonMoi, donTon: Math.max(0, ttsCan - ttsDonMoi) },
      bc2: { cg48, cg48tts, lcGiao36, lcTra36, returnShop48 },
      _seen: HOUR >= 9 ? [...seen] : []
    };
  }
  try {
    const rep = [];
    for (const cfg of BC_REPORT_HUBS) { try { rep.push(await bcReportFor(cfg)); } catch (e) { rep.push({ name: cfg.name, hubId: cfg.id, dinhBien: cfg.dinhBien, err: String((e && e.message) || e) }); } }
    const seenOut = { date: TODAY, hubs: {} };
    rep.forEach(h => { if (h._seen) { seenOut.hubs[h.hubId] = h._seen; delete h._seen; } else if (h.err && prevBc && prevBc.seen && prevBc.seen.date === TODAY && prevBc.seen.hubs && prevBc.seen.hubs[h.hubId]) seenOut.hubs[h.hubId] = prevBc.seen.hubs[h.hubId]; }); // lỗi 1 hub → giữ nguyên mã đã lưu
    out.bcReport = { generatedAt: out.updatedAt, date: TODAY, hourVN: HOUR, moiMode: HOUR >= 14 ? '0-12h' : '0-6h', hubs: rep, seen: seenOut };
  } catch (e) { out.bcReport = { err: String((e && e.message) || e) }; }

  fs.writeFileSync(path.join(ROOT, 'gtc_live.json'), JSON.stringify(out));
  console.log(`[pull] OK hubsOk=${hubs.length} err=${errN} GTC=${vung.gtc} daGan=${vung.daGan} canGiao=${vung.canGiao} COD soDon=${out.cod.vung.soDon} tongCod=${codTong} TTS<50k soDon=${out.ttsCod.soDon}`);

  // nối lịch sử (giữ 14 ngày gần nhất) để so cùng giờ hôm qua
  const hp = path.join(ROOT, 'gtc_history.json');
  let hist = []; try { hist = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch (e) { hist = []; }
  hist.push({ t: out.updatedAt, hourVN: HOUR, gtc: vung.gtc, daGan: vung.daGan, canGiao: vung.canGiao });
  const cutoff = Date.now() - 15 * 86400000;
  hist = hist.filter(x => new Date(x.t).getTime() >= cutoff);
  fs.writeFileSync(hp, JSON.stringify(hist));
})().catch(e => { console.error('LOI:', e && e.message || e); process.exit(1); });
