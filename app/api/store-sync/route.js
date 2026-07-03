import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/requireAuth";

const VPS_URL = "http://163.44.98.98:3000/store-sync";

export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin"] });
    if (!auth.ok) return auth.response;

    const { adminId, adminPass, shopdir, mode } = await request.json();

    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.BOT_SHARED_SECRET}`,
      },
      body: JSON.stringify({ adminId, adminPass, shopdir, mode }),
    });

    const resText = await vpsRes.text();
    let data;
    try { data = JSON.parse(resText); }
    catch { data = { success: false, message: resText }; }

    if (!vpsRes.ok) {
      console.error("[store-sync] VPS error", vpsRes.status, resText);
    }

    // 防御的措置: VPS応答の casts 配列から heavenPass を除去してブラウザに返さない。
    // クライアントは Step3-3 以降 heavenPass を使わない。casts 以外（shifts・件数など）は変更しない。
    if (data && Array.isArray(data.casts)) {
      data.casts = data.casts.map(({ heavenPass, ...rest }) => rest);
    }

    return NextResponse.json(data, { status: vpsRes.status });
  } catch (e) {
    console.error("[store-sync] proxy error:", e.message);
    return NextResponse.json(
      { success: false, message: "プロキシエラー: " + e.message },
      { status: 500 }
    );
  }
}
