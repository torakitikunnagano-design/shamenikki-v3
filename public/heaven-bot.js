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
// 【一時調査用】ミテネ画面の構造を調べる（送信は一切しない）
// ============================================================
app.post('/mitene-recon', async (req, res) => {
  const { heavenId, heavenPass } = req.body || {};
  const mlog = (m) => console.log('[mitene] ' + m);
  const result = {
    loginUrl: null,
    afterLoginUrl: null,
    afterLoginTitle: null,
    miteneLinks: [],
    mitenePageUrl: null,
    mitenePageTitle: null,
    remainingText: null,
    sendButtonCount: 0,
    sendButtonSample: null,
    bodyPreview: null,
    error: null,
    reachedStep: 0,
  };
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

    // Step 1: /post と同じログイン処理
    const loginUrl = 'https://spgirl.cityheaven.net/J1Login.php';
    result.loginUrl = loginUrl;
    mlog('goto login: ' + loginUrl);
    await page.goto(loginUrl, WAIT);
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation(WAIT)]);

    // Step 2: ログイン直後の URL と title
    result.afterLoginUrl = page.url();
    result.afterLoginTitle = await page.title();
    mlog('afterLogin url=' + result.afterLoginUrl + ' title=' + result.afterLoginTitle);
    result.reachedStep = 2;

    // Step 3: 「ミテネ」を含むリンク・ボタンを全収集
    const miteneLinks = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a, button, input[type=button], input[type=submit]').forEach(el => {
        const text = (el.textContent || el.value || '').trim();
        if (text.includes('ミテネ') || text.includes('みてね')) {
          items.push({
            tag: el.tagName,
            text,
            href: el.getAttribute('href') || null,
            onclick: el.getAttribute('onclick') || null,
          });
        }
      });
      return items;
    });
    result.miteneLinks = miteneLinks;
    mlog('miteneLinks count=' + miteneLinks.length);
    miteneLinks.forEach((l, i) => mlog('  [' + i + '] text=' + l.text + ' href=' + l.href + ' onclick=' + l.onclick));
    result.reachedStep = 3;

    // Step 4: 「ミテネできる会員を探す」または最初のミテネリンクへ遷移
    const target = miteneLinks.find(l => l.text.includes('探す') || l.text.includes('ミテネできる')) || miteneLinks[0];
    if (!target) {
      result.error = 'no mitene link found on top page';
      mlog('ERROR: ' + result.error);
      await browser.close();
      return res.json(result);
    }

    mlog('navigating to mitene page: href=' + target.href);
    if (target.href) {
      const href = target.href.startsWith('http') ? target.href : 'https://spgirl.cityheaven.net' + target.href;
      await page.goto(href, WAIT);
    } else {
      const el = await findBtn(page, t => t.includes('ミテネ'));
      if (el) await Promise.all([el.click(), page.waitForNavigation(WAIT).catch(() => {})]);
    }
    await new Promise(r => setTimeout(r, 2000));

    result.mitenePageUrl = page.url();
    result.mitenePageTitle = await page.title();
    mlog('mitenePage url=' + result.mitenePageUrl + ' title=' + result.mitenePageTitle);
    result.reachedStep = 4;

    // Step 5a: 残り回数テキストを探す
    const remainingText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (t && (t.includes('残り') || t.includes('ミテネ') || t.includes('回数'))) {
          hits.push(t.slice(0, 120));
        }
      }
      return hits.slice(0, 10);
    });
    result.remainingText = remainingText;
    mlog('remainingText=' + JSON.stringify(remainingText));

    // Step 5b: 「ミテネを送る」ボタン/リンクを調べる（クリックしない）
    const sendInfo = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, input[type=button], input[type=submit]'));
      const sends = els.filter(el => {
        const t = (el.textContent || el.value || '').trim();
        return t.includes('ミテネを送') || t.includes('ミテネ送');
      });
      const sample = sends[0] ? sends[0].closest('tr, li, div') : null;
      return {
        count: sends.length,
        sample: sample ? sample.innerHTML.slice(0, 800) : (sends[0] ? sends[0].outerHTML.slice(0, 400) : null),
        firstTag: sends[0] ? sends[0].tagName : null,
        firstClass: sends[0] ? sends[0].getAttribute('class') : null,
        firstHref: sends[0] ? sends[0].getAttribute('href') : null,
        firstOnclick: sends[0] ? sends[0].getAttribute('onclick') : null,
      };
    });
    result.sendButtonCount = sendInfo.count;
    result.sendButtonSample = sendInfo;
    mlog('sendButtons count=' + sendInfo.count + ' tag=' + sendInfo.firstTag + ' href=' + sendInfo.firstHref);

    // Step 5c: body テキストプレビュー
    const bodyPreview = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 500));
    result.bodyPreview = bodyPreview;
    mlog('bodyPreview=' + bodyPreview.slice(0, 200));
    result.reachedStep = 5;

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
