import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// auth を明示設定してセッションを localStorage に確実に永続させる。
// （既定でも localStorage 永続だが、storageKey/ストレージを固定して
//  「リロードでログインに戻る」不具合を確実に防ぐ。データクエリには影響しない）
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // パスワード認証のみ（URLコールバックは使わない）
    storageKey: "shamenikki-auth",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
