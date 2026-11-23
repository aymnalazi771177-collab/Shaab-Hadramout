const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });

async function ensureLikesTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_reel_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    visitor_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(story_id, visitor_hash)
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_club_reel_likes_story ON club_reel_likes(story_id)").run();
}
async function hashVisitorKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function readVisitorKey(value) {
  const key = String(value || "").trim();
  return key.length >= 16 && key.length <= 128 ? key : "";
}
async function validStory(env, storyId) {
  return env.DB.prepare(`SELECT i.id FROM club_reel_items i
    JOIN club_reel_groups g ON g.id=i.group_id
    WHERE i.id=? AND g.active=1 LIMIT 1`).bind(storyId).first();
}
async function getState(env, storyId, visitorKey) {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM club_reel_likes WHERE story_id=?").bind(storyId).first();
  let liked = false;
  if (visitorKey) {
    const visitorHash = await hashVisitorKey(visitorKey);
    const own = await env.DB.prepare("SELECT id FROM club_reel_likes WHERE story_id=? AND visitor_hash=? LIMIT 1").bind(storyId, visitorHash).first();
    liked = !!own;
  }
  return { success: true, story_id: storyId, count: Number(countRow?.count || 0), liked };
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function onRequestGet({ request, env }) {
  try {
    await ensureLikesTable(env);
    const url = new URL(request.url);
    const storyId = Number(url.searchParams.get("story_id"));
    if (!Number.isInteger(storyId) || storyId < 1) return json({ success: false, message: "رقم الحالة غير صحيح" }, 400);
    if (!await validStory(env, storyId)) return json({ success: false, message: "الحالة غير موجودة" }, 404);
    return json(await getState(env, storyId, readVisitorKey(url.searchParams.get("visitor_key"))));
  } catch (error) {
    console.error("Reel likes GET failed", error);
    return json({ success: false, message: "تعذر تحميل إعجابات الحالة" }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  try {
    await ensureLikesTable(env);
    const body = await request.json();
    const storyId = Number(body.story_id);
    const visitorKey = readVisitorKey(body.visitor_key);
    if (!Number.isInteger(storyId) || storyId < 1 || !visitorKey) return json({ success: false, message: "بيانات الإعجاب غير صحيحة" }, 400);
    if (!await validStory(env, storyId)) return json({ success: false, message: "الحالة غير موجودة" }, 404);
    const visitorHash = await hashVisitorKey(visitorKey);
    await env.DB.prepare("INSERT OR IGNORE INTO club_reel_likes(story_id,visitor_hash) VALUES(?,?)").bind(storyId, visitorHash).run();
    return json(await getState(env, storyId, visitorKey));
  } catch (error) {
    console.error("Reel likes POST failed", error);
    return json({ success: false, message: "تعذر تسجيل الإعجاب حالياً" }, 500);
  }
}
