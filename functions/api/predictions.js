import { tokenHash } from "../_auth.js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
const json = (data, status=200) => Response.json(data,{status,headers});
const clean = v => String(v ?? "").trim();

async function ensure(env) {
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
}
async function currentFan(request,env) {
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return null;
  const row=await env.DB.prepare(`SELECT f.id,f.active,f.phone,s.expires_at FROM fan_sessions s JOIN fans f ON f.id=s.fan_id WHERE s.token_hash=? LIMIT 1`)
    .bind(await tokenHash(token)).first();
  return row && row.active && row.phone && Date.parse(row.expires_at)>Date.now() ? row : null;
}
export async function onRequestOptions(){return new Response(null,{status:204,headers});}
export async function onRequestGet({request,env}) {
  try {
    await ensure(env);
    const url=new URL(request.url);
    const matchId=Number(url.searchParams.get("match_id")||0);
    const session=await currentFan(request,env);
    let myPrediction=null;
    if(session && matchId) {
      myPrediction=await env.DB.prepare("SELECT choice,points,settled FROM fan_predictions WHERE match_id=? AND fan_id=?")
        .bind(matchId,session.id).first();
    }
    const {results:leaderboard}=await env.DB.prepare(`SELECT f.id,f.full_name,COALESCE(SUM(p.points),0) AS points
      FROM fans f LEFT JOIN fan_predictions p ON p.fan_id=f.id AND p.settled=1
      WHERE f.active=1 AND f.phone IS NOT NULL
      GROUP BY f.id,f.full_name
      ORDER BY points DESC,f.full_name COLLATE NOCASE ASC LIMIT 30`).all();
    return json({success:true,myPrediction,leaderboard});
  } catch(e) {
    console.error("Predictions GET failed",e);
    return json({success:false,message:"تعذر تحميل التوقعات"},500);
  }
}
export async function onRequestPost({request,env}) {
  try {
    await ensure(env);
    const fan=await currentFan(request,env);
    if(!fan) return json({success:false,message:"سجل الدخول إلى حساب جمهور النادي أولاً"},401);
    const body=await request.json();
    const matchId=Number(body.match_id),choice=clean(body.choice);
    if(!Number.isInteger(matchId)||matchId<1||!["win","draw","loss"].includes(choice)) return json({success:false,message:"اختر توقعاً صحيحاً"},400);
    const match=await env.DB.prepare("SELECT id,match_date,match_time,status FROM matches WHERE id=?").bind(matchId).first();
    if(!match||match.status!=="upcoming") return json({success:false,message:"التوقع لهذه المباراة غير متاح"},400);
    const cutoff=Date.parse(match.match_date+"T"+(match.match_time||"00:00")+":00+03:00");
    if(!Number.isFinite(cutoff)||Date.now()>=cutoff) return json({success:false,message:"انتهى وقت التوقع لهذه المباراة"},400);
    await env.DB.prepare(`INSERT INTO fan_predictions(match_id,fan_id,choice) VALUES(?,?,?)
      ON CONFLICT(match_id,fan_id) DO UPDATE SET choice=excluded.choice,updated_at=CURRENT_TIMESTAMP WHERE settled=0`)
      .bind(matchId,fan.id,choice).run();
    const saved=await env.DB.prepare("SELECT choice,points,settled FROM fan_predictions WHERE match_id=? AND fan_id=?").bind(matchId,fan.id).first();
    return json({success:true,myPrediction:saved,message:"تم حفظ توقعك"});
  } catch(e) {
    console.error("Predictions POST failed",e);
    return json({success:false,message:"تعذر حفظ التوقع حالياً"},500);
  }
}
