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
      (anchors) => {
        const cleanName = (raw) => {
          return (raw || '')
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
// 【調査専用】ミテネ画面の「送るボタン」を正確に特定する（送信は一切しない）
// ============================================================
app.post('/mitene-recon', async (req, res) => {
  const { heavenId, heavenPass } = req.body || {};
  const mlog = (m) => console.log('[mitene-recon] ' + m);
  const result = { remaining: null, sendButtons: [], alreadySentCount: null, sendableCount: null, error: null, reachedStep: 0 };
  let browser;
  try {
    if (!heavenId || !heavenPass) {
      result.error = 'heavenId and heavenPass are required';
      return res.json(result);
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);

    // Step 1: ログイン
    mlog('login...');
    await page.goto('https://spgirl.cityheaven.net/J1Login.php', WAIT);
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation(WAIT)]);
    mlog('afterLogin url=' + page.url());
    result.reachedStep = 1;

    // Step 2: ミテネ画面へ直接 goto
    const miteneUrl = 'https://spgirl.cityheaven.net/J10ComeonVisitorList.php?gid=' + heavenId;
    mlog('goto mitene: ' + miteneUrl);
    await page.goto(miteneUrl, WAIT);
    await new Promise(r => setTimeout(r, 2000));
    mlog('mitene url=' + page.url() + ' title=' + (await page.title()));
    result.reachedStep = 2;

    // Step 3: DOM を一括解析（クリックなし）
    const recon = await page.evaluate(() => {
      // --- 残り回数を「残り回数：N/20」から数値 N で抽出 ---
      let remaining = null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        const m = t.match(/残り回数[：:]\s*(\d+)\s*[\/／]\d+/);
        if (m) { remaining = parseInt(m[1], 10); break; }
      }

      // --- 「ミテネを送る」とちょうど一致する要素を収集 ---
      // タグは限定せず全要素を対象にする（送るボタンが div/span + onclick の可能性に対応）。
      // 空白を除いて完全一致で判定する。
      const TARGET = 'ミテネを送る';
      const norm = (s) => (s || '').replace(/\s+/g, '').trim();
      const allMatches = Array.from(document.querySelectorAll('body *')).filter(el => {
        const txt = (el.tagName === 'INPUT') ? el.value : el.textContent;
        return norm(txt) === TARGET;
      });

      // --- 祖先を除外して「最も内側のクリック対象」だけを残す ---
      // 親要素は子のテキストをそのまま含むため同条件にマッチしてしまう（前回 22 件と
      // 過大計上された原因）。他のマッチ要素を内包する要素を捨て、リーフだけ残す。
      const leaves = allMatches.filter(el =>
        !allMatches.some(other => other !== el && el.contains(other))
      );

      // 近くの a.userpage から会員 uid を取得
      const uidOf = (el) => {
        // カードは a.userpage で囲まれている → まず closest で探す
        let up = el.closest('a.userpage');
        // 見つからなければ祖先を遡り、その配下の a.userpage を探す
        if (!up) {
          let cursor = el.parentElement;
          while (cursor && cursor !== document.body) {
            const cand = cursor.querySelector('a.userpage');
            if (cand) { up = cand; break; }
            cursor = cursor.parentElement;
          }
        }
        if (!up) return null;
        const hm = (up.getAttribute('href') || '').match(/[?&]uid=([^&]+)/);
        return hm ? hm[1] : null;
      };

      // --- 先頭 3 件の詳細 ---
      const sendButtons = leaves.slice(0, 3).map(el => ({
        tag: el.tagName,
        class: el.getAttribute('class') || null,
        href: el.getAttribute('href') || null,
        onclick: el.getAttribute('onclick') || null,
        outerHTML: el.outerHTML.slice(0, 300),
        uid: uidOf(el),
      }));

      // --- 既送信数：子要素を持たないリーフ要素で「本日ミテネ済」「送信済」を含むもの ---
      const alreadySentCount = Array.from(document.querySelectorAll('body *')).filter(el => {
        if (el.children.length > 0) return false;
        const t = el.textContent.trim();
        return t.includes('本日ミテネ済') || t.includes('送信済');
      }).length;

      // sendableCount = まだ送っていない（クリック可能な）「ミテネを送る」の数
      return { remaining, sendButtons, alreadySentCount, sendableCount: leaves.length };
    });

    result.remaining = recon.remaining;
    result.sendButtons = recon.sendButtons;
    result.alreadySentCount = recon.alreadySentCount;
    result.sendableCount = recon.sendableCount;
    result.reachedStep = 3;

    mlog('remaining=' + recon.remaining + ' sendable=' + recon.sendableCount + ' alreadySent=' + recon.alreadySentCount);
    recon.sendButtons.forEach((b, i) => mlog('  btn[' + i + '] tag=' + b.tag + ' uid=' + b.uid + ' href=' + b.href + ' onclick=' + b.onclick));

    await browser.close();
    mlog('done');
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
