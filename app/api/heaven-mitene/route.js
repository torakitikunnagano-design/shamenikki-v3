import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/requireAuth";
import { getServiceClient } from "../../../lib/serviceClient";

const VPS_URL = "http://163.44.98.98:3000/mitene";

export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin"] });
    if (!auth.ok) return auth.response;

    // 店舗はトークン（改ざん不可）から取る。body の storeId は使わない。
    const storeId = auth.payload.storeId;
    // body からは heavenId / max のみ使用。heavenPass が入っていても無視する（旧クライアント互換）。
    const { heavenId, max } = await request.json();

    // heaven_pass はクライアントから受け取らず、service_role で casts から直接取得する。
    const supabase = getServiceClient();
    if (!supabase) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
    const { data, error } = await supabase
      .from("casts")
      .select("heaven_pass")
      .eq("store_id", storeId)
      .eq("heaven_id", heavenId)
      .limit(1);
    if (error) {
      console.error("[heaven-mitene] supabase error:", error.message);
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }
    const cast = data && data[0];
    if (!cast) return NextResponse.json({ ok: false, error: "cast_not_found" }, { status: 404 });
    const heavenPass = cast.heaven_pass;
    if (!heavenPass) return NextResponse.json({ ok: false, error: "no_heaven_pass" }, { status: 400 });

    const payload = { heavenId, heavenPass, max };

    // VPS(heaven-bot)へJSON送信
    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BOT_SHARED_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const resText = await vpsRes.text();
    let data;
    try { data = JSON.parse(resText); }
    catch { data = { ok: false, error: resText }; }

    if (!vpsRes.ok) {
      console.error("[heaven-mitene] VPS error", vpsRes.status, resText);
    }

    return NextResponse.json(data, { status: vpsRes.status });
  } catch (e) {
    console.error("[heaven-mitene] proxy error:", e.message, e.stack);
    return NextResponse.json(
      { ok: false, error: "プロキシエラー: " + e.message },
      { status: 500 }
    );
  }
}
