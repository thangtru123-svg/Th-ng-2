// Bước 2: Google quay về đây kèm "code" → đổi lấy refresh_token và hiển thị để copy vào Vercel env GOOGLE_REFRESH_TOKEN.
// Cần env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
export default async function handler(req, res) {
  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const code = (req.query.code || '').toString();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!CLIENT_ID || !CLIENT_SECRET) { res.status(500).send('Thiếu env GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET'); return; }
  if (!code) { res.status(400).send('Thiếu code. Hãy bắt đầu lại từ /api/oauth-setup'); return; }
  const redirect = `https://${req.headers.host}/api/oauth-callback`;
  const body = new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: redirect, grant_type: 'authorization_code' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (j.refresh_token) {
    res.status(200).send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px">
      <h2 style="color:#166534">✅ Lấy refresh token thành công</h2>
      <p>Copy chuỗi dưới đây dán vào <b>Vercel → Settings → Environment Variables</b> với tên <b>GOOGLE_REFRESH_TOKEN</b>, rồi <b>Redeploy</b>:</p>
      <textarea readonly style="width:100%;height:90px;font-size:13px;padding:8px" onclick="this.select()">${esc(j.refresh_token)}</textarea>
      <p style="color:#92400e;font-size:13px">Lưu ý: giữ bí mật chuỗi này. Sau khi dán xong có thể xoá 2 file api/oauth-setup.js & api/oauth-callback.js cho sạch.</p>
      </body>`);
  } else {
    res.status(500).send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px">
      <h2 style="color:#b91c1c">Chưa lấy được refresh_token</h2>
      <pre style="background:#f3f4f6;padding:12px;white-space:pre-wrap">${esc(JSON.stringify(j, null, 2))}</pre>
      <p>Thường do Google không trả refresh_token khi đã cấp phép trước đó. Cách xử lý: vào <b>https://myaccount.google.com/permissions</b> gỡ quyền app này, rồi mở lại <b>/api/oauth-setup</b> (đã ép prompt=consent).</p>
      </body>`);
  }
}
