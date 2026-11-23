import {isAuthorized} from "../_auth.js";

function json(data,status=200){
  return Response.json(data,{status,headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":"Authorization, Content-Type"
  }});
}
async function ensureTable(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_archive_media(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    media_type TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_key TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
function clean(body){
  const title=String(body.title||"").trim();
  const description=String(body.description||"").trim();
  const media_type=String(body.media_type||"").trim();
  const media_url=String(body.media_url||"").trim();
  const media_key=String(body.media_key||"").trim();
  if(!title)return {error:"عنوان المادة مطلوب"};
  if(!["image","video"].includes(media_type))return {error:"نوع المادة غير صحيح"};
  if(!media_url)return {error:"رابط الملف مطلوب"};
  if(title.length>180||description.length>3000)return {error:"بعض البيانات أطول من الحد المسموح"};
  try{const u=new URL(media_url);if(!["https:","http:"].includes(u.protocol))throw Error()}catch{return {error:"رابط الملف غير صحيح"}}
  if(media_key&&!/^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/i.test(media_key))return {error:"مفتاح الملف غير صحيح"};
  return {title,description,media_type,media_url,media_key};
}
export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":"Authorization, Content-Type"
  }});
}
export async function onRequestGet({env}){
  try{
    await ensureTable(env);
    const {results}=await env.DB.prepare("SELECT id,title,description,media_type,media_url,media_key,created_at,updated_at FROM club_archive_media ORDER BY id DESC").all();
    return json({success:true,media:results});
  }catch(error){console.error("Archive GET failed",error);return json({success:false,message:"تعذر تحميل ذاكرة النوارس"},500)}
}
export async function onRequestPost({request,env}){
  if(!await isAuthorized(request,env,"archive"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTable(env);
    const d=clean(await request.json());if(d.error)return json({success:false,message:d.error},400);
    const result=await env.DB.prepare("INSERT INTO club_archive_media(title,description,media_type,media_url,media_key) VALUES(?,?,?,?,?)").bind(d.title,d.description,d.media_type,d.media_url,d.media_key).run();
    return json({success:true,id:result.meta.last_row_id},201);
  }catch(error){console.error("Archive POST failed",error);return json({success:false,message:"تعذر حفظ مادة ذاكرة النوارس"},500)}
}
export async function onRequestPut({request,env}){
  if(!await isAuthorized(request,env,"archive"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTable(env);
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم المادة غير صحيح"},400);
    const d=clean(await request.json());if(d.error)return json({success:false,message:d.error},400);
    const old=await env.DB.prepare("SELECT media_key FROM club_archive_media WHERE id=?").bind(id).first();
    if(!old)return json({success:false,message:"المادة غير موجودة"},404);
    await env.DB.prepare("UPDATE club_archive_media SET title=?,description=?,media_type=?,media_url=?,media_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(d.title,d.description,d.media_type,d.media_url,d.media_key,id).run();
    if(old.media_key&&old.media_key!==d.media_key&&env.NEWS_MEDIA)await env.NEWS_MEDIA.delete(old.media_key);
    return json({success:true});
  }catch(error){console.error("Archive PUT failed",error);return json({success:false,message:"تعذر تعديل مادة ذاكرة النوارس"},500)}
}
export async function onRequestDelete({request,env}){
  if(!await isAuthorized(request,env,"archive"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTable(env);
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم المادة غير صحيح"},400);
    const old=await env.DB.prepare("SELECT media_key FROM club_archive_media WHERE id=?").bind(id).first();
    if(!old)return json({success:false,message:"المادة غير موجودة"},404);
    await env.DB.prepare("DELETE FROM club_archive_media WHERE id=?").bind(id).run();
    if(old.media_key&&env.NEWS_MEDIA)await env.NEWS_MEDIA.delete(old.media_key);
    return json({success:true});
  }catch(error){console.error("Archive DELETE failed",error);return json({success:false,message:"تعذر حذف مادة ذاكرة النوارس"},500)}
}