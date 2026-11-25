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
  const sources=[];
  for(const table of tableNames){
    const tableSql=quoteIdentifier(table);
    const info=await env.DB.prepare("PRAGMA table_info("+tableSql+")").all();
    for(const column of info.results||[]){
      if(!/(url|key|image|media|thumb|logo|file|audio|photo|video|cover|poster|avatar|src|path)/i.test(String(column.name||"")))continue;
      const columnSql=quoteIdentifier(column.name);
      sources.push("SELECT 1 AS found FROM "+tableSql+" WHERE CAST("+columnSql+" AS TEXT) LIKE ?");
    }
  }
  let deleted=0,kept=0;
  for(const key of keys){
    let referenced=false;
    for(let offset=0;offset<sources.length&&!referenced;offset+=80){
      const chunk=sources.slice(offset,offset+80);
      if(!chunk.length)continue;
      const sql=chunk.join(" UNION ALL ")+" LIMIT 1";
      const found=await env.DB.prepare(sql).bind(...chunk.map(()=>"%"+key+"%")).first();
      referenced=Boolean(found);
    }
    if(referenced){kept++;continue}
    await env.NEWS_MEDIA.delete(key);
    deleted++;
  }
  return {deleted,kept};
}
