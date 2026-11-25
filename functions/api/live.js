import { isAuthorized } from "../_auth.js";
function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store"
  }});
}
async function ensureTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS live_stream (id INTEGER PRIMARY KEY CHECK (id = 1), title TEXT NOT NULL DEFAULT '', stream_url TEXT NOT NULL DEFAULT '', stream_type TEXT NOT NULL DEFAULT 'youtube', enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("INSERT OR IGNORE INTO live_stream (id, title, stream_url, stream_type, enabled) VALUES (1, '', '', 'youtube', 0)").run();
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }});
}
export async function onRequestGet({ env }) {
  try {
    await ensureTable(env);
    const stream = await env.DB.prepare("SELECT title, stream_url, stream_type, enabled, updated_at FROM live_stream WHERE id = 1").first();
    return json({ success: true, stream });
  } catch (error) {
    return json({ success: false, message: "تعذر تحميل إعدادات البث" }, 500);
  }
}
export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env, "live")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const body = await request.json();
    const title = String(body.title || "").trim().slice(0, 160);
    const url = String(body.stream_url || "").trim();
    const type = String(body.stream_type || "").toLowerCase();
    const enabled = body.enabled === true || body.enabled === 1 || body.enabled === "1" ? 1 : 0;
    if (!["youtube", "m3u8", "mp4"].includes(type)) return json({ success: false, message: "نوع البث غير مدعوم" }, 400);
    if (enabled && !url) return json({ success: false, message: "أدخل رابط البث أولاً" }, 400);
    if (url) {
      let parsed;
      try { parsed = new URL(url); } catch { return json({ success: false, message: "رابط البث غير صحيح" }, 400); }
      if (!["http:", "https:"].includes(parsed.protocol)) return json({ success: false, message: "يجب أن يبدأ الرابط بـ https أو http" }, 400);
      if (type === "youtube" && !/(youtube\.com|youtu\.be)$/i.test(parsed.hostname.replace(/^www\./, "").split(".").slice(-2).join(".")) && !/youtube\.com$|youtu\.be$/i.test(parsed.hostname)) {
        return json({ success: false, message: "أدخل رابط فيديو أو بث مباشر من يوتيوب" }, 400);
      }
    }
    await env.DB.prepare("UPDATE live_stream SET title = ?, stream_url = ?, stream_type = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1").bind(title, url, type, enabled).run();
    const stream = await env.DB.prepare("SELECT title, stream_url, stream_type, enabled, updated_at FROM live_stream WHERE id = 1").first();
    return json({ success: true, stream });
  } catch (error) {
    return json({ success: false, message: "تعذر حفظ إعدادات البث" }, 500);
  }
}