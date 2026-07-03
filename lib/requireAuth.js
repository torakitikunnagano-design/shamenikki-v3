import { NextResponse } from "next/server";
import { verifyToken } from "./authToken";

// ============================================================
// APIルート共通の認証ヘルパー
// ------------------------------------------------------------
// 使い方（各ルート内）:
//   const auth = requireAuth(request, { roles: ["admin"] });
//   if (!auth.ok) return auth.response;   // 401
//   // 以降 auth.payload で { role, storeId, castId } を参照可
//
// roles: 許可するロールの配列。空なら「有効なトークンであれば可」。
// storeId: cast トークンのとき、この店舗と一致するかを検証する（他店舗操作の防止）。
//          admin-only ルートでは渡さなくてよい（cast はロールで弾かれる）。
// ============================================================
export function requireAuth(request, { roles = [], storeId } = {}) {
  const deny = () => ({
    ok: false,
    response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
  });

  const authHeader = request.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : null;
  const payload = token ? verifyToken(token) : null;

  if (!payload) return deny();                                   // トークン無し/不正/期限切れ
  if (roles.length > 0 && !roles.includes(payload.role)) return deny(); // ロール不許可

  // cast トークンは操作対象店舗が自店舗と一致する必要がある。
  // storeId が渡されたときのみ検証（渡されなければ店舗チェックは省略）。
  if (payload.role === "cast" && storeId != null && storeId !== "") {
    if (payload.storeId !== storeId) return deny();
  }

  return { ok: true, payload };
}
