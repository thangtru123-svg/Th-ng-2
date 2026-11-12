// POST /api/tbb-refresh — kích hoạt workflow GTC Live (cho nút "Cập nhật nhanh").
// Cần env GH_DISPATCH_TOKEN = PAT có quyền actions:write (hoặc repo) trên repo này.
export default async function handler(req, res) {
  // Nhận cả GET + POST để dịch vụ cron ngoài (cron-job.org) dán URL là chạy (mặc định GET).
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ ok: false, error: 'GET/POST only' }); return; }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) { res.status(500).json({ ok: false, error: 'Chưa cấu hình GH_DISPATCH_TOKEN trên Vercel' }); return; }
  try {
    const r = await fetch('https://api.github.com/repos/thangtru123-svg/Th-ng-2/actions/workflows/gtc-live.yml/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tbb-live',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main' })
    });
    // Chốt COD hằng đêm: cron ngoài (cron-job.org) gọi endpoint này ~23h26 VN → dispatch thêm workflow cod-chot (chính xác hơn lịch GitHub, vốn hay trễ hàng giờ).
    let cod = null;
    try {
      const vn = new Date(Date.now() + 7 * 3600 * 1000); const mins = vn.getUTCHours() * 60 + vn.getUTCMinutes();
      if (mins >= 23 * 60 + 15 && mins <= 23 * 60 + 50) {
        const r2 = await fetch('https://api.github.com/repos/thangtru123-svg/Th-ng-2/actions/workflows/cod-chot.yml/dispatches', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'tbb-live', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: 'main' })
        });
        cod = r2.status;
      }
    } catch (e) { cod = 'err'; }
    // Thu tiền - Bắn kiểm (23h): cùng cơ chế — cron ngoài gọi endpoint này trong khung 23h00–23h30 VN → dispatch thutien-bankiem (chạy lúc nào trong khung cũng được, không cố định 23h; script tự chống bắn trùng trong ngày).
    let tt = null;
    try {
      const vn2 = new Date(Date.now() + 7 * 3600 * 1000); const m2 = vn2.getUTCHours() * 60 + vn2.getUTCMinutes();
      if (m2 >= 23 * 60 && m2 <= 23 * 60 + 30) {
        const r3 = await fetch('https://api.github.com/repos/thangtru123-svg/Th-ng-2/actions/workflows/thutien-bankiem.yml/dispatches', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'tbb-live', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: 'main' })
        });
        tt = r3.status;
      }
    } catch (e) { tt = 'err'; }
    if (r.status === 204) { res.status(200).json({ ok: true, codChot: cod, thuTien: tt }); }
    else { const t = await r.text(); res.status(502).json({ ok: false, status: r.status, body: t.slice(0, 200) }); }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
