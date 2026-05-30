"use client";

import { useState, useEffect, useRef } from "react";

// ============================================================
// ポップ女子向け カラーテーマ（ピンク・パープル・ホワイト）
// ============================================================
const C = {
  bg:      "#fff0f8",
  surface: "#fff8fc",
  card:    "#ffffff",
  border:  "#ffd6ea",
  accent:  "#ff6b9d",
  accent2: "#d946ef",
  glow:    "#ffb3d1",
  green:   "#2ec4a9",
  red:     "#ff5c7a",
  yellow:  "#ffb347",
  pink:    "#ff6b9d",
  blue:    "#7b9eff",
  text:    "#3d1a4e",
  sub:     "#7c5a8e",
  muted:   "#c4a0c8",
};

const card = {
  background: "#ffffff",
  border: `1.5px solid ${C.border}`,
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 4px 20px rgba(255,107,157,0.08)",
};

const inp = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1.5px solid ${C.border}`,
  background: "#fff8fc",
  color: C.text,
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

// ============================================================
// モックデータ
// ============================================================
const initCasts = [
  { name: "さくら", is_active: true, work_start: "19:00", strong: "彼女感", weak: "タイトル", heaven_id: "", heaven_pass: "" },
  { name: "みお", is_active: true, work_start: "20:00", strong: "文章力", weak: "画像構成", heaven_id: "", heaven_pass: "" },
  { name: "りな", is_active: true, work_start: "18:00", strong: "色恋感", weak: "文字数", heaven_id: "", heaven_pass: "" },
  { name: "あやか", is_active: false, work_start: "21:00", strong: "癒し感", weak: "更新頻度", heaven_id: "", heaven_pass: "" },
];

const initSettings = {
  daily_post_goal: 5,
  repeat_limit_min: 60,
  min_text_length: 100,
  image_required: true,
  before_work_min: 60,
  after_work_min: 60,
  show_guarantee: true,
};

const initScores = [
  { id: 1, cast_name: "さくら", diary: "今日もお仕事頑張ってます！みなさんに会えるのが楽しみで、毎日元気いっぱい出勤してます。趣味の料理で新しいレシピ試したら大成功でした♪", result: "総合点：78点\n\n保証条件チェック\n・文字数判定：達成\n・画像判定：達成\n\n保証改善提案\n・タイトルをもっとキャッチーにすると反応UP\n\n良い点\n・元気な印象が伝わる\n・日常感があり親近感がある\n\n改善点\n・もう少し感情表現を入れると良い\n\n改善タイトル案\n・「料理上手な彼女♪新レシピ大成功です！」\n・「今日も元気に出勤♡待ってます！」", posted_at: new Date().toISOString(), has_image: true, score: 78 },
  { id: 2, cast_name: "みお", diary: "雨の日は家でゆっくり映画を見るのが好きです。最近ハマっているのはラブストーリー系で、感動して泣いてしまいました。そんな感受性豊かな私に会いに来てください！", result: "総合点：85点\n\n保証条件チェック\n・文字数判定：達成\n・画像判定：達成\n\n保証改善提案\n・具体的な映画名を入れるとより個性が出る\n\n良い点\n・彼女感が強く出ている\n・感情表現が豊か\n\n改善点\n・締めの一文がもう少し誘い感があると良い\n\n改善タイトル案\n・「雨の日は映画で号泣中…♡」\n・「感受性豊かな私に会いに来て♪」", posted_at: new Date(Date.now() - 3600000).toISOString(), has_image: true, score: 85 },
  { id: 3, cast_name: "りな", diary: "お疲れ様です", result: "総合点：32点\n\n保証条件チェック\n・文字数判定：文字数不足\n・画像判定：画像不足\n\n保証改善提案\n・最低100文字必要です。自己紹介や今日の気分を追記してください\n\n良い点\n・挨拶ができている\n\n改善点\n・文字数が大幅に不足\n・画像がない\n\n改善タイトル案\n・「今日もよろしくお願いします♪」", posted_at: new Date(Date.now() - 7200000).toISOString(), has_image: false, score: 32 },
];

const ADMIN_PASSWORD = "1234";
const AUTO_LOGIN_KEY = "shamenikki_autologin";
const CREDS_KEY      = "shamenikki_creds";

// ============================================================
// localStorage 永続化フック
// ============================================================
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      // 初回マウント時: localStorageから読み込む
      initialized.current = true;
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          setValue(JSON.parse(stored));
          return; // 読み込み後は書き込まずに終了
        }
      } catch {}
    }
    // 初回以降: localStorageへ書き込む
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}

// ============================================================
// メインアプリ
// ============================================================
function App() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }, []);

  const [mode, setMode] = useState("cast");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [castPage, setCastPage] = useState("score");
  const [showShindan, setShowShindan] = useState(false);
  const [adminPage, setAdminPage] = useState("guarantee");
  const [casts, setCasts] = useLocalStorage("shamenikki_casts", initCasts);
  const [scores, setScores] = useLocalStorage("shamenikki_scores", initScores);
  const [settings, setSettings] = useLocalStorage("shamenikki_settings", initSettings);
  const [loggedInCast, setLoggedInCast] = useState(null);
  const autoLoginDone = useRef(false);

  // casts がロードされたら自動ログイン判定
  useEffect(() => {
    if (autoLoginDone.current || loggedInCast) return;
    try {
      const saved = localStorage.getItem(AUTO_LOGIN_KEY);
      if (!saved) return;
      const { castName, autoLogin: flag } = JSON.parse(saved);
      if (!flag || !castName) return;
      const cast = casts.find((c) => c.name === castName && c.is_active);
      if (cast) {
        autoLoginDone.current = true;
        setLoggedInCast(castName);
        const castId = cast.heaven_id || castName;
        try {
          const typeData = localStorage.getItem(`cast_type_${castId}`);
          if (typeData && JSON.parse(typeData)?.type) { setCastPage("score"); return; }
        } catch {}
        setShowShindan(true);
      }
    } catch {}
  }, [casts, loggedInCast]);

  function tryUnlock() {
    if (passInput === ADMIN_PASSWORD) {
      setAdminUnlocked(true); setPassError(false); setPassInput("");
    } else {
      setPassError(true); setPassInput("");
    }
  }

  function logout() { setAdminUnlocked(false); setMode("cast"); }
  function castLogout() { setLoggedInCast(null); setCastPage("score"); setShowShindan(false); }
  function handleCastLogin(name) {
    setLoggedInCast(name);
    const cast = casts.find((c) => c.name === name);
    const castId = cast?.heaven_id || name;
    try {
      const typeData = localStorage.getItem(`cast_type_${castId}`);
      if (typeData && JSON.parse(typeData)?.type) { setCastPage("score"); return; }
    } catch {}
    setShowShindan(true);
  }

  const castNav = [
    { id: "score",   label: "AI採点",    icon: "✨" },
    ...(settings.show_guarantee ? [{ id: "myguarantee", label: "保証確認", icon: "🎀" }] : []),
  ];

  const adminNav = [
    { id: "guarantee", label: "保証管理", icon: "🎀" },
    { id: "cast",      label: "キャスト", icon: "👑" },
    { id: "ranking",   label: "ランキング", icon: "🌟" },
    { id: "title",     label: "タイトル", icon: "✏️" },
    { id: "settings",  label: "設定",    icon: "⚙️" },
  ];

  const page    = mode === "cast" ? castPage    : adminPage;
  const setPage = mode === "cast" ? setCastPage : setAdminPage;
  const nav     = mode === "cast" ? castNav     : adminNav;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Noto Sans JP', 'Hiragino Kaku Gothic Pro', sans-serif" }}>

      {/* ヘッダー */}
      <header style={{
        background: "linear-gradient(135deg, #ff6b9d 0%, #d946ef 100%)",
        borderBottom: "none",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        height: "58px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 16px rgba(255,107,157,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "10px", background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>💕</div>
          <span style={{ fontWeight: "700", fontSize: "15px", letterSpacing: "0.08em", color: "white", textShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>SHAMENIKKI AI</span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <ModeBtn active={mode === "cast"} onClick={() => setMode("cast")} label="キャスト" />
          <ModeBtn active={mode === "admin"} onClick={() => setMode("admin")} label="管理" />
        </div>
      </header>

      {/* 管理ロック */}
      {mode === "admin" && !adminUnlocked ? (
        <div style={{ padding: "40px 16px", maxWidth: "400px", margin: "0 auto", display: "grid", gap: "20px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: "68px", height: "68px", borderRadius: "22px", background: "linear-gradient(135deg, #ffe0f0, #f0d0ff)", border: `2px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 16px", boxShadow: "0 4px 16px rgba(255,107,157,0.15)" }}>🔐</div>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: C.text, margin: "0 0 6px" }}>店舗管理画面</h2>
            <p style={{ color: C.muted, fontSize: "13px", margin: 0 }}>パスワードを入力してください</p>
          </div>
          <div style={{ ...card }}>
            <Field label="パスワード">
              <input
                type="password"
                value={passInput}
                onChange={(e) => { setPassInput(e.target.value); setPassError(false); }}
                onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
                placeholder="パスワードを入力"
                style={{ ...inp, borderColor: passError ? C.red : C.border }}
                autoFocus
              />
            </Field>
            {passError && <p style={{ color: C.red, fontSize: "13px", marginTop: "8px", marginBottom: 0 }}>パスワードが違います</p>}
            <div style={{ marginTop: "16px" }}>
              <Btn onClick={tryUnlock} loading={false} label="ログイン" color={C.accent} />
            </div>
          </div>
          <button onClick={() => setMode("cast")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "13px", textAlign: "center" }}>
            ← キャスト画面に戻る
          </button>
        </div>

      ) : (
        <>
          {/* サブバー */}
          <div style={{ background: "white", borderBottom: `1.5px solid ${C.border}`, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "36px" }}>
            <span style={{ fontSize: "11px", color: C.accent, fontWeight: "700", letterSpacing: "0.05em" }}>
              {mode === "cast"
                ? (loggedInCast ? `💕 ${loggedInCast}` : "💕 キャスト")
                : "👑 店舗管理"}
            </span>
            {mode === "admin" && (
              <button onClick={logout} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px" }}>ログアウト</button>
            )}
            {mode === "cast" && loggedInCast && (
              <button onClick={castLogout} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px" }}>退出</button>
            )}
          </div>

          {/* キャスト未ログイン */}
          {mode === "cast" && !loggedInCast ? (
            <CastLoginScreen casts={casts} onLogin={handleCastLogin} />
          ) : (
            <>
              {(mode === "admin" || (loggedInCast && !showShindan)) && (
                <nav style={{ background: "white", borderBottom: `1.5px solid ${C.border}`, display: "flex", overflowX: "auto", padding: "0 4px" }}>
                  {nav.map((n) => (
                    <button key={n.id} onClick={() => setPage(n.id)} style={{
                      flex: "0 0 auto",
                      padding: "10px 14px",
                      border: "none",
                      background: "none",
                      color: page === n.id ? C.accent : C.muted,
                      borderBottom: `3px solid ${page === n.id ? C.accent : "transparent"}`,
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: page === n.id ? "700" : "400",
                      whiteSpace: "nowrap",
                      transition: "all 0.2s",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                    }}>
                      <span style={{ fontSize: "15px" }}>{n.icon}</span>
                      {n.label}
                    </button>
                  ))}
                </nav>
              )}

              <div style={{ padding: "20px 16px", maxWidth: "680px", margin: "0 auto" }}>
                {mode === "cast" && showShindan && <ShindanPage casts={casts} setCasts={setCasts} loggedInCast={loggedInCast} onComplete={() => { setShowShindan(false); setCastPage("score"); }} />}
                {mode === "cast" && !showShindan && page === "score"       && <ScorePage casts={casts} settings={settings} scores={scores} setScores={setScores} loggedInCast={loggedInCast} onRetryDiagnosis={() => setShowShindan(true)} />}
                {mode === "cast" && !showShindan && page === "myguarantee" && <MyGuaranteePage casts={casts} scores={scores} settings={settings} loggedInCast={loggedInCast} />}

                {mode === "admin" && page === "guarantee" && <GuaranteePage casts={casts} scores={scores} settings={settings} />}
                {mode === "admin" && page === "cast"      && <CastPage casts={casts} setCasts={setCasts} scores={scores} />}
                {mode === "admin" && page === "ranking"   && <RankingPage scores={scores} />}
                {mode === "admin" && page === "title"     && <TitlePage casts={casts} />}
                {mode === "admin" && page === "settings"  && <SettingsPage settings={settings} setSettings={setSettings} />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 14px",
      borderRadius: "20px",
      border: active ? "none" : "1.5px solid rgba(255,255,255,0.6)",
      background: active ? "rgba(255,255,255,0.95)" : "transparent",
      color: active ? C.accent : "rgba(255,255,255,0.9)",
      fontWeight: "700",
      cursor: "pointer",
      fontSize: "12px",
      transition: "all 0.2s",
      boxShadow: active ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
    }}>{label}</button>
  );
}

// ============================================================
// キャストログイン
// ============================================================
function CastLoginScreen({ casts, onLogin }) {
  const [heavenId, setHeavenId]     = useState("");
  const [heavenPass, setHeavenPass] = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  // マウント時にlocalStorageからIDだけ読み込んでinputの初期値に設定
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CREDS_KEY);
      if (saved) {
        const creds = JSON.parse(saved);
        setHeavenId(creds.heavenId || "");
        // パスワードは復元しない（毎回入力）
      }
    } catch {}
  }, []); // マウント時のみ実行

  function handleLogin() {
    if (!heavenId || !heavenPass) { setError("IDとパスワードを入力してください"); return; }
    setLoading(true); setError("");
    const matched = casts.find((c) => c.heaven_id === heavenId && c.heaven_pass === heavenPass && c.is_active);
    setTimeout(() => {
      setLoading(false);
      if (matched) {
        // ログイン成功: IDのみlocalStorageに保存（パスワードは保存しない）
        localStorage.setItem(CREDS_KEY, JSON.stringify({ heavenId }));
        localStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify({
          castName: matched.name,
          heavenId,
          heavenPass,
          autoLogin: true,
        }));
        onLogin(matched.name);
      } else {
        setError("IDまたはパスワードが一致しません");
      }
    }, 800);
  }

  function clearSavedId() {
    localStorage.removeItem(CREDS_KEY);
    localStorage.removeItem(AUTO_LOGIN_KEY);
    setHeavenId("");
  }

  const hasSavedId = !!heavenId;

  return (
    <div style={{ padding: "40px 16px", maxWidth: "400px", margin: "0 auto", display: "grid", gap: "24px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "28px", background: "linear-gradient(135deg, #ff6b9d, #d946ef)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "34px", margin: "0 auto 16px", boxShadow: "0 6px 24px rgba(255,107,157,0.4)" }}>💕</div>
        <h2 style={{ fontSize: "22px", fontWeight: "700", color: C.text, margin: "0 0 6px", letterSpacing: "0.06em" }}>SHAMENIKKI AI</h2>
        <p style={{ color: C.muted, fontSize: "13px", margin: 0 }}>ヘブンネットのID・パスでログイン</p>
      </div>

      <div style={{ ...card, display: "grid", gap: "16px" }}>

        <Field label="ヘブンネットID">
          <div style={{ position: "relative" }}>
            <input
              value={heavenId}
              onChange={(e) => { setHeavenId(e.target.value); setError(""); }}
              placeholder="例：66033247"
              style={{ ...inp, borderColor: error ? C.red : C.border, paddingRight: hasSavedId ? "52px" : undefined }}
              inputMode="numeric"
            />
            {/* IDを記憶する：保存済みなら入力欄内に表示 */}
            {hasSavedId && (
              <button
                onClick={clearSavedId}
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: `${C.accent}18`, border: `1px solid ${C.accent}40`, borderRadius: "6px", padding: "2px 7px", fontSize: "10px", color: C.accent, cursor: "pointer", whiteSpace: "nowrap", fontWeight: "700" }}
              >消去</button>
            )}
          </div>
          {hasSavedId && (
            <p style={{ fontSize: "11px", color: C.green, margin: "4px 0 0", fontWeight: "600" }}>✓ IDを記憶しています</p>
          )}
        </Field>

        <Field label="パスワード">
          <input
            type="password"
            value={heavenPass}
            onChange={(e) => { setHeavenPass(e.target.value); setError(""); }}
            placeholder="パスワードを毎回入力してください"
            style={{ ...inp, borderColor: error ? C.red : C.border }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </Field>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: "12px", background: `${C.red}12`, border: `1.5px solid ${C.red}40` }}>
            <p style={{ color: C.red, fontSize: "13px", margin: 0 }}>{error}</p>
          </div>
        )}

        <Btn onClick={handleLogin} loading={loading} label={loading ? "確認中..." : "ログイン"} color={C.accent} />

        <p style={{ fontSize: "11px", color: C.muted, textAlign: "center", lineHeight: "1.6", margin: 0 }}>
          🔒 IDはこのアプリ内にのみ保存されます
        </p>
      </div>
    </div>
  );
}

// ============================================================
// 保証確認（キャスト）
// ============================================================
function MyGuaranteePage({ casts, scores, settings, loggedInCast }) {
  const selectedCast = loggedInCast || "";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayPosts = scores.filter((s) => new Date(s.posted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === today);

  function countValid(posts) {
    const sorted = [...posts].sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
    let count = 0, last = 0;
    for (const p of sorted) {
      const t = new Date(p.posted_at).getTime();
      if (count === 0 || t - last >= settings.repeat_limit_min * 60000) { count++; last = t; }
    }
    return count;
  }

  const myPosts = todayPosts.filter((p) => p.cast_name === selectedCast);
  const valid = countValid(myPosts);
  const latest = myPosts[myPosts.length - 1];
  const textLen = latest?.diary?.length || 0;
  const hasImg = latest?.has_image === true;
  const textOk = textLen >= settings.min_text_length;
  const imgOk = settings.image_required ? hasImg : true;
  const countOk = valid >= settings.daily_post_goal;
  const allOk = countOk && textOk && imgOk;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="保証条件確認" sub="今日の保証達成状況" color={C.green} />

      {selectedCast && (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ ...card, textAlign: "center", padding: "32px", background: allOk ? "linear-gradient(135deg, #e8fff8, #d0fff0)" : "linear-gradient(135deg, #fff0f4, #ffe0e8)", borderColor: allOk ? `${C.green}60` : `${C.red}50` }}>
            <p style={{ fontSize: "40px", marginBottom: "10px" }}>{allOk ? "🎉" : "😢"}</p>
            <p style={{ fontSize: "22px", fontWeight: "700", color: allOk ? C.green : C.red, margin: 0 }}>
              {allOk ? "保証条件達成！" : "まだ未達です"}
            </p>
          </div>

          <div style={{ ...card, display: "grid", gap: "10px" }}>
            <CheckItem label={`投稿数：${valid} / ${settings.daily_post_goal}件`} ok={countOk} />
            <CheckItem label={`文字数：${textLen} / ${settings.min_text_length}文字`} ok={textOk} />
            {settings.image_required && <CheckItem label="画像あり" ok={imgOk} />}
          </div>

          {myPosts.length > 0 && (
            <div style={{ ...card }}>
              <p style={{ fontSize: "11px", color: C.muted, marginBottom: "12px", fontWeight: "700", letterSpacing: "0.05em" }}>今日の投稿</p>
              {myPosts.map((p) => (
                <div key={p.id} style={{ padding: "12px", background: C.surface, borderRadius: "12px", marginBottom: "8px", border: `1.5px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: C.muted }}>{new Date(p.posted_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
                    <ScoreBadge score={p.score} />
                  </div>
                  <p style={{ fontSize: "13px", color: C.sub, margin: 0 }}>{p.diary.slice(0, 40)}...</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// タイプ診断
// ============================================================
const QUESTIONS = [
  { id: "q1",  text: "前職はオフィス系・医療・教育など、いわゆる「きちんとした職業」でしたか？",  type: "清楚" },
  { id: "q2",  text: "実家は礼儀やマナーを大切にする家庭でしたか？",                              type: "清楚" },
  { id: "q3",  text: "非日常な場所や状況にドキドキ・ワクワクすることはありますか？",              type: "エロ" },
  { id: "q4",  text: "好きな人に対して自分から積極的にアプローチするタイプですか？",              type: "エロ" },
  { id: "q5",  text: "好きな人や大切な人に尽くすことが大好きですか？",                            type: "M系" },
  { id: "q6",  text: "相手のために「何でもしてあげたい」と思うことがよくありますか？",            type: "M系" },
  { id: "q7",  text: "グループや関係の中でリードしたり主導権を握るのが好きですか？",              type: "S系" },
  { id: "q8",  text: "相手をドキドキさせたり、振り回すのが好きですか？",                          type: "S系" },
  { id: "q9",  text: "自分のことを「かわいい」と思いますか？",                                    type: "かわいい" },
  { id: "q10", text: "写真を撮られたり、自分の写真をSNSに上げるのが好きですか？",                 type: "かわいい" },
];

const TYPE_INFO = {
  "清楚系":     { emoji: "🌸", color: "#b39ddb", desc: "育ちの良さ・上品さが武器。知性と清潔感で差をつけられます。" },
  "エロ系":     { emoji: "🔥", color: "#ff5c7a", desc: "欲求に正直な魅力が最大の武器。大胆さをアピールしましょう。" },
  "M系":        { emoji: "🎀", color: "#ff6b9d", desc: "尽くす姿勢と従順さが魅力。癒しと奉仕の文章が刺さります。" },
  "S系":        { emoji: "👑", color: "#ffb347", desc: "支配力とリード感が魅力。主導権を握るキャラで差別化できます。" },
  "かわいい系": { emoji: "💕", color: "#7b9eff", desc: "見た目の可愛さと自己表現が武器。写真映えするキャラを前面に。" },
};

// ============================================================
// タイプマッピング・リライトプロンプト・ロックフック
// ============================================================
function mapToCanonicalType(raw) {
  if (!raw) return null;
  const CANONICAL = ["清楚系", "エロ系", "M系", "S系", "かわいい系"];
  if (CANONICAL.includes(raw)) return raw;
  if (/清楚|上品/.test(raw)) return "清楚系";
  if (/エロ|色気|官能/.test(raw)) return "エロ系";
  if (/M系|尽くす|従順/.test(raw)) return "M系";
  if (/S系|女王|支配/.test(raw)) return "S系";
  if (/かわいい|可愛|キュート/.test(raw)) return "かわいい系";
  return "清楚系";
}

const REWRITE_PROMPTS = {
  "清楚系":     "あなたは上品で清楚な風俗嬢のブログライターです。以下の文章を、育ちの良さと上品さが伝わり、お客様に丁寧で優しい配慮が感じられる清潔感ある文章にリライトしてください。絵文字・顔文字は控えめに、上品な雰囲気を損なわない範囲で自然に散りばめてください（例：🌸 ✨ ☕ など）。ヘブンネットの写メ日記を見ているお客様が「この子に会いに行きたい」と感じるよう、清楚な魅力が伝わる惹きつける文章にアレンジしてください。",
  "エロ系":     "あなたは色気と大人の魅力がある風俗嬢のブログライターです。以下の文章を、官能的で艶っぽく、思わずドキッとする誘惑的な文章にリライトしてください。絵文字・顔文字は色気と艶っぽさを演出するものを自然に散りばめてください（例：🔥 💋 😈 🌙 など）。ヘブンネットの写メ日記を見ているお客様が「この子に会いに行きたい」と思わず体が動くような、官能的で惹きつける文章にアレンジしてください。",
  "かわいい系": "あなたは元気で明るいかわいい風俗嬢のブログライターです。以下の文章を、読んだ人が笑顔になって元気をもらえるキュートで楽しい文章にリライトしてください。絵文字・顔文字はポップで明るいものを多めに自然に散りばめてください（例：💕 🌈 🎀 ✨ 😊 ♡ など）。ヘブンネットの写メ日記を見ているお客様が「この子に会いに行きたい！」とときめく、かわいさ全開で惹きつける文章にアレンジしてください。",
  "M系":        "あなたは従順で甘えた雰囲気の風俗嬢のブログライターです。以下の文章を、相手に尽くし、お客様の願望を優しく受け入れる従順で甘えた雰囲気の文章にリライトしてください。絵文字・顔文字は甘えた雰囲気や切なさを表すものを自然に散りばめてください（例：🥺 💓 🙏 😳 ♡ など）。ヘブンネットの写メ日記を見ているお客様が「この子を守ってあげたい・会いに行きたい」と感じる、守ってあげたくなる可愛らしさと従順さが伝わる惹きつける文章にアレンジしてください。",
  "S系":        "あなたはSMクラブの女王様のような風俗嬢のブログライターです。以下の文章を、自信に満ちて凛とした、少し挑発的で魅惑的な文章にリライトしてください。絵文字・顔文字は女王様の威厳や挑発的な雰囲気を演出するものを効果的に散りばめてください（例：👑 😏 💅 🖤 ⛓ など）。ヘブンネットの写メ日記を見ているお客様が「この女王様に会いに行かなければ」と引き寄せられるような、圧倒的な存在感と魅惑で惹きつける文章にアレンジしてください。",
};

const TITLE_PROMPTS = {
  "清楚系":     "あなたは上品で清楚な風俗嬢のブログタイトルライターです。以下の本文に合った、ヘブンネットの写メ日記でお客様がクリックしたくなる清楚で上品なタイトルを1つだけ生成してください。絵文字を1〜2個自然に使い、20文字以内で簡潔にまとめてください。タイトルのみ返してください。",
  "エロ系":     "あなたは色気のある風俗嬢のブログタイトルライターです。以下の本文に合った、ヘブンネットの写メ日記でお客様が思わずクリックしたくなる官能的で惹きつけるタイトルを1つだけ生成してください。絵文字を1〜2個自然に使い、20文字以内で簡潔にまとめてください。タイトルのみ返してください。",
  "かわいい系": "あなたはかわいい風俗嬢のブログタイトルライターです。以下の本文に合った、ヘブンネットの写メ日記でお客様が「かわいい！」と思ってクリックしたくなるポップで明るいタイトルを1つだけ生成してください。絵文字を1〜2個自然に使い、20文字以内で簡潔にまとめてください。タイトルのみ返してください。",
  "M系":        "あなたは甘えた雰囲気の風俗嬢のブログタイトルライターです。以下の本文に合った、ヘブンネットの写メ日記でお客様が「守ってあげたい・会いに行きたい」と感じてクリックしたくなる甘えた可愛らしいタイトルを1つだけ生成してください。絵文字を1〜2個自然に使い、20文字以内で簡潔にまとめてください。タイトルのみ返してください。",
  "S系":        "あなたは女王様キャラの風俗嬢のブログタイトルライターです。以下の本文に合った、ヘブンネットの写メ日記でお客様が「この女王様に会いに行かなければ」と感じてクリックしたくなる自信に満ちた挑発的なタイトルを1つだけ生成してください。絵文字を1〜2個自然に使い、20文字以内で簡潔にまとめてください。タイトルのみ返してください。",
};

function useCastTypeLock(castId) {
  const key = castId ? `cast_type_${castId}` : null;
  const [lockData, setLockData] = useState({ type: null, retries: 0 });
  const lockLoaded = useRef(false);

  useEffect(() => {
    if (!key || lockLoaded.current) return;
    lockLoaded.current = true;
    try {
      const saved = localStorage.getItem(key);
      if (saved) setLockData(JSON.parse(saved));
    } catch {}
  }, [key]);

  function saveLock(updates) {
    setLockData((prev) => {
      const next = { ...prev, ...updates };
      if (key) { try { localStorage.setItem(key, JSON.stringify(next)); } catch {} }
      return next;
    });
  }

  function resetLock() {
    setLockData({ type: null, retries: 0 });
    if (key) { try { localStorage.removeItem(key); } catch {} }
  }

  return [lockData, saveLock, resetLock];
}

function ShindanPage({ casts, setCasts, loggedInCast, onComplete }) {
  const [step, setStep] = useState("questions");
  const castName = loggedInCast || "";
  const cast = casts.find((c) => c.name === castName);
  const castId = cast?.heaven_id || castName;
  const [lockData, saveLock] = useCastTypeLock(castId);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [note, setNote] = useState("");
  const [disclose, setDisclose] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function answer(val) {
    const newAnswers = { ...answers, [QUESTIONS[currentQ].id]: val };
    setAnswers(newAnswers);
    if (currentQ < QUESTIONS.length - 1) setCurrentQ(currentQ + 1);
    else setStep("disclosure");
  }

  function calcType(ans) {
    const sc = { "清楚": 0, "エロ": 0, "M系": 0, "S系": 0, "かわいい": 0 };
    QUESTIONS.forEach((q) => {
      if (ans[q.id] === "YES") sc[q.type] += 2;
      else if (ans[q.id] === "どちらでも") sc[q.type] += 1;
    });
    const max = Math.max(...Object.values(sc));
    return Object.keys(sc).find((k) => sc[k] === max) + "系";
  }

  async function analyzeAndSave() {
    setStep("result"); setLoading(true);
    const typeGuess = calcType(answers);
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_XAI_API_KEY}` },
        body: JSON.stringify({
          model: "grok-4.3", max_tokens: 800,
          messages: [{ role: "user", content: `あなたはエンタメ業界のパーソナリティコンサルタントです。スタッフのキャラクター診断結果を分析して、自己PR文と写真のアドバイスをしてください。\n\nスタッフ名：${castName}\n診断回答：\n${QUESTIONS.map((q) => `・${q.text} → ${answers[q.id] || "未回答"}`).join("\n")}\n備考：${note || "なし"}\n判定キャラクター：${typeGuess}\n\n以下のフォーマットで返答してください：\n\nキャラクター判定：${typeGuess}\n\nあなたの魅力\n・\n・\n・\n\nおすすめ自己PR文スタイル\n・\n\nブログで使えるフレーズ例\n・\n・\n\n写真撮影のアドバイス\n・\n・` }]
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      setResult({ type: typeGuess, detail: text });
      setCasts((prev) => prev.map((c) => c.name === castName ? { ...c, type: typeGuess, disclose, shindan_note: disclose === "YES" ? note : null } : c));
    } catch { setResult({ type: typeGuess, detail: "分析中にエラーが発生しました。" }); }
    saveLock({ type: typeGuess, retries: lockData.retries + 1 });
    setLoading(false);
  }

  if (lockData.retries >= 2 && step !== "result") {
    const lockedTypeInfo = lockData.type ? TYPE_INFO[mapToCanonicalType(lockData.type)] : null;
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <Header title="タイプ診断" sub="ロック中" color={C.muted} />
        <div style={{ ...card, textAlign: "center", padding: "32px 20px" }}>
          <p style={{ fontSize: "40px", marginBottom: "12px" }}>🔒</p>
          <p style={{ fontWeight: "700", color: C.text, fontSize: "16px", marginBottom: "6px" }}>やり直し回数の上限です</p>
          <p style={{ color: C.muted, fontSize: "13px", marginBottom: "20px", lineHeight: "1.7" }}>
            これ以上やり直しはできません。<br />店舗の管理画面から解除してください。
          </p>
          {lockedTypeInfo && (
            <div style={{ ...card, background: `linear-gradient(135deg, ${lockedTypeInfo.color}14, ${lockedTypeInfo.color}08)`, borderColor: `${lockedTypeInfo.color}50`, padding: "24px" }}>
              <p style={{ fontSize: "32px", marginBottom: "8px" }}>{lockedTypeInfo.emoji}</p>
              <p style={{ fontSize: "18px", fontWeight: "700", color: lockedTypeInfo.color, margin: 0 }}>確定タイプ：{lockData.type}</p>
            </div>
          )}
        </div>
      {onComplete && <div style={{ marginTop: "4px" }}><Btn onClick={onComplete} loading={false} label="メインへ進む" color={C.accent} /></div>}
      </div>
    );
  }

  if (step === "questions") {
    const q = QUESTIONS[currentQ];
    const progress = Math.round((currentQ / QUESTIONS.length) * 100);
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Header title={`質問 ${currentQ + 1} / ${QUESTIONS.length}`} sub="" color={C.accent} />
          <button onClick={() => { if (currentQ > 0) setCurrentQ(currentQ - 1); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "13px" }}>← 戻る</button>
        </div>

        <div style={{ height: "6px", background: C.border, borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #ff6b9d, #d946ef)", borderRadius: "4px", transition: "width 0.3s" }} />
        </div>

        <div style={{ ...card, padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "16px", lineHeight: "1.8", fontWeight: "500", marginBottom: "28px", color: C.text }}>{q.text}</p>
          <div style={{ display: "grid", gap: "10px" }}>
            {["YES", "NO", "どちらでも"].map((opt) => (
              <button key={opt} onClick={() => answer(opt)} style={{
                padding: "15px",
                borderRadius: "14px",
                border: `1.5px solid ${C.border}`,
                background: "white",
                color: C.text,
                fontSize: "15px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = `${C.accent}12`; e.currentTarget.style.color = C.accent; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "white"; e.currentTarget.style.color = C.text; }}
              >
                {opt === "YES" ? "✓ YES" : opt === "NO" ? "✗ NO" : "〜 どちらでも"}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === "disclosure") return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="最後に一つだけ" sub="" color={C.accent} />
      <div style={{ ...card }}>
        <p style={{ fontSize: "14px", lineHeight: "1.8", marginBottom: "20px", color: C.sub }}>
          備考欄に自由に書いていただくと、AIがより精度の高いアドバイスをお伝えできます。<br /><br />
          <span style={{ color: C.yellow, fontWeight: "700" }}>この内容を店舗スタッフに開示しますか？</span><br />
          <span style={{ fontSize: "13px", color: C.muted }}>開示するとAIと店長の両方からサポートが受けられます。NOの場合はAIのみが参照します。</span>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
          {[["YES", "開示する", C.green], ["NO", "開示しない", C.pink]].map(([val, lbl, col]) => (
            <button key={val} onClick={() => setDisclose(val)} style={{
              padding: "14px", borderRadius: "14px",
              border: `2px solid ${disclose === val ? col : C.border}`,
              background: disclose === val ? `${col}18` : "white",
              color: disclose === val ? col : C.muted,
              fontWeight: "700", cursor: "pointer", transition: "all 0.2s",
            }}>{lbl}</button>
          ))}
        </div>

        <Field label="備考（任意）">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="何でもOK。詳しいほど精度が上がります" style={{ ...inp, minHeight: "100px" }} />
        </Field>
        <div style={{ marginTop: "16px" }}>
          <Btn onClick={analyzeAndSave} loading={!disclose} label="診断結果を見る" color={C.accent} />
        </div>
        {!disclose && <p style={{ textAlign: "center", color: C.muted, fontSize: "12px", marginTop: "8px" }}>開示するかどうかを選んでください</p>}
      </div>
    </div>
  );

  if (step === "result") {
    const typeInfo = result ? TYPE_INFO[result.type] : null;
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <Header title="診断結果" sub="あなたのタイプが判明しました" color={C.accent} />
        {loading ? (
          <div style={{ ...card, textAlign: "center", padding: "48px" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✨</div>
            <p style={{ color: C.muted, margin: 0 }}>AIが分析中です...</p>
          </div>
        ) : result && typeInfo ? (
          <>
            <div style={{ ...card, textAlign: "center", padding: "36px", background: `linear-gradient(135deg, ${typeInfo.color}14, ${typeInfo.color}08)`, borderColor: `${typeInfo.color}50` }}>
              <p style={{ fontSize: "52px", marginBottom: "10px" }}>{typeInfo.emoji}</p>
              <p style={{ fontSize: "28px", fontWeight: "700", color: typeInfo.color, marginBottom: "10px" }}>{result.type}</p>
              <p style={{ fontSize: "14px", color: C.sub, lineHeight: "1.7", margin: 0 }}>{typeInfo.desc}</p>
            </div>
            <div style={{ ...card }}>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px", color: C.sub }}>{result.detail}</p>
            </div>
            {onComplete && (
              <Btn onClick={onComplete} loading={false} label={`✨ ${result.type}で確定してメインへ進む`} color={typeInfo.color} />
            )}
            {lockData.retries >= 2
              ? <div style={{ padding: "12px 16px", borderRadius: "12px", background: `${C.muted}10`, border: `1.5px solid ${C.muted}30`, textAlign: "center" }}>
                  <p style={{ color: C.muted, fontSize: "13px", margin: 0 }}>🔒 店舗の管理画面からやり直しを解除してください</p>
                </div>
              : <Btn onClick={() => { setStep("questions"); setAnswers({}); setCurrentQ(0); setNote(""); setDisclose(null); setResult(null); }} loading={false} label="もう一度診断する" color={C.muted} />
            }
          </>
        ) : null}
      </div>
    );
  }

  return null;
}

// ============================================================
// サポート設定フック（キャストIDごとにlocalStorage永続化）
// ============================================================
function useSupportSettings(castId) {
  const key = castId ? `support_settings_${castId}` : null;
  const [support, setSupport] = useState({ imageSupport: true, textSupport: true, titleAssist: true });
  const loaded = useRef(false);

  useEffect(() => {
    if (!key || loaded.current) return;
    loaded.current = true;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const { imageSupport, textSupport, titleAssist } = JSON.parse(saved);
        setSupport({
          imageSupport: typeof imageSupport === "boolean" ? imageSupport : true,
          textSupport:  typeof textSupport  === "boolean" ? textSupport  : true,
          titleAssist:  typeof titleAssist  === "boolean" ? titleAssist  : true,
        });
      }
    } catch {}
  }, [key]);

  function update(patch) {
    setSupport((prev) => {
      const next = { ...prev, ...patch };
      if (key) { try { localStorage.setItem(key, JSON.stringify(next)); } catch {} }
      return next;
    });
  }

  return [support.imageSupport, support.textSupport, support.titleAssist, update];
}

// ============================================================
// AI採点（画像指導統合）
// ============================================================
function ScorePage({ casts, settings, scores, setScores, loggedInCast, onRetryDiagnosis }) {
  const castName = loggedInCast || "";
  const cast = casts.find((c) => c.name === castName);
  const castId = cast?.heaven_id || castName;
  const [imageSupport, textSupport, titleAssist, updateSupport] = useSupportSettings(castId);
  const [diary, setDiary] = useState("");
  const [title, setTitle] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [imageResult, setImageResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rating, setRating] = useState(null);
  const [postedTime, setPostedTime] = useState(null);

  useEffect(() => {
    return () => { if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl); };
  }, [originalPreviewUrl]);

  useEffect(() => {
    return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); };
  }, [imagePreviewUrl]);

  const [confirmedType, setConfirmedType] = useState(null);
  const [typeRetries, setTypeRetries] = useState(0);
  useEffect(() => {
    if (!castId) return;
    try {
      const saved = localStorage.getItem(`cast_type_${castId}`);
      if (saved) {
        const { type, retries } = JSON.parse(saved);
        setConfirmedType(mapToCanonicalType(type));
        setTypeRetries(retries || 0);
      }
    } catch {}
  }, [castId]);
  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    if (imagePreviewUrl && imagePreviewUrl !== originalPreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    setOriginalPreviewUrl(null);
    setImageResult(null);

    const origUrl = URL.createObjectURL(file);
    setOriginalPreviewUrl(origUrl);

    let finalFile = file;
    let finalUrl = origUrl;
    if (imageSupport) {
      setProcessing(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("https://cast-ais.com/process", { method: "POST", body: fd });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        finalUrl = URL.createObjectURL(blob);
        finalFile = new File([blob], file.name, { type: "image/jpeg" });
      } catch { /* use original */ }
      setProcessing(false);
    }
    setImageFile(finalFile);
    setImagePreviewUrl(finalUrl);
  }

  function clearImage() {
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    if (imagePreviewUrl && imagePreviewUrl !== originalPreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setOriginalPreviewUrl(null);
    setImagePreviewUrl(null);
    setImageResult(null);
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const charCount = diary.length;
  const charShort = Math.max(settings.min_text_length - charCount, 0);

  function getRating(score) {
    if (score >= 80) return { label: "良",  color: C.green,  desc: "非常に良い・このまま使える" };
    if (score >= 60) return { label: "普",  color: C.yellow, desc: "平均的・もう少し工夫できる" };
    return             { label: "改善", color: C.red,    desc: "改善で大きく伸びる" };
  }

  function pickSection(text, title) {
    const all = ["総合点", "投稿ルールチェック", "改善提案", "良い点", "改善点", "改善タイトル案", "キャラクター分析"];
    const start = text.indexOf(title);
    if (start === -1) return "";
    let end = text.length;
    for (const t of all) {
      const idx = text.indexOf(t, start + title.length);
      if (idx !== -1 && idx < end) end = idx;
    }
    return text.slice(start, end).trim().replace(title, "").replace(/^[\n：:]+/, "").trim();
  }

  async function handleScore() {
    if (!diary.trim()) return alert("写メ日記本文を入力してください");
    setLoading(true); setResult(null); setRating(null); setImageResult(null);
    const autoPostedAt = new Date();
    const autoPostedAtISO = autoPostedAt.toISOString();
    const autoTimeStr = autoPostedAt.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    setPostedTime(autoTimeStr);

    const type = confirmedType || "清楚系";

    // Step 1: 本文AIリライト（textSupport ON のとき）
    let finalDiary = diary;
    if (textSupport) {
      try {
        const rwRes = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_XAI_API_KEY}` },
          body: JSON.stringify({
            model: "grok-4.3", max_tokens: 800,
            messages: [
              { role: "system", content: REWRITE_PROMPTS[type] },
              { role: "user", content: `以下の写メ日記をリライトしてください。内容・情報は維持しつつ、指定スタイルの文章に書き換えてください。\n\n${diary}` }
            ]
          })
        });
        const rwData = await rwRes.json();
        const rewritten = rwData.choices?.[0]?.message?.content;
        if (rewritten) { finalDiary = rewritten; setDiary(rewritten); }
      } catch { /* use original */ }
    }

    const charCountFinal = finalDiary.length;
    const charShortFinal = Math.max(settings.min_text_length - charCountFinal, 0);

    let scoreText = "";
    let sc = 0;
    try {
      // Step 2: AI採点・タイトル生成・画像分析を並列実行
      const scoreReqPromise = textSupport
        ? fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_XAI_API_KEY}` },
            body: JSON.stringify({
              model: "grok-4.3", max_tokens: 1000,
              messages: [{ role: "user", content: `あなたはエンタメ業界のブログコンサルタントです。スタッフのブログ記事を分析・採点してください。\n\n【投稿ルール】\n最低文字数：${settings.min_text_length}文字 / 今回：${charCountFinal}文字 / 不足：${charShortFinal}文字\n画像必須：${settings.image_required ? "あり" : "なし"} / 画像：${imageFile ? "あり" : "なし"}\n\n必ず以下のフォーマットで返答してください：\n\n総合点：○○点\n\n投稿ルールチェック\n・文字数判定：達成 or 文字数不足\n・画像判定：達成 or 画像不足\n\n改善提案\n・\n・\n\n良い点\n・\n・\n\n改善点\n・\n・\n\n改善タイトル案\n・\n・\n\nキャラクター分析\n・\n\n【スタッフ名】${castName}\n【ブログ本文】${finalDiary}` }]
            })
          })
        : Promise.resolve(null);

      const titleGenPromise = titleAssist
        ? fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_XAI_API_KEY}` },
            body: JSON.stringify({
              model: "grok-4.3", max_tokens: 100,
              messages: [
                { role: "system", content: TITLE_PROMPTS[type] },
                { role: "user", content: `本文：${finalDiary}\n\nこの本文に合うタイトルを1つ生成してください。タイトルのみ返してください。` }
              ]
            })
          })
        : Promise.resolve(null);

      const imageAnalysisPromise = (imageSupport && imageFile)
        ? toBase64(imageFile).then((base64) => fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_XAI_API_KEY}` },
            body: JSON.stringify({
              model: "grok-4.3",
              max_tokens: 1000,
              messages: [{
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: base64 } },
                  { type: "text", text: `あなたはヘブンの写メ日記専門の画像アドバイザーです。お客様が「会いたい」と思える写真にするため、具体的で読みやすいアドバイスをしてください。\n\nキャスト名：${castName || "未設定"}\n\n以下の3項目を出力してください。専門的すぎる説明や長い項目分けは不要です。\n\n📷 全体の印象\n・この写真を一言で表すと（率直に）\n\n✨ 良い点（2個）\n①（良いポイントと、なぜ魅力的かを一文で）\n②（同上）\n\n📸 改善ポイント（3〜4個）\n①（問題点）→（どう直すと良いか具体的に一文で）\n②（同上）\n③（同上）\n④（あれば）\n\n※女の子がすぐ実践できる内容で。角度・明るさ・ポーズ・構図・加工などを中心に。` },
                ],
              }],
            }),
          }))
        : Promise.resolve(null);

      const [scoreRes, titleRes, imgRes] = await Promise.all([scoreReqPromise, titleGenPromise, imageAnalysisPromise]);

      if (scoreRes) {
        const scoreData = await scoreRes.json();
        scoreText = scoreData.choices?.[0]?.message?.content || "結果を取得できませんでした";
        const scoreMatch = scoreText.match(/(\d+)点/);
        sc = scoreMatch ? Number(scoreMatch[1]) : 50;
        setResult(scoreText);
        setRating(getRating(sc));
      }

      if (titleRes) {
        const titleData = await titleRes.json();
        const generated = titleData.choices?.[0]?.message?.content;
        if (generated) setTitle(generated.trim());
      }

      if (imgRes) {
        const imgData = await imgRes.json();
        setImageResult(imgData.choices?.[0]?.message?.content || null);
      }
    } catch { if (textSupport) setResult("エラーが発生しました。もう一度お試しください。"); }
    finally {
      setScores((prev) => [{ id: Date.now(), cast_name: castName, diary: finalDiary, result: scoreText, posted_at: autoPostedAtISO, has_image: !!imageFile, score: sc }, ...prev]);
      setLoading(false);
    }
  }

  const sections = ["投稿ルールチェック", "改善提案", "良い点", "改善点", "改善タイトル案", "キャラクター分析"];
  const imgStyle = { width: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: "12px", border: `1.5px solid ${C.border}`, display: "block", background: "#fdf0f8" };

  const confirmedTypeInfo = confirmedType ? TYPE_INFO[confirmedType] : null;
  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {confirmedTypeInfo && (
        <div style={{ ...card, textAlign: "center", padding: "28px 20px", background: `linear-gradient(135deg, ${confirmedTypeInfo.color}14, ${confirmedTypeInfo.color}08)`, borderColor: `${confirmedTypeInfo.color}50` }}>
          <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", marginBottom: "12px", letterSpacing: "0.1em" }}>あなたのタイプ</p>
          <p style={{ fontSize: "44px", marginBottom: "8px" }}>{confirmedTypeInfo.emoji}</p>
          <p style={{ fontSize: "26px", fontWeight: "700", color: confirmedTypeInfo.color, marginBottom: "8px" }}>{confirmedType}</p>
          <p style={{ fontSize: "13px", color: C.sub, lineHeight: "1.7", marginBottom: typeRetries < 2 && onRetryDiagnosis ? "16px" : "0" }}>{confirmedTypeInfo.desc}</p>
          {typeRetries < 2 && onRetryDiagnosis && (
            <button onClick={onRetryDiagnosis} style={{ padding: "7px 20px", borderRadius: "20px", border: `1.5px solid ${C.muted}40`, background: "white", color: C.muted, fontSize: "12px", cursor: "pointer", fontWeight: "700" }}>
              やり直す
            </button>
          )}
          {typeRetries >= 2 && (
            <p style={{ fontSize: "11px", color: C.muted, margin: "0" }}>🔒 店舗の管理画面からやり直しを解除してください</p>
          )}
        </div>
      )}
      <Header title="写メ日記AI採点" sub="文章・画像・タイトル指導" color={C.accent} />

      {/* AIサポート設定トグル */}
      <div style={{ ...card, padding: "16px 20px" }}>
        <p style={{ fontSize: "11px", color: C.sub, fontWeight: "700", letterSpacing: "0.06em", marginBottom: "12px" }}>AIサポート設定</p>
        <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
          <Toggle checked={imageSupport} onChange={(v) => updateSupport({ imageSupport: v })} label="📸 画像AIサポート" />
          <Toggle checked={textSupport}  onChange={(v) => updateSupport({ textSupport: v })}  label="✏️ 文章AIサポート" />
          <Toggle checked={titleAssist}  onChange={(v) => updateSupport({ titleAssist: v })}  label="📝 タイトルアシスト" />
        </div>
        {!imageSupport && !textSupport && !titleAssist && (
          <p style={{ fontSize: "12px", color: C.muted, margin: "10px 0 0", padding: "8px 12px", background: `${C.muted}10`, borderRadius: "8px" }}>
            AIサポートOFF：入力・投稿・記録は引き続き使えます
          </p>
        )}
      </div>

      {/* メインフォーム（常に表示） */}
      <div style={{ ...card, display: "grid", gap: "16px" }}>
        <div style={{ padding: "10px 14px", borderRadius: "12px", background: `linear-gradient(135deg, ${C.accent}15, ${C.accent2}10)`, border: `1.5px solid ${C.accent}30`, display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>💕</span>
          <span style={{ fontWeight: "700", color: C.accent }}>{castName}</span>
          <span style={{ color: C.muted, fontSize: "12px" }}>さんの投稿</span>
        </div>

        {/* タイトル入力（常に表示） */}
        <Field label={
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>タイトル</span>
            {titleAssist && <span style={{ fontSize: "10px", color: C.accent2, fontWeight: "700" }}>📝 タイトルアシストON：AI採点時に自動生成</span>}
          </span>
        }>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titleAssist ? "空欄でもAIが自動生成します" : "タイトルを入力"} style={inp} />
        </Field>

        {/* 本文入力（常に表示） */}
        <Field label={
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>写メ日記本文</span>
            <span style={{ color: charShort > 0 ? C.red : C.green }}>{charCount}文字 {charShort > 0 ? `(あと${charShort}文字)` : "✓"}</span>
          </span>
        }>
          <textarea value={diary} onChange={(e) => setDiary(e.target.value)} placeholder={textSupport ? "入力後「AI採点する」でAIが自動リライトします..." : "写メ日記本文を入力..."} style={{ ...inp, minHeight: "160px", resize: "vertical" }} />
        </Field>

        {textSupport && !confirmedType && (
          <p style={{ fontSize: "11px", color: C.muted, margin: "-8px 0 0", paddingLeft: "2px" }}>💡 タイプ診断を完了すると、タイプ別リライトが適用されます（未診断は清楚系で処理）</p>
        )}

        {/* 画像アップロード（常に表示・補正はimageSupport ONのみ） */}
        <div>
          <p style={{ fontSize: "11px", color: C.sub, marginBottom: "8px", fontWeight: "700", letterSpacing: "0.06em" }}>
            投稿画像{imageSupport ? "（ヘブン自動投稿 ＋ 画像指導AI分析）" : "（ヘブン自動投稿用）"}
          </p>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: "none" }} />

          {processing ? (
            <div style={{ width: "100%", padding: "40px 16px", border: `2px dashed ${C.accent}60`, borderRadius: "14px", background: "white", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "32px" }}>✨</span>
              <span style={{ fontSize: "14px", color: C.accent, fontWeight: "700" }}>画像を加工中...✨</span>
            </div>
          ) : originalPreviewUrl ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {imageSupport ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", marginBottom: "6px", textAlign: "center" }}>補正前</p>
                      <img src={originalPreviewUrl} alt="補正前" style={imgStyle} />
                    </div>
                    <div>
                      <p style={{ fontSize: "11px", color: C.pink, fontWeight: "700", marginBottom: "6px", textAlign: "center" }}>補正後 ✨</p>
                      {imagePreviewUrl
                        ? <img src={imagePreviewUrl} alt="補正後" style={imgStyle} />
                        : <div style={{ ...imgStyle, minHeight: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: "12px", color: C.muted }}>補正中...</span></div>
                      }
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {["明るさ補正", "コントラスト", "美肌フィルター", "シャープネス"].map((t) => (
                      <span key={t} style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: `${C.pink}15`, color: C.pink, border: `1px solid ${C.pink}30`, fontWeight: "700" }}>{t}</span>
                    ))}
                  </div>
                  {imagePreviewUrl && (
                    <a href={imagePreviewUrl} download="corrected.jpg" style={{ display: "block", padding: "10px", borderRadius: "10px", border: `1.5px solid ${C.green}50`, background: `${C.green}10`, color: C.green, textAlign: "center", fontWeight: "700", fontSize: "12px", textDecoration: "none" }}>
                      ⬇ 補正後の画像をダウンロード
                    </a>
                  )}
                </>
              ) : (
                <img src={originalPreviewUrl} alt="プレビュー" style={imgStyle} />
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: C.green, fontWeight: "700" }}>✓ {imageFile?.name}</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: "8px", padding: "4px 10px", fontSize: "11px", color: C.muted, cursor: "pointer" }}>変更</button>
                  <button type="button" onClick={clearImage} style={{ background: "none", border: `1.5px solid ${C.red}40`, borderRadius: "8px", padding: "4px 10px", fontSize: "11px", color: C.red, cursor: "pointer" }}>削除</button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ width: "100%", padding: "24px 16px", border: `2px dashed ${C.accent}60`, borderRadius: "14px", background: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <span style={{ fontSize: "32px" }}>📷</span>
              <span style={{ fontSize: "14px", color: C.accent, fontWeight: "700" }}>画像を選択する</span>
              <span style={{ fontSize: "11px", color: C.muted }}>JPG / PNG / HEIC</span>
            </button>
          )}
        </div>

        {/* 時刻記録 + 送信ボタン（常に表示） */}
        <div style={{ padding: "10px 14px", borderRadius: "12px", background: `${C.green}12`, border: `1.5px solid ${C.green}30`, display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: C.muted }}>🔒 投稿時刻は送信した瞬間に自動記録されます</span>
          {postedTime && <span style={{ marginLeft: "auto", color: C.green, fontWeight: "700", fontSize: "14px" }}>{postedTime}</span>}
        </div>
        <Btn onClick={handleScore} loading={loading} label={(textSupport || titleAssist) ? "AI採点する" : "投稿記録する"} color={C.accent} />
      </div>

      {/* AI採点結果（textSupport ON時のみ） */}
      {textSupport && result && rating && (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ ...card, display: "flex", alignItems: "center", gap: "16px", borderColor: `${rating.color}50` }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${rating.color}18`, border: `2px solid ${rating.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "700", color: rating.color, flexShrink: 0 }}>{rating.label}</div>
            <div>
              <p style={{ color: rating.color, fontWeight: "700", fontSize: "18px", margin: "0 0 4px" }}>{result.match(/総合点：(\d+点)/)?.[1] || ""}</p>
              <p style={{ color: C.muted, fontSize: "13px", margin: 0 }}>{rating.desc}</p>
            </div>
          </div>

          {sections.map((sec) => {
            const text = pickSection(result, sec);
            if (!text) return null;
            return (
              <div key={sec} style={{ ...card }}>
                <p style={{ color: C.accent, fontSize: "11px", fontWeight: "700", marginBottom: "10px", letterSpacing: "0.08em" }}>{sec}</p>
                <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px", color: C.sub, margin: 0 }}>{text}</p>
              </div>
            );
          })}

          {imageSupport && imageResult && (
            <div style={{ ...card, borderColor: `${C.pink}40` }}>
              <p style={{ color: C.pink, fontSize: "11px", fontWeight: "700", marginBottom: "12px", letterSpacing: "0.08em" }}>📸 画像指導AI分析</p>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.9", fontSize: "14px", color: C.sub, margin: 0 }}>{imageResult}</p>
            </div>
          )}
        </div>
      )}

      {/* ヘブン投稿（投稿記録後は常に表示） */}
      {postedTime && (
        <HeavenPostButton castName={castName} diary={diary} title={title} result={result} casts={casts} postedTime={postedTime} imageFile={imageFile} imagePreviewUrl={imagePreviewUrl} />
      )}
    </div>
  );
}

// ============================================================
// ヘブン投稿
// ============================================================
function HeavenPostButton({ castName, diary, title, result, casts, postedTime, imageFile, imagePreviewUrl }) {
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [postError, setPostError] = useState(null);
  const [editTitle, setEditTitle] = useState(title || "");
  const [editDiary, setEditDiary] = useState(diary || "");

  useEffect(() => { setEditTitle(title || ""); }, [title]);
  useEffect(() => { setEditDiary(diary || ""); }, [diary]);

  const cast = casts.find((c) => c.name === castName);
  const hasCredentials = cast?.heaven_id && cast?.heaven_pass;
  const VPS_URL = "http://160.251.166.73:3000";

  async function handlePost() {
    setShowConfirm(false); setPosting(true);
    try {
      const formData = new FormData();
      formData.append("heavenId", cast.heaven_id);
      formData.append("heavenPass", cast.heaven_pass);
      formData.append("title", editTitle);
      formData.append("body", editDiary);
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch(`${VPS_URL}/post`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) { setPosted(true); setPostError(null); }
      else setPostError(data.message || "投稿に失敗しました");
    } catch (e) { setPostError("サーバーに接続できませんでした: " + e.message); }
    setPosting(false);
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ ...card, borderColor: `${C.yellow}50` }}>
        <p style={{ color: C.yellow, fontSize: "11px", fontWeight: "700", marginBottom: "12px", letterSpacing: "0.08em" }}>投稿内容プレビュー（編集可）</p>
        <label style={{ fontSize: "11px", color: C.muted, display: "block", marginBottom: "6px", fontWeight: "700", letterSpacing: "0.06em" }}>タイトル</label>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="タイトルを入力"
          style={{ ...inp, fontWeight: "700", marginBottom: "14px" }}
        />
        <label style={{ fontSize: "11px", color: C.muted, display: "block", marginBottom: "6px", fontWeight: "700", letterSpacing: "0.06em" }}>本文</label>
        <textarea
          value={editDiary}
          onChange={(e) => setEditDiary(e.target.value)}
          placeholder="本文を入力"
          style={{ ...inp, minHeight: "120px", resize: "vertical", whiteSpace: "pre-wrap", margin: 0 }}
        />
        {imagePreviewUrl && (
          <div style={{ marginTop: "12px" }}>
            <p style={{ fontSize: "11px", color: C.muted, marginBottom: "6px" }}>添付画像</p>
            <img src={imagePreviewUrl} alt="添付" style={{ width: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: "10px", border: `1.5px solid ${C.border}`, display: "block", background: "#fdf0f8" }} />
          </div>
        )}
      </div>

      {!hasCredentials && (
        <div style={{ padding: "12px", borderRadius: "12px", background: `${C.red}10`, border: `1.5px solid ${C.red}30` }}>
          <p style={{ fontSize: "13px", color: C.red, margin: 0 }}>⚠️ キャスト管理でヘブンID/パスを登録してください</p>
        </div>
      )}

      {posted ? (
        <div style={{ padding: "20px", borderRadius: "16px", background: `${C.green}15`, border: `1.5px solid ${C.green}40`, textAlign: "center" }}>
          <p style={{ fontSize: "32px", marginBottom: "8px" }}>🎉</p>
          <p style={{ color: C.green, fontWeight: "700", fontSize: "16px", margin: "0 0 4px" }}>ヘブンへの投稿完了！</p>
          <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>自動投稿されました</p>
        </div>
      ) : null}

      {postError && (
        <div style={{ padding: "12px", borderRadius: "12px", background: `${C.red}10`, border: `1.5px solid ${C.red}30` }}>
          <p style={{ fontSize: "13px", color: C.red, margin: 0 }}>❌ {postError}</p>
        </div>
      )}

      {showConfirm && (
        <div style={{ ...card, borderColor: `${C.yellow}50` }}>
          <p style={{ fontWeight: "700", marginBottom: "8px", color: C.text }}>ヘブンに自動投稿しますか？</p>
          <p style={{ fontSize: "13px", color: C.muted, marginBottom: "16px" }}>VPSサーバー経由でヘブンに自動投稿します。</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button onClick={() => setShowConfirm(false)} style={{ padding: "12px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "white", color: C.muted, cursor: "pointer", fontWeight: "700" }}>キャンセル</button>
            <button onClick={handlePost} style={{ padding: "12px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #ff6b9d, #d946ef)", color: "white", cursor: "pointer", fontWeight: "700" }}>投稿する</button>
          </div>
        </div>
      )}

      {!posted && !showConfirm && (
        <button onClick={() => setShowConfirm(true)} disabled={posting} style={{ padding: "16px", borderRadius: "16px", border: "none", background: posting ? C.surface : "linear-gradient(135deg, #ff6b9d, #d946ef)", color: posting ? C.muted : "white", fontWeight: "700", fontSize: "15px", cursor: posting ? "not-allowed" : "pointer", boxShadow: posting ? "none" : "0 4px 20px rgba(255,107,157,0.4)" }}>
          ヘブンに投稿する
        </button>
      )}

      {posted && (
        <button onClick={() => setPosted(false)} style={{ padding: "12px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "white", color: C.muted, cursor: "pointer", fontSize: "13px" }}>
          もう一度投稿する
        </button>
      )}
    </div>
  );
}

// ============================================================
// タイトル指導
// ============================================================
function TitlePage({ casts }) {
  const [castName, setCastName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const active = casts.filter((c) => c.is_active);

  async function analyze() {
    if (!title.trim()) return alert("タイトルを入力してください");
    setLoading(true); setResult(null);
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_XAI_API_KEY}` },
        body: JSON.stringify({
          model: "grok-4.3", max_tokens: 800,
          messages: [{ role: "user", content: `風俗店の写メ日記タイトルを分析してください。\n\nタイトル：${title}\n本文：${body || "（未入力）"}\nキャスト：${castName || "未設定"}\n\n以下のフォーマットで返答してください：\n\nタイトル評価：良 or 普 or 改善\n\n良い点\n・\n\n改善点\n・\n\n改善タイトル案（3つ）\n1.\n2.\n3.\n\nクリックされやすい理由\n・` }]
        })
      });
      const data = await res.json();
      setResult(data.choices?.[0]?.message?.content || "エラー");
    } catch { setResult("エラーが発生しました"); }
    setLoading(false);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="タイトル指導" sub="クリック率を上げるタイトル分析" color={C.pink} />
      <div style={{ ...card, display: "grid", gap: "16px" }}>
        <Field label="キャスト名">
          <select value={castName} onChange={(e) => setCastName(e.target.value)} style={inp}>
            <option value="">選択してください</option>
            {active.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="タイトル">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="写メ日記のタイトルを入力" style={inp} />
        </Field>
        <Field label="本文（任意）">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="本文があればより精度が上がります" style={{ ...inp, minHeight: "100px" }} />
        </Field>
        <Btn onClick={analyze} loading={loading} label="タイトルを分析する" color={C.pink} />
      </div>
      {result && (
        <div style={{ ...card }}>
          <p style={{ color: C.pink, fontSize: "11px", fontWeight: "700", marginBottom: "12px", letterSpacing: "0.08em" }}>分析結果</p>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px", color: C.sub, margin: 0 }}>{result}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// キャスト管理
// ============================================================
function CastPage({ casts, setCasts, scores }) {
  const [modal, setModal] = useState(null);
  const [modalId, setModalId] = useState("");
  const [modalPass, setModalPass] = useState("");
  const [modalSaved, setModalSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [tab, setTab] = useState("list");
  const [lockRefresh, setLockRefresh] = useState(0);

  function resetDiagLock(c) {
    try { localStorage.removeItem(`cast_type_${c.heaven_id || c.name}`); } catch {}
    setLockRefresh((n) => n + 1);
  }

  function toggle(name) { setCasts(casts.map((c) => c.name === name ? { ...c, is_active: !c.is_active } : c)); }
  function addCast() {
    if (!newName.trim()) return;
    setCasts([...casts, { name: newName.trim(), is_active: true, work_start: newStart, strong: "未分析", weak: "未分析", heaven_id: "", heaven_pass: "" }]);
    setNewName(""); setNewStart("");
  }
  function openModal(c) { setModal(c); setModalId(c.heaven_id || ""); setModalPass(c.heaven_pass || ""); setModalSaved(false); }
  function saveModal() {
    setCasts(casts.map((x) => x.name === modal.name ? { ...x, heaven_id: modalId, heaven_pass: modalPass } : x));
    setModalSaved(true);
    setTimeout(() => setModal(null), 1000);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="キャスト管理" sub="得意・苦手分析と成長サポート" color={C.green} />

      {modal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(61,26,78,0.55)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "white", border: `1.5px solid ${C.border}`, borderRadius: "24px", padding: "28px", width: "100%", maxWidth: "400px", boxShadow: "0 20px 60px rgba(255,107,157,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <p style={{ fontWeight: "700", fontSize: "18px", color: C.text, margin: "0 0 4px" }}>{modal.name}</p>
                <p style={{ color: C.accent, fontSize: "12px", margin: 0 }}>ヘブンネット ログイン情報</p>
              </div>
              <button onClick={() => setModal(null)} style={{ background: `${C.accent}15`, border: "none", width: "32px", height: "32px", borderRadius: "50%", fontSize: "18px", cursor: "pointer", color: C.accent, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ display: "grid", gap: "14px" }}>
              <Field label="ヘブンID">
                <input value={modalId} onChange={(e) => setModalId(e.target.value)} placeholder="例：66033247" style={inp} inputMode="numeric" />
              </Field>
              <Field label="パスワード">
                <input type="password" value={modalPass} onChange={(e) => setModalPass(e.target.value)} placeholder="パスワードを入力" style={inp} />
              </Field>
              <div style={{ padding: "10px", borderRadius: "10px", background: `${C.yellow}15`, border: `1.5px solid ${C.yellow}30` }}>
                <p style={{ fontSize: "11px", color: C.sub, margin: 0 }}>🔒 ID/パスはこのアプリ内にのみ保存されます</p>
              </div>
              {modalSaved ? (
                <div style={{ padding: "14px", borderRadius: "14px", background: `${C.green}15`, border: `1.5px solid ${C.green}40`, textAlign: "center" }}>
                  <p style={{ color: C.green, fontWeight: "700", margin: 0 }}>✅ 保存しました！</p>
                </div>
              ) : (
                <Btn onClick={saveModal} loading={false} label="保存する" color={C.accent} />
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        {[["list", "キャスト一覧"], ["add", "新規追加"]].map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 18px", borderRadius: "20px", border: `1.5px solid ${tab === t ? C.accent : C.border}`, background: tab === t ? `${C.accent}18` : "white", color: tab === t ? C.accent : C.muted, fontWeight: "700", cursor: "pointer", fontSize: "13px", transition: "all 0.2s" }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "add" && (
        <div style={{ ...card, display: "grid", gap: "14px" }}>
          <Field label="キャスト名"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名前を入力" style={inp} /></Field>
          <Field label="出勤開始時間"><input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} style={inp} /></Field>
          <Btn onClick={addCast} loading={false} label="追加する" color={C.green} />
        </div>
      )}

      {tab === "list" && (
        <div style={{ display: "grid", gap: "10px" }}>
          {casts.map((c) => {
            let diagData = null;
            try { const s = localStorage.getItem(`cast_type_${c.heaven_id || c.name}`); if (s) diagData = JSON.parse(s); } catch {}
            const isLocked = (diagData?.retries ?? 0) >= 2;
            return (
            <div key={c.name} style={{ ...card, borderColor: c.is_active ? `${C.green}40` : C.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <p style={{ fontWeight: "700", fontSize: "15px", margin: 0, color: C.text }}>{c.name}</p>
                    <span style={{ fontSize: "11px", color: c.is_active ? C.green : C.muted, background: `${c.is_active ? C.green : C.muted}18`, padding: "3px 10px", borderRadius: "20px", fontWeight: "700" }}>{c.is_active ? "在籍中" : "停止中"}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <Tag label={`得意：${c.strong}`} color={C.green} />
                    <Tag label={`苦手：${c.weak}`} color={C.yellow} />
                    {c.heaven_id ? <Tag label="ヘブン✓" color={C.accent} /> : <Tag label="ヘブン未設定" color={C.muted} />}
                    {diagData?.type && <Tag label={`${diagData.type}${isLocked ? " 🔒" : ""}`} color={isLocked ? C.red : C.blue} />}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px" }}>
                  <button onClick={() => openModal(c)} style={{ padding: "6px 12px", borderRadius: "10px", border: `1.5px solid ${C.accent}40`, background: `${C.accent}12`, color: C.accent, fontWeight: "700", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }}>
                    ID設定
                  </button>
                  <button onClick={() => toggle(c.name)} style={{ padding: "6px 12px", borderRadius: "10px", border: `1.5px solid ${c.is_active ? C.red : C.green}40`, background: `${c.is_active ? C.red : C.green}12`, color: c.is_active ? C.red : C.green, fontWeight: "700", cursor: "pointer", fontSize: "11px" }}>
                    {c.is_active ? "停止" : "再開"}
                  </button>
                  {diagData?.type && (
                    <button onClick={() => resetDiagLock(c)} style={{ padding: "6px 12px", borderRadius: "10px", border: `1.5px solid ${C.yellow}60`, background: `${C.yellow}12`, color: C.yellow, fontWeight: "700", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }}>
                      {isLocked ? "診断解除" : "診断リセット"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 保証管理（管理者）
// ============================================================
function GuaranteePage({ casts, scores, settings }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayPosts = scores.filter((s) => new Date(s.posted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === today);

  function countValid(posts) {
    const sorted = [...posts].sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
    let count = 0, last = 0;
    for (const p of sorted) {
      const t = new Date(p.posted_at).getTime();
      if (count === 0 || t - last >= settings.repeat_limit_min * 60000) { count++; last = t; }
    }
    return count;
  }

  const rows = casts.filter((c) => c.is_active).map((c) => {
    const posts = todayPosts.filter((p) => p.cast_name === c.name);
    const valid = countValid(posts);
    const latest = posts[posts.length - 1];
    const textLen = latest?.diary?.length || 0;
    const hasImg = latest?.has_image === true;
    const textOk = textLen >= settings.min_text_length;
    const imgOk = settings.image_required ? hasImg : true;
    const countOk = valid >= settings.daily_post_goal;
    return { ...c, valid, textLen, hasImg, textOk, imgOk, countOk, ok: countOk && textOk && imgOk };
  });

  const doneCount = rows.filter((r) => r.ok).length;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="保証条件チェック" sub="保証達成状況の自動判定" color={C.yellow} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ ...card, textAlign: "center", borderColor: `${C.green}40`, background: `${C.green}08` }}>
          <p style={{ color: C.muted, fontSize: "11px", marginBottom: "8px", fontWeight: "700", letterSpacing: "0.05em" }}>達成</p>
          <p style={{ fontSize: "40px", fontWeight: "700", color: C.green, margin: "0 0 4px" }}>{doneCount}</p>
          <p style={{ color: C.muted, fontSize: "11px", margin: 0 }}>名</p>
        </div>
        <div style={{ ...card, textAlign: "center", borderColor: `${C.red}40`, background: `${C.red}08` }}>
          <p style={{ color: C.muted, fontSize: "11px", marginBottom: "8px", fontWeight: "700", letterSpacing: "0.05em" }}>未達</p>
          <p style={{ fontSize: "40px", fontWeight: "700", color: C.red, margin: "0 0 4px" }}>{rows.length - doneCount}</p>
          <p style={{ color: C.muted, fontSize: "11px", margin: 0 }}>名</p>
        </div>
      </div>

      <div style={{ ...card, padding: "12px 16px", background: `${C.accent}06` }}>
        <p style={{ fontSize: "12px", color: C.muted, margin: 0 }}>
          目標{settings.daily_post_goal}件 / 連投除外{settings.repeat_limit_min}分 / 最低{settings.min_text_length}文字 {settings.image_required ? "/ 画像必須" : ""}
        </p>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {rows.map((r) => (
          <div key={r.name} style={{ ...card, borderColor: r.ok ? `${C.green}40` : `${C.red}30` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <p style={{ fontWeight: "700", fontSize: "15px", margin: 0, color: C.text }}>{r.name}</p>
              <span style={{ padding: "4px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", background: r.ok ? `${C.green}18` : `${C.red}15`, color: r.ok ? C.green : C.red }}>
                {r.ok ? "保証達成" : "未達"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <CheckItem label={`投稿数 ${r.valid}/${settings.daily_post_goal}件`} ok={r.countOk} />
              <CheckItem label={`文字数 ${r.textLen}文字`} ok={r.textOk} />
              {settings.image_required && <CheckItem label="画像" ok={r.imgOk} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ランキング
// ============================================================
function RankingPage({ scores }) {
  const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="AI採点ランキング" sub="総合スコア上位" color={C.yellow} />

      {sorted.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "48px", color: C.muted }}>まだ採点データがありません</div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {sorted.map((s, i) => (
            <div key={s.id} style={{ ...card, borderColor: i === 0 ? `${C.yellow}60` : C.border, background: i === 0 ? `linear-gradient(135deg, #fffbe8, white)` : "white" }}>
              <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <div style={{ fontSize: "22px", flexShrink: 0, width: "32px", textAlign: "center" }}>{medals[i] || `${i + 1}`}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <p style={{ fontWeight: "700", margin: 0, color: C.text }}>{s.cast_name}</p>
                    <ScoreBadge score={s.score} large />
                  </div>
                  <p style={{ fontSize: "13px", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0 0 8px" }}>{s.diary}</p>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <Tag label={s.has_image ? "画像◎" : "画像なし"} color={s.has_image ? C.green : C.muted} />
                    <Tag label={new Date(s.posted_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} color={C.muted} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 設定
// ============================================================
function SettingsPage({ settings, setSettings }) {
  const [local, setLocal] = useState({ ...settings, show_guarantee: settings.show_guarantee ?? true });
  function save() { setSettings(local); alert("保存しました！"); }

  const fields = [
    { key: "daily_post_goal",  label: "1日の目標投稿数",    unit: "件" },
    { key: "repeat_limit_min", label: "連投除外時間",        unit: "分" },
    { key: "min_text_length",  label: "最低文字数",          unit: "文字" },
    { key: "before_work_min",  label: "出勤前投稿ルール",    unit: "分前まで" },
    { key: "after_work_min",   label: "退勤後投稿ルール",    unit: "分以内" },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="店舗ルール設定" sub="保証条件を設定します" color={C.muted} />
      <div style={{ ...card, display: "grid", gap: "16px" }}>
        {fields.map(({ key, label, unit }) => (
          <Field key={key} label={label}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="number" value={local[key]} onChange={(e) => setLocal({ ...local, [key]: Number(e.target.value) })} style={{ ...inp, flex: 1 }} />
              <span style={{ color: C.muted, fontSize: "13px", whiteSpace: "nowrap" }}>{unit}</span>
            </div>
          </Field>
        ))}
        <Toggle checked={local.image_required} onChange={(v) => setLocal({ ...local, image_required: v })} label="画像必須" />

        <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", fontWeight: "700" }}>キャスト画面の表示設定</p>
          <Toggle checked={local.show_guarantee} onChange={(v) => setLocal({ ...local, show_guarantee: v })} label="保証確認をキャスト画面に表示する" />
          <p style={{ fontSize: "11px", color: C.muted, marginTop: "6px", paddingLeft: "54px", margin: "6px 0 0 54px" }}>
            OFFにするとキャストは保証状況を確認できません
          </p>
        </div>

        <Btn onClick={save} loading={false} label="保存する" color={C.accent} />
      </div>
    </div>
  );
}

// ============================================================
// 共通コンポーネント
// ============================================================
function Header({ title, sub, color }) {
  return (
    <div style={{ marginBottom: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <div style={{ width: "4px", height: "22px", borderRadius: "2px", background: `linear-gradient(180deg, ${color}, ${color}66)` }} />
        <h1 style={{ fontSize: "19px", fontWeight: "700", color: C.text, margin: 0, letterSpacing: "0.02em" }}>{title}</h1>
      </div>
      {sub && <p style={{ color: C.muted, fontSize: "12px", paddingLeft: "14px", margin: 0 }}>{sub}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: "11px", color: C.sub, display: "block", marginBottom: "6px", fontWeight: "700", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );
}

function Btn({ onClick, loading, label, color }) {
  const bg = color || C.accent;
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: "14px",
      borderRadius: "14px",
      border: "none",
      background: loading ? C.surface : `linear-gradient(135deg, ${bg}, ${bg}cc)`,
      color: loading ? C.muted : "white",
      fontWeight: "700",
      fontSize: "14px",
      cursor: loading ? "not-allowed" : "pointer",
      width: "100%",
      boxShadow: loading ? "none" : `0 4px 16px ${bg}44`,
      transition: "all 0.2s",
      letterSpacing: "0.04em",
    }}>
      {loading ? "処理中..." : label}
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
      <div onClick={() => onChange(!checked)} style={{ width: "44px", height: "26px", borderRadius: "13px", background: checked ? "linear-gradient(135deg, #ff6b9d, #d946ef)" : C.border, display: "flex", alignItems: "center", padding: "3px", transition: "all 0.3s", flexShrink: 0, boxShadow: checked ? "0 2px 8px rgba(255,107,157,0.4)" : "none" }}>
        <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "white", transform: checked ? "translateX(18px)" : "translateX(0)", transition: "transform 0.3s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
      </div>
      <span style={{ fontSize: "14px", color: C.sub }}>{label}</span>
    </label>
  );
}

function Tag({ label, color }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: `${color}15`, color, border: `1.5px solid ${color}30`, fontWeight: "700" }}>{label}</span>
  );
}

function CheckItem({ label, ok }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "12px", background: ok ? `${C.green}10` : `${C.red}08`, border: `1.5px solid ${ok ? C.green : C.red}30` }}>
      <span style={{ fontSize: "14px" }}>{ok ? "✅" : "❌"}</span>
      <span style={{ fontSize: "13px", color: C.sub, fontWeight: "500" }}>{label}</span>
    </div>
  );
}

function ScoreBadge({ score, large }) {
  const color = score >= 70 ? C.green : score >= 50 ? C.yellow : C.red;
  return (
    <span style={{ color, fontWeight: "700", fontSize: large ? "20px" : "14px" }}>{score}点</span>
  );
}

export default App;
