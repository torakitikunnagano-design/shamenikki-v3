"use client";

import { useState, useEffect, useRef } from "react";

// Google Fontsをロード（クライアント側のみ - useEffect内で実行）

// ============================================================
// カラー・スタイル定数（ポップ女子向け）
// ============================================================
const C = {
  bg: "#fff5f9",
  surface: "#ffffff",
  card: "#ffffff",
  border: "#ffd6e7",
  accent: "#ff6eb4",
  green: "#4ecb8d",
  red: "#ff4d6d",
  yellow: "#ffb347",
  pink: "#ff6eb4",
  purple: "#c77dff",
  blue: "#74b9ff",
  text: "#3d2b3d",
  muted: "#b39dac",
};

const card = {
  background: "#ffffff",
  border: `1.5px solid ${C.border}`,
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 2px 12px rgba(255,110,180,0.08)",
};

const inp = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1.5px solid ${C.border}`,
  background: "#fff5f9",
  color: C.text,
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
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
  show_guarantee: true, // キャスト画面に保証確認を表示するか
};

const initScores = [
  { id: 1, cast_name: "さくら", diary: "今日もお仕事頑張ってます！みなさんに会えるのが楽しみで、毎日元気いっぱい出勤してます。趣味の料理で新しいレシピ試したら大成功でした♪", result: "総合点：78点\n\n保証条件チェック\n・文字数判定：達成\n・画像判定：達成\n\n保証改善提案\n・タイトルをもっとキャッチーにすると反応UP\n\n良い点\n・元気な印象が伝わる\n・日常感があり親近感がある\n\n改善点\n・もう少し感情表現を入れると良い\n\n改善タイトル案\n・「料理上手な彼女♪新レシピ大成功です！」\n・「今日も元気に出勤♡待ってます！」", posted_at: new Date().toISOString(), has_image: true, score: 78 },
  { id: 2, cast_name: "みお", diary: "雨の日は家でゆっくり映画を見るのが好きです。最近ハマっているのはラブストーリー系で、感動して泣いてしまいました。そんな感受性豊かな私に会いに来てください！", result: "総合点：85点\n\n保証条件チェック\n・文字数判定：達成\n・画像判定：達成\n\n保証改善提案\n・具体的な映画名を入れるとより個性が出る\n\n良い点\n・彼女感が強く出ている\n・感情表現が豊か\n\n改善点\n・締めの一文がもう少し誘い感があると良い\n\n改善タイトル案\n・「雨の日は映画で号泣中…♡」\n・「感受性豊かな私に会いに来て♪」", posted_at: new Date(Date.now() - 3600000).toISOString(), has_image: true, score: 85 },
  { id: 3, cast_name: "りな", diary: "お疲れ様です", result: "総合点：32点\n\n保証条件チェック\n・文字数判定：文字数不足（保証対象外の可能性があります）\n・画像判定：画像不足のため保証条件未達の可能性があります\n\n保証改善提案\n・最低100文字必要です。自己紹介や今日の気分を追記してください\n\n良い点\n・挨拶ができている\n\n改善点\n・文字数が大幅に不足\n・画像がない\n\n改善タイトル案\n・「今日もよろしくお願いします♪」", posted_at: new Date(Date.now() - 7200000).toISOString(), has_image: false, score: 32 },
];

// ============================================================
// メインアプリ（キャスト画面 / 店舗管理画面 分離）
// ============================================================
const ADMIN_PASSWORD = "1234"; // ← ここで管理パスワードを変更できます

function App() {
  // Google Fontsをクライアント側で読み込む
  useEffect(() => {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap";
    document.head.appendChild(fontLink);
  }, []);

  const [mode, setMode] = useState("cast"); // "cast" | "admin"
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [castPage, setCastPage] = useState("shindan");
  const [adminPage, setAdminPage] = useState("guarantee");
  const [casts, setCasts] = useState(initCasts);
  const [scores, setScores] = useState(initScores);
  const [settings, setSettings] = useState(initSettings);
  const [loggedInCast, setLoggedInCast] = useState(null); // ログイン中のキャスト名

  function tryUnlock() {
    if (passInput === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setPassError(false);
      setPassInput("");
    } else {
      setPassError(true);
      setPassInput("");
    }
  }

  function logout() {
    setAdminUnlocked(false);
    setMode("cast");
  }

  function castLogout() {
    setLoggedInCast(null);
    setCastPage("shindan");
  }

  const castNav = [
    { id: "shindan", label: "タイプ診断", emoji: "💎" },
    { id: "score", label: "AI採点", emoji: "✦" },
    { id: "image", label: "画像指導", emoji: "⬡" },
    ...(settings.show_guarantee ? [{ id: "myguarantee", label: "保証確認", emoji: "◈" }] : []),
  ];

  const adminNav = [
    { id: "guarantee", label: "保証管理", emoji: "◈" },
    { id: "cast", label: "キャスト", emoji: "◎" },
    { id: "ranking", label: "ランキング", emoji: "★" },
    { id: "title", label: "タイトル", emoji: "✎" },
    { id: "settings", label: "設定", emoji: "⚙" },
  ];

  const page = mode === "cast" ? castPage : adminPage;
  const setPage = mode === "cast" ? setCastPage : setAdminPage;
  const nav = mode === "cast" ? castNav : adminNav;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Zen Maru Gothic', 'Hiragino Kaku Gothic Pro', sans-serif" }}>

      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #ff6eb4, #c77dff)", padding: "14px 20px", display: "flex", alignItems: "center", gap: "10px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(255,110,180,0.3)" }}>
        <span style={{ fontSize: "20px" }}>💎</span>
        <span style={{ color: "white", fontWeight: "bold", fontSize: "15px", letterSpacing: "0.08em" }}>SHAMENIKKI AI</span>

        {/* モード切替 */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button onClick={() => setMode("cast")} style={{ padding: "6px 14px", borderRadius: "20px", border: "none", background: mode === "cast" ? "white" : "rgba(255,255,255,0.25)", color: mode === "cast" ? C.pink : "white", fontWeight: "bold", cursor: "pointer", fontSize: "12px" }}>
            👩 キャスト
          </button>
          <button onClick={() => setMode("admin")} style={{ padding: "6px 14px", borderRadius: "20px", border: "none", background: mode === "admin" ? "white" : "rgba(255,255,255,0.25)", color: mode === "admin" ? C.purple : "white", fontWeight: "bold", cursor: "pointer", fontSize: "12px" }}>
            🏪 管理
          </button>
        </div>
      </div>

      {/* 管理画面：パスワードロック */}
      {mode === "admin" && !adminUnlocked ? (
        <div style={{ padding: "40px 20px", maxWidth: "400px", margin: "0 auto", display: "grid", gap: "16px" }}>
          <div style={{ textAlign: "center", marginBottom: "8px" }}>
            <p style={{ fontSize: "48px", marginBottom: "8px" }}>🔐</p>
            <h2 style={{ fontSize: "22px", fontWeight: "bold", color: C.text }}>店舗管理画面</h2>
            <p style={{ color: C.muted, fontSize: "13px", marginTop: "4px" }}>パスワードを入力してください</p>
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
            {passError && <p style={{ color: C.red, fontSize: "13px", marginTop: "6px" }}>❌ パスワードが違います</p>}
            <div style={{ marginTop: "14px" }}>
              <Btn onClick={tryUnlock} loading={false} label="ログイン 🔓" color={C.purple} />
            </div>
          </div>
          <button onClick={() => setMode("cast")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "13px" }}>
            ← キャスト画面に戻る
          </button>
        </div>

      ) : (
        <>
          {/* モードバッジ */}
          <div style={{ background: mode === "cast" ? "linear-gradient(90deg, #fff0f6, #f8f0ff)" : "linear-gradient(90deg, #fff8f0, #fffff0)", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "12px", color: mode === "cast" ? C.pink : C.yellow, fontWeight: "bold" }}>
              {mode === "cast" ? `👩 ${loggedInCast ? loggedInCast + "さん" : "キャスト画面"}` : "🏪 店舗管理画面"}
            </span>
            {mode === "admin" && (
              <button onClick={logout} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px" }}>ログアウト</button>
            )}
            {mode === "cast" && loggedInCast && (
              <button onClick={castLogout} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px" }}>退出</button>
            )}
          </div>

          {/* キャストが未ログインの場合はID/パス入力画面を表示 */}
          {mode === "cast" && !loggedInCast ? (
            <CastLoginScreen casts={casts} onLogin={(name) => { setLoggedInCast(name); setCastPage("shindan"); }} />
          ) : (
            <>
              {/* ナビ */}
              {(mode === "admin" || loggedInCast) && (
                <div style={{ background: "white", borderBottom: `1.5px solid ${C.border}`, display: "flex", overflowX: "auto" }}>
                  {nav.map((n) => (
                    <button key={n.id} onClick={() => setPage(n.id)} style={{ flex: "0 0 auto", padding: "10px 16px", border: "none", background: "none", color: page === n.id ? (mode === "cast" ? C.pink : C.purple) : C.muted, borderBottom: `3px solid ${page === n.id ? (mode === "cast" ? C.pink : C.purple) : "transparent"}`, cursor: "pointer", fontSize: "11px", fontWeight: page === n.id ? "bold" : "normal", whiteSpace: "nowrap", transition: "all 0.2s" }}>
                      <div style={{ fontSize: "16px", marginBottom: "2px" }}>{n.emoji}</div>
                      {n.label}
                    </button>
                  ))}
                </div>
              )}

              {/* ページコンテンツ */}
              <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
                {/* キャスト画面 */}
                {mode === "cast" && page === "shindan"     && <ShindanPage casts={casts} setCasts={setCasts} loggedInCast={loggedInCast} />}
                {mode === "cast" && page === "score"       && <ScorePage casts={casts} settings={settings} scores={scores} setScores={setScores} loggedInCast={loggedInCast} />}
                {mode === "cast" && page === "myguarantee" && <MyGuaranteePage casts={casts} scores={scores} settings={settings} loggedInCast={loggedInCast} />}
                {mode === "cast" && page === "image"       && <ImagePage casts={casts} loggedInCast={loggedInCast} />}

                {/* 管理画面 */}
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

// ============================================================
// キャストログイン画面（ヘブンID/パスで照合）
// ============================================================
function CastLoginScreen({ casts, onLogin }) {
  const [heavenId, setHeavenId] = useState("");
  const [heavenPass, setHeavenPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleLogin() {
    if (!heavenId || !heavenPass) { setError("IDとパスワードを入力してください"); return; }
    setLoading(true);
    setError("");

    // キャスト管理に登録済みのID/パスと照合
    const matched = casts.find((c) => c.heaven_id === heavenId && c.heaven_pass === heavenPass && c.is_active);

    setTimeout(() => {
      setLoading(false);
      if (matched) {
        onLogin(matched.name);
      } else {
        setError("IDまたはパスワードが一致しません");
      }
    }, 800);
  }

  return (
    <div style={{ padding: "40px 20px", maxWidth: "400px", margin: "0 auto", display: "grid", gap: "20px" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "52px", marginBottom: "8px" }}>💎</p>
        <h2 style={{ fontSize: "22px", fontWeight: "bold", color: C.text }}>SHAMENIKKI AI</h2>
        <p style={{ color: C.muted, fontSize: "13px", marginTop: "6px" }}>ヘブンネットのID・パスワードでログイン</p>
      </div>

      <div style={{ ...card, display: "grid", gap: "14px" }}>
        <Field label="ヘブンネットID">
          <input
            value={heavenId}
            onChange={(e) => { setHeavenId(e.target.value); setError(""); }}
            placeholder="例：66033247"
            style={{ ...inp, borderColor: error ? C.red : C.border }}
            inputMode="numeric"
          />
        </Field>

        <Field label="パスワード">
          <input
            type="password"
            value={heavenPass}
            onChange={(e) => { setHeavenPass(e.target.value); setError(""); }}
            placeholder="パスワードを入力"
            style={{ ...inp, borderColor: error ? C.red : C.border }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </Field>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: "10px", background: `${C.red}11`, border: `1px solid ${C.red}33` }}>
            <p style={{ color: C.red, fontSize: "13px" }}>❌ {error}</p>
          </div>
        )}

        <Btn onClick={handleLogin} loading={loading} label={loading ? "確認中..." : "ログイン 💎"} color={C.pink} />

        <p style={{ fontSize: "11px", color: C.muted, textAlign: "center", lineHeight: "1.6" }}>
          🔒 入力情報はこのアプリ内のみで使用されます
        </p>
      </div>
    </div>
  );
}

// ============================================================
// ============================================================
function MyGuaranteePage({ casts, scores, settings, loggedInCast }) {
  const [selectedCast] = useState(loggedInCast || "");
  const activeCasts = casts.filter((c) => c.is_active);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayPosts = scores.filter((s) => {
    return new Date(s.posted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === today;
  });

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
      <Header title="保証条件確認" sub="今日の自分の保証達成状況" color={C.green} />

      <Field label="自分の名前を選択">
        <select value={selectedCast} onChange={(e) => setSelectedCast(e.target.value)} style={inp}>
          <option value="">選択してください</option>
          {activeCasts.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </Field>

      {selectedCast && (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ ...card, textAlign: "center", padding: "28px", borderColor: allOk ? `${C.green}44` : `${C.red}44` }}>
            <p style={{ fontSize: "40px", marginBottom: "8px" }}>{allOk ? "🎉" : "😢"}</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: allOk ? C.green : C.red }}>
              {allOk ? "保証条件達成！" : "まだ未達です"}
            </p>
          </div>

          <div style={{ ...card, display: "grid", gap: "12px" }}>
            <CheckItem label={`投稿数：${valid} / ${settings.daily_post_goal}件`} ok={countOk} />
            <CheckItem label={`文字数：${textLen} / ${settings.min_text_length}文字`} ok={textOk} />
            {settings.image_required && <CheckItem label="画像あり" ok={imgOk} />}
          </div>

          {/* 今日の投稿一覧 */}
          {myPosts.length > 0 && (
            <div style={{ ...card }}>
              <p style={{ fontSize: "12px", color: C.muted, marginBottom: "10px" }}>今日の投稿</p>
              {myPosts.map((p) => (
                <div key={p.id} style={{ padding: "10px", background: "#fff5f9", borderRadius: "8px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: C.muted }}>{new Date(p.posted_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ color: p.score >= 70 ? C.green : C.yellow, fontWeight: "bold", fontSize: "13px" }}>{p.score}点</span>
                  </div>
                  <p style={{ fontSize: "13px" }}>{p.diary.slice(0, 40)}...</p>
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
// キャストタイプ診断ページ
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
  "清楚系":   { emoji: "🌸", color: "#ffb6c1", desc: "育ちの良さ・上品さが武器。知性と清潔感で差をつけられます。" },
  "エロ系":   { emoji: "🔥", color: "#ff6b6b", desc: "欲求に正直な貴女の魅力が最大の武器。大胆さをアピールしましょう。" },
  "M系":      { emoji: "🎀", color: "#da70d6", desc: "尽くす姿勢と従順さが魅力。癒しと奉仕の文章が刺さります。" },
  "S系":      { emoji: "👑", color: "#ffd700", desc: "支配力とリード感が魅力。主導権を握るキャラで差別化できます。" },
  "かわいい系": { emoji: "💕", color: "#ff69b4", desc: "見た目の可愛さと自己表現が武器。写真映えするキャラを前面に。" },
};

function ShindanPage({ casts, setCasts, loggedInCast }) {
  const [step, setStep] = useState("questions");
  const [castName] = useState(loggedInCast || "");
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [note, setNote] = useState("");
  const [disclose, setDisclose] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const activeCasts = casts.filter((c) => c.is_active);

  function answer(val) {
    const newAnswers = { ...answers, [QUESTIONS[currentQ].id]: val };
    setAnswers(newAnswers);
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setStep("disclosure");
    }
  }

  function calcType(ans) {
    const scores = { "清楚": 0, "エロ": 0, "M系": 0, "S系": 0, "かわいい": 0 };
    QUESTIONS.forEach((q) => {
      if (ans[q.id] === "YES") scores[q.type] += 2;
      else if (ans[q.id] === "どちらでも") scores[q.type] += 1;
    });
    const max = Math.max(...Object.values(scores));
    const topType = Object.keys(scores).find((k) => scores[k] === max);
    return topType + "系";
  }

  async function analyzeAndSave() {
    setStep("result");
    setLoading(true);
    const typeGuess = calcType(answers);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 800,
          messages: [{
            role: "user",
            content: `あなたはエンタメ業界のパーソナリティコンサルタントです。スタッフのキャラクター診断結果を分析して、自己PR文と写真のアドバイスをしてください。

スタッフ名：${castName}
診断回答：
${QUESTIONS.map((q) => `・${q.text} → ${answers[q.id] || "未回答"}`).join("\n")}
備考：${note || "なし"}
判定キャラクター：${typeGuess}

以下のフォーマットで返答してください：

キャラクター判定：${typeGuess}

あなたの魅力
・
・
・

おすすめ自己PR文スタイル
・

ブログで使えるフレーズ例
・
・

写真撮影のアドバイス
・
・`
          }]
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      setResult({ type: typeGuess, detail: text });

      // キャストデータにタイプを保存
      setCasts((prev) => prev.map((c) =>
        c.name === castName
          ? { ...c, type: typeGuess, disclose, shindan_note: disclose === "YES" ? note : null }
          : c
      ));
    } catch (e) {
      setResult({ type: typeGuess, detail: "分析中にエラーが発生しました。" });
    }
    setLoading(false);
  }

  // キャスト選択画面は不要（loggedInCastを使用）
  if (step === "select") return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="タイプ診断" sub="あなたの魅力を発見しましょう✨" color={C.pink} />
      <div style={{ ...card, background: "linear-gradient(135deg, #fff0f9, #f5f0ff)", borderColor: `${C.pink}44` }}>
        <p style={{ fontSize: "14px", lineHeight: "1.8", color: C.text, marginBottom: "16px" }}>
          いくつかの質問に答えるだけで、あなたのタイプと魅力を分析します。<br />
          正直に答えるほど、より精度の高いアドバイスができます💕
        </p>
        <div style={{ marginTop: "14px" }}>
          <Btn onClick={() => setStep("questions")} loading={false} label="診断スタート 💎" color={C.pink} />
        </div>
      </div>
    </div>
  );

  // 質問画面
  if (step === "questions") {
    const q = QUESTIONS[currentQ];
    const progress = Math.round(((currentQ) / QUESTIONS.length) * 100);
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Header title={`質問 ${currentQ + 1} / ${QUESTIONS.length}`} sub="" color={C.pink} />
          <button onClick={() => { if (currentQ > 0) setCurrentQ(currentQ - 1); else setStep("select"); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "13px" }}>← 戻る</button>
        </div>

        {/* プログレスバー */}
        <div style={{ height: "4px", background: C.border, borderRadius: "2px" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.pink}, ${C.accent})`, borderRadius: "2px", transition: "width 0.3s" }} />
        </div>

        <div style={{ ...card, borderColor: `${C.pink}33`, padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "17px", lineHeight: "1.7", fontWeight: "bold", marginBottom: "32px" }}>{q.text}</p>
          <div style={{ display: "grid", gap: "12px" }}>
            {["YES", "NO", "どちらでも"].map((opt) => (
              <button key={opt} onClick={() => answer(opt)} style={{ padding: "16px", borderRadius: "12px", border: `1px solid ${C.border}`, background: "#fff5f9", color: C.text, fontSize: "16px", fontWeight: "bold", cursor: "pointer", transition: "all 0.15s" }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = C.pink}
                onMouseOut={(e) => e.currentTarget.style.borderColor = C.border}
              >
                {opt === "YES" ? "✓ YES" : opt === "NO" ? "✗ NO" : "〜 どちらでも"}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 開示確認画面
  if (step === "disclosure") return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="最後に一つだけ" sub="" color={C.pink} />
      <div style={{ ...card, borderColor: `${C.pink}33` }}>
        <p style={{ fontSize: "14px", lineHeight: "1.8", marginBottom: "20px" }}>
          備考欄に自由に書いていただくと、AIがより精度の高いアドバイスをお伝えできます。<br /><br />
          <span style={{ color: C.yellow, fontWeight: "bold" }}>この内容を店舗スタッフに開示しますか？</span><br />
          <span style={{ fontSize: "13px", color: C.muted }}>
            開示すると店長からもコメントがもらえてよりサポートが充実します。<br />
            NOの場合、AIだけが参考にし第三者には一切開示しません。
          </span>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
          <button onClick={() => setDisclose("YES")} style={{ padding: "14px", borderRadius: "12px", border: `2px solid ${disclose === "YES" ? C.green : C.border}`, background: disclose === "YES" ? `${C.green}22` : "none", color: disclose === "YES" ? C.green : C.muted, fontWeight: "bold", cursor: "pointer" }}>
            ✓ 開示する<br /><span style={{ fontSize: "11px", fontWeight: "normal" }}>（おすすめ）</span>
          </button>
          <button onClick={() => setDisclose("NO")} style={{ padding: "14px", borderRadius: "12px", border: `2px solid ${disclose === "NO" ? C.pink : C.border}`, background: disclose === "NO" ? `${C.pink}22` : "none", color: disclose === "NO" ? C.pink : C.muted, fontWeight: "bold", cursor: "pointer" }}>
            🔒 開示しない<br /><span style={{ fontSize: "11px", fontWeight: "normal" }}>（AIのみ）</span>
          </button>
        </div>

        <Field label="備考（任意）・深層心理や詳しいことがあれば">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：実は◯◯が好きだけど恥ずかしくて言えない、など何でもOKです" style={{ ...inp, minHeight: "100px" }} />
        </Field>

        <div style={{ marginTop: "14px" }}>
          <Btn onClick={analyzeAndSave} loading={!disclose} label="診断結果を見る ✨" color={C.pink} />
        </div>
        {!disclose && <p style={{ textAlign: "center", color: C.muted, fontSize: "12px", marginTop: "8px" }}>開示するかどうかを選んでください</p>}
      </div>
    </div>
  );

  // 結果画面
  if (step === "result") {
    const typeInfo = result ? TYPE_INFO[result.type] : null;
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <Header title="診断結果" sub="あなたのタイプが判明しました✨" color={C.pink} />

        {loading ? (
          <div style={{ ...card, textAlign: "center", padding: "40px" }}>
            <p style={{ fontSize: "24px", marginBottom: "12px" }}>✨</p>
            <p style={{ color: C.muted }}>AIが分析中です...</p>
          </div>
        ) : result && typeInfo ? (
          <>
            <div style={{ ...card, textAlign: "center", padding: "32px", background: "linear-gradient(135deg, #fff0f9, #f5f0ff)", borderColor: `${typeInfo.color}66` }}>
              <p style={{ fontSize: "48px", marginBottom: "8px" }}>{typeInfo.emoji}</p>
              <p style={{ fontSize: "28px", fontWeight: "bold", color: typeInfo.color, marginBottom: "8px" }}>{result.type}</p>
              <p style={{ fontSize: "14px", color: C.muted, lineHeight: "1.7" }}>{typeInfo.desc}</p>
            </div>

            <div style={{ ...card }}>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px" }}>{result.detail}</p>
            </div>

            <div style={{ ...card, background: `${C.pink}11`, borderColor: `${C.pink}33`, textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: C.muted, marginBottom: "8px" }}>このタイプはAI採点にも反映されます</p>
              <p style={{ fontSize: "13px", color: C.pink }}>💎 投稿を重ねると複合タイプが解放されるかも...</p>
            </div>

            <Btn onClick={() => { setStep("select"); setAnswers({}); setCurrentQ(0); setNote(""); setDisclose(null); setResult(null); }} loading={false} label="もう一度診断する" color={C.muted} />
          </>
        ) : null}
      </div>
    );
  }

  return null;
}

// ============================================================
// 第1段階：AI採点（文章・タイトル指導）
// ============================================================
function ScorePage({ casts, settings, scores, setScores, loggedInCast }) {
  const [castName] = useState(loggedInCast || "");
  const [diary, setDiary] = useState("");
  const [hasImage, setHasImage] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(null); // 良・普・改善
  const [postedTime, setPostedTime] = useState(null); // 🔒 自動記録された投稿時刻

  const active = casts.filter((c) => c.is_active);
  const charCount = diary.length;
  const charShort = Math.max(settings.min_text_length - charCount, 0);

  function getRating(score) {
    if (score >= 80) return { label: "良", color: C.green, desc: "非常に良い・このまま使える" };
    if (score >= 60) return { label: "普", color: C.yellow, desc: "平均的・もう少し工夫できる" };
    return { label: "改善", color: C.red, desc: "改善で大きく伸びる" };
  }

  function pickSection(text, title) {
    const all = ["総合点", "保証条件チェック", "保証改善提案", "良い点", "改善点", "改善タイトル案", "彼女感タイプ分析"];
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
    setLoading(true); setResult(null); setRating(null);

    // 🔒 投稿時刻をボタンを押した瞬間に自動記録（ユーザーは変更不可）
    const autoPostedAt = new Date();
    const autoPostedAtISO = autoPostedAt.toISOString();
    const autoTimeStr = autoPostedAt.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    setPostedTime(autoTimeStr);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `あなたはエンタメ業界のブログコンサルタントです。スタッフのブログ記事を分析・採点してください。

【投稿ルール】
最低文字数：${settings.min_text_length}文字 / 今回：${charCount}文字 / 不足：${charShort}文字
画像必須：${settings.image_required ? "あり" : "なし"} / 画像：${hasImage ? "あり" : "なし"}
投稿時刻（自動記録）：${autoTimeStr}

【重要ルール】
・文字数不足の場合「投稿ルール対象外の可能性があります」と必ず書く
・画像不足の場合「画像不足のため投稿ルール未達の可能性があります」と必ず書く
・スタッフを責めず、優しい表現にする

必ず以下のフォーマットで返答してください：

総合点：○○点

投稿ルールチェック
・文字数判定：達成 or 文字数不足
・画像判定：達成 or 画像不足

改善提案
・（具体的な改善案を2つ）

良い点
・
・

改善点
・
・

改善タイトル案
・
・

キャラクター分析
・親しみ感 / 色気 / 癒し系のどれかと理由

【スタッフ名】${castName || "未設定"}
【ブログ本文】${diary}`
          }]
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "結果を取得できませんでした";
      const scoreMatch = text.match(/(\d+)点/);
      const sc = scoreMatch ? Number(scoreMatch[1]) : 50;
      setResult(text);
      setRating(getRating(sc));
      setScores((prev) => [{ id: Date.now(), cast_name: castName || "未設定", diary, result: text, posted_at: autoPostedAtISO, has_image: hasImage, score: sc }, ...prev]);
    } catch (e) {
      setResult("エラーが発生しました。もう一度お試しください。");
    }
    setLoading(false);
  }

  const sections = ["保証条件チェック", "保証改善提案", "良い点", "改善点", "改善タイトル案", "彼女感タイプ分析"];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="写メ日記AI採点" sub="第1段階：文章・タイトル指導" color={C.accent} />

      <div style={{ ...card, display: "grid", gap: "14px" }}>
        {/* ログイン中のキャスト名を表示 */}
        <div style={{ padding: "10px 14px", borderRadius: "12px", background: `${C.pink}11`, border: `1px solid ${C.pink}33`, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>👩</span>
          <span style={{ fontWeight: "bold", color: C.pink }}>{castName}</span>
          <span style={{ color: C.muted, fontSize: "12px" }}>さんの投稿</span>
        </div>

        <Field label={<span style={{ display: "flex", justifyContent: "space-between" }}><span>写メ日記本文</span><span style={{ color: charShort > 0 ? C.red : C.green }}>{charCount}文字 {charShort > 0 ? `(あと${charShort}文字)` : "✓"}</span></span>}>
          <textarea value={diary} onChange={(e) => setDiary(e.target.value)} placeholder="写メ日記本文を入力..." style={{ ...inp, minHeight: "160px", resize: "vertical" }} />
        </Field>

        <Toggle checked={hasImage} onChange={setHasImage} label="画像あり" />

        {/* 🔒 投稿時刻は自動記録 */}
        <div style={{ padding: "12px 14px", borderRadius: "10px", background: `${C.green}11`, border: `1px solid ${C.green}33`, display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>🔒</span>
          <span style={{ fontSize: "13px", color: C.muted }}>投稿時刻は送信した瞬間に自動記録されます</span>
          {postedTime && <span style={{ marginLeft: "auto", color: C.green, fontWeight: "bold", fontSize: "14px" }}>{postedTime}</span>}
        </div>

        <Btn onClick={handleScore} loading={loading} label="AI採点する" />
      </div>

      {result && rating && (
        <div style={{ display: "grid", gap: "12px" }}>
          {/* 評価バッジ */}
          <div style={{ ...card, display: "flex", alignItems: "center", gap: "16px", borderColor: `${rating.color}44` }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "12px", background: `${rating.color}22`, border: `2px solid ${rating.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "bold", color: rating.color, flexShrink: 0 }}>{rating.label}</div>
            <div>
              <p style={{ color: rating.color, fontWeight: "bold", fontSize: "16px" }}>{result.match(/総合点：(\d+点)/)?.[1] || ""}</p>
              <p style={{ color: C.muted, fontSize: "13px", marginTop: "2px" }}>{rating.desc}</p>
            </div>
          </div>

          {sections.map((sec) => {
            const text = pickSection(result, sec);
            if (!text) return null;
            return (
              <div key={sec} style={{ ...card }}>
                <p style={{ color: C.accent, fontSize: "12px", fontWeight: "bold", marginBottom: "10px", letterSpacing: "0.05em" }}>{sec}</p>
                <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px" }}>{text}</p>
              </div>
            );
          })}

          {/* ヘブン投稿ボタン */}
          <HeavenPostButton
            castName={castName}
            diary={diary}
            result={result}
            casts={casts}
            postedTime={postedTime}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// ヘブン投稿ボタンコンポーネント
// ============================================================
function HeavenPostButton({ castName, diary, result, casts, postedTime }) {
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [postError, setPostError] = useState(null);

  const cast = casts.find((c) => c.name === castName);
  const hasCredentials = cast?.heaven_id && cast?.heaven_pass;

  // VPSサーバーのURL
  const VPS_URL = "http://160.251.166.73:3000";

  function extractTitle(text) {
    const match = text.match(/改善タイトル案[\s\S]*?・(.+)/);
    return match ? match[1].trim() : "";
  }
  const suggestedTitle = result ? extractTitle(result) : "";

  async function handlePost() {
    setShowConfirm(false);
    setPosting(true);

    try {
      // VPS経由でヘブンに自動投稿
      const res = await fetch(`${VPS_URL}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}` },
        body: JSON.stringify({
          heavenId: cast.heaven_id,
          heavenPass: cast.heaven_pass,
          title: suggestedTitle,
          body: diary,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPosted(true);
        setPostError(null);
      } else {
        setPostError(data.message || "投稿に失敗しました");
      }
    } catch (e) {
      setPostError("サーバーに接続できませんでした: " + e.message);
    }
    setPosting(false);
  }

  if (!result) return null;

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ ...card, borderColor: `${C.yellow}44`, background: `${C.yellow}08` }}>
        <p style={{ color: C.yellow, fontSize: "12px", fontWeight: "bold", marginBottom: "10px" }}>📋 投稿内容プレビュー</p>
        <div style={{ marginBottom: "10px" }}>
          <p style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>タイトル（AI提案）</p>
          <p style={{ fontSize: "14px", fontWeight: "bold" }}>{suggestedTitle || "タイトルを手動で入力してください"}</p>
        </div>
        <div>
          <p style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>本文</p>
          <p style={{ fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "80px", overflow: "hidden" }}>{diary}</p>
        </div>
      </div>

      {!hasCredentials && (
        <div style={{ padding: "12px", borderRadius: "10px", background: `${C.red}11`, border: `1px solid ${C.red}33` }}>
          <p style={{ fontSize: "13px", color: C.red }}>⚠️ キャスト管理でヘブンID/パスを登録してください</p>
        </div>
      )}

      {posted && (
        <div style={{ padding: "14px", borderRadius: "12px", background: `${C.green}15`, border: `1px solid ${C.green}44`, textAlign: "center" }}>
          <p style={{ fontSize: "32px", marginBottom: "8px" }}>🎉</p>
          <p style={{ color: C.green, fontWeight: "bold", fontSize: "15px" }}>ヘブンへの投稿完了！</p>
          <p style={{ color: C.muted, fontSize: "12px", marginTop: "4px" }}>自動投稿されました</p>
        </div>
      )}

      {postError && (
        <div style={{ padding: "12px", borderRadius: "10px", background: `${C.red}11`, border: `1px solid ${C.red}33` }}>
          <p style={{ fontSize: "13px", color: C.red }}>❌ {postError}</p>
        </div>
      )}

      {showConfirm && (
        <div style={{ padding: "16px", borderRadius: "12px", background: "#fff5f9", border: `1px solid ${C.yellow}44` }}>
          <p style={{ fontWeight: "bold", marginBottom: "8px" }}>ヘブンに自動投稿しますか？</p>
          <p style={{ fontSize: "13px", color: C.muted, marginBottom: "8px" }}>タイトル：{suggestedTitle}</p>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "16px" }}>VPSサーバー経由でヘブンに自動投稿します。</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button onClick={() => setShowConfirm(false)} style={{ padding: "12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: "bold" }}>キャンセル</button>
            <button onClick={handlePost} style={{ padding: "12px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #ff6b6b, #ff4466)", color: "white", cursor: "pointer", fontWeight: "bold" }}>投稿する</button>
          </div>
        </div>
      )}

      {!posted && !showConfirm && (
        <button onClick={() => setShowConfirm(true)} disabled={posting} style={{ padding: "16px", borderRadius: "12px", border: "none", background: posting ? "#333" : "linear-gradient(135deg, #ff6b6b, #ff4466)", color: "white", fontWeight: "bold", fontSize: "15px", cursor: posting ? "not-allowed" : "pointer" }}>
          🌸 ヘブンに投稿する
        </button>
      )}

      {posted && (
        <button onClick={() => setPosted(false)} style={{ padding: "12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontSize: "13px" }}>
          もう一度投稿する
        </button>
      )}
    </div>
  );
}

// ============================================================
// タイトル専用指導ページ
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
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 800,
          messages: [{
            role: "user",
            content: `風俗店の写メ日記タイトルを分析してください。

タイトル：${title}
本文：${body || "（未入力）"}
キャスト：${castName || "未設定"}

以下のフォーマットで返答してください：

タイトル評価：良 or 普 or 改善

良い点
・

改善点
・

改善タイトル案（3つ）
1.
2.
3.

クリックされやすい理由
・`
          }]
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
      <div style={{ ...card, display: "grid", gap: "14px" }}>
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
          <p style={{ color: C.pink, fontSize: "12px", fontWeight: "bold", marginBottom: "12px" }}>分析結果</p>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px" }}>{result}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 第2段階：キャスト別教育管理
// ============================================================
function CastPage({ casts, setCasts, scores }) {
  const [modal, setModal] = useState(null); // モーダル表示中のキャスト
  const [modalId, setModalId] = useState("");
  const [modalPass, setModalPass] = useState("");
  const [modalSaved, setModalSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [tab, setTab] = useState("list");

  function toggle(name) {
    setCasts(casts.map((c) => c.name === name ? { ...c, is_active: !c.is_active } : c));
  }

  function addCast() {
    if (!newName.trim()) return;
    setCasts([...casts, { name: newName.trim(), is_active: true, work_start: newStart, strong: "未分析", weak: "未分析", heaven_id: "", heaven_pass: "" }]);
    setNewName(""); setNewStart("");
  }

  function openModal(c) {
    setModal(c);
    setModalId(c.heaven_id || "");
    setModalPass(c.heaven_pass || "");
    setModalSaved(false);
  }

  function saveModal() {
    setCasts(casts.map((x) => x.name === modal.name ? { ...x, heaven_id: modalId, heaven_pass: modalPass } : x));
    setModalSaved(true);
    setTimeout(() => setModal(null), 1000);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="キャスト別教育管理" sub="第2段階：得意・苦手分析と成長サポート" color={C.green} />

      {/* モーダル */}
      {modal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "white", borderRadius: "24px", padding: "28px", width: "100%", maxWidth: "400px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <p style={{ fontWeight: "bold", fontSize: "18px", color: C.text }}>{modal.name}</p>
                <p style={{ color: C.pink, fontSize: "12px", marginTop: "2px" }}>🌸 ヘブンネット ログイン情報</p>
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: C.muted }}>×</button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <Field label="ヘブンID">
                <input
                  value={modalId}
                  onChange={(e) => setModalId(e.target.value)}
                  placeholder="例：66033247"
                  style={inp}
                  inputMode="numeric"
                />
              </Field>
              <Field label="パスワード">
                <input
                  type="password"
                  value={modalPass}
                  onChange={(e) => setModalPass(e.target.value)}
                  placeholder="パスワードを入力"
                  style={inp}
                />
              </Field>

              <div style={{ padding: "10px", borderRadius: "10px", background: `${C.yellow}11`, border: `1px solid ${C.yellow}33` }}>
                <p style={{ fontSize: "11px", color: C.muted }}>🔒 ID/パスはこのアプリ内にのみ保存されます</p>
              </div>

              {modalSaved ? (
                <div style={{ padding: "14px", borderRadius: "12px", background: `${C.green}15`, border: `1px solid ${C.green}44`, textAlign: "center" }}>
                  <p style={{ color: C.green, fontWeight: "bold" }}>✅ 保存しました！</p>
                </div>
              ) : (
                <button onClick={saveModal} style={{ padding: "14px", borderRadius: "14px", border: "none", background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, color: "white", fontWeight: "bold", fontSize: "15px", cursor: "pointer", boxShadow: `0 4px 14px ${C.pink}55` }}>
                  💾 保存する
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        {["list", "add"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: tab === t ? C.green : "#fff5f9", color: tab === t ? "#040a06" : C.muted, fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>
            {t === "list" ? "キャスト一覧" : "新規追加"}
          </button>
        ))}
      </div>

      {tab === "add" && (
        <div style={{ ...card, display: "grid", gap: "12px" }}>
          <Field label="キャスト名"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名前を入力" style={inp} /></Field>
          <Field label="出勤開始時間"><input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} style={inp} /></Field>
          <Btn onClick={addCast} loading={false} label="追加する" color={C.green} />
        </div>
      )}

      {tab === "list" && (
        <div style={{ display: "grid", gap: "10px" }}>
          {casts.map((c) => (
            <div key={c.name} style={{ ...card, borderColor: c.is_active ? `${C.green}33` : C.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: "bold", fontSize: "15px" }}>{c.name}</p>
                <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                  <Tag label={`得意：${c.strong}`} color={C.green} />
                  <Tag label={`苦手：${c.weak}`} color={C.yellow} />
                  {c.heaven_id ? <Tag label="ヘブン✓" color={C.pink} /> : <Tag label="ヘブン未設定" color={C.muted} />}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", marginLeft: "10px" }}>
                <span style={{ color: c.is_active ? C.green : C.muted, fontSize: "12px" }}>{c.is_active ? "在籍中" : "停止中"}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => openModal(c)} style={{ padding: "6px 10px", borderRadius: "6px", border: "none", background: `${C.pink}22`, color: C.pink, fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}>
                    🌸 ID設定
                  </button>
                  <button onClick={() => toggle(c.name)} style={{ padding: "6px 10px", borderRadius: "6px", border: "none", background: c.is_active ? "rgba(255,68,102,0.15)" : `${C.green}22`, color: c.is_active ? C.red : C.green, fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}>
                    {c.is_active ? "停止" : "再開"}
                  </button>
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
// 第3段階：保証条件チェック
// ============================================================
function GuaranteePage({ casts, scores, settings }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const todayPosts = scores.filter((s) => {
    return new Date(s.posted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === today;
  });

  function countValid(posts) {
    const sorted = [...posts].sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
    let count = 0, last = 0;
    for (const p of sorted) {
      const t = new Date(p.posted_at).getTime();
      if (count === 0 || t - last >= settings.repeat_limit_min * 60000) { count++; last = t; }
    }
    return count;
  }

  const activeCasts = casts.filter((c) => c.is_active);
  const rows = activeCasts.map((c) => {
    const posts = todayPosts.filter((p) => p.cast_name === c.name);
    const valid = countValid(posts);
    const latest = posts[posts.length - 1];
    const textLen = latest?.diary?.length || 0;
    const hasImg = latest?.has_image === true;
    const textOk = textLen >= settings.min_text_length;
    const imgOk = settings.image_required ? hasImg : true;
    const countOk = valid >= settings.daily_post_goal;
    const ok = countOk && textOk && imgOk;
    return { ...c, valid, textLen, hasImg, textOk, imgOk, countOk, ok };
  });

  const doneCount = rows.filter((r) => r.ok).length;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="保証条件チェック" sub="第3段階：保証達成状況の自動判定" color={C.yellow} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ ...card, textAlign: "center", borderColor: `${C.green}33` }}>
          <p style={{ color: C.muted, fontSize: "11px", marginBottom: "6px" }}>達成</p>
          <p style={{ fontSize: "36px", fontWeight: "bold", color: C.green }}>{doneCount}</p>
          <p style={{ color: C.muted, fontSize: "11px" }}>名</p>
        </div>
        <div style={{ ...card, textAlign: "center", borderColor: `${C.red}33` }}>
          <p style={{ color: C.muted, fontSize: "11px", marginBottom: "6px" }}>未達</p>
          <p style={{ fontSize: "36px", fontWeight: "bold", color: C.red }}>{rows.length - doneCount}</p>
          <p style={{ color: C.muted, fontSize: "11px" }}>名</p>
        </div>
      </div>

      <div style={{ ...card, padding: "14px 16px" }}>
        <p style={{ fontSize: "12px", color: C.muted }}>ルール：目標{settings.daily_post_goal}件 / 連投除外{settings.repeat_limit_min}分 / 最低{settings.min_text_length}文字 {settings.image_required ? "/ 画像必須" : ""}</p>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {rows.map((r) => (
          <div key={r.name} style={{ ...card, borderColor: r.ok ? `${C.green}44` : `${C.red}44` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <p style={{ fontWeight: "bold", fontSize: "15px" }}>{r.name}</p>
              <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "bold", background: r.ok ? `${C.green}22` : `${C.red}22`, color: r.ok ? C.green : C.red }}>
                {r.ok ? "保証達成" : "未達"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <CheckItem label={`投稿数 ${r.valid}/${settings.daily_post_goal}件`} ok={r.countOk} />
              <CheckItem label={`文字数 ${r.textLen}文字`} ok={r.textOk} />
              <CheckItem label="画像" ok={r.imgOk} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 第4段階：画像指導機能
// ============================================================
function ImagePage({ casts, loggedInCast }) {
  const [castName] = useState(loggedInCast || "");
  const [imageDesc, setImageDesc] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const active = casts.filter((c) => c.is_active);

  const criteria = ["雰囲気・印象", "構図・見せ方", "清潔感・魅力度", "TOPとの一致度"];

  async function analyze() {
    if (!imageDesc.trim()) return alert("画像の説明を入力してください");
    setLoading(true); setResult(null);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 800,
          messages: [{
            role: "user",
            content: `風俗店の写メ日記画像を分析してください。

キャスト：${castName || "未設定"}
画像の説明：${imageDesc}

以下のフォーマットで返答してください：

画像総合評価：○○点

各項目評価
・雰囲気・印象：○○点 / コメント
・構図・見せ方：○○点 / コメント
・清潔感・魅力度：○○点 / コメント
・TOPとの一致度：○○点 / コメント

改善提案
・
・

NG例と改善例
・NG：
・OK：`
          }]
        })
      });
      const data = await res.json();
      setResult(data.choices?.[0]?.message?.content || "エラー");
    } catch { setResult("エラーが発生しました"); }
    setLoading(false);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="画像指導機能" sub="第4段階：構図・雰囲気・魅力度の分析" color={C.pink} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px" }}>
        {criteria.map((c) => (
          <div key={c} style={{ ...card, padding: "14px", textAlign: "center" }}>
            <p style={{ fontSize: "12px", color: C.muted }}>{c}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, display: "grid", gap: "14px" }}>
        <Field label="キャスト名">
          <select value={castName} onChange={(e) => setCastName(e.target.value)} style={inp}>
            <option value="">選択してください</option>
            {active.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="画像の説明（どんな写真か）">
          <textarea value={imageDesc} onChange={(e) => setImageDesc(e.target.value)} placeholder="例：自撮り、笑顔、カフェ風の背景、白いワンピース着用..." style={{ ...inp, minHeight: "100px" }} />
        </Field>
        <Btn onClick={analyze} loading={loading} label="画像を分析する" color={C.pink} />
      </div>

      {result && (
        <div style={{ ...card }}>
          <p style={{ color: C.pink, fontSize: "12px", fontWeight: "bold", marginBottom: "12px" }}>分析結果</p>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.8", fontSize: "14px" }}>{result}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ランキング（第5段階：投稿チェッカー兼）
// ============================================================
function RankingPage({ scores }) {
  const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="AI採点ランキング" sub="総合スコア上位キャスト" color={C.yellow} />

      {sorted.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px", color: C.muted }}>まだ採点データがありません</div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {sorted.map((s, i) => (
            <div key={s.id} style={{ ...card, borderColor: i === 0 ? `${C.yellow}44` : C.border, display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{ fontSize: "24px", flexShrink: 0 }}>{medals[i] || `${i + 1}`}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <p style={{ fontWeight: "bold" }}>{s.cast_name}</p>
                  <span style={{ color: s.score >= 70 ? C.green : C.yellow, fontWeight: "bold", fontSize: "18px" }}>{s.score}点</span>
                </div>
                <p style={{ fontSize: "13px", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.diary}</p>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <Tag label={s.has_image ? "画像◎" : "画像なし"} color={s.has_image ? C.green : C.muted} />
                  <Tag label={new Date(s.posted_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} color={C.muted} />
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
// 設定ページ
// ============================================================
function SettingsPage({ settings, setSettings }) {
  const [local, setLocal] = useState({ ...settings, show_guarantee: settings.show_guarantee ?? true });
  function save() { setSettings(local); alert("保存しました！"); }

  const fields = [
    { key: "daily_post_goal", label: "1日の目標投稿数", unit: "件" },
    { key: "repeat_limit_min", label: "連投除外時間", unit: "分" },
    { key: "min_text_length", label: "最低文字数", unit: "文字" },
    { key: "before_work_min", label: "出勤前投稿ルール", unit: "分前まで" },
    { key: "after_work_min", label: "退勤後投稿ルール", unit: "分以内" },
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

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>キャスト画面の表示設定</p>
          <Toggle
            checked={local.show_guarantee}
            onChange={(v) => setLocal({ ...local, show_guarantee: v })}
            label="保証確認をキャスト画面に表示する"
          />
          <p style={{ fontSize: "11px", color: C.muted, marginTop: "6px", paddingLeft: "30px" }}>
            OFFにするとキャストは保証状況を確認できません
          </p>
        </div>

        <Btn onClick={save} loading={false} label="保存する" />
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
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <div style={{ width: "4px", height: "22px", borderRadius: "4px", background: `linear-gradient(180deg, ${color}, ${color}88)` }} />
        <h1 style={{ fontSize: "20px", fontWeight: "bold", color: C.text }}>{title}</h1>
      </div>
      {sub && <p style={{ color: C.muted, fontSize: "12px", paddingLeft: "12px" }}>{sub}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: "12px", color: C.muted, display: "block", marginBottom: "6px", fontWeight: "bold" }}>{label}</label>
      {children}
    </div>
  );
}

function Btn({ onClick, loading, label, color }) {
  const bg = color || C.pink;
  return (
    <button onClick={onClick} disabled={loading} style={{ padding: "14px", borderRadius: "14px", border: "none", background: loading ? "#eee" : `linear-gradient(135deg, ${bg}, ${bg}cc)`, color: loading ? C.muted : "white", fontWeight: "bold", fontSize: "15px", cursor: loading ? "not-allowed" : "pointer", width: "100%", boxShadow: loading ? "none" : `0 4px 14px ${bg}55`, transition: "all 0.2s" }}>
      {loading ? "処理中..." : label}
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
      <div onClick={() => onChange(!checked)} style={{ width: "44px", height: "24px", borderRadius: "12px", background: checked ? `linear-gradient(135deg, ${C.pink}, ${C.purple})` : "#e0e0e0", display: "flex", alignItems: "center", padding: "2px", transition: "all 0.3s", flexShrink: 0 }}>
        <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "white", transform: checked ? "translateX(20px)" : "translateX(0)", transition: "transform 0.3s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
      </div>
      <span style={{ fontSize: "14px", color: C.text }}>{label}</span>
    </label>
  );
}

function Tag({ label, color }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: `${color}18`, color, border: `1px solid ${color}44`, fontWeight: "bold" }}>{label}</span>
  );
}

function CheckItem({ label, ok }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", background: ok ? "#f0fff8" : "#fff0f3", border: `1px solid ${ok ? C.green : C.red}33` }}>
      <span style={{ fontSize: "16px" }}>{ok ? "✅" : "❌"}</span>
      <span style={{ fontSize: "13px", color: C.text, fontWeight: "bold" }}>{label}</span>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", padding: "12px", borderRadius: "14px", background: `${color}11`, border: `1px solid ${color}33` }}>
      <p style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>{label}</p>
      <p style={{ fontSize: "20px", fontWeight: "bold", color }}>{value}</p>
    </div>
  );
}

export default App;
