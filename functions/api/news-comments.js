import { tokenHash } from "../_auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });
const clean = value => String(value ?? "").trim();

async function ensureTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fans (
    id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, phone TEXT UNIQUE,
    email TEXT UNIQUE, google_sub TEXT UNIQUE, password_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fan_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, fan_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, news_id INTEGER NOT NULL,
    fan_id INTEGER NOT NULL, member_name TEXT NOT NULL, comment TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_news_comments_news ON news_comments(news_id, id DESC)").run();
}

async function currentFan(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT f.id, f.full_name, f.active, s.expires_at
    FROM fan_sessions s JOIN fans f ON f.id=s.fan_id
    WHERE s.token_hash=? LIMIT 1`).bind(await tokenHash(token)).first();
  if (!row || !row.active || Date.parse(row.expires_at) <= Date.now()) return null;
  return row;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureTables(env);
    const id = Number(new URL(request.url).searchParams.get("news_id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الخبر غير صحيح" }, 400);
    const exists = await env.DB.prepare("SELECT id FROM news WHERE id=?").bind(id).first();
    if (!exists) return json({ success: false, message: "الخبر غير موجود" }, 404);
    const { results } = await env.DB.prepare(`SELECT id, member_name,
      comment, strftime('%Y-%m-%d %H:%M', created_at) AS created_at
      FROM news_comments WHERE news_id=? ORDER BY id ASC LIMIT 200`).bind(id).all();
    return json({ success: true, comments: results || [] });
  } catch (error) {
    console.error("News comments read failed", error);
    return json({ success: false, message: "تعذر جلب التعليقات" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureTables(env);
    const fan = await currentFan(request, env);
    if (!fan) return json({ success: false, message: "سجّل الدخول بحساب عضو أولاً" }, 401);
    const body = await request.json();
    const newsId = Number(body.news_id);
    const comment = clean(body.comment);
    if (!Number.isInteger(newsId) || newsId < 1) return json({ success: false, message: "رقم الخبر غير صحيح" }, 400);
    if (!comment) return json({ success: false, message: "اكتب تعليقك أولاً" }, 400);
    if (comment.length > 1000) return json({ success: false, message: "التعليق طويل جداً، الحد الأقصى 1000 حرف" }, 400);
    const exists = await env.DB.prepare("SELECT id FROM news WHERE id=?").bind(newsId).first();
    if (!exists) return json({ success: false, message: "الخبر غير موجود" }, 404);
    await env.DB.prepare("INSERT INTO news_comments(news_id, fan_id, member_name, comment) VALUES(?,?,?,?)")
      .bind(newsId, fan.id, fan.full_name, comment).run();
    return json({ success: true, message: "تم نشر تعليقك" }, 201);
  } catch (error) {
    console.error("News comment create failed", error);
    return json({ success: false, message: "تعذر نشر التعليق حالياً" }, 500);
  }
}
