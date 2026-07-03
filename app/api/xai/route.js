import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/requireAuth";

const XAI_URL = "https://api.x.ai/v1/chat/completions";

// クライアントから受け取った payload をそのまま x.ai へ中継する。
// APIキーはサーバ専用の環境変数 XAI_API_KEY から読む（ブラウザに一切出さない）。
// AI採点・診断・給料OCR などキャスト画面からも使うため admin/cast 両方を許可。
// （店舗データを操作しない純粋なAIプロキシのため storeId チェックは行わない）
export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin", "cast"] });
    if (!auth.ok) return auth.response;

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
