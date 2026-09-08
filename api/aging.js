// GET /api/aging — đọc lịch sử Aging cho dashboard / báo cáo.
// Tham số:
//   ?group=day                         → xu hướng tổng đơn theo ngày (from/to)
//   ?group=am&date=YYYY-MM-DD          → theo AM 1 ngày (hoặc from/to gộp)
//   ?group=bc&date=...                 → theo Bưu Cục
//   ?group=bucket&date=...             → theo nhóm ngày (5-8, 8-11...)
//   ?raw=1&date=YYYY-MM-DD             → RAW từng đơn của 1 ngày (chỉ trong 180 ngày)
//   ?dates=1                           → liệt kê các ngày đang có dữ liệu
// Mặc định (không tham số): group=day, 60 ngày gần nhất.
import { sql, cors } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  const group = q.group || (q.raw ? 'raw' : 'day');
  const date = q.date, from = q.from, to = q.to;

  try {
    if (q.dates) {
      const r = await sql`SELECT DISTINCT snapshot_date FROM aging_daily_agg ORDER BY snapshot_date DESC LIMIT 400`;
      return res.json(r.map(x => x.snapshot_date));
    }
    if (group === 'raw') {
      if (!date) return res.status(400).json({ error: 'raw cần &date=YYYY-MM-DD' });
      const r = await sql`SELECT * FROM aging_snapshots WHERE snapshot_date = ${date} ORDER BY so_ngay DESC NULLS LAST`;
      return res.json({ note: 'raw chỉ giữ 180 ngày gần nhất', rows: r });
    }
    if (group === 'day') {
      const r = date
        ? await sql`SELECT snapshot_date, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date = ${date} GROUP BY snapshot_date`
        : (from && to)
          ? await sql`SELECT snapshot_date, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date BETWEEN ${from} AND ${to} GROUP BY snapshot_date ORDER BY snapshot_date`
          : await sql`SELECT snapshot_date, SUM(so_don)::int AS so_don FROM aging_daily_agg GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 60`;
      return res.json(r);
    }
    // xác định khoảng ngày: 1 ngày cụ thể / from-to / ngày mới nhất
    const pick = (col) => {
      if (date) {
        if (col === 'bc')  return sql`SELECT bc        AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date=${date} GROUP BY bc        ORDER BY so_don DESC`;
        if (col === 'nhom_ngay') return sql`SELECT nhom_ngay AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date=${date} GROUP BY nhom_ngay ORDER BY so_don DESC`;
        return sql`SELECT am AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date=${date} GROUP BY am ORDER BY so_don DESC`;
      }
      if (from && to) {
        if (col === 'bc')  return sql`SELECT bc        AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date BETWEEN ${from} AND ${to} GROUP BY bc        ORDER BY so_don DESC`;
        if (col === 'nhom_ngay') return sql`SELECT nhom_ngay AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date BETWEEN ${from} AND ${to} GROUP BY nhom_ngay ORDER BY so_don DESC`;
        return sql`SELECT am AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date BETWEEN ${from} AND ${to} GROUP BY am ORDER BY so_don DESC`;
      }
      if (col === 'bc')  return sql`SELECT bc        AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date=(SELECT MAX(snapshot_date) FROM aging_daily_agg) GROUP BY bc        ORDER BY so_don DESC`;
      if (col === 'nhom_ngay') return sql`SELECT nhom_ngay AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date=(SELECT MAX(snapshot_date) FROM aging_daily_agg) GROUP BY nhom_ngay ORDER BY so_don DESC`;
      return sql`SELECT am AS key, SUM(so_don)::int AS so_don FROM aging_daily_agg WHERE snapshot_date=(SELECT MAX(snapshot_date) FROM aging_daily_agg) GROUP BY am ORDER BY so_don DESC`;
    };
    const dim = group === 'bc' ? 'bc' : group === 'bucket' ? 'nhom_ngay' : 'am';
    return res.json(await pick(dim));
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
