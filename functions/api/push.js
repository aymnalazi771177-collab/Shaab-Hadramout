import {sendClubPush} from "../_push.js";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>Response.json(data,{status,headers});
async function ensure(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY,p256dh TEXT NOT NULL,auth TEXT NOT NULL,match_enabled INTEGER NOT NULL DEFAULT 0,news_enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
}
const enabled=value=>value===true||value===1||value==="1";
export async function onRequestOptions(){return new Response(null,{status:204,headers});}
export async function onRequestGet({request,env}){
  try{
    await ensure(env);
    const endpoint=new URL(request.url).searchParams.get("endpoint");
    let preferences={matches:false,news:false};
    if(endpoint){
      const row=await env.DB.prepare("SELECT match_enabled,news_enabled FROM push_subscriptions WHERE endpoint=?").bind(endpoint).first();
      if(row)preferences={matches:!!row.match_enabled,news:!!row.news_enabled};
    }
    return json({success:true,publicKey:env.VAPID_PUBLIC_KEY||"",preferences});
  }catch(error){console.error("Push settings GET failed",error);return json({success:false,message:"تعذر تحميل إعدادات التنبيهات"},500);}
}
export async function onRequestPost({request,env}){
  try{
    await ensure(env);
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_JWK)return json({success:false,message:"خدمة التنبيهات غير مكتملة الإعداد"},503);
    const body=await request.json(),sub=body.subscription||{},keys=sub.keys||{};
    const endpoint=String(sub.endpoint||"").trim(),p256dh=String(keys.p256dh||""),auth=String(keys.auth||"");
    if(!endpoint.startsWith("https://")||!p256dh||!auth)return json({success:false,message:"بيانات الاشتراك غير صحيحة"},400);
    const prefs=body.preferences||{};
    await env.DB.prepare("INSERT INTO push_subscriptions(endpoint,p256dh,auth,match_enabled,news_enabled) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,match_enabled=excluded.match_enabled,news_enabled=excluded.news_enabled,updated_at=CURRENT_TIMESTAMP")
      .bind(endpoint,p256dh,auth,enabled(prefs.matches)?1:0,enabled(prefs.news)?1:0).run();
    return json({success:true});
  }catch(error){console.error("Push subscription POST failed",error);return json({success:false,message:"تعذر تفعيل التنبيهات"},500);}
}
export async function onRequestPut({request,env}){
  try{
    await ensure(env);
    const body=await request.json(),endpoint=String(body.endpoint||"").trim(),prefs=body.preferences||{};
    if(!endpoint.startsWith("https://"))return json({success:false,message:"الاشتراك غير صحيح"},400);
    const result=await env.DB.prepare("UPDATE push_subscriptions SET match_enabled=?,news_enabled=?,updated_at=CURRENT_TIMESTAMP WHERE endpoint=?")
      .bind(enabled(prefs.matches)?1:0,enabled(prefs.news)?1:0,endpoint).run();
    if(!result.meta.changes)return json({success:false,message:"الاشتراك غير موجود"},404);
    return json({success:true});
  }catch(error){console.error("Push preferences PUT failed",error);return json({success:false,message:"تعذر حفظ إعدادات التنبيهات"},500);}
}
export async function onRequestDelete({request,env}){
  try{
    await ensure(env);
    const body=await request.json().catch(()=>({})),endpoint=String(body.endpoint||"").trim();
    if(!endpoint)return json({success:false,message:"الاشتراك غير صحيح"},400);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(endpoint).run();
    return json({success:true});
  }catch(error){console.error("Push subscription DELETE failed",error);return json({success:false,message:"تعذر إلغاء التنبيهات"},500);}
}
