import { NextResponse } from "next/server";

const VPS_URL = "http://160.251.166.73:3000/post";

export async function POST(request) {
  try {
    // ブラウザから届いたFormDataを解析して必要な4フィールドだけ取り出す
    const formData = await request.formData();
    const heavenId  = formData.get("heavenId")  || "";
    const heavenPass = formData.get("heavenPass") || "";
    const title     = formData.get("title")     || "";
    const body      = formData.get("body")      || "";

    // VPS(heaven-bot)はexpress.json()のみ対応のためJSONで送る（画像は使わない）
    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ heavenId, heavenPass, title, body }),
    });

    // VPSのレスポンスをそのままブラウザへ返す
    const resText = await vpsRes.text();
    let data;
    try { data = JSON.parse(resText); }
    catch { data = { success: false, message: resText }; }

    if (!vpsRes.ok) {
      console.error("[heaven-post] VPS error", vpsRes.status, resText);
    }

    return NextResponse.json(data, { status: vpsRes.status });
  } catch (e) {
    console.error("[heaven-post] proxy error:", e.message, e.stack);
    return NextResponse.json(
      { success: false, message: "プロキシエラー: " + e.message },
      { status: 500 }
    );
  }
}
