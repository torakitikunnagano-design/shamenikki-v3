"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import App from "./App";

// ============================================================
// Supabase Auth ログインゲート（既存アプリの"外側の入口"）
//  - 未ログインならログイン画面、ログイン済みなら従来の <App/> をそのまま表示。
//  - セッションは supabase-js 既定で localStorage 永続（毎回ログイン不要）。
//  - 既存の店舗パスワードゲート/ストア切替などは <App/> 側でそのまま温存。
// ============================================================
export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined=確認中, null=未ログイン, object=ログイン済み
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    // 初期判定は getSession を権威とする（localStorage の保存セッションを復元）
    supabase.auth.getSession()
      .then(({ data, error }) => {
        console.log("[AuthGate] getSession hasSession=" + !!(data && data.session) + (error ? " error=" + error.message : ""));
        if (mounted) setSession(data?.session ?? null);
      })
      .catch((e) => { console.error("[AuthGate] getSession threw:", e && e.message); if (mounted) setSession(null); });

    // onAuthStateChange は「明示的な SIGNED_OUT のときだけ」ログイン画面へ。
    // それ以外で session が来たら採用（ログイン直後/復元/更新）。session が無い非SIGNED_OUTイベントは
    // 無視＝バックグラウンドのトークン更新失敗などで有効セッションが誤って弾かれるのを防ぐ。
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      console.log("[AuthGate] event=" + event + " hasSession=" + !!sess);
      if (!mounted) return;
      if (event === "SIGNED_OUT") { setSession(null); return; }
      if (sess) setSession(sess);
    });
    return () => { mounted = false; try { sub.subscription.unsubscribe(); } catch {} };
  }, []);

  async function handleLogin() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message || "ログインに失敗しました");
      // 成功時は onAuthStateChange が session を更新してアプリ本体へ
    } catch (e) {
      setError(e?.message || "ログインに失敗しました");
    }
    setLoading(false);
  }

  // 確認中（チラつき防止のためサーバ/初期クライアント描画と一致させる）
  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff0f8", color: "#c4a0c8", fontSize: "14px", fontWeight: 700 }}>
        読み込み中…
      </div>
    );
  }

  // 未ログイン → ログイン画面
  if (session === null) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff0f8,#f6e9ff)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "'Noto Sans JP',sans-serif" }}>
        <div style={{ width: "100%", maxWidth: "380px", background: "#ffffff", border: "1.5px solid #ffd6ea", borderRadius: "22px", padding: "28px 24px", boxShadow: "0 8px 30px rgba(255,107,157,0.18)" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "20px", background: "linear-gradient(135deg,#ff6b9d,#d946ef)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 12px", boxShadow: "0 4px 16px rgba(255,107,157,0.3)" }}>🔐</div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#3d1a4e", margin: "0 0 4px" }}>SHAMENIKKI AI</h1>
            <p style={{ fontSize: "13px", color: "#c4a0c8", margin: 0 }}>ログインしてください</p>
          </div>

          <label style={{ fontSize: "11px", fontWeight: 700, color: "#c4a0c8", display: "block", marginBottom: "6px" }}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@example.com"
            autoComplete="username"
            style={inp}
          />

          <label style={{ fontSize: "11px", fontWeight: 700, color: "#c4a0c8", display: "block", margin: "14px 0 6px" }}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="パスワード"
            autoComplete="current-password"
            style={inp}
          />

          {error && (
            <p style={{ color: "#ff5c7a", fontSize: "13px", fontWeight: 700, margin: "12px 0 0" }}>⚠️ {error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            style={{ width: "100%", marginTop: "20px", padding: "13px", borderRadius: "14px", border: "none", background: (loading || !email || !password) ? "#c4a0c8" : "#ff6b9d", color: "white", fontWeight: 700, fontSize: "15px", cursor: (loading || !email || !password) ? "not-allowed" : "pointer", opacity: (loading || !email || !password) ? 0.7 : 1 }}>
            {loading ? "ログイン中…" : "ログイン"}
          </button>
        </div>
      </div>
    );
  }

  // ログイン済み → 従来のアプリ本体
  return <App />;
}

const inp = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1.5px solid #ffd6ea",
  fontSize: "15px",
  color: "#3d1a4e",
  outline: "none",
  boxSizing: "border-box",
};
