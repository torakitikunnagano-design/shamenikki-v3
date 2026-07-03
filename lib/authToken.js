import crypto from "crypto";

// ============================================================
// 署名付きトークン（HMAC-SHA256）
// ------------------------------------------------------------
// 外部ライブラリ（jsonwebtoken 等）は使わず Node 標準の crypto のみ。
// 形式: base64url(JSON payload) + "." + base64url(HMAC-SHA256 署名)
// payload: { role: "admin"|"cast", storeId, castId?(castのみ), exp }
//
// 署名キーは環境変数 AUTH_TOKEN_SECRET。未設定ならトークンの
// 発行・検証とも必ず失敗させる（フェイルオープン禁止）。
// ============================================================

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 発行から24時間

function getSecret() {
  const s = process.env.AUTH_TOKEN_SECRET;
  // 未設定・空なら null。呼び出し側は必ず失敗（トークンnull / 検証null）になる。
  return s && s.length > 0 ? s : null;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecodeToString(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(encoded, secret) {
  return b64url(crypto.createHmac("sha256", secret).update(encoded).digest());
}

// 発行。secret 未設定なら null を返す（＝発行不可）。
export function createToken(payload) {
  const secret = getSecret();
  if (!secret) return null;
  const body = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const encoded = b64url(Buffer.from(JSON.stringify(body), "utf8"));
  return encoded + "." + sign(encoded, secret);
}

// 検証。署名不一致・期限切れ・secret未設定・形式不正なら null。
export function verifyToken(token) {
  const secret = getSecret();
  if (!secret || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expected = sign(encoded, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // 長さが違うと timingSafeEqual が例外を投げるので先に弾く
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(encoded));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number") return null;
  if (Date.now() > payload.exp) return null; // 期限切れ
  return payload;
}
