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
// POST body: { slots?: [{ slot_no, enabled, send_time, send_count }], autoEnabled?,
//              shopdir?, autoSyncEnabled?, adminId?, adminPass? }
//   - slots: 最大5件。send_time は "HH:MM"。send_count は 1〜50 の整数 or null（null=残り全部）。
//     slots を省略した場合はスロットに一切触らず、フラグ等だけを更新する（トグルの切替即保存用）。
//     slots を送る場合（フル保存）は autoEnabled も必須（従来どおり）
//   - slots 送信時、body に含まれない slot_no の既存行は削除する（スロット削除に対応）
//   - autoEnabled: settings.auto_mitene_enabled へ保存（店舗ごとのマスターON/OFF）
//   - shopdir: 非空文字列のときだけ settings.shopdir へ保存（VPSボットが手動一括ミテネとの
//     相互排他ロックに使う。空なら既存値を上書きしない）
//   - autoSyncEnabled: boolean のときだけ settings.auto_sync_enabled へ保存（朝6時の自動同期ON/OFF。
//     未送信＝旧クライアントからの保存では既存値を保持）
//   - adminId / adminPass: 非空文字列のときだけ settings へ保存（空で既存値を消さない）。
//     レスポンスには一切含めない（ブラウザに返さない）
// ============================================================
export async function POST(request) {
  try {
    const auth = requireAuth(request, { roles: ["admin"] });
    if (!auth.ok) return auth.response;
    const storeId = auth.payload.storeId;

    const body = await request.json();
    const slots = body?.slots;
    const hasSlots = slots !== undefined; // slots 省略時はスロットに一切触らずフラグだけ更新（トグルの切替即保存用）
    const autoEnabled = typeof body?.autoEnabled === "boolean" ? body.autoEnabled : null;         // null=未送信（既存値保持）
    const shopdir = typeof body?.shopdir === "string" ? body.shopdir.trim() : "";
    const autoSyncEnabled = typeof body?.autoSyncEnabled === "boolean" ? body.autoSyncEnabled : null; // null=未送信（既存値保持）
    const adminId = typeof body?.adminId === "string" ? body.adminId.trim() : "";
    const adminPass = typeof body?.adminPass === "string" ? body.adminPass : ""; // パスワードはtrimしない（前後空白が正規の可能性）

    // ── バリデーション（不正は 400。DB制約と同じ条件をサーバー側でも検証する）──
    const bad = (msg) => NextResponse.json({ ok: false, error: msg }, { status: 400 });
    if (hasSlots && typeof body?.autoEnabled !== "boolean") return bad("autoEnabled が不正です"); // フル保存時は従来どおり必須
    if (!hasSlots && autoEnabled === null && autoSyncEnabled === null && !shopdir && !adminId && !adminPass) {
      return bad("更新内容がありません");
    }
    if (hasSlots && (!Array.isArray(slots) || slots.length > 5)) return bad("slots は最大5件の配列で指定してください");
    const seenSlotNo = new Set();
    for (const s of (hasSlots ? slots : [])) {
      if (!s || typeof s !== "object") return bad("slots の要素が不正です");
      if (!Number.isInteger(s.slot_no) || s.slot_no < 1 || s.slot_no > 5) return bad("slot_no は 1〜5 の整数で指定してください");
      if (seenSlotNo.has(s.slot_no)) return bad("slot_no が重複しています");
      seenSlotNo.add(s.slot_no);
      if (typeof s.enabled !== "boolean") return bad("enabled が不正です");
      if (typeof s.send_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.send_time)) return bad("send_time は HH:MM 形式で指定してください");
      // ヘブン側のミテネ残数は毎朝9:00更新のため、9:05より前のスロットは受け付けない（UI側と同じ検証）
      const [sh, sm] = s.send_time.split(":").map(Number);
      if (sh * 60 + sm < 9 * 60 + 5) return bad("スロットは9:05以降に設定してください（ヘブン側のミテネ更新が朝9:00のため）");
      // 分は5分刻み（UI側と同じ検証）
      if (sm % 5 !== 0) return bad("時刻の分は5分刻み（00/05/10…）で設定してください");
      if (s.send_count !== null && (!Number.isInteger(s.send_count) || s.send_count < 1 || s.send_count > 50)) {
        return bad("send_count は 1〜50 の整数 または null（残り全部）で指定してください");
      }
    }

    // 最終スロットの「残り全部」はbot側が実行時に時刻で判定するため、send_count はユーザーの
    // 入力値をそのまま保存する（旧仕様の「最遅スロットを null に強制上書き」は廃止。
    // null は引き続き有効値＝残り全部として受け付ける: 旧データ・旧クライアント互換）。
    const saveSlots = hasSlots ? slots : [];

    const supabase = getServiceClient();
    if (!supabase) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });

    const nowIso = new Date().toISOString();

    // 1. スロットを upsert（onConflict: store_id,slot_no）。slots 省略時はスキップ
    if (hasSlots && saveSlots.length > 0) {
      const rows = saveSlots.map((s) => ({
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

    // 2. body に含まれない slot_no の既存行を削除（スロット削除に対応。slots が空配列なら全削除）。
    //    slots 省略（フラグのみ更新）時はスロットに一切触らない
    if (hasSlots) {
      let delQuery = supabase.from("mitene_schedules").delete().eq("store_id", storeId);
      if (saveSlots.length > 0) {
        delQuery = delQuery.not("slot_no", "in", "(" + saveSlots.map((s) => s.slot_no).join(",") + ")");
      }
      const { error: delErr } = await delQuery;
      if (delErr) {
        console.error("[mitene-schedule] delete error:", delErr.message, delErr.details || "", delErr.hint || "");
        return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
      }
    }

    // 3. settings.auto_mitene_enabled（＋条件を満たすカラムだけ一緒に）を保存。
    //    アプリの settings 保存と同じ upsert 規約（onConflict: store_id,id）に合わせる
    //    ＝行が無い新店舗でも作成される（他カラムはDB既定値）。
    //    shopdir / adminId / adminPass は空のときカラム自体を送らず既存値を保持（空上書き事故防止）。
    const settingsRow = { store_id: storeId, id: 1, updated_at: nowIso };
    if (autoEnabled !== null) settingsRow.auto_mitene_enabled = autoEnabled;
    if (shopdir) settingsRow.shopdir = shopdir;
    if (autoSyncEnabled !== null) settingsRow.auto_sync_enabled = autoSyncEnabled;
    if (adminId) settingsRow.admin_id = adminId;
    if (adminPass) settingsRow.admin_pass = adminPass;
    const { error: setErr } = await supabase.from("settings").upsert(
      settingsRow,
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
