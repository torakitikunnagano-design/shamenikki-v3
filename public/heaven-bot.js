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

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000, () => console.log('Heaven Bot :3000'));
