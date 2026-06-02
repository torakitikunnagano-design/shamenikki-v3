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
async function dumpButtons(page) {
  return await page.$$eval('a, button, input[type=button], input[type=submit]', els =>
    els.map(e => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 30), txt: (e.textContent || e.value || '').trim().slice(0, 20), href: (e.getAttribute && e.getAttribute('href')) || '' }))
       .filter(o => /保存|プレビュー|投稿|戻る|公開|削除/.test(o.txt)));
}

app.post('/post', async (req, res) => {
  const { heavenId, heavenPass, title, body, imageBase64, imageType } = req.body || {};
  let browser, tmp;
  const log = (m) => console.log('[heaven-bot] ' + m);
  try {
    if (imageBase64) {
      const ext = (imageType && imageType.includes('png')) ? 'png' : 'jpg';
      tmp = path.join(os.tmpdir(), 'hv_' + Date.now() + '.' + ext);
      fs.writeFileSync(tmp, Buffer.from(String(imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      log('image saved');
    } else { log('NO image received'); }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(UA);

    log('login...');
    await page.goto('https://spgirl.cityheaven.net/J1Login.php', WAIT);
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation(WAIT)]);
    log('login done url=' + page.url());

    log('open diary page...');
    await page.goto('https://spgirl.cityheaven.net/J4KeitaiDiaryPost.php?gid=' + heavenId, WAIT);
    log('diary url=' + page.url());

    if (tmp) {
      log('upload image...');
      await page.waitForSelector('#picSelect', { timeout: 30000 });
      await (await page.$('#picSelect')).uploadFile(tmp);
      await new Promise(r => setTimeout(r, 8000));
      log('image uploaded');
    }

    log('set title...');
    await page.waitForSelector('#diaryTitle', { timeout: 30000 });
    await page.click('#diaryTitle');
    await page.type('#diaryTitle', title || '');

    log('set body...');
    await page.waitForFunction(() => window.CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.diary && CKEDITOR.instances.diary.status === 'ready', { timeout: 30000 });
    await page.evaluate((raw) => {
      const esc = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      CKEDITOR.instances.diary.setData(esc.replace(/\n/g, '<br>'));
      if (CKEDITOR.instances.diary.updateElement) CKEDITOR.instances.diary.updateElement();
    }, body || '');

    log('click preview...');
    await new Promise(r => setTimeout(r, 1500));
    log('BTNS=' + JSON.stringify(await dumpButtons(page)));
    let previewBtn = await findBtn(page, t => t.includes('プレビュー')) || await findBtn(page, t => t.includes('一時保存'));
    if (!previewBtn) throw new Error('preview button not found');
    const pinfo = await page.evaluate(el => ({ tag: el.tagName, cls: (el.className || '').toString(), href: el.getAttribute('href'), html: el.outerHTML.slice(0, 140) }), previewBtn);
    log('CLICKING=' + JSON.stringify(pinfo));
    await Promise.all([previewBtn.click(), page.waitForNavigation(WAIT)]);
    log('preview url=' + page.url());

    log('click post...');
    log('BTNS2=' + JSON.stringify(await dumpButtons(page)));
    let postBtn = await findBtn(page, t => t === '投稿') || await findBtn(page, t => t.includes('投稿') && t.length <= 4);
    if (!postBtn) throw new Error('post button not found');
    await Promise.all([postBtn.click(), page.waitForNavigation(WAIT)]);
    log('POSTED url=' + page.url());

    await browser.close();
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    res.json({ success: true, message: 'posted' });
  } catch (e) {
    log('ERROR: ' + e.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    if (tmp && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (_) {} }
    res.json({ success: false, message: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000, () => console.log('Heaven Bot :3000'));
