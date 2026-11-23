import { tokenHash } from "../_auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });

async function ensureLikesTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_media_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    fan_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(media_id, fan_id)
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_club_media_likes_media ON club_media_likes(media_id)").run();
}

async function getFanId(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT f.id, f.active, s.expires_at
    FROM fan_sessions s JOIN fans f ON f.id=s.fan_id
    WHERE s.token_hash=? LIMIT 1`).bind(await tokenHash(token)).first();
  if (!row || !row.active || Date.parse(row.expires_at) <= Date.now()) return null;
  return Number(row.id);
}

async function validPhoto(env, mediaId) {
  return await env.DB.prepare("SELECT id FROM club_media WHERE id=? AND media_type='image' LIMIT 1").bind(mediaId).first();
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureLikesTable(env);
    const mediaId = Number(new URL(request.url).searchParams.get("media_id"));
    if (!Number.isInteger(mediaId) || mediaId < 1) return json({ success: false, message: "رقم الصورة غير صحيح" }, 400);
    if (!await validPhoto(env, mediaId)) return json({ success: false, message: "الصورة غير موجودة" }, 404);
    const fanId = await getFanId(request, env);
    const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM club_media_likes WHERE media_id=?").bind(mediaId).first();
    let liked = false;
    if (fanId) {
      const own = await env.DB.prepare("SELECT id FROM club_media_likes WHERE media_id=? AND fan_id=? LIMIT 1").bind(mediaId, fanId).first();
      liked = !!own;
    }
    return json({ success: true, media_id: mediaId, count: Number(countRow?.count || 0), liked });
  } catch (error) {
    console.error("Media likes GET failed", error);
    return json({ success: false, message: "تعذر تحميل إعجابات الصورة" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureLikesTable(env);
    const fanId = await getFanId(request, env);
    if (!fanId) return json({ success: false, message: "يرجى تسجيل الدخول بحساب المشجع للإعجاب" }, 401);
    const body = await request.json();
    const mediaId = Number(body.media_id);
    if (!Number.isInteger(mediaId) || mediaId < 1 || typeof body.liked !== "boolean") {
      return json({ success: false, message: "بيانات الإعجاب غير صحيحة" }, 400);
    }
    if (!await validPhoto(env, mediaId)) return json({ success: false, message: "الصورة غير موجودة" }, 404);
    if (body.liked) {
      await env.DB.prepare("INSERT OR IGNORE INTO club_media_likes(media_id,fan_id) VALUES(?,?)").bind(mediaId, fanId).run();
    } else {
      await env.DB.prepare("DELETE FROM club_media_likes WHERE media_id=? AND fan_id=?").bind(mediaId, fanId).run();
    }
    const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM club_media_likes WHERE media_id=?").bind(mediaId).first();
    const own = await env.DB.prepare("SELECT id FROM club_media_likes WHERE media_id=? AND fan_id=? LIMIT 1").bind(mediaId, fanId).first();
    return json({ success: true, media_id: mediaId, count: Number(countRow?.count || 0), liked: !!own });
  } catch (error) {
    console.error("Media likes POST failed", error);
    return json({ success: false, message: "تعذر حفظ الإعجاب حالياً" }, 500);
  }
}
