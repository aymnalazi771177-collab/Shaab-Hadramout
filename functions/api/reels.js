import {isAuthorized} from "../_auth.js";
import {deleteMediaIfUnreferenced} from "../_media_cleanup.js";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization"};
const json=(data,status=200)=>Response.json(data,{status,headers});
async function ensure(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_reels(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,caption TEXT DEFAULT '',media_url TEXT NOT NULL,media_type TEXT NOT NULL DEFAULT 'video',media_key TEXT DEFAULT '',thumbnail_url TEXT DEFAULT '',thumbnail_key TEXT DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_reel_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,legacy_reel_id INTEGER UNIQUE,title TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_reel_items(id INTEGER PRIMARY KEY AUTOINCREMENT,legacy_reel_id INTEGER UNIQUE,group_id INTEGER NOT NULL,caption TEXT DEFAULT '',media_url TEXT NOT NULL,media_type TEXT NOT NULL DEFAULT 'video',media_key TEXT DEFAULT '',thumbnail_url TEXT DEFAULT '',thumbnail_key TEXT DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(group_id) REFERENCES club_reel_groups(id) ON DELETE CASCADE)`).run();
 await env.DB.prepare(`INSERT OR IGNORE INTO club_reel_groups(legacy_reel_id,title,sort_order,active,created_at,updated_at) SELECT id,title,sort_order,active,created_at,updated_at FROM club_reels`).run();
 await env.DB.prepare(`INSERT OR IGNORE INTO club_reel_items(legacy_reel_id,group_id,caption,media_url,media_type,media_key,thumbnail_url,thumbnail_key,sort_order,created_at,updated_at) SELECT r.id,g.id,r.caption,r.media_url,r.media_type,r.media_key,r.thumbnail_url,r.thumbnail_key,0,r.created_at,r.updated_at FROM club_reels r JOIN club_reel_groups g ON g.legacy_reel_id=r.id`).run();
}
function cleanGroup(b){
 const title=String(b.title||"").trim(),sort_order=Number(b.sort_order||0),active=b.active===false||b.active==="0"?0:1;
 if(!title)return{error:"اسم الريل مطلوب"};if(title.length>180)return{error:"اسم الريل طويل جداً"};
 if(!Number.isInteger(sort_order)||sort_order<0||sort_order>9999)return{error:"ترتيب الظهور غير صحيح"};
 if(!Array.isArray(b.stories)||!b.stories.length)return{error:"أضف حالة واحدة على الأقل داخل الريل"};
 const stories=[];
 for(const s of b.stories){
  const media_url=String(s.media_url||"").trim(),media_type=String(s.media_type||"video").trim(),caption=String(s.caption||"").trim(),media_key=String(s.media_key||"").trim(),thumbnail_url=String(s.thumbnail_url||"").trim(),thumbnail_key=String(s.thumbnail_key||"").trim(),sort=Number(s.sort_order||0);
  if(!media_url)return{error:"كل حالة تحتاج إلى صورة أو فيديو"};
  if(!["video","image"].includes(media_type))return{error:"نوع الحالة غير صحيح"};
  if(caption.length>3000)return{error:"وصف إحدى الحالات طويل جداً"};
  for(const value of [media_url,thumbnail_url]){if(!value)continue;if(value.startsWith("/api/media/"))continue;try{const u=new URL(value);if(!["https:","http:"].includes(u.protocol))throw Error()}catch{return{error:"رابط الوسائط غير صحيح"}}}
  const validKey=/^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/i;
  if((media_key&&!validKey.test(media_key))||(thumbnail_key&&!validKey.test(thumbnail_key)))return{error:"مفتاح ملف غير صحيح"};
  stories.push({id:Number(s.id)||null,caption,media_url,media_type,media_key,thumbnail_url,thumbnail_key,sort_order:sort});
 }
 return{title,sort_order,active,stories};
}
export async function onRequestOptions(){return new Response(null,{status:204,headers})}
export async function onRequestGet({request,env}){
 try{
  await ensure(env);const admin=await isAuthorized(request,env,"reels");
  const groups=await env.DB.prepare("SELECT * FROM club_reel_groups "+(admin?"":"WHERE active=1 ")+"ORDER BY sort_order ASC,id DESC").all();
  const rows=await env.DB.prepare("SELECT i.* FROM club_reel_items i JOIN club_reel_groups g ON g.id=i.group_id "+(admin?"":"WHERE g.active=1 ")+"ORDER BY i.group_id,i.sort_order ASC,i.id ASC").all();
  const byGroup=new Map();for(const item of rows.results||[]){if(!byGroup.has(item.group_id))byGroup.set(item.group_id,[]);byGroup.get(item.group_id).push(item)}
  const reels=(groups.results||[]).map(g=>({...g,stories:byGroup.get(g.id)||[]})).filter(g=>admin||g.stories.length>0);
  return json({success:true,reels});
 }catch(e){console.error("Reels GET",e);return json({success:false,message:"تعذر تحميل الريلز"},500)}
}
export async function onRequestPost({request,env}){
 if(!await isAuthorized(request,env,"reels"))return json({success:false,message:"غير مصرح"},401);
 try{await ensure(env);const d=cleanGroup(await request.json());if(d.error)return json({success:false,message:d.error},400);
  const r=await env.DB.prepare("INSERT INTO club_reel_groups(title,sort_order,active) VALUES(?,?,?)").bind(d.title,d.sort_order,d.active).run();const id=r.meta.last_row_id;
  for(const s of d.stories)await env.DB.prepare("INSERT INTO club_reel_items(group_id,caption,media_url,media_type,media_key,thumbnail_url,thumbnail_key,sort_order) VALUES(?,?,?,?,?,?,?,?)").bind(id,s.caption,s.media_url,s.media_type,s.media_key,s.thumbnail_url,s.thumbnail_key,s.sort_order).run();
  return json({success:true,id},201);
 }catch(e){console.error("Reels POST",e);return json({success:false,message:"تعذر حفظ الريل"},500)}
}
export async function onRequestPut({request,env}){
 if(!await isAuthorized(request,env,"reels"))return json({success:false,message:"غير مصرح"},401);
 try{await ensure(env);const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الريل غير صحيح"},400);
  const d=cleanGroup(await request.json());if(d.error)return json({success:false,message:d.error},400);
  const old=await env.DB.prepare("SELECT id,media_key,media_url,thumbnail_key,thumbnail_url FROM club_reel_items WHERE group_id=?").bind(id).all();const exists=await env.DB.prepare("SELECT id FROM club_reel_groups WHERE id=?").bind(id).first();if(!exists)return json({success:false,message:"الريل غير موجود"},404);
  await env.DB.prepare("UPDATE club_reel_groups SET title=?,sort_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(d.title,d.sort_order,d.active,id).run();
  const kept=new Set(d.stories.filter(s=>s.id).map(s=>s.id));
  for(const item of old.results||[])if(!kept.has(Number(item.id))){await env.DB.prepare("DELETE FROM club_reel_items WHERE id=? AND group_id=?").bind(item.id,id).run();await deleteMediaIfUnreferenced(env,[item.media_key,item.media_url,item.thumbnail_key,item.thumbnail_url])}
  for(const s of d.stories){
   if(s.id){const prior=(old.results||[]).find(x=>Number(x.id)===s.id);if(!prior)continue;await env.DB.prepare("UPDATE club_reel_items SET caption=?,media_url=?,media_type=?,media_key=?,thumbnail_url=?,thumbnail_key=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND group_id=?").bind(s.caption,s.media_url,s.media_type,s.media_key,s.thumbnail_url,s.thumbnail_key,s.sort_order,s.id,id).run();await deleteMediaIfUnreferenced(env,[prior.media_key,prior.media_url,prior.thumbnail_key,prior.thumbnail_url])}
   else await env.DB.prepare("INSERT INTO club_reel_items(group_id,caption,media_url,media_type,media_key,thumbnail_url,thumbnail_key,sort_order) VALUES(?,?,?,?,?,?,?,?)").bind(id,s.caption,s.media_url,s.media_type,s.media_key,s.thumbnail_url,s.thumbnail_key,s.sort_order).run();
  }
  return json({success:true});
 }catch(e){console.error("Reels PUT",e);return json({success:false,message:"تعذر تعديل الريل"},500)}
}
export async function onRequestDelete({request,env}){
 if(!await isAuthorized(request,env,"reels"))return json({success:false,message:"غير مصرح"},401);
 try{await ensure(env);const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الريل غير صحيح"},400);
  const old=await env.DB.prepare("SELECT media_key,media_url,thumbnail_key,thumbnail_url FROM club_reel_items WHERE group_id=?").bind(id).all();const exists=await env.DB.prepare("SELECT id,legacy_reel_id FROM club_reel_groups WHERE id=?").bind(id).first();if(!exists)return json({success:false,message:"الريل غير موجود"},404);
  await env.DB.prepare("DELETE FROM club_reel_items WHERE group_id=?").bind(id).run();await env.DB.prepare("DELETE FROM club_reel_groups WHERE id=?").bind(id).run();
  // Remove the migrated legacy row too, otherwise ensure() would recreate this deleted group on the next request.
  if(exists.legacy_reel_id)await env.DB.prepare("DELETE FROM club_reels WHERE id=?").bind(exists.legacy_reel_id).run();
  for(const item of old.results||[])await deleteMediaIfUnreferenced(env,[item.media_key,item.media_url,item.thumbnail_key,item.thumbnail_url])
  return json({success:true});
 }catch(e){console.error("Reels DELETE",e);return json({success:false,message:"تعذر حذف الريل"},500)}
}
