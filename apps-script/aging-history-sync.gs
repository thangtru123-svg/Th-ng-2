/**
 * LƯU LỊCH SỬ AGING (bản TỔNG HỢP) — Vùng XBG
 * Dán vào: file "Vùng XBG - Báo cáo AM" → Tiện ích mở rộng → Apps Script → dán → Lưu.
 * Chạy 1 lần hàm  setup()  để cấp quyền + đặt lịch 23:30 mỗi ngày.
 * Mỗi tối script tự đọc sheet "Aging> 5 Ngày" và ghi ~90 dòng tổng hợp vào tab "Lịch sử Aging".
 * KHÔNG đụng vào sheet "Export". Rất nhẹ → giữ được vài chục năm, không lo vỡ file.
 */
var SRC_SHEET  = 'Aging> 5 Ngày';
var BATON_SHEET = 'Bưu Cục bất ổn';
var HIST_SHEET = 'Lịch sử Aging';
var HEADER = ['ngay','bc','am','tinh','total','g1_5_7','g2_8_10','g3_11_15','g4_15plus','bat_on'];

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAgingHistory') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAgingHistory').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
  syncAgingHistory(); // chạy thử ngay
}

function syncAgingHistory() {
  var ss = SpreadsheetApp.getActive();
  var src = ss.getSheetByName(SRC_SHEET);
  if (!src) throw new Error('Không thấy sheet "' + SRC_SHEET + '"');
  var vals = src.getDataRange().getValues();

  // dòng tiêu đề = dòng chứa "order_code"
  var hdr = 1;
  for (var i = 0; i < Math.min(vals.length, 6); i++) {
    if (String(vals[i].join('|')).toLowerCase().indexOf('order_code') >= 0) { hdr = i; break; }
  }

  // tập BC bất ổn
  var batSet = {};
  var bs = ss.getSheetByName(BATON_SHEET);
  if (bs) bs.getDataRange().getValues().forEach(function (r) {
    var b = String(r[0] || '').trim();
    if (b && b.indexOf('(') === 0) batSet[b] = 1;   // chỉ lấy dòng tên BC dạng "(XXX) ..."
  });

  // gom theo Bưu Cục
  var agg = {};
  for (var r = hdr + 1; r < vals.length; r++) {
    var v = vals[r];
    if (!String(v[4] || '').trim()) continue;         // bỏ dòng không có order_code
    var bc = String(v[3] || '').trim();
    if (!bc) continue;
    if (!agg[bc]) agg[bc] = { am: String(v[10] || '').trim(), tinh: String(v[1] || '').trim(), g1: 0, g2: 0, g3: 0, g4: 0 };
    var nhom = String(v[11] || '');
    if      (nhom.indexOf('5-7')   >= 0) agg[bc].g1++;
    else if (nhom.indexOf('8-10')  >= 0) agg[bc].g2++;
    else if (nhom.indexOf('11-15') >= 0) agg[bc].g3++;
    else if (nhom.indexOf('15')    >= 0) agg[bc].g4++; // "Nhóm > 15 ngày"
  }

  var tz = ss.getSpreadsheetTimeZone();
  var snap = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var out = [];
  Object.keys(agg).forEach(function (bc) {
    var a = agg[bc];
    var tot = a.g1 + a.g2 + a.g3 + a.g4;
    if (tot === 0) return;
    out.push([snap, bc, a.am, a.tinh, tot, a.g1, a.g2, a.g3, a.g4, batSet[bc] ? 1 : 0]);
  });
  if (!out.length) throw new Error('Nguồn không có dữ liệu để tổng hợp');

  // tab lịch sử (tạo nếu chưa có)
  var hs = ss.getSheetByName(HIST_SHEET);
  if (!hs) { hs = ss.insertSheet(HIST_SHEET); hs.appendRow(HEADER); }
  if (hs.getLastRow() === 0) hs.appendRow(HEADER);

  // idempotent: xoá các dòng của ngày hôm nay (nếu chạy lại) rồi ghi mới
  var data = hs.getDataRange().getValues();
  for (var d = data.length - 1; d >= 1; d--) {
    if (String(data[d][0]) === snap) hs.deleteRow(d + 1);
  }
  hs.getRange(hs.getLastRow() + 1, 1, out.length, HEADER.length).setValues(out);
  Logger.log('Lịch sử Aging: ghi ' + out.length + ' Bưu Cục cho ngày ' + snap);
}

/**
 * CHẠY 1 LẦN (không bắt buộc): nạp lịch sử CŨ từ sheet "Export" vào "Lịch sử Aging"
 * để bảng 7 ngày trên dashboard đầy ngay, khỏi phải chờ gom dần.
 * An toàn: chỉ ghi những NGÀY chưa có trong "Lịch sử Aging" (không đụng ngày đã có).
 * Export cột: 1 tinh · 2 bc · 9 Nhóm BL "(a)5-6..(k)>15" · 10 AM · 11 Ngày(yyyy-MM-dd) · 12 Note(bất ổn).
 */
function backfillFromExport() {
  var ss = SpreadsheetApp.getActive();
  var ex = ss.getSheetByName('Export');
  if (!ex) throw new Error('Không thấy sheet "Export"');
  var hs = ss.getSheetByName(HIST_SHEET);
  if (!hs) { hs = ss.insertSheet(HIST_SHEET); hs.appendRow(HEADER); }

  // ngày đã có trong lịch sử → bỏ qua
  var have = {};
  hs.getDataRange().getValues().forEach(function (r, i) { if (i > 0) have[String(r[0])] = 1; });

  function blGroup(s) {
    s = String(s || '').toLowerCase();
    var m = s.match(/\(([a-k])\)/);
    if (m) { var c = m[1]; if (s.indexOf('>15') >= 0 || s.indexOf('> 15') >= 0 || c === 'k') return 'g4'; if (c <= 'c') return 'g1'; if (c <= 'f') return 'g2'; if (c <= 'j') return 'g3'; return 'g4'; }
    if (s.indexOf('5-7') >= 0) return 'g1'; if (s.indexOf('8-10') >= 0) return 'g2';
    if (s.indexOf('11-15') >= 0) return 'g3'; if (s.indexOf('15') >= 0) return 'g4';
    return null;
  }

  var vals = ex.getDataRange().getValues();
  var byDate = {}; // date -> bc -> {am,tinh,g1..g4,baton}
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    var day = String(v[11] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || have[day]) continue;   // chỉ ngày mới
    var bc = String(v[2] || '').trim(); if (!bc) continue;
    var g = blGroup(v[9]); if (!g) continue;
    if (!byDate[day]) byDate[day] = {};
    if (!byDate[day][bc]) byDate[day][bc] = { am: String(v[10] || '').trim(), tinh: String(v[1] || '').trim(), g1: 0, g2: 0, g3: 0, g4: 0, baton: 0 };
    byDate[day][bc][g]++;
    if (String(v[12] || '').indexOf('bất ổn') >= 0) byDate[day][bc].baton = 1;
  }

  var out = [], days = Object.keys(byDate).sort();
  days.forEach(function (day) {
    var m = byDate[day];
    Object.keys(m).forEach(function (bc) {
      var a = m[bc], tot = a.g1 + a.g2 + a.g3 + a.g4;
      if (tot) out.push([day, bc, a.am, a.tinh, tot, a.g1, a.g2, a.g3, a.g4, a.baton]);
    });
  });
  if (!out.length) { Logger.log('Backfill: không có ngày mới nào để nạp'); return; }
  hs.getRange(hs.getLastRow() + 1, 1, out.length, HEADER.length).setValues(out);
  Logger.log('Backfill: nạp ' + out.length + ' dòng cho ' + days.length + ' ngày (' + days[0] + ' → ' + days[days.length - 1] + ')');
}
