-- ============================================================
-- SHAMENIKKI AI — Supabase テーブル作成SQL
-- Supabase SQL Editor に貼って実行してください
-- ============================================================

-- 1. キャスト
CREATE TABLE casts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  is_active     boolean NOT NULL DEFAULT true,
  work_start    text NOT NULL DEFAULT '',
  strong        text NOT NULL DEFAULT '未分析',
  weak          text NOT NULL DEFAULT '未分析',
  heaven_id     text NOT NULL DEFAULT '',
  heaven_pass   text NOT NULL DEFAULT '',
  type          text,
  disclose      text,
  shindan_note  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. AI採点記録
CREATE TABLE scores (
  id          bigint PRIMARY KEY,
  cast_name   text NOT NULL,
  diary       text NOT NULL DEFAULT '',
  result      text NOT NULL DEFAULT '',
  posted_at   timestamptz NOT NULL,
  has_image   boolean NOT NULL DEFAULT false,
  score       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. 店舗設定（常に1行）
CREATE TABLE settings (
  id                integer PRIMARY KEY DEFAULT 1,
  daily_post_goal   integer NOT NULL DEFAULT 5,
  repeat_limit_min  integer NOT NULL DEFAULT 60,
  min_text_length   integer NOT NULL DEFAULT 100,
  image_required    boolean NOT NULL DEFAULT true,
  before_work_min   integer NOT NULL DEFAULT 60,
  after_work_min    integer NOT NULL DEFAULT 60,
  show_guarantee    boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_single_row CHECK (id = 1)
);
INSERT INTO settings DEFAULT VALUES;

-- 4. コース時間設定
CREATE TABLE courses (
  id          bigint PRIMARY KEY,
  minutes     integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 5. 出勤時間（キャスト × 日付）
CREATE TABLE shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_name   text NOT NULL,
  date        date NOT NULL,
  start_time  text NOT NULL DEFAULT '',
  end_time    text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cast_name, date)
);

-- 6. 診断タイプ（キャストごと）
CREATE TABLE cast_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id     text NOT NULL UNIQUE,
  type        text NOT NULL DEFAULT '',
  retries     integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 7. AIサポートトグル（キャストごと）
CREATE TABLE support_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id        text NOT NULL UNIQUE,
  image_support  boolean NOT NULL DEFAULT true,
  text_support   boolean NOT NULL DEFAULT true,
  title_assist   boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 8. お給料記録（1出勤分）
CREATE TABLE salary_records (
  id          bigint PRIMARY KEY,
  cast_id     text NOT NULL,
  date        date NOT NULL,
  start_time  text NOT NULL DEFAULT '',
  end_time    text NOT NULL DEFAULT '',
  hon_shimei  integer NOT NULL DEFAULT 0,
  p_shimei    integer NOT NULL DEFAULT 0,
  free        integer NOT NULL DEFAULT 0,
  total_hon   integer NOT NULL DEFAULT 0,
  course_min  integer NOT NULL DEFAULT 0,
  ext_count   integer NOT NULL DEFAULT 0,
  ext_min     integer NOT NULL DEFAULT 0,
  option_amt  integer NOT NULL DEFAULT 0,
  gross       integer NOT NULL DEFAULT 0,
  dorm        integer NOT NULL DEFAULT 0,
  misc        integer NOT NULL DEFAULT 0,
  transport   integer NOT NULL DEFAULT 0,
  take_home   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 9. 明細（1本ごとの詳細）
CREATE TABLE salary_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_record_id  bigint NOT NULL REFERENCES salary_records(id) ON DELETE CASCADE,
  seq               integer NOT NULL,
  course_min        integer NOT NULL DEFAULT 0,
  shimei            text NOT NULL DEFAULT '',
  fee               integer NOT NULL DEFAULT 0,
  shimei_ryou       integer NOT NULL DEFAULT 0,
  op                integer NOT NULL DEFAULT 0,
  ext_count         integer NOT NULL DEFAULT 0,
  ext_min           integer NOT NULL DEFAULT 0
);
