const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WAIT = { waitUntil: 'domcontentloaded', timeout: 60000 };

// キャスト同期で取り込む上位N名（ヘブンのキャスト一覧の掲載順・先頭から）。退店者が大量に残る店舗対策。
// NADESHIKO は名簿70名で上限未満なので影響なし。あとで変えたいときはこの数値だけ変更する。
const CAST_SYNC_LIMIT = 100;

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
  let browser, tmp, posted = false;
  const log = (m) => console.log('[heaven-bot] ' + m);
  try {
    if (imageBase64) {
      const ext = (imageType && imageType.includes('png')) ? 'png' : 'jpg';
      tmp = path.join(os.tmpdir(), 'hv_' + Date.now() + '.' + ext);
      fs.writeFileSync(tmp, Buffer.from(String(imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
  }
});

// ============================================================
// 店舗管理からキャスト一覧を吸い上げる
// ============================================================
app.post('/store-sync', async (req, res) => {
  const { adminId, adminPass, shopdir } = req.body || {};
  let browser;
  try {
    if (!adminId || !adminPass || !shopdir) {
      return res.json({ ok: false, error: 'adminId, adminPass, shopdir are required' });
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
      (anchors, limit) => {
        // ヘブン表示は「名前」の後に必ず半角/全角スペース＋装飾(「新人🔰」「No2 本指名」等)。
        // 最初の半角/全角スペースより前だけを名前として採用する。
        const cleanName = (raw) => {
          return (raw || '').trim().split(/[\s　]/)[0] || '';
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
        // 掲載順（Map の挿入順）の先頭から limit 名だけ返す
        return Array.from(map.values()).slice(0, limit);
      },
      CAST_SYNC_LIMIT
    );

    console.log('[store-sync] casts=' + casts.length + ' (limit ' + CAST_SYNC_LIMIT + ')');

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
  }
});

// ============================================================
// 【本番】ミテネ自動送信（registComeon を a.kitene_send_btn__text_wrapper のクリックで発火）
//  - 人間らしいランダム待機を挟む / max は絶対に超えない / 二重送信しない
// ============================================================
// タブの優先順位（テキストで指定）。上から順に巡回して送る。
const TAB_PRIORITY = ['マッチ率', '口コミ', 'マイガール'];

app.post('/mitene', async (req, res) => {
  const { heavenId, heavenPass, max } = req.body || {};
  const mlog = (m) => console.log('[mitene] ' + m);
  const result = { ok: false, sent: 0, sentUids: [], remainingBefore: null, remainingAfter: null, byTab: {}, error: null, reachedStep: 0 };
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
      return res.json(result);
    }
    // max を 0 以上の整数に正規化（未指定は null）
    let maxN = null;
    if (max !== undefined && max !== null && max !== '') {
      maxN = parseInt(max, 10);
      if (!Number.isFinite(maxN) || maxN < 0) maxN = 0;
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
    res.json(result);
  } catch (e) {
    mlog('ERROR at step=' + result.reachedStep + ': ' + e.message);
    result.error = e.message;
    if (browser) { try { await browser.close(); } catch (_) {} }
    res.json(result);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000, () => console.log('Heaven Bot :3000'));
