// Telegram webhook — tag @AM cho group XBG, topic "Vận hành chung" (thread 5)
// Chỉ @anhthuvu123 / @thangquada gõ /AM mới tag 26 thành viên (trừ @HelloHieu, @hoangban)
const TOKEN = "7471088067:AAGje2KrjUTzlkIiU05h1bm21IUkB0J2J0s";
const GROUP = -1003802272887;
const THREAD = 5;                                   // topic "Vận hành chung"
const SECRET = "xbg-tagall-7k9m2p";                 // khớp secret_token khi setWebhook
const TRIGGER_USERS = ["anhthuvu123", "thangquada"];
const TAGS = ["@VuVinh_200619","@NenTN_1877611","@DungHT_3006148","@CaoXuanMinh","@trinhvv","@DUNG_AM","@thai4568","@DUNGNHP_AM","@levinhtb","@Dat_BN","@NguyenphuHuongz3sz3","@DUYBG","@Quangnv_3002416","@longlucngan","@MinhGiang90","@DuyenDP","@ThuBaTheMoon","@nhunghoang1990","@NamKv_97","@QuangBX_3098460","@Duc_QN","@TuanNB0","@lailalamday","@mslananh8x","@SUBG92","@thangquada"];

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(200).send("ok"); return; }
  // chặn request lạ — chỉ nhận đúng secret của Telegram
  if ((req.headers["x-telegram-bot-api-secret-token"] || "") !== SECRET) { res.status(200).send("ok"); return; }
  try {
    let u = req.body;
    if (typeof u === "string") { try { u = JSON.parse(u); } catch (e) { u = {}; } }
    const m = (u && u.message) || {};
    const txt = (m.text || "").trim().toLowerCase();
    const w0 = txt.split(/\s+/)[0] || "";
    const isCmd = w0 === "/am" || w0.startsWith("/am@");
    const frm = ((m.from || {}).username || "").toLowerCase();
    if (m.chat && m.chat.id === GROUP && m.message_thread_id === THREAD &&
        TRIGGER_USERS.map(x => x.toLowerCase()).includes(frm) && isCmd) {
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: GROUP, message_thread_id: THREAD, reply_to_message_id: m.message_id, text: "📢 " + TAGS.join(" ") })
      });
    }
  } catch (e) { /* luôn trả 200 để Telegram không retry dồn */ }
  res.status(200).send("ok");
}
