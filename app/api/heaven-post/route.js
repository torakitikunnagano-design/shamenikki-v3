import { NextResponse } from "next/server";

const VPS_URL = "http://160.251.166.73:3000/post";
const VERCEL_LIMIT_BYTES = 4.5 * 1024 * 1024; // 4.5MB

export async function POST(request) {
  try {
    // Vercel serverless の本文サイズ上限チェック
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > VERCEL_LIMIT_BYTES) {
      console.error("[heaven-post] body too large:", contentLength, "bytes (limit 4.5MB)");
      return NextResponse.json(
        { success: false, message: "画像が大きすぎます（4.5MB以下にしてください）" },
        { status: 413 }
      );
    }

    // 元のリクエストをそのまま生バイトで読み取り、Content-Type（multipartのboundary含む）も転送
    const contentType = request.headers.get("content-type") || "";
    const rawBody = await request.arrayBuffer();

    // サーバー側からVPSへ転送（HTTP → Mixed Contentにならない）
    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
        "Content-Type": contentType,
      },
      body: rawBody,
    });

    // VPSのレスポンスを読んでそのままブラウザへ返す
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
