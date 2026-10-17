// POST /api/set-ghn — cập nhật GitHub secret GHN_SESSION từ token GHN (dùng cho Shortcut iOS "1 chạm").
// Body JSON: { token, key }. Env Vercel: GH_DISPATCH_TOKEN (classic PAT scope `repo`), SET_GHN_KEY (mã bảo vệ).
// Luồng: lấy public-key của repo → mã hoá token (libsodium sealed box) → PUT secret GHN_SESSION.
import _sodium from 'libsodium-wrappers';

const OWNER = 'thangtru123-svg', REPO = 'Th-ng-2', SECRET = 'GHN_SESSION';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const token = (body.token || '').toString().trim();
    const key = (body.key || '').toString();
    const SET_KEY = process.env.SET_GHN_KEY || '';
    if (SET_KEY && key !== SET_KEY) { res.status(403).json({ ok: false, error: 'Sai key bảo vệ' }); return; }
    if (!token || token.length < 20) { res.status(400).json({ ok: false, error: 'Token GHN rỗng/không hợp lệ — đại nhân đã đăng nhập nhanh.ghn.vn chưa?' }); return; }
    const gh = process.env.GH_DISPATCH_TOKEN;
    if (!gh) { res.status(500).json({ ok: false, error: 'Chưa cấu hình GH_DISPATCH_TOKEN' }); return; }
    const H = { 'Authorization': 'Bearer ' + gh, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'xbg-set-ghn' };
    // 1) public key của repo
    const pkR = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/public-key`, { headers: H });
    if (!pkR.ok) { const t = await pkR.text(); res.status(502).json({ ok: false, error: 'public-key ' + pkR.status + ' (token thiếu quyền repo?)', body: t.slice(0, 150) }); return; }
    const pk = await pkR.json(); // { key, key_id }
    // 2) mã hoá sealed box
    await _sodium.ready; const sodium = _sodium;
    const binkey = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
    const enc = sodium.crypto_box_seal(sodium.from_string(token), binkey);
    const encrypted_value = sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);
    // 3) PUT secret
    const putR = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/${SECRET}`, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_value, key_id: pk.key_id })
    });
    if (putR.status === 201 || putR.status === 204) { res.status(200).json({ ok: true, msg: 'Đã cập nhật token GHN ✓ (lần quét kế tiếp sẽ dùng token mới)' }); }
    else { const t = await putR.text(); res.status(502).json({ ok: false, error: 'PUT secret ' + putR.status, body: t.slice(0, 150) }); }
  } catch (e) { res.status(500).json({ ok: false, error: String(e && e.message || e) }); }
}
