import {isAuthorized} from "../_auth.js";
import {deleteMediaIfUnreferenced} from "../_media_cleanup.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Cache-Control":"no-store"};
const json=(data,status=200)=>Response.json(data,{status,headers:CORS});
const KEY=/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/i;

async function ensureTables(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_media(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL DEFAULT '',description TEXT DEFAULT '',media_type TEXT NOT NULL,media_url TEXT NOT NULL,media_key TEXT DEFAULT '',thumbnail_url TEXT DEFAULT '',thumbnail_key TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  const columns=await env.DB.prepare("PRAGMA table_info(club_media)").all();
  const names=new Set((columns.results||[]).map(row=>row.name));
  if(!names.has("album_id"))await env.DB.prepare("ALTER TABLE club_media ADD COLUMN album_id INTEGER DEFAULT NULL").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_gallery_albums(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,cover_url TEXT NOT NULL,cover_key TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  const legacy=await env.DB.prepare("SELECT id,media_url,media_key FROM club_media WHERE media_type='image' AND (album_id IS NULL OR album_id=0) ORDER BY id DESC").all();
  if((legacy.results||[]).length){
    let album=await env.DB.prepare("SELECT id FROM club_gallery_albums WHERE title='صور النادي' ORDER BY id ASC LIMIT 1").first();
    if(!album){
      const first=legacy.results[0];
      const result=await env.DB.prepare("INSERT INTO club_gallery_albums(title,cover_url,cover_key) VALUES('صور النادي',?,?)").bind(first.media_url,first.media_key||"").run();
      album={id:Number(result.meta.last_row_id)};
    }
    await env.DB.prepare("UPDATE club_media SET album_id=? WHERE media_type='image' AND (album_id IS NULL OR album_id=0)").bind(Number(album.id)).run();
  }
}

function validImageRef(url,key){
  const u=String(url||"").trim(),k=String(key||"").trim();
  if(!u)return false;
  if(u.startsWith("/api/media/")){
    if(!/^\/api\/media\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/i.test(u))return false;
  }else{
    try{const parsed=new URL(u);if(!["https:","http:"].includes(parsed.protocol))return false}catch{return false}
  }
  return !k||KEY.test(k);
}
function cleanAlbum(body){
  const title=String(body.title||"").trim();
  const cover_url=String(body.cover_url||"").trim();
  const cover_key=String(body.cover_key||"").trim();
  const photos=Array.isArray(body.photos)?body.photos:[];
  if(!title||title.length>180)return{error:"اكتب عنوان الألبوم (حتى 180 حرفاً)"};
  if(!validImageRef(cover_url,cover_key))return{error:"ارفع صورة غلاف الألبوم أولاً"};
  if(photos.length>100)return{error:"الحد الأقصى 100 صورة للألبوم الواحد"};
  for(const photo of photos){
    if(!validImageRef(photo?.media_url,photo?.media_key))return{error:"يوجد رابط صورة غير صحيح داخل الألبوم"};
  }
  return{title,cover_url,cover_key,photos};
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:CORS})}
export async function onRequestGet({env}){
  try{
    await ensureTables(env);
    const albums=await env.DB.prepare("SELECT a.id,a.title,a.cover_url,a.cover_key,a.created_at,a.updated_at,COUNT(m.id) AS photos_count FROM club_gallery_albums a LEFT JOIN club_media m ON m.album_id=a.id AND m.media_type='image' GROUP BY a.id ORDER BY a.id DESC").all();
    const photos=await env.DB.prepare("SELECT id,album_id,title,description,media_url,media_key,created_at FROM club_media WHERE media_type='image' AND album_id IS NOT NULL ORDER BY id DESC").all();
    const grouped=new Map();
    for(const photo of photos.results||[]){const id=Number(photo.album_id);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push({...photo,id:Number(photo.id),album_id:id})}
    return json({success:true,albums:(albums.results||[]).map(album=>({...album,id:Number(album.id),photos_count:Number(album.photos_count||0),photos:grouped.get(Number(album.id))||[]}))});
  }catch(error){console.error("Gallery albums GET failed",error);return json({success:false,message:"تعذر تحميل ألبومات الصور"},500)}
}
export async function onRequestPost({request,env}){
  if(!await isAuthorized(request,env,"media"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTables(env);
    const data=cleanAlbum(await request.json());if(data.error)return json({success:false,message:data.error},400);
    if(!data.photos.length)return json({success:false,message:"أضف صورة واحدة على الأقل داخل الألبوم"},400);
    const created=await env.DB.prepare("INSERT INTO club_gallery_albums(title,cover_url,cover_key) VALUES(?,?,?)").bind(data.title,data.cover_url,data.cover_key).run();
    const albumId=Number(created.meta.last_row_id);
    for(const photo of data.photos){
      await env.DB.prepare("INSERT INTO club_media(title,description,media_type,media_url,media_key,album_id) VALUES(?,?,'image',?,?,?)").bind(data.title,"",String(photo.media_url).trim(),String(photo.media_key||""),albumId).run();
    }
    return json({success:true,id:albumId,photos_count:data.photos.length},201);
  }catch(error){console.error("Gallery albums POST failed",error);return json({success:false,message:"تعذر إنشاء الألبوم وحفظ صوره"},500)}
}
export async function onRequestPut({request,env}){
  if(!await isAuthorized(request,env,"media"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTables(env);
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الألبوم غير صحيح"},400);
    const old=await env.DB.prepare("SELECT id,title,cover_url,cover_key FROM club_gallery_albums WHERE id=?").bind(id).first();
    if(!old)return json({success:false,message:"الألبوم غير موجود"},404);
    const body=await request.json();
    const title=String(body.title||"").trim();
    const cover_url=String(body.cover_url||old.cover_url||"").trim();
    const cover_key=String(body.cover_key||old.cover_key||"").trim();
    const photos=Array.isArray(body.photos)?body.photos:[];
    if(!title||title.length>180)return json({success:false,message:"اكتب عنوان الألبوم (حتى 180 حرفاً)"},400);
    if(!validImageRef(cover_url,cover_key))return json({success:false,message:"رابط غلاف الألبوم غير صحيح"},400);
    if(photos.length>100||photos.some(photo=>!validImageRef(photo?.media_url,photo?.media_key)))return json({success:false,message:"بيانات الصور المضافة غير صحيحة"},400);
    await env.DB.prepare("UPDATE club_gallery_albums SET title=?,cover_url=?,cover_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(title,cover_url,cover_key,id).run();
    for(const photo of photos){
      await env.DB.prepare("INSERT INTO club_media(title,description,media_type,media_url,media_key,album_id) VALUES(?,?,'image',?,?,?)").bind(title,"",String(photo.media_url).trim(),String(photo.media_key||""),id).run();
    }
    if(old.cover_url!==cover_url||old.cover_key!==cover_key)await deleteMediaIfUnreferenced(env,[old.cover_url,old.cover_key]);
    return json({success:true});
  }catch(error){console.error("Gallery albums PUT failed",error);return json({success:false,message:"تعذر تحديث الألبوم"},500)}
}
export async function onRequestDelete({request,env}){
  if(!await isAuthorized(request,env,"media"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTables(env);
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الألبوم غير صحيح"},400);
    const album=await env.DB.prepare("SELECT id,cover_url,cover_key FROM club_gallery_albums WHERE id=?").bind(id).first();
    if(!album)return json({success:false,message:"الألبوم غير موجود"},404);
    const photos=await env.DB.prepare("SELECT media_url,media_key FROM club_media WHERE album_id=? AND media_type='image'").bind(id).all();
    await env.DB.prepare("DELETE FROM club_media WHERE album_id=? AND media_type='image'").bind(id).run();
    await env.DB.prepare("DELETE FROM club_gallery_albums WHERE id=?").bind(id).run();
    const refs=[album.cover_url,album.cover_key,...(photos.results||[]).flatMap(photo=>[photo.media_url,photo.media_key])];
    const cleanup=await deleteMediaIfUnreferenced(env,refs);
    return json({success:true,mediaCleanup:cleanup});
  }catch(error){console.error("Gallery albums DELETE failed",error);return json({success:false,message:"تعذر حذف الألبوم وصوره"},500)}
}
