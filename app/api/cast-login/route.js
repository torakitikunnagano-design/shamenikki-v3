import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createToken } from "../../../lib/authToken";

// キャストログイン。ログイン前に呼ぶため認証は不要。
// POST { storeId, heavenId } を受け取り、casts テーブルに該当キャスト
// （store_id 一致・heaven_id 一致・is_active）が居ればトークンを発行する。
//
// 注意: 現状クライアント側の判定はパスワードを検証しておらず（既知の課題・別タスク）、
// ここでもその条件と同等（heaven_id 一致 + is_active）でトークンを発行するに留める。
export async function POST(request) {
  try {
    const { storeId, heavenId } = await request.json();
    if (!storeId || !heavenId) return NextResponse.json({ ok: false });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return NextResponse.json({ ok: false, error: "server_config" });

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("casts")
      .select("name, heaven_id, is_active")
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
