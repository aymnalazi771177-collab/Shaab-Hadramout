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
    const allowed = new Map([["image/jpeg",{ext:"jpg",type:"image"}],["image/png",{ext:"png",type:"image"}],["image/webp",{ext:"webp",type:"image"}],["image/gif",{ext:"gif",type:"image"}],["video/mp4",{ext:"mp4",type:"video"}],["video/webm",{ext:"webm",type:"video"}],["video/quicktime",{ext:"mov",type:"video"}]]);
    const uploaded = [];
    for (const file of files) {
      const info = allowed.get(file.type);
      if (!info) return json({ success: false, message: "الصيغ المدعومة للصور: JPG وPNG وWEBP وGIF، وللفيديو: MP4 وWEBM وMOV" }, 415);
      const limit = info.type === "video" ? 50 * 1024 * 1024 : 8 * 1024 * 1024;
      if (file.size > limit) return json({ success: false, message: info.type === "video" ? "حجم كل فيديو يجب ألا يتجاوز 50 ميجابايت" : "حجم كل صورة يجب ألا يتجاوز 8 ميجابايت" }, 413);
      const key = `${crypto.randomUUID()}.${info.ext}`;
      const bytes = await file.arrayBuffer();
      await env.NEWS_MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
      uploaded.push({ url: new URL("/api/media/" + key, request.url).href, key, media_type: info.type, name: String(file.name || "") });
    }
    return json({ success: true, media: uploaded, images: uploaded.filter(item => item.media_type === "image") });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UploadError";
    const rawDetail = error instanceof Error ? error.message : String(error);
    const detail = rawDetail.replace(/Bearer\\s+\\S+/gi, "Bearer [hidden]").replace(/(token|secret|authorization)\\s*[:=]\\s*\\S+/gi, "$1=[hidden]").slice(0, 240);
    console.error("R2 media upload failed:", errorName, detail);
    return json({ success: false, message: "تعذر حفظ الصورة في مساحة التخزين.", detail: errorName + ": " + detail }, 500);
  }
}
