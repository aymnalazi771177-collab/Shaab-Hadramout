const KEY_PATTERN=/^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm|mov|mp3|m4a|ogg|wav|aac)$/i;
function mediaKey(value){
  if(typeof value!=="string")return "";
  const raw=value.trim();
  if(KEY_PATTERN.test(raw))return raw;
  try{
    const pathname=new URL(raw,"https://local.invalid").pathname;
    const match=pathname.match(/\/api\/media\/([^/]+)$/i);
    if(!match)return "";
    const key=decodeURIComponent(match[1]);
    return KEY_PATTERN.test(key)?key:"";
  }catch{return ""}
}
const REFERENCE_COLUMNS=[
  ["news","image_url"],["news_images","url"],
  ["club_gallery_albums","cover_url"],["club_gallery_albums","cover_key"],
  ["club_media","media_url"],["club_media","media_key"],["club_media","thumbnail_url"],["club_media","thumbnail_key"],
  ["club_reels","media_url"],["club_reels","media_key"],
  ["club_reels","thumbnail_url"],["club_reels","thumbnail_key"],
  ["club_reel_items","media_url"],["club_reel_items","media_key"],
  ["club_reel_items","thumbnail_url"],["club_reel_items","thumbnail_key"],
  ["players","image_url"],["matches","opponent_logo_url"],["matches","home_logo_url"],
  ["transfers","image_url"]
];
export async function deleteMediaIfUnreferenced(env,values=[]){
  if(!env?.NEWS_MEDIA)throw new Error("R2 binding NEWS_MEDIA is unavailable");
  const keys=[...new Set((Array.isArray(values)?values:[values]).map(mediaKey).filter(Boolean))];
  const results=[];
  for(const key of keys){
    let reference=null;
    for(const [table,column] of REFERENCE_COLUMNS){
      try{
        const found=await env.DB.prepare("SELECT 1 AS found FROM \""+table+"\" WHERE instr(CAST(\""+column+"\" AS TEXT), ?) > 0 LIMIT 1").bind(key).first();
        if(found){reference={table,column};break;}
      }catch(error){
        const message=String(error?.message||error);
        if(/no such table|no such column/i.test(message))continue;
        throw error;
      }
    }
    if(reference){results.push({key,status:"kept",reference});continue;}
    await env.NEWS_MEDIA.delete(key);
    const stillThere=await env.NEWS_MEDIA.head(key);
    if(stillThere)throw new Error("R2 object still exists after delete: "+key);
    results.push({key,status:"deleted"});
  }
  return {deleted:results.filter(item=>item.status==="deleted").length,kept:results.filter(item=>item.status==="kept").length,results};
}
