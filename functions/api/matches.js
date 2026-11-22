import {isAuthorized} from "../_auth.js";
function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }});
}
async function ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fan_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    fan_id INTEGER NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('win','draw','loss')),
    points INTEGER NOT NULL DEFAULT 0,
    settled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(match_id, fan_id)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opponent TEXT NOT NULL,
    opponent_logo_url TEXT DEFAULT '',
    home_logo_url TEXT DEFAULT '',
    match_date TEXT NOT NULL,
    match_time TEXT DEFAULT '',
    venue TEXT DEFAULT '',
    competition TEXT DEFAULT '',
    is_home INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'upcoming',
    home_score INTEGER,
    away_score INTEGER,
    notes TEXT DEFAULT '',
    formation TEXT DEFAULT '',
    lineup_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(matches)").all();
  const existing = new Set((columns.results || []).map(column => column.name));
  if (!existing.has("formation")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN formation TEXT DEFAULT ''").run();
  if (!existing.has("lineup_json")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN lineup_json TEXT DEFAULT '[]'").run();
}
const statuses = ["upcoming", "live", "finished", "postponed", "cancelled"];
function clean(body) {
  const opponent = String(body.opponent || "").trim();
  const match_date = String(body.match_date || "").trim();
  const match_time = String(body.match_time || "").trim();
  const venue = String(body.venue || "").trim();
  const competition = String(body.competition || "").trim();
  const status = String(body.status || "upcoming").trim();
  const notes = String(body.notes || "").trim();
  const formation = String(body.formation || "").trim().slice(0, 20);
  let lineup = [];
  try { lineup = Array.isArray(body.lineup) ? body.lineup : JSON.parse(body.lineup_json || "[]"); } catch { return { error: "بيانات التشكيلة غير صحيحة" }; }
  if (!Array.isArray(lineup) || lineup.length > 11) return { error: "يجب ألا تتجاوز التشكيلة 11 لاعباً" };
  lineup = [...new Set(lineup.map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))];
  const is_home = body.is_home === false || body.is_home === "0" || body.is_home === "away" ? 0 : 1;
  const home_score = body.home_score === "" || body.home_score == null ? null : Number(body.home_score);
  const away_score = body.away_score === "" || body.away_score == null ? null : Number(body.away_score);
  const opponent_logo_url = String(body.opponent_logo_url || "").trim();
  const home_logo_url = String(body.home_logo_url || "").trim();
  if (!opponent) return { error: "اسم الفريق المنافس مطلوب" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match_date)) return { error: "تاريخ المباراة غير صحيح" };
  if (match_time && !/^\d{2}:\d{2}$/.test(match_time)) return { error: "وقت المباراة غير صحيح" };
  if (!statuses.includes(status)) return { error: "حالة المباراة غير صحيحة" };
  if (home_score !== null && (!Number.isInteger(home_score) || home_score < 0 || home_score > 99)) return { error: "نتيجة شعب حضرموت غير صحيحة" };
  if (away_score !== null && (!Number.isInteger(away_score) || away_score < 0 || away_score > 99)) return { error: "نتيجة الفريق المنافس غير صحيحة" };
  for (const value of [opponent_logo_url, home_logo_url]) {
    if (!value) continue;
    if (value.startsWith("/api/media/")) continue;
    try { const parsed = new URL(value); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
    catch { return { error: "رابط الشعار غير صحيح" }; }
  }
  return { opponent, opponent_logo_url, home_logo_url, match_date, match_time, venue, competition, is_home, status, home_score, away_score, notes, formation, lineup_json: JSON.stringify(lineup) };
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
    const { results } = await env.DB.prepare("SELECT * FROM matches ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'finished' THEN 2 WHEN 'postponed' THEN 3 ELSE 4 END, CASE WHEN status IN ('upcoming','live') THEN match_date END ASC, CASE WHEN status='finished' THEN match_date END DESC, id DESC").all();
    return json({ success: true, matches: results });
  } catch (error) {
    console.error("Matches GET failed", error);
    return json({ success: false, message: "تعذر جلب المباريات" }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env, "matches")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const data = clean(await request.json());
    if (data.error) return json({ success: false, message: data.error }, 400);
    const result = await env.DB.prepare("INSERT INTO matches (opponent, opponent_logo_url, home_logo_url, match_date, match_time, venue, competition, is_home, status, home_score, away_score, notes, formation, lineup_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(data.opponent, data.opponent_logo_url, data.home_logo_url, data.match_date, data.match_time, data.venue, data.competition, data.is_home, data.status, data.home_score, data.away_score, data.notes, data.formation, data.lineup_json).run();
    return json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error) {
    console.error("Matches POST failed", error);
    return json({ success: false, message: "تعذر حفظ المباراة" }, 500);
  }
}
export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env, "matches")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم المباراة غير صحيح" }, 400);
    const data = clean(await request.json());
    if (data.error) return json({ success: false, message: data.error }, 400);
    const result = await env.DB.prepare("UPDATE matches SET opponent=?, opponent_logo_url=?, home_logo_url=?, match_date=?, match_time=?, venue=?, competition=?, is_home=?, status=?, home_score=?, away_score=?, notes=?, formation=?, lineup_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(data.opponent, data.opponent_logo_url, data.home_logo_url, data.match_date, data.match_time, data.venue, data.competition, data.is_home, data.status, data.home_score, data.away_score, data.notes, data.formation, data.lineup_json, id).run();
    if (!result.meta.changes) return json({ success: false, message: "المباراة غير موجودة" }, 404);
    if (data.status === "finished" && data.home_score !== null && data.away_score !== null) {
      const clubScore = data.is_home ? data.home_score : data.away_score;
      const opponentScore = data.is_home ? data.away_score : data.home_score;
      const outcome = clubScore > opponentScore ? "win" : clubScore < opponentScore ? "loss" : "draw";
      await env.DB.prepare("UPDATE fan_predictions SET points=CASE WHEN choice=? THEN 3 ELSE 0 END, settled=1, updated_at=CURRENT_TIMESTAMP WHERE match_id=?")
        .bind(outcome, id).run();
    }
    return json({ success: true });
  } catch (error) {
    console.error("Matches PUT failed", error);
    return json({ success: false, message: "تعذر تعديل المباراة" }, 500);
  }
}
export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env, "matches")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم المباراة غير صحيح" }, 400);
    const result = await env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ success: false, message: "المباراة غير موجودة" }, 404);
    return json({ success: true });
  } catch (error) {
    console.error("Matches DELETE failed", error);
    return json({ success: false, message: "تعذر حذف المباراة" }, 500);
  }
}
