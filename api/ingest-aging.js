// POST /api/ingest-aging  — nhận dữ liệu Aging từ Apps Script, lưu vào Neon.
// Bảo vệ bằng header X-Ingest-Token (so với biến môi trường INGEST_TOKEN).
// Body JSON: { snapshot_date:"YYYY-MM-DD", rows:[...], first:bool, finalize:bool }
//   - first=true   : xoá dữ liệu ngày đó trước (để chạy lại không nhân đôi)
//   - rows[]       : mỗi phần tử {vung,tinh,bc,am,order_code,nhom_kh,thoi_gian_nhap,so_ngay,nhom_ngay,updated_time}
//   - finalize=true: dựng bản tổng hợp ngày đó + dọn raw > 180 ngày
import { sql, cors } from './_db.js';

const RAW_KEEP_DAYS = 180;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers['x-ingest-token'];
  if (!token || token !== process.env.INGEST_TOKEN) {
    return res.status(401).json({ error: 'Sai hoặc thiếu X-Ingest-Token' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const { snapshot_date, rows, first, finalize } = body || {};
  if (!snapshot_date || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Cần snapshot_date và rows[]' });
  }

  try {
    if (first) {
      await sql`DELETE FROM aging_snapshots WHERE snapshot_date = ${snapshot_date}`;
      await sql`DELETE FROM aging_daily_agg WHERE snapshot_date = ${snapshot_date}`;
    }

    if (rows.length) {
      const col = (k) => rows.map(r => (r[k] === undefined || r[k] === '' ? null : r[k]));
      await sql`
        INSERT INTO aging_snapshots
          (snapshot_date, vung, tinh, bc, am, order_code, nhom_kh, thoi_gian_nhap, so_ngay, nhom_ngay, updated_time)
        SELECT ${snapshot_date}::date, *
        FROM unnest(
          ${col('vung')}::text[],       ${col('tinh')}::text[],
          ${col('bc')}::text[],         ${col('am')}::text[],
          ${col('order_code')}::text[], ${col('nhom_kh')}::text[],
          ${col('thoi_gian_nhap')}::timestamptz[],
          ${col('so_ngay')}::numeric[], ${col('nhom_ngay')}::text[],
          ${col('updated_time')}::timestamptz[]
        )`;
    }

    let aggRows = null, pruned = null;
    if (finalize) {
      await sql`DELETE FROM aging_daily_agg WHERE snapshot_date = ${snapshot_date}`;
      const r = await sql`
        INSERT INTO aging_daily_agg (snapshot_date, am, bc, nhom_ngay, so_don)
        SELECT snapshot_date, COALESCE(am,''), COALESCE(bc,''), COALESCE(nhom_ngay,''), COUNT(*)
        FROM aging_snapshots WHERE snapshot_date = ${snapshot_date}
        GROUP BY snapshot_date, COALESCE(am,''), COALESCE(bc,''), COALESCE(nhom_ngay,'')
        RETURNING 1`;
      aggRows = r.length;
      const p = await sql`
        DELETE FROM aging_snapshots
        WHERE snapshot_date < (${snapshot_date}::date - ${RAW_KEEP_DAYS})
        RETURNING 1`;
      pruned = p.length;
    }

    return res.json({ ok: true, inserted: rows.length, aggRows, prunedRawRows: pruned });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
