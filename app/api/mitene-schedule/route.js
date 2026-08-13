import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/requireAuth";
import { getServiceClient } from "../../../lib/serviceClient";

// ============================================================
// ミテネ自動送信スケジュールの保存
// ------------------------------------------------------------
// mitene_schedules は RLS で authenticated=SELECT のみのため、
// 書き込みはこのルートが service_role で行う。
// 店舗はトークン（改ざん不可）から取る。body の storeId は使わない。
//
// POST body: { slots: [{ slot_no, enabled, send_time, send_count }], autoEnabled }
//   - slots: 最大5件。send_time は "HH:MM"。send_count は 1〜50 の整数 or null（null=残り全部）
//   - body に含まれない slot_no の既存行は削除する（スロット削除に対応）
//   - autoEnabled: settings.auto_mitene_enabled へ保存（店舗ごとのマスターON/OFF）
// ============================================================
export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin"] });
    if (!auth.ok) return auth.response;
    const storeId = auth.payload.storeId;

    const body = await request.json();
    const slots = body?.slots;
    const autoEnabled = body?.autoEnabled;

    // ── バリデーション（不正は 400。DB制約と同じ条件をサーバー側でも検証する）──
    const bad = (msg) => NextResponse.json({ ok: false, error: msg }, { status: 400 });
    if (typeof autoEnabled !== "boolean") return bad("autoEnabled が不正です");
    if (!Array.isArray(slots) || slots.length > 5) return bad("slots は最大5件の配列で指定してください");
    const seenSlotNo = new Set();
    for (const s of slots) {
      if (!s || typeof s !== "object") return bad("slots の要素が不正です");
      if (!Number.isInteger(s.slot_no) || s.slot_no < 1 || s.slot_no > 5) return bad("slot_no は 1〜5 の整数で指定してください");
      if (seenSlotNo.has(s.slot_no)) return bad("slot_no が重複しています");
      seenSlotNo.add(s.slot_no);
      if (typeof s.enabled !== "boolean") return bad("enabled が不正です");
      if (typeof s.send_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.send_time)) return bad("send_time は HH:MM 形式で指定してください");
      if (s.send_count !== null && (!Number.isInteger(s.send_count) || s.send_count < 1 || s.send_count > 50)) {
        return bad("send_count は 1〜50 の整数 または null（残り全部）で指定してください");
      }
    }

    const supabase = getServiceClient();
    if (!supabase) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });

    const nowIso = new Date().toISOString();

    // 1. スロットを upsert（onConflict: store_id,slot_no）
    if (slots.length > 0) {
      const rows = slots.map((s) => ({
        store_id: storeId,
        slot_no: s.slot_no,
        enabled: s.enabled,
        send_time: s.send_time,
        send_count: s.send_count,
        updated_at: nowIso,
      }));
      const { error } = await supabase.from("mitene_schedules").upsert(rows, { onConflict: "store_id,slot_no" });
      if (error) {
        console.error("[mitene-schedule] upsert error:", error.message, error.details || "", error.hint || "");
        return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
      }
    }

    // 2. body に含まれない slot_no の既存行を削除（スロット削除に対応。slots が空なら全削除）
    let delQuery = supabase.from("mitene_schedules").delete().eq("store_id", storeId);
    if (slots.length > 0) {
      delQuery = delQuery.not("slot_no", "in", "(" + slots.map((s) => s.slot_no).join(",") + ")");
    }
    const { error: delErr } = await delQuery;
    if (delErr) {
      console.error("[mitene-schedule] delete error:", delErr.message, delErr.details || "", delErr.hint || "");
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }

    // 3. settings.auto_mitene_enabled を保存。
    //    アプリの settings 保存と同じ upsert 規約（onConflict: store_id,id）に合わせる
    //    ＝行が無い新店舗でも作成される（他カラムはDB既定値）。
    const { error: setErr } = await supabase.from("settings").upsert(
      { store_id: storeId, id: 1, auto_mitene_enabled: autoEnabled, updated_at: nowIso },
      { onConflict: "store_id,id" }
    );
    if (setErr) {
      console.error("[mitene-schedule] settings upsert error:", setErr.message, setErr.details || "", setErr.hint || "");
      return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // リクエスト本文が壊れている等。誤って成功にしない。
    console.error("[mitene-schedule] error:", e?.message || e);
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
}
