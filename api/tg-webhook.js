// Telegram webhook của bot dashboard XBG.
// Lệnh /AM (tag 26 AM ở topic "Vận hành chung") ĐÃ TẮT 28/11/2026 theo đại nhân — BOT của Sếp đã nhắc chung các AM.
// Muốn bật lại: xem lịch sử git (commit trước "chore(tg): tắt lệnh /AM") để lấy TRIGGER_USERS + TAGS + nhánh tag.
// Webhook vẫn giữ để nhận DM đăng ký của @anhthuvu123 (báo chat_id cho dashboard p51).
const TOKEN = "7471088067:AAGje2KrjUTzlkIiU05h1bm21IUkB0J2J0s";
const SECRET = "xbg-tagall-7k9m2p";                 // khớp secret_token khi setWebhook

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(200).send("ok"); return; }
  // chặn request lạ — chỉ nhận đúng secret của Telegram
  if ((req.headers["x-telegram-bot-api-secret-token"] || "") !== SECRET) { res.status(200).send("ok"); return; }
  try {
    let u = req.body;
    if (typeof u === "string") { try { u = JSON.parse(u); } catch (e) { u = {}; } }
    const m = (u && u.message) || {};
    const frm = ((m.from || {}).username || "").toLowerCase();
    // DM riêng với bot từ @anhthuvu123: báo chat_id về @thangquada để gắn vào dashboard (p51 "Tình hình BC N-1")
    if (m.chat && m.chat.type === "private" && frm === "anhthuvu123") {
      const send = (chat_id, text) => fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text })
      });
      await send(m.chat.id, "Đã đăng ký nhận báo cáo Tình hình Bưu Cục từ dashboard XBG.");
      await send(1747498029, "@anhthuvu123 vừa nhắn bot. chat_id = " + m.chat.id + " (điền vào TG_ANHTHU_ID trong index.html)");
    }
  } catch (e) { /* luôn trả 200 để Telegram không retry dồn */ }
  res.status(200).send("ok");
}
