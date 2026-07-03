import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/requireAuth";
import { getServiceClient } from "../../../lib/serviceClient";

export const maxDuration = 60; // パスワード取得は時間がかかるため上限を延長（ロスター保存とは別経路）

const VPS_URL = "http://163.44.98.98:3000/mitene-creds";

export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin"] });
    if (!auth.ok) return auth.response;

    // 店舗はトークン（改ざん不可）から取る。
    const storeId = auth.payload.storeId;

    // 保存先の service_role クライアント。未設定ならVPSを叩く前にフェイルクローズ。
    const supabase = getServiceClient();
    if (!supabase) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });

    const { adminId, adminPass, shopdir, memberIds } = await request.json();

    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BOT_SHARED_SECRET}`,
      },
      body: JSON.stringify({ adminId, adminPass, shopdir, memberIds }),
    });

    const resText = await vpsRes.text();
    let data;
    try { data = JSON.parse(resText); }
    catch { data = { ok: false, error: resText }; }

    // VPS失敗・creds無し。パスワードは含めず、非機密のエラーだけ返す。
    if (!vpsRes.ok || !data || data.ok === false || !Array.isArray(data.creds)) {
      console.error("[mitene-creds] VPS error", vpsRes.status, resText);
      return NextResponse.json(
        { ok: false, error: (data && data.error) || "ミテネ用パスワードの取得に失敗しました" },
        { status: vpsRes.ok ? 502 : vpsRes.status }
      );
    }

    // creds({memberId, password}) を service_role で casts.heaven_pass に直接保存する。
    // UPDATE のみ（台帳に無い heaven_id を勝手に INSERT しない）。パスワードはブラウザに返さない。
    const creds = data.creds;
    let updated = 0;   // 台帳の行を更新できた件数
    let notFound = 0;  // 該当 heaven_id が台帳に無かった件数
    for (const c of creds) {
      const memberId = c && c.memberId != null ? String(c.memberId) : "";
      const password = c && c.password;
      if (!memberId || !password) continue; // パスワード未取得はスキップ（カウントしない）
      const { data: rows, error: upErr } = await supabase
        .from("casts")
        .update({ heaven_pass: password })
        .eq("store_id", storeId)
        .eq("heaven_id", memberId)
        .select("heaven_id");
      if (upErr) {
        console.error("[mitene-creds] update error:", upErr.message);
        notFound++; // 保存できなかったものは非機密のカウントに寄せる（パスワードは返さない）
        continue;
      }
      if (rows && rows.length > 0) updated++;
      else notFound++;
    }

    return NextResponse.json({ ok: true, updated, notFound, total: creds.length });
  } catch (e) {
    console.error("[mitene-creds] proxy error:", e.message);
    return NextResponse.json({ ok: false, error: "プロキシエラー: " + e.message }, { status: 500 });
  }
}
