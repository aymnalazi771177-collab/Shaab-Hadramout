export async function ensureClubNotifications(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  const columns = await env.DB.prepare("PRAGMA table_info(club_notifications)").all();
  const names = new Set((columns.results || []).map(column => column.name));
  if (!names.has("type")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'general'").run();
  if (!names.has("reference_id")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN reference_id INTEGER").run();
  if (!names.has("audience")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN audience TEXT NOT NULL DEFAULT 'all'").run();
  if (!names.has("app_version")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN app_version TEXT").run();
  if (!names.has("details_json")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN details_json TEXT").run();
  // Keep the in-app notification bell limited to the most recent seven days.
  await env.DB.prepare("DELETE FROM club_notifications WHERE datetime(created_at) < datetime('now', '-7 days')").run();
}
export async function recordClubNotification(env, {title, body, type = "general", referenceId = null, audience = "all", appVersion = ""}) {
  await ensureClubNotifications(env);
  const result = await env.DB.prepare("INSERT INTO club_notifications (title, body, type, reference_id, audience, app_version) VALUES (?, ?, ?, ?, ?, ?)").bind(
    String(title || "تنبيه النادي").slice(0, 160),
    String(body || "").slice(0, 1500),
    String(type || "general").slice(0, 24),
    Number.isInteger(Number(referenceId)) && Number(referenceId) > 0 ? Number(referenceId) : null,
    ["all", "members", "visitors"].includes(audience) ? audience : "all",
    String(appVersion || "").slice(0, 40) || null
  ).run();
  return result.meta.last_row_id;
}
