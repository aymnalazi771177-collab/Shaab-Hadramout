import {isAuthorized} from "../_auth.js";

function json(data,status=200){
  return Response.json(data,{status,headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":"Authorization, Content-Type"
  }});
}
async function ensureTables(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_legends(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    active_years TEXT DEFAULT '',
    birth_date TEXT DEFAULT '',
    death_date TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    image_key TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_legend_media(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legend_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_key TEXT DEFAULT '',
    title TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(legend_id) REFERENCES club_legends(id) ON DELETE CASCADE
  )`).run();
}
function validUrl(value){
  if(!value)return true;
  try{const u=new URL(value);return ["http:","https:"].includes(u.protocol)}catch{return false}
}
function clean(body){
  const d={
    name:String(body.name||"").trim(),
    role:String(body.role||"").trim().slice(0,140),
    active_years:String(body.active_years||"").trim().slice(0,120),
    birth_date:String(body.birth_date||"").trim().slice(0,40),
    death_date:String(body.death_date||"").trim().slice(0,40),
    image_url:String(body.image_url||"").trim(),
    image_key:String(body.image_key||"").trim(),
    bio:String(body.bio||"").trim().slice(0,6000),
    sort_order:Number.isFinite(Number(body.sort_order))?Math.max(0,Math.round(Number(body.sort_order))):0,
    active:body.active===false||body.active===0||body.active==="0"?0:1
  };
  if(!d.name)return {error:"اسم الأسطورة مطلوب"};
  if(d.name.length>180||!validUrl(d.image_url))return {error:"تحقق من اسم الأسطورة ورابط الصورة"};
  if(d.image_key&&!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/i.test(d.image_key))return {error:"مفتاح الصورة غير صحيح"};
  return d;
}
function cleanMedia(list,type){
  if(!Array.isArray(list))return [];
  return list.slice(0,20).map((item,index)=>({
    media_type:type,
    media_url:String(item.media_url||"").trim(),
    media_key:String(item.media_key||"").trim(),
    title:String(item.title||"").trim().slice(0,180),
    sort_order:index
  })).filter(item=>validUrl(item.media_url)&&item.media_url);
}
async function addMedia(env,legendId,photos=[],videos=[]){
  const entries=[...cleanMedia(photos,"image"),...cleanMedia(videos,"video")];
  for(const item of entries){
    await env.DB.prepare("INSERT INTO club_legend_media(legend_id,media_type,media_url,media_key,title,sort_order) VALUES(?,?,?,?,?,?)")
      .bind(legendId,item.media_type,item.media_url,item.media_key,item.title,item.sort_order).run();
  }
}
async function readLegends(env,includeHidden){
  const sql="SELECT id,name,role,active_years,birth_date,death_date,image_url,image_key,bio,sort_order,active,created_at,updated_at FROM club_legends "+(includeHidden?"":"WHERE active=1 ")+"ORDER BY sort_order ASC,id DESC";
  const {results}=await env.DB.prepare(sql).all();
  if(!results.length)return [];
  const ids=results.map(x=>x.id);
  const placeholders=ids.map(()=>"?").join(",");
  const media=await env.DB.prepare("SELECT id,legend_id,media_type,media_url,media_key,title,sort_order,created_at FROM club_legend_media WHERE legend_id IN ("+placeholders+") ORDER BY sort_order,id").bind(...ids).all();
  const grouped=new Map();
  for(const item of media.results||[]){
    if(!grouped.has(item.legend_id))grouped.set(item.legend_id,{photos:[],videos:[]});
    grouped.get(item.legend_id)[item.media_type==="video"?"videos":"photos"].push(item);
  }
  return results.map(legend=>({...legend,...(grouped.get(legend.id)||{photos:[],videos:[]})}));
}
export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":"Authorization, Content-Type"
  }});
}
export async function onRequestGet({request,env}){
  try{
    await ensureTables(env);
    const adminView=new URL(request.url).searchParams.get("admin")==="1";
    if(adminView&&!await isAuthorized(request,env,"legends"))return json({success:false,message:"غير مصرح"},401);
    return json({success:true,legends:await readLegends(env,adminView)});
  }catch(error){console.error("Legends GET failed",error);return json({success:false,message:"تعذر تحميل أساطير النادي"},500)}
}
export async function onRequestPost({request,env}){
  if(!await isAuthorized(request,env,"legends"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTables(env);
    const body=await request.json(),d=clean(body);
    if(d.error)return json({success:false,message:d.error},400);
    const result=await env.DB.prepare("INSERT INTO club_legends(name,role,active_years,birth_date,death_date,image_url,image_key,bio,sort_order,active) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(d.name,d.role,d.active_years,d.birth_date,d.death_date,d.image_url,d.image_key,d.bio,d.sort_order,d.active).run();
    const id=result.meta.last_row_id;
    await addMedia(env,id,body.photos,body.videos);
    return json({success:true,id},201);
  }catch(error){console.error("Legends POST failed",error);return json({success:false,message:"تعذر حفظ بيانات الأسطورة"},500)}
}
export async function onRequestPut({request,env}){
  if(!await isAuthorized(request,env,"legends"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTables(env);
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الأسطورة غير صحيح"},400);
    const body=await request.json(),d=clean(body);
    if(d.error)return json({success:false,message:d.error},400);
    const old=await env.DB.prepare("SELECT image_key FROM club_legends WHERE id=?").bind(id).first();
    if(!old)return json({success:false,message:"الأسطورة غير موجودة"},404);
    await env.DB.prepare("UPDATE club_legends SET name=?,role=?,active_years=?,birth_date=?,death_date=?,image_url=?,image_key=?,bio=?,sort_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(d.name,d.role,d.active_years,d.birth_date,d.death_date,d.image_url,d.image_key,d.bio,d.sort_order,d.active,id).run();
    await addMedia(env,id,body.photos,body.videos);
    if(old.image_key&&old.image_key!==d.image_key&&env.NEWS_MEDIA)await env.NEWS_MEDIA.delete(old.image_key);
    return json({success:true});
  }catch(error){console.error("Legends PUT failed",error);return json({success:false,message:"تعذر تعديل بيانات الأسطورة"},500)}
}
export async function onRequestDelete({request,env}){
  if(!await isAuthorized(request,env,"legends"))return json({success:false,message:"غير مصرح"},401);
  try{
    await ensureTables(env);
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الأسطورة غير صحيح"},400);
    const old=await env.DB.prepare("SELECT image_key FROM club_legends WHERE id=?").bind(id).first();
    if(!old)return json({success:false,message:"الأسطورة غير موجودة"},404);
    const media=await env.DB.prepare("SELECT media_key FROM club_legend_media WHERE legend_id=?").bind(id).all();
    await env.DB.prepare("DELETE FROM club_legend_media WHERE legend_id=?").bind(id).run();
    await env.DB.prepare("DELETE FROM club_legends WHERE id=?").bind(id).run();
    if(env.NEWS_MEDIA){
      if(old.image_key)await env.NEWS_MEDIA.delete(old.image_key);
      for(const item of media.results||[])if(item.media_key)await env.NEWS_MEDIA.delete(item.media_key);
    }
    return json({success:true});
  }catch(error){console.error("Legends DELETE failed",error);return json({success:false,message:"تعذر حذف الأسطورة"},500)}
}
