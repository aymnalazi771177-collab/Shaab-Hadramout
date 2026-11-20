export async function onRequestGet({ params, env }) {
  if (!env.NEWS_MEDIA) return new Response("Media storage is not configured", { status: 503 });
  const key = String(params.key || "");
  if (!key.startsWith("news/") || key.includes("..")) return new Response("Not found", { status: 404 });
  const object = await env.NEWS_MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
