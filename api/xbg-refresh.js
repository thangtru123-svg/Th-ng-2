// POST /api/tbb-refresh — kích hoạt workflow GTC Live (cho nút "Cập nhật nhanh").
// Cần env GH_DISPATCH_TOKEN = PAT có quyền actions:write (hoặc repo) trên repo này.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
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
    if (r.status === 204) { res.status(200).json({ ok: true }); }
    else { const t = await r.text(); res.status(502).json({ ok: false, status: r.status, body: t.slice(0, 200) }); }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
