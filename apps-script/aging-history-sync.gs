/**
 * LƯU LỊCH SỬ AGING (bản TỔNG HỢP) — Vùng XBG
 * Dán vào: file "Vùng XBG - Báo cáo AM" → Tiện ích mở rộng → Apps Script → dán đè → Lưu.
 * Chạy 1 lần hàm  setup()  → cấp quyền + đặt lịch 08:00 mỗi sáng + dọn trùng + nạp lịch sử cũ từ Export.
 * Mỗi sáng 08:00 script tự đọc "Aging> 5 Ngày" (nguồn làm mới ~07:01) và ghi ~90 dòng tổng hợp vào tab "Lịch sử Aging".
 *
 * ⚠️ CỘT J "Trạng thái" do CÔNG THỨC ARRAYFORMULA của đại nhân tự điền (tra tab "Bưu Cục bất ổn").
 *    → Script CHỈ ghi cột A→I, TUYỆT ĐỐI không đụng cột J (tránh phá công thức / lỗi spill).
 * KHÔNG đụng sheet "Export". Rất nhẹ → giữ vài chục năm, không lo vỡ file.
 */
var SRC_SHEET  = 'Aging> 5 Ngày';
var HIST_SHEET = 'Lịch sử Aging';
var HEADER9 = ['ngay','bc','am','tinh','total','g1_5_7','g2_8_10','g3_11_15','g4_15plus']; // A→I (KHÔNG gồm cột J)
var STATUS_FORMULA = '={"Trạng thái";ARRAYFORMULA(IF(B2:B="","",IFNA(XLOOKUP(B2:B,\'Bưu Cục bất ổn\'!A:A,\'Bưu Cục bất ổn\'!B:B),"")))}';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAgingHistory') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAgingHistory').timeBased().everyDays(1).atHour(8).nearMinute(0).create();
  syncAgingHistory();
  backfillFromExport();
}

function _ymd(v, tz) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = String(v).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return String(v).trim();
}
function _histSheet(ss) {
  var hs = ss.getSheetByName(HIST_SHEET);
  if (!hs) {
    hs = ss.insertSheet(HIST_SHEET);
    hs.getRange(1, 1, 1, 9).setValues([HEADER9]);       // header A1:I1
    hs.getRange('J1').setFormula(STATUS_FORMULA);        // cột J = công thức tự tra trạng thái
  }
  hs.getRange(1, 1, hs.getMaxRows(), 1).setNumberFormat('@'); // cột ngày (A) = text, tránh Sheets tự đổi Date
  return hs;
}
// dòng dữ liệu cuối (tính theo cột A — không bị công thức spill ở cột J làm sai)
function _lastDataRow(hs) {
  var a = hs.getRange(1, 1, hs.getMaxRows(), 1).getValues();
  for (var i = a.length - 1; i >= 0; i--) if (String(a[i][0]).trim() !== '') return i + 1;
  return 0;
}
function _blGroup(s) {
  s = String(s || '').toLowerCase();
  var m = s.match(/\(([a-k])\)/);
  if (m) { var c = m[1]; if (s.indexOf('>15') >= 0 || s.indexOf('> 15') >= 0 || c === 'k') return 'g4'; if (c <= 'c') return 'g1'; if (c <= 'f') return 'g2'; if (c <= 'j') return 'g3'; return 'g4'; }
  if (s.indexOf('5-7') >= 0) return 'g1'; if (s.indexOf('8-10') >= 0) return 'g2';
  if (s.indexOf('11-15') >= 0) return 'g3'; if (s.indexOf('15') >= 0) return 'g4';
  return null;
}

function syncAgingHistory() {
  var ss = SpreadsheetApp.getActive();
  var src = ss.getSheetByName(SRC_SHEET);
  if (!src) throw new Error('Không thấy sheet "' + SRC_SHEET + '"');
  var vals = src.getDataRange().getValues();
  var hdr = 1;
  for (var i = 0; i < Math.min(vals.length, 6); i++) {
    if (String(vals[i].join('|')).toLowerCase().indexOf('order_code') >= 0) { hdr = i; break; }
  }
  var agg = {};
  for (var r = hdr + 1; r < vals.length; r++) {
    var v = vals[r];
    if (!String(v[4] || '').trim()) continue;
    var bc = String(v[3] || '').trim(); if (!bc) continue;
    if (!agg[bc]) agg[bc] = { am: String(v[10] || '').trim(), tinh: String(v[1] || '').trim(), g1: 0, g2: 0, g3: 0, g4: 0 };
    var nhom = String(v[11] || '');
    if      (nhom.indexOf('5-7')   >= 0) agg[bc].g1++;
    else if (nhom.indexOf('8-10')  >= 0) agg[bc].g2++;
    else if (nhom.indexOf('11-15') >= 0) agg[bc].g3++;
    else if (nhom.indexOf('15')    >= 0) agg[bc].g4++;
  }
  var tz = ss.getSpreadsheetTimeZone();
  var snap = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var out = [];
  Object.keys(agg).forEach(function (bc) {
    var a = agg[bc], tot = a.g1 + a.g2 + a.g3 + a.g4;
    if (tot) out.push([snap, bc, a.am, a.tinh, tot, a.g1, a.g2, a.g3, a.g4]); // 9 cột A→I
  });
  if (!out.length) throw new Error('Nguồn không có dữ liệu để tổng hợp');

  var hs = _histSheet(ss);
  // dọn TRÙNG: xoá mọi dòng của ngày hôm nay (so bằng _ymd)
  var data = hs.getRange(1, 1, hs.getMaxRows(), 1).getValues(); // chỉ đọc cột A
  for (var d = data.length - 1; d >= 1; d--) if (_ymd(data[d][0], tz) === snap) hs.deleteRow(d + 1);
  var start = _lastDataRow(hs) + 1;
  hs.getRange(start, 1, out.length, 9).setValues(out);          // ghi A→I, chừa cột J cho công thức
  Logger.log('Lịch sử Aging: ghi ' + out.length + ' Bưu Cục cho ngày ' + snap);
}

/** Nạp lịch sử CŨ từ "Export" — chỉ ghi những NGÀY chưa có trong "Lịch sử Aging". */
function backfillFromExport() {
  var ss = SpreadsheetApp.getActive();
  var ex = ss.getSheetByName('Export');
  if (!ex) { Logger.log('Không có sheet Export — bỏ qua backfill'); return; }
  var tz = ss.getSpreadsheetTimeZone();
  var hs = _histSheet(ss);
  var have = {};
  hs.getRange(1, 1, hs.getMaxRows(), 1).getValues().forEach(function (r, i) { if (i > 0) { var k = _ymd(r[0], tz); if (k) have[k] = 1; } });

  var vals = ex.getDataRange().getValues();
  var byDate = {};
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    var day = _ymd(v[11], tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || have[day]) continue;
    var bc = String(v[2] || '').trim(); if (!bc) continue;
    var g = _blGroup(v[9]); if (!g) continue;
    if (!byDate[day]) byDate[day] = {};
    if (!byDate[day][bc]) byDate[day][bc] = { am: String(v[10] || '').trim(), tinh: String(v[1] || '').trim(), g1: 0, g2: 0, g3: 0, g4: 0 };
    byDate[day][bc][g]++;
  }
  var out = [], days = Object.keys(byDate).sort();
  days.forEach(function (day) {
    var m = byDate[day];
    Object.keys(m).forEach(function (bc) {
      var a = m[bc], tot = a.g1 + a.g2 + a.g3 + a.g4;
      if (tot) out.push([day, bc, a.am, a.tinh, tot, a.g1, a.g2, a.g3, a.g4]); // 9 cột A→I
    });
  });
  if (!out.length) { Logger.log('Backfill: không có ngày mới để nạp'); return; }
  var start = _lastDataRow(hs) + 1;
  hs.getRange(start, 1, out.length, 9).setValues(out);
  Logger.log('Backfill: nạp ' + out.length + ' dòng cho ' + days.length + ' ngày (' + days[0] + ' → ' + days[days.length - 1] + ')');
}
