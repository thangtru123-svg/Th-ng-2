// Bước 1 lấy refresh token: mở https://th-ng-2.vercel.app/api/oauth-setup → chuyển sang màn hình "Cho phép" của Google.
// Cần env: GOOGLE_OAUTH_CLIENT_ID. Và trong Google Cloud (OAuth client) phải thêm Redirect URI:
//   https://th-ng-2.vercel.app/api/oauth-callback
export default function handler(req, res) {
  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!CLIENT_ID) { res.status(500).send('Thiếu env GOOGLE_OAUTH_CLIENT_ID'); return; }
  const redirect = `https://${req.headers.host}/api/oauth-callback`;
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString() });
  res.end();
}
