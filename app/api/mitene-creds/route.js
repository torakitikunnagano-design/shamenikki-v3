import { NextResponse } from "next/server";

export const maxDuration = 60; // パスワード取得は時間がかかるため上限を延長（ロスター保存とは別経路）

const VPS_URL = "http://160.251.166.73:3000/mitene-creds";

export async function POST(request) {
  try {
    const { adminId, adminPass, shopdir, memberIds } = await request.json();

    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ adminId, adminPass, shopdir, memberIds }),
    });

    const resText = await vpsRes.text();
    let data;
    try { data = JSON.parse(resText); }
    catch { data = { ok: false, error: resText }; }

    if (!vpsRes.ok) {
      console.error("[mitene-creds] VPS error", vpsRes.status, resText);
    }
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (e) {
    console.error("[mitene-creds] proxy error:", e.message);
    return NextResponse.json({ ok: false, error: "プロキシエラー: " + e.message }, { status: 500 });
  }
}
