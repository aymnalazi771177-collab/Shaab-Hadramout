import {isAuthorized} from "../_auth.js";
function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  }});
}
async function ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, position TEXT NOT NULL,
    number TEXT DEFAULT '', image_url TEXT DEFAULT '', nationality TEXT DEFAULT 'يمني',
    age INTEGER DEFAULT 0, height TEXT DEFAULT '', matches INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0, saves INTEGER DEFAULT 0, goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0, tackles INTEGER DEFAULT 0, readiness INTEGER DEFAULT 90,
    bio TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(players)").all();
  const existing = new Set((columns.results || []).map(column => column.name));
  const additions = [
    ["nationality", "TEXT DEFAULT 'يمني'"], ["age", "INTEGER DEFAULT 0"], ["height", "TEXT DEFAULT ''"],
    ["matches", "INTEGER DEFAULT 0"], ["clean_sheets", "INTEGER DEFAULT 0"], ["saves", "INTEGER DEFAULT 0"],
    ["goals", "INTEGER DEFAULT 0"], ["assists", "INTEGER DEFAULT 0"], ["tackles", "INTEGER DEFAULT 0"],
    ["readiness", "INTEGER DEFAULT 90"], ["bio", "TEXT DEFAULT ''"]
  ];
  for (const [name, definition] of additions) {
    if (!existing.has(name)) await env.DB.prepare(`ALTER TABLE players ADD COLUMN ${name} ${definition}`).run();
  }
}
const positions = ["حراس المرمى", "الدفاع", "الوسط", "الهجوم", "المدرب"];
function clean(body) {
  const name = String(body.name || "").trim();
  const position = String(body.position || "").trim();
  const number = String(body.number || "").trim();
  const imageUrl = String(body.image_url || "").trim();
  const numeric = name => {
    const value = body[name] === "" || body[name] === null || body[name] === undefined ? 0 : Number(body[name]);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
  };
  const nationality = String(body.nationality || "يمني").trim().slice(0, 60);
  const age = numeric("age"), matches = numeric("matches"), clean_sheets = numeric("clean_sheets");
  const saves = numeric("saves"), goals = numeric("goals"), assists = numeric("assists");
  const tackles = numeric("tackles"), readiness = body.readiness === undefined || body.readiness === "" ? 90 : Math.min(100, numeric("readiness"));
  const height = String(body.height || "").trim().slice(0, 30);
  const bio = String(body.bio || "").trim().slice(0, 2000);
  if (!name) return { error: "اسم اللاعب مطلوب" };
  if (!positions.includes(position)) return { error: "المركز غير صحيح" };
  if (number.length > 8) return { error: "رقم القميص غير صحيح" };
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch { return { error: "رابط الصورة غير صحيح" }; }
  }
  return { name, position, number, image_url: imageUrl, nationality, age, height, matches, clean_sheets, saves, goals, assists, tackles, readiness, bio };
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
    const { results } = await env.DB.prepare("SELECT id, name, position, number, image_url, nationality, age, height, matches, clean_sheets, saves, goals, assists, tackles, readiness, bio, created_at, updated_at FROM players ORDER BY CASE position WHEN 'المدرب' THEN 5 WHEN 'حراس المرمى' THEN 1 WHEN 'الدفاع' THEN 2 WHEN 'الوسط' THEN 3 WHEN 'الهجوم' THEN 4 ELSE 6 END, CAST(number AS INTEGER), id").all();
    return json({ success: true, players: results });
  } catch {
    return json({ success: false, message: "تعذر جلب بيانات الفريق" }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env, "team")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const data = clean(await request.json());
    if (data.error) return json({ success: false, message: data.error }, 400);
    const result = await env.DB.prepare("INSERT INTO players (name, position, number, image_url, nationality, age, height, matches, clean_sheets, saves, goals, assists, tackles, readiness, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(data.name, data.position, data.number, data.image_url, data.nationality, data.age, data.height, data.matches, data.clean_sheets, data.saves, data.goals, data.assists, data.tackles, data.readiness, data.bio).run();
    return json({ success: true, id: result.meta.last_row_id }, 201);
  } catch {
    return json({ success: false, message: "تعذر حفظ بيانات اللاعب" }, 500);
  }
}
export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env, "team")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم اللاعب غير صحيح" }, 400);
    const data = clean(await request.json());
    if (data.error) return json({ success: false, message: data.error }, 400);
    const result = await env.DB.prepare("UPDATE players SET name = ?, position = ?, number = ?, image_url = ?, nationality = ?, age = ?, height = ?, matches = ?, clean_sheets = ?, saves = ?, goals = ?, assists = ?, tackles = ?, readiness = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(data.name, data.position, data.number, data.image_url, data.nationality, data.age, data.height, data.matches, data.clean_sheets, data.saves, data.goals, data.assists, data.tackles, data.readiness, data.bio, id).run();
    if (!result.meta.changes) return json({ success: false, message: "اللاعب غير موجود" }, 404);
    return json({ success: true });
  } catch {
    return json({ success: false, message: "تعذر تعديل بيانات اللاعب" }, 500);
  }
}
export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env, "team")) return json({ success: false, message: "غير مصرح" }, 401);
  try {
    await ensureTable(env);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return json({ success: false, message: "رقم اللاعب غير صحيح" }, 400);
    const result = await env.DB.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ success: false, message: "اللاعب غير موجود" }, 404);
    return json({ success: true });
  } catch {
    return json({ success: false, message: "تعذر حذف اللاعب" }, 500);
  }
}
