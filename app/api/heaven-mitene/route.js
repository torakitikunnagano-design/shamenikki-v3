import { NextResponse } from "next/server";

const VPS_URL = "http://160.251.166.73:3000/mitene";

export async function POST(request) {
  try {
    const { heavenId, heavenPass, max } = await request.json();

    const payload = { heavenId, heavenPass, max };

    // VPS(heaven-bot)へJSON送信
    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
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
