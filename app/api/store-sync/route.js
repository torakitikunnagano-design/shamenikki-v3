import { NextResponse } from "next/server";

const VPS_URL = "http://160.251.166.73:3000/store-sync";

export async function POST(request) {
  try {
    const { adminId, adminPass, shopdir } = await request.json();

    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ adminId, adminPass, shopdir }),
    });

    const resText = await vpsRes.text();
    let data;
    try { data = JSON.parse(resText); }
    catch { data = { success: false, message: resText }; }

    if (!vpsRes.ok) {
      console.error("[store-sync] VPS error", vpsRes.status, resText);
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
