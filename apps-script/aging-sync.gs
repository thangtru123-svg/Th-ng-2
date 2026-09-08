/**
 * ĐỒNG BỘ AGING → DATABASE (Neon) — Vùng XBG
 * Dán toàn bộ file này vào: mở file "Vùng XBG - Báo cáo AM"
 *   → Tiện ích mở rộng (Extensions) → Apps Script → dán → Lưu.
 * Sau đó chạy 1 lần hàm  setup()  để cấp quyền + đặt lịch chạy 23:30 mỗi ngày.
 * Muốn chạy thử ngay: chạy hàm  syncAging().
 *
 * CẦN SỬA 1 DÒNG: dán INGEST_TOKEN giống hệt token đặt trên Vercel.
 */
var API_URL      = 'https://th-ng-2.vercel.app/api/ingest-aging';
var INGEST_TOKEN = 'DÁN_TOKEN_BÍ_MẬT_VÀO_ĐÂY';   // <-- phải trùng INGEST_TOKEN trên Vercel
var SOURCE_SHEET = 'Aging> 5 Ngày';
var BATCH        = 2500;                            // số dòng mỗi lần gửi

function setup() {
  // xoá trigger cũ rồi đặt lịch 23:30 hằng ngày (giờ theo múi giờ của file)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAging') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAging').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
  syncAging(); // chạy luôn 1 lần để kiểm tra
}

function syncAging() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SOURCE_SHEET);
  if (!sh) throw new Error('Không thấy sheet "' + SOURCE_SHEET + '"');
  var values = sh.getDataRange().getValues();

  // tìm dòng tiêu đề (chứa "order_code")
  var hdr = -1;
  for (var i = 0; i < Math.min(values.length, 5); i++) {
    if (values[i].join('|').toLowerCase().indexOf('order_code') >= 0) { hdr = i; break; }
  }
  if (hdr < 0) hdr = 1;

  var tz = ss.getSpreadsheetTimeZone();
  var snap = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); // ngày chụp = hôm nay
  function ts(v) {
    if (v === '' || v == null) return null;
    if (Object.prototype.toString.call(v) === '[object Date]')
      return Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss');
    return String(v).trim();
  }
  function numv(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  var rows = [];
  for (var r = hdr + 1; r < values.length; r++) {
    var v = values[r];
    var oc = (v[4] == null ? '' : String(v[4])).trim();
    if (!oc) continue;                              // bỏ dòng rỗng
    rows.push({
      vung: String(v[0] || '').trim(),
      tinh: String(v[1] || '').trim(),
      bc:   String(v[3] || '').trim(),
      am:   String(v[10] || '').trim(),
      order_code: oc,
      nhom_kh: String(v[5] || '').trim(),
      thoi_gian_nhap: ts(v[6]),
      so_ngay: numv(v[7]),
      nhom_ngay: String(v[11] || '').trim(),
      updated_time: ts(v[8])
    });
  }
  if (!rows.length) throw new Error('Nguồn không có dòng dữ liệu');

  var total = rows.length, sent = 0;
  for (var off = 0; off < total; off += BATCH) {
    var chunk = rows.slice(off, off + BATCH);
    var first = off === 0;
    var finalize = off + BATCH >= total;
    var resp = UrlFetchApp.fetch(API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Ingest-Token': INGEST_TOKEN },
      muteHttpExceptions: true,
      payload: JSON.stringify({ snapshot_date: snap, rows: chunk, first: first, finalize: finalize })
    });
    var code = resp.getResponseCode();
    if (code !== 200) throw new Error('API lỗi ' + code + ': ' + resp.getContentText());
    sent += chunk.length;
  }
  Logger.log('Đã đồng bộ ' + sent + '/' + total + ' đơn cho ngày ' + snap);
}
