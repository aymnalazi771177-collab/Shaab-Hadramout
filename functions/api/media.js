function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization" } });
}
function authorized(request, env) {
  return Boolean(env.ADMIN_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization" } });
}
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, message: "غير مصرح" }, 401);
  if (!env.NEWS_MEDIA) return json({ success: false, message: "مساحة تخزين الصور غير مربوطة بعد. يلزم إعداد R2 مرة واحدة." }, 503);
  try {
    const form = await request.formData();
    const files = form.getAll("images").filter(item => item && typeof item.arrayBuffer === "function");
    if (!files.length) return json({ success: false, message: "اختر صورة واحدة على الأقل" }, 400);
    if (files.length > 20) return json({ success: false, message: "الحد الأقصى 20 صورة في المرة الواحدة" }, 400);
    const allowed = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["image/gif","gif"]]);
    const uploaded = [];
    for (const file of files) {
      const ext = allowed.get(file.type);
      if (!ext) return json({ success: false, message: "الصيغ المدعومة: JPG وPNG وWEBP وGIF" }, 415);
      if (file.size > 8 * 1024 * 1024) return json({ success: false, message: "حجم كل صورة يجب ألا يتجاوز 8 ميجابايت" }, 413);
      const key = `${crypto.randomUUID()}.${ext}`;
      const bytes = await file.arrayBuffer();
      await env.NEWS_MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
      uploaded.push({ url: new URL("/api/media/" + key, request.url).href, key });
    }
    return json({ success: true, images: uploaded });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UploadError";
    const rawDetail = error instanceof Error ? error.message : String(error);
    const detail = rawDetail.replace(/Bearer\\s+\\S+/gi, "Bearer [hidden]").replace(/(token|secret|authorization)\\s*[:=]\\s*\\S+/gi, "$1=[hidden]").slice(0, 240);
    console.error("R2 media upload failed:", errorName, detail);
    return json({ success: false, message: "تعذر حفظ الصورة في مساحة التخزين.", detail: errorName + ": " + detail }, 500);
  }
}
