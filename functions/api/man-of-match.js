import { isAuthorized, tokenHash } from "../_auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });

async function ensureTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS man_of_match_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    fan_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(match_id, fan_id)
  )`).run();
  const matchColumns = await env.DB.prepare("PRAGMA table_info(matches)").all();
  const names = new Set((matchColumns.results || []).map(x => x.name));
  if (!names.has("played_players_json")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN played_players_json TEXT DEFAULT '[]'").run();
  if (!names.has("finished_at")) await env.DB.prepare("ALTER TABLE matches ADD COLUMN finished_at TEXT DEFAULT NULL").run();
}
async function currentFan(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT f.id,f.active,s.expires_at FROM fan_sessions s
    JOIN fans f ON f.id=s.fan_id WHERE s.token_hash=? LIMIT 1`)
    .bind(await tokenHash(token)).first();
  return row && row.active && Date.parse(row.expires_at) > Date.now() ? row : null;
}
function participantIds(match) {
  try {
    const values = JSON.parse(match.played_players_json || "[]");
    return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(x => Number.isInteger(x) && x > 0))];
  } catch { return []; }
}
async function getPoll(env, match, fan, admin = false) {
  const ids = participantIds(match);
  let players = [];
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    const rows = await env.DB.prepare(`SELECT id,name,number,image_url FROM players WHERE position <> 'المدرب' AND id IN (${marks}) ORDER BY CAST(number AS INTEGER),id`).bind(...ids).all();
    players = rows.results || [];
  }
  const countsRows = await env.DB.prepare("SELECT player_id,COUNT(*) AS votes FROM man_of_match_votes WHERE match_id=? GROUP BY player_id").bind(match.id).all();
  const counts = new Map((countsRows.results || []).map(x => [Number(x.player_id), Number(x.votes)]));
  const totalVotes = [...counts.values()].reduce((a,b) => a+b, 0);
  const finishMs = match.finished_at ? Date.parse(match.finished_at) : NaN;
  const endsAt = Number.isFinite(finishMs) ? finishMs + 24 * 60 * 60 * 1000 : null;
  const opened = match.status === "finished" && Number.isFinite(finishMs);
  const closed = opened && Date.now() >= endsAt;
  let myVote = null;
  if (fan) {
    myVote = await env.DB.prepare("SELECT player_id FROM man_of_match_votes WHERE match_id=? AND fan_id=?").bind(match.id, fan.id).first();
  }
  let winner = null;
  if (closed && players.length) {
    const ranked = players.map(p => ({...p, votes: counts.get(Number(p.id)) || 0})).sort((a,b) => b.votes-a.votes);
    if (ranked[0].votes > 0) winner = ranked.filter(p => p.votes === ranked[0].votes);
  }
  return {
    success: true,
    matchId: Number(match.id),
    status: opened ? (closed ? "closed" : "open") : "not_open",
    opensAt: match.finished_at || null,
    closesAt: endsAt ? new Date(endsAt).toISOString() : null,
    players: players.map(p => ({...p, votes: (closed || admin) ? (counts.get(Number(p.id)) || 0) : null})),
    totalVotes: (closed || admin) ? totalVotes : null,
    myVote: myVote ? Number(myVote.player_id) : null,
    winner: winner ? winner.map(p => ({id:p.id,name:p.name,image_url:p.image_url,votes:p.votes})) : null,
    canVote: opened && !closed && !!fan && !myVote && players.length > 0
  };
}
export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS }); }
export async function onRequestGet({ request, env }) {
  try {
    await ensureTables(env);
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("match_id"));
    if (!Number.isInteger(id) || id < 1) return json({success:false,message:"رقم المباراة غير صحيح"},400);
    const match = await env.DB.prepare("SELECT id,status,played_players_json,finished_at FROM matches WHERE id=?").bind(id).first();
    if (!match) return json({success:false,message:"المباراة غير موجودة"},404);
    const admin = url.searchParams.get("admin") === "1" && await isAuthorized(request, env, "matches");
    const fan = await currentFan(request, env);
    return json(await getPoll(env, match, fan, admin));
  } catch (error) {
    console.error("Man of match GET failed", error);
    return json({success:false,message:"تعذر تحميل تصويت رجل المباراة"},500);
  }
}
export async function onRequestPost({ request, env }) {
  try {
    await ensureTables(env);
    const fan = await currentFan(request, env);
    if (!fan) return json({success:false,message:"سجّل الدخول بحساب جمهور النادي للتصويت"},401);
    const body = await request.json();
    const matchId = Number(body.match_id), playerId = Number(body.player_id);
    if (!Number.isInteger(matchId) || matchId < 1 || !Number.isInteger(playerId) || playerId < 1) return json({success:false,message:"اختر لاعباً صحيحاً"},400);
    const match = await env.DB.prepare("SELECT id,status,played_players_json,finished_at FROM matches WHERE id=?").bind(matchId).first();
    if (!match || match.status !== "finished" || !match.finished_at) return json({success:false,message:"التصويت لم يفتح لهذه المباراة بعد"},400);
    const end = Date.parse(match.finished_at) + 24 * 60 * 60 * 1000;
    if (!Number.isFinite(end) || Date.now() >= end) return json({success:false,message:"انتهت مدة التصويت لرجل المباراة"},400);
    if (!participantIds(match).includes(playerId)) return json({success:false,message:"يمكن التصويت للاعبين المشاركين في المباراة فقط"},400);
    const player = await env.DB.prepare("SELECT id FROM players WHERE id=? AND position <> 'المدرب'").bind(playerId).first();
    if (!player) return json({success:false,message:"اللاعب غير موجود"},404);
    try {
      await env.DB.prepare("INSERT INTO man_of_match_votes(match_id,fan_id,player_id) VALUES(?,?,?)").bind(matchId,fan.id,playerId).run();
    } catch (error) {
      const existing = await env.DB.prepare("SELECT player_id FROM man_of_match_votes WHERE match_id=? AND fan_id=?").bind(matchId,fan.id).first();
      if (existing) return json({success:false,message:"سبق أن صوّت لهذه المباراة، ولا يمكن تغيير التصويت"},409);
      throw error;
    }
    return json({success:true,message:"تم تسجيل صوتك بنجاح، شكراً لمشاركتك"});
  } catch (error) {
    console.error("Man of match POST failed", error);
    return json({success:false,message:"تعذر تسجيل التصويت حالياً"},500);
  }
}
