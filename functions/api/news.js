function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function authorized(request, env) {
  const token = env.ADMIN_TOKEN;
  return Boolean(token) && request.headers.get("Authorization") === `Bearer ${token}`;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, content, image_url, created_at FROM news ORDER BY id DESC"
    ).all();
    return json({ success: true, news: results });
  } catch {
    return json({ success: false, message: "تعذر جلب الأخبار" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!title) return json({ success: false, message: "عنوان الخبر مطلوب" }, 400);
    const content = String(body.content || "");
    const imageUrl = String(body.image_url || "");
    const result = await env.DB.prepare(
      "INSERT INTO news (title, content, image_url) VALUES (?, ?, ?)"
    ).bind(title, content, imageUrl).run();
    return json({ success: true, id: result.meta.last_row_id }, 201);
  } catch {
    return json({ success: false, message: "تعذر حفظ الخبر" }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الخبر غير صحيح" }, 400);
    if (!title) return json({ success: false, message: "عنوان الخبر مطلوب" }, 400);
    const result = await env.DB.prepare(
      "UPDATE news SET title = ?, content = ?, image_url = ? WHERE id = ?"
    ).bind(title, String(body.content || ""), String(body.image_url || ""), id).run();
    if (!result.meta.changes) return json({ success: false, message: "الخبر غير موجود" }, 404);
    return json({ success: true });
  } catch {
    return json({ success: false, message: "تعذر تعديل الخبر" }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم الخبر غير صحيح" }, 400);
    const result = await env.DB.prepare("DELETE FROM news WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ success: false, message: "الخبر غير موجود" }, 404);
    return json({ success: true });
  } catch {
    return json({ success: false, message: "تعذر حذف الخبر" }, 500);
  }
}
