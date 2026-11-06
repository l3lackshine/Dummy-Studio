'use strict';
// ทดสอบเกมจำลอง lib/preview.js: node test/test-preview.js <โฟลเดอร์ Dummy-Online> (หรือตั้ง DUMMY_ROOT)
// ต้องติดตั้งแพ็กเกจเซิร์ฟเวอร์ในโปรเจกต์ต้นทางแล้ว (server/node_modules) · ทดสอบบนสำเนาชั่วคราว ไม่แตะของจริง
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Preview = require('../lib/preview');

const source = process.argv[2] || process.env.DUMMY_ROOT;
if (!source) {
  console.log('ข้าม: ระบุโฟลเดอร์โปรเจกต์เป็นอาร์กิวเมนต์');
  process.exit(0);
}
if (!fs.existsSync(path.join(source, 'server', 'node_modules'))) {
  console.log('ข้าม: ยังไม่ได้ npm install ในโฟลเดอร์ server ของโปรเจกต์');
  process.exit(0);
}

let passed = 0;
const ok = message => {
  passed++;
  console.log('✓ ' + message);
};

// ขอแบบดิบ ไม่ให้ไลบรารีจัดพาธให้ (ต้องส่ง ../ ไปถึงเซิร์ฟเวอร์จริง ๆ เพื่อทดสอบการกัน)
function rawGet(url, rawPath) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: target.hostname, port: target.port, path: rawPath, method: 'GET' }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function copyProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-preview-'));
  fs.cpSync(source, tmp, { recursive: true, filter: s => !/node_modules|\.git$/.test(s) });
  fs.symlinkSync(path.join(path.resolve(source), 'server', 'node_modules'), path.join(tmp, 'server', 'node_modules'), 'junction');
  // .env ปลอม — พรีวิวต้องไม่อ่านไฟล์นี้ (ถ้าอ่าน /health จะบอก db: true)
  fs.writeFileSync(path.join(tmp, 'server', '.env'), 'SUPABASE_URL=https://example.invalid\nSUPABASE_SECRET_KEY=sb_secret_fake\n');
  return tmp;
}

async function main() {
  const tmp = copyProject();
  const logs = [];
  try {
    assert.strictEqual(Preview.isRunning(), false);
    const { url, gameUrl } = await Preview.startPreview(tmp, { onLog: text => logs.push(text) });
    assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url) && /^http:\/\/127\.0\.0\.1:\d+$/.test(gameUrl));
    assert(Preview.isRunning());
    ok('เริ่มเกมจำลองได้ (' + url + ')');

    const again = await Preview.startPreview(tmp);
    assert.strictEqual(again.url, url);
    ok('เรียกซ้ำได้ชุดเดิม ไม่เปิดเซิร์ฟเวอร์เพิ่ม');

    const health = JSON.parse((await rawGet(gameUrl, '/health')).body);
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.db, false);
    ok('เซิร์ฟเวอร์เกมรันแบบออฟไลน์ ไม่อ่าน server/.env (db: false)');

    const page = await rawGet(url, '/');
    assert.strictEqual(page.status, 200);
    assert(/text\/html/.test(page.type) && /<script/i.test(page.body));
    ok('เสิร์ฟหน้าเกม index.html');

    const config = await rawGet(url, '/config.js?v=1');
    assert(config.body.includes('"BACKEND_URL": "' + gameUrl + '"'));
    assert(config.body.includes('"SUPABASE_URL": ""') && !config.body.includes('supabase.co'));
    ok('config.js ถูกแทน: ชี้เซิร์ฟเวอร์ในเครื่อง + ปิดระบบบัญชี');

    const skins = await rawGet(url, '/skin/skins.json');
    assert.strictEqual(skins.status, 200);
    assert(/json/.test(skins.type));
    JSON.parse(skins.body);
    ok('เสิร์ฟไฟล์ข้อมูลเกม (skins.json)');

    const manifest = await rawGet(url, '/pack/manifest.json');
    assert.strictEqual(manifest.status, 404);
    const art = await rawGet(url, '/Assets/Character/boy/Character.webp');
    assert.strictEqual(art.status, 200);
    assert(/image\/webp/.test(art.type));
    ok('โหมดพัฒนา: ซ่อน manifest ของแพ็ก + เสิร์ฟรูปต้นฉบับจาก assets-src');

    for (const evil of ['/../server/package.json', '/%2e%2e/server/package.json', '/..%2f..%2fserver%2f.env', '/Assets/..%2f..%2f..%2fserver%2f.env', '/%E0%A4%A']) {
      const res = await rawGet(url, evil);
      assert.strictEqual(res.status, 404, evil);
      assert(!res.body.includes('sb_secret_fake'), evil);
    }
    ok('กันการอ่านไฟล์นอก client/public (../ และพาธเข้ารหัส)');

    const post = await new Promise((resolve, reject) => {
      const target = new URL(url);
      const req = http.request({ host: target.hostname, port: target.port, path: '/', method: 'POST' }, res => resolve(res.statusCode));
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(post, 405);
    ok('ไม่รับคำขอที่ไม่ใช่ GET/HEAD');

    assert.strictEqual(Preview.stopPreview(), true);
    assert.strictEqual(Preview.isRunning(), false);
    await new Promise(resolve => setTimeout(resolve, 300));
    await assert.rejects(rawGet(url, '/'));
    ok('ปิดแล้วเว็บเซิร์ฟเวอร์หยุดจริง');
  } finally {
    Preview.stopPreview();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ไม่มี node_modules → ต้องบอกผู้ใช้ให้ npm install ไม่ใช่ค้าง
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-preview-bare-'));
  try {
    fs.cpSync(source, bare, { recursive: true, filter: s => !/node_modules|\.git$/.test(s) });
    await assert.rejects(Preview.startPreview(bare), /npm install/);
    assert.strictEqual(Preview.isRunning(), false);
    ok('ยังไม่ติดตั้งแพ็กเกจ → แจ้งให้ npm install');
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }

  console.log('\nผ่านทั้งหมด ' + passed + ' ข้อ');
}

main().catch(err => {
  Preview.stopPreview();
  console.error(err);
  process.exit(1);
});
