"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

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
  padding: "18px 20px",
  boxShadow: "0 2px 12px rgba(255,107,157,0.10), 0 1px 3px rgba(61,26,78,0.04)",
};

const inp = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1.5px solid ${C.border}`,
  background: "#fff8fc",
  color: C.text,
  fontSize: "16px",      // iOS auto-zoom防止（16px未満だとフォーカス時に拡大される）
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
  salaryBasis: "gross",
  no_duplicate_image: true,
};

const initCutDays = { diary: 1, late: 1, early: 1, absent: 2, complaint: 1 };

// 深夜営業対応：JST 06:00 を「営業日の境目」とする
// UTC+3h することで、JST 0〜5:59 は前日扱い、JST 6:00〜 が当日になる
function getBusinessToday() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
}
function getBusinessTodayKey() {
  const d = new Date(Date.now() + 3 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// 名前の正規化: 「半角/全角スペース」「新人」「🔰」のうち最初に現れた位置で切り、その前だけを名前とする。
// 例: 「えな 新人🔰」「えな新人🔰」「えな🔰」「えな No2 本指名」→ いずれも「えな」。
// 保険として、切った後に末尾へ残った装飾(絵文字/★☆等)も除去する。
function normalizeName(s) {
  let name = String(s || "");
  const cuts = [];
  const sp = name.search(/[\s　]/);     // 最初の半角/全角スペース
  const ni = name.indexOf("新人");
  const mk = name.indexOf("🔰");
  [sp, ni, mk].forEach((i) => { if (i >= 0) cuts.push(i); });
  if (cuts.length) name = name.slice(0, Math.min(...cuts));
  // 末尾に残った装飾・空白を除去（保険）
  return name.replace(/[\s　★☆♪♫♡♥❤◎○●◯◆◇■□▲△▼▽※‼！!♢❀✿✦✧♛👑💖💕✨🌟⭐️⭐🔰]+$/u, "").trim();
}

// shifts マップ（{ name: M/D配列, name_YMD: {...} }）から、castName に対応する
// M/D 配列を「正規化名で」探して返す。完全一致を最優先（既存=NADESHIKO の挙動は不変）。
function shiftDaysFor(shifts, castName) {
  if (!shifts) return null;
  if (Array.isArray(shifts[castName])) return shifts[castName]; // 完全一致(高速・従来挙動)
  const target = normalizeName(castName);
  for (const k in shifts) {
    if (Array.isArray(shifts[k]) && normalizeName(k) === target) return shifts[k];
  }
  return null;
}

const initCourses = [
  { id: 1, minutes: 60 },
  { id: 2, minutes: 90 },
  { id: 3, minutes: 120 },
];

const initScores = [
  { id: 1, cast_name: "さくら", diary: "今日もお仕事頑張ってます！みなさんに会えるのが楽しみで、毎日元気いっぱい出勤してます。趣味の料理で新しいレシピ試したら大成功でした♪", result: "総合点：78点\n\n保証条件チェック\n・文字数判定：達成\n・画像判定：達成\n\n保証改善提案\n・タイトルをもっとキャッチーにすると反応UP\n\n良い点\n・元気な印象が伝わる\n・日常感があり親近感がある\n\n改善点\n・もう少し感情表現を入れると良い\n\n改善タイトル案\n・「料理上手な彼女♪新レシピ大成功です！」\n・「今日も元気に出勤♡待ってます！」", posted_at: new Date().toISOString(), has_image: true, score: 78 },
  { id: 2, cast_name: "みお", diary: "雨の日は家でゆっくり映画を見るのが好きです。最近ハマっているのはラブストーリー系で、感動して泣いてしまいました。そんな感受性豊かな私に会いに来てください！", result: "総合点：85点\n\n保証条件チェック\n・文字数判定：達成\n・画像判定：達成\n\n保証改善提案\n・具体的な映画名を入れるとより個性が出る\n\n良い点\n・彼女感が強く出ている\n・感情表現が豊か\n\n改善点\n・締めの一文がもう少し誘い感があると良い\n\n改善タイトル案\n・「雨の日は映画で号泣中…♡」\n・「感受性豊かな私に会いに来て♪」", posted_at: new Date(Date.now() - 3600000).toISOString(), has_image: true, score: 85 },
  { id: 3, cast_name: "りな", diary: "お疲れ様です", result: "総合点：32点\n\n保証条件チェック\n・文字数判定：文字数不足\n・画像判定：画像不足\n\n保証改善提案\n・最低100文字必要です。自己紹介や今日の気分を追記してください\n\n良い点\n・挨拶ができている\n\n改善点\n・文字数が大幅に不足\n・画像がない\n\n改善タイトル案\n・「今日もよろしくお願いします♪」", posted_at: new Date(Date.now() - 7200000).toISOString(), has_image: false, score: 32 },
];

const ADMIN_PASSWORD = "1234"; // 未知店舗のフォールバック（ロックアウト防止）
// 管理ログインパスワード（店舗ごと）
const ADMIN_PASSWORDS = {
  nadeshiko: "1234",
  club_audition_nagano: "4321",
};
const AUTO_LOGIN_KEY = "shamenikki_autologin";
const CREDS_KEY      = "shamenikki_creds";

// ============================================================
// 複数店舗対応（Phase 1）: 店舗ごとに localStorage を名前空間化する土台
//  - 既存(NADESHIKO)のデータは壊さない（古いキーはコピーするだけで残す）
// ============================================================
const STORES_KEY       = "shamenikki_stores";        // 店舗一覧（共通・名前空間化しない）
const ACTIVE_STORE_KEY = "shamenikki_active_store";   // 選択中店舗id（共通）
const DEFAULT_STORE_ID = "nadeshiko";
const DEFAULT_STORES = [
  { id: "nadeshiko", name: "NADESHIKO-撫子-" },
  { id: "club_audition_nagano", name: "クラブオーディション長野" },
];

// キャスト同期で保存する上位N名（ヘブン掲載順の先頭から）。退店者が大量に残る店舗対策。
// クライアント側で制限するので VPS ボット編集は不要。NADESHIKO は70名で上限未満＝影響なし。
const CAST_SYNC_LIMIT = 100;

// 名前空間化しない共通キー（店舗で分けない）
const COMMON_KEYS = new Set([
  STORES_KEY, ACTIVE_STORE_KEY, AUTO_LOGIN_KEY, CREDS_KEY, "shamenikki_settings_synced",
]);

// 店舗ごとに分ける localStorage キー
const PER_STORE_BASE_KEYS = [
  "shamenikki_casts", "shamenikki_scores", "shamenikki_settings", "shamenikki_courses",
  "shamenikki_shifts", "shamenikki_sync_config", "shamenikki_cut_days",
  "shamenikki_guarantee", "shamenikki_violations", "shamenikki_extra_workdays",
];
// キャスト等に紐づく動的キー（接頭辞で判定）
const PER_STORE_PREFIXES = ["shamenikki_salary_", "cast_type_", "support_settings_"];

function getStores() {
  try {
    const raw = localStorage.getItem(STORES_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch {}
  return DEFAULT_STORES;
}
function getActiveStoreId() {
  try { return localStorage.getItem(ACTIVE_STORE_KEY) || DEFAULT_STORE_ID; } catch { return DEFAULT_STORE_ID; }
}
// 選択中店舗で名前空間化したキー（共通キーはそのまま返す）
function skey(baseKey) {
  if (!baseKey || COMMON_KEYS.has(baseKey)) return baseKey;
  return baseKey + "::" + getActiveStoreId();
}
// 接頭辞スキャン用: 選択中店舗の名前空間キーだけを返す（[{fullKey, baseKey}]）
function scopedKeys(prefix) {
  const suffix = "::" + getActiveStoreId();
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix) && k.endsWith(suffix))
      .map((k) => ({ fullKey: k, baseKey: k.slice(0, -suffix.length) }));
  } catch { return []; }
}

// 既存(名前空間なし)データを 1 回だけ ::nadeshiko へコピーする（元キーは消さない）
let _storeMigrationDone = false;
function ensureStoreMigration() {
  if (_storeMigrationDone) return;
  if (typeof window === "undefined") return;
  _storeMigrationDone = true;
  try {
    if (!localStorage.getItem(STORES_KEY)) localStorage.setItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
    if (!localStorage.getItem(ACTIVE_STORE_KEY)) localStorage.setItem(ACTIVE_STORE_KEY, DEFAULT_STORE_ID);

    const NS = "::" + DEFAULT_STORE_ID;
    // 固定キー: baseKey::nadeshiko が未作成で、古い baseKey があるときだけコピー
    PER_STORE_BASE_KEYS.forEach((bk) => {
      const oldV = localStorage.getItem(bk);
      if (oldV !== null && localStorage.getItem(bk + NS) === null) {
        localStorage.setItem(bk + NS, oldV);
      }
    });
    // 動的キー（salary/cast_type/support_settings）: 名前空間なしのものをコピー
    Object.keys(localStorage).forEach((k) => {
      if (k.includes("::")) return; // 既に名前空間化済み
      if (!PER_STORE_PREFIXES.some((p) => k.startsWith(p))) return;
      if (localStorage.getItem(k + NS) === null) {
        const v = localStorage.getItem(k);
        if (v !== null) localStorage.setItem(k + NS, v);
      }
    });

    // 旧バグの誤シード掃除: 非オリジナル店「すべて」の casts/scores/courses から
    // モック行だけを要素単位で除去する（アクティブ店に限らず全店を走査するので、
    // どの店を開いていても・店切替の瞬間でも焼き付きモックが必ず消える）。
    // heaven_id/heaven_pass 入りキャスト・実データ・sync_config・nadeshiko には触れない。
    const cleanArray = (key, isMock) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        const kept = arr.filter((x) => !isMock(x));
        if (kept.length !== arr.length) localStorage.setItem(key, JSON.stringify(kept));
      } catch {}
    };
    const mockNames = new Set(initCasts.map((c) => c.name));
    const mockCourses = new Set(initCourses.map((c) => c.id + ":" + c.minutes));
    Object.keys(localStorage).forEach((key) => {
      const idx = key.indexOf("::");
      if (idx < 0) return;
      const base = key.slice(0, idx);
      const store = key.slice(idx + 2);
      if (store === DEFAULT_STORE_ID) return; // nadeshiko は対象外
      if (base === "shamenikki_casts") {
        // モック名 かつ ヘブン認証が空の行だけ除去（認証入り・実キャストは残す）
        cleanArray(key, (c) => mockNames.has(c.name) && !c.heaven_id && !c.heaven_pass);
      } else if (base === "shamenikki_scores") {
        // モックは id が小さい(1,2,3)。実データは Date.now の巨大 id
        cleanArray(key, (s) => typeof s.id === "number" && s.id < 100000);
      } else if (base === "shamenikki_courses") {
        // モックの id:minutes(1:60/2:90/3:120) に一致する行だけ除去
        cleanArray(key, (c) => mockCourses.has(c.id + ":" + c.minutes));
      }
    });
  } catch {}
}

// 給料レコード → salary_records 行
function toSupabaseRecord(rec, castId) {
  return {
    store_id:   getActiveStoreId(),
    id:         rec.id,
    cast_id:    castId,
    date:       rec.date,
    start_time: rec.startTime || "",
    end_time:   rec.endTime   || "",
    hon_shimei: rec.honShimei || 0,
    p_shimei:   rec.pShimei   || 0,
    free:       rec.free      || 0,
    total_hon:  rec.totalHon  || 0,
    course_min: rec.courseMin || 0,
    ext_count:  rec.extCount  || 0,
    ext_min:    rec.extMin    || 0,
    option_amt: rec.option    || 0,
    gross:      rec.gross     || 0,
    dorm:       rec.dorm      || 0,
    misc:       rec.misc      || 0,
    transport:  rec.transport || 0,
    take_home:  rec.takeHome  || 0,
  };
}

// hons 配列 → salary_sessions 行の配列
function toSupabaseSessions(rec) {
  return (rec.hons || []).map((h, seq) => ({
    store_id:         getActiveStoreId(),
    salary_record_id: rec.id,
    seq,
    course_min:  Number(h.courseMin)  || 0,
    shimei:      h.shimei             || "",
    fee:         Number(h.fee)         || 0,
    shimei_ryou: Number(h.shimeiRyou) || 0,
    op:          Number(h.op)          || 0,
    ext_count:   Number(h.extCount)   || 0,
    ext_min:     Number(h.extMin)     || 0,
  }));
}

// Supabaseに送るキャストデータ（heaven_passは絶対に含めない）
function toSupabaseCast(c) {
  return {
    store_id:     getActiveStoreId(),
    name:         c.name,
    is_active:    c.is_active,
    work_start:   c.work_start   || "",
    strong:       c.strong       || "未分析",
    weak:         c.weak         || "未分析",
    heaven_id:    c.heaven_id    || "",
    type:         c.type         ?? null,
    disclose:     c.disclose     ?? null,
    shindan_note: c.shindan_note ?? null,
  };
}

// ============================================================
// localStorage 永続化フック
// ============================================================
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const initialized = useRef(false);

  useEffect(() => {
    const nsKey = skey(key); // 選択中店舗で名前空間化
    if (!initialized.current) {
      // 初回マウント時: localStorageから読み込む
      initialized.current = true;
      try {
        const stored = localStorage.getItem(nsKey);
        if (stored !== null) {
          setValue(JSON.parse(stored));
          return; // 読み込み後は書き込まずに終了
        }
      } catch {}
    }
    // 初回以降: localStorageへ書き込む
    try {
      localStorage.setItem(nsKey, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}

// ============================================================
// メインアプリ
// ============================================================
function App() {
  // 店舗データ移行（描画前に1回・同期実行）— useLocalStorage の読み込みより先に確実に走らせる
  if (typeof window !== "undefined") ensureStoreMigration();

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }, []);

  // 店舗切替（共通キー・名前空間化しない）
  const [storeList, setStoreList] = useState(DEFAULT_STORES);
  const [activeStoreId, setActiveStoreId] = useState(DEFAULT_STORE_ID);
  useEffect(() => {
    try { setStoreList(getStores()); setActiveStoreId(getActiveStoreId()); } catch {}
  }, []);
  function switchStore(id) {
    if (!id || id === getActiveStoreId()) return;
    try {
      localStorage.setItem(ACTIVE_STORE_KEY, id);
      // 店舗切替のリロードをまたいで「今いる画面」を保持（次回マウントで1回だけ復元）
      sessionStorage.setItem("shamenikki_switch_restore", JSON.stringify({ mode, adminUnlocked, castPage, adminPage }));
    } catch {}
    // 確実に反映するためページを再読込（名前空間化された各キーを読み直す）
    location.reload();
  }

  // 初期値はサーバ描画と同じデフォルトにする（hydration mismatch を起こさないため）
  const [mode, setMode] = useState("cast");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [castPage, setCastPage] = useState("score");
  const [showShindan, setShowShindan] = useState(false);
  const [adminPage, setAdminPage] = useState("guarantee");

  // 店舗切替のリロードをまたいで現在の画面を復元する（クライアント専用・マウント後に1回だけ）。
  // lazy initializer ではなく useEffect で適用することで、初期描画はサーバと一致し
  // hydration mismatch → 再マウントが起きない（= 復元が再マウントに巻き込まれて消える問題を回避）。
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("shamenikki_switch_restore");
      if (raw) {
        const r = JSON.parse(raw);
        if (r.mode !== undefined) setMode(r.mode);
        if (r.adminUnlocked !== undefined) setAdminUnlocked(r.adminUnlocked);
        if (r.castPage !== undefined) setCastPage(r.castPage);
        if (r.adminPage !== undefined) setAdminPage(r.adminPage);
      }
    } catch {}
    // 復元値は1回使ったら破棄（通常リロードでは従来どおり再ロックされるように）
    try { sessionStorage.removeItem("shamenikki_switch_restore"); } catch {}
  }, []);
  // 既定のモックデータ(initCasts 等)はオリジナル店(nadeshiko)だけに使う。
  // 新規店はデータが無ければ「空」で始める（NADESHIKO の既定キャストを流し込まない）。
  const isOriginalStore = getActiveStoreId() === DEFAULT_STORE_ID;
  const [casts, setCasts] = useLocalStorage("shamenikki_casts", isOriginalStore ? initCasts : []);
  const [scores, setScores] = useLocalStorage("shamenikki_scores", isOriginalStore ? initScores : []);
  const [settings, setSettings] = useLocalStorage("shamenikki_settings", initSettings);
  const [courses, setCourses] = useLocalStorage("shamenikki_courses", isOriginalStore ? initCourses : []);
  const [shifts, setShifts] = useLocalStorage("shamenikki_shifts", {});
  const [syncConfig, setSyncConfig] = useLocalStorage("shamenikki_sync_config", { shopdir: "", adminId: "", adminPass: "" });
  const [cutDays, setCutDays] = useLocalStorage("shamenikki_cut_days", initCutDays);
  const [loggedInCast, setLoggedInCast] = useState(null);
  const [sessionPass, setSessionPass] = useState(""); // ログイン中のパスをメモリのみ保持

  // Supabase courses 初期化（起動時1回）
  useEffect(() => {
    async function initCourses() {
      try {
        const { data, error } = await supabase.from("courses").select("*").eq("store_id", getActiveStoreId()).order("minutes");
        if (error) throw error;
        if (data.length > 0) {
          // Supabaseにデータあり → それを使う
          setCourses(data.map((r) => ({ id: r.id, minutes: r.minutes })));
        } else if (getActiveStoreId() === DEFAULT_STORE_ID) {
          // オリジナル店(NADESHIKO)のみ: localStorage を Supabase に初回シード
          try {
            const stored = localStorage.getItem(skey("shamenikki_courses"));
            if (stored) {
              const local = JSON.parse(stored);
              if (local.length > 0) {
                const { error: errCourses } = await supabase.from("courses").upsert(local.map((c) => ({ id: c.id, minutes: c.minutes, store_id: getActiveStoreId() })), { onConflict: "store_id,id" });
                if (errCourses) console.error("initCourses upsert失敗:", errCourses);
              }
            }
          } catch (e) { console.error("initCourses 例外:", e); }
        } else {
          // 非オリジナル店で Supabase が0件。localStorage にも無いときだけ空にする（誤った空で消さない）
          let localArr = [];
          try { const s = localStorage.getItem(skey("shamenikki_courses")); localArr = s ? JSON.parse(s) : []; } catch {}
          if (!Array.isArray(localArr) || localArr.length === 0) setCourses([]);
        }
      } catch (e) { console.error("initCourses 例外:", e); }
    }
    initCourses();
  }, []);

  // Supabase settings 初期化（起動時1回）
  useEffect(() => {
    async function initSettings() {
      try {
        // ① 初回シード：localStorageの実設定をSupabaseのデフォルト行に上書き（1回だけ）
        const synced = localStorage.getItem("shamenikki_settings_synced");
        if (!synced) {
          try {
            const stored = localStorage.getItem(skey("shamenikki_settings"));
            if (stored) {
              const local = JSON.parse(stored);
              const { error: errSettings } = await supabase.from("settings").upsert({
                store_id:         getActiveStoreId(),
                id: 1,
                daily_post_goal:  local.daily_post_goal,
                repeat_limit_min: local.repeat_limit_min,
                min_text_length:  local.min_text_length,
                image_required:   local.image_required,
                before_work_min:  local.before_work_min,
                after_work_min:   local.after_work_min,
                show_guarantee:   local.show_guarantee ?? true,
                updated_at:       new Date().toISOString(),
              }, { onConflict: "store_id,id" });
              if (errSettings) console.error("initSettings upsert失敗:", errSettings);
              localStorage.setItem("shamenikki_settings_synced", "1");
            }
          } catch (e) { console.error("initSettings 例外:", e); }
        }

        // ② ①の後にSupabaseから読み込み（デフォルト行でユーザー設定を上書きしない）
        const { data, error } = await supabase.from("settings").select("*").eq("store_id", getActiveStoreId()).eq("id", 1).single();
        if (!error && data) {
          setSettings({
            daily_post_goal:  data.daily_post_goal,
            repeat_limit_min: data.repeat_limit_min,
            min_text_length:  data.min_text_length,
            image_required:   data.image_required,
            before_work_min:  data.before_work_min,
            after_work_min:   data.after_work_min,
            show_guarantee:   data.show_guarantee,
          });
        }
      } catch (e) { console.error("initSettings 例外:", e); }
    }
    initSettings();
  }, []);

  // Supabase casts 初期化（起動時1回）
  useEffect(() => {
    async function initCasts() {
      try {
        const { data, error } = await supabase.from("casts").select("*").eq("store_id", getActiveStoreId());
        if (error) throw error;

        if (data.length === 0) {
          if (getActiveStoreId() === DEFAULT_STORE_ID) {
            // オリジナル店(NADESHIKO)のみ: localStorage を Supabase に初回シード（heaven_passは送らない）
            try {
              const stored = localStorage.getItem(skey("shamenikki_casts"));
              if (stored) {
                const local = JSON.parse(stored);
                if (local.length > 0) {
                  const { error: errCasts } = await supabase.from("casts").upsert(local.map(toSupabaseCast), { onConflict: "store_id,name" });
                  if (errCasts) console.error("initCasts upsert失敗:", errCasts);
                }
              }
            } catch (e) { console.error("initCasts 例外:", e); }
          } else {
            // 非オリジナル店で Supabase が0件。ただし localStorage に既存データがあるなら
            // 「誤った空（店舗往復時の取得失敗等）」の可能性が高いので破壊しない（141件を消さない）。
            // localStorage も空のときだけ空表示にする（真に未同期の新規店）。
            let localArr = [];
            try { const s = localStorage.getItem(skey("shamenikki_casts")); localArr = s ? JSON.parse(s) : []; } catch {}
            if (!Array.isArray(localArr) || localArr.length === 0) setCasts([]);
          }
        } else {
          // Supabaseにデータあり → localStorageのheaven_passをname照合でマージ
          try {
            const stored = localStorage.getItem(skey("shamenikki_casts"));
            const localCasts = stored ? JSON.parse(stored) : [];
            const merged = data.map((sc) => {
              const lc = localCasts.find((l) => l.name === sc.name);
              return {
                name:         sc.name,
                is_active:    sc.is_active,
                work_start:   sc.work_start   || "",
                strong:       sc.strong       || "未分析",
                weak:         sc.weak         || "未分析",
                heaven_id:    sc.heaven_id    || "",
                heaven_pass:  lc?.heaven_pass || "",
                type:         sc.type         ?? undefined,
                disclose:     sc.disclose     ?? undefined,
                shindan_note: sc.shindan_note ?? undefined,
              };
            });
            setCasts(merged);
          } catch {}
        }
      } catch (e) { console.error("initCasts 例外:", e); }
    }
    initCasts();
  }, []);

  // Supabase scores 初期化（起動時1回）
  useEffect(() => {
    async function initScores() {
      try {
        const { data, error } = await supabase.from("scores").select("*").eq("store_id", getActiveStoreId()).order("posted_at", { ascending: false });
        if (error) throw error;

        if (data.length === 0) {
          if (getActiveStoreId() === DEFAULT_STORE_ID) {
            // オリジナル店(NADESHIKO)のみ: localStorage を Supabase に初回シード
            try {
              const stored = localStorage.getItem(skey("shamenikki_scores"));
              if (stored) {
                const local = JSON.parse(stored);
                if (local.length > 0) {
                  const { error: errScores } = await supabase.from("scores").upsert(local.map((s) => ({
                    store_id:   getActiveStoreId(),
                    id:         s.id,
                    cast_name:  s.cast_name,
                    diary:      s.diary,
                    result:     s.result,
                    posted_at:  s.posted_at,
                    has_image:  s.has_image,
                    score:      s.score,
                  })), { onConflict: "id" });
                  if (errScores) console.error("initScores upsert失敗:", errScores);
                }
              }
            } catch (e) { console.error("initScores 例外:", e); }
          } else {
            // 非オリジナル店で Supabase が0件。localStorage にも無いときだけ空にする（誤った空で消さない）
            let localArr = [];
            try { const s = localStorage.getItem(skey("shamenikki_scores")); localArr = s ? JSON.parse(s) : []; } catch {}
            if (!Array.isArray(localArr) || localArr.length === 0) setScores([]);
          }
        } else {
          // Supabaseにデータあり → それを使う
          setScores(data.map((s) => ({
            id:        s.id,
            cast_name: s.cast_name,
            diary:     s.diary,
            result:    s.result,
            posted_at: s.posted_at,
            has_image: s.has_image,
            score:     s.score,
          })));
        }
      } catch (e) { console.error("initScores 例外:", e); }
    }
    initScores();
  }, []);

  // Supabase shifts 初期化（起動時1回）
  useEffect(() => {
    async function initShifts() {
      try {
        const { data, error } = await supabase.from("shifts").select("*").eq("store_id", getActiveStoreId());
        if (error) throw error;

        if (data.length === 0) {
          // Supabaseが空 → localStorageの内容をシード
          try {
            const stored = localStorage.getItem(skey("shamenikki_shifts"));
            if (stored) {
              const local = JSON.parse(stored);
              const rows = Object.entries(local).map(([key, val]) => ({
                store_id:   getActiveStoreId(),
                cast_name:  key.slice(0, -11),   // 末尾11文字("_YYYY-MM-DD")を除いた部分
                date:       key.slice(-10),        // 末尾10文字がYYYY-MM-DD
                start_time: val.startTime || "",
                end_time:   val.endTime   || "",
              }));
              if (rows.length > 0) {
                const { error: errShifts } = await supabase.from("shifts").upsert(rows, { onConflict: "store_id,cast_name,date" });
                if (errShifts) console.error("initShifts upsert失敗:", errShifts);
              }
            }
          } catch (e) { console.error("initShifts 例外:", e); }
        } else {
          // Supabaseにデータあり → 2形式を復元:
          //  (1) "cast_name_YYYY-MM-DD" → {startTime,endTime}（給料/カレンダー参照用）
          //  (2) "cast_name" → [{date:M/D,start,end}]（今日出勤フィルタ shiftDaysFor 用）
          //  ※(2)が無いと別端末でクラウドから読んだだけでは今日出勤が出ない。
          const rebuilt = {};
          const arrays = {};
          data.forEach((row) => {
            rebuilt[`${row.cast_name}_${row.date}`] = { startTime: row.start_time, endTime: row.end_time };
            if (row.date && row.date.length >= 10) {
              const md = `${parseInt(row.date.slice(5, 7), 10)}/${parseInt(row.date.slice(8, 10), 10)}`; // YYYY-MM-DD→M/D(ゼロ詰めなし)
              if (!arrays[row.cast_name]) arrays[row.cast_name] = [];
              arrays[row.cast_name].push({ date: md, start: row.start_time, end: row.end_time });
            }
          });
          Object.assign(rebuilt, arrays);
          // prev（localStorage由来）を優先してマージ: doSyncが書いたローカルの最新を上書きしない
          setShifts((prev) => ({ ...rebuilt, ...prev }));
        }
      } catch (e) { console.error("initShifts 例外:", e); }
    }
    initShifts();
  }, []);

  // Supabase cast_types 初期化（起動時1回）
  useEffect(() => {
    async function initCastTypes() {
      try {
        const { data, error } = await supabase.from("cast_types").select("*").eq("store_id", getActiveStoreId());
        if (error) throw error;

        if (data.length === 0) {
          // Supabaseが空 → localStorageの cast_type_* を走査してシード
          try {
            const rows = scopedKeys("cast_type_")
              .map(({ fullKey, baseKey }) => {
                try {
                  const val = JSON.parse(localStorage.getItem(fullKey));
                  if (!val?.type) return null;
                  return { store_id: getActiveStoreId(), cast_id: baseKey.slice("cast_type_".length), type: val.type, retries: val.retries ?? 0, updated_at: new Date().toISOString() };
                } catch { return null; }
              })
              .filter(Boolean);
            if (rows.length > 0) {
              const { error: errCastTypes } = await supabase.from("cast_types").upsert(rows, { onConflict: "store_id,cast_id" });
              if (errCastTypes) console.error("initCastTypes upsert失敗:", errCastTypes);
            }
          } catch (e) { console.error("initCastTypes 例外:", e); }
        } else {
          // Supabaseにデータあり → 各行をlocalStorageに書き戻す（ハイドレート）
          data.forEach((row) => {
            try { localStorage.setItem(skey(`cast_type_${row.cast_id}`), JSON.stringify({ type: row.type, retries: row.retries })); } catch {}
          });
        }
      } catch (e) { console.error("initCastTypes 例外:", e); }
    }
    initCastTypes();
  }, []);

  // Supabase support_settings 初期化（起動時1回）
  useEffect(() => {
    async function initSupportSettings() {
      try {
        const { data, error } = await supabase.from("support_settings").select("*").eq("store_id", getActiveStoreId());
        if (error) throw error;

        if (data.length === 0) {
          // Supabaseが空 → localStorageの support_settings_* を走査してシード
          try {
            const rows = scopedKeys("support_settings_")
              .map(({ fullKey, baseKey }) => {
                try {
                  const val = JSON.parse(localStorage.getItem(fullKey));
                  return {
                    store_id:      getActiveStoreId(),
                    cast_id:       baseKey.slice("support_settings_".length),
                    image_support: typeof val.imageSupport === "boolean" ? val.imageSupport : true,
                    text_support:  typeof val.textSupport  === "boolean" ? val.textSupport  : true,
                    title_assist:  typeof val.titleAssist  === "boolean" ? val.titleAssist  : true,
                    updated_at:    new Date().toISOString(),
                  };
                } catch { return null; }
              })
              .filter(Boolean);
            if (rows.length > 0) {
              const { error: errSupport } = await supabase.from("support_settings").upsert(rows, { onConflict: "store_id,cast_id" });
              if (errSupport) console.error("initSupportSettings upsert失敗:", errSupport);
            }
          } catch (e) { console.error("initSupportSettings 例外:", e); }
        } else {
          // Supabaseにデータあり → 各行をlocalStorageに書き戻す（ハイドレート）
          data.forEach((row) => {
            try {
              localStorage.setItem(skey(`support_settings_${row.cast_id}`), JSON.stringify({
                imageSupport: row.image_support,
                textSupport:  row.text_support,
                titleAssist:  row.title_assist,
              }));
            } catch {}
          });
        }
      } catch (e) { console.error("initSupportSettings 例外:", e); }
    }
    initSupportSettings();
  }, []);

  // Supabase salary 初期化（起動時1回）
  useEffect(() => {
    async function initSalaryRecords() {
      try {
        const { data: recordsData, error } = await supabase.from("salary_records").select("*").eq("store_id", getActiveStoreId());
        if (error) throw error;

        if (recordsData.length === 0) {
          // Supabaseが空 → localStorageの shamenikki_salary_* を走査してシード
          try {
            const salaryKeys = scopedKeys("shamenikki_salary_");
            for (const { fullKey, baseKey } of salaryKeys) {
              const castId = baseKey.slice("shamenikki_salary_".length);
              const recs = JSON.parse(localStorage.getItem(fullKey)) || [];
              for (const rec of recs) {
                // 親レコードを先に upsert
                const { error: errSalRec } = await supabase.from("salary_records").upsert(toSupabaseRecord(rec, castId));
                if (errSalRec) console.error("initSalaryRecords upsert失敗:", errSalRec);
                // 既存sessionを削除してから再挿入（重複防止）
                const { error: errSalSessDel } = await supabase.from("salary_sessions").delete().eq("salary_record_id", rec.id);
                if (errSalSessDel) console.error("initSalaryRecords delete失敗:", errSalSessDel);
                const sessions = toSupabaseSessions(rec);
                if (sessions.length > 0) {
                  const { error: errSalSessIns } = await supabase.from("salary_sessions").insert(sessions);
                  if (errSalSessIns) console.error("initSalaryRecords insert失敗:", errSalSessIns);
                }
              }
            }
          } catch (e) { console.error("initSalaryRecords 例外:", e); }
        } else {
          // Supabaseにデータあり → sessionsも取得してlocalStorageに書き戻す（ハイドレート）
          try {
            const { data: sessionsData } = await supabase.from("salary_sessions").select("*").eq("store_id", getActiveStoreId());
            // sessions を salary_record_id でグループ化
            const sessionsMap = {};
            (sessionsData || []).forEach((s) => {
              if (!sessionsMap[s.salary_record_id]) sessionsMap[s.salary_record_id] = [];
              sessionsMap[s.salary_record_id].push(s);
            });
            // records を cast_id でグループ化
            const castMap = {};
            recordsData.forEach((r) => {
              if (!castMap[r.cast_id]) castMap[r.cast_id] = [];
              const hons = (sessionsMap[r.id] || [])
                .sort((a, b) => a.seq - b.seq)
                .map((s) => ({
                  courseMin:  String(s.course_min),
                  shimei:     s.shimei,
                  fee:        String(s.fee),
                  shimeiRyou: String(s.shimei_ryou),
                  op:         String(s.op),
                  extCount:   String(s.ext_count),
                  extMin:     String(s.ext_min),
                }));
              castMap[r.cast_id].push({
                id:        r.id,
                date:      r.date,
                startTime: r.start_time,
                endTime:   r.end_time,
                honShimei: r.hon_shimei,
                pShimei:   r.p_shimei,
                free:      r.free,
                totalHon:  r.total_hon,
                courseMin: r.course_min,
                extCount:  r.ext_count,
                extMin:    r.ext_min,
                option:    r.option_amt,
                gross:     r.gross,
                dorm:      r.dorm,
                misc:      r.misc,
                transport: r.transport,
                takeHome:  r.take_home,
                hons,
              });
            });
            // cast_id ごとに localStorage に書き戻す
            Object.entries(castMap).forEach(([castId, recs]) => {
              try { localStorage.setItem(skey(`shamenikki_salary_${castId}`), JSON.stringify(recs)); } catch {}
            });
          } catch {}
        }
      } catch (e) { console.error("initSalaryRecords 例外:", e); }
    }
    initSalaryRecords();
  }, []);

  function tryUnlock() {
    // 現在選択中の店舗のパスワードと照合（未知店舗は従来の 1234 にフォールバック）
    const expected = ADMIN_PASSWORDS[getActiveStoreId()] ?? ADMIN_PASSWORD;
    if (passInput === expected) {
      setAdminUnlocked(true); setPassError(false); setPassInput("");
    } else {
      setPassError(true); setPassInput("");
    }
  }

  // 管理ログアウト＝Supabase Auth からもサインアウト（外側のログイン画面へ戻る）
  function logout() { setAdminUnlocked(false); setMode("cast"); try { supabase.auth.signOut(); } catch {} }
  function castLogout() { setLoggedInCast(null); setSessionPass(""); setCastPage("score"); setShowShindan(false); }
  function handleCastLogin(name, pass) {
    setLoggedInCast(name);
    setSessionPass(pass || "");
    const cast = casts.find((c) => c.name === name);
    const castId = cast?.heaven_id || name;
    try {
      const typeData = localStorage.getItem(skey(`cast_type_${castId}`));
      if (typeData && JSON.parse(typeData)?.type) { setCastPage("score"); return; }
    } catch {}
    setShowShindan(true);
  }

  const castNav = [
    { id: "score",   label: "AI採点",    icon: "✨" },
    { id: "salary",  label: "給料",      icon: "💴" },
    ...(settings.show_guarantee ? [{ id: "myguarantee", label: "保証確認", icon: "🎀" }] : []),
  ];

  const adminNav = [
    { id: "guarantee", label: "保証管理", icon: "🎀" },
    { id: "cast",      label: "キャスト", icon: "👑" }, // 出勤設定を統合済み
    { id: "bulkmitene", label: "一括ミテネ", icon: "💌" },
    // { id: "shifts",  label: "出勤設定", icon: "🕐" }, // キャストタブに統合
    // { id: "ranking", label: "ランキング", icon: "🌟" }, // 作り直し予定のため一時非表示
    // { id: "title",   label: "タイトル",  icon: "✏️" }, // 作り直し予定のため一時非表示
    { id: "courses",   label: "コース設定", icon: "⏱️" },
    { id: "settings",  label: "設定",    icon: "⚙️" },
  ];

  const page    = mode === "cast" ? castPage    : adminPage;
  const setPage = mode === "cast" ? setCastPage : setAdminPage;
  const nav     = mode === "cast" ? castNav     : adminNav;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Noto Sans JP', 'Hiragino Kaku Gothic Pro', sans-serif", overflowX: "hidden", maxWidth: "100%" }}>

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
            {/* 店舗切替（ログイン前にここで選ぶ。onChange のロジックは従来どおり） */}
            <Field label="店舗">
              <select
                value={activeStoreId}
                onChange={(e) => switchStore(e.target.value)}
                style={{ ...inp, cursor: "pointer" }}>
                {storeList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: C.accent, fontWeight: "700", letterSpacing: "0.05em" }}>
                {mode === "cast"
                  ? (loggedInCast ? `💕 ${loggedInCast}` : "💕 キャスト")
                  : "👑 店舗管理"}
              </span>
              {/* 現在のアクティブ店バッジ（キャスト・管理どちらのタブでも表示） */}
              <span style={{ fontSize: "13px", fontWeight: "700", color: C.accent2, background: `${C.accent2}1a`, border: `1.5px solid ${C.accent2}55`, padding: "4px 12px", borderRadius: "12px", whiteSpace: "nowrap" }}>
                🏠 {activeStoreId === DEFAULT_STORE_ID ? "NADESHIKO" : (storeList.find((s) => s.id === activeStoreId)?.name || activeStoreId)}
              </span>
            </div>
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

              <div style={{ padding: "20px 16px", maxWidth: (mode === "admin" && page === "cast") ? "1280px" : "680px", margin: "0 auto" }}>
                {mode === "cast" && showShindan && <ShindanPage casts={casts} setCasts={setCasts} loggedInCast={loggedInCast} onComplete={() => { setShowShindan(false); setCastPage("score"); }} />}
                {mode === "cast" && !showShindan && page === "score"       && <ScorePage casts={casts} settings={settings} scores={scores} setScores={setScores} loggedInCast={loggedInCast} sessionPass={sessionPass} onRetryDiagnosis={() => setShowShindan(true)} />}
                {mode === "cast" && !showShindan && page === "salary"      && <SalaryPage loggedInCast={loggedInCast} casts={casts} courses={courses} shifts={shifts} />}
                {mode === "cast" && !showShindan && page === "myguarantee" && <MyGuaranteePage casts={casts} scores={scores} settings={settings} loggedInCast={loggedInCast} />}

                {mode === "admin" && page === "guarantee" && <GuaranteePage casts={casts} scores={scores} settings={settings} shifts={shifts} cutDays={cutDays} />}
                {mode === "admin" && page === "cast"      && <CastPage casts={casts} setCasts={setCasts} scores={scores} shifts={shifts} setShifts={setShifts} syncConfig={syncConfig} settings={settings} />}
                {mode === "admin" && page === "bulkmitene" && <BulkMitenePage casts={casts} shifts={shifts} syncConfig={syncConfig} />}
                {mode === "admin" && page === "ranking"   && <RankingPage scores={scores} />}
                {mode === "admin" && page === "title"     && <TitlePage casts={casts} />}
                {mode === "admin" && page === "courses"   && <CoursesPage courses={courses} setCourses={setCourses} />}
                {mode === "admin" && page === "settings"  && <SettingsPage settings={settings} setSettings={setSettings} syncConfig={syncConfig} setSyncConfig={setSyncConfig} cutDays={cutDays} setCutDays={setCutDays} />}
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

  // マウント時にIDを復元。旧バージョンのauto_loginデータ（heavenPass含む）も除去する
  useEffect(() => {
    try { localStorage.removeItem(AUTO_LOGIN_KEY); } catch {} // 旧パスワードデータを掃除
    try {
      const saved = localStorage.getItem(CREDS_KEY);
      if (saved) {
        const creds = JSON.parse(saved);
        setHeavenId(creds.heavenId || "");
      }
    } catch {}
  }, []);

  function handleLogin() {
    if (!heavenId || !heavenPass) { setError("IDとパスワードを入力してください"); return; }
    setLoading(true); setError("");
    const matched = casts.find((c) => c.heaven_id === heavenId && c.is_active); // passはメモリのみ・保存値とは比較しない
    setTimeout(() => {
      setLoading(false);
      if (matched) {
        // ログイン成功: IDのみ保存。パスワードはどこにも保存しない
        localStorage.setItem(CREDS_KEY, JSON.stringify({ heavenId }));
        onLogin(matched.name, heavenPass); // passをメモリ経由で渡す
      } else {
        setError("IDまたはパスワードが一致しません");
      }
    }, 800);
  }

  function clearSavedId() {
    localStorage.removeItem(CREDS_KEY);
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
  const today = getBusinessToday();
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
      const saved = localStorage.getItem(skey(key));
      if (saved) setLockData(JSON.parse(saved));
    } catch {}
  }, [key]);

  function saveLock(updates) {
    setLockData((prev) => {
      const next = { ...prev, ...updates };
      if (key) { try { localStorage.setItem(skey(key), JSON.stringify(next)); } catch {} }
      if (castId) {
        try {
          supabase.from("cast_types").upsert(
            { store_id: getActiveStoreId(), cast_id: castId, type: next.type, retries: next.retries, updated_at: new Date().toISOString() },
            { onConflict: "store_id,cast_id" }
          ).then(({ error }) => {
            if (error) console.error("saveLock upsert失敗:", error);
          }).catch((e) => console.error("saveLock 例外:", e));
        } catch (e) { console.error("saveLock 同期例外:", e); }
      }
      return next;
    });
  }

  function resetLock() {
    setLockData({ type: null, retries: 0 });
    if (key) { try { localStorage.removeItem(skey(key)); } catch {} }
    if (castId) {
      try {
        supabase.from("cast_types").delete().eq("store_id", getActiveStoreId()).eq("cast_id", castId)
          .then(({ error }) => {
            if (error) console.error("resetLock delete失敗:", error);
          }).catch((e) => console.error("resetLock 例外:", e));
      } catch (e) { console.error("resetLock 同期例外:", e); }
    }
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
      const res = await fetch("/api/xai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-4.3", max_tokens: 800, reasoning_effort: "none",
          messages: [{ role: "user", content: `あなたはエンタメ業界のパーソナリティコンサルタントです。スタッフのキャラクター診断結果を分析して、自己PR文と写真のアドバイスをしてください。\n\nスタッフ名：${castName}\n診断回答：\n${QUESTIONS.map((q) => `・${q.text} → ${answers[q.id] || "未回答"}`).join("\n")}\n備考：${note || "なし"}\n判定キャラクター：${typeGuess}\n\n以下のフォーマットで返答してください：\n\nキャラクター判定：${typeGuess}\n\nあなたの魅力\n・\n・\n・\n\nおすすめ自己PR文スタイル\n・\n\nブログで使えるフレーズ例\n・\n・\n\n写真撮影のアドバイス\n・\n・` }]
        })
      });
      const data = await res.json();
      if (!res.ok) console.error("[xAI shindan]", res.status, JSON.stringify(data));
      const text = data.choices?.[0]?.message?.content || "";
      setResult({ type: typeGuess, detail: text });
      setCasts((prev) => prev.map((c) => c.name === castName ? { ...c, type: typeGuess, disclose, shindan_note: disclose === "YES" ? note : null } : c));
      try {
        supabase.from("casts").upsert(
          toSupabaseCast({ ...cast, type: typeGuess, disclose, shindan_note: disclose === "YES" ? note : null }),
          { onConflict: "store_id,name" }
        ).then(({ error }) => { if (error) console.error("[analyzeAndSave casts upsert]", error.message, error.details, error.hint); }).catch((e) => console.error("[analyzeAndSave casts upsert] exception:", e?.message || e));
      } catch {}
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
            <p style={{ color: C.muted, margin: 0 }}>AIが分析中です…（数秒かかります）</p>
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
      const saved = localStorage.getItem(skey(key));
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
      if (key) { try { localStorage.setItem(skey(key), JSON.stringify(next)); } catch {} }
      if (castId) {
        try {
          supabase.from("support_settings").upsert(
            { store_id: getActiveStoreId(), cast_id: castId, image_support: next.imageSupport, text_support: next.textSupport, title_assist: next.titleAssist, updated_at: new Date().toISOString() },
            { onConflict: "store_id,cast_id" }
          ).then(({ error }) => { if (error) console.error("[support update upsert]", error.message, error.details, error.hint); }).catch((e) => console.error("[support update upsert] exception:", e?.message || e));
        } catch {}
      }
      return next;
    });
  }

  return [support.imageSupport, support.textSupport, support.titleAssist, update];
}

// 画面幅が狭い（スマホ相当）かどうかを返すフック
function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 600);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return narrow;
}

// ============================================================
// AI採点（画像指導統合）
// ============================================================
function ScorePage({ casts, settings, scores, setScores, loggedInCast, sessionPass, onRetryDiagnosis }) {
  const narrow = useIsNarrow();
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
  const [titleWasAI, setTitleWasAI] = useState(false); // 今回の採点でタイトルがAI生成されたか
  const [bodyWasAI, setBodyWasAI] = useState(false);   // 今回の採点で本文がAIリライトされたか

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
      const saved = localStorage.getItem(skey(`cast_type_${castId}`));
      if (saved) {
        const { type, retries } = JSON.parse(saved);
        setConfirmedType(mapToCanonicalType(type));
        setTypeRetries(retries || 0);
      }
    } catch {}
  }, [castId]);

  function getSalaryContext() {
    try {
      const recs = JSON.parse(localStorage.getItem(skey(`shamenikki_salary_${castId}`))) || [];
      if (recs.length === 0) return "";
      const recent = recs.slice(0, 5);

      // 指名構成の傾向
      const avgHon = recent.reduce((s, r) => s + r.honShimei, 0) / recent.length;
      const avgFree = recent.reduce((s, r) => s + r.free, 0) / recent.length;

      // 稼働効率：出勤時間(h)あたりの本数
      const effRecs = recent.filter((r) => {
        if (!r.startTime || !r.endTime) return false;
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins <= 0) mins += 24 * 60; // 日跨ぎ対応
        return mins > 0;
      });
      let effDirection = "";
      if (effRecs.length > 0) {
        const avgHonPerHour = effRecs.reduce((s, r) => {
          const [sh, sm] = r.startTime.split(":").map(Number);
          const [eh, em] = r.endTime.split(":").map(Number);
          let mins = (eh * 60 + em) - (sh * 60 + sm);
          if (mins <= 0) mins += 24 * 60;
          return s + r.totalHon / (mins / 60);
        }, 0) / effRecs.length;

        if (avgHonPerHour >= 0.8) {
          effDirection = "出勤時間に対して本数が多く、回転・人気ともに良好。リピーターや本指名のさらなる定着、単価アップにつながる特別感・上質感を意識した表現にする";
        } else if (avgHonPerHour >= 0.4) {
          effDirection = "出勤時間に対して本数は平均的。フリー客をリピーターへ育てる「また会いたい」と思わせる親しみやすさと個性を前面に出す";
        } else {
          effDirection = "出勤時間に対して本数が少なめで、来店・指名につながる集客強化が優先課題。写真・文章で第一印象の魅力と「この子に会いたい」という動機を強く打ち出す";
        }
      }

      // 延長の傾向
      const extRecs = recent.filter((r) => r.totalHon > 0);
      let extDirection = "";
      if (extRecs.length > 0) {
        const avgExtPerHon = extRecs.reduce((s, r) => s + (r.extCount || 0), 0) / extRecs.reduce((s, r) => s + r.totalHon, 0);
        if (avgExtPerHon >= 0.5) {
          extDirection = "延長が多く、接客満足度が高い。一度来てもらえればリピートに直結するため、集客・露出を増やすことが最優先。写メ日記の更新頻度アップと、初回来店の動機づけとなる魅力的な見せ方を強化する";
        }
      }

      // 指名構成の傾向
      let shimeiDirection = "";
      if (avgHon <= 1) shimeiDirection = "本指名が少ないため「また会いたい」リピート獲得を重視する";
      else if (avgFree >= avgHon * 2) shimeiDirection = "フリー客が多いため個性・魅力を際立たせて指名転換を狙う";
      else shimeiDirection = "本指名とフリーのバランスが取れているため固定ファンの深耕を図る";

      const directions = [extDirection, effDirection, shimeiDirection].filter(Boolean).join("／");
      return `\n\n【執筆・アドバイス方向性の参考（内部情報のみ・出力に数字を含めないこと）】\n・方向性：${directions}\n・この情報はトーン・戦略の判断にのみ使うこと。出勤時間・本数・延長回数・稼働率・売上などの数字や否定的な評価表現は絶対に出力しないこと。改善提案は必ず前向きで具体的な表現にすること。`;
    } catch { return ""; }
  }
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
    setLoading(true); setResult(null); setRating(null); setImageResult(null); setTitleWasAI(false); setBodyWasAI(false);
    const autoPostedAt = new Date();
    const autoPostedAtISO = autoPostedAt.toISOString();
    const autoTimeStr = autoPostedAt.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    setPostedTime(autoTimeStr);

    const type = confirmedType || "清楚系";

    // Step 1: 本文AIリライト（textSupport ON のとき）
    let finalDiary = diary;
    if (textSupport) {
      try {
        const rwRes = await fetch("/api/xai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "grok-4.3", max_tokens: 800, reasoning_effort: "none",
            messages: [
              { role: "system", content: REWRITE_PROMPTS[type] },
              { role: "user", content: `以下の写メ日記をリライトしてください。内容・情報は維持しつつ、指定スタイルの文章に書き換えてください。${getSalaryContext()}\n\n【厳守事項】本数・指名数・手取り・売上などの数字は絶対に本文に含めないこと。方向性の参考情報はトーン判断にのみ使うこと。\n\n${diary}` }
            ]
          })
        });
        const rwData = await rwRes.json();
        if (!rwRes.ok) console.error("[xAI rewrite]", rwRes.status, JSON.stringify(rwData));
        const rewritten = rwData.choices?.[0]?.message?.content;
        if (rewritten) { finalDiary = rewritten; setDiary(rewritten); setBodyWasAI(true); }
      } catch { /* use original */ }
    }

    const charCountFinal = finalDiary.length;
    const charShortFinal = Math.max(settings.min_text_length - charCountFinal, 0);

    let scoreText = "";
    let sc = 0;
    try {
      // Step 2: AI採点・タイトル生成・画像分析を並列実行
      const scoreReqPromise = fetch("/api/xai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "grok-4.3", max_tokens: 1000, reasoning_effort: "none",
            messages: [{ role: "user", content: `あなたはエンタメ業界のブログコンサルタントです。スタッフのブログ記事を分析・採点してください。\n\n【投稿ルール】\n最低文字数：${settings.min_text_length}文字 / 今回：${charCountFinal}文字 / 不足：${charShortFinal}文字\n画像必須：${settings.image_required ? "あり" : "なし"} / 画像：${imageFile ? "あり" : "なし"}\n\n必ず以下のフォーマットで返答してください：\n\n総合点：○○点\n\n投稿ルールチェック\n・文字数判定：達成 or 文字数不足\n・画像判定：達成 or 画像不足\n\n改善提案\n・\n・\n\n良い点\n・\n・\n\n改善点\n・\n・\n\n改善タイトル案\n・\n・\n\nキャラクター分析\n・\n\n【スタッフ名】${castName}\n【ブログ本文】${finalDiary}` }]
          })
        });

      const titleGenPromise = titleAssist
        ? fetch("/api/xai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "grok-4.3", max_tokens: 100, reasoning_effort: "none",
              messages: [
                { role: "system", content: TITLE_PROMPTS[type] },
                { role: "user", content: `本文：${finalDiary}\n\nこの本文に合うタイトルを1つ生成してください。タイトルのみ返してください。` }
              ]
            })
          })
        : Promise.resolve(null);

      const imageAnalysisPromise = (imageSupport && imageFile)
        ? toBase64(imageFile).then((base64) => fetch("/api/xai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "grok-4.3",
              max_tokens: 1000,
              messages: [{
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: base64 } },
                  { type: "text", text: `あなたはヘブンの写メ日記専門の画像アドバイザーです。お客様が「会いたい」と思える写真にするため、具体的で読みやすいアドバイスをしてください。\n\nキャスト名：${castName || "未設定"}${getSalaryContext()}\n\n【厳守事項】アドバイス文に本数・指名数・手取り・売上などの数字は絶対に含めないこと。方向性の参考情報はアドバイスの視点（リピート重視か指名獲得重視か）を決めるためにのみ使うこと。\n\n以下の4項目を順番通りに出力してください。専門的すぎる説明や長い項目分けは不要です。\n\n🎯 指名度判定\n下記4段階のうち1つを選び、理由を一言添えてください。\n◎ 呼ばれやすい ／ ○ まあ呼ばれる ／ △ もう一歩 ／ ✕ 改善が必要\n例）○ まあ呼ばれる ― 笑顔が自然で親しみやすいが、背景が散らかっていてもったいない\n\n📷 全体の印象\n・この写真を一言で表すと（率直に）\n\n✨ 良い点（2個）\n①（良いポイントと、なぜ魅力的かを一文で）\n②（同上）\n\n📸 改善ポイント（3〜4個）\n①（問題点）→（どう直すと良いか具体的に一文で）\n②（同上）\n③（同上）\n④（あれば）\n\n※女の子がすぐ実践できる内容で。角度・明るさ・ポーズ・構図・加工などを中心に。` },
                ],
              }],
            }),
          }))
        : Promise.resolve(null);

      const [scoreRes, titleRes, imgRes] = await Promise.all([scoreReqPromise, titleGenPromise, imageAnalysisPromise]);

      if (scoreRes) {
        const scoreData = await scoreRes.json();
        if (!scoreRes.ok) console.error("[xAI score]", scoreRes.status, JSON.stringify(scoreData));
        scoreText = scoreData.choices?.[0]?.message?.content || "結果を取得できませんでした";
        const scoreMatch = scoreText.match(/(\d+)点/);
        sc = scoreMatch ? Number(scoreMatch[1]) : 50;
        setResult(scoreText);
        setRating(getRating(sc));
      }

      if (titleRes) {
        const titleData = await titleRes.json();
        if (!titleRes.ok) console.error("[xAI title]", titleRes.status, JSON.stringify(titleData));
        const generated = titleData.choices?.[0]?.message?.content;
        if (generated) { setTitle(generated.trim()); setTitleWasAI(true); }
      }

      if (imgRes) {
        const imgData = await imgRes.json();
        if (!imgRes.ok) console.error("[xAI image]", imgRes.status, JSON.stringify(imgData));
        setImageResult(imgData.choices?.[0]?.message?.content || null);
      }
    } catch { setResult("エラーが発生しました。もう一度お試しください。"); }
    finally {
      let imageHash = "";
      if (imageFile) {
        try {
          const buf = await imageFile.arrayBuffer();
          const hashBuf = await crypto.subtle.digest("SHA-256", buf);
          imageHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch {}
      }
      const newScore = { id: Date.now(), cast_name: castName, diary: finalDiary, result: scoreText, posted_at: autoPostedAtISO, has_image: !!imageFile, image_hash: imageHash, score: sc };
      setScores((prev) => [newScore, ...prev]);
      try { supabase.from("scores").upsert({ ...newScore, store_id: getActiveStoreId() }, { onConflict: "id" }).then(({ error }) => { if (error) console.error("[post scores upsert]", error.message, error.details, error.hint); }).catch((e) => console.error("[post scores upsert] exception:", e?.message || e)); } catch {}
      setLoading(false);
    }
  }

  // 常に表示: 投稿ルールチェック
  // 削除: 改善提案・良い点・改善点（画像AI分析と重複）
  // 条件付き: 改善タイトル案(タイトルが手書きのとき) / キャラクター分析(本文が手書きのとき)
  const sections = [
    "投稿ルールチェック",
    ...(!titleWasAI ? ["改善タイトル案"] : []),
    ...(!bodyWasAI  ? ["キャラクター分析"] : []),
  ];
  const imgStyle = { width: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: "12px", border: `1.5px solid ${C.border}`, display: "block", background: "#fdf0f8" };

  const confirmedTypeInfo = confirmedType ? TYPE_INFO[confirmedType] : null;
  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {confirmedTypeInfo && (
        <div style={{ ...card, textAlign: "center", padding: narrow ? "12px 16px" : "28px 20px", background: `linear-gradient(135deg, ${confirmedTypeInfo.color}14, ${confirmedTypeInfo.color}08)`, borderColor: `${confirmedTypeInfo.color}50` }}>
          <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", marginBottom: narrow ? "4px" : "12px", letterSpacing: "0.1em" }}>あなたのタイプ</p>
          <p style={{ fontSize: narrow ? "28px" : "44px", marginBottom: narrow ? "2px" : "8px" }}>{confirmedTypeInfo.emoji}</p>
          <p style={{ fontSize: narrow ? "20px" : "26px", fontWeight: "700", color: confirmedTypeInfo.color, marginBottom: narrow ? "4px" : "8px" }}>{confirmedType}</p>
          <p style={{ fontSize: narrow ? "12px" : "13px", color: C.sub, lineHeight: narrow ? "1.5" : "1.7", marginBottom: typeRetries < 2 && onRetryDiagnosis ? (narrow ? "10px" : "16px") : "0" }}>{confirmedTypeInfo.desc}</p>
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
        <Btn onClick={handleScore} loading={loading} label={loading ? "AIが分析中です…（数秒かかります）" : "AI採点する"} color={C.accent} />
      </div>

      {/* 採点中ローディング表示（採点開始後、結果が出るまで） */}
      {loading && postedTime && (
        <div style={{ ...card, textAlign: "center", padding: "32px" }}>
          <p style={{ fontSize: "28px", marginBottom: "10px" }}>✨</p>
          <p style={{ color: C.muted, margin: 0 }}>採点中です…少々お待ちください</p>
        </div>
      )}

      {/* AI採点結果（手書き・AI生成どちらでも表示） */}
      {result && rating && (
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

      {/* ヘブン投稿（採点完了後のみ表示 = 採点を見てから投稿する流れを保証） */}
      {!loading && postedTime && (
        <HeavenPostButton castName={castName} diary={diary} title={title} result={result} casts={casts} postedTime={postedTime} imageFile={imageFile} imagePreviewUrl={imagePreviewUrl} sessionPass={sessionPass} />
      )}
    </div>
  );
}

// ============================================================
// ヘブン投稿
// ============================================================
function HeavenPostButton({ castName, diary, title, result, casts, postedTime, imageFile, imagePreviewUrl, sessionPass }) {
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [postError, setPostError] = useState(null);
  const [editTitle, setEditTitle] = useState(title || "");
  const [editDiary, setEditDiary] = useState(diary || "");
  const [limitedKind, setLimitedKind] = useState("00");

  useEffect(() => { setEditTitle(title || ""); }, [title]);
  useEffect(() => { setEditDiary(diary || ""); }, [diary]);

  const cast = casts.find((c) => c.name === castName);
  const hasCredentials = cast?.heaven_id && sessionPass; // パスはセッションのみ参照

  async function handlePost() {
    setShowConfirm(false); setPosting(true);
    try {
      const formData = new FormData();
      formData.append("heavenId", cast.heaven_id);
      formData.append("heavenPass", sessionPass); // 保存せずメモリのパスを使用
      formData.append("title", editTitle);
      formData.append("body", editDiary);
      if (imageFile) formData.append("image", imageFile);
      formData.append("limitedKind", limitedKind);

      // HTTPSアプリ→HTTPのVPS直接fetchはMixed Contentでブロックされるため
      // Next.jsのサーバーサイドプロキシ経由で転送する（同一オリジン）
      const res = await fetch("/api/heaven-post", {
        method: "POST",
        body: formData,
        // AuthorizationはAPIルート(サーバー側)で付与するためここでは不要
      });
      const data = await res.json();
      if (!res.ok) console.error("[heaven-post]", res.status, JSON.stringify(data));
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
        <div style={{ marginTop: "16px" }}>
          <p style={{ fontSize: "11px", color: C.sub, fontWeight: "700", letterSpacing: "0.06em", marginBottom: "10px" }}>公開範囲</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[
              { value: "00", label: "全公開", sub: "全てのヘブンユーザーに公開" },
              { value: "02", label: "マイガール限定", sub: "マイガールにだけ公開" },
            ].map(({ value, label, sub }) => {
              const active = limitedKind === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLimitedKind(value)}
                  style={{
                    position: "relative",
                    padding: "14px 10px",
                    borderRadius: "14px",
                    border: active ? "none" : `1.5px solid ${C.border}`,
                    background: active ? "linear-gradient(135deg, #ff6b9d, #d946ef)" : "white",
                    color: active ? "white" : C.muted,
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: "pointer",
                    boxShadow: active ? "0 4px 16px rgba(255,107,157,0.35)" : "none",
                    transition: "all 0.2s",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    width: "100%",
                    minHeight: "68px",
                  }}
                >
                  {/* ✓は左上に絶対配置 → ラベルの中央位置に影響しない */}
                  {active && (
                    <span style={{ position: "absolute", top: "8px", left: "10px", fontSize: "11px", lineHeight: 1 }}>✓</span>
                  )}
                  {/* ラベルのみ完全中央 */}
                  <span style={{ display: "block" }}>{label}</span>
                  {/* 高さ均等用：常に描画、subなしのボタンは非表示 */}
                  <span style={{ fontSize: "10px", fontWeight: "400", opacity: 0.85, marginTop: "3px", visibility: sub ? "visible" : "hidden" }}>
                    {sub || "　"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
      const res = await fetch("/api/xai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-4.3", max_tokens: 800, reasoning_effort: "none",
          messages: [{ role: "user", content: `風俗店の写メ日記タイトルを分析してください。\n\nタイトル：${title}\n本文：${body || "（未入力）"}\nキャスト：${castName || "未設定"}\n\n以下のフォーマットで返答してください：\n\nタイトル評価：良 or 普 or 改善\n\n良い点\n・\n\n改善点\n・\n\n改善タイトル案（3つ）\n1.\n2.\n3.\n\nクリックされやすい理由\n・` }]
        })
      });
      const data = await res.json();
      if (!res.ok) console.error("[xAI title-analyze]", res.status, JSON.stringify(data));
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
        <Btn onClick={analyze} loading={loading} label={loading ? "AIが分析中です…（数秒かかります）" : "タイトルを分析する"} color={C.pink} />
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
// 給料記録
// ============================================================
function SalaryPage({ loggedInCast, casts, courses = [], shifts = {} }) {
  const cast = casts.find((c) => c.name === loggedInCast);
  const castId = cast?.heaven_id || loggedInCast || "";
  const storageKey = `shamenikki_salary_${castId}`;

  function loadRecords() {
    try { return JSON.parse(localStorage.getItem(skey(storageKey))) || []; } catch { return []; }
  }

  const mkHon = () => ({ courseMin: "", shimei: "", fee: "", shimeiRyou: "", op: "", extCount: "", extMin: "" });
  const today = getBusinessToday();
  const [records, setRecords] = useState(loadRecords);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const staffShift = shifts[`${loggedInCast}_${today}`] || null;

  useEffect(() => {
    if (staffShift?.startTime) setStartTime(staffShift.startTime);
    if (staffShift?.endTime) setEndTime(staffShift.endTime);
  }, [staffShift?.startTime, staffShift?.endTime]);
  const [hons, setHons] = useState(() => Array.from({ length: 12 }, mkHon));
  const [gross, setGross] = useState("");
  const [dorm, setDorm] = useState("");
  const [misc, setMisc] = useState("");
  const [transport, setTransport] = useState("");
  const [saved, setSaved] = useState(false);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipOcrDone, setSlipOcrDone] = useState(false);

  // 明細表示（本人が自分の明細を閲覧）: salary_statements を取得し、非公開バケットの署名付きURLを作る
  const [statements, setStatements] = useState([]);
  const [statementUrls, setStatementUrls] = useState({}); // image_path → 署名付きURL
  useEffect(() => {
    if (!castId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.from("salary_statements")
        .select("date, image_path, approved, approved_at, rejected_at, reject_reason, uploaded_at")
        .eq("store_id", getActiveStoreId())
        .eq("cast_id", castId)
        .order("date", { ascending: false });
      if (error) { console.error("明細取得失敗:", error); return; }
      if (!active) return;
      setStatements(Array.isArray(data) ? data : []);
      // 各 image_path の署名付きURLを作成（statements は非公開バケット）
      const urls = {};
      for (const row of (data || [])) {
        if (!row.image_path) continue; // image_path が無い行は画像なし扱い
        const { data: signed, error: signErr } = await supabase.storage.from("statements").createSignedUrl(row.image_path, 3600);
        if (signErr) { console.error("署名URL作成失敗:", signErr); continue; }
        if (signed?.signedUrl) urls[row.image_path] = signed.signedUrl;
      }
      if (active) setStatementUrls(urls);
    })();
    return () => { active = false; };
  }, [castId]);

  // 明細の承認/非承認（本人操作）。キーは store_id, cast_id, date。
  const [rejectingDate, setRejectingDate] = useState(null); // 理由入力中の明細date（1件のみ開く）
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState({}); // date → 保存エラーメッセージ
  function patchStatement(date, patch) {
    setStatements((prev) => prev.map((s) => (s.date === date ? { ...s, ...patch } : s)));
  }
  async function approveStatement(st) {
    setActionError((e) => ({ ...e, [st.date]: "" }));
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("salary_statements")
      .update({ approved: true, approved_at: nowIso, rejected_at: null, reject_reason: null })
      .eq("store_id", getActiveStoreId()).eq("cast_id", castId).eq("date", st.date);
    if (error) {
      console.error("承認の保存失敗:", error);
      setActionError((e) => ({ ...e, [st.date]: "保存に失敗しました。もう一度お試しください" }));
      return;
    }
    patchStatement(st.date, { approved: true, approved_at: nowIso, rejected_at: null, reject_reason: null });
  }
  async function rejectStatement(st) {
    const text = rejectReason.trim();
    if (!text) return; // 理由が空なら送信しない
    setActionError((e) => ({ ...e, [st.date]: "" }));
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("salary_statements")
      .update({ approved: false, rejected_at: nowIso, reject_reason: text })
      .eq("store_id", getActiveStoreId()).eq("cast_id", castId).eq("date", st.date);
    if (error) {
      console.error("非承認の保存失敗:", error);
      setActionError((e) => ({ ...e, [st.date]: "保存に失敗しました。もう一度お試しください" }));
      return;
    }
    patchStatement(st.date, { approved: false, rejected_at: nowIso, reject_reason: text });
    setRejectingDate(null);
    setRejectReason("");
  }

  function updateHon(i, key, val) {
    setHons((prev) => prev.map((h, idx) => idx === i ? { ...h, [key]: val } : h));
  }

  function isActive(h) {
    return h.courseMin !== "" || h.shimei !== "" || h.fee !== "" || h.shimeiRyou !== "" || h.op !== "" || h.extCount !== "" || h.extMin !== "";
  }

  async function readSlip(file) {
    setSlipLoading(true);
    setSlipOcrDone(false);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const prompt = `あなたは業務委託明細・給料明細のデータ抽出専門AIです。添付の明細画像から以下のJSON形式でデータを抽出してください。明細フォーマットはお店ごとに異なります。表の見出しを手がかりに柔軟に読み取り、空欄・不明な項目は0としてください。

【各セッション（1本ごと）のフィールド定義】
- courseMin: コース時間（分）。数値のみ。
- shimei: 指名種類。本指名・ホン指名・H指名→"本指名" / P指名・プレミアム→"P指名" / フリー・指名なし→"フリー" / 不明→"フリー"
- courseFee: 「金額」列のバック額（コース料金の本人取り分）。オプション料金とは別の欄。
- shimeiRyou: 「指名」列の指名料バック額。フリーは0。
- extCount: 延長回数。数値。
- extMin: 延長時間（分）。数値。
- op: 「オプション」列のオプション料金バック額。courseFeeとは別欄。
- subtotal: 小計（courseFee+shimeiRyou+延長料金+opの合計）。

【合計欄のフィールド定義】
- gross: 総支給（各本の小計の合計）。正の整数。
- misc: 雑費の金額。明細にマイナス表記（例：-8600）でも必ず正の整数で返すこと。
- dorm: 寮費の金額。必ず正の整数で返すこと。
- transport: 交通費の金額。必ず正の整数で返すこと。
- takeHome: 手取り（gross-misc-dorm-transport）。

金額はすべて円（数値のみ、記号・カンマなし）。必ずこのJSONのみで返してください（説明文不要）：
{"sessions":[{"courseMin":60,"shimei":"本指名","courseFee":5000,"shimeiRyou":2000,"extCount":0,"extMin":0,"op":0,"subtotal":7000}],"gross":50000,"misc":3000,"dorm":10000,"transport":1000,"takeHome":36000}`;
      const res = await fetch("/api/xai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-4.3",
          max_tokens: 2000,
          messages: [{ role: "user", content: [
            { type: "image_url", image_url: { url: base64 } },
            { type: "text", text: prompt },
          ]}],
        }),
      });
      const data = await res.json();
      if (!res.ok) console.error("[xAI ocr]", res.status, JSON.stringify(data));
      const text = data.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("parse failed");
      const parsed = JSON.parse(jsonMatch[0]);
      const newHons = Array.from({ length: 12 }, mkHon);
      (parsed.sessions || []).forEach((s, i) => {
        if (i < 12) newHons[i] = {
          courseMin: String(s.courseMin || ""),
          shimei: s.shimei || "",
          fee: String(Math.abs(s.courseFee || 0) || ""),
          shimeiRyou: String(Math.abs(s.shimeiRyou || 0) || ""),
          op: String(Math.abs(s.op || 0) || ""),
          extCount: String(s.extCount || ""),
          extMin: String(s.extMin || ""),
        };
      });
      setHons(newHons);
      if (parsed.gross != null) setGross(String(Math.abs(parsed.gross)));
      if (parsed.dorm != null) setDorm(String(Math.abs(parsed.dorm)));
      if (parsed.misc != null) setMisc(String(Math.abs(parsed.misc)));
      if (parsed.transport != null) setTransport(String(Math.abs(parsed.transport)));
      setSlipOcrDone(true);
    } catch {
      alert("読み取りに失敗しました。手動で入力してください。");
    } finally {
      setSlipLoading(false);
    }
  }

  const activeHons = hons.filter(isActive);
  const visibleCount = Math.min(12, activeHons.length + 1);

  const totalHon     = activeHons.length;
  const honShimei    = activeHons.filter((h) => h.shimei === "本指名").length;
  const pShimei      = activeHons.filter((h) => h.shimei === "P指名").length;
  const free         = activeHons.filter((h) => h.shimei === "フリー").length;
  const totalCourseMin = activeHons.reduce((s, h) => s + (Number(h.courseMin) || 0), 0);
  const totalExtCount  = activeHons.reduce((s, h) => s + (Number(h.extCount) || 0), 0);
  const totalExtMin    = activeHons.reduce((s, h) => s + (Number(h.extMin) || 0), 0);
  const totalOp        = activeHons.reduce((s, h) => s + (Number(h.op) || 0), 0);
  const takeHome = (Number(gross) || 0) - (Number(dorm) || 0) - (Number(misc) || 0) - (Number(transport) || 0);

  async function saveRecord() {
    const rec = {
      id: Date.now(),
      date: today,
      startTime, endTime,
      honShimei, pShimei, free,
      totalHon,
      courseMin: totalCourseMin,
      extCount: totalExtCount,
      extMin: totalExtMin,
      option: totalOp,
      gross: Number(gross) || 0,
      dorm: Number(dorm) || 0,
      misc: Number(misc) || 0,
      transport: Number(transport) || 0,
      takeHome,
      hons: activeHons,
    };
    const next = [rec, ...records].slice(0, 30);
    setRecords(next);
    localStorage.setItem(skey(storageKey), JSON.stringify(next)); // 従来通りlocalStorageに保存（店舗で名前空間化）
    setHons(Array.from({ length: 12 }, mkHon));
    if (!staffShift) { setStartTime(""); setEndTime(""); }
    setGross(""); setDorm(""); setMisc(""); setTransport("");
    setSlipOcrDone(false);

    // Supabase sync：親レコードを先にupsert → 既存sessionsをdelete → 再挿入
    try {
      const { error: recErr } = await supabase.from("salary_records").upsert(toSupabaseRecord(rec, castId));
      if (recErr) {
        console.error("[salary save salary_records upsert]", recErr.message, recErr.details, recErr.hint);
        alert("保存に失敗しました: " + recErr.message);
        return;
      }
      const { error: delErr } = await supabase.from("salary_sessions").delete().eq("salary_record_id", rec.id);
      if (delErr) {
        console.error("[salary save salary_sessions delete]", delErr.message, delErr.details, delErr.hint);
        alert("保存に失敗しました: " + delErr.message);
        return;
      }
      const sessions = toSupabaseSessions(rec);
      if (sessions.length > 0) {
        const { error: insErr } = await supabase.from("salary_sessions").insert(sessions);
        if (insErr) {
          console.error("[salary save salary_sessions insert]", insErr.message, insErr.details, insErr.hint);
          alert("保存に失敗しました: " + insErr.message);
          return;
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  const fmtYen = (n) => n.toLocaleString("ja-JP") + "円";
  const shimeiOpts = ["本指名", "P指名", "フリー"];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="給料記録" sub="1本ごとに入力して手取りを計算" color={C.accent} />

      {/* あなたの明細（管理者がアップロードした明細画像の閲覧。今回は表示のみ） */}
      <div style={{ ...card }}>
        <p style={{ fontSize: "13px", color: C.text, fontWeight: "700", marginBottom: "12px" }}>あなたの明細</p>
        {statements.length === 0 ? (
          <p style={{ fontSize: "12px", color: C.muted, margin: 0 }}>明細はまだありません</p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {statements.map((st, i) => {
              const url = st.image_path ? statementUrls[st.image_path] : null;
              const approvedDate = st.approved_at ? String(st.approved_at).slice(0, 10) : "";
              const isApproved = st.approved === true;
              const isRejected = !isApproved && !!st.rejected_at;
              const isPending  = !isApproved && !isRejected; // 承認も非承認もされていない未対応状態
              const err = actionError[st.date];
              return (
                <div key={`${st.date}_${i}`} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}`, paddingTop: i === 0 ? 0 : "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: C.text }}>{st.date}</span>
                    {isApproved ? (
                      <span style={{ fontSize: "11px", fontWeight: "700", color: C.green, background: `${C.green}15`, border: `1px solid ${C.green}40`, borderRadius: "10px", padding: "3px 10px", whiteSpace: "nowrap" }}>
                        承認済み{approvedDate ? `（${approvedDate}）` : ""}
                      </span>
                    ) : isRejected ? (
                      <span style={{ fontSize: "11px", fontWeight: "700", color: C.red, background: `${C.red}15`, border: `1px solid ${C.red}40`, borderRadius: "10px", padding: "3px 10px", whiteSpace: "nowrap" }}>
                        非承認
                      </span>
                    ) : (
                      <span style={{ fontSize: "11px", fontWeight: "700", color: C.muted, background: `${C.muted}15`, border: `1px solid ${C.muted}40`, borderRadius: "10px", padding: "3px 10px", whiteSpace: "nowrap" }}>
                        未承認
                      </span>
                    )}
                  </div>
                  {url ? (
                    <img src={url} alt={`${st.date} の明細`} style={{ width: "100%", borderRadius: "12px", border: `1px solid ${C.border}`, display: "block" }} />
                  ) : (
                    <p style={{ fontSize: "12px", color: C.muted, margin: 0 }}>画像なし</p>
                  )}

                  {/* 非承認の理由表示 */}
                  {isRejected && st.reject_reason && (
                    <p style={{ fontSize: "12px", color: C.red, margin: "8px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>理由：{st.reject_reason}</p>
                  )}

                  {/* 未対応：承認 / 非承認の操作 */}
                  {isPending && (
                    rejectingDate === st.date ? (
                      <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="非承認の理由を入力してください"
                          rows={3}
                          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "12px", border: `1.5px solid ${C.border}`, fontSize: "13px", color: C.text, outline: "none", resize: "vertical", fontFamily: "inherit" }}
                        />
                        {!rejectReason.trim() && (
                          <p style={{ fontSize: "11px", color: C.muted, margin: 0 }}>理由を入力してください</p>
                        )}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => rejectStatement(st)}
                            disabled={!rejectReason.trim()}
                            style={{ flex: 1, padding: "9px", borderRadius: "12px", border: "none", background: rejectReason.trim() ? C.red : C.muted, color: "#fff", fontWeight: "700", fontSize: "13px", cursor: rejectReason.trim() ? "pointer" : "not-allowed", opacity: rejectReason.trim() ? 1 : 0.6 }}>
                            送信
                          </button>
                          <button
                            onClick={() => { setRejectingDate(null); setRejectReason(""); }}
                            style={{ padding: "9px 14px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <button
                          onClick={() => approveStatement(st)}
                          style={{ flex: 1, padding: "9px", borderRadius: "12px", border: `1.5px solid ${C.green}60`, background: `${C.green}15`, color: C.green, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
                          承認
                        </button>
                        <button
                          onClick={() => { setRejectingDate(st.date); setRejectReason(""); setActionError((e2) => ({ ...e2, [st.date]: "" })); }}
                          style={{ flex: 1, padding: "9px", borderRadius: "12px", border: `1.5px solid ${C.red}60`, background: `${C.red}15`, color: C.red, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>
                          非承認
                        </button>
                      </div>
                    )
                  )}

                  {/* 保存エラー表示 */}
                  {err && (
                    <p style={{ fontSize: "11px", color: C.red, fontWeight: "700", margin: "8px 0 0" }}>{err}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 給料明細から自動入力 */}
      <div style={{ ...card, border: `2px dashed ${C.accent}60` }}>
        <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "8px" }}>給料明細から自動入力（任意）</p>
        <p style={{ fontSize: "11px", color: C.muted, marginBottom: "12px", lineHeight: 1.6 }}>明細の写真をアップすると自動で読み取ります。必ず内容を確認してから保存してください。</p>
        <label style={{ display: "block", cursor: slipLoading ? "not-allowed" : "pointer" }}>
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={slipLoading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readSlip(f); e.target.value = ""; }}
          />
          <div style={{ background: slipLoading ? `${C.muted}15` : `${C.accent}15`, border: `1.5px solid ${slipLoading ? C.muted : C.accent}40`, borderRadius: "12px", padding: "14px", textAlign: "center", color: slipLoading ? C.muted : C.accent, fontSize: "13px", fontWeight: "700" }}>
            {slipLoading ? "読み取り中..." : "明細画像をアップ"}
          </div>
        </label>
        {slipOcrDone && (
          <div style={{ marginTop: "10px", background: `${C.green}15`, border: `1.5px solid ${C.green}40`, borderRadius: "10px", padding: "10px", fontSize: "12px", color: C.green, fontWeight: "700", textAlign: "center" }}>
            読み取り完了。内容を確認・修正してから保存してください
          </div>
        )}
      </div>

      {/* 出勤時間 */}
      <div style={{ ...card }}>
        <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "14px" }}>TODAY {today}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <label style={{ fontSize: "12px", color: C.muted, fontWeight: "700" }}>出勤時間</label>
          {staffShift && (
            <span style={{ fontSize: "10px", color: C.blue, fontWeight: "700", background: `${C.blue}15`, padding: "2px 8px", borderRadius: "10px" }}>スタッフ設定済み</span>
          )}
        </div>
        {staffShift ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", borderRadius: "12px", border: `1.5px solid ${C.blue}40`, background: `${C.blue}08` }}>
            <span style={{ flex: 1, fontSize: "15px", fontWeight: "700", color: C.text, textAlign: "center" }}>{startTime || "—"}</span>
            <span style={{ color: C.muted, fontSize: "13px" }}>〜</span>
            <span style={{ flex: 1, fontSize: "15px", fontWeight: "700", color: C.text, textAlign: "center" }}>{endTime || "—"}</span>
          </div>
        ) : (
          <div style={{ padding: "12px 14px", borderRadius: "12px", border: `1.5px dashed ${C.border}`, background: `${C.muted}08`, textAlign: "center" }}>
            <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>スタッフが出勤時間を設定するまでお待ちください</p>
          </div>
        )}
      </div>

      {/* 1本ごと入力 */}
      {Array.from({ length: visibleCount }, (_, i) => {
        const h = hons[i];
        const active = isActive(h);
        return (
          <div key={i} style={{ ...card, borderColor: active ? C.accent + "80" : C.border }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: active ? C.accent : C.muted }}>{i + 1}本目</span>
              {active && (
                <span style={{ fontSize: "11px", color: C.green, fontWeight: "700" }}>
                  {h.shimei || "未選択"}{h.courseMin ? `・${h.courseMin}分` : ""}
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
              <Field label="コース">
                {courses.length > 0 ? (
                  <select value={h.courseMin} onChange={(e) => updateHon(i, "courseMin", e.target.value)} style={inp}>
                    <option value="">選択</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.minutes}>{c.minutes}分</option>
                    ))}
                  </select>
                ) : (
                  <input type="number" min="0" value={h.courseMin} onChange={(e) => updateHon(i, "courseMin", e.target.value)} placeholder="分" style={inp} />
                )}
              </Field>
              <Field label="指名">
                <select value={h.shimei} onChange={(e) => updateHon(i, "shimei", e.target.value)} style={inp}>
                  <option value="">選択</option>
                  {shimeiOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
              <Field label="金額（円）">
                <input type="number" min="0" value={h.fee} onChange={(e) => updateHon(i, "fee", e.target.value)} placeholder="0" style={{ ...inp, textAlign: "center" }} />
              </Field>
              <Field label="指名料（円）">
                <input type="number" min="0" value={h.shimeiRyou} onChange={(e) => updateHon(i, "shimeiRyou", e.target.value)} placeholder="0" style={{ ...inp, textAlign: "center" }} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <Field label="OP（円）">
                <input type="number" min="0" value={h.op} onChange={(e) => updateHon(i, "op", e.target.value)} placeholder="0" style={{ ...inp, textAlign: "center" }} />
              </Field>
              <Field label="延長（回）">
                <input type="number" min="0" value={h.extCount} onChange={(e) => updateHon(i, "extCount", e.target.value)} placeholder="0" style={{ ...inp, textAlign: "center" }} />
              </Field>
              <Field label="延長（分）">
                <input type="number" min="0" value={h.extMin} onChange={(e) => updateHon(i, "extMin", e.target.value)} placeholder="0" style={{ ...inp, textAlign: "center" }} />
              </Field>
            </div>
          </div>
        );
      })}

      {/* 集計サマリー */}
      {totalHon > 0 && (
        <div style={{ ...card, background: "linear-gradient(135deg, #fff8fc, #fff0f8)" }}>
          <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "10px" }}>集計</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Tag label={`合計 ${totalHon}本`} color={C.accent} />
            {honShimei > 0 && <Tag label={`本指名 ${honShimei}`} color={C.pink} />}
            {pShimei > 0 && <Tag label={`P指名 ${pShimei}`} color={C.blue} />}
            {free > 0 && <Tag label={`フリー ${free}`} color={C.muted} />}
            {totalCourseMin > 0 && <Tag label={`コース ${totalCourseMin}分`} color={C.green} />}
            {totalExtCount > 0 && <Tag label={`延長 ${totalExtCount}回/${totalExtMin}分`} color={C.yellow} />}
            {totalOp > 0 && <Tag label={`OP ${fmtYen(totalOp)}`} color={C.accent2} />}
          </div>
        </div>
      )}

      {/* 総支給・控除・手取り */}
      <div style={{ ...card }}>
        <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "14px" }}>給与・控除</p>
        <Field label="総支給（円）">
          <input type="number" min="0" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0" style={inp} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "10px", marginBottom: "14px" }}>
          <Field label="寮費（円）">
            <input type="number" min="0" value={dorm} onChange={(e) => setDorm(e.target.value)} placeholder="0" style={inp} />
          </Field>
          <Field label="雑費（円）">
            <input type="number" min="0" value={misc} onChange={(e) => setMisc(e.target.value)} placeholder="0" style={inp} />
          </Field>
          <Field label="交通費（円）">
            <input type="number" min="0" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0" style={inp} />
          </Field>
        </div>
        <div style={{ background: "linear-gradient(135deg, #fff0f8, #ffe8f5)", border: `2px solid ${C.accent}40`, borderRadius: "14px", padding: "18px", textAlign: "center", marginBottom: "14px" }}>
          <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", marginBottom: "6px" }}>手取り</p>
          <p style={{ fontSize: "32px", fontWeight: "700", color: takeHome >= 0 ? C.accent : C.red, margin: 0 }}>{fmtYen(takeHome)}</p>
          <p style={{ fontSize: "11px", color: C.muted, marginTop: "6px" }}>総支給 {fmtYen(Number(gross)||0)} − 寮費 {fmtYen(Number(dorm)||0)} − 雑費 {fmtYen(Number(misc)||0)} − 交通費 {fmtYen(Number(transport)||0)}</p>
        </div>
        <Btn onClick={saveRecord} loading={false} label={saved ? "保存しました ✓" : "記録を保存"} color={saved ? C.green : C.accent} />
      </div>

      {/* 履歴 */}
      {records.length > 0 && (
        <div style={{ ...card }}>
          <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "12px" }}>過去の記録</p>
          <div style={{ display: "grid", gap: "10px" }}>
            {records.map((r) => (
              <div key={r.id} style={{ background: C.surface, borderRadius: "12px", padding: "12px", border: `1.5px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: C.text }}>{r.date}</span>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: C.accent }}>{fmtYen(r.takeHome)}</span>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {r.startTime && <span style={{ fontSize: "11px", color: C.muted }}>{r.startTime}〜{r.endTime}</span>}
                  <span style={{ fontSize: "11px", color: C.muted }}>合計{r.totalHon}本（本{r.honShimei} P{r.pShimei} F{r.free}）</span>
                  {(r.extCount > 0 || r.extMin > 0) && <span style={{ fontSize: "11px", color: C.muted }}>延長{r.extCount}回/{r.extMin}分</span>}
                  {r.option > 0 && <span style={{ fontSize: "11px", color: C.muted }}>OP {fmtYen(r.option)}</span>}
                  {r.transport > 0 && <span style={{ fontSize: "11px", color: C.muted }}>交通費 {fmtYen(r.transport)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// キャスト1人分の出勤時間インライン編集
// ============================================================
// ============================================================
// 保証計算ヘルパー（CastPage / GuaranteePage から共用）
// ============================================================
function calcDiaryViolations(castName, startDate, endDate, shiftDays, ctx) {
  const { scores, settings, shifts, violations } = ctx;
  const goal          = settings?.daily_post_goal   ?? 5;
  const repeatLimitMs = (settings?.repeat_limit_min ?? 60) * 60000;
  const minLen        = settings?.min_text_length   ?? 100;
  const imgRequired   = settings?.image_required    ?? true;
  const beforeMin     = settings?.before_work_min   ?? 60;
  const afterMin      = settings?.after_work_min    ?? 60;
  const noDuplicate   = settings?.no_duplicate_image ?? true;

  function toMins(t) { const p = t.split(":"); return Number(p[0]) * 60 + (Number(p[1]) || 0); }
  function getJSTMins(iso) { const jstMs = new Date(iso).getTime() + 9 * 3600000; return Math.floor((jstMs / 60000) % 1440); }

  const violationDates = [];
  for (const ymd of shiftDays) {
    // A: 遅刻・早退・当日欠勤がある日は二重カット防止でスキップ
    const hasAttendanceViol = (violations[castName] || []).some(
      (v) => v.date === ymd && (v.type === "late" || v.type === "early" || v.type === "absent")
    );
    if (hasAttendanceViol) continue;

    const dayPosts = scores.filter((s) => {
      if (s.cast_name !== castName) return false;
      try { return new Date(s.posted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === ymd; } catch { return false; }
    });
    if (dayPosts.length === 0) continue; // 0投稿は安全側でスキップ

    let filteredPosts = dayPosts;
    const si = shifts[`${castName}_${ymd}`];
    if (si?.startTime && si?.endTime) {
      const rawS = toMins(si.startTime), rawE = toMins(si.endTime);
      const winS = rawS - beforeMin, winE = rawE + afterMin;
      const overnight = rawE < rawS;
      filteredPosts = dayPosts.filter((s) => {
        try { const pm = getJSTMins(s.posted_at); return overnight ? (pm >= winS || pm <= winE) : (pm >= winS && pm <= winE); }
        catch { return true; }
      });
    }
    const validPosts = filteredPosts.filter((s) => {
      if ((s.diary?.length ?? 0) < minLen) return false;
      if (imgRequired && !s.has_image) return false;
      return true;
    });
    const sorted = [...validPosts].sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
    // B: 同一image_hashは1回だけカウント（noDuplicate=true時）
    let count = 0, last = 0;
    const seenHashes = new Set();
    for (const p of sorted) {
      if (noDuplicate && p.image_hash && seenHashes.has(p.image_hash)) continue;
      try {
        const t = new Date(p.posted_at).getTime();
        if (count === 0 || t - last >= repeatLimitMs) {
          count++;
          last = t;
          if (p.image_hash) seenHashes.add(p.image_hash);
        }
      } catch {}
    }
    if (count < goal) violationDates.push(ymd);
  }
  return { violationDates };
}

function calcGuaranteeResult(castName, ctx) {
  const { casts, guarantee, violations, cutDays, shifts, settings, scores } = ctx;
  const g = guarantee[castName];
  if (!g?.type || !g?.dailyAmount || !g?.startDate || !g?.endDate) return null;
  const daily = Number(g.dailyAmount) || 0;
  const { startDate, endDate } = g;
  if (!startDate || !endDate || daily <= 0) return null;
  const cast = casts.find((c) => c.name === castName);
  const castId = cast?.heaven_id || castName;
  let salaryRecs = [];
  try { salaryRecs = JSON.parse(localStorage.getItem(skey(`shamenikki_salary_${castId}`))) || []; } catch {}
  const periodRecs = salaryRecs.filter((r) => r.date >= startDate && r.date <= endDate);
  const basis = settings?.salaryBasis ?? "gross";
  const earnedGross = periodRecs.reduce((s, r) => s + (basis === "net" ? (Number(r.takeHome) || 0) : (Number(r.gross) || 0)), 0);
  const daysArr = shifts[castName];
  const workdaySet = new Set();
  if (Array.isArray(daysArr)) {
    const year = startDate.slice(0, 4);
    daysArr.forEach(({ date }) => {
      if (!date) return;
      const [m, d] = date.split("/");
      const ymd = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (ymd >= startDate && ymd <= endDate) workdaySet.add(ymd);
    });
  }
  (ctx.extraWorkdays?.[castName] || []).forEach((ymd) => {
    if (ymd >= startDate && ymd <= endDate) workdaySet.add(ymd);
  });
  const shiftDays = [...workdaySet].sort();
  const castViolations = (violations[castName] || []).filter(
    (v) => v.date >= startDate && v.date <= endDate && v.type !== "diary"
  );
  const { violationDates: diaryViolDates } = calcDiaryViolations(castName, startDate, endDate, shiftDays, ctx);
  const diaryViolCount = diaryViolDates.length;
  const diaryViolDays = diaryViolCount * (Number(cutDays?.diary) || 0);
  const workDays = shiftDays.length;
  const guaranteeBase = daily * workDays;
  const manualViolDays = castViolations.reduce((s, v) => s + (Number(cutDays?.[v.type]) || 0), 0);
  const violationDays = manualViolDays + diaryViolDays;
  if (g.type === "total") {
    const cutAmount = violationDays * daily;
    const adjustedGuarantee = Math.max(0, guaranteeBase - cutAmount);
    const supplement = Math.max(0, adjustedGuarantee - earnedGross);
    const balance = earnedGross - adjustedGuarantee;
    return { type: "total", daily, workDays, guaranteeBase, manualViolDays, diaryViolCount, diaryViolDays, diaryViolDates, castViolations, violationDays, cutAmount, adjustedGuarantee, earnedGross, supplement, balance, startDate, endDate };
  } else {
    let totalCutAmount = 0;
    shiftDays.forEach((ymd) => {
      const dayViolDaysManual = (violations[castName] || [])
        .filter((v) => v.date === ymd && v.type !== "diary")
        .reduce((s, v) => s + (Number(cutDays?.[v.type]) || 0), 0);
      totalCutAmount += dayViolDaysManual * daily;
    });
    totalCutAmount += diaryViolDays * daily;
    const cutAmount = totalCutAmount;
    const adjustedGuarantee = Math.max(0, guaranteeBase - cutAmount);
    const supplement = Math.max(0, adjustedGuarantee - earnedGross);
    const balance = earnedGross - adjustedGuarantee;
    return { type: "daily", daily, workDays, guaranteeBase, manualViolDays, diaryViolCount, diaryViolDays, diaryViolDates, castViolations, violationDays, cutAmount, adjustedGuarantee, earnedGross, supplement, balance, startDate, endDate };
  }
}

// ============================================================
// ============================================================
// ミテネ送信ボタン（キャストごと・状態は各ボタンが個別に保持）
// ============================================================
function MiteneButton({ cast }) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const hasPass = !!(cast?.heaven_id && cast?.heaven_pass);

  async function send() {
    setSending(true); setMsg(null); setErr(null);
    try {
      const res = await fetch("/api/heaven-mitene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heavenId: cast.heaven_id, heavenPass: cast.heaven_pass, max: 5 }),
      });
      const data = await res.json();
      if (data.ok) {
        const bt = data.byTab || {};
        setMsg(`${data.sent ?? 0}件送信（マッチ率${bt["マッチ率"] || 0}・口コミ${bt["口コミ"] || 0}・マイガール${bt["マイガール"] || 0}）／残り${data.remainingAfter ?? "?"}回`);
      } else {
        setErr(data.error || "送信に失敗しました");
      }
    } catch (e) {
      setErr("サーバーに接続できませんでした: " + e.message);
    }
    setSending(false);
  }

  const disabled = !hasPass || sending;
  return (
    <>
      <button
        onClick={send}
        disabled={disabled}
        style={{ padding: "7px 13px", borderRadius: "12px", border: `1.5px solid ${C.accent2}55`, background: `${C.accent2}10`, color: disabled ? C.muted : C.accent2, fontWeight: "700", cursor: disabled ? "not-allowed" : "pointer", fontSize: "11px", whiteSpace: "nowrap", opacity: disabled ? 0.65 : 1 }}>
        {sending ? "送信中…" : "💌ミテネ送信"}
      </button>
      {!hasPass && (
        <p style={{ fontSize: "9px", color: C.muted, margin: "-2px 0 0", textAlign: "center" }}>要ID設定</p>
      )}
      {sending && (
        <p style={{ fontSize: "9px", color: C.muted, margin: "-2px 0 0", textAlign: "center", lineHeight: 1.3 }}>1分ほどかかります</p>
      )}
      {msg && (
        <p style={{ fontSize: "9px", color: C.green, fontWeight: "700", margin: "-2px 0 0", maxWidth: "130px", lineHeight: 1.35 }}>{msg}</p>
      )}
      {err && (
        <p style={{ fontSize: "9px", color: C.red, fontWeight: "700", margin: "-2px 0 0", maxWidth: "130px", lineHeight: 1.35 }}>{err}</p>
      )}
    </>
  );
}

// ============================================================
// 明細アップロード（キャストごと）: Supabase Storage "statements" + salary_statements
//  - cast_id は salary_records と同じ規約（heaven_id 優先、無ければ name）
//  - 失敗時は必ず error を確認してアラート（握りつぶさない）
// ============================================================
function StatementUpButton({ cast, done, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  const castId = cast?.heaven_id || cast?.name || "";
  const date = getBusinessToday(); // v1は今日の日付。日付選択を足すときはここ1か所を変える

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = ""; // 同じファイル再選択を可能に
    if (!file) return;
    if (!castId) { alert("このキャストにはIDが無いためアップロードできません（キャスト同期でIDを取得してください）"); return; }
    setUploading(true); setErr(null);
    try {
      const store = getActiveStoreId();
      const safeCast = String(castId).replace(/[^a-zA-Z0-9_-]/g, "_"); // パス安全化（日本語名対策）
      const m = (file.name || "").match(/\.([a-zA-Z0-9]+)$/);
      const ext = (m ? m[1] : (file.type.includes("pdf") ? "pdf" : file.type.includes("png") ? "png" : "jpg")).toLowerCase();
      const path = `${store}/${safeCast}/${date}_${Date.now()}.${ext}`;

      // 1) Storage へアップロード（非公開バケット statements）
      const up = await supabase.storage.from("statements").upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (up.error) { setErr("アップロード失敗"); setUploading(false); alert("明細アップロードに失敗しました: " + up.error.message); return; }

      // 2) salary_statements に upsert（主キー store_id, cast_id, date）
      const { error: dbErr } = await supabase.from("salary_statements").upsert(
        { store_id: store, cast_id: castId, date, image_path: path, uploaded_at: new Date().toISOString() },
        { onConflict: "store_id,cast_id,date" }
      );
      if (dbErr) { setErr("保存失敗"); setUploading(false); alert("明細情報の保存に失敗しました: " + dbErr.message); return; }

      if (onUploaded) onUploaded(castId);
    } catch (e) {
      setErr("エラー");
      alert("明細アップロードでエラー: " + (e && e.message ? e.message : e));
    }
    setUploading(false);
  }

  const color = done ? C.green : C.blue;
  return (
    <>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFile} style={{ display: "none" }} />
      <button
        onClick={() => { if (!uploading && fileRef.current) fileRef.current.click(); }}
        disabled={uploading}
        style={{ padding: "7px 13px", borderRadius: "12px", border: `1.5px solid ${color}60`, background: `${color}10`, color: uploading ? C.muted : color, fontWeight: "700", cursor: uploading ? "not-allowed" : "pointer", fontSize: "11px", whiteSpace: "nowrap", opacity: uploading ? 0.65 : 1 }}>
        {uploading ? "アップ中…" : (done ? "明細UP ✓済" : "明細UP")}
      </button>
      {err && (
        <p style={{ fontSize: "9px", color: C.red, fontWeight: "700", margin: "-2px 0 0", maxWidth: "130px", lineHeight: 1.35 }}>{err}</p>
      )}
    </>
  );
}

// ============================================================
// キャスト管理
// ============================================================
function CastPage({ casts, setCasts, scores, shifts, setShifts, syncConfig, settings }) {
  const [modal, setModal] = useState(null);
  const [modalId, setModalId] = useState("");
  const [modalPass, setModalPass] = useState("");
  const [modalSaved, setModalSaved] = useState(false);
  const [guarantee, setGuarantee] = useLocalStorage("shamenikki_guarantee", {});
  const [violations, setViolations] = useLocalStorage("shamenikki_violations", {});
  const [extraWorkdays, setExtraWorkdays] = useLocalStorage("shamenikki_extra_workdays", {});
  const [gModal, setGModal] = useState(null); // cast name | null
  const [gForm, setGForm] = useState({ type: "total", dailyAmount: "", startDate: "", endDate: "" });
  const [gSaved, setGSaved] = useState(false);
  const [cutDays] = useLocalStorage("shamenikki_cut_days", initCutDays);
  const [lockRefresh, setLockRefresh] = useState(0);
  const [syncLoading, setSyncLoading] = useState(null); // null | "casts" | "shifts"
  const [syncResult, setSyncResult] = useState(null);
  const [showTodayOnly, setShowTodayOnly] = useState(true);
  const [openCalCell, setOpenCalCell] = useState(null); // { castName, date } | null
  const todayKey = getBusinessTodayKey();
  const todayISO = getBusinessToday();

  // 本日の明細アップロード済み cast_id 集合（salary_statements を読んで「済」判定。開き直しても保つ）
  const [statementsDone, setStatementsDone] = useState(() => new Set());
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.from("salary_statements")
          .select("cast_id, image_path")
          .eq("store_id", getActiveStoreId())
          .eq("date", todayISO);
        if (!active || error || !Array.isArray(data)) return;
        setStatementsDone(new Set(data.filter((r) => r.image_path).map((r) => String(r.cast_id))));
      } catch {}
    })();
    return () => { active = false; };
  }, [todayISO]);

  // 明細の承認状況（cast_idごとに「最新dateの1件」）。statementsDone とは別管理（既存判定は壊さない）。
  const [stmtStatus, setStmtStatus] = useState(() => new Map()); // cast_id → { date, approved, approved_at, rejected_at, reject_reason, staff_resolved, staff_resolved_at }
  const [stmtActionError, setStmtActionError] = useState({});    // cast_id → 保存エラーメッセージ
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from("salary_statements")
        .select("cast_id, date, approved, approved_at, rejected_at, reject_reason, staff_resolved, staff_resolved_at")
        .eq("store_id", getActiveStoreId())
        .order("date", { ascending: false });
      if (error) { console.error("承認状況取得失敗:", error); return; }
      if (!active || !Array.isArray(data)) return;
      const m = new Map();
      for (const r of data) {
        const key = String(r.cast_id);
        if (!m.has(key)) m.set(key, r); // date降順なので各castで最初に来た行＝最新
      }
      setStmtStatus(m);
    })();
    return () => { active = false; };
  }, [todayISO]);
  function patchStmtStatus(castId, patch) {
    setStmtStatus((prev) => {
      const m = new Map(prev);
      const cur = m.get(String(castId));
      if (cur) m.set(String(castId), { ...cur, ...patch });
      return m;
    });
  }
  async function setStaffResolved(castId, st, resolved) {
    setStmtActionError((e) => ({ ...e, [castId]: "" }));
    const nowIso = resolved ? new Date().toISOString() : null;
    const { error } = await supabase.from("salary_statements")
      .update({ staff_resolved: resolved, staff_resolved_at: nowIso })
      .eq("store_id", getActiveStoreId()).eq("cast_id", castId).eq("date", st.date);
    if (error) {
      console.error("対応状況の保存失敗:", error);
      setStmtActionError((e) => ({ ...e, [castId]: "保存に失敗しました。もう一度お試しください" }));
      return;
    }
    patchStmtStatus(castId, { staff_resolved: resolved, staff_resolved_at: nowIso });
  }

  const guaranteeCtx = { casts, guarantee, violations, cutDays, shifts, settings, scores, extraWorkdays };

  function resetDiagLock(c) {
    const castId = c.heaven_id || c.name;
    try { localStorage.removeItem(skey(`cast_type_${castId}`)); } catch {}
    try {
      supabase.from("cast_types").delete().eq("store_id", getActiveStoreId()).eq("cast_id", castId)
        .then(({ error }) => {
          if (error) console.error("resetDiagLock delete失敗:", error);
        }).catch((e) => console.error("resetDiagLock 例外:", e));
    } catch (e) { console.error("resetDiagLock 同期例外:", e); }
    setLockRefresh((n) => n + 1);
  }

  function toggle(name) {
    const updated = casts.map((c) => c.name === name ? { ...c, is_active: !c.is_active } : c);
    setCasts(updated);
    const toggled = updated.find((c) => c.name === name);
    if (toggled) {
      try { supabase.from("casts").upsert(toSupabaseCast(toggled), { onConflict: "store_id,name" }).then(({ error }) => { if (error) console.error("[toggle casts upsert]", error.message, error.details, error.hint); }).catch((e) => console.error("[toggle casts upsert] exception:", e?.message || e)); } catch {}
    }
  }
  function openGuaranteeModal(castName) {
    const ex = guarantee[castName] || {};
    // shifts[castName] の "M/D" 配列から開始日・終了日を自動算出（保存済み優先）
    let autoStart = "", autoEnd = "";
    const days = shifts[castName];
    if (Array.isArray(days) && days.length > 0) {
      const year = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 4);
      const toYMD = (md) => { const [m, d] = md.split("/"); return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };
      const sorted = [...days].map((s) => s.date).filter(Boolean).sort((a, b) => toYMD(a) < toYMD(b) ? -1 : 1);
      autoStart = toYMD(sorted[0]);
      autoEnd   = toYMD(sorted[sorted.length - 1]);
    }
    setGForm({
      type:        ex.type        || "total",
      dailyAmount: ex.dailyAmount || "",
      startDate:   ex.startDate   || autoStart,
      endDate:     ex.endDate     || autoEnd,
    });
    setGModal(castName);
    setGSaved(false);
  }
  function saveGuaranteeModal() {
    setGuarantee((prev) => ({ ...prev, [gModal]: { ...gForm } }));
    setGSaved(true);
    setTimeout(() => setGModal(null), 1000);
  }
  function toggleExtraWorkday(castName, date) {
    setExtraWorkdays((prev) => {
      const list = prev[castName] || [];
      const exists = list.includes(date);
      return { ...prev, [castName]: exists ? list.filter((d) => d !== date) : [...list, date] };
    });
  }
  function toggleViolation(castName, type, date) {
    setViolations((prev) => {
      const list = prev[castName] || [];
      const exists = list.some((v) => v.type === type && v.date === date);
      const newList = exists
        ? list.filter((v) => !(v.type === type && v.date === date))
        : [...list, { type, date }];
      return { ...prev, [castName]: newList };
    });
  }
  function openModal(c) { setModal(c); setModalId(c.heaven_id || ""); setModalPass(c.heaven_pass || ""); setModalSaved(false); }
  function saveModal() {
    const updatedCast = { ...modal, heaven_id: modalId, heaven_pass: modalPass };
    setCasts(casts.map((x) => x.name === modal.name ? updatedCast : x));
    setModalSaved(true);
    setTimeout(() => setModal(null), 1000);
    // Supabaseにはheaven_passを送らない（toSupabaseCastが除外する）
    try { supabase.from("casts").upsert(toSupabaseCast({ ...modal, heaven_id: modalId }), { onConflict: "store_id,name" }).then(({ error }) => { if (error) console.error("[saveModal casts upsert]", error.message, error.details, error.hint); }).catch((e) => console.error("[saveModal casts upsert] exception:", e?.message || e)); } catch {}
  }

  // ミテネ用パスワードを非ブロッキングで取得してローカル heaven_pass を埋める。
  // 今日出勤キャストだけを対象＝件数を絞り Vercel タイムアウト内に収める。失敗してもロスターに影響なし。
  // heaven_pass は端末ローカルのみ（Supabase 非保存）＝各端末で同期したときにその端末に入る。
  // バックグラウンドで数十秒かかるため、進捗を syncResult.credStatus で画面に出す。
  async function fillMitenePasswords(castList, shiftData) {
    try {
      // 今日出勤の名前集合は「今回の同期で取れた最新シフト(shiftData)」を最優先。無ければ既存stateで判定。
      const workingNames = new Set();
      if (Array.isArray(shiftData)) {
        shiftData.forEach((s) => {
          if (s && Array.isArray(s.days) && s.days.some((d) => d.date === todayKey)) workingNames.add(normalizeName(s.name));
        });
      }
      const targets = (castList || []).filter((c) => {
        if (!c.heaven_id) return false;
        if (workingNames.size > 0) return workingNames.has(normalizeName(c.name));
        const d = shiftDaysFor(shifts, c.name);
        return Array.isArray(d) && d.some((s) => s.date === todayKey);
      });
      const memberIds = targets.map((c) => c.heaven_id);
      if (memberIds.length === 0) { console.log("[fillMitenePasswords] no today-working targets"); return; }

      setSyncResult((p) => ({ ...(p || {}), credStatus: `今日出勤 ${memberIds.length}人のミテネ用パスワード取得中…（数十秒）` }));
      const res = await fetch("/api/mitene-creds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: syncConfig.adminId, adminPass: syncConfig.adminPass, shopdir: syncConfig.shopdir, memberIds }),
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.creds)) {
        console.error("[fillMitenePasswords] error:", data && data.error);
        setSyncResult((p) => ({ ...(p || {}), credStatus: "⚠️ パスワード取得に失敗しました（ロスターは保存済み）" }));
        return;
      }
      const pwById = new Map(data.creds.filter((c) => c.password).map((c) => [String(c.memberId), c.password]));
      console.log("[fillMitenePasswords] applied=" + pwById.size + "/" + memberIds.length);
      setCasts((prev) => prev.map((c) => {
        const pw = pwById.get(String(c.heaven_id));
        return pw ? { ...c, heaven_pass: pw } : c; // ローカルのみ更新（毎回上書き）
      }));
      setSyncResult((p) => ({ ...(p || {}), credStatus: `✅ 今日出勤 ${pwById.size}人にミテネ用パスワードを設定（この端末のみ）` }));
    } catch (e) {
      console.error("[fillMitenePasswords] exception:", e && e.message);
      setSyncResult((p) => ({ ...(p || {}), credStatus: "⚠️ パスワード取得に失敗しました（ロスターは保存済み）" }));
    }
  }

  async function doSync(mode) {
    if (!syncConfig?.adminId || !syncConfig?.adminPass || !syncConfig?.shopdir) {
      setSyncResult({ error: "設定画面で管理者ID・パスワード・shopdirを保存してください" });
      return;
    }
    setSyncLoading(mode);
    setSyncResult(null);
    try {
      const res = await fetch("/api/store-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: syncConfig.adminId, adminPass: syncConfig.adminPass, shopdir: syncConfig.shopdir, mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.casts) throw new Error(data.message || "同期に失敗しました");

      if (mode === "casts") {
        // 掲載順の先頭 CAST_SYNC_LIMIT 名 ∪ 出勤データに載っているキャスト（100位以降でも取り込む）
        const all = data.casts || [];
        const top = all.slice(0, CAST_SYNC_LIMIT);
        const shiftNames = new Set();
        for (const k in shifts) { if (Array.isArray(shifts[k])) shiftNames.add(normalizeName(k)); }
        const extra = all.slice(CAST_SYNC_LIMIT).filter((c) => shiftNames.has(normalizeName(c.name)));
        const incoming = [...top, ...extra];
        let addedCount = 0, updatedCount = 0;
        const next = [...casts];

        incoming.forEach(({ name: rawName, heavenId, heavenPass }) => {
          const name = normalizeName(rawName); // 最初のスペースより前だけを保存名にする
          const pass = heavenPass || null;     // 取得できた時だけ上書き（失敗時は既存値を維持）
          // heaven_pass は端末ローカルのみ（Supabaseには送らない）。毎回の同期で最新に追従。
          // 1. heavenId一致 → name更新（取得できればパスワードも更新）
          const byId = next.findIndex((c) => c.heaven_id && c.heaven_id === heavenId);
          if (byId !== -1) {
            next[byId] = { ...next[byId], name, ...(pass ? { heaven_pass: pass } : {}) };
            updatedCount++;
            return;
          }
          // 2. name一致（正規化名で照合）→ heaven_id更新＋name正規化（取得できればパスワードも更新）
          const byName = next.findIndex((c) => normalizeName(c.name) === name);
          if (byName !== -1) {
            next[byName] = { ...next[byName], heaven_id: heavenId, name, ...(pass ? { heaven_pass: pass } : {}) };
            updatedCount++;
            return;
          }
          // 3. 新規追加
          next.push({ name, is_active: true, work_start: "", strong: "未分析", weak: "未分析", heaven_id: heavenId, heaven_pass: pass || "" });
          addedCount++;
        });

        // (store_id, name) の重複排除。normalizeName で飾り(新人/🔰)を除去した結果、
        // 同名が複数できると Postgres の ON CONFLICT が
        // "cannot affect row a second time" でバッチ全体を拒否し 0件保存になるため必須。
        // 空名は除外。重複時は heaven_id/heaven_pass を補完して情報を失わない。
        const dedupedNext = [];
        const seenName = new Map(); // normalizedName -> index in dedupedNext
        for (const c of next) {
          const key = normalizeName(c.name);
          if (!key) continue; // 名前空は除外（必須カラム違反も防ぐ）
          if (seenName.has(key)) {
            const ex = dedupedNext[seenName.get(key)];
            if (!ex.heaven_id && c.heaven_id) ex.heaven_id = c.heaven_id;
            if (!ex.heaven_pass && c.heaven_pass) ex.heaven_pass = c.heaven_pass;
            continue;
          }
          seenName.set(key, dedupedNext.length);
          dedupedNext.push({ ...c, name: key });
        }

        setCasts(dedupedNext);
        // Supabase upsert（supabase-js は reject せず {error} を resolve するので必ず error を見る）
        try {
          supabase.from("casts").upsert(dedupedNext.map(toSupabaseCast), { onConflict: "store_id,name" })
            .then(({ error }) => {
              if (error) {
                console.error("[doSync casts upsert] error:", error.message || error, error.details || "", error.hint || "");
                setSyncResult((p) => ({ ...(p || {}), upsertError: (error.message || String(error)) }));
              } else {
                console.log("[doSync casts upsert] saved rows=" + dedupedNext.length);
              }
            })
            .catch((e) => { console.error("[doSync casts upsert] exception:", e?.message || e); setSyncResult((p) => ({ ...(p || {}), upsertError: String(e?.message || e) })); });
        } catch (e) { console.error("[doSync casts upsert] threw:", e?.message || e); }
        setSyncResult({ mode: "casts", addedCount, updatedCount, total: dedupedNext.length });
        setShowTodayOnly(false);
        // ロスター保存が完了した後、パスワードを非ブロッキングで埋める（失敗してもロスターは保存済み）。
        // 今回の同期で取れた最新シフト(data.shifts)を渡して今日出勤を正確に判定。
        fillMitenePasswords(dedupedNext, data.shifts);
      } else {
        if (!Array.isArray(data.shifts)) throw new Error("出勤データが取得できませんでした");
        // 同期データの date は "M/D" 形式 → 給料ページ参照用に "YYYY-MM-DD" キーも書く
        const jstYear = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 4);
        const store = getActiveStoreId();
        const shiftRows = [];           // Supabase 保存用
        const seenRow = new Set();      // (store_id,cast_name,date) 重複排除
        setShifts((prev) => {
          const updated = { ...prev };
          data.shifts.forEach(({ name, days }) => {
            if (!name || !Array.isArray(days)) return;
            updated[name] = days; // 今日出勤フィルタ用 (M/D 配列)
            days.forEach(({ date, start, end }) => {
              if (!date) return;
              const [m, d] = date.split("/");
              const ymd = `${jstYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
              updated[`${name}_${ymd}`] = { startTime: start || "", endTime: end || "" };
              const rk = `${store}::${name}::${ymd}`;
              if (!seenRow.has(rk)) {
                seenRow.add(rk);
                shiftRows.push({ store_id: store, cast_name: name, date: ymd, start_time: start || "", end_time: end || "" });
              }
            });
          });
          return updated;
        });
        // Supabase へ upsert（出勤同期はこれまでローカルだけだった＝クラウド未保存のバグを修正）。
        // supabase-js は reject せず {error} を resolve するので必ず error を見る。
        if (shiftRows.length > 0) {
          try {
            supabase.from("shifts").upsert(shiftRows, { onConflict: "store_id,cast_name,date" })
              .then(({ error }) => {
                if (error) {
                  console.error("[doSync shifts upsert] error:", error.message || error, error.details || "", error.hint || "");
                  setSyncResult((p) => ({ ...(p || {}), upsertError: (error.message || String(error)) }));
                } else {
                  console.log("[doSync shifts upsert] saved rows=" + shiftRows.length);
                }
              })
              .catch((e) => { console.error("[doSync shifts upsert] exception:", e?.message || e); setSyncResult((p) => ({ ...(p || {}), upsertError: String(e?.message || e) })); });
          } catch (e) { console.error("[doSync shifts upsert] threw:", e?.message || e); }
        }
        setSyncResult({ mode: "shifts", total: data.shifts.length });
        setShowTodayOnly(true);
      }
    } catch (e) {
      setSyncResult({ error: e.message });
    } finally {
      setSyncLoading(null);
    }
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

      {gModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(61,26,78,0.55)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "white", border: `1.5px solid ${C.border}`, borderRadius: "24px", padding: "28px", width: "100%", maxWidth: "400px", boxShadow: "0 20px 60px rgba(255,107,157,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <p style={{ fontWeight: "700", fontSize: "18px", color: C.text, margin: "0 0 4px" }}>{gModal}</p>
                <p style={{ color: C.yellow, fontSize: "12px", margin: 0 }}>保証設定</p>
              </div>
              <button onClick={() => setGModal(null)} style={{ background: `${C.accent}15`, border: "none", width: "32px", height: "32px", borderRadius: "50%", fontSize: "18px", cursor: "pointer", color: C.accent, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ display: "grid", gap: "14px" }}>
              <Field label="保証タイプ">
                <div style={{ display: "inline-flex", borderRadius: "10px", overflow: "hidden", border: `1.5px solid ${C.border}` }}>
                  {[["total", "トータル保証"], ["daily", "日保証"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setGForm((f) => ({ ...f, type: val }))} style={{ padding: "9px 16px", border: "none", background: gForm.type === val ? C.yellow : "transparent", color: gForm.type === val ? "white" : C.muted, fontWeight: "700", cursor: "pointer", fontSize: "13px", transition: "all 0.15s" }}>{lbl}</button>
                  ))}
                </div>
              </Field>
              <Field label="日保証額（円/日）">
                <input type="number" value={gForm.dailyAmount} onChange={(e) => setGForm((f) => ({ ...f, dailyAmount: e.target.value }))} placeholder="例：10000" style={inp} inputMode="numeric" />
              </Field>
              <Field label="開始日">
                <input type="date" value={gForm.startDate} onChange={(e) => setGForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
              </Field>
              <Field label="終了日">
                <input type="date" value={gForm.endDate} onChange={(e) => setGForm((f) => ({ ...f, endDate: e.target.value }))} style={inp} />
              </Field>
              {(() => {
                const gr = calcGuaranteeResult(gModal, guaranteeCtx);
                if (!gr) return null;
                const fmt = (n) => n.toLocaleString("ja-JP") + "円";
                return (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px", display: "grid", gap: "6px" }}>
                    <p style={{ fontSize: "12px", fontWeight: "700", color: C.muted, margin: "0 0 4px" }}>計算内訳</p>
                    <div style={{ display: "grid", gap: "5px", fontSize: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted }}>保証枠（{gr.workDays}日 × {fmt(gr.daily)}）</span>
                        <span style={{ fontWeight: "700" }}>{fmt(gr.guaranteeBase)}</span>
                      </div>
                      {gr.cutAmount > 0 && (() => {
                        const tl = { late: "遅刻", early: "早退", absent: "当日欠勤", complaint: "クレーム" };
                        const md = (ymd) => { const [,m,d] = ymd.split("-"); return `${Number(m)}/${Number(d)}`; };
                        const allViols = [
                          ...(gr.castViolations || []).map((v) => ({ date: v.date, label: tl[v.type] || v.type, days: Number(cutDays?.[v.type]) || 0 })),
                          ...(gr.diaryViolDates || []).map((ymd) => ({ date: ymd, label: "写メ日記（投稿不足）", days: Number(cutDays?.diary) || 0 })),
                        ].sort((a, b) => a.date < b.date ? -1 : 1);
                        return (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: C.red }}>違反カット合計（{gr.violationDays}日分）</span>
                              <span style={{ fontWeight: "700", color: C.red }}>−{fmt(gr.cutAmount)}</span>
                            </div>
                            {allViols.map((v, i) => (
                              <div key={i} style={{ paddingLeft: "10px" }}>
                                <span style={{ color: C.red, fontSize: "11px" }}>└ {md(v.date)} {v.label}{v.days !== 1 ? `（${v.days}日分）` : ""}</span>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted }}>調整後保証</span>
                        <span style={{ fontWeight: "700" }}>{fmt(gr.adjustedGuarantee)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted }}>実収入（{(settings?.salaryBasis ?? "gross") === "net" ? "手取り" : "総支給"}合計）</span>
                        <span style={{ fontWeight: "700" }}>{fmt(gr.earnedGross)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "2px" }}>
                        <span style={{ fontWeight: "700", color: gr.supplement > 0 ? C.red : C.green }}>
                          {gr.supplement > 0 ? "補填" : "保証クリア"}
                        </span>
                        <span style={{ fontWeight: "700", color: gr.supplement > 0 ? C.red : C.green }}>
                          {gr.supplement > 0 ? fmt(gr.supplement) : `+${fmt(gr.balance)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {gSaved ? (
                <div style={{ padding: "14px", borderRadius: "14px", background: `${C.green}15`, border: `1.5px solid ${C.green}40`, textAlign: "center" }}>
                  <p style={{ color: C.green, fontWeight: "700", margin: 0 }}>✅ 保存しました！</p>
                </div>
              ) : (
                <Btn onClick={saveGuaranteeModal} loading={false} label="保存する" color={C.yellow} />
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
        <button onClick={() => doSync("casts")} disabled={syncLoading !== null} style={{ padding: "8px 18px", borderRadius: "20px", border: `1.5px solid ${C.blue}`, background: syncLoading !== null ? `${C.blue}08` : `${C.blue}15`, color: C.blue, fontWeight: "700", cursor: syncLoading !== null ? "default" : "pointer", fontSize: "13px", whiteSpace: "nowrap" }}>
          {syncLoading === "casts" ? "同期中..." : "👥 キャスト同期"}
        </button>
        <button onClick={() => doSync("shifts")} disabled={syncLoading !== null} style={{ padding: "8px 18px", borderRadius: "20px", border: `1.5px solid ${C.green}`, background: syncLoading !== null ? `${C.green}08` : `${C.green}15`, color: C.green, fontWeight: "700", cursor: syncLoading !== null ? "default" : "pointer", fontSize: "13px", whiteSpace: "nowrap" }}>
          {syncLoading === "shifts" ? "同期中..." : "🗓 出勤同期"}
        </button>
      </div>
      {syncResult && (
        <div style={{ padding: "10px 14px", borderRadius: "12px", background: syncResult.error ? `${C.red}12` : `${C.green}12`, border: `1.5px solid ${syncResult.error ? C.red : C.green}40`, fontSize: "13px", color: syncResult.error ? C.red : C.green, fontWeight: "600" }}>
          {syncResult.error
            ? `⚠️ ${syncResult.error}`
            : syncResult.mode === "casts"
              ? `✅ キャスト${syncResult.total}人を同期（新規${syncResult.addedCount}人 / 更新${syncResult.updatedCount}人）`
              : `✅ 出勤${syncResult.total}人を同期`}
          {syncResult.upsertError && (
            <span style={{ display: "block", marginTop: "6px", color: C.red, fontWeight: "700" }}>⚠️ クラウド保存エラー: {syncResult.upsertError}</span>
          )}
          {syncResult.credStatus && (
            <span style={{ display: "block", marginTop: "6px", color: C.sub, fontWeight: "700" }}>{syncResult.credStatus}</span>
          )}
        </div>
      )}

      <>
        <div style={{ display: "inline-flex", borderRadius: "12px", overflow: "hidden", border: `1.5px solid ${C.border}`, background: C.surface, justifySelf: "start" }}>
          {[["today", "今日出勤", true], ["all", "全キャスト", false]].map(([key, label, val]) => (
            <button key={key} onClick={() => setShowTodayOnly(val)} style={{ padding: "9px 20px", border: "none", background: showTodayOnly === val ? C.blue : "transparent", color: showTodayOnly === val ? "white" : C.muted, fontWeight: "700", cursor: "pointer", fontSize: "13px", transition: "background 0.15s, color 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "10px", alignItems: "start" }}>
          {casts.filter((c) => { if (!showTodayOnly) return true; const d = shiftDaysFor(shifts, c.name); return Array.isArray(d) && d.some((s) => s.date === todayKey); }).map((c) => {
            let diagData = null;
            try { const s = localStorage.getItem(skey(`cast_type_${c.heaven_id || c.name}`)); if (s) diagData = JSON.parse(s); } catch {}
            const isLocked = (diagData?.retries ?? 0) >= 2;
            const _days = shiftDaysFor(shifts, c.name);
            const todayShift = Array.isArray(_days) ? _days.find((s) => s.date === todayKey) : null;
            // 違反カレンダー表示中（保証の開始/終了日あり）のカードは横長なので2列ぶち抜きにする
            const hasCalendar = !!(guarantee[c.name]?.startDate && guarantee[c.name]?.endDate);
            return (
            <div key={c.name} style={{ ...card, borderColor: c.is_active ? `${C.green}40` : C.border, gridColumn: hasCalendar ? "1 / -1" : undefined }}>
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
                    {guarantee[c.name]?.type && <Tag label={guarantee[c.name].type === "daily" ? "日保証" : "トータル保証"} color={C.yellow} />}
                  </div>
                  {/* ヘブンID（同期で取得・表示のみ。手動設定は廃止） */}
                  <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", margin: "6px 0 0" }}>ID: {c.heaven_id || "未設定"}</p>
                  {(() => {
                    const g = guarantee[c.name];
                    if (!g?.dailyAmount || !g?.endDate) return null;
                    const gr = calcGuaranteeResult(c.name, guaranteeCtx);
                    if (!gr) return null;
                    const biz = getBusinessToday();
                    const [ty, tm, td] = biz.split("-").map(Number);
                    const [ey, em, ed] = g.endDate.split("-").map(Number);
                    const remaining = Math.round((new Date(ey, em - 1, ed) - new Date(ty, tm - 1, td)) / 86400000) + 1;
                    const daysLabel = remaining <= 0 ? "終了" : remaining === 1 ? "本日最終日" : `残り${remaining}日`;
                    const clr = gr.supplement > 0 ? C.red : C.green;
                    const balanceTxt = gr.supplement > 0
                      ? `補填 ${gr.supplement.toLocaleString("ja-JP")}円`
                      : `保証クリア +${gr.balance.toLocaleString("ja-JP")}円`;
                    const daysClr = remaining <= 0 ? C.muted : remaining <= 2 ? C.red : clr;
                    return (
                      <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "12px", background: `${clr}15`, border: `2px solid ${clr}35` }}>
                        <p style={{ fontSize: "14px", fontWeight: "700", color: daysClr, margin: "0 0 4px" }}>{daysLabel}</p>
                        <p style={{ fontSize: "20px", fontWeight: "700", color: clr, margin: 0, lineHeight: 1.2 }}>{balanceTxt}</p>
                      </div>
                    );
                  })()}
                  {todayShift && (
                    <p style={{ fontSize: "11px", color: C.blue, fontWeight: "700", margin: "6px 0 0" }}>本日 {todayShift.start}〜{todayShift.end}</p>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px" }}>
                  <MiteneButton cast={c} />
                  <StatementUpButton
                    cast={c}
                    done={statementsDone.has(String(c.heaven_id || c.name))}
                    onUploaded={(id) => setStatementsDone((prev) => { const n = new Set(prev); n.add(String(id)); return n; })}
                  />
                  <button onClick={() => openGuaranteeModal(c.name)} style={{ padding: "7px 13px", borderRadius: "12px", border: `1.5px solid ${C.yellow}60`, background: `${C.yellow}10`, color: C.yellow, fontWeight: "700", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }}>
                    保証設定
                  </button>
                  <button onClick={() => toggle(c.name)} style={{ padding: "7px 13px", borderRadius: "12px", border: `1.5px solid ${c.is_active ? C.red : C.green}45`, background: `${c.is_active ? C.red : C.green}10`, color: c.is_active ? C.red : C.green, fontWeight: "700", cursor: "pointer", fontSize: "11px" }}>
                    {c.is_active ? "停止" : "再開"}
                  </button>
                  {diagData?.type && (
                    <button onClick={() => resetDiagLock(c)} style={{ padding: "7px 13px", borderRadius: "12px", border: `1.5px solid ${C.yellow}60`, background: `${C.yellow}10`, color: C.yellow, fontWeight: "700", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }}>
                      {isLocked ? "診断解除" : "診断リセット"}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                {guarantee[c.name]?.startDate && guarantee[c.name]?.endDate ? (() => {
                  const { startDate, endDate } = guarantee[c.name];
                  const DOW = ["日", "月", "火", "水", "木", "金", "土"];
                  const VL = { late: "遅", early: "早", absent: "欠", complaint: "ク" };
                  const dates = [];
                  const [sy, sm, sd] = startDate.split("-").map(Number);
                  const [ey, em, ed] = endDate.split("-").map(Number);
                  const cur = new Date(sy, sm - 1, sd);
                  const end = new Date(ey, em - 1, ed);
                  const pad = (n) => String(n).padStart(2, "0");
                  while (cur <= end) {
                    dates.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
                    cur.setDate(cur.getDate() + 1);
                  }
                  const selDate = openCalCell?.castName === c.name ? openCalCell.date : null;
                  const extraList = extraWorkdays[c.name] || [];
                  return (
                    <>
                      <p style={{ fontSize: "11px", fontWeight: "700", color: C.muted, margin: "0 0 8px" }}>違反カレンダー</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {dates.map((ymd) => {
                          const [yy, mm, dd] = ymd.split("-").map(Number);
                          const dow = DOW[new Date(yy, mm - 1, dd).getDay()];
                          const isToday = ymd === todayISO;
                          const isSel = ymd === selDate;
                          const dayViols = (violations[c.name] || []).filter((v) => v.date === ymd);
                          const si = shifts[`${c.name}_${ymd}`];
                          const isSyncWork = !!si?.startTime;
                          const isManualWork = extraList.includes(ymd);
                          const isWorkday = isSyncWork || isManualWork;
                          const shiftStr = si?.startTime && si?.endTime ? `${si.startTime.slice(0, 5)}-${si.endTime.slice(0, 5)}` : null;
                          const cellBg = isSel ? `${C.accent}15` : isWorkday ? `${C.accent}10` : "white";
                          const borderClr = isToday ? C.blue : isSel ? C.accent : isWorkday ? `${C.accent}60` : C.border;
                          const borderW = (isToday || isSel) ? "2px" : "1.5px";
                          return (
                            <div key={ymd}
                              onClick={() => setOpenCalCell((prev) => prev?.castName === c.name && prev?.date === ymd ? null : { castName: c.name, date: ymd })}
                              style={{ width: "50px", minHeight: "60px", border: `${borderW} solid ${borderClr}`, borderRadius: "10px", padding: "4px 2px", textAlign: "center", cursor: "pointer", background: cellBg, userSelect: "none", opacity: isWorkday ? 1 : 0.55, boxShadow: isSel ? `0 2px 8px ${C.accent}25` : "none" }}>
                              <p style={{ fontSize: "11px", fontWeight: "700", margin: "0 0 1px", color: isToday ? C.blue : isWorkday ? C.text : C.muted }}>{mm}/{dd}</p>
                              <p style={{ fontSize: "10px", margin: "0 0 2px", color: dow === "日" ? C.red : dow === "土" ? C.blue : C.muted }}>{dow}</p>
                              {shiftStr && <p style={{ fontSize: "8px", color: C.muted, margin: "0 0 1px", lineHeight: 1.3 }}>{shiftStr}</p>}
                              {isManualWork && !isSyncWork && <p style={{ fontSize: "8px", color: C.accent, margin: "0 0 1px", fontWeight: "700" }}>出勤</p>}
                              {!isWorkday && <p style={{ fontSize: "11px", color: C.muted, margin: "0 0 1px" }}>＋</p>}
                              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1px" }}>
                                {dayViols.map((v, i) => (
                                  <span key={i} style={{ fontSize: "9px", fontWeight: "700", color: "white", background: C.red, borderRadius: "2px", padding: "0 2px", lineHeight: "14px" }}>{VL[v.type] || "?"}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ fontSize: "10px", color: C.muted, margin: "6px 0 0", lineHeight: 1.6 }}>
                        色つき＝出勤日 / 青枠＝今日 ／ 遅＝遅刻・早＝早退・欠＝当日欠勤・ク＝クレーム
                      </p>
                      {selDate && (() => {
                        const [sy2, sm2, sd2] = selDate.split("-").map(Number);
                        const selSI = shifts[`${c.name}_${selDate}`];
                        const selIsSyncWork = !!selSI?.startTime;
                        const selIsManualWork = extraList.includes(selDate);
                        const selIsWorkday = selIsSyncWork || selIsManualWork;
                        const selShiftStr = selSI?.startTime && selSI?.endTime ? `${selSI.startTime.slice(0, 5)}〜${selSI.endTime.slice(0, 5)}` : null;
                        return (
                          <div style={{ marginTop: "8px", padding: "12px 14px", borderRadius: "12px", background: `${C.accent}06`, border: `1.5px solid ${C.accent}30` }}>
                            <p style={{ fontSize: "12px", fontWeight: "700", color: C.accent, margin: "0 0 4px" }}>
                              {sm2}/{sd2}{selIsSyncWork ? "（出勤・同期済み）" : selIsManualWork ? "（出勤・手動）" : ""}
                            </p>
                            {selShiftStr && <p style={{ fontSize: "11px", color: C.muted, margin: "0 0 8px" }}>{selShiftStr}</p>}
                            {!selIsSyncWork && (
                              <div style={{ marginBottom: "8px" }}>
                                <button onClick={() => toggleExtraWorkday(c.name, selDate)}
                                  style={{ padding: "6px 14px", borderRadius: "20px", border: `1.5px solid ${selIsManualWork ? C.accent : C.border}`, background: selIsManualWork ? `${C.accent}18` : "white", color: selIsManualWork ? C.accent : C.muted, fontWeight: "700", fontSize: "12px", cursor: "pointer" }}>
                                  {selIsManualWork ? "✓ この日は出勤（保証に追加中）" : "この日は出勤（保証に追加）"}
                                </button>
                              </div>
                            )}
                            {selIsWorkday && (
                              <>
                                <p style={{ fontSize: "11px", color: C.muted, margin: "0 0 6px" }}>違反</p>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  {[["late", "遅刻"], ["early", "早退"], ["absent", "当日欠勤"], ["complaint", "クレーム"]].map(([type, label]) => {
                                    const on = (violations[c.name] || []).some((v) => v.type === type && v.date === selDate);
                                    return (
                                      <button key={type} onClick={() => toggleViolation(c.name, type, selDate)}
                                        style={{ padding: "6px 14px", borderRadius: "20px", border: `1.5px solid ${on ? C.red : C.border}`, background: on ? `${C.red}15` : "white", color: on ? C.red : C.muted, fontWeight: "700", fontSize: "12px", cursor: "pointer" }}>
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })() : (
                  <p style={{ fontSize: "11px", color: C.muted, margin: 0 }}>「保証設定」を押すと違反カレンダーが表示されます</p>
                )}
              </div>
              {/* 明細承認状況（スライスC）: cast_id で最新明細の状態を表示。明細が無ければ非表示 */}
              {(() => {
                const stCastId = c.heaven_id || c.name;
                const st = stmtStatus.get(String(stCastId));
                if (!st) return null;
                const apprDate = st.approved_at ? String(st.approved_at).slice(0, 10) : "";
                const resvDate = st.staff_resolved_at ? String(st.staff_resolved_at).slice(0, 10) : "";
                const isApproved = st.approved === true;
                const isRejected = !isApproved && !!st.rejected_at;
                const stErr = stmtActionError[stCastId];
                return (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: "11px", fontWeight: "700", color: C.muted, margin: "0 0 8px" }}>明細承認状況</p>
                    {isApproved ? (
                      <p style={{ fontSize: "12px", fontWeight: "700", color: C.green, margin: 0 }}>承認済み{apprDate ? `（${apprDate}）` : ""}</p>
                    ) : isRejected ? (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <p style={{ fontSize: "12px", fontWeight: "700", color: C.red, margin: 0 }}>非承認</p>
                        {st.reject_reason && (
                          <p style={{ fontSize: "12px", color: C.red, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>理由：{st.reject_reason}</p>
                        )}
                        {st.staff_resolved === true ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: C.green }}>対応済み{resvDate ? `（${resvDate}）` : ""}</span>
                            <button onClick={() => setStaffResolved(stCastId, st, false)}
                              style={{ padding: "6px 12px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: "700", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                              保留中に戻す
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: C.muted }}>保留中</span>
                            <button onClick={() => setStaffResolved(stCastId, st, true)}
                              style={{ padding: "6px 12px", borderRadius: "12px", border: `1.5px solid ${C.green}60`, background: `${C.green}15`, color: C.green, fontWeight: "700", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                              対応済み
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", fontWeight: "700", color: C.muted, margin: 0 }}>キャスト確認待ち</p>
                    )}
                    {stErr && (
                      <p style={{ fontSize: "11px", color: C.red, fontWeight: "700", margin: "8px 0 0" }}>{stErr}</p>
                    )}
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      </>
    </div>
  );
}

// ============================================================
// 保証管理（管理者）
// ============================================================
function GuaranteePage({ casts, scores, settings, shifts, cutDays }) {
  const [guarantee] = useLocalStorage("shamenikki_guarantee", {});
  const [violations] = useLocalStorage("shamenikki_violations", {});
  const [extraWorkdays] = useLocalStorage("shamenikki_extra_workdays", {});
  const [detailCast, setDetailCast] = useState(null);

  const today = getBusinessToday();
  const todayKey = getBusinessTodayKey();
  const fmt = (n) => n.toLocaleString("ja-JP") + "円";
  const toMD = (ymd) => { const [, m, d] = ymd.split("-"); return `${Number(m)}/${Number(d)}`; };

  // 保証計算コンテキスト
  const ctx = { casts, guarantee, violations, cutDays, shifts, settings, scores, extraWorkdays };

  // 保証設定があるキャストの計算結果
  const guaranteeRows = casts
    .map((c) => ({ name: c.name, gr: calcGuaranteeResult(c.name, ctx) }))
    .filter((r) => r.gr !== null)
    .sort((a, b) => b.gr.supplement - a.gr.supplement);

  const totalTarget      = guaranteeRows.length;
  const totalSupplement  = guaranteeRows.reduce((s, r) => s + r.gr.supplement, 0);
  const supplementCount  = guaranteeRows.filter((r) => r.gr.supplement > 0).length;
  const clearCount       = totalTarget - supplementCount;
  const totalGuaranteeBase = guaranteeRows.reduce((s, r) => s + r.gr.guaranteeBase, 0);
  const totalEarned      = guaranteeRows.reduce((s, r) => s + r.gr.earnedGross, 0);

  // 今日の投稿達成判定（既存の保証条件チェック）
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
  const diaryRows = casts.filter((c) => { if (!c.is_active) return false; const d = shiftDaysFor(shifts, c.name); return Array.isArray(d) && d.some((s) => s.date === todayKey); }).map((c) => {
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
  const doneCount = diaryRows.filter((r) => r.ok).length;

  // 詳細モーダル用データ
  const detailGr = detailCast ? calcGuaranteeResult(detailCast, ctx) : null;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="保証管理" sub="保証プラマイと今日の達成状況" color={C.yellow} />

      {/* 保証ダッシュボード */}
      {totalTarget > 0 && (
        <>
          <div style={{ ...card, borderColor: `${C.yellow}40`, background: `${C.yellow}06` }}>
            <p style={{ fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "8px", letterSpacing: "0.06em" }}>店全体サマリー</p>
            <p style={{ fontSize: "11px", color: C.muted, margin: "0 0 2px" }}>店の補填合計</p>
            <p style={{ fontSize: "28px", fontWeight: "700", color: totalSupplement > 0 ? C.red : C.green, margin: "0 0 12px", lineHeight: 1.2 }}>
              {totalSupplement > 0 ? fmt(totalSupplement) : "補填なし"}
            </p>
            <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
              {[["対象", totalTarget, C.text], ["補填", supplementCount, C.red], ["クリア", clearCount, C.green]].map(([label, val, clr2]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "22px", fontWeight: "700", color: clr2, margin: 0 }}>{val}</p>
                  <p style={{ fontSize: "10px", color: C.muted, margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "11px" }}>
              <div><span style={{ color: C.muted }}>保証枠合計　</span><span style={{ fontWeight: "700" }}>{fmt(totalGuaranteeBase)}</span></div>
              <div><span style={{ color: C.muted }}>実収入合計　</span><span style={{ fontWeight: "700" }}>{fmt(totalEarned)}</span></div>
            </div>
          </div>

          {/* キャスト一覧（補填多い順） */}
          <div style={{ display: "grid", gap: "8px" }}>
            {guaranteeRows.map(({ name, gr }) => {
              const [ty2, tm2, td2] = today.split("-").map(Number);
              const [ey2, em2, ed2] = gr.endDate.split("-").map(Number);
              const remaining = Math.round((new Date(ey2, em2 - 1, ed2) - new Date(ty2, tm2 - 1, td2)) / 86400000) + 1;
              const daysLabel = remaining <= 0 ? "終了" : remaining === 1 ? "本日最終日" : `残り${remaining}日`;
              const daysClr = remaining <= 0 ? C.muted : remaining <= 2 ? C.red : C.text;
              const isSuppl = gr.supplement > 0;
              const clr = isSuppl ? C.red : C.green;
              const violCount = (gr.castViolations?.length || 0) + (gr.diaryViolDates?.length || 0);
              return (
                <div key={name} onClick={() => setDetailCast(detailCast === name ? null : name)}
                  style={{ ...card, borderColor: `${clr}50`, background: isSuppl ? `${C.red}09` : `${C.green}09`, cursor: "pointer", userSelect: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <p style={{ fontWeight: "700", fontSize: "15px", margin: 0 }}>{name}</p>
                        <span style={{ fontSize: "10px", color: daysClr, fontWeight: "700", background: `${daysClr}18`, padding: "2px 8px", borderRadius: "20px" }}>{daysLabel}</span>
                        {violCount > 0 && <span style={{ fontSize: "10px", color: C.red, fontWeight: "700", background: `${C.red}15`, padding: "2px 8px", borderRadius: "20px" }}>違反{violCount}件</span>}
                      </div>
                      <p style={{ fontSize: "11px", color: C.muted, margin: "0 0 6px" }}>{toMD(gr.startDate)}〜{toMD(gr.endDate)}</p>
                      <p style={{ fontSize: "22px", fontWeight: "700", color: clr, margin: "0 0 4px", lineHeight: 1.2 }}>
                        {isSuppl ? `補填 ${fmt(gr.supplement)}` : `クリア +${fmt(gr.balance)}`}
                      </p>
                      <p style={{ fontSize: "11px", color: C.muted, margin: 0 }}>
                        実収入 {fmt(gr.earnedGross)} ／ 調整後保証 {fmt(gr.adjustedGuarantee)}
                      </p>
                    </div>
                    <span style={{ fontSize: "16px", color: C.muted, marginLeft: "8px", marginTop: "4px" }}>{detailCast === name ? "▲" : "▼"}</span>
                  </div>

                  {/* インライン内訳（タップで展開） */}
                  {detailCast === name && detailGr && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}`, display: "grid", gap: "5px", fontSize: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted }}>保証枠（{gr.workDays}日 × {fmt(gr.daily)}）</span>
                        <span style={{ fontWeight: "700" }}>{fmt(gr.guaranteeBase)}</span>
                      </div>
                      {gr.cutAmount > 0 && (() => {
                        const tl = { late: "遅刻", early: "早退", absent: "当日欠勤", complaint: "クレーム" };
                        const allViols = [
                          ...(gr.castViolations || []).map((v) => ({ date: v.date, label: tl[v.type] || v.type, days: Number(cutDays?.[v.type]) || 0 })),
                          ...(gr.diaryViolDates || []).map((ymd) => ({ date: ymd, label: "写メ日記（投稿不足）", days: Number(cutDays?.diary) || 0 })),
                        ].sort((a, b) => a.date < b.date ? -1 : 1);
                        return (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: C.red }}>違反カット合計（{gr.violationDays}日分）</span>
                              <span style={{ fontWeight: "700", color: C.red }}>−{fmt(gr.cutAmount)}</span>
                            </div>
                            {allViols.map((v, i) => (
                              <div key={i} style={{ paddingLeft: "10px" }}>
                                <span style={{ color: C.red, fontSize: "11px" }}>└ {toMD(v.date)} {v.label}{v.days !== 1 ? `（${v.days}日分）` : ""}</span>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted }}>調整後保証</span>
                        <span style={{ fontWeight: "700" }}>{fmt(gr.adjustedGuarantee)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted }}>実収入</span>
                        <span style={{ fontWeight: "700" }}>{fmt(gr.earnedGross)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, paddingTop: "6px" }}>
                        <span style={{ fontWeight: "700", color: clr }}>{isSuppl ? "補填" : "保証クリア"}</span>
                        <span style={{ fontWeight: "700", color: clr }}>{isSuppl ? fmt(gr.supplement) : `+${fmt(gr.balance)}`}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: "8px" }} />
        </>
      )}

      {/* 今日の保証条件チェック（既存） */}
      <Header title="本日の達成状況" sub="写メ日記ルール" color={C.yellow} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ ...card, textAlign: "center", borderColor: `${C.green}40`, background: `${C.green}08` }}>
          <p style={{ color: C.muted, fontSize: "11px", marginBottom: "8px", fontWeight: "700", letterSpacing: "0.05em" }}>達成</p>
          <p style={{ fontSize: "40px", fontWeight: "700", color: C.green, margin: "0 0 4px" }}>{doneCount}</p>
          <p style={{ color: C.muted, fontSize: "11px", margin: 0 }}>名</p>
        </div>
        <div style={{ ...card, textAlign: "center", borderColor: `${C.red}40`, background: `${C.red}08` }}>
          <p style={{ color: C.muted, fontSize: "11px", marginBottom: "8px", fontWeight: "700", letterSpacing: "0.05em" }}>未達</p>
          <p style={{ fontSize: "40px", fontWeight: "700", color: C.red, margin: "0 0 4px" }}>{diaryRows.length - doneCount}</p>
          <p style={{ color: C.muted, fontSize: "11px", margin: 0 }}>名</p>
        </div>
      </div>
      <div style={{ ...card, padding: "12px 16px", background: `${C.accent}06` }}>
        <p style={{ fontSize: "12px", color: C.muted, margin: 0 }}>
          目標{settings.daily_post_goal}件 / 連投除外{settings.repeat_limit_min}分 / 最低{settings.min_text_length}文字 {settings.image_required ? "/ 画像必須" : ""}
        </p>
      </div>
      <div style={{ display: "grid", gap: "10px" }}>
        {diaryRows.map((r) => (
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
// コース時間設定
// ============================================================
function CoursesPage({ courses, setCourses }) {
  const [newMin, setNewMin] = useState("");
  const [editId, setEditId] = useState(null);
  const [editMin, setEditMin] = useState("");

  async function addCourse() {
    const m = Number(newMin);
    if (!m || m <= 0) return;
    if (courses.find((c) => c.minutes === m)) return;
    const newCourse = { id: Date.now(), minutes: m };
    setCourses([...courses, newCourse].sort((a, b) => a.minutes - b.minutes));
    setNewMin("");
    try {
      const { error } = await supabase.from("courses").upsert({ id: newCourse.id, minutes: newCourse.minutes, store_id: getActiveStoreId() }, { onConflict: "store_id,id" });
      if (error) {
        console.error("[addCourse courses upsert]", error.message, error.details, error.hint);
        alert("保存に失敗しました: " + error.message);
        return;
      }
    } catch {}
  }

  function deleteCourse(id) {
    setCourses(courses.filter((c) => c.id !== id));
    try { supabase.from("courses").delete().eq("store_id", getActiveStoreId()).eq("id", id).then(({ error }) => { if (error) console.error("[deleteCourse courses delete]", error.message, error.details, error.hint); }).catch((e) => console.error("[deleteCourse courses delete] exception:", e?.message || e)); } catch {}
  }

  function startEdit(c) { setEditId(c.id); setEditMin(String(c.minutes)); }

  async function saveEdit(id) {
    const m = Number(editMin);
    if (!m || m <= 0) return;
    setCourses(courses.map((c) => c.id === id ? { ...c, minutes: m } : c).sort((a, b) => a.minutes - b.minutes));
    setEditId(null);
    setEditMin("");
    try {
      const { error } = await supabase.from("courses").upsert({ id, minutes: m, store_id: getActiveStoreId() }, { onConflict: "store_id,id" });
      if (error) {
        console.error("[saveEdit courses upsert]", error.message, error.details, error.hint);
        alert("保存に失敗しました: " + error.message);
        return;
      }
    } catch {}
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="コース時間設定" sub="コース時間を追加・編集・削除できます" color={C.blue} />

      <div style={{ ...card }}>
        <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "14px" }}>新しいコースを追加</p>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="number" min="1" value={newMin}
            onChange={(e) => setNewMin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCourse()}
            placeholder="例：60"
            style={{ ...inp, flex: 1 }}
          />
          <span style={{ color: C.muted, fontSize: "13px", whiteSpace: "nowrap" }}>分</span>
          <button
            onClick={addCourse}
            style={{ padding: "12px 20px", borderRadius: "12px", border: "none", background: `linear-gradient(135deg, ${C.blue}, ${C.blue}cc)`, color: "white", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap", fontSize: "13px", boxShadow: `0 4px 16px ${C.blue}44` }}
          >追加</button>
        </div>
      </div>

      <div style={{ ...card }}>
        <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", marginBottom: "14px" }}>登録済みコース</p>
        {courses.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px", textAlign: "center", padding: "20px 0" }}>コースが登録されていません</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {courses.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: C.surface, borderRadius: "12px", border: `1.5px solid ${C.border}` }}>
                {editId === c.id ? (
                  <>
                    <input
                      type="number" min="1" value={editMin}
                      onChange={(e) => setEditMin(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(c.id)}
                      style={{ ...inp, flex: 1 }}
                      autoFocus
                    />
                    <span style={{ color: C.muted, fontSize: "13px", whiteSpace: "nowrap" }}>分</span>
                    <button onClick={() => saveEdit(c.id)} style={{ padding: "8px 14px", borderRadius: "10px", border: "none", background: C.green, color: "white", fontWeight: "700", cursor: "pointer", fontSize: "12px" }}>保存</button>
                    <button onClick={() => { setEditId(null); setEditMin(""); }} style={{ padding: "8px 14px", borderRadius: "10px", border: `1.5px solid ${C.border}`, background: "white", color: C.muted, fontWeight: "700", cursor: "pointer", fontSize: "12px" }}>取消</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: "700", fontSize: "16px", color: C.text }}>{c.minutes}<span style={{ fontSize: "12px", color: C.muted, marginLeft: "3px" }}>分</span></span>
                    <button onClick={() => startEdit(c)} style={{ padding: "7px 14px", borderRadius: "10px", border: `1.5px solid ${C.border}`, background: "white", color: C.sub, fontWeight: "700", cursor: "pointer", fontSize: "12px" }}>編集</button>
                    <button onClick={() => deleteCourse(c.id)} style={{ padding: "7px 14px", borderRadius: "10px", border: "none", background: `${C.red}15`, color: C.red, fontWeight: "700", cursor: "pointer", fontSize: "12px" }}>削除</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 設定
// ============================================================
function SettingsPage({ settings, setSettings, syncConfig, setSyncConfig, cutDays, setCutDays }) {
  const [local, setLocal] = useState({ ...settings, show_guarantee: settings.show_guarantee ?? true });
  const [localSync, setLocalSync] = useState({ shopdir: syncConfig?.shopdir || "", adminId: syncConfig?.adminId || "", adminPass: syncConfig?.adminPass || "" });
  const [localCut, setLocalCut] = useState({ diary: cutDays?.diary ?? 1, late: cutDays?.late ?? 1, early: cutDays?.early ?? 1, absent: cutDays?.absent ?? 2, complaint: cutDays?.complaint ?? 1 });
  async function save() {
    setSettings(local); // localStorageに書き込み（useLocalStorage経由）
    setSyncConfig(localSync);
    setCutDays(localCut);
    try {
      const { error } = await supabase.from("settings").upsert({
        store_id:         getActiveStoreId(),
        id: 1,
        daily_post_goal:  local.daily_post_goal,
        repeat_limit_min: local.repeat_limit_min,
        min_text_length:  local.min_text_length,
        image_required:   local.image_required,
        before_work_min:  local.before_work_min,
        after_work_min:   local.after_work_min,
        show_guarantee:   local.show_guarantee ?? true,
        updated_at:       new Date().toISOString(),
      }, { onConflict: "store_id,id" });
      if (error) {
        console.error("[settings save upsert]", error.message, error.details, error.hint);
        alert("保存に失敗しました: " + error.message);
        return;
      }
      alert("保存しました！");
    } catch {}
  }

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

        <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "10px", fontWeight: "700" }}>保証の計算基準</p>
          <div style={{ display: "inline-flex", borderRadius: "10px", overflow: "hidden", border: `1.5px solid ${C.border}` }}>
            {[["gross", "総支給"], ["net", "手取り"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setLocal((l) => ({ ...l, salaryBasis: val }))} style={{ padding: "9px 20px", border: "none", background: (local.salaryBasis ?? "gross") === val ? C.yellow : "transparent", color: (local.salaryBasis ?? "gross") === val ? "white" : C.muted, fontWeight: "700", cursor: "pointer", fontSize: "13px", transition: "all 0.15s" }}>{lbl}</button>
            ))}
          </div>
          <p style={{ fontSize: "11px", color: C.muted, marginTop: "6px" }}>保証プラマイ計算で「実収入」として使う金額の基準</p>
        </div>

        <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", fontWeight: "700" }}>写メ日記ルール</p>
          <Toggle checked={local.no_duplicate_image ?? true} onChange={(v) => setLocal((l) => ({ ...l, no_duplicate_image: v }))} label="期間内の同一画像の添付を禁止する" />
          <p style={{ fontSize: "11px", color: C.muted, marginTop: "6px", marginLeft: "54px" }}>ONにすると、同じ画像を保証期間内に2回以上使った場合に違反とみなします</p>
        </div>

        <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", fontWeight: "700" }}>保証カット設定（違反1件あたりの日数）</p>
          <div style={{ display: "grid", gap: "10px" }}>
            {[
              { key: "diary",     label: "写メ日記ルール違反" },
              { key: "late",      label: "遅刻" },
              { key: "early",     label: "早退" },
              { key: "absent",    label: "当日欠勤" },
              { key: "complaint", label: "クレーム" },
            ].map(({ key, label }) => (
              <Field key={key} label={label}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input type="number" min="0" value={localCut[key]} onChange={(e) => setLocalCut((prev) => ({ ...prev, [key]: Number(e.target.value) }))} style={{ ...inp, flex: 1 }} />
                  <span style={{ color: C.muted, fontSize: "13px", whiteSpace: "nowrap" }}>日カット</span>
                </div>
              </Field>
            ))}
          </div>
        </div>

        <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: C.muted, marginBottom: "6px", fontWeight: "700" }}>店舗同期設定</p>
          <p style={{ fontSize: "11px", color: C.muted, marginBottom: "12px", lineHeight: 1.6 }}>
            キャスト管理の「同期」ボタンで使用します。保存後はボタン1つで即同期します。
          </p>
          <div style={{ display: "grid", gap: "12px" }}>
            <Field label="管理者ID">
              <input value={localSync.adminId} onChange={(e) => setLocalSync({ ...localSync, adminId: e.target.value })} placeholder="管理者IDを入力" style={inp} />
            </Field>
            <Field label="管理者パスワード">
              <input type="password" value={localSync.adminPass} onChange={(e) => setLocalSync({ ...localSync, adminPass: e.target.value })} placeholder="パスワードを入力" style={inp} />
            </Field>
            <Field label="店舗ディレクトリ (shopdir)">
              <input value={localSync.shopdir} onChange={(e) => setLocalSync({ ...localSync, shopdir: e.target.value })} placeholder="例：tokyo-xxx" style={inp} />
            </Field>
          </div>
        </div>

        <Btn onClick={save} loading={false} label="保存する" color={C.accent} />
      </div>
    </div>
  );
}

// ============================================================
// 出勤時間設定（管理者）
// ============================================================
function ShiftsPage({ casts, shifts, setShifts }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const [date, setDate] = useState(today);
  const [localShifts, setLocalShifts] = useState({});
  const [saved, setSaved] = useState(false);

  const activeCasts = casts.filter((c) => c.is_active);

  useEffect(() => {
    const init = {};
    activeCasts.forEach((c) => {
      const key = `${c.name}_${date}`;
      init[c.name] = {
        startTime: shifts[key]?.startTime || "",
        endTime: shifts[key]?.endTime || "",
      };
    });
    setLocalShifts(init);
    setSaved(false);
  }, [date, shifts]);

  function updateCastShift(castName, field, value) {
    setSaved(false);
    setLocalShifts((prev) => ({ ...prev, [castName]: { ...prev[castName], [field]: value } }));
  }

  async function saveAll() {
    const next = { ...shifts };
    const toUpsert = [];
    const toDelete = [];

    activeCasts.forEach((c) => {
      const key = `${c.name}_${date}`;
      const s = localShifts[c.name] || {};
      if (s.startTime || s.endTime) {
        next[key] = { startTime: s.startTime || "", endTime: s.endTime || "" };
        toUpsert.push({ store_id: getActiveStoreId(), cast_name: c.name, date, start_time: s.startTime || "", end_time: s.endTime || "" });
      } else {
        delete next[key];
        toDelete.push(c.name);
      }
    });

    setShifts(next); // localStorageに書き込み（useLocalStorage経由）

    // Supabase sync
    if (toUpsert.length > 0) {
      try {
        const { error } = await supabase.from("shifts").upsert(toUpsert, { onConflict: "store_id,cast_name,date" });
        if (error) {
          console.error("[saveAll shifts upsert]", error.message, error.details, error.hint);
          alert("保存に失敗しました: " + error.message);
          return;
        }
      } catch {}
    }
    for (const castName of toDelete) {
      try {
        const { error } = await supabase.from("shifts").delete().eq("store_id", getActiveStoreId()).eq("cast_name", castName).eq("date", date);
        if (error) {
          console.error("[saveAll shifts delete]", error.message, error.details, error.hint);
          alert("削除に失敗しました: " + error.message);
          return;
        }
      } catch {}
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <Header title="出勤時間設定" sub="キャストごとの出勤時間をスタッフが設定します" color={C.blue} />

      <div style={{ ...card, display: "grid", gap: "10px" }}>
        <p style={{ fontSize: "11px", color: C.muted, fontWeight: "700", letterSpacing: "0.08em", margin: 0 }}>日付を選択</p>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
      </div>

      {activeCasts.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "40px", color: C.muted }}>在籍中のキャストがいません</div>
      )}

      {activeCasts.map((c) => {
        const s = localShifts[c.name] || {};
        const isSet = !!(s.startTime || s.endTime);
        return (
          <div key={c.name} style={{ ...card, borderColor: isSet ? `${C.blue}50` : C.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <p style={{ fontWeight: "700", fontSize: "15px", color: C.text, margin: 0, flex: 1 }}>{c.name}</p>
              {isSet && <span style={{ fontSize: "10px", color: C.blue, fontWeight: "700", background: `${C.blue}15`, padding: "2px 8px", borderRadius: "10px" }}>設定済み</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="time"
                value={s.startTime || ""}
                onChange={(e) => updateCastShift(c.name, "startTime", e.target.value)}
                style={{ ...inp, flex: 1 }}
              />
              <span style={{ color: C.muted, fontSize: "13px" }}>〜</span>
              <input
                type="time"
                value={s.endTime || ""}
                onChange={(e) => updateCastShift(c.name, "endTime", e.target.value)}
                style={{ ...inp, flex: 1 }}
              />
            </div>
          </div>
        );
      })}

      {activeCasts.length > 0 && (
        saved ? (
          <div style={{ padding: "14px", borderRadius: "14px", background: `${C.green}15`, border: `1.5px solid ${C.green}40`, textAlign: "center" }}>
            <p style={{ color: C.green, fontWeight: "700", margin: 0 }}>✅ 保存しました！キャスト画面に反映されます</p>
          </div>
        ) : (
          <Btn onClick={saveAll} loading={false} label="保存する" color={C.blue} />
        )
      )}
    </div>
  );
}

// ============================================================
// 共通コンポーネント
// ============================================================
// ============================================================
// 一括ミテネ（今日出勤キャストへ1人ずつ逐次送信）
// ============================================================
function BulkMitenePage({ casts, shifts, syncConfig }) {
  const todayKey = getBusinessTodayKey();
  // 今日出勤キャスト（正規化名で出勤データと照合：🔰等の装飾差を吸収）
  const todayCasts = casts.filter((c) => {
    const d = shiftDaysFor(shifts, c.name);
    return Array.isArray(d) && d.some((s) => s.date === todayKey);
  });
  const storeLabel = syncConfig?.shopdir || "店舗（未設定）";

  const [perMax, setPerMax] = useState(5);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState([]);        // { name, sendable, status, msg }
  const [progress, setProgress] = useState(null); // { current, total, name }
  const [summary, setSummary] = useState(null);

  const updateRow = (name, patch) =>
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...patch } : r)));

  async function start() {
    setRunning(true);
    setSummary(null);

    // 全行を初期化（送信不可は最初からスキップ表示）
    const init = todayCasts.map((c) => {
      const sendable = !!(c.heaven_id && c.heaven_pass);
      return { name: c.name, sendable, status: sendable ? "pending" : "skip", msg: sendable ? "" : "スキップ（要ID設定）" };
    });
    setRows(init);

    // 「送信可」だけを上から順に1人ずつ直列で呼ぶ
    const sendable = todayCasts.filter((c) => c.heaven_id && c.heaven_pass);
    let totalSent = 0;
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < sendable.length; i++) {
      const c = sendable[i];
      setProgress({ current: i + 1, total: sendable.length, name: c.name });
      updateRow(c.name, { status: "sending", msg: "送信中…" });
      try {
        const res = await fetch("/api/heaven-mitene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ heavenId: c.heaven_id, heavenPass: c.heaven_pass, max: perMax }),
        });
        const data = await res.json();
        if (data.ok) {
          const bt = data.byTab || {};
          const sent = data.sent ?? 0;
          totalSent += sent;
          successCount++;
          updateRow(c.name, { status: "done", msg: `${sent}件（マッチ率${bt["マッチ率"] || 0}・口コミ${bt["口コミ"] || 0}・マイガール${bt["マイガール"] || 0}）／残り${data.remainingAfter ?? "?"}回` });
        } else {
          const em = data.error || "送信に失敗しました";
          errors.push(`${c.name}：${em}`);
          updateRow(c.name, { status: "error", msg: em });
        }
      } catch (e) {
        const em = "サーバーに接続できませんでした: " + e.message;
        errors.push(`${c.name}：${em}`);
        updateRow(c.name, { status: "error", msg: em });
      }
    }

    const skipCount = todayCasts.length - sendable.length;
    setProgress(null);
    setSummary({ totalSent, successCount, targetCount: sendable.length, skipCount, errors });
    setRunning(false);
  }

  const badge = (txt, color) => (
    <span style={{ fontSize: "10px", fontWeight: "700", color, background: `${color}15`, padding: "2px 8px", borderRadius: "10px", whiteSpace: "nowrap" }}>{txt}</span>
  );
  const statusColor = { pending: C.muted, skip: C.muted, sending: C.blue, done: C.green, error: C.red };

  // 実行前は todayCasts から行を生成、実行開始後は rows（ライブ状態）を表示
  const displayRows = rows.length
    ? rows
    : todayCasts.map((c) => {
        const sendable = !!(c.heaven_id && c.heaven_pass);
        return { name: c.name, sendable, status: sendable ? "pending" : "skip", msg: sendable ? "" : "要ID設定（スキップ）" };
      });

  const startDisabled = running || todayCasts.length === 0;

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <Header title="一括ミテネ" sub="今日出勤キャストへ1人ずつ自動送信" color={C.accent2} />

      <div style={{ ...card, background: `${C.yellow}10`, borderColor: `${C.yellow}45` }}>
        <p style={{ fontSize: "12px", color: C.sub, fontWeight: "700", margin: 0, lineHeight: 1.5 }}>
          ⚠️ 完了まで数分かかります。終わるまで画面を閉じたり再読み込みしないでください。
        </p>
      </div>

      <div style={card}>
        <label style={{ fontSize: "11px", color: C.muted, fontWeight: "700", display: "block", marginBottom: "6px" }}>店</label>
        <select value={storeLabel} disabled style={{ ...inp, marginBottom: "14px" }}>
          <option>{storeLabel}</option>
        </select>

        <label style={{ fontSize: "11px", color: C.muted, fontWeight: "700", display: "block", marginBottom: "6px" }}>1人あたりの送信数</label>
        <input
          type="number"
          min={1}
          value={perMax}
          disabled={running}
          onChange={(e) => setPerMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
          style={{ ...inp, marginBottom: "14px" }}
        />

        <button
          onClick={start}
          disabled={startDisabled}
          style={{ width: "100%", padding: "13px", borderRadius: "14px", border: "none", background: startDisabled ? C.muted : C.accent2, color: "white", fontWeight: "700", fontSize: "14px", cursor: startDisabled ? "not-allowed" : "pointer", opacity: startDisabled ? 0.7 : 1 }}>
          {running ? "送信中…" : "💌 一括送信スタート"}
        </button>

        {progress && (
          <p style={{ fontSize: "13px", color: C.blue, fontWeight: "700", textAlign: "center", margin: "12px 0 0" }}>
            {progress.current}/{progress.total}人目 [{progress.name}] 送信中…
          </p>
        )}
      </div>

      {todayCasts.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "30px", color: C.muted }}>今日出勤のキャストがいません</div>
      ) : (
        <div style={{ ...card, display: "grid", gap: "8px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.muted, margin: "0 0 4px" }}>今日出勤 {todayCasts.length}人（{storeLabel}）</p>
          {displayRows.map((r) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "10px", border: `1px solid ${C.border}`, background: C.surface }}>
              <span style={{ fontWeight: "700", fontSize: "13px", color: C.text, minWidth: "64px" }}>{r.name}</span>
              {r.sendable ? badge("送信可", C.green) : badge("要ID設定（スキップ）", C.muted)}
              {r.msg && <span style={{ fontSize: "11px", color: statusColor[r.status] || C.muted, lineHeight: 1.35, flex: 1 }}>{r.msg}</span>}
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div style={{ ...card, borderColor: `${C.accent2}45`, background: `${C.accent2}08` }}>
          <p style={{ fontSize: "13px", fontWeight: "700", color: C.text, margin: "0 0 6px" }}>完了</p>
          <p style={{ fontSize: "13px", color: C.sub, margin: 0, lineHeight: 1.6 }}>
            合計{summary.totalSent}件送信／対象{summary.targetCount}人中{summary.successCount}人成功／スキップ{summary.skipCount}人
          </p>
          {summary.errors.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <p style={{ fontSize: "11px", fontWeight: "700", color: C.red, margin: "0 0 4px" }}>エラー</p>
              {summary.errors.map((e, i) => (
                <p key={i} style={{ fontSize: "11px", color: C.red, margin: "0 0 2px", lineHeight: 1.4 }}>・{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
