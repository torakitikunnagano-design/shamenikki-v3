import { createClient } from "@supabase/supabase-js";

// ============================================================
// service_role Supabase クライアント（サーバー専用）
// ------------------------------------------------------------
// RLS をバイパスできる強力な鍵。ブラウザに絶対出さない
// （NEXT_PUBLIC_ を付けない環境変数 SUPABASE_SERVICE_ROLE_KEY を使う）。
//
// 未設定なら null を返す（フェイルクローズ）。呼び出し側は
// null のとき server_config を返して処理を続行しないこと。
// セッションは持たせない（サーバー内の単発クエリ用）。
// ============================================================
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // サーバー専用・NEXT_PUBLIC_ 禁止
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
