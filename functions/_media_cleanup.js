const KEY_PATTERN=/^[a-f0-9-]{36}\\.(jpg|png|webp|gif|mp4|webm|mov|mp3|m4a|ogg|wav|aac)$/i;
function mediaKey(value){
  if(typeof value!=="string")return "";
  const raw=value.trim();
  if(KEY_PATTERN.test(raw))return raw;
  try{
    const pathname=new URL(raw,"https://local.invalid").pathname;
    const match=pathname.match(/\\/api\\/media\\/([^/]+)$/i);
    if(!match)return "";
    const key=decodeURIComponent(match[1]);
    return KEY_PATTERN.test(key)?key:"";
  }catch{return ""}
}
function quoteIdentifier(value){return '"'+String(value).replace(/"/g,'""')+'"'}
export async function deleteMediaIfUnreferenced(env,values=[]){
  if(!env?.NEWS_MEDIA)throw new Error("R2 binding NEWS_MEDIA is unavailable");
  const keys=[...new Set((Array.isArray(values)?values:[values]).map(mediaKey).filter(Boolean))];
  const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const tableNames=(tables.results||[]).map(row=>row.name).filter(name=>typeof name==="string");
  const sources=[];
  for(const table of tableNames){
    const tableSql=quoteIdentifier(table);
    const info=await env.DB.prepare("PRAGMA table_info("+tableSql+")").all();
    for(const column of info.results||[]){
      if(!/(url|key|image|media|thumb|logo|file|audio|photo|video|cover|poster|avatar|src|path)/i.test(String(column.name||"")))continue;
      sources.push({table,column:column.name,sql:"SELECT 1 AS found FROM "+tableSql+" WHERE instr(CAST("+quoteIdentifier(column.name)+" AS TEXT), ?) > 0 LIMIT 1"});
    }
  }
  const results=[];
  for(const key of keys){
    let reference=null;
    for(const source of sources){
      const found=await env.DB.prepare(source.sql).bind(key).first();
      if(found){reference={table:source.table,column:source.column};break}
    }
    if(reference){
      results.push({key,status:"kept",reference});
      continue;
    }
    await env.NEWS_MEDIA.delete(key);
    const stillThere=await env.NEWS_MEDIA.head(key);
    if(stillThere)throw new Error("R2 object still exists after delete: "+key);
    results.push({key,status:"deleted"});
  }
  return {
    deleted:results.filter(item=>item.status==="deleted").length,
    kept:results.filter(item=>item.status==="kept").length,
    results
  };
}
