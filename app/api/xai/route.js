import { NextResponse } from "next/server";

const XAI_URL = "https://api.x.ai/v1/chat/completions";

// クライアントから受け取った payload をそのまま x.ai へ中継する。
// APIキーはサーバ専用の環境変数 XAI_API_KEY から読む（ブラウザに一切出さない）。
export async function POST(request) {
  try {
    const payload = await request.json();

    const r = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // レスポンス本文はそのまま透過（従来クライアントが res.json() で読む形を維持）
    const text = await r.text();
    if (!r.ok) {
      console.error("[xai] upstream error", r.status, text.slice(0, 500));
    }
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    console.error("[xai] proxy error:", e.message);
    return NextResponse.json({ error: "xai proxy error: " + e.message }, { status: 500 });
  }
}
