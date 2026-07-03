import { NextResponse } from "next/server";
import { createToken } from "../../../lib/authToken";

// 管理者ログインの照合をサーバ側で行う。
// パスワードの実値は環境変数 ADMIN_PASSWORDS（JSON文字列）にのみ置き、
// レスポンスには一致可否（ok）と署名付きトークンだけを返す。実値は絶対に返さない。
//
// ADMIN_PASSWORDS の形式（値の例は書かない）:
//   {"<storeId>":"<password>","<storeId>":"<password>"}
export async function POST(request) {
  try {
    const { storeId, password } = await request.json();

    // 環境変数の読み込み・パース。未設定/壊れている場合は 500 ではなく
    // ok:false + error:"server_config" を返す（クライアントは通信成功として扱える）。
    let table;
    try {
      const raw = process.env.ADMIN_PASSWORDS;
      if (!raw) return NextResponse.json({ ok: false, error: "server_config" });
      table = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, error: "server_config" });
    }
    if (!table || typeof table !== "object") {
      return NextResponse.json({ ok: false, error: "server_config" });
    }

    const expected = table[storeId];
    // 該当店舗の登録が無い/空、または入力が空のときは不一致扱い。
    const ok =
      typeof expected === "string" &&
      expected.length > 0 &&
      typeof password === "string" &&
      password === expected;

    if (!ok) return NextResponse.json({ ok: false });

    // 照合成功 → admin トークンを発行。
    const token = createToken({ role: "admin", storeId });
    if (!token) return NextResponse.json({ ok: false, error: "server_config" }); // AUTH_TOKEN_SECRET 未設定
    return NextResponse.json({ ok: true, token });
  } catch (e) {
    // リクエスト本文が壊れている等。誤って成功にしないよう ok:false を返す。
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
}
