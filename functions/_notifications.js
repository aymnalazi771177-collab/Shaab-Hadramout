export async function ensureClubNotifications(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  const columns = await env.DB.prepare("PRAGMA table_info(club_notifications)").all();
  const names = new Set((columns.results || []).map(column => column.name));
  if (!names.has("type")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'general'").run();
  if (!names.has("reference_id")) await env.DB.prepare("ALTER TABLE club_notifications ADD COLUMN reference_id INTEGER").run();
}
export async function recordClubNotification(env, {title, body, type = "general", referenceId = null}) {
  await ensureClubNotifications(env);
  const result = await env.DB.prepare("INSERT INTO club_notifications (title, body, type, reference_id) VALUES (?, ?, ?, ?)").bind(
    String(title || "تنبيه النادي").slice(0, 160),
    String(body || "").slice(0, 1500),
    String(type || "general").slice(0, 24),
    Number.isInteger(Number(referenceId)) && Number(referenceId) > 0 ? Number(referenceId) : null
  ).run();
  return result.meta.last_row_id;
}
