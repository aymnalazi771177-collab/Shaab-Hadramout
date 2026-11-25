import {sendFirebaseTopicPush} from "./_fcm.js";
const jsonBytes = value => new TextEncoder().encode(value);
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const fromB64url = value => {
  const raw = String(value || "").replace(/-/g,"+").replace(/_/g,"/");
  const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};
const joinBytes = (...parts) => {
  const size = parts.reduce((n,p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}
async function hkdfExpand(prk, info, length) {
  const infoBytes = typeof info === "string" ? jsonBytes(info) : info;
  let previous = new Uint8Array(0), output = new Uint8Array(0), counter = 1;
  while (output.length < length) {
    previous = await hmacSha256(prk, joinBytes(previous, infoBytes, new Uint8Array([counter++])));
    output = joinBytes(output, previous);
  }
  return output.slice(0, length);
}
export async function getVapidConfig(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS push_config(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_jwk TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  let row = await env.DB.prepare("SELECT public_key,private_jwk FROM push_config WHERE id=1").first();
  if (!row) {
    const pair = await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
    const publicKey = b64url(await crypto.subtle.exportKey("raw",pair.publicKey));
    const privateJwk = JSON.stringify(await crypto.subtle.exportKey("jwk",pair.privateKey));
    await env.DB.prepare("INSERT OR IGNORE INTO push_config(id,public_key,private_jwk) VALUES(1,?,?)").bind(publicKey,privateJwk).run();
    row = await env.DB.prepare("SELECT public_key,private_jwk FROM push_config WHERE id=1").first();
  }
  if (!row) throw new Error("Unable to initialize push signing key");
  return {publicKey:row.public_key,privateJwk:row.private_jwk};
}
async function makeVapidToken(endpoint, env, config) {
  const url = new URL(endpoint);
  const jwk = JSON.parse(config.privateJwk);
  const privateKey = await crypto.subtle.importKey("jwk", {
    kty:"EC", crv:"P-256", x:jwk.x, y:jwk.y, d:jwk.d, ext:true, key_ops:["sign"]
  }, {name:"ECDSA",namedCurve:"P-256"}, false, ["sign"]);
  const encode = value => b64url(jsonBytes(JSON.stringify(value)));
  const head = encode({typ:"JWT",alg:"ES256"});
  const body = encode({aud:url.origin,exp:Math.floor(Date.now()/1000)+43200,sub:env.VAPID_SUBJECT || "https://shaab-hadramout.pages.dev/"});
  const signature = new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},privateKey,jsonBytes(head+"."+body)));
  return head+"."+body+"."+b64url(signature);
}
async function encryptPushPayload(subscription, payload) {
  const userPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);
  if (userPublic.length !== 65 || authSecret.length !== 16) throw new Error("Invalid push subscription keys");
  const userKey = await crypto.subtle.importKey("raw",userPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const serverPair = await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw",serverPair.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:userKey},serverPair.privateKey,256));
  const authPrk = await hmacSha256(authSecret,shared);
  const keyInfo = joinBytes(jsonBytes("WebPush: info\0"),userPublic,serverPublic);
  const inputKey = await hkdfExpand(authPrk,keyInfo,32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt,inputKey);
  const cek = await hkdfExpand(prk,"Content-Encoding: aes128gcm\0",16);
  const nonce = await hkdfExpand(prk,"Content-Encoding: nonce\0",12);
  const aesKey = await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const plain = joinBytes(jsonBytes(JSON.stringify(payload)),new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,tagLength:128},aesKey,plain));
  const recordSize = new Uint8Array([0,0,16,0]);
  return joinBytes(salt,recordSize,new Uint8Array([serverPublic.length]),serverPublic,cipher);
}
export async function sendClubPush(env, type, payload) {
  await sendFirebaseTopicPush(env, type, payload);
  try {
    const config = await getVapidConfig(env);
    const column = type === "news" ? "news_enabled" : "match_enabled";
    const {results=[]} = await env.DB.prepare("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE "+column+"=1").all();
    await Promise.allSettled(results.map(async row => {
      try {
        const body = await encryptPushPayload({p256dh:row.p256dh,auth:row.auth},payload);
        const token = await makeVapidToken(row.endpoint,env,config);
        const response = await fetch(row.endpoint,{method:"POST",headers:{
          "Authorization":"vapid t="+token+", k="+config.publicKey,
          "TTL":"86400","Urgency":"high","Content-Encoding":"aes128gcm",
          "Content-Type":"application/octet-stream"
        },body});
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(row.endpoint).run();
        } else if (!response.ok) {
          console.warn("Push delivery rejected",response.status);
        }
      } catch(error) { console.warn("Push delivery failed",error); }
    }));
  } catch(error) { console.warn("Club push unavailable",error); }
}
