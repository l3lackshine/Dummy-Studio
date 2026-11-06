'use strict';
// ทดสอบหน้าต่างด้วยเบราว์เซอร์จริง (Playwright) โดยจำลอง window.studio ให้ต่อกับ lib จริงบนสำเนาโปรเจกต์
// ใช้: node test/ui-smoke.js <โฟลเดอร์โปรเจกต์> [โฟลเดอร์เก็บภาพ]   (ต้องติดตั้ง playwright ไว้)
const fs = require('fs'), os = require('os'), path = require('path');
const P = require('../lib/project'), Runner = require('../lib/runner');
const Preview = require('../lib/preview');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const src = process.argv[2], shots = process.argv[3] || path.join(os.tmpdir(), 'studio-shots'); if (!src) { console.log('ระบุโฟลเดอร์โปรเจกต์'); process.exit(0); }
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ui-')); fs.cpSync(src, tmp, { recursive: true, filter: s => !/node_modules|\.git$/.test(s) });
const png = path.join(tmp, 'pick.png'); fs.writeFileSync(png, fs.readFileSync(path.join(tmp, 'assets-src/Assets/Character/boy/Character.webp')));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });   // รูปที่ยังไม่มีไฟล์เป็นเรื่องปกติ
  const handlers = {
    pick: () => tmp, open: p => P.openProject(p), resources: () => P.loadResources(tmp), validate: () => P.validate(tmp), listDir: r => P.listDir(tmp, r), readFile: r => P.readFile(tmp, r), writeText: (r, t) => P.writeText(tmp, r, t),
    save: (k, d) => P.saveResource(tmp, k, d), newCharacter: (i, n) => P.createCharacter(tmp, i, n), newBanner: (i, n) => P.createBanner(tmp, i, n), newItem: (k, i, n) => P.createItem(tmp, k, i, n), importImage: k => P.importImage(tmp, k, png),
    // เกมจำลอง: ใช้ lib จริง แล้วแจ้งสถานะกลับหน้าต่างเหมือน main.js
    preview: async () => {
      const result = await Preview.startPreview(tmp, { onLog: text => emit('run:data', { text }) });
      emit('preview:state', { open: true });
      return result;
    },
    previewReload: () => true,
    previewStop: () => {
      Preview.stopPreview();
      emit('preview:state', { open: false });
      return true;
    },
    run: kind => Runner.runTask(tmp, kind, (ev, d) => page.evaluate(([e, x]) => (window.__ev[e] || []).forEach(f => f(x)), [ev, d]).catch(() => {})), stop: () => Runner.stop(),
  };
  function emit(eventName, data) {
    page.evaluate(([e, x]) => (window.__ev[e] || []).forEach(f => f(x)), [eventName, data]).catch(() => {});
  }
  await page.exposeFunction('__call', async (n, ...a) => { if (!handlers[n]) throw new Error('no ' + n); return handlers[n](...a); });
  await page.addInitScript(() => { window.__ev = {}; window.studio = { call: (n, ...a) => window.__call(n, ...a).catch(e => { throw new Error(String(e.message).replace(/^.*Error: /, '')); }), on: (e, cb) => { (window.__ev[e] = window.__ev[e] || []).push(cb); return () => {}; } }; });
  const ok = (c, m) => { if (!c) { console.log('✘', m); errors.push(m); } else console.log('✓', m); };
  await page.goto('file://' + path.resolve(__dirname, '../renderer/index.html')); await page.waitForTimeout(300);
  ok(await page.locator('.welcome').count() === 1, 'หน้าต้อนรับแสดง'); await page.screenshot({ path: shots + '/1-welcome.png' });
  await page.getByText('เปิดโฟลเดอร์โปรเจกต์').click(); await page.waitForSelector('.main'); await page.waitForTimeout(300);
  ok(await page.locator('#app .dock .tn').count() > 12, 'โหลดรายการ resource'); 
  await page.locator('.tn', { hasText: 'ซากุยะ' }).first().click(); await page.waitForSelector('#stage img'); await page.waitForTimeout(400);
  ok(await page.locator('#stage img').evaluate(i => i.naturalWidth > 0), 'รูปตัวละครจาก assets-src แสดงได้'); await page.screenshot({ path: shots + '/2-character.png' });
  // แก้ค่า → dirty → บันทึก
  const price = page.locator('.insp .row', { hasText: /^price/ }).locator('input'); await price.fill('3500');
  ok(await page.locator('.tab .dot').count() === 1, 'แก้แล้วแท็บมีจุด ●'); await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
  ok(JSON.parse(fs.readFileSync(path.join(tmp, 'client/public/Assets/Character/sakuya-ssr/Character.config'), 'utf8')).price === 3500, 'Ctrl+S เขียนไฟล์จริง');
  // ตู้กาชา
  await page.getByRole('button', { name: /ร้านค้า/ }).click(); await page.locator('.tn', { hasText: 'ราชินีไพ่' }).first().click(); await page.waitForSelector('.rates'); await page.waitForTimeout(300);
  ok((await page.locator('.rates').innerText()).includes('%'), 'ตารางเรตกาชาแสดง'); await page.screenshot({ path: shots + '/3-banner.png' });
  // สร้างตัวละครใหม่ผ่านโมดอล → ปัญหาแสดง → นำเข้ารูป
  await page.getByRole('button', { name: /ตัวละคร$/ }).first().click();
  await page.getByText('Data', { exact: true }).click(); await page.getByText('ตัวละครใหม่…').click(); const inp = page.locator('.modal input'); await inp.nth(0).fill('mina-01'); await inp.nth(1).fill('มินะ'); await page.getByRole('button', { name: 'ตกลง' }).click(); await page.waitForTimeout(600);
  ok(fs.existsSync(path.join(tmp, 'client/public/Assets/Character/mina-01/Character.config')), 'สร้างตัวละครใหม่ได้'); ok(await page.locator('.ihead + div .lvl-err').count() >= 1, 'Inspector เตือนข้อผิดพลาดของตัวละครใหม่');
  await page.getByRole('button', { name: /นำเข้ารูป/ }).click(); await page.waitForTimeout(700); ok(fs.existsSync(path.join(tmp, 'assets-src/Assets/Character/mina-01/Character.png')), 'นำเข้ารูปแล้วไฟล์อยู่ assets-src'); await page.screenshot({ path: shots + '/4-new-char.png' });
  // แผงล่าง
  await page.getByRole('button', { name: /Check/ }).click(); await page.waitForSelector('.log', { timeout: 15000 }); await page.waitForFunction(() => document.querySelector('.log').innerText.includes('—'), null, { timeout: 15000 });
  ok(/build-assets/.test(await page.locator('.log').innerText()), 'Check แสดงผลใน Output');
  await page.getByRole('button', { name: /Test$/ }).click(); await page.waitForFunction(() => /ผ่าน \d+/.test(document.querySelector('.sum') ? document.querySelector('.sum').innerText : ''), null, { timeout: 120000 });
  ok(await page.locator('.trow').count() >= 10, 'Test Runner แสดงรายการเทสต์'); await page.screenshot({ path: shots + '/5-tests.png' });
  await page.getByRole('button', { name: /Problems/ }).click(); await page.screenshot({ path: shots + '/6-problems.png' });
  // เปิดไฟล์จาก FileSystem
  await page.locator('.tn', { hasText: 'server' }).first().click(); await page.waitForTimeout(300); ok(await page.locator('.left .tn').count() > 8, 'FileSystem ขยายโฟลเดอร์ได้');
  await checkPreviewButton(page, ok);
  Preview.stopPreview();
  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(errors.length ? '\n✘ พบข้อผิดพลาด ' + errors.length + ' รายการ:\n' + errors.join('\n') : '\nUI smoke test ผ่านทั้งหมด'); process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✘', e.message); process.exit(1); });

// ปุ่ม 🎮 เกมจำลอง: เปิดได้ สถานะปุ่มเปลี่ยน และปิดได้จากเมนู Tools
// (ต้องมี server/node_modules ในโปรเจกต์ต้นทาง — ถ้าไม่มี ข้ามแต่บอกไว้)
async function checkPreviewButton(page, ok) {
  const source = path.join(path.resolve(src), 'server', 'node_modules');
  if (!fs.existsSync(source)) {
    console.log('- ข้ามเทสเกมจำลอง: ยังไม่ได้ npm install ในโฟลเดอร์ server');
    return;
  }
  fs.symlinkSync(source, path.join(tmp, 'server', 'node_modules'), 'junction');

  await page.getByRole('button', { name: /เกมจำลอง/ }).click();
  await page.waitForFunction(() => /เกมเปิดอยู่/.test(document.querySelector('#runbar').textContent), null, { timeout: 25000 });
  ok(true, 'ปุ่มเกมจำลองเปิดเซิร์ฟเวอร์ได้ และปุ่มเปลี่ยนเป็น "เกมเปิดอยู่"');
  ok(/พรีวิวพร้อม/.test(await page.locator('.log').textContent()), 'Output แสดงที่อยู่เกมจำลอง');
  await page.screenshot({ path: shots + '/5-preview-on.png' });

  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('button', { name: /ปิดเกมจำลอง/ }).click();
  await page.waitForTimeout(300);
  ok(/🎮 เกมจำลอง/.test(await page.locator('#runbar').textContent()) && !Preview.isRunning(), 'ปิดเกมจำลองจากเมนู Tools ได้');
}
