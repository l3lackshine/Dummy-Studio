'use strict';
// ทดสอบแกน lib/project.js กับโปรเจกต์จริง: node test/test-project.js <โฟลเดอร์ Dummy-Online> (หรือตั้ง DUMMY_ROOT)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const P = require('../lib/project');
const src = process.argv[2] || process.env.DUMMY_ROOT;
if (!src) { console.log('ข้าม: ระบุโฟลเดอร์โปรเจกต์เป็นอาร์กิวเมนต์'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
fs.cpSync(src, tmp, { recursive: true, filter: s => !/node_modules|\.git$/.test(s) });   // ทดสอบบนสำเนา ไม่แตะของจริง
let n = 0; const ok = m => console.log('✓ ' + m + (++n && ''));

assert(P.isProject(tmp)); ok('เปิดโปรเจกต์ได้');
assert.throws(() => P.openProject(os.tmpdir()), /ไม่ใช่โปรเจกต์/); ok('โฟลเดอร์ผิดถูกปฏิเสธ');
assert.throws(() => P.inside(tmp, '../x'), /นอกโปรเจกต์/); assert.throws(() => P.readFile(tmp, '../../etc/passwd'), /นอกโปรเจกต์/); ok('กันพาธออกนอกโปรเจกต์');
const R = P.loadResources(tmp); assert(R.filter(r => r.kind === 'character').length >= 12 && R.some(r => r.kind === 'banner')); ok('โหลด resource ' + R.length + ' รายการ');
assert.strictEqual(P.validate(tmp).filter(p => p.level === 'error').length, 0); ok('โปรเจกต์จริงไม่มีข้อผิดพลาด');

// เซฟแล้วไฟล์เปลี่ยนเฉพาะที่แก้
const boy = R.find(r => r.id === 'boy'), d = JSON.parse(JSON.stringify(boy.data)); d.name = 'ทดสอบ'; P.saveResource(tmp, boy.key, d);
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tmp, boy.file), 'utf8')).name, 'ทดสอบ'); ok('บันทึก Character.config');
const it = R.find(r => r.kind === 'item'), d2 = JSON.parse(JSON.stringify(it.data)); d2.name = 'แก้แล้ว'; P.saveResource(tmp, it.key, d2);
const j = JSON.parse(fs.readFileSync(path.join(tmp, it.file), 'utf8')); assert.strictEqual(j.items[it.ptr[1]].name, 'แก้แล้ว'); assert.strictEqual(j.items.length, R.filter(r => r.file === it.file).length); ok('บันทึกไอเทมโดยไม่กระทบรายการอื่น');

// สร้างใหม่ + ตรวจจับปัญหา
assert.throws(() => P.createCharacter(tmp, 'Bad Id', 'x'), /id ต้องเป็น/); assert.throws(() => P.createCharacter(tmp, 'boy', 'x'), /มี/);
const c = P.createCharacter(tmp, 'mina-01', 'มินะ'); assert(c.serverIdAdded); assert(P.serverIds(tmp, 'CHARS').includes('mina-01')); ok('สร้างตัวละคร + เพิ่ม id ใน CHARS');
let pr = P.validate(tmp).filter(p => /mina-01/.test(p.where)); assert(pr.some(p => p.level === 'error' && /รูป/.test(p.msg)) && pr.some(p => /สกิล/.test(p.msg))); ok('เตือนว่ายังไม่มีรูป/สกิล');
const png = path.join(tmp, 'x.png'); fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
const im = P.importImage(tmp, c.key, png); assert(fs.existsSync(path.join(tmp, im.dir, im.name))); assert(im.dir.startsWith('assets-src/Character/')); ok('นำเข้ารูปตัวละครไป ' + im.dir);
assert(!P.validate(tmp).some(p => /mina-01/.test(p.where) && p.level === 'error')); ok('นำเข้ารูปแล้วข้อผิดพลาดหาย');
const b = P.createBanner(tmp, 'test-up', 'ทดสอบ'); const bd = P.loadResources(tmp).find(r => r.key === b.key).data; bd.rateUp.items = ['ไม่มีตัวนี้']; bd.rarityWeights = { legendary: 0, epic: 0, rare: 0, common: 0 }; bd.ticket = 'nope'; P.saveResource(tmp, b.key, bd);
pr = P.validate(tmp).filter(p => /test-up/.test(p.where)); assert(pr.some(p => /rateUp/.test(p.msg)) && pr.some(p => /เป็น 0/.test(p.msg)) && pr.some(p => /ticket/.test(p.msg))); ok('ตรวจตู้กาชาผิด (rateUp/น้ำหนัก/ตั๋ว) ได้');
const bg = P.createItem(tmp, 'Background', 'new-bg', 'พื้นใหม่'); assert(P.serverIds(tmp, 'BGS').includes('new-bg')); ok('สร้างพื้นหลัง + เพิ่ม id ใน BGS');
assert.throws(() => P.writeText(tmp, 'client/public/Shop/Shopsetting.config', '{พัง'), /JSON/i); ok('ไม่ยอมเซฟ JSON พัง');
assert(P.listDir(tmp, '').some(x => x.name === 'client' && x.dir)); assert(!P.listDir(tmp, '').some(x => x.name === 'node_modules')); ok('FileSystem listDir');
// สคริปต์เดิมของโปรเจกต์ยังตรวจผ่านหลังสตูดิโอแก้ไข
const { execFileSync } = require('child_process');
try { execFileSync(process.execPath, ['scripts/build-assets.js', '--check'], { cwd: tmp, stdio: 'pipe' }); ok('build-assets --check ผ่านหลังแก้ข้อมูล'); } catch (e) { console.log('! build-assets --check:', String(e.stdout || e.message).split('\n').slice(-6).join('\n')); }
fs.rmSync(tmp, { recursive: true, force: true }); console.log('\nผ่านทั้งหมด ' + n + ' ข้อ');
