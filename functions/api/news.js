import {isAuthorized} from "../_auth.js";
import {sendClubPush} from "../_push.js";
function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }});
}
async function ensureImagesTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS news_images (id INTEGER PRIMARY KEY AUTOINCREMENT, news_id INTEGER NOT NULL, url TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  const columns = await env.DB.prepare("PRAGMA table_info(news)").all();
  if (!(columns.results || []).some(column => column.name === "is_urgent")) {
    await env.DB.prepare("ALTER TABLE news ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0").run();
  }
}
function cleanImages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(item => {
    const raw = typeof item === "string" ? item : item && item.url;
    if (typeof raw !== "string" || !raw.trim()) return null;
    const url = raw.trim();
    if (url.startsWith("/api/media/")) return { url };
    try { const parsed = new URL(url); return ["http:", "https:"].includes(parsed.protocol) ? { url: parsed.href } : null; }
    catch { return null; }
  }).filter(Boolean);
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }});
}
export async function onRequestGet({ env }) {
  try {
    await ensureImagesTable(env);
    const { results } = await env.DB.prepare("SELECT id, title, content, image_url, created_at, is_urgent FROM news ORDER BY id DESC").all();
    const images = results.length
      ? (await env.DB.prepare("SELECT news_id, url, sort_order FROM news_images WHERE news_id IN (" + results.map(() => "?").join(",") + ") ORDER BY sort_order, id").bind(...results.map(item => item.id)).all()).results
      : [];
    const byNews = new Map();
    for (const image of images) {
      if (!byNews.has(image.news_id)) byNews.set(image.news_id, []);
      byNews.get(image.news_id).push({ url: image.url });
    }
    return json({ success: true, news: results.map(item => ({ ...item, images: (byNews.get(item.id) || []).filter(image => image.url !== item.image_url) })) });
  } catch (error) {
    return json({ success: false, message: "تعذر جلب الأخبار" }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env, "news")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureImagesTable(env);
    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!title) return json({ success: false, message: "عنوان الخبر مطلوب" }, 400);
    const images = cleanImages(body.images);
    const legacyImage = String(body.image_url || "");
    const mainImage = legacyImage || images[0]?.url || "";
    const isUrgent = body.is_urgent === true || body.is_urgent === 1 || body.is_urgent === "1" ? 1 : 0;
    const result = await env.DB.prepare("INSERT INTO news (title, content, image_url, is_urgent) VALUES (?, ?, ?, ?)").bind(title, String(body.content || ""), mainImage, isUrgent).run();
    const id = result.meta.last_row_id;
    if (images.length) await env.DB.batch(images.map((image, index) => env.DB.prepare("INSERT INTO news_images (news_id, url, sort_order) VALUES (?, ?, ?)").bind(id, image.url, index)));
    await sendClubPush(env, "news", {title: isUrgent ? "خبر عاجل من نادي شعب حضرموت" : "خبر جديد من نادي شعب حضرموت", body: title, url: "./?newsId=" + id, newsId: String(id)});
    return json({ success: true, id }, 201);
  } catch {
    return json({ success: false, message: "تعذر حفظ الخبر" }, 500);
  }
}
export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env, "news")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureImagesTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الخبر غير صحيح" }, 400);
    if (!title) return json({ success: false, message: "عنوان الخبر مطلوب" }, 400);
    const images = cleanImages(body.images);
    const hasImages = Array.isArray(body.images);
    const mainImage = body.image_url !== undefined ? String(body.image_url || "") : (hasImages ? (images[0]?.url || "") : "");
    const isUrgent = body.is_urgent === true || body.is_urgent === 1 || body.is_urgent === "1" ? 1 : 0;
    const result = await env.DB.prepare("UPDATE news SET title = ?, content = ?, image_url = ?, is_urgent = ? WHERE id = ?").bind(title, String(body.content || ""), mainImage, isUrgent, id).run();
    if (!result.meta.changes) return json({ success: false, message: "الخبر غير موجود" }, 404);
    if (hasImages) {
      await env.DB.prepare("DELETE FROM news_images WHERE news_id = ?").bind(id).run();
      if (images.length) await env.DB.batch(images.map((image, index) => env.DB.prepare("INSERT INTO news_images (news_id, url, sort_order) VALUES (?, ?, ?)").bind(id, image.url, index)));
    }
    return json({ success: true });
  } catch {
    return json({ success: false, message: "تعذر تعديل الخبر" }, 500);
  }
}
export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env, "news")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureImagesTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الخبر غير صحيح" }, 400);
    await env.DB.prepare("DELETE FROM news_images WHERE news_id = ?").bind(id).run();
    const result = await env.DB.prepare("DELETE FROM news WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ success: false, message: "الخبر غير موجود" }, 404);
    return json({ success: true });
  } catch {
    return json({ success: false, message: "تعذر الحذف" }, 500);
  }
}
