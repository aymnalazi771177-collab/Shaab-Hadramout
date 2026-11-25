const encoder = new TextEncoder();
let cachedAccessToken = null;
let cachedTokenExpiry = 0;

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const encodeJson = value => b64url(encoder.encode(JSON.stringify(value)));

function pemToBytes(pem) {
  const clean = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\s/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function createAccessToken(serviceAccount) {
  if (cachedAccessToken && Date.now() < cachedTokenExpiry - 60000) return cachedAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = encodeJson({ alg: "RS256", typ: "JWT" }) + "." +
    encodeJson({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    });
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKey, encoder.encode(unsigned)
  );
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error("Firebase OAuth token request failed (" + response.status + ")");
  }
  cachedAccessToken = result.access_token;
  cachedTokenExpiry = Date.now() + Number(result.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

export async function sendFirebaseTopicPush(env, type, payload) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("Firebase push skipped: FIREBASE_SERVICE_ACCOUNT secret is not configured");
    return { sent: false, reason: "missing_credentials" };
  }
  try {
    const account = typeof env.FIREBASE_SERVICE_ACCOUNT === "string"
      ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) : env.FIREBASE_SERVICE_ACCOUNT;
    if (!account.project_id || !account.client_email || !account.private_key) {
      throw new Error("Firebase service account JSON is incomplete");
    }
    const topic = type === "news" ? "news" : type === "matches" ? "matches" : null;
    if (!topic) return { sent: false, reason: "unsupported_topic" };

    const token = await createAccessToken(account);
    const response = await fetch(
      "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(account.project_id) + "/messages:send",
      {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            topic,
            notification: {
              title: String(payload.title || "نادي شعب حضرموت"),
              body: String(payload.body || "لديك إشعار جديد")
            },
            data: {
              title: String(payload.title || "نادي شعب حضرموت"),
              body: String(payload.body || "لديك إشعار جديد"),
              url: String(payload.url || "/")
            },
            android: {
              priority: "HIGH",
              notification: { channel_id: "club_updates", sound: "default" }
            }
          }
        })
      }
    );
    if (!response.ok) {
      console.error("Firebase message send failed", response.status, (await response.text()).slice(0, 500));
      return { sent: false, status: response.status };
    }
    return { sent: true };
  } catch (error) {
    console.error("Firebase push unavailable:", error.message);
    return { sent: false, reason: "send_failed" };
  }
}
