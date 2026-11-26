import {isAuthorized, tokenHash} from "../_auth.js";
import {ensureClubNotifications, recordClubNotification} from "../_notifications.js";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Cache-Control":"no-store"};
const json=(d,s=200)=>Response.json(d,{status:s,headers});
async function ensure(e){await ensureClubNotifications(e)}
async function isFanMember(request,env){
 const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return false;
 try{
  const row=await env.DB.prepare("SELECT f.id FROM fan_sessions s JOIN fans f ON f.id=s.fan_id WHERE s.token_hash=? AND f.active=1 AND datetime(s.expires_at)>datetime('now') LIMIT 1").bind(await tokenHash(token)).first();
  return !!row;
 }catch{return false}
}
export async function onRequestOptions(){return new Response(null,{status:204,headers})}
export async function onRequestGet({request,env}){
 try{
  await ensure(env);
  const url=new URL(request.url),adminView=url.searchParams.get("admin")==="1",kind=url.searchParams.get("kind");
  if(adminView){const permission=kind==="app_update"?"appUpdates":kind==="exclusive"?"customAlerts":"notifications";if(!await isAuthorized(request,env,permission))return json({success:false,message:"غير مصرح"},401);}
  const member=adminView?false:await isFanMember(request,env);
  let sql="SELECT * FROM club_notifications";
  const clauses=[],values=[];
  if(kind==="app_update")clauses.push("type='app_update'");
  else if(kind==="exclusive")clauses.push("type='exclusive'");
  if(!adminView) {
   clauses.push("(audience='all' OR (audience='members' AND ?=1) OR (audience='visitors' AND ?=0))");
   values.push(member?1:0,member?1:0);
  }
  if(clauses.length)sql+=" WHERE "+clauses.join(" AND ");
  sql+=" ORDER BY id DESC LIMIT 100";
  const {results}=await env.DB.prepare(sql).bind(...values).all();
  return json({success:true,notifications:results});
 }catch(e){console.error("Notifications GET failed",e);return json({success:false,message:"تعذر تحميل الإشعارات"},500)}
}
export async function onRequestPost({request,env}){
 if(!await isAuthorized(request,env,"notifications")&&!await isAuthorized(request,env,"appUpdates")&&!await isAuthorized(request,env,"customAlerts"))return json({success:false,message:"غير مصرح"},401);
 try{
  await ensure(env);
  const b=await request.json(),title=String(b.title||"").trim(),body=String(b.body||"").trim(),type=String(b.type||"general"),audience=String(b.audience||"all"),appVersion=String(b.app_version||"").trim();
  const permission=type==="app_update"?"appUpdates":type==="exclusive"?"customAlerts":"notifications";if(!await isAuthorized(request,env,permission))return json({success:false,message:"غير مصرح"},401);
  if(!title||!body)return json({success:false,message:"عنوان الإشعار ونصه مطلوبان"},400);
  if(title.length>160||body.length>1500)return json({success:false,message:"الإشعار أطول من الحد المسموح"},400);
  if(!["all","members","visitors"].includes(audience))return json({success:false,message:"الفئة المستهدفة غير صحيحة"},400);
  if(type==="app_update"&&!appVersion)return json({success:false,message:"رقم الإصدار مطلوب"},400);
  if(appVersion.length>40)return json({success:false,message:"رقم الإصدار أطول من الحد المسموح"},400);
  const id=await recordClubNotification(env,{title,body,type,referenceId:b.reference_id,audience,appVersion});
  if(type==="exclusive"){const details=JSON.stringify({content:String(b.content||"").slice(0,12000),cover_image:String(b.cover_image||"").slice(0,2000),images:Array.isArray(b.images)?b.images.slice(0,20).map(x=>String(x).slice(0,2000)):[]});await env.DB.prepare("UPDATE club_notifications SET details_json=? WHERE id=?").bind(details,id).run();}
  return json({success:true,id},201);
 }catch(e){console.error("Notifications POST failed",e);return json({success:false,message:"تعذر نشر الإشعار"},500)}
}
export async function onRequestPut({request,env}){
 if(!await isAuthorized(request,env,"notifications")&&!await isAuthorized(request,env,"appUpdates")&&!await isAuthorized(request,env,"customAlerts"))return json({success:false,message:"غير مصرح"},401);
 try{
  await ensure(env);
  const b=await request.json(),id=Number(new URL(request.url).searchParams.get("id")),title=String(b.title||"").trim(),body=String(b.body||"").trim(),type=String(b.type||"general"),audience=String(b.audience||"all"),appVersion=String(b.app_version||"").trim();
  const existing=await env.DB.prepare("SELECT type FROM club_notifications WHERE id=?").bind(id).first();if(!existing)return json({success:false,message:"الإشعار غير موجود"},404);const oldPermission=existing.type==="app_update"?"appUpdates":existing.type==="exclusive"?"customAlerts":"notifications";const newPermission=type==="app_update"?"appUpdates":type==="exclusive"?"customAlerts":"notifications";if(!await isAuthorized(request,env,oldPermission)||!await isAuthorized(request,env,newPermission))return json({success:false,message:"غير مصرح"},401);
  if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم الإشعار غير صحيح"},400);
  if(!title||!body)return json({success:false,message:"عنوان الإشعار ونصه مطلوبان"},400);
  if(title.length>160||body.length>1500||appVersion.length>40)return json({success:false,message:"توجد بيانات أطول من الحد المسموح"},400);
  if(!["all","members","visitors"].includes(audience))return json({success:false,message:"الفئة المستهدفة غير صحيحة"},400);
  if(type==="app_update"&&!appVersion)return json({success:false,message:"رقم الإصدار مطلوب"},400);
  const result=await env.DB.prepare("UPDATE club_notifications SET title=?,body=?,type=?,audience=?,app_version=? WHERE id=?").bind(title,body,type,audience,appVersion||null,id).run();
  if(result.meta.changes&&type==="exclusive"){const details=JSON.stringify({content:String(b.content||"").slice(0,12000),cover_image:String(b.cover_image||"").slice(0,2000),images:Array.isArray(b.images)?b.images.slice(0,20).map(x=>String(x).slice(0,2000)):[]});await env.DB.prepare("UPDATE club_notifications SET details_json=? WHERE id=?").bind(details,id).run();}
  return result.meta.changes?json({success:true}):json({success:false,message:"الإشعار غير موجود"},404);
 }catch(e){console.error("Notifications PUT failed",e);return json({success:false,message:"تعذر تعديل الإشعار"},500)}
}
export async function onRequestDelete({request,env}){
 if(!await isAuthorized(request,env,"notifications")&&!await isAuthorized(request,env,"appUpdates"))return json({success:false,message:"غير مصرح"},401);
 try{await ensure(env);const id=Number(new URL(request.url).searchParams.get("id"));const row=await env.DB.prepare("SELECT type FROM club_notifications WHERE id=?").bind(id).first();if(!row)return json({success:false,message:"الإشعار غير موجود"},404);const permission=row.type==="app_update"?"appUpdates":row.type==="exclusive"?"customAlerts":"notifications";if(!await isAuthorized(request,env,permission))return json({success:false,message:"غير مصرح"},401);const r=await env.DB.prepare("DELETE FROM club_notifications WHERE id=?").bind(id).run();return r.meta.changes?json({success:true}):json({success:false,message:"الإشعار غير موجود"},404)}catch(e){return json({success:false,message:"تعذر حذف الإشعار"},500)}
}
