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
app.post('/store-sync', async (req, res) => {
  const { adminId, adminPass, shopdir, mode } = req.body || {};
  const lockKey = shopdir ? 'shop:' + shopdir : null; // 店舗キー=管理shopdir
  if (lockKey) {
    if (storeLocks.has(lockKey)) return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかの処理を実行中です。少し待ってからもう一度お試しください。' });
    storeLocks.set(lockKey, true);
  }
  let browser;
  try {
    if (!adminId || !adminPass || !shopdir) {
      return res.json({ ok: false, error: 'adminId, adminPass, shopdir are required' });
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
    res.json({ ok: true, casts, shifts: allShifts });
  } catch (e) {
    console.log('[store-sync] ERROR: ' + e.message);
    res.json({ ok: false, error: e.message });
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
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
app.post('/mitene-creds', async (req, res) => {
  const { adminId, adminPass, shopdir, memberIds } = req.body || {};
  const lockKey = shopdir ? 'shop:' + shopdir : null; // 店舗キー=管理shopdir
  if (lockKey) {
    if (storeLocks.has(lockKey)) return res.status(409).json({ ok: false, error: 'busy', message: 'この店舗は現在ほかの処理を実行中です。少し待ってからもう一度お試しください。' });
    storeLocks.set(lockKey, true);
  }
  let browser;
  try {
    if (!adminId || !adminPass || !shopdir || !Array.isArray(memberIds)) {
      return res.json({ ok: false, error: 'adminId, adminPass, shopdir, memberIds are required' });
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
    res.json({ ok: true, creds });
  } catch (e) {
    console.log('[mitene-creds] ERROR: ' + e.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    res.json({ ok: false, error: e.message });
  } finally {
    if (lockKey) storeLocks.delete(lockKey);
  }
});

// ============================================================
// 【read-only】ミテネ残数チェック（送信しない）
//  - registComeon クリック等の送信系は一切呼ばない（絶対に送らない）。
//  - 戻り値: { ok, remaining, usedUp }（remaining=数値 or null、usedUp=boolean）
// ============================================================
app.post('/mitene-status', async (req, res) => {
  const { heavenId, heavenPass } = req.body || {};
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
      return res.json(result);
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
    res.json(result);
  } catch (e) {
    slog('ERROR: ' + e.message);
    result.error = e.message;
    if (browser) { try { await browser.close(); } catch (_) {} }
    res.json(result);
  }
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
//      1) mitene_auto_runs の UNIQUE(store_id, run_date, slot_no) を INSERT でクレーム（再起動・多重プロセスに耐える）
//      2) schedulerRunning フラグ（前の分の処理が長引いたら次の分はスキップ）
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

const AUTO_MITENE_GRACE_MIN = 10; // グレース窓: send_time から10分以内なら実行（bot停止からの復帰で拾う）

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

// 1スロットぶんの実行（クレーム→ロック→対象抽出→逐次送信→ログ→クローズ）
async function runAutoSlot(slot, runDate, shopdir) {
  const tag = '[auto-mitene] ' + slot.store_id + ' slot' + slot.slot_no + ' (' + runDate + ') ';

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
  console.log(tag + '開始 runId=' + runId + ' send_count=' + (slot.send_count == null ? '残り全部(max50)' : slot.send_count));

  const closeRun = async (patch) => {
    const { error } = await supabaseAdmin.from('mitene_auto_runs')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) console.error(tag + 'run更新失敗: ' + error.message);
  };

  // c. 手動一括ミテネと同じ店舗ロック（'bulkmitene:'+shopdir、TTL方式）。
  //    手動が実行中なら status='error'/'busy' で閉じて今回はスキップ（次のスロットで再挑戦される）。
  let lockKey = null;
  if (shopdir) {
    lockKey = 'bulkmitene:' + shopdir;
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
    // d. 対象キャスト抽出: shifts（store_id × 営業日）→ casts（heaven_id / heaven_pass あり）
    const { data: shiftRows, error: shErr } = await supabaseAdmin.from('shifts')
      .select('cast_name').eq('store_id', slot.store_id).eq('date', runDate);
    if (shErr) throw new Error('shifts取得失敗: ' + shErr.message);
    const names = Array.from(new Set((shiftRows || []).map((r) => r.cast_name).filter(Boolean)));
    if (names.length === 0) {
      console.log(tag + '営業日=' + runDate + ' の出勤者0人のためスキップ');
      await closeRun({ status: 'done', total_casts: 0, total_sent: 0 });
      return;
    }
    const { data: castRows, error: caErr } = await supabaseAdmin.from('casts')
      .select('name, heaven_id, heaven_pass').eq('store_id', slot.store_id).in('name', names);
    if (caErr) throw new Error('casts取得失敗: ' + caErr.message);

    const targets = castRows || [];
    totalCasts = targets.length;
    // 実行開始ログ: 営業日（6時切替）と対象人数の根拠を1行で明示（例: 営業日=2026-08-13(6時切替) 対象=15人(8/13出勤)）
    const mdParts = runDate.split('-');
    const mdLabel = (+mdParts[1]) + '/' + (+mdParts[2]);
    console.log('[auto-mitene] ' + slot.store_id + ' slot' + slot.slot_no + ' 開始: 営業日=' + runDate + '(6時切替) 対象=' + totalCasts + '人(' + mdLabel + '出勤)');
    const maxPerCast = (slot.send_count == null) ? 50 : slot.send_count; // NULL=残り全部（姫デコの日次上限50で頭打ち）

    // e/f. 1人ずつ逐次送信し、1人ごとにログを残す
    for (const c of targets) {
      const logRow = {
        run_id: runId, store_id: slot.store_id, run_date: runDate, slot_no: slot.slot_no,
        cast_name: c.name, heaven_id: c.heaven_id || '', requested_count: slot.send_count,
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
            const r = await runMiteneSend(c.heaven_id, c.heaven_pass, maxPerCast);
            logRow.ok = !!r.ok;
            logRow.sent_count = r.sent || 0;
            logRow.remaining_after = (typeof r.remainingAfter === 'number') ? r.remainingAfter : null;
            logRow.error = r.ok ? null : (r.error || 'unknown');
            totalSent += logRow.sent_count;
            console.log(tag + c.name + ': sent=' + logRow.sent_count + (r.ok ? '' : ' error=' + logRow.error));
          } finally {
            storeLocks.delete(castLock);
          }
        }
      }
      const { error: logErr } = await supabaseAdmin.from('mitene_auto_logs').insert(logRow);
      if (logErr) console.error(tag + 'ログ保存失敗(' + c.name + '): ' + logErr.message);
    }

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
let schedulerRunning = false;
async function autoMiteneTick() {
  if (!supabaseAdmin) return;
  if (schedulerRunning) { console.log('[auto-mitene] 前の分の処理が実行中 → この分はスキップ'); return; }
  schedulerRunning = true;
  try {
    const nowMs = Date.now();
    const nowJst = new Date(nowMs + 9 * 3600 * 1000); // JSTを明示計算（VPSのOSタイムゾーンに依存しない）
    const nowMin = nowJst.getUTCHours() * 60 + nowJst.getUTCMinutes();

    // 自動送信ONの店舗（shopdirも同時に取得。settings.shopdir 列が無い場合はここでエラーになる
    // → ALTER TABLE settings ADD COLUMN shopdir ... の適用が必要）
    const { data: stores, error: setErr } = await supabaseAdmin.from('settings')
      .select('store_id, shopdir').eq('auto_mitene_enabled', true);
    if (setErr) { console.error('[auto-mitene] settings取得失敗: ' + setErr.message); return; }
    if (!stores || stores.length === 0) return; // ONの店舗なし（ログも出さず静かに終了）

    const shopdirByStore = new Map(stores.map((s) => [s.store_id, s.shopdir || '']));
    const { data: slots, error: schErr } = await supabaseAdmin.from('mitene_schedules')
      .select('store_id, slot_no, send_time, send_count')
      .eq('enabled', true)
      .in('store_id', stores.map((s) => s.store_id));
    if (schErr) { console.error('[auto-mitene] schedules取得失敗: ' + schErr.message); return; }

    for (const slot of (slots || [])) {
      const slotMin = hmToMin(slot.send_time);
      if (slotMin == null) continue;
      // 日跨ぎ対応の経過分数（例: スロット23:58を00:03に評価→diff=5）。グレース窓内だけ実行
      const diff = (nowMin - slotMin + 1440) % 1440;
      if (diff >= AUTO_MITENE_GRACE_MIN) continue;
      // run_date は「今回の発火時刻」の営業日で固定（現在時刻の営業日にすると
      // 05:5x のスロットを06:00過ぎに拾ったとき別営業日扱い＝二重実行になるため）
      const runDate = bizDateOf(nowMs - diff * 60 * 1000);
      await runAutoSlot(slot, runDate, shopdirByStore.get(slot.store_id) || '');
    }
  } catch (e) {
    console.error('[auto-mitene] tick例外: ' + ((e && e.message) || e));
  } finally {
    schedulerRunning = false;
  }
}
if (supabaseAdmin) setInterval(autoMiteneTick, 60 * 1000);

app.listen(3000, () => console.log('Heaven Bot :3000'));
