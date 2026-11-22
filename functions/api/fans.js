import { makePasswordHash, checkPassword, newSessionToken, tokenHash } from "../_auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });
const clean = value => String(value ?? "").trim();
const normalizePhone = value => clean(value).replace(/[\s()-]/g, "");
const safeUser = row => ({
  id: row.id,
  name: row.full_name,
  phone: row.phone || "",
  email: row.email || "",
  provider: row.google_sub ? "google" : "phone",
  created_at: row.created_at
});

async function ensureFanTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    google_sub TEXT UNIQUE,
    password_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fan_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fan_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function createSession(env, fanId) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO fan_sessions(fan_id,token_hash,expires_at) VALUES(?,?,?)")
    .bind(fanId, await tokenHash(token), expires).run();
  return token;
}

async function currentFan(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT f.id,f.full_name,f.phone,f.email,f.google_sub,f.created_at,f.active,s.expires_at
    FROM fan_sessions s JOIN fans f ON f.id=s.fan_id
    WHERE s.token_hash=? LIMIT 1`).bind(await tokenHash(token)).first();
  if (!row || !row.active || Date.parse(row.expires_at) <= Date.now()) return null;
  return { row, token };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureFanTables(env);
    if (new URL(request.url).searchParams.get("config") === "1") {
      return json({ success: true, googleClientId: env.GOOGLE_CLIENT_ID || "" });
    }
    const session = await currentFan(request, env);
    if (!session) return json({ success: false, message: "يرجى تسجيل الدخول" }, 401);
    return json({ success: true, user: safeUser(session.row) });
  } catch (error) {
    console.error("Fan session lookup failed", error);
    return json({ success: false, message: "تعذر التحقق من الحساب حالياً" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureFanTables(env);
    const body = await request.json();
    const action = clean(body.action);

    if (action === "register") {
      const name = clean(body.name).slice(0, 80);
      const phone = normalizePhone(body.phone);
      const password = String(body.password || "");
      if (name.split(/\\s+/).filter(Boolean).length !== 3) return json({ success: false, message: "اكتب اسمك الثلاثي" }, 400);
      if (!/^\+?[0-9]{7,15}$/.test(phone)) return json({ success: false, message: "رقم الجوال غير صحيح، أدخل الرقم مع مفتاح الدولة عند الحاجة" }, 400);
      if (password.length < 8 || password.length > 128) return json({ success: false, message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, 400);
      const exists = await env.DB.prepare("SELECT id FROM fans WHERE phone=?").bind(phone).first();
      if (exists) return json({ success: false, message: "رقم الجوال مسجل مسبقاً، سجل الدخول بدلاً من إنشاء حساب جديد" }, 409);
      const passwordHash = await makePasswordHash(password);
      const result = await env.DB.prepare("INSERT INTO fans(full_name,phone,password_hash) VALUES(?,?,?)")
        .bind(name, phone, passwordHash).run();
      const fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at FROM fans WHERE id=?")
        .bind(result.meta.last_row_id).first();
      const token = await createSession(env, fan.id);
      return json({ success: true, token, user: safeUser(fan), message: "تم إنشاء حسابك بنجاح" }, 201);
    }

    if (action === "profile") {
      const session = await currentFan(request, env);
      if (!session) return json({ success: false, message: "انتهت الجلسة، سجل الدخول مجدداً" }, 401);
      const name = clean(body.name).replace(/\\s+/g, " ");
      const phone = normalizePhone(body.phone);
      if (name.split(" ").filter(Boolean).length !== 3) return json({ success: false, message: "اكتب اسمك الثلاثي كاملاً" }, 400);
      if (!/^\\+?[0-9]{7,15}$/.test(phone)) return json({ success: false, message: "رقم الجوال غير صحيح" }, 400);
      const exists = await env.DB.prepare("SELECT id FROM fans WHERE phone=? AND id<>?").bind(phone, session.row.id).first();
      if (exists) return json({ success: false, message: "هذا الرقم مسجل بالفعل لدى عضو آخر" }, 409);
      await env.DB.prepare("UPDATE fans SET full_name=?,phone=? WHERE id=?").bind(name, phone, session.row.id).run();
      const updated = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at FROM fans WHERE id=?").bind(session.row.id).first();
      return json({ success: true, user: safeUser(updated), message: "اكتملت عضويتك بنجاح" });
    }

    if (action === "login") {
      const phone = normalizePhone(body.phone);
      const password = String(body.password || "");
      if (!phone || !password) return json({ success: false, message: "أدخل رقم الجوال وكلمة المرور" }, 400);
      const fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,password_hash,active,created_at FROM fans WHERE phone=?")
        .bind(phone).first();
      if (!fan || !fan.active || !fan.password_hash || !await checkPassword(password, fan.password_hash)) {
        return json({ success: false, message: "رقم الجوال أو كلمة المرور غير صحيحة" }, 401);
      }
      const token = await createSession(env, fan.id);
      return json({ success: true, token, user: safeUser(fan), message: "مرحباً بعودتك" });
    }

    if (action === "google") {
      if (!env.GOOGLE_CLIENT_ID) return json({ success: false, message: "تسجيل Google لم يُفعّل بعد" }, 503);
      const credential = clean(body.credential);
      if (!credential) return json({ success: false, message: "تعذر استلام بيانات Google" }, 400);
      const verifyResponse = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
      if (!verifyResponse.ok) return json({ success: false, message: "تعذر التحقق من حساب Google" }, 401);
      const claims = await verifyResponse.json();
      const issuerOk = ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss);
      const verified = claims.email_verified === true || claims.email_verified === "true";
      if (!issuerOk || claims.aud !== env.GOOGLE_CLIENT_ID || !verified || !claims.sub || !claims.email) {
        return json({ success: false, message: "بيانات حساب Google غير صالحة" }, 401);
      }
      let fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at,active FROM fans WHERE google_sub=?")
        .bind(claims.sub).first();
      if (!fan) {
        const existing = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at,active FROM fans WHERE email=?")
          .bind(String(claims.email).toLowerCase()).first();
        if (existing) {
          if (!existing.active) return json({ success: false, message: "هذا الحساب موقوف" }, 403);
          await env.DB.prepare("UPDATE fans SET google_sub=? WHERE id=? AND google_sub IS NULL")
            .bind(claims.sub, existing.id).run();
          fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at,active FROM fans WHERE id=?")
            .bind(existing.id).first();
        } else {
          const name = clean(claims.name || claims.given_name || "مشجع شعباوي").slice(0, 80);
          const result = await env.DB.prepare("INSERT INTO fans(full_name,email,google_sub) VALUES(?,?,?)")
            .bind(name, String(claims.email).toLowerCase(), claims.sub).run();
          fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at,active FROM fans WHERE id=?")
            .bind(result.meta.last_row_id).first();
        }
      }
      if (!fan || !fan.active) return json({ success: false, message: "تعذر تفعيل حساب الجمهور" }, 403);
      const token = await createSession(env, fan.id);
      return json({ success: true, token, user: safeUser(fan), message: "تم تسجيل الدخول بحساب Google" });
    }

    return json({ success: false, message: "طلب غير معروف" }, 400);
  } catch (error) {
    console.error("Fan authentication failed", error);
    return json({ success: false, message: "تعذر إكمال العملية حالياً، حاول مرة أخرى" }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    await ensureFanTables(env);
    const session = await currentFan(request, env);
    if (session) await env.DB.prepare("DELETE FROM fan_sessions WHERE token_hash=?")
      .bind(await tokenHash(session.token)).run();
    return json({ success: true, message: "تم تسجيل الخروج" });
  } catch (error) {
    console.error("Fan logout failed", error);
    return json({ success: false, message: "تعذر تسجيل الخروج" }, 500);
  }
}

// Google sign-in client configuration is supplied through the Pages environment.
