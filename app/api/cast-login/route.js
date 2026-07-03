import crypto from "crypto";
import { NextResponse } from "next/server";
import { createToken } from "../../../lib/authToken";
import { getServiceClient } from "../../../lib/serviceClient";

// キャストログイン。ログイン前に呼ぶため認証は不要。
// POST { storeId, heavenId, heavenPass } を受け取り、casts テーブルに該当キャスト
// （store_id 一致・heaven_id 一致・is_active）が居ればトークンを発行する。
//
// RLS を「authenticated 限定」に強化するとセッション無しの anon 読み取りは弾かれるため、
// ここでは RLS をバイパスするサーバー専用の service_role キーで casts を読む。
// この鍵は全データにアクセスできる強力な鍵なので、select は認証に必要な最小限にとどめる。
//
// パスワード検証（段階導入）: casts.heaven_pass が設定済みのキャストは heavenPass の
// 一致を必須にする。heaven_pass が空/null のキャストは従来どおり存在確認のみで通す
// （暫定フォールバック。将来 heaven_pass を全キャストに行き渡らせてから締める）。

// 定数時間でのパスワード比較。長さが違うと timingSafeEqual が例外を投げるため先に長さで弾く。
function passwordMatches(expected, provided) {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const a = Buffer.from(String(expected), "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  try {
    const { storeId, heavenId, heavenPass } = await request.json();
    if (!storeId || !heavenId) return NextResponse.json({ ok: false });

    const supabase = getServiceClient();
    if (!supabase) return NextResponse.json({ ok: false, error: "server_config" });
    const { data, error } = await supabase
      .from("casts")
      .select("name, heaven_id, is_active, heaven_pass")
      .eq("store_id", storeId)
      .eq("heaven_id", heavenId)
      .eq("is_active", true)
      .limit(1);

    if (error) {
      console.error("[cast-login] supabase error:", error.message);
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }
    const cast = data && data[0];
    if (!cast) return NextResponse.json({ ok: false });

    // 段階導入: heaven_pass が設定済みなら照合必須。空/null なら存在確認のみで通す（暫定）。
    if (cast.heaven_pass) {
      if (!passwordMatches(cast.heaven_pass, heavenPass)) {
        // ID とパスワードのどちらが違うかは教えない。
        return NextResponse.json({ ok: false, error: "bad_credentials" }, { status: 401 });
      }
    }

    // cast_id の規約は「heaven_id || name」
    const castId = cast.heaven_id || cast.name;
    const token = createToken({ role: "cast", storeId, castId });
    if (!token) return NextResponse.json({ ok: false, error: "server_config" }); // AUTH_TOKEN_SECRET 未設定

    return NextResponse.json({ ok: true, token });
  } catch (e) {
    console.error("[cast-login] error:", e.message);
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
}
