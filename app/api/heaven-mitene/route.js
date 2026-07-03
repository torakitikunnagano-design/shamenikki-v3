import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/requireAuth";

const VPS_URL = "http://163.44.98.98:3000/mitene";

export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin"] });
    if (!auth.ok) return auth.response;

    const { heavenId, heavenPass, max } = await request.json();

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
