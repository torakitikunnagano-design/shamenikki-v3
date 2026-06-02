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

app.post('/post', async (req, res) => {
  const { heavenId, heavenPass, title, body, imageBase64, imageType } = req.body || {};
  let browser, tmp;
  try {
    if (imageBase64) {
      const ext = (imageType && imageType.includes('png')) ? 'png' : 'jpg';
      tmp = path.join(os.tmpdir(), 'hv_' + Date.now() + '.' + ext);
      fs.writeFileSync(tmp, Buffer.from(String(imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    }

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(UA);

    // login
    await page.goto('https://spgirl.cityheaven.net/J1Login.php', { waitUntil: 'networkidle2' });
    await page.type('input[name="txt_account"]', heavenId);
    await page.type('input[name="txt_password"]', heavenPass);
    await Promise.all([page.click('input[type="submit"]'), page.waitForNavigation({ waitUntil: 'networkidle2' })]);

    // diary write page
    await page.goto('https://spgirl.cityheaven.net/J4KeitaiDiaryPost.php?gid=' + heavenId, { waitUntil: 'networkidle2' });

    // image (cityheaven requires one)
    if (tmp) {
      await page.waitForSelector('#picSelect', { timeout: 20000 });
      const input = await page.$('#picSelect');
      await input.uploadFile(tmp);
      await new Promise(r => setTimeout(r, 8000));
    }

    // title
    await page.waitForSelector('#diaryTitle', { timeout: 20000 });
    await page.click('#diaryTitle');
    await page.type('#diaryTitle', title || '');

    // body via CKEditor
    await page.waitForFunction(() => window.CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.diary && CKEDITOR.instances.diary.status === 'ready', { timeout: 20000 });
    await page.evaluate((raw) => {
      const esc = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      CKEDITOR.instances.diary.setData(esc.replace(/\n/g, '<br>'));
      if (CKEDITOR.instances.diary.updateElement) CKEDITOR.instances.diary.updateElement();
    }, body || '');

    // click 一時保存&プレビュー
    await new Promise(r => setTimeout(r, 1500));
    await Promise.all([
      page.evaluate(() => {
        const a = [...document.querySelectorAll('a.button_top_menu')].find(e => /一時保存|プレビュー/.test(e.textContent));
        if (a) a.click();
      }),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // preview page -> click 投稿
    await page.waitForFunction(() => [...document.querySelectorAll('a.button_top_menu')].some(e => e.textContent.trim() === '投稿'), { timeout: 20000 });
    await Promise.all([
      page.evaluate(() => {
        const a = [...document.querySelectorAll('a.button_top_menu')].find(e => e.textContent.trim() === '投稿');
        if (a) a.click();
      }),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    await browser.close();
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    res.json({ success: true, message: 'posted' });
  } catch (e) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    if (tmp && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (_) {} }
    res.json({ success: false, message: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000, () => console.log('Heaven Bot :3000'));
