// ============================================================
// /opt/heaven-bot/.env の簡易ローダー（依存追加なし・fsで自前実装）
//  - 既に process.env にある同名キーは上書きしない（インライン指定が優先）
//  - ファイルが無い/読めない場合は何もせず続行（従来の起動方法と互換）
//  - #始まりのコメント行・空行はスキップ。値の前後の引用符('/")は除去
// ============================================================
try {
  require('fs').readFileSync('/opt/heaven-bot/.env', 'utf8').split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq <= 0) return; // KEY= の形でない行（=無し/先頭=）はスキップ
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  });
} catch (_) {} // .env が無い・読めない場合は何もしない

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const BOT_SHARED_SECRET=process.env.BOT_SHARED_SECRET;
app.use((req,res,next)=>{if(!BOT_SHARED_SECRET)return res.status(500).json({ok:false});const z=req.headers.authorization||'';if(z!=='Bearer '+BOT_SHARED_SECRET)return res.status(401).json({ok:false,error:'unauthorized'});next();});

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WAIT = { waitUntil: 'domcontentloaded', timeout: 60000 };

// ============================================================
// 店舗単位の同時実行ロック（二重送信・アカウント競合の防止）
//  - 同じ店舗(=同じヘブン垢/管理shopdir)への送信処理が同時に2つ走らないようにする。
//  - 別店舗は別アカウントなのでキーが違えばブロックしない（並走OK）。
//  - 対象: /post, /store-sync, /mitene, /mitene-creds（読み取り専用の /mitene-status, /health は対象外）。
//  - キー: ヘブン垢操作は 'heaven:'+heavenId、店舗管理操作は 'shop:'+shopdir（識別子の名前空間を分けて誤衝突を防ぐ）。
// ============================================================
const storeLocks = new Map(); // lockKey(string) → true（処理中）

async function findBtn(page, matchFn) {
  const hs = await page.$$('a, button, input[type=button], input[type=submit]');
  for (const h of hs) {
    const t = await page.evaluate(el => (el.textContent || el.value || '').trim(), h);
    if (matchFn(t)) return h;
  }
  return null;
}
async function waitUrlChange(page, before, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (page.url() !== before) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
// 同一セレクタが複数ある場合に「画面に表示されている要素」だけを返す
async function findVisible(page, selector) {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const visible = await page.evaluate(el => el.offsetParent !== null, h);
    if (visible) return h;
  }
  return null;
}

app.post('/post', async (req, res) => {
  const { heavenId, heavenPass, title, body, imageBase64, imageType, limitedKind } = req.body || {};
  const lockKey = heavenId ? 'heaven:' + heavenId : null; // 店舗キー=ヘブン垢
  if (lockKey) {
    if (storeLocks.has(lockKey)) return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかの処理を実行中です。少し待ってからもう一度お試しください。' });
    storeLocks.set(lockKey, true);
  }
  let browser, tmp, posted = false;
  const log = (m) => console.log('[heaven-bot] ' + m);
  try {
    if (imageBase64) {
      const ext = (imageType && imageType.includes('png')) ? 'png' : 'jpg';
      tmp = path.join(os.tmpdir(), 'hv_' + Date.now() + '.' + ext);
      fs.writeFileSync(tmp, Buffer.from(String(imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);
    page.on('dialog', async d => {
      const msg = d.message();
      log('DIALOG:' + encodeURIComponent(msg).slice(0, 200));
      if (msg.includes('投稿')) posted = true;
      try { await d.accept(); } catch (_) {}
    });

    log('login...');
    await page.goto('https://spgirl.cityheaven.net/J1Login.php', WAIT);
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation(WAIT)]);

    log('open diary...');
    await page.goto('https://spgirl.cityheaven.net/J4KeitaiDiaryPost.php?gid=' + heavenId, WAIT);
    await new Promise(r => setTimeout(r, 3000));
    await page.select('#limited_diary_kind', (limitedKind === '02' ? '02' : '00')).catch(() => {});
    log('limitedKind=' + limitedKind);

    if (tmp) {
      await page.waitForSelector('#picSelect', { timeout: 30000 });
      await (await page.$('#picSelect')).uploadFile(tmp);
      await page.$eval('#picSelect', el => { el.dispatchEvent(new Event('change', { bubbles: true })); }).catch(() => {});
      await new Promise(r => setTimeout(r, 10000));
      const pf = await page.$eval('#picSelect', el => (el.files ? el.files.length : -1)).catch(() => 'na');
      log('picFiles=' + pf);
      log('image set');
    }

    await page.waitForSelector('#diaryTitle', { timeout: 30000 });
    await page.click('#diaryTitle');
    await page.type('#diaryTitle', title || '');

    await page.waitForFunction(() => window.CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.diary && CKEDITOR.instances.diary.status === 'ready', { timeout: 30000 });
    await page.evaluate((raw) => {
      const esc = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      CKEDITOR.instances.diary.setData(esc.replace(/\n/g, '<br>'));
      if (CKEDITOR.instances.diary.updateElement) CKEDITOR.instances.diary.updateElement();
    }, body || '');
    log('title/body set');

    await new Promise(r => setTimeout(r, 2000));
    let moved = false;
    for (let i = 0; i < 5 && !moved; i++) {
      if (i > 0) { log('preview retry ' + i); await new Promise(r => setTimeout(r, 5000)); }
      const before = page.url();
      const pv = await page.$('#previewsbmt') || await findBtn(page, t => t.includes('プレビュー')) || await findBtn(page, t => t.includes('一時保存'));
      if (!pv) throw new Error('preview button not found');
      await pv.click().catch(e => log('preview click err:' + e.message));
      moved = await waitUrlChange(page, before, 5000);
    }
    log('preview moved=' + moved);
    if (!moved) throw new Error('preview did not load');

    await new Promise(r => setTimeout(r, 2000));
    const ps = await page.$('#postsbmt') || await findBtn(page, t => t === '投稿') || await findBtn(page, t => /投稿/.test(t) && t.length <= 4);
    if (!ps) throw new Error('post button not found');
    await ps.click().catch(e => log('post click err:' + e.message));
    await new Promise(r => setTimeout(r, 8000));
    log('done posted=' + posted);

    await browser.close();
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    res.json({ success: posted, message: posted ? 'posted' : 'finished_no_confirm' });
  } catch (e) {
    log('ERROR: ' + e.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    if (tmp && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (_) {} }
    res.json({ success: false, message: e.message });
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
});

// ============================================================
// 店舗管理からキャスト一覧を吸い上げる
// ============================================================
// 店舗管理画面のスクレイプ本体（/store-sync ルートと朝の自動同期で共用）。
// ロック(storeLocks)は呼び出し側が管理する。戻り値は従来 /store-sync が返していた JSON と同形。
async function runStoreSyncScrape(adminId, adminPass, shopdir) {
  let browser;
  try {
    if (!adminId || !adminPass || !shopdir) {
      return { ok: false, error: 'adminId, adminPass, shopdir are required' };
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);

    // ログインページへ移動
    await page.goto(`https://newmanager.cityheaven.net/C1Login.php?shopdir=${encodeURIComponent(shopdir)}`, WAIT);

    // 表示されている #id に adminId を入力（#id が複数存在する前提）
    const idInput = await findVisible(page, '#id');
    if (!idInput) throw new Error('id input not found');
    await idInput.click();
    await idInput.type(adminId);

    // 表示されている #pass に adminPass を入力（パスワードはログに出さない）
    const passInput = await findVisible(page, '#pass');
    if (!passInput) throw new Error('pass input not found');
    await passInput.click();
    await passInput.type(adminPass);

    // 表示されている button[name="login"] をクリック
    const loginBtn = await findVisible(page, 'button[name="login"]');
    if (!loginBtn) throw new Error('login button not found');
    await Promise.all([
      loginBtn.click(),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    ]);

    // キャスト一覧ページへ移動
    await page.goto(`https://newmanager.cityheaven.net/C8GirlMyPageRegist.php?shopdir=${encodeURIComponent(shopdir)}`, WAIT);

    // a[href*="member_id="] を全取得 → heavenId ごとに名前が取れる方を採用して重複排除
    const casts = await page.$$eval(
      'a[href*="C8GirlMyPageRegist.php?member_id="]',
      (anchors) => {
        const cleanName = (raw) => {
          return (raw || '').replace(/\u65B0\u4EBA|\u4F53\u9A13\u5272|\u4F53\u9A13/g,' ')
            .replace(/新人/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[…\.]{1,3}$/, '')
            .trim();
        };
        // heavenId → 最良の name を保持する Map
        const map = new Map();
        for (const a of anchors) {
          const m = (a.getAttribute('href') || '').match(/member_id=([^&]+)/);
          if (!m) continue;
          const heavenId = m[1];
          // name: textContent → img の alt/title にフォールバック
          let raw = (a.textContent || '').trim();
          if (!raw) {
            const img = a.querySelector('img');
            raw = (img && (img.getAttribute('alt') || img.getAttribute('title'))) || '';
          }
          const name = cleanName(raw);
          // まだ登録がない、または既存が空名前なら上書き
          if (!map.has(heavenId) || (!map.get(heavenId).name && name)) {
            map.set(heavenId, { name, heavenId });
          }
        }
        return Array.from(map.values());
      }
    );

    console.log('[store-sync] casts=' + casts.length);
    // ※ ミテネ用パスワード取得は重い(最大数分)ためここでは行わない。
    //   ロスター(名前/heaven_id)を素早く返して Supabase 保存を最優先にする。
    //   パスワードは別エンドポイント /mitene-creds で非ブロッキングに取得する。

    // シフト一覧を全ページ取得（C9）&start=1,2,… で送りされる
    const MAX_C9_PAGES = 20;
    const allShifts = [];
    const seenShiftNames = new Set();

    for (let pageNum = 1; pageNum <= MAX_C9_PAGES; pageNum++) {
      await page.goto(
        `https://newmanager.cityheaven.net/C9ShukkinShiftList.php?shopdir=${encodeURIComponent(shopdir)}&start=${pageNum}`,
        WAIT
      );
      await new Promise(r => setTimeout(r, 1000));

      const pageShifts = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr'));

        let dateCols = [];
        let headerRowIdx = -1;

        for (let ri = 0; ri < rows.length; ri++) {
          const cells = Array.from(rows[ri].querySelectorAll('th, td'));
          const found = [];
          for (let ci = 0; ci < cells.length; ci++) {
            const text = cells[ci].textContent.trim();
            if (/^\d{1,2}\/\d{1,2}/.test(text)) {
              const dateM = text.match(/^(\d{1,2}\/\d{1,2})/);
              const wdM   = text.match(/\((\S)\)/);
              found.push({ colIdx: ci, date: dateM[1], weekday: wdM ? wdM[1] : '' });
            }
          }
          if (found.length >= 3) {
            dateCols = found;
            headerRowIdx = ri;
            break;
          }
        }

        if (dateCols.length === 0) return [];

        const result = [];
        for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
          if (!rows[ri].textContent.includes('カンタン週間設定')) continue;

          const cells = Array.from(rows[ri].querySelectorAll('th, td'));

          const rawName = cells[0] ? cells[0].textContent : '';
          const name = rawName
            .replace(/新人/g, '')
            .replace(/カンタン週間設定/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!name) continue;

          const days = [];
          for (const { colIdx, date, weekday } of dateCols) {
            if (colIdx >= cells.length) continue;
            const text = cells[colIdx].textContent.trim();

            if (!text || /^[－\-ー]+$/.test(text)) continue;

            const tm = text.match(/(\d{1,2}:\d{2})\s*[〜～~]\s*(\d{1,2}:\d{2})/);
            if (tm) days.push({ date, weekday, start: tm[1], end: tm[2] });
          }

          if (days.length > 0) result.push({ name, days });
        }

        return result;
      });

      const newEntries = pageShifts.filter(s => !seenShiftNames.has(s.name));
      console.log(`[store-sync] C9 page=${pageNum} rows=${pageShifts.length} new=${newEntries.length}`);

      if (pageShifts.length === 0 || newEntries.length === 0) break;

      for (const s of newEntries) {
        seenShiftNames.add(s.name);
        allShifts.push(s);
      }
    }

    console.log('[store-sync] shifts=' + allShifts.length);
    return { ok: true, casts, shifts: allShifts };
  } catch (e) {
    console.log('[store-sync] ERROR: ' + e.message);
    return { ok: false, error: e.message };
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }
}

app.post('/store-sync', async (req, res) => {
  const { adminId, adminPass, shopdir, mode } = req.body || {};
  const lockKey = shopdir ? 'shop:' + shopdir : null; // 店舗キー=管理shopdir
  if (lockKey) {
    if (storeLocks.has(lockKey)) return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかの処理を実行中です。少し待ってからもう一度お試しください。' });
    storeLocks.set(lockKey, true);
  }
  try {
    res.json(await runStoreSyncScrape(adminId, adminPass, shopdir));
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
});

// ============================================================
// 【本番】ミテネ自動送信（registComeon を a.kitene_send_btn__text_wrapper のクリックで発火）
//  - 人間らしいランダム待機を挟む / max は絶対に超えない / 二重送信しない
// ============================================================
// タブの優先順位（テキストで指定）。上から順に巡回して送る。
const TAB_PRIORITY = ['マッチ率', '口コミ', 'マイガール'];

// ミテネ送信の本体（/mitene ルートと自動送信スケジューラで共用）。
// ロック(storeLocks)は呼び出し側が管理する。戻り値は従来 /mitene が返していた result と同形。
async function runMiteneSend(heavenId, heavenPass, max) {
  const mlog = (m) => console.log('[mitene] ' + m);
  const result = { ok: false, sent: 0, sentUids: [], remainingBefore: null, remainingAfter: null, byTab: {}, error: null, reachedStep: 0, sendableTotal: 0 };
  let browser;

  // 1500〜3500ms のランダム待機
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const randWait = () => sleep(1500 + Math.floor(Math.random() * 2000));

  // 本文の「残り回数：N/20」から N を取得
  const readRemaining = async (page) => page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const m = node.textContent.trim().match(/残り回数[：:]\s*(\d+)\s*[\/／]\d+/);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  });

  // onclick="registComeon(uid)" を持つ未送信ボタンの uid 一覧（出現順）
  const listSendableUids = async (page) => page.evaluate(() => {
    return Array.from(document.querySelectorAll('a.kitene_send_btn__text_wrapper'))
      .map(a => {
        const m = (a.getAttribute('onclick') || '').match(/registComeon\(\s*'?(\d+)'?\s*\)/);
        return m ? m[1] : null;
      })
      .filter(Boolean);
  });

  // 試行済み uid（タブをまたいで二重送信しないよう全体で共有）
  const processed = new Set();

  // -----------------------------------------------------------
  // 今表示中のリストページで target 件まで送信し、送れた数を返す
  //  - 残り回数の減少で成功判定
  //  - attempts 上限で必ず停止（target を絶対に超えない）
  //  - 各送信の前後にランダム待機 / 二重送信防止
  // -----------------------------------------------------------
  const sendOnCurrentPage = async (page, target) => {
    let sent = 0;
    let attempts = 0; // クリック試行回数。これで上限を厳格に管理する（target を絶対に超えない）
    if (!(target > 0)) return 0;

    while (attempts < target) {
      // まだ送れる（未処理の）ボタンの uid を1つ取得
      const uids = await listSendableUids(page);
      const uid = uids.find(u => !processed.has(u));
      if (!uid) { mlog('  no more sendable buttons on this page'); break; }
      processed.add(uid);

      // クリック直前の残り回数
      const remBefore = await readRemaining(page);

      // 対象 uid のボタンを scrollIntoView してから el.click()（= registComeon 発火）
      const clicked = await page.evaluate((uid) => {
        const el = Array.from(document.querySelectorAll('a.kitene_send_btn__text_wrapper'))
          .find(a => {
            const m = (a.getAttribute('onclick') || '').match(/registComeon\(\s*'?(\d+)'?\s*\)/);
            return m && m[1] === uid;
          });
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return true;
      }, uid);
      attempts++; // 1クリック試行＝1消費
      if (!clicked) { mlog('  click target gone uid=' + uid); continue; }

      // クリック後ランダム待機 → 残り回数を読み直す（軽くリロードして最新化）
      await randWait();
      await page.reload(WAIT).catch(() => {});
      await sleep(1500);
      const remAfter = await readRemaining(page);

      // 成功検知：残り回数 N が減っていれば送信成功
      if (remBefore != null && remAfter != null && remAfter < remBefore) {
        sent++;
        result.sentUids.push(uid);
        mlog('  sent uid=' + uid + ' remaining ' + remBefore + '->' + remAfter);
      } else if (clicked && remBefore === 1 && remAfter == null) {
        // 残り1だった→送信クリック後に「残り回数：N/20」表示が消えた＝0になったとみなして成功カウント
        sent++;
        result.sentUids.push(uid);
        mlog('  sent (reached 0) uid=' + uid + ' remaining 1->0');
      } else {
        mlog('  send not confirmed uid=' + uid + ' remaining ' + remBefore + '->' + remAfter);
      }

      // 次の送信まで必ずランダム待機（連続高速送信しない）
      await randWait();
    }
    return sent;
  };

  // ページ上の送信ボタン数を数える
  const countSendable = async (page) => page.evaluate(() =>
    document.querySelectorAll('a.kitene_send_btn__text_wrapper').length
  );

  try {
    if (!heavenId || !heavenPass) {
      result.error = 'heavenId and heavenPass are required';
      return result;
    }
    // max を 0 以上の整数に正規化（未指定は null）
    let maxN = null;
    if (max !== undefined && max !== null && max !== '') {
      maxN = parseInt(max, 10);
      if (!Number.isFinite(maxN) || maxN < 0) maxN = 0;
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);
    // registComeon の確認ダイアログが出る場合に備えて自動承認
    page.on('dialog', async d => { try { await d.accept(); } catch (_) {} });

    // Step 1: ログイン
    mlog('login...');
    await page.goto('https://spgirl.cityheaven.net/J1Login.php', WAIT);
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation(WAIT)]);
    result.reachedStep = 1;

    // Step 2: ミテネのリストページ（ミテネできる会員を探す）へ → remainingBefore
    const miteneUrl = 'https://spgirl.cityheaven.net/J10ComeonVisitorList.php?gid=' + heavenId;
    await page.goto(miteneUrl, WAIT);
    await sleep(2000);
    result.remainingBefore = await readRemaining(page);
    result.reachedStep = 2;
    mlog('remainingBefore=' + result.remainingBefore + ' maxN=' + maxN);

    // target = min(max があれば max, remainingBefore)
    const cap = (result.remainingBefore != null) ? result.remainingBefore : Infinity;
    const target = (maxN != null) ? Math.min(maxN, cap) : cap;
    mlog('target=' + (target === Infinity ? 'all' : target));

    // 各タブの遷移先 URL（li/span クリックは効かないため直接 goto する）
    const TAB_URLS = {
      'マッチ率':   'https://spgirl.cityheaven.net/J10ComeonAiMatchingList.php?gid=' + heavenId,
      '口コミ':     'https://spgirl.cityheaven.net/J10ReviewRanking.php?gid=' + heavenId,
      'マイガール': 'https://spgirl.cityheaven.net/J10ComeonMyGirlList.php?gid=' + heavenId,
    };

    // Step 3: タブ優先カスケード（各タブ URL へ直接 goto して送信）
    result.reachedStep = 3;
    const byTab = {};
    TAB_PRIORITY.forEach(t => { byTab[t] = 0; });
    result.byTab = byTab;

    for (const tab of TAB_PRIORITY) {
      if (result.sent >= target) { mlog('target reached → stop cascade'); break; }
      const url = TAB_URLS[tab];
      mlog('--- tab: ' + tab + ' → goto ' + url + ' ---');

      await page.goto(url, WAIT).catch(e => mlog('  goto err: ' + e.message));
      // 送信ボタンの出現を待つ（無ければタイムアウト → スキップ）
      await page.waitForSelector('a.kitene_send_btn__text_wrapper', { timeout: 4000 }).catch(() => {});
      await sleep(1500);

      const sc = await countSendable(page);
      mlog('  url=' + page.url() + ' sendableCount=' + sc);
      result.sendableTotal += sc;
      if (sc === 0) { mlog('  no send buttons → skip ' + tab); continue; }

      const n = await sendOnCurrentPage(page, target - result.sent); // 残り枠ぶんだけ
      byTab[tab] += n;
      result.sent += n;
      mlog('tab ' + tab + ' sentThisTab=' + n + ' (total sent=' + result.sent + ')');
    }

    // Step 4: remainingAfter（カスケード内でリロード済みだが念のため再取得）
    await page.goto(miteneUrl, WAIT).catch(() => {});
    await sleep(1500);
    result.remainingAfter = await readRemaining(page);
    result.reachedStep = 4;
    mlog('done sent=' + result.sent + ' remainingAfter=' + result.remainingAfter + ' byTab=' + JSON.stringify(result.byTab));

    await browser.close();
    result.ok = true;
    return result;
  } catch (e) {
    mlog('ERROR at step=' + result.reachedStep + ': ' + e.message);
    result.error = e.message;
    if (browser) { try { await browser.close(); } catch (_) {} }
    return result;
  }
}

app.post('/mitene', async (req, res) => {
  const { heavenId, heavenPass, max } = req.body || {};
  const lockKey = heavenId ? 'heaven:' + heavenId : null; // 店舗キー=ヘブン垢
  if (lockKey) {
    if (storeLocks.has(lockKey)) return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかの処理を実行中です。少し待ってからもう一度お試しください。' });
    storeLocks.set(lockKey, true);
  }
  try {
    res.json(await runMiteneSend(heavenId, heavenPass, max));
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
});

// ============================================================
// ミテネ用ログインID/パスワード取得（キャスト同期とは別ステップ・非ブロッキング用）
//  - 指定 memberIds（バッチ）だけ取得。件数は呼び出し側で絞る（Vercel タイムアウト対策）。
//  - ここでの失敗はロスター保存に影響しない（別エンドポイント）。
// ============================================================
// ミテネ用ID/PW取得の本体（/mitene-creds ルートと朝の自動同期で共用）。
// ロック(storeLocks)は呼び出し側が管理する。戻り値は従来 /mitene-creds が返していた JSON と同形。
async function runMiteneCredsFetch(adminId, adminPass, shopdir, memberIds) {
  let browser;
  try {
    if (!adminId || !adminPass || !shopdir || !Array.isArray(memberIds)) {
      return { ok: false, error: 'adminId, adminPass, shopdir, memberIds are required' };
    }
    const ids = memberIds.slice(0, 60); // 1回の上限（タイムアウト対策）

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);

    // ログイン（/store-sync と同じ手順）
    await page.goto(`https://newmanager.cityheaven.net/C1Login.php?shopdir=${encodeURIComponent(shopdir)}`, WAIT);
    const idInput = await findVisible(page, '#id');
    if (!idInput) throw new Error('id input not found');
    await idInput.click(); await idInput.type(adminId);
    const passInput = await findVisible(page, '#pass');
    if (!passInput) throw new Error('pass input not found');
    await passInput.click(); await passInput.type(adminPass);
    const loginBtn = await findVisible(page, 'button[name="login"]');
    if (!loginBtn) throw new Error('login button not found');
    await Promise.all([loginBtn.click(), page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })]);

    const CONCURRENCY = 4, PAGE_TIMEOUT = 20000;
    async function fetchCred(memberId) {
      let p;
      try {
        p = await browser.newPage();
        await p.setUserAgent(UA);
        p.setDefaultNavigationTimeout(PAGE_TIMEOUT);
        await p.goto(`https://newmanager.cityheaven.net/C8GirlMyPageRegist.php?member_id=${encodeURIComponent(memberId)}&shopdir=${encodeURIComponent(shopdir)}`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
        const cred = await p.evaluate(() => {
          const t = (document.body && document.body.innerText) || '';
          const idM = t.match(/ログイン\s*ID\s*[:：]\s*([0-9A-Za-z_\-]+)/);
          const pwM = t.match(/パスワード\s*[:：]\s*([^\s　<\n\r]+)/);
          return { loginId: idM ? idM[1] : null, password: pwM ? pwM[1] : null };
        });
        return { memberId, loginId: cred.loginId, password: cred.password };
      } catch (e) {
        return { memberId, loginId: null, password: null };
      } finally {
        if (p) { try { await p.close(); } catch (_) {} }
      }
    }

    const creds = [];
    let i = 0;
    async function worker() {
      while (i < ids.length) { const id = ids[i++]; creds.push(await fetchCred(id)); }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    console.log('[mitene-creds] fetched=' + creds.filter(c => c.password).length + '/' + ids.length);

    await browser.close();
    return { ok: true, creds };
  } catch (e) {
    console.log('[mitene-creds] ERROR: ' + e.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    return { ok: false, error: e.message };
  }
}

app.post('/mitene-creds', async (req, res) => {
  const { adminId, adminPass, shopdir, memberIds } = req.body || {};
  const lockKey = shopdir ? 'shop:' + shopdir : null; // 店舗キー=管理shopdir
  if (lockKey) {
    if (storeLocks.has(lockKey)) return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかの処理を実行中です。少し待ってからもう一度お試しください。' });
    storeLocks.set(lockKey, true);
  }
  try {
    res.json(await runMiteneCredsFetch(adminId, adminPass, shopdir, memberIds));
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
});

// ============================================================
// 【read-only】ミテネ残数チェック（送信しない）
//  - registComeon クリック等の送信系は一切呼ばない（絶対に送らない）。
//  - 戻り値: { ok, remaining, usedUp }（remaining=数値 or null、usedUp=boolean）
// ============================================================
// 残数チェックの本体（/mitene-status ルートと自動送信スケジューラで共用）。
// registComeon クリック等の送信系は一切呼ばない（絶対に送らない）。
async function runMiteneStatusCheck(heavenId, heavenPass) {
  const slog = (m) => console.log('[mitene-status] ' + m);
  const result = { ok: false, remaining: null, usedUp: false, error: null };
  let browser;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // J10ComeonVisitorList ページ1枚から「使い切り」と「残り回数」を同時に判定する。
  //  - 使い切り: 本文に「本日はミテネを使い切りました」
  //  - 残数: 「残り回数：N/M」（実際の文言。左Nが残数）。旧来の「ミテネ残り回数：N回」もフォールバックで許容。
  //    コロンは全角「：」半角「:」、区切りは全角「／」半角「/」どちらも可。本文(innerText)全体に .match する。
  const readJ10Status = async (page) => page.evaluate(() => {
    const t = (document.body && document.body.innerText) || '';
    const usedUp = t.includes('本日はミテネを使い切りました');
    const m = t.match(/(?:ミテネ)?残り回数\s*[：:]\s*(\d+)\s*(?:[／/]\s*\d+|回)/);
    const remaining = m ? Number(m[1]) : null;
    return { usedUp, remaining };
  });

  try {
    if (!heavenId || !heavenPass) {
      result.error = 'heavenId and heavenPass are required';
      return result;
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);

    slog('login...');
    await page.goto('https://spgirl.cityheaven.net/J1Login.php', WAIT);
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation(WAIT)]);

    // J10ComeonVisitorList 1ページで「使い切り」と「残り回数」の両方を判定する（J1Mainは見ない）。
    const miteneUrl = 'https://spgirl.cityheaven.net/J10ComeonVisitorList.php?gid=' + heavenId;
    await page.goto(miteneUrl, WAIT);
    await sleep(2000);
    const st = await readJ10Status(page);
    if (st.usedUp) {
      // 使い切り＝本日完了。残数は0扱い。
      result.usedUp = true;
      result.remaining = 0;
    } else {
      // 「残り回数：N/M」が読めれば数値、読めなければ null（従来どおり）。
      result.remaining = st.remaining;
    }
    slog('remaining=' + result.remaining + ' usedUp=' + result.usedUp);

    await browser.close();
    result.ok = true;
    return result;
  } catch (e) {
    slog('ERROR: ' + e.message);
    result.error = e.message;
    if (browser) { try { await browser.close(); } catch (_) {} }
    return result;
  }
}

app.post('/mitene-status', async (req, res) => {
  const { heavenId, heavenPass } = req.body || {};
  res.json(await runMiteneStatusCheck(heavenId, heavenPass));
});
// ============================================================
// 一括ミテネの店舗まるごとロック（2台目を開始時点で弾く）
//  - キー: 'bulkmitene:'+shopdir（既存の 'shop:'/'heaven:' とは別の接頭辞で誤衝突を防ぐ）。
//  - 値には取得時刻(ms)を入れ、TTL(30分)を過ぎた古いロックは失効扱いにして上書き取得を許す（異常終了でロックが残り続けるのを防ぐ）。
//  - 既存の storeLocks Map を流用。他エンドポイントは 'bulkmitene:' を使わないのでぶつからない。
// ============================================================
const BULK_MITENE_TTL_MS = 30 * 60 * 1000; // 30分

app.post('/bulk-mitene/acquire', (req, res) => {
  const { shopdir } = req.body || {};
  if (!shopdir) return res.status(400).json({ ok: false, error: 'shopdir required' });
  const lockKey = 'bulkmitene:' + shopdir;
  const acquiredAt = storeLocks.get(lockKey);
  // 有効期限内の生きたロックがあれば busy。期限切れ(古い)なら上書き取得できる。
  if (typeof acquiredAt === 'number' && (Date.now() - acquiredAt) < BULK_MITENE_TTL_MS) {
    return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかのスタッフが一括ミテネ送信中です。少し待ってからもう一度お試しください。' });
  }
  storeLocks.set(lockKey, Date.now()); // 取得時刻を記録
  console.log('[bulk-mitene] acquire ' + lockKey);
  return res.json({ ok: true });
});

app.post('/bulk-mitene/release', (req, res) => {
  const { shopdir } = req.body || {};
  if (!shopdir) return res.status(400).json({ ok: false, error: 'shopdir required' });
  const lockKey = 'bulkmitene:' + shopdir;
  storeLocks.delete(lockKey);
  console.log('[bulk-mitene] release ' + lockKey);
  return res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ============================================================
// ミテネ自動送信スケジューラ（毎分チェック）
//  - Supabase の mitene_schedules（店舗×最大5スロット）を毎分読み、
//    該当時刻のスロットを実行して mitene_auto_runs / mitene_auto_logs に記録する。
//  - 環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が無い、または
//    @supabase/supabase-js が未インストールならスケジューラだけ無効（既存機能は影響なし）。
//  - 二重実行防止（3段構え）:
//      1) mitene_auto_runs の UNIQUE(store_id, run_date, slot_no) を INSERT でクレーム（再起動・多重プロセスに耐える。これが真の排他）
//      2) runningStores（実行中店舗のSet）: 同一店舗の多重起動を防ぐ。店舗間は並列（最大3店舗）で、
//         長時間かかる店舗が他店舗のグレース窓を潰さない
//      3) 手動一括ミテネと同じ 'bulkmitene:'+shopdir ロック＋キャスト単位 'heaven:' ロック
// ============================================================
let supabaseAdmin = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SB_URL && SB_KEY) {
    supabaseAdmin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    console.log('[auto-mitene] スケジューラ有効（毎分チェック）');
  } else {
    console.warn('[auto-mitene] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定のためスケジューラ無効（既存機能は動作します）');
  }
} catch (e) {
  console.warn('[auto-mitene] @supabase/supabase-js が読み込めないためスケジューラ無効（npm i @supabase/supabase-js で有効化）: ' + e.message);
}

const AUTO_MITENE_GRACE_MIN = 20; // グレース窓: send_time から20分以内なら実行（bot停止・他店舗の長時間実行からの復帰で拾う）

const pad2 = (n) => String(n).padStart(2, '0');
// "HH:MM(:SS)" → 0〜1439 分
function hmToMin(s) {
  const m = String(s || '').match(/^(\d{2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
// UTCエポックms → JST営業日 (YYYY-MM-DD)。アプリの getBusinessToday と同じ「JST 6:00 切替」（+9h-6h=+3h方式）
function bizDateOf(msUtc) {
  const d = new Date(msUtc + 3 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}
// "YYYY-MM-DD" に n 日加算した "YYYY-MM-DD"（先出勤ミテネの対象日計算用）
function addDaysYmd(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

// ============================================================
// 朝の自動同期用: App.jsx から移植したヘルパー群
// （保存ロジックをアプリの doSync と一致させるための忠実移植。
//   App.jsx 側を変更したら必ずここも追従させること）
// ============================================================
// App.jsx:231 と同値: キャスト同期で保存する上位N名（ヘブン掲載順の先頭から）
const CAST_SYNC_LIMIT = 300;

// App.jsx:104-123 normalizeName の忠実移植。
// 「半角/全角スペース」「新人」「🔰」のうち最初に現れた位置で切り、その前だけを名前とする。
function normalizeName(s) {
  let name = String(s || '');
  // ☆/★ を含む店舗対策: 最初の ☆/★ より前だけを残し前後空白をトリム。空になる場合は元の名前を使う（App.jsx:108-112）
  const star = name.search(/[★☆]/);
  if (star >= 0) {
    const cut = name.slice(0, star).trim();
    if (cut) name = cut;
  }
  // 装飾語が名前の前に付く店舗対策（App.jsx:114）
  name = name.replace(/新人|体験割|体験|🔰/g, ' ').trim();
  const cuts = [];
  const sp = name.search(/[\s　]/);     // 最初の半角/全角スペース（App.jsx:116）
  const ni = name.indexOf('新人');
  const mk = name.indexOf('🔰');
  [sp, ni, mk].forEach((i) => { if (i >= 0) cuts.push(i); });
  if (cuts.length) name = name.slice(0, Math.min(...cuts));
  // 末尾に残った装飾・空白を除去（App.jsx:122）
  return name.replace(/[\s　★☆♪♫♡♥❤◎○●◯◆◇■□▲△▼▽※‼！!♢❀✿✦✧♛👑💖💕✨🌟⭐️⭐🔰]+$/u, '').trim();
}

// App.jsx:83-95 mdToYMD の忠実移植: "M/D"→"YYYY-MM-DD"（営業日基準±180日で年跨ぎ補正）
function mdToYMD(md) {
  const parts = String(md || '').split('/').map(Number);
  const m = parts[0], d = parts[1];
  if (!m || !d) return '';
  const todayStr = bizDateOf(Date.now()); // App.jsx:86 getBusinessToday() 相当
  const year = Number(todayStr.slice(0, 4));
  const mk = (y) => y + '-' + pad2(m) + '-' + pad2(d);
  const base = new Date(todayStr).getTime();
  const diff = Math.round((new Date(mk(year)).getTime() - base) / 86400000);
  if (diff >= 180) return mk(year - 1);
  if (diff <= -180) return mk(year + 1);
  return mk(year);
}

// App.jsx:96-99 getBusinessTodayKey の忠実移植: 営業日の "M/D"（ゼロ埋めなし）
function getBusinessTodayKeyMD() {
  const d = new Date(Date.now() + 3 * 3600000);
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}
// 営業日基準で n 日後の "M/D"（ゼロ埋めなし。getBusinessTodayKeyMD と同方式。先出勤PW取得の対象日計算用）
function getBusinessKeyMDAfter(n) {
  const d = new Date(Date.now() + 3 * 3600000);
  d.setUTCDate(d.getUTCDate() + n);
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}

// App.jsx:393-406 toSupabaseCast の忠実移植（store_id は引数で受ける。heaven_pass は含めない
// ＝upsertペイロードに無いカラムはDBの既存値が保持される）
function toSupabaseCastRow(storeId, c) {
  return {
    store_id:     storeId,
    name:         c.name,
    is_active:    c.is_active,
    work_start:   c.work_start || '',
    strong:       c.strong || '未分析',
    weak:         c.weak || '未分析',
    heaven_id:    c.heaven_id || '',
    type:         c.type != null ? c.type : null,
    disclose:     c.disclose != null ? c.disclose : null,
    shindan_note: c.shindan_note != null ? c.shindan_note : null,
  };
}

// ============================================================
// 朝の自動同期（キャスト同期＋出勤同期＋ミテネPW取得）
//  - スクレイプは runStoreSyncScrape / runMiteneCredsFetch（手動 /store-sync・/mitene-creds と同一の内部関数）
//  - 保存ロジックは App.jsx の doSync（App.jsx:1182-1391）と fillMitenePasswords（App.jsx:1134-1160）の忠実移植。
//    ローカルUI state 更新（setCasts/setShifts/setSyncResult等）はブラウザ専用のため対象外。
//  - 二重実行防止: mitene_auto_runs の slot_no=0 を同期用に予約（UNIQUE(store_id, run_date, 0) のクレーム方式）
// ============================================================
const SYNC_SLOT_NO = 0;            // mitene_auto_runs の slot_no=0 は朝の自動同期用に予約
const AUTO_SYNC_MIN = 6 * 60;      // JST 06:00（グレース窓は AUTO_MITENE_GRACE_MIN と共通の10分）

// ============================================================
// 先出勤ミテネ（明日〜pre_mitene_days日後以内に出勤予定のキャストへ昼に送る）
//  - slot_no の帯域分離: 0=朝の自動同期 / 1〜5=通常スロット / 90=先出勤ミテネ。
//    通常スロットを将来6個以上に拡張しても衝突しないよう、離れた番号を予約する。
// ============================================================
const PRE_MITENE_SLOT_NO = 90;     // mitene_auto_runs / mitene_auto_logs の slot_no=90 は先出勤ミテネ用に予約
const PRE_MITENE_MIN = 12 * 60;    // JST 12:00 発火（グレース窓は AUTO_MITENE_GRACE_MIN と共通）
// 1人あたりの送信件数は「残り全部」に変更済み（旧 PRE_MITENE_COUNT=5 の固定値は廃止）。
// maxPerCast=50 は最終スロットと同じ「残り全部（姫デコの日次上限50で頭打ち。実際はヘブンの上限20で頭打ち）」の扱い。

async function runAutoSync(store, runDate) {
  const tag = '[auto-sync] ' + store.store_id + ' (' + runDate + ') ';

  // クレーム: 自動送信スロットと同じ方式（重複エラー23505＝この営業日は実行済み → 静かにスキップ）
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('mitene_auto_runs')
    .insert({ store_id: store.store_id, run_date: runDate, slot_no: SYNC_SLOT_NO, send_count: null })
    .select('id');
  if (claimErr) {
    if (claimErr.code !== '23505') console.error(tag + 'クレーム失敗: ' + claimErr.message);
    return;
  }
  const runId = claimed && claimed[0] && claimed[0].id;
  if (!runId) return;
  console.log(tag + '朝の自動同期 開始 runId=' + runId);

  const closeRun = async (patch) => {
    const { error } = await supabaseAdmin.from('mitene_auto_runs')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) console.error(tag + 'run更新失敗: ' + error.message);
  };

  // 手動同期（/store-sync・/mitene-creds）と同じ 'shop:'+shopdir ロック
  const lockKey = 'shop:' + store.shopdir;
  if (storeLocks.has(lockKey)) {
    console.log(tag + '手動同期が実行中(busy) → スキップ');
    await closeRun({ status: 'error', error: 'busy' });
    return;
  }
  storeLocks.set(lockKey, true);

  let castCount = 0, shiftRowCount = 0, pwUpdated = 0;
  // d. 実行結果ログ（cast_name='[sync]' の1行で識別。sent_count=同期キャスト数 / remaining_after=PW保存件数 として流用）
  const logRow = {
    run_id: runId, store_id: store.store_id, run_date: runDate, slot_no: SYNC_SLOT_NO,
    cast_name: '[sync]', heaven_id: '', requested_count: null,
    sent_count: 0, remaining_after: null, ok: false, error: null,
  };
  try {
    // b. スクレイプ（/store-sync と同一の内部関数。認証情報は settings の値）
    const data = await runStoreSyncScrape(store.admin_id, store.admin_pass, store.shopdir);
    if (!data.ok || !Array.isArray(data.casts)) throw new Error(data.error || '同期データの取得に失敗しました'); // App.jsx:1202 相当

    // ── casts 保存（App.jsx doSync mode==="casts" App.jsx:1204-1300 の移植）──
    // App.jsx:1205-1211: 掲載順の先頭 CAST_SYNC_LIMIT 名 ∪ 出勤データに載っているキャスト。
    //   ※App.jsx は前回同期のローカル shifts state を使うが、bot には無いため
    //     今回スクレイプの最新 shifts で代用（より新しい同一情報源）。
    const all = data.casts || [];
    const top = all.slice(0, CAST_SYNC_LIMIT);                       // App.jsx:1207
    const shiftNames = new Set();
    (data.shifts || []).forEach((s) => { if (s && s.name) shiftNames.add(normalizeName(s.name)); }); // App.jsx:1208-1209 相当
    const extra = all.slice(CAST_SYNC_LIMIT).filter((c) => shiftNames.has(normalizeName(c.name)));   // App.jsx:1210
    const incoming = [...top, ...extra];                             // App.jsx:1211

    // App.jsx:1214 const next = [...casts]: ブラウザの casts state の代わりに Supabase の既存行を読む
    const { data: existingCasts, error: exErr } = await supabaseAdmin.from('casts')
      .select('name, is_active, work_start, strong, weak, heaven_id, type, disclose, shindan_note')
      .eq('store_id', store.store_id);
    if (exErr) throw new Error('casts取得失敗: ' + exErr.message);
    const next = [...(existingCasts || [])];

    // App.jsx:1216-1236 3段マージの忠実移植
    incoming.forEach(({ name: rawName, heavenId }) => {
      const name = normalizeName(rawName);                                        // App.jsx:1217 最初のスペースより前だけを保存名にする
      const byId = next.findIndex((c) => c.heaven_id && c.heaven_id === heavenId); // App.jsx:1219 1. heavenId一致 → name更新
      if (byId !== -1) { next[byId] = { ...next[byId], name }; return; }           // App.jsx:1220-1224
      const byName = next.findIndex((c) => normalizeName(c.name) === name);        // App.jsx:1226 2. name一致 → heaven_id更新＋name正規化
      if (byName !== -1) { next[byName] = { ...next[byName], heaven_id: heavenId, name }; return; } // App.jsx:1227-1231
      next.push({ name, is_active: true, work_start: '', strong: '未分析', weak: '未分析', heaven_id: heavenId, heaven_pass: '' }); // App.jsx:1233 3. 新規追加
    });

    // App.jsx:1241-1253 (store_id,name) 重複排除＋空名除外＋heaven_id補完 の忠実移植
    const dedupedNext = [];
    const seenName = new Map(); // normalizedName -> index in dedupedNext（App.jsx:1242）
    for (const c of next) {
      const key = normalizeName(c.name);
      if (!key) continue;                                            // App.jsx:1245 名前空は除外（必須カラム違反も防ぐ）
      if (seenName.has(key)) {
        const ex = dedupedNext[seenName.get(key)];
        if (!ex.heaven_id && c.heaven_id) ex.heaven_id = c.heaven_id; // App.jsx:1248-1250 重複時は heaven_id を補完して情報を失わない
        continue;
      }
      seenName.set(key, dedupedNext.length);
      dedupedNext.push({ ...c, name: key });
    }

    // App.jsx:1257-1270 残骸削除対象の割り出し（3重ガード）の忠実移植
    const survivingByHeavenId = new Map();                            // App.jsx:1259
    dedupedNext.forEach((c) => { if (c.heaven_id) survivingByHeavenId.set(c.heaven_id, c.name); }); // App.jsx:1260
    const survivingNames = new Set(dedupedNext.map((c) => c.name));   // App.jsx:1261
    const staleNames = [];
    (existingCasts || []).forEach((c) => {                            // App.jsx:1263 casts.forEach（同期前の既存一覧が対象）
      if (!c.heaven_id) return;                                       // App.jsx:1264
      const keepName = survivingByHeavenId.get(c.heaven_id);
      if (!keepName) return;                                          // App.jsx:1266 同期後も生存している heaven_id の行だけが対象
      if (c.name === keepName) return;                                // App.jsx:1267 生き残りの正規化名は絶対に消さない
      if (survivingNames.has(c.name)) return;                         // App.jsx:1268 念のため: 生存中の名前は消さない
      if (!staleNames.includes(c.name)) staleNames.push(c.name);      // App.jsx:1269
    });

    // App.jsx:1273-1297 upsert → 成功後にのみ残骸削除（順序厳守）の忠実移植
    const { error: upErr } = await supabaseAdmin.from('casts')
      .upsert(dedupedNext.map((c) => toSupabaseCastRow(store.store_id, c)), { onConflict: 'store_id,name' }); // App.jsx:1274
    if (upErr) throw new Error('casts upsert失敗: ' + upErr.message);  // App.jsx:1276-1281 upsert失敗時は削除しない（データ保全）
    castCount = dedupedNext.length;
    if (staleNames.length > 0) {                                      // App.jsx:1283-1295 upsert成功後にのみ削除
      const { error: delErr } = await supabaseAdmin.from('casts').delete()
        .eq('store_id', store.store_id).in('name', staleNames);       // App.jsx:1284
      if (delErr) console.error(tag + '残骸削除失敗（次回同期で再試行）: ' + delErr.message); // App.jsx:1287-1289 削除失敗は同期全体を失敗にしない
      else console.log(tag + '残骸削除 ' + staleNames.length + '件');
    }
    console.log(tag + 'casts保存 ' + castCount + '件');

    // ── shifts 保存（App.jsx doSync else分岐 App.jsx:1310-1391 の移植。ローカルstate更新は対象外）──
    if (!Array.isArray(data.shifts)) throw new Error('出勤データが取得できませんでした'); // App.jsx:1311
    const todayYmd = runDate;       // App.jsx:1313 営業日基準の今日（削除は今日以降のみ＝過去実績は消さない）。run_date=営業日
    const shiftRows = [];           // App.jsx:1314 Supabase 保存用
    const seenRow = new Set();      // App.jsx:1315 (store_id,cast_name,date) 重複排除
    const syncedNames = new Set();  // App.jsx:1316 今回同期に登場したキャスト名（cleanName済み）
    const syncedKeys = new Set();   // App.jsx:1317 今回同期の "cast_name|YYYY-MM-DD" 組
    data.shifts.forEach(({ name, days }) => {                          // App.jsx:1324 行構築部分
      if (!name || !Array.isArray(days)) return;                       // App.jsx:1325
      const cleanName = normalizeName(name);                           // App.jsx:1327 ボット由来の装飾を保存前に除去
      if (!cleanName) return;                                          // App.jsx:1328
      days.forEach(({ date, start, end }) => {                         // App.jsx:1330
        if (!date) return;
        const ymd = mdToYMD(date);                                     // App.jsx:1332
        if (!ymd) return;
        syncedNames.add(cleanName);                                    // App.jsx:1334
        syncedKeys.add(cleanName + '|' + ymd);                         // App.jsx:1335
        const rk = store.store_id + '::' + cleanName + '::' + ymd;     // App.jsx:1337
        if (!seenRow.has(rk)) {
          seenRow.add(rk);
          shiftRows.push({ store_id: store.store_id, cast_name: cleanName, date: ymd, start_time: start || '', end_time: end || '' }); // App.jsx:1340
        }
      });
    });
    if (shiftRows.length > 0) {                                        // App.jsx:1348
      const { error: shUpErr } = await supabaseAdmin.from('shifts')
        .upsert(shiftRows, { onConflict: 'store_id,cast_name,date' }); // App.jsx:1349
      if (shUpErr) throw new Error('shifts upsert失敗: ' + shUpErr.message); // App.jsx:1352-1356 upsert失敗時は削除しない
      shiftRowCount = shiftRows.length;

      // App.jsx:1359-1382 取消シフト削除（4条件: store一致 / date>=今日(営業日) / 今回同期に登場したキャスト / 今回同期に無い(cast,date)組）
      const { data: existing, error: selErr } = await supabaseAdmin.from('shifts')
        .select('cast_name, date').eq('store_id', store.store_id).gte('date', todayYmd); // App.jsx:1362-1364
      if (selErr) {
        console.error(tag + '取消シフトselect失敗（削除は行わない）: ' + selErr.message); // App.jsx:1365 select失敗時は削除しない
      } else {
        const staleShifts = (existing || []).filter(
          (r) => syncedNames.has(r.cast_name) && !syncedKeys.has(r.cast_name + '|' + r.date) // App.jsx:1366-1368
        );
        if (staleShifts.length > 0) {
          const byDate = new Map();                                    // App.jsx:1372 date -> [cast_name]
          staleShifts.forEach((r) => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r.cast_name); }); // App.jsx:1373
          let deleted = 0;
          for (const [d, names] of byDate) {                           // App.jsx:1375 日付ごとにまとめて削除
            const { error: delErr } = await supabaseAdmin.from('shifts').delete()
              .eq('store_id', store.store_id).eq('date', d).in('cast_name', names); // App.jsx:1376-1377
            if (delErr) { console.error(tag + '取消シフト削除失敗(' + d + '): ' + delErr.message); continue; } // App.jsx:1378 失敗した組は残す
            deleted += names.length;
          }
          if (deleted > 0) console.log(tag + '取消シフト削除 ' + deleted + '件');
        }
      }
    }
    console.log(tag + 'shifts保存 ' + shiftRowCount + '行');

    // ── ミテネPW取得（App.jsx fillMitenePasswords App.jsx:1134-1160 相当）──
    // App.jsx:1137-1148: 今日出勤の名前集合。App.jsx は今回同期の shifts と既存 state の和集合だが、
    // bot には state が無いため今回スクレイプの shifts のみで判定（同じ最新情報源）。
    // 先出勤ミテネON（pre_mitene_enabled）の店舗は、昼12時の先出勤送信までにPWが揃うよう
    // 「明日〜pre_mitene_days日後以内」の出勤予定者も対象に加える（OFFの店舗は従来どおり今日出勤のみ）。
    const targetKeys = new Set([getBusinessTodayKeyMD()]);
    if (store.pre_mitene_enabled) {
      const preDays = (Number.isInteger(store.pre_mitene_days) && store.pre_mitene_days >= 1 && store.pre_mitene_days <= 7) ? store.pre_mitene_days : 3; // DB既定値(3)と同じフォールバック
      for (let i = 1; i <= preDays; i++) targetKeys.add(getBusinessKeyMDAfter(i));
    }
    const workingNames = new Set();
    (data.shifts || []).forEach((s) => {
      if (s && Array.isArray(s.days) && s.days.some((dd) => targetKeys.has(dd.date))) workingNames.add(normalizeName(s.name)); // App.jsx:1139-1141 の対象日を集合化した版
    });
    // App.jsx:1150-1155: heaven_id ありかつ対象日（今日＋先出勤範囲）に出勤だけを対象にする
    const targets = dedupedNext.filter((c) => c.heaven_id && workingNames.has(normalizeName(c.name)));
    const memberIds = targets.map((c) => c.heaven_id);                 // App.jsx:1155
    if (memberIds.length > 0) {
      const credRes = await runMiteneCredsFetch(store.admin_id, store.admin_pass, store.shopdir, memberIds);
      if (credRes.ok && Array.isArray(credRes.creds)) {
        // 保存規約は Vercel /api/mitene-creds と同一: UPDATE のみ（台帳に無い heaven_id を INSERT しない）
        for (const c of credRes.creds) {
          const memberId = c && c.memberId != null ? String(c.memberId) : '';
          const password = c && c.password;
          if (!memberId || !password) continue; // パスワード未取得はスキップ
          const { data: rows, error: pwErr } = await supabaseAdmin.from('casts')
            .update({ heaven_pass: password })
            .eq('store_id', store.store_id).eq('heaven_id', memberId)
            .select('heaven_id');
          if (pwErr) { console.error(tag + 'PW保存失敗(' + memberId + '): ' + pwErr.message); continue; }
          if (rows && rows.length > 0) pwUpdated++;
        }
        console.log(tag + 'ミテネPW保存 ' + pwUpdated + '/' + memberIds.length + '件');
      } else {
        // App.jsx:1156-1159: PW取得失敗はロスター保存済みのため同期全体を失敗にしない
        console.error(tag + 'ミテネPW取得失敗（ロスターは保存済み）: ' + (credRes.error || 'unknown'));
      }
    } else {
      console.log(tag + 'PW取得対象なし（今日＋先出勤範囲）');
    }

    // e. クローズ（total_casts=同期キャスト数 / total_sent=保存shift行数 として流用）
    logRow.ok = true;
    logRow.sent_count = castCount;
    logRow.remaining_after = pwUpdated;
    await closeRun({ status: 'done', total_casts: castCount, total_sent: shiftRowCount });
    console.log(tag + '完了 casts=' + castCount + ' shiftRows=' + shiftRowCount + ' pw=' + pwUpdated);
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.error(tag + 'エラー: ' + msg);
    logRow.ok = false;
    logRow.error = msg;
    await closeRun({ status: 'error', error: msg, total_casts: castCount, total_sent: shiftRowCount });
  } finally {
    storeLocks.delete(lockKey);
    // d. 成否どちらでも '[sync]' 行を1行残す
    const { error: logErr } = await supabaseAdmin.from('mitene_auto_logs').insert(logRow);
    if (logErr) console.error(tag + 'ログ保存失敗: ' + logErr.message);
  }
}

// ============================================================
// 通常スロット（runAutoSlot）と先出勤ジョブ（runPreMitene）で共用するヘルパー
// ============================================================
// 対象日リスト（YYYY-MM-DD配列）に出勤予定の cast_name を重複なしで抽出し、casts と照合して
// heaven_id / heaven_pass 付きで返す（runAutoSlot の対象抽出を対象日パラメータ化して括り出したもの）。
// auto_mitene_skip=true のキャスト（個別に自動ミテネOFF）はここで除外する＝当日スロットと先出勤の両方に効く。
async function fetchShiftCasts(storeId, dates) {
  const { data: shiftRows, error: shErr } = await supabaseAdmin.from('shifts')
    .select('cast_name').eq('store_id', storeId).in('date', dates);
  if (shErr) throw new Error('shifts取得失敗: ' + shErr.message);
  const names = Array.from(new Set((shiftRows || []).map((r) => r.cast_name).filter(Boolean)));
  if (names.length === 0) return [];
  const { data: castRows, error: caErr } = await supabaseAdmin.from('casts')
    .select('name, heaven_id, heaven_pass, auto_mitene_skip').eq('store_id', storeId).in('name', names);
  if (caErr) throw new Error('casts取得失敗: ' + caErr.message);
  const all = castRows || [];
  const targets = all.filter((c) => !c.auto_mitene_skip);
  const excluded = all.length - targets.length;
  if (excluded > 0) console.log('[auto-mitene] ' + storeId + ': 自動OFFの' + excluded + '人を除外');
  return targets;
}

// 対象キャストへ1人ずつ逐次送信し、1人ごとに mitene_auto_logs へ記録する（runAutoSlot の e/f を括り出したもの）。
//  - heaven_pass未登録スキップ / キャスト単位 'heaven:' ロック / 送信前の残数チェック→使い切りスキップ、の骨格は従来どおり
//  - requestedCount: ログの requested_count に入れる値（null=残り全部）
//  - 戻り値: 送信合計数
async function sendMiteneToTargets({ tag, runId, storeId, runDate, slotNo, targets, maxPerCast, requestedCount }) {
  let totalSent = 0;
  for (const c of targets) {
    const logRow = {
      run_id: runId, store_id: storeId, run_date: runDate, slot_no: slotNo,
      cast_name: c.name, heaven_id: c.heaven_id || '', requested_count: requestedCount,
      sent_count: 0, remaining_after: null, ok: false, error: null,
    };
    if (!c.heaven_id || !c.heaven_pass) {
      logRow.error = 'no_heaven_pass';
      console.log(tag + c.name + ': PW未登録 → スキップ');
    } else {
      const castLock = 'heaven:' + c.heaven_id; // 手動の個別送信(/mitene)と同じキャスト単位ロック
      if (storeLocks.has(castLock)) {
        logRow.error = 'busy';
        console.log(tag + c.name + ': 個別送信が実行中(busy) → スキップ');
      } else {
        storeLocks.set(castLock, true);
        try {
          // 送信前に残数を確認し、本日完了（使い切り/残0）ならタブ巡回・送信処理に入らずスキップ。
          // 判定できない場合（remaining=null やチェック自体の失敗）は従来どおり送信に進む（安全側＝送り漏らさない）。
          const st = await runMiteneStatusCheck(c.heaven_id, c.heaven_pass);
          if (st.ok && (st.usedUp || st.remaining === 0)) {
            // スキップは ok=true のまま error='skipped_used_up' を残し、失敗（ok=false）と区別できるようにする
            logRow.ok = true;
            logRow.sent_count = 0;
            logRow.remaining_after = 0;
            logRow.error = 'skipped_used_up';
            console.log(tag + c.name + ': 本日完了のためスキップ');
          } else {
            const r = await runMiteneSend(c.heaven_id, c.heaven_pass, maxPerCast);
            logRow.ok = !!r.ok;
            logRow.sent_count = r.sent || 0;
            logRow.remaining_after = (typeof r.remainingAfter === 'number') ? r.remainingAfter : null;
            logRow.error = r.ok ? null : (r.error || 'unknown');
            totalSent += logRow.sent_count;
            console.log(tag + c.name + ': sent=' + logRow.sent_count + (r.ok ? '' : ' error=' + logRow.error));
          }
        } finally {
          storeLocks.delete(castLock);
        }
      }
    }
    const { error: logErr } = await supabaseAdmin.from('mitene_auto_logs').insert(logRow);
    if (logErr) console.error(tag + 'ログ保存失敗(' + c.name + '): ' + logErr.message);
  }
  return totalSent;
}

// 1スロットぶんの実行（クレーム→ロック→対象抽出→逐次送信→ログ→クローズ）
async function runAutoSlot(slot, runDate, shopdir, isFinalSlot) {
  const tag = '[auto-mitene] ' + slot.store_id + ' slot' + slot.slot_no + ' (' + runDate + ') ';

  // 0. busy時はクレームを消費しない: 手動一括ミテネのロック状態を先に確認し、busyならクレームせずreturn。
  //    クレーム行が残らないため、グレース窓内の次のtickで自然に再試行される（手動終了後に自動が拾える）。
  //    真の二重実行防止は下のクレーム(UNIQUE制約)が担うので、この事前チェックは順序の最適化にすぎない。
  let lockKey = null;
  if (shopdir) {
    lockKey = 'bulkmitene:' + shopdir;
    const peekAt = storeLocks.get(lockKey);
    if (typeof peekAt === 'number' && (Date.now() - peekAt) < BULK_MITENE_TTL_MS) {
      console.log(tag + '手動一括ミテネが実行中(busy) → クレームせずスキップ（窓内の次tickで再試行）');
      return;
    }
  }

  // a. クレーム: UNIQUE(store_id, run_date, slot_no) への INSERT が通った者だけが実行する。
  //    重複エラー(23505)＝この営業日は実行済み/実行中 → 静かにスキップ。
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('mitene_auto_runs')
    .insert({ store_id: slot.store_id, run_date: runDate, slot_no: slot.slot_no, send_count: slot.send_count })
    .select('id');
  if (claimErr) {
    if (claimErr.code !== '23505') console.error(tag + 'クレーム失敗: ' + claimErr.message);
    return;
  }
  const runId = claimed && claimed[0] && claimed[0].id;
  if (!runId) return;
  console.log(tag + '開始 runId=' + runId + ' send_count=' + ((isFinalSlot || slot.send_count == null) ? '残り全部(max50)' + (isFinalSlot ? '/最終スロット' : '') : slot.send_count));

  const closeRun = async (patch) => {
    const { error } = await supabaseAdmin.from('mitene_auto_runs')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) console.error(tag + 'run更新失敗: ' + error.message);
  };

  // c. 手動一括ミテネと同じ店舗ロック（'bulkmitene:'+shopdir、TTL方式）を取得。
  //    冒頭のpeek後〜クレームの間に手動acquireが割り込んだ稀なケースのみ、ここで検出して
  //    従来どおり busy で閉じる（このケースだけはクレームが消費されるが、相互排他は維持される）。
  if (lockKey) {
    const acquiredAt = storeLocks.get(lockKey);
    if (typeof acquiredAt === 'number' && (Date.now() - acquiredAt) < BULK_MITENE_TTL_MS) {
      console.log(tag + '手動一括ミテネが実行中(busy) → スキップ');
      await closeRun({ status: 'error', error: 'busy' });
      return;
    }
    storeLocks.set(lockKey, Date.now());
  } else {
    // settings.shopdir 未設定の店舗はロックなしで実行（手動一括ミテネとの相互排他だけが効かない）
    console.warn(tag + 'shopdir未設定のため店舗ロックなしで実行（設定画面でスケジュールを保存し直すと解消）');
  }

  let totalCasts = 0, totalSent = 0;
  try {
    // d. 対象キャスト抽出: shifts（store_id × 営業日）→ casts（heaven_id / heaven_pass あり）（共通関数）
    const targets = await fetchShiftCasts(slot.store_id, [runDate]);
    if (targets.length === 0) {
      console.log(tag + '営業日=' + runDate + ' の出勤者0人のためスキップ');
      await closeRun({ status: 'done', total_casts: 0, total_sent: 0 });
      return;
    }
    totalCasts = targets.length;
    // 実行開始ログ: 営業日（6時切替）と対象人数の根拠を1行で明示（例: 営業日=2026-08-13(6時切替) 対象=15人(8/13出勤)）
    const mdParts = runDate.split('-');
    const mdLabel = (+mdParts[1]) + '/' + (+mdParts[2]);
    console.log('[auto-mitene] ' + slot.store_id + ' slot' + slot.slot_no + ' 開始: 営業日=' + runDate + '(6時切替) 対象=' + totalCasts + '人(' + mdLabel + '出勤)');
    // 時刻上の最終スロットは send_count に関わらず残り全部（姫デコの日次上限50で頭打ち）。
    // NULL=残り全部の分岐は既存データ（旧仕様でnull保存済みの行）の移行期互換として必ず残す
    const maxPerCast = (isFinalSlot || slot.send_count == null) ? 50 : slot.send_count;

    // e/f. 1人ずつ逐次送信し、1人ごとにログを残す（共通関数）
    totalSent = await sendMiteneToTargets({
      tag, runId, storeId: slot.store_id, runDate, slotNo: slot.slot_no, targets, maxPerCast,
      requestedCount: (isFinalSlot || slot.send_count == null) ? null : slot.send_count, // null=残り全部（最終スロットは件数に関わらず全部送るためnullで記録）
    });

    // g. クローズ
    await closeRun({ status: 'done', total_casts: totalCasts, total_sent: totalSent });
    console.log(tag + '完了 total_casts=' + totalCasts + ' total_sent=' + totalSent);
  } catch (e) {
    console.error(tag + 'エラー: ' + ((e && e.message) || e));
    await closeRun({ status: 'error', error: String((e && e.message) || e), total_casts: totalCasts, total_sent: totalSent });
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
}

// ============================================================
// 先出勤ミテネ 1店舗ぶんの実行（毎日 JST 12:00 発火・グレース窓は通常スロットと共通）
//  - 「明日〜pre_mitene_days日後以内」（営業日基準）に出勤予定のキャストへ残数全部を送る（maxPerCast=50）。
//    当日（runDate）に出勤している子は対象外: 当日分の残数は当日の最終スロット（残り全部）が使うため、
//    昼の先出勤が先に使い切ると夕方の送信分が無くなる。
//  - 二重実行防止: mitene_auto_runs の UNIQUE(store_id, run_date, slot_no) を slot_no=90 でクレーム
//    （帯域分離: 0=朝の自動同期 / 1〜5=通常スロット / 90=先出勤ミテネ）
//  - 手動一括ミテネとの排他: runAutoSlot と同じ 'bulkmitene:'+shopdir ロック
//    （busy時はクレームを消費せずスキップ→グレース窓内の次tickで再試行）
//  - 骨格（クレーム→ロック→対象抽出→逐次送信→ログ→クローズ）は runAutoSlot と同一。
//    対象抽出と送信ループは共通関数 fetchShiftCasts / sendMiteneToTargets を使う。
// ============================================================
async function runPreMitene(store, runDate, shopdir) {
  const tag = '[pre-mitene] ' + store.store_id + ' (' + runDate + ') ';
  // 日数は settings.pre_mitene_days（1〜7）。想定外の値はDB既定値(3)と同じフォールバック
  const days = (Number.isInteger(store.pre_mitene_days) && store.pre_mitene_days >= 1 && store.pre_mitene_days <= 7) ? store.pre_mitene_days : 3;

  // 0. busy時はクレームを消費しない（runAutoSlot と同じ順序最適化。真の排他は下のクレームが担う）
  let lockKey = null;
  if (shopdir) {
    lockKey = 'bulkmitene:' + shopdir;
    const peekAt = storeLocks.get(lockKey);
    if (typeof peekAt === 'number' && (Date.now() - peekAt) < BULK_MITENE_TTL_MS) {
      console.log(tag + '手動一括ミテネが実行中(busy) → クレームせずスキップ（窓内の次tickで再試行）');
      return;
    }
  }

  // a. クレーム: slot_no=90 への INSERT が通った者だけが実行する（重複エラー23505＝この営業日は実行済み → 静かにスキップ）
  //    send_count=null は「残り全部」の意味（通常スロットの旧仕様・最終スロットと同じ規約）
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('mitene_auto_runs')
    .insert({ store_id: store.store_id, run_date: runDate, slot_no: PRE_MITENE_SLOT_NO, send_count: null })
    .select('id');
  if (claimErr) {
    if (claimErr.code !== '23505') console.error(tag + 'クレーム失敗: ' + claimErr.message);
    return;
  }
  const runId = claimed && claimed[0] && claimed[0].id;
  if (!runId) return;
  console.log(tag + '先出勤ミテネ 開始 runId=' + runId + ' 対象=明日〜' + days + '日後 件数/人=残り全部');

  const closeRun = async (patch) => {
    const { error } = await supabaseAdmin.from('mitene_auto_runs')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) console.error(tag + 'run更新失敗: ' + error.message);
  };

  // c. 手動一括ミテネと同じ店舗ロック（'bulkmitene:'+shopdir、TTL方式）を取得。
  //    冒頭のpeek後〜クレームの間に手動acquireが割り込んだ稀なケースのみ、ここで検出して busy で閉じる。
  if (lockKey) {
    const acquiredAt = storeLocks.get(lockKey);
    if (typeof acquiredAt === 'number' && (Date.now() - acquiredAt) < BULK_MITENE_TTL_MS) {
      console.log(tag + '手動一括ミテネが実行中(busy) → スキップ');
      await closeRun({ status: 'error', error: 'busy' });
      return;
    }
    storeLocks.set(lockKey, Date.now());
  } else {
    console.warn(tag + 'shopdir未設定のため店舗ロックなしで実行（設定画面でスケジュールを保存し直すと解消）');
  }

  let totalCasts = 0, totalSent = 0;
  try {
    // d. 対象キャスト抽出: 明日〜N日後（営業日基準）の shifts → casts（共通関数）
    const targetDates = Array.from({ length: days }, (_, i) => addDaysYmd(runDate, i + 1)); // i=0 が明日
    const rangeLabel = targetDates[0] + '〜' + targetDates[targetDates.length - 1];
    const rangeTargets = await fetchShiftCasts(store.store_id, targetDates);

    // 今日（runDate当日）に出勤している子は除外する。
    // 理由: 当日出勤の子の残数は当日の最終スロット（残り全部）が使うため、
    // 昼の先出勤が先に残数を使い切ると夕方の送信分が無くなる。
    const { data: todayRows, error: tdErr } = await supabaseAdmin.from('shifts')
      .select('cast_name').eq('store_id', store.store_id).eq('date', runDate);
    if (tdErr) throw new Error('shifts取得失敗(当日分): ' + tdErr.message);
    const todayNames = new Set((todayRows || []).map((r) => r.cast_name).filter(Boolean));
    const targets = rangeTargets.filter((c) => !todayNames.has(c.name));
    const excluded = rangeTargets.length - targets.length;
    if (excluded > 0) console.log(tag + '今日出勤の' + excluded + '人を除外（当日分は最終スロットが担当）');

    if (targets.length === 0) {
      console.log(tag + rangeLabel + ' の出勤予定者（今日出勤を除く）0人のためスキップ');
      await closeRun({ status: 'done', total_casts: 0, total_sent: 0 });
      return;
    }
    totalCasts = targets.length;
    console.log(tag + '対象=' + totalCasts + '人(' + rangeLabel + '出勤予定・今日出勤除く)');

    // e/f. 1人ずつ逐次送信し、1人ごとにログを残す（slot_no=90 で記録）。
    // maxPerCast=50 は最終スロットと同じ「残り全部」扱い（requested_count=null で記録）
    totalSent = await sendMiteneToTargets({
      tag, runId, storeId: store.store_id, runDate, slotNo: PRE_MITENE_SLOT_NO, targets,
      maxPerCast: 50, requestedCount: null,
    });

    // g. クローズ
    await closeRun({ status: 'done', total_casts: totalCasts, total_sent: totalSent });
    console.log(tag + '完了 total_casts=' + totalCasts + ' total_sent=' + totalSent);
  } catch (e) {
    console.error(tag + 'エラー: ' + ((e && e.message) || e));
    await closeRun({ status: 'error', error: String((e && e.message) || e), total_casts: totalCasts, total_sent: totalSent });
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
}

// 毎分チェック本体。例外はここで握りつぶし、bot本体を絶対に落とさない。
// 旧 schedulerRunning（グローバル1本の直列化）は廃止: 1店舗の長時間実行が他店舗のグレース窓を
// 潰していたため、「実行中店舗のSet」に置き換え、tickは毎分必ず走らせて実行中でない店舗だけを起動する。
const runningStores = new Set();         // 自動送信を実行中の store_id（同一店舗の多重起動防止）
const AUTO_MITENE_STORE_CONCURRENCY = 3; // 同時に実行する店舗数の上限（VPSメモリ2GB考慮。超過分は空き待ちで順次処理）
let syncRunning = false;                 // 朝の自動同期の直列実行ガード（同期は従来どおり1本ずつ直列を維持）

async function autoMiteneTick() {
  if (!supabaseAdmin) return;
  try {
    const nowMs = Date.now();
    const nowJst = new Date(nowMs + 9 * 3600 * 1000); // JSTを明示計算（VPSのOSタイムゾーンに依存しない）
    const nowMin = nowJst.getUTCHours() * 60 + nowJst.getUTCMinutes();

    // ── 朝の自動同期（JST 06:00〜 グレース窓）──
    // 同期は従来どおり「1本ずつ直列」を維持する: グローバル直列の廃止に伴い、毎分のtickが
    // 同期を多重起動するとPuppeteerが店舗数ぶん並走してメモリを食い潰すため、専用フラグで直列化。
    // 二重実行自体はクレーム(slot_no=0)でも防がれるので、このフラグは多重Puppeteer防止のためだけにある。
    // 6:00台は送信スロット（9:05以降）と時間帯が離れており、直列でも9時までに余裕で完了する。
    const syncDiff = (nowMin - AUTO_SYNC_MIN + 1440) % 1440;
    if (syncDiff < AUTO_MITENE_GRACE_MIN && !syncRunning) {
      syncRunning = true;
      try {
        const { data: syncStores, error: ssErr } = await supabaseAdmin.from('settings')
          .select('store_id, shopdir, admin_id, admin_pass, pre_mitene_enabled, pre_mitene_days') // 先出勤ONの店舗はPW取得対象を明日以降にも広げる
          .eq('auto_sync_enabled', true);
        if (ssErr) {
          console.error('[auto-sync] settings取得失敗: ' + ssErr.message);
        } else {
          // run_date は発火予定時刻(6:00)の営業日で固定（送信スロットと同じ考え方）
          const syncRunDate = bizDateOf(nowMs - syncDiff * 60 * 1000);
          for (const st of (syncStores || [])) {
            // admin_id / admin_pass / shopdir が全て非空の店舗だけ実行
            if (!st.admin_id || !st.admin_pass || !st.shopdir) {
              console.warn('[auto-sync] ' + st.store_id + ': admin_id/admin_pass/shopdir 未設定のためスキップ（一括ミテネ画面でスケジュールを保存すると解消）');
              continue;
            }
            await runAutoSync(st, syncRunDate); // 店舗ごとに逐次
          }
        }
      } finally {
        syncRunning = false;
      }
    }

    // 発火対象ジョブを店舗ごとにグループ化（店舗間は並列・店舗内は時刻順に直列）。
    // job = { kind:'slot', slot, runDate, isFinalSlot, slotMin, shopdir }（通常スロット）または
    //       { kind:'pre', store, runDate, slotMin, shopdir }（先出勤ミテネ）。
    // 同一店舗が昼12時に通常スロットと先出勤の両方を持っていても、同じ店舗キューに入るため直列に実行される。
    const dueByStore = new Map(); // store_id → job[]
    const addJob = (storeId, job) => {
      if (!dueByStore.has(storeId)) dueByStore.set(storeId, []);
      dueByStore.get(storeId).push(job);
    };

    // ── 通常スロット: 自動送信ONの店舗（shopdirも同時に取得。settings.shopdir 列が無い場合はここでエラーになる
    // → ALTER TABLE settings ADD COLUMN shopdir ... の適用が必要）──
    const { data: stores, error: setErr } = await supabaseAdmin.from('settings')
      .select('store_id, shopdir').eq('auto_mitene_enabled', true);
    if (setErr) {
      console.error('[auto-mitene] settings取得失敗: ' + setErr.message); // 通常スロットだけ諦め、先出勤の判定は続行
    } else if (stores && stores.length > 0) {
      const shopdirByStore = new Map(stores.map((s) => [s.store_id, s.shopdir || '']));
      const { data: slots, error: schErr } = await supabaseAdmin.from('mitene_schedules')
        .select('store_id, slot_no, send_time, send_count')
        .eq('enabled', true)
        .in('store_id', stores.map((s) => s.store_id));
      if (schErr) {
        console.error('[auto-mitene] schedules取得失敗: ' + schErr.message);
      } else {
        // 店舗ごとの有効スロットの最遅時刻(分)。時刻上の最終スロットは send_count に関わらず「残り全部」で送る
        // （スロット取得は時刻で絞っていないため、その日の全有効スロットからここで最遅を計算できる）
        const latestMinByStore = new Map(); // store_id → 最遅 hmToMin
        (slots || []).forEach((s) => {
          const m = hmToMin(s.send_time);
          if (m == null) return;
          const cur = latestMinByStore.has(s.store_id) ? latestMinByStore.get(s.store_id) : -1;
          if (m >= cur) latestMinByStore.set(s.store_id, m);
        });

        for (const slot of (slots || [])) {
          const slotMin = hmToMin(slot.send_time);
          if (slotMin == null) continue;
          const isFinalSlot = slotMin === latestMinByStore.get(slot.store_id); // 同時刻タイは両方「最終」扱い（先行が使い切れば後続は本日完了スキップ）
          // 日跨ぎ対応の経過分数（例: スロット23:58を00:03に評価→diff=5）。グレース窓内だけ実行
          const diff = (nowMin - slotMin + 1440) % 1440;
          if (diff >= AUTO_MITENE_GRACE_MIN) continue;
          // run_date は「今回の発火時刻」の営業日で固定（現在時刻の営業日にすると
          // 05:5x のスロットを06:00過ぎに拾ったとき別営業日扱い＝二重実行になるため）
          const runDate = bizDateOf(nowMs - diff * 60 * 1000);
          addJob(slot.store_id, { kind: 'slot', slot, runDate, isFinalSlot, slotMin, shopdir: shopdirByStore.get(slot.store_id) || '' });
        }
      }
    }

    // ── 先出勤ミテネ: pre_mitene_enabled=true の店舗（JST 12:00 発火・グレース窓は通常スロットと共通）──
    // auto_mitene_enabled（通常スロットのマスターON/OFF）とは独立したトグル。
    // settings 取得に失敗しても通常スロット側には影響させない（逆も同様）。
    const preDiff = (nowMin - PRE_MITENE_MIN + 1440) % 1440;
    if (preDiff < AUTO_MITENE_GRACE_MIN) {
      const { data: preStores, error: preErr } = await supabaseAdmin.from('settings')
        .select('store_id, shopdir, pre_mitene_days').eq('pre_mitene_enabled', true);
      if (preErr) {
        console.error('[pre-mitene] settings取得失敗: ' + preErr.message);
      } else {
        // run_date は発火予定時刻(12:00)の営業日で固定（通常スロットと同じ考え方）
        const preRunDate = bizDateOf(nowMs - preDiff * 60 * 1000);
        for (const st of (preStores || [])) {
          addJob(st.store_id, { kind: 'pre', store: st, runDate: preRunDate, slotMin: PRE_MITENE_MIN, shopdir: st.shopdir || '' });
        }
      }
    }

    if (dueByStore.size === 0) return;

    // 実行中の店舗は「その店舗の分だけ」スキップ。busy時はクレームを消費しない設計（runAutoSlot/runPreMitene冒頭のpeek）
    // なので、窓内なら次のtickで自然に再試行される。起動する店舗はこの場で同期的に runningStores へ登録し、
    // 次のtickとの二重エントリを防ぐ（登録解除は各ワーカーのfinallyで必ず行われる）。
    const queue = [];
    for (const [storeId, jobs] of dueByStore) {
      if (runningStores.has(storeId)) {
        console.log('[auto-mitene] ' + storeId + ': 前の処理が実行中 → この分はスキップ');
        continue;
      }
      jobs.sort((a, b) => a.slotMin - b.slotMin); // 店舗内は時刻順に直列（同時刻タイは通常スロット→先出勤の順＝挿入順を維持）
      runningStores.add(storeId);
      queue.push({ storeId, jobs });
    }
    if (queue.length === 0) return;

    // 店舗間は最大 AUTO_MITENE_STORE_CONCURRENCY 店舗ずつ並列実行（ワーカープール方式）
    let qi = 0;
    const worker = async () => {
      while (qi < queue.length) {
        const { storeId, jobs } = queue[qi++];
        try {
          for (const job of jobs) {
            if (job.kind === 'pre') await runPreMitene(job.store, job.runDate, job.shopdir);
            else await runAutoSlot(job.slot, job.runDate, job.shopdir, job.isFinalSlot);
          }
        } catch (e) {
          console.error('[auto-mitene] ' + storeId + ' 実行例外: ' + ((e && e.message) || e));
        } finally {
          runningStores.delete(storeId); // 例外時も必ず解放（解放漏れ＝その店舗が永久スキップになるのを防ぐ）
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(AUTO_MITENE_STORE_CONCURRENCY, queue.length) }, () => worker()));
  } catch (e) {
    console.error('[auto-mitene] tick例外: ' + ((e && e.message) || e));
  }
}
if (supabaseAdmin) setInterval(autoMiteneTick, 60 * 1000);

app.listen(3000, () => console.log('Heaven Bot :3000'));
