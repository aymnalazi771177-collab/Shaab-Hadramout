import { isAuthorized } from "../_auth.js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return Response.json(data, { status, headers });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers });
}

export async function onRequestGet({ request, env }) {
  if (!await isAuthorized(request, env, "admins")) {
    return json({ success: false, message: "غير مصرح بعرض إحصائيات التخزين" }, 401);
  }
  if (!env.NEWS_MEDIA) {
    return json({ success: false, message: "مساحة تخزين R2 غير مربوطة باسم NEWS_MEDIA" }, 503);
  }

  try {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const result = await env.NEWS_MEDIA.list({
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });
    const objects = result.objects || [];
    const bytes = objects.reduce((sum, object) => sum + Number(object.size || 0), 0);

    return json({
      success: true,
      bytes,
      objects: objects.length,
      nextCursor: result.truncated ? (result.cursor || null) : null,
      complete: !result.truncated,
      measuredAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("R2 storage usage read failed:", error);
    return json({ success: false, message: "تعذر قراءة إحصائيات مساحة التخزين" }, 500);
  }
}
