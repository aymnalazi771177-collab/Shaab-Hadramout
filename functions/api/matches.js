import {isAuthorized} from "../_auth.js";
import {sendClubPush} from "../_push.js";
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
    played_players_json TEXT DEFAULT '[]',
    finished_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(matches)").all();
  const existing = new Set((columns.results || []).map(column => column.name));
  if (!existing.has("formation")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN formation TEXT DEFAULT ''").run();
  if (!existing.has("lineup_json")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN lineup_json TEXT DEFAULT '[]'").run();
  if (!existing.has("played_players_json")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN played_players_json TEXT DEFAULT '[]'").run();
  if (!existing.has("finished_at")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN finished_at TEXT DEFAULT NULL").run();
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
  const validSlots = new Set(["gk","rb","rcb","cb","lcb","lb","rdm","dm","ldm","rm","cm","lm","am","rw","ss","st","lw"]);
  const normalized = lineup.map(value => typeof value === "object" && value !== null ? {id:Number(value.id),slot:validSlots.has(String(value.slot||""))?String(value.slot):"cm"} : {id:Number(value),slot:"cm"}).filter(value => Number.isInteger(value.id) && value.id > 0);
  lineup = normalized.filter((value,index) => normalized.findIndex(item => item.id === value.id) === index);
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
  let playedPlayers = [];
  try { playedPlayers = Array.isArray(body.played_players) ? body.played_players : JSON.parse(body.played_players_json || "[]"); } catch { return { error: "قائمة اللاعبين المشاركين غير صحيحة" }; }
  if (!Array.isArray(playedPlayers) || playedPlayers.length > 30) return { error: "قائمة المشاركين لا تتجاوز 30 لاعباً" };
  playedPlayers = [...new Set(playedPlayers.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  return { opponent, opponent_logo_url, home_logo_url, match_date, match_time, venue, competition, is_home, status, home_score, away_score, notes, formation, lineup_json: JSON.stringify(lineup), played_players_json: JSON.stringify(playedPlayers) };
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
    const result = await env.DB.prepare("INSERT INTO matches (opponent, opponent_logo_url, home_logo_url, match_date, match_time, venue, competition, is_home, status, home_score, away_score, notes, formation, lineup_json, played_players_json, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'finished' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END)").bind(data.opponent, data.opponent_logo_url, data.home_logo_url, data.match_date, data.match_time, data.venue, data.competition, data.is_home, data.status, data.home_score, data.away_score, data.notes, data.formation, data.lineup_json, data.played_players_json, data.status).run();
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
    const previous = await env.DB.prepare("SELECT opponent,status,home_score,away_score FROM matches WHERE id=?").bind(id).first();
    if (!previous) return json({ success: false, message: "المباراة غير موجودة" }, 404);
    const result = await env.DB.prepare("UPDATE matches SET opponent=?, opponent_logo_url=?, home_logo_url=?, match_date=?, match_time=?, venue=?, competition=?, is_home=?, status=?, home_score=?, away_score=?, notes=?, formation=?, lineup_json=?, played_players_json=?, finished_at=CASE WHEN ? = 'finished' THEN COALESCE(finished_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(data.opponent, data.opponent_logo_url, data.home_logo_url, data.match_date, data.match_time, data.venue, data.competition, data.is_home, data.status, data.home_score, data.away_score, data.notes, data.formation, data.lineup_json, data.played_players_json, data.status, id).run();
    if (!result.meta.changes) return json({ success: false, message: "المباراة غير موجودة" }, 404);
    const scoreChanged = previous.home_score !== data.home_score || previous.away_score !== data.away_score;
    if (data.status === "live" && (previous.status !== "live" || scoreChanged)) {
      const body = previous.status !== "live" ? "بدأت الآن مباراة شعب حضرموت أمام " + data.opponent : "تغيرت النتيجة: " + data.home_score + " - " + data.away_score;
      await sendClubPush(env, "matches", {title:"تنبيه مباراة شعب حضرموت",body,url:"./"});
    } else if (data.status === "finished" && previous.status !== "finished") {
      await sendClubPush(env, "matches", {title:"انتهت مباراة شعب حضرموت",body:data.opponent + " — النتيجة " + (data.is_home ? data.home_score + " - " + data.away_score : data.away_score + " - " + data.home_score),url:"/"});
    }
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
