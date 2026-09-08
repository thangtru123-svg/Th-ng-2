// Kết nối Neon Postgres dùng chung cho các API.
// Cần biến môi trường DATABASE_URL (đặt trong Vercel → Settings → Environment Variables).
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.warn('[db] Thiếu DATABASE_URL');
}
export const sql = neon(process.env.DATABASE_URL);

// CORS + tiện ích JSON cho mọi endpoint
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Ingest-Token');
}
