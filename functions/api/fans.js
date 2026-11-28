import { makePasswordHash, checkPassword, newSessionToken, tokenHash } from "../_auth.js";

// Cloudflare Workers limits PBKDF2 to 100,000 iterations.
// Keep this fan-specific so administrator password hashing remains unchanged.
const FAN_PASSWORD_ITERATIONS = 100000;
const fanEncoder = new TextEncoder();
const toHex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
const fromHex = value => new Uint8Array((value.match(/.{2}/g) || []).map(pair => parseInt(pair, 16)));

async function makeFanPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", fanEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: FAN_PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return "pbkdf2-sha256$" + FAN_PASSWORD_ITERATIONS + "$" + toHex(salt) + "$" + toHex(bits);
}

async function checkFanPassword(password, stored) {
  if (typeof stored === "string" && stored.startsWith("pbkdf2-sha256$")) {
    try {
      const [, iterationsText, saltHex, hashHex] = stored.split("$");
      const iterations = Number(iterationsText);
      if (iterations !== FAN_PASSWORD_ITERATIONS || !/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{64}$/i.test(hashHex)) return false;
      const key = await crypto.subtle.importKey("raw", fanEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
        key,
        256
      );
      return crypto.subtle.timingSafeEqual(new Uint8Array(bits), fromHex(hashHex));
    } catch {
      return false;
    }
  }
  // Retain the legacy verifier for existing records; no stored hashes are rewritten.
  return checkPassword(password, stored);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });
const clean = value => String(value ?? "").trim();
const normalizePhone = value => {
  let raw = clean(value).replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!raw.startsWith("+") && /^7[0-9]{8}$/.test(raw)) raw = "+967" + raw;
  else if (!raw.startsWith("+") && /^967[0-9]{9}$/.test(raw)) raw = "+" + raw;
  else if (!raw.startsWith("+") && /^[0-9]{7,15}$/.test(raw)) raw = "+" + raw;
  return raw;
};
const validateFanPhone = value => {
  const phone = normalizePhone(value);
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) return null;
  const digits = phone.slice(1);
  const national = digits.replace(/^(?:1|7|20|27|30|31|32|33|34|36|39|40|41|43|44|45|46|47|48|49|51|52|53|54|55|56|57|58|60|61|62|63|64|65|66|81|82|84|86|90|91|92|93|94|95|98|211|212|213|216|218|220|221|222|223|224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|248|249|250|251|252|253|254|255|256|257|258|260|261|262|263|264|265|266|267|268|269|290|291|297|298|299|350|351|352|353|354|355|356|357|358|359|370|371|372|373|374|375|376|377|378|380|381|382|383|385|386|387|389|420|421|423|500|501|502|503|504|505|506|507|508|509|590|591|592|593|594|595|596|597|598|599|670|672|673|674|675|676|677|678|679|680|681|682|683|685|686|687|688|689|690|691|692|850|852|853|855|856|880|886|960|961|962|963|964|965|966|967|968|970|971|972|973|974|975|976|977|992|993|994|995|996|998)/, "");
  if (!national || national.length < 7 || national.length > 12) return null;
  if (/^(.)\1+$/.test(national) || /^(0123456789|1234567890|9876543210|0987654321)$/.test(national)) return null;
  if (phone.startsWith("+967") && !/^7[0-9]{8}$/.test(phone.slice(4))) return null;
  if (phone.startsWith("+966") && !/^5[0-9]{8}$/.test(phone.slice(4))) return null;
  if (phone.startsWith("+971") && !/^5[0-9]{8}$/.test(phone.slice(4))) return null;
  if (phone.startsWith("+20") && !/^1[0-9]{9}$/.test(phone.slice(3))) return null;
  if (phone.startsWith("+91") && !/^[6-9][0-9]{9}$/.test(phone.slice(3))) return null;
  if (phone.startsWith("+1") && !/^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(phone.slice(2))) return null;
  return phone;
};
const legacyPhoneVariants = phone => [...new Set([phone, phone.slice(1), phone.replace(/^\+967/, "7")])];
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
  let stage = "request";
  try {
    stage = "tables";
    await ensureFanTables(env);
    stage = "parse_body";
    const body = await request.json();
    const action = clean(body.action);

    if (action === "register") {
      stage = "register_validate";
      const name = clean(body.name).slice(0, 80);
      const phone = validateFanPhone(body.phone);
      const password = String(body.password || "");
      if (name.split(/\s+/).filter(Boolean).length !== 3) return json({ success: false, message: "اكتب اسمك الثلاثي" }, 400);
      if (!phone) return json({ success: false, message: "رقم الجوال غير صحيح أو يبدو رقماً وهمياً. اختر مفتاح الدولة وأدخل رقماً صحيحاً." }, 400);
      if (password.length < 8 || password.length > 128) return json({ success: false, message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, 400);
      stage = "register_lookup";
      const exists = await env.DB.prepare("SELECT id FROM fans WHERE phone=?").bind(phone).first();
      if (exists) return json({ success: false, message: "رقم الجوال مسجل مسبقاً، سجل الدخول بدلاً من إنشاء حساب جديد" }, 409);
      stage = "register_hash";
      const passwordHash = await makeFanPasswordHash(password);
      stage = "register_insert";
      const result = await env.DB.prepare("INSERT INTO fans(full_name,phone,password_hash) VALUES(?,?,?)")
        .bind(name, phone, passwordHash).run();
      stage = "register_fetch";
      const fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,created_at FROM fans WHERE id=?")
        .bind(result.meta.last_row_id).first();
      stage = "register_session";
      const token = await createSession(env, fan.id);
      return json({ success: true, token, user: safeUser(fan), message: "تم إنشاء حسابك بنجاح" }, 201);
    }

    if (action === "profile") {
      const session = await currentFan(request, env);
      if (!session) return json({ success: false, message: "انتهت الجلسة، سجل الدخول مجدداً" }, 401);
      const name = clean(body.name).replace(/\s+/g, " ");
      const phone = normalizePhone(body.phone);
      if (name.split(" ").filter(Boolean).length !== 3) return json({ success: false, message: "اكتب اسمك الثلاثي كاملاً" }, 400);
      if (!/^\+?[0-9]{7,15}$/.test(phone)) return json({ success: false, message: "رقم الجوال غير صحيح" }, 400);
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
      const variants = legacyPhoneVariants(phone);
      let fan = null;
      for (const variant of variants) {
        fan = await env.DB.prepare("SELECT id,full_name,phone,email,google_sub,password_hash,active,created_at FROM fans WHERE phone=?")
          .bind(variant).first();
        if (fan) break;
      }
      if (!fan || !fan.active || !fan.password_hash || !await checkFanPassword(password, fan.password_hash)) {
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
    console.error("Fan authentication failed", { stage, name: error?.name || "Error", message: String(error?.message || error).slice(0, 240) });
    const code = stage.startsWith("register_") ? "FAN-" + stage.slice(9).toUpperCase() : "FAN-" + stage.toUpperCase();
    return json({ success: false, code, diagnostic: { name: String(error?.name || "Error").slice(0, 80), detail: String(error?.message || error).slice(0, 240) }, message: "تعذر إكمال العملية حالياً، رمز التشخيص: " + code }, 500);
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
