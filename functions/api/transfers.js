import {isAuthorized} from "../_auth.js";
function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }});
}
async function ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    direction TEXT NOT NULL DEFAULT 'incoming',
    transfer_type TEXT NOT NULL DEFAULT 'permanent',
    from_club TEXT DEFAULT '',
    to_club TEXT DEFAULT '',
    transfer_date TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
function clean(body) {
  const player_name = String(body.player_name || "").trim();
  const image_url = String(body.image_url || "").trim();
  const direction = String(body.direction || "incoming").trim();
  const transfer_type = String(body.transfer_type || "permanent").trim();
  const from_club = String(body.from_club || "").trim();
  const to_club = String(body.to_club || "").trim();
  const transfer_date = String(body.transfer_date || "").trim();
  const details = String(body.details || "").trim();
  if (!player_name) return { error: "اسم اللاعب مطلوب" };
  if (!["incoming", "outgoing"].includes(direction)) return { error: "اتجاه الانتقال غير صحيح" };
  if (!["permanent", "loan"].includes(transfer_type)) return { error: "نوع الانتقال غير صحيح" };
  if (player_name.length > 120 || from_club.length > 160 || to_club.length > 160 || details.length > 4000) return { error: "بعض البيانات أطول من الحد المسموح" };
  if (image_url) {
    try { const parsed = new URL(image_url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
    catch { return { error: "رابط صورة اللاعب غير صحيح" }; }
  }
  return { player_name, image_url, direction, transfer_type, from_club, to_club, transfer_date, details };
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
    await ensureTable(env);
    const { results } = await env.DB.prepare("SELECT id, player_name, image_url, direction, transfer_type, from_club, to_club, transfer_date, details, created_at, updated_at FROM transfers ORDER BY CASE WHEN transfer_date = '' THEN created_at ELSE transfer_date END DESC, id DESC").all();
    return json({ success: true, transfers: results });
  } catch (error) {
    return json({ success: false, message: "تعذر جلب بيانات الانتقالات" }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env, "transfers")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const data = clean(await request.json());
    if (data.error) return json({ success: false, message: data.error }, 400);
    const result = await env.DB.prepare("INSERT INTO transfers (player_name, image_url, direction, transfer_type, from_club, to_club, transfer_date, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(data.player_name, data.image_url, data.direction, data.transfer_type, data.from_club, data.to_club, data.transfer_date, data.details).run();
    return json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error) {
    return json({ success: false, message: "تعذر حفظ بيانات الانتقال" }, 500);
  }
}
export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env, "transfers")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الانتقال غير صحيح" }, 400);
    const data = clean(await request.json());
    if (data.error) return json({ success: false, message: data.error }, 400);
    const result = await env.DB.prepare("UPDATE transfers SET player_name = ?, image_url = ?, direction = ?, transfer_type = ?, from_club = ?, to_club = ?, transfer_date = ?, details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(data.player_name, data.image_url, data.direction, data.transfer_type, data.from_club, data.to_club, data.transfer_date, data.details, id).run();
    if (!result.meta.changes) return json({ success: false, message: "الانتقال غير موجود" }, 404);
    return json({ success: true });
  } catch (error) {
    return json({ success: false, message: "تعذر تعديل بيانات الانتقال" }, 500);
  }
}
export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env, "transfers")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الانتقال غير صحيح" }, 400);
    const result = await env.DB.prepare("DELETE FROM transfers WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ success: false, message: "الانتقال غير موجود" }, 404);
    return json({ success: true });
  } catch (error) {
    return json({ success: false, message: "تعذر حذف بيانات الانتقال" }, 500);
  }
}
