import { NextResponse } from "next/server";

const VPS_URL = "http://160.251.166.73:3000/post";
const BASE64_LIMIT_BYTES = 3 * 1024 * 1024; // base64後 約3MB を上限

export async function POST(request) {
  try {
    const formData = await request.formData();
    const heavenId    = formData.get("heavenId")    || "";
    const heavenPass  = formData.get("heavenPass")  || "";
    const title       = formData.get("title")       || "";
    const body        = formData.get("body")        || "";
    const limitedKind = formData.get("limitedKind") || "00";
    const imageFile   = formData.get("image");

    const payload = { heavenId, heavenPass, title, body, limitedKind };

    if (imageFile && imageFile.size > 0) {
      // ファイルを ArrayBuffer → Buffer → 純粋な base64 文字列に変換
      const arrayBuf = await imageFile.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString("base64");

      if (base64.length > BASE64_LIMIT_BYTES) {
        console.error("[heaven-post] imageBase64 too large:", base64.length, "chars");
        return NextResponse.json(
          { success: false, message: "画像が大きすぎます。元の画像を小さくしてください。" },
          { status: 413 }
        );
      }

      payload.imageBase64 = base64;
      payload.imageType   = imageFile.type || "image/jpeg";
    }

    // VPS(heaven-bot)へJSON送信
    const vpsRes = await fetch(VPS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

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
