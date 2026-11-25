const KEY_PATTERN=/^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm|mov|mp3|m4a|ogg|wav|aac)$/i;
function mediaKey(value){
  if(typeof value!=="string")return "";
  const valueTrimmed=value.trim();
  if(KEY_PATTERN.test(valueTrimmed))return valueTrimmed;
  const match=valueTrimmed.match(/\/api\/media\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif|mp4|webm|mov|mp3|m4a|ogg|wav|aac))(?:[?#].*)?$/i);
  return match?match[1]:"";
}
function quoteIdentifier(value){return '"'+String(value).replace(/"/g,'""')+'"'}
export async function deleteMediaIfUnreferenced(env,values=[]){
  if(!env?.NEWS_MEDIA)return {deleted:0,kept:0};
  const keys=[...new Set((Array.isArray(values)?values:[values]).map(mediaKey).filter(Boolean))];
  if(!keys.length)return {deleted:0,kept:0};
  const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const tableNames=(tables.results||[]).map(row=>row.name).filter(name=>typeof name==="string"&&name!=="club_reels");
  let deleted=0,kept=0;
  for(const key of keys){
    let referenced=false;
    for(const table of tableNames){
      const tableSql=quoteIdentifier(table);
      const info=await env.DB.prepare("PRAGMA table_info("+tableSql+")").all();
      const columns=(info.results||[]).filter(column=>/(url|key|image|media|thumb|logo|file|audio|photo|video)/i.test(String(column.name||"")));
      for(const column of columns){
        const columnSql=quoteIdentifier(column.name);
        const found=await env.DB.prepare("SELECT 1 AS found FROM "+tableSql+" WHERE CAST("+columnSql+" AS TEXT)=? OR CAST("+columnSql+" AS TEXT) LIKE ? LIMIT 1")
          .bind(key,"%"+key+"%").first();
        if(found){referenced=true;break}
      }
      if(referenced)break;
    }
    if(referenced){kept++;continue}
    await env.NEWS_MEDIA.delete(key);
    deleted++;
  }
  return {deleted,kept};
}
