'use strict';
// lib/project.js — แกนอ่าน/เขียน/ตรวจข้อมูลโปรเจกต์ Dummy Online (ไม่พึ่ง Electron ทดสอบด้วย node ล้วนได้)
const fs = require('fs'), path = require('path');
const PUB = 'client/public';
const ITEM_DIRS = ['Theme', 'Table', 'Background', 'Card', 'Dock', 'CardBack', 'Frame'];
const ITEM_KIND = { Theme: 'themes', Table: 'tables', Background: 'backgrounds', Card: 'cards', Dock: 'docks', CardBack: 'backs', Frame: 'frames' };
const SETTINGS = [['Shop settings', 'Shop/Shopsetting.config'], ['Gacha settings', 'Shop/Gasha/gasha.config'], ['UI config', 'UI/ui.config'], ['Sounds config', 'Sounds/sounds.config']];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const IMG_RE = /\.(png|webp|jpg|jpeg|gif|svg)$/i;

const exists = p => fs.existsSync(p);
const readText = p => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const readJson = (p, fb = null) => { try { return JSON.parse(readText(p)); } catch (e) { return fb; } };
const dirs = p => (exists(p) ? fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : []);
const posix = p => p.split(path.sep).join('/');
const clone = o => JSON.parse(JSON.stringify(o));

function isProject(root) { return !!root && exists(path.join(root, PUB, 'index.html')) && exists(path.join(root, 'server', 'package.json')); }
// กันเขียนนอกโฟลเดอร์โปรเจกต์ (../ และพาธแปลก ๆ)
function inside(root, rel) {
  const r = path.resolve(root), t = path.resolve(r, String(rel || ''));
  if (t !== r && !t.startsWith(r + path.sep)) throw new Error('พาธอยู่นอกโปรเจกต์: ' + rel);
  return t;
}
function writeJson(root, rel, data) {
  const t = inside(root, rel); fs.mkdirSync(path.dirname(t), { recursive: true });
  const tmp = t + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n'); fs.renameSync(tmp, t);
}

// ---------- FileSystem dock ----------
const HIDE = new Set(['node_modules', '.git', 'dist']);
function listDir(root, rel) {
  const t = inside(root, rel || '');
  return fs.readdirSync(t, { withFileTypes: true }).filter(d => !HIDE.has(d.name) && !d.name.endsWith('.tmp'))
    .map(d => ({ name: d.name, dir: d.isDirectory(), rel: posix(path.join(rel || '', d.name)) }))
    .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
}
function readFile(root, rel) {
  const t = inside(root, rel), st = fs.statSync(t);
  if (IMG_RE.test(t)) return { type: 'image', rel: posix(rel), size: st.size };
  if (st.size > 1.5e6) return { type: 'big', rel: posix(rel), size: st.size };
  return { type: 'text', rel: posix(rel), text: readText(t), size: st.size };
}
function writeText(root, rel, text) {
  const t = inside(root, rel);
  if (/\.(json|config)$/i.test(t)) JSON.parse(text);   // ไม่ยอมเซฟ JSON พัง
  fs.writeFileSync(t, text);
}

// ---------- รายการ resource ----------
const keyOf = r => r.file + (r.ptr ? '#' + r.ptr.join('.') : '');
function loadResources(root) {
  const pub = path.join(root, PUB), out = [];
  for (const d of dirs(path.join(pub, 'Character'))) {
    const rel = `${PUB}/Character/${d}/Character.config`, data = readJson(path.join(root, rel));
    if (data) out.push({ group: 'Characters', kind: 'character', id: data.id || d, name: data.name || d, file: rel, ptr: null, dir: `${PUB}/Character/${d}`, assetDirs: [`assets-src/Character/${d}`, `${PUB}/Character/${d}`], folder: d, data });
  }
  for (const k of ITEM_DIRS) {
    const rel = `${PUB}/Item/${k}/Item.config`, j = readJson(path.join(root, rel));
    if (j && Array.isArray(j.items)) j.items.forEach((it, i) => out.push({ group: k, kind: 'item', itemKind: k, id: it.id, name: it.name || it.n || it.id, file: rel, ptr: ['items', i], dir: `${PUB}/Item/${k}`, data: it }));
  }
  for (const d of dirs(path.join(pub, 'Shop/Gasha'))) {
    const rel = `${PUB}/Shop/Gasha/${d}/Config.config`, data = readJson(path.join(root, rel));
    if (data) out.push({ group: 'Gacha banners', kind: 'banner', id: data.id || d, name: data.name || d, file: rel, ptr: null, dir: `${PUB}/Shop/Gasha/${d}`, folder: d, data });
  }
  for (const [name, f] of SETTINGS) {
    const rel = `${PUB}/${f}`, data = readJson(path.join(root, rel));
    if (data) out.push({ group: 'Settings', kind: 'settings', id: f, name, file: rel, ptr: null, dir: posix(path.dirname(rel)), data });
  }
  out.forEach(r => { r.key = keyOf(r); if (!r.assetDirs) r.assetDirs = [r.dir]; });
  return out;
}
function saveResource(root, key, data) {
  const r = loadResources(root).find(x => x.key === key); if (!r) throw new Error('ไม่พบ resource: ' + key);
  const file = path.join(root, r.file); let doc = readJson(file); if (!doc) throw new Error('อ่านไฟล์ไม่ได้: ' + r.file);
  if (r.ptr) doc[r.ptr[0]][r.ptr[1]] = data; else doc = data;
  writeJson(root, r.file, doc); return true;
}

// ---------- id ที่เซิร์ฟเวอร์ตรวจ (server/src/rules/common.js) ----------
const COMMON = 'server/src/rules/common.js';
function serverIds(root, name) {
  try { const m = new RegExp('const ' + name + " = \\[([^\\]]*)\\]").exec(readText(path.join(root, COMMON))); return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null; } catch (e) { return null; }
}
function addServerId(root, name, id) {
  const p = path.join(root, COMMON); let s = readText(p), done = false;
  s = s.replace(new RegExp('(const ' + name + " = \\[)([^\\]]*)(\\])"), (m, a, b, c) => { if (b.includes("'" + id + "'")) return m; done = true; return a + b.replace(/\s*$/, '') + ", '" + id + "'" + c; });
  if (done) fs.writeFileSync(p, s); return done;
}

// ---------- สร้างใหม่ ----------
const checkId = id => { if (!ID_RE.test(String(id || ''))) throw new Error('id ต้องเป็น a-z 0-9 และ - ยาว 2–31 ตัว (ขึ้นต้นด้วยตัวอักษร/ตัวเลข)'); return id; };
function createCharacter(root, id, name) {
  checkId(id); const dir = path.join(root, PUB, 'Character', id);
  if (exists(dir)) throw new Error('มีตัวละคร ' + id + ' แล้ว');
  const order = Math.max(0, ...loadResources(root).filter(r => r.kind === 'character').map(r => Number(r.data.order) || 0)) + 1;
  for (const s of ['Effect', 'Sounds', 'Background']) { fs.mkdirSync(path.join(dir, s), { recursive: true }); fs.writeFileSync(path.join(dir, s, '.gitkeep'), ''); }
  writeJson(root, `${PUB}/Character/${id}/Character.config`, { id, name: name || id, price: 0, image: 'Character.webp', order, effects: {}, sounds: {}, background: '', lobby: { align: 'center', scale: 1 }, seat: '', table: { top: 0, show: 0.5, x: 0.45 }, star5: '' });
  return { key: `${PUB}/Character/${id}/Character.config`, serverIdAdded: addServerId(root, 'CHARS', id) };
}
function createBanner(root, id, name) {
  checkId(id); const dir = path.join(root, PUB, 'Shop/Gasha', id);
  if (exists(dir)) throw new Error('มีตู้ ' + id + ' แล้ว');
  const order = Math.max(0, ...loadResources(root).filter(r => r.kind === 'banner').map(r => Number(r.data.order) || 0)) + 1;
  writeJson(root, `${PUB}/Shop/Gasha/${id}/Config.config`, { id, name: name || id, description: '', order, enabled: false, image: 'banner.webp', pity: 90, rarityWeights: { legendary: 100, epic: 500, rare: 3400, common: 6000 }, rateUp: { multiplier: 1, items: [] }, group: 'char', kinds: ['characters'], ticket: 'ticket-b', ticketMcash: 30, ticketMcash10: 270 });
  return { key: `${PUB}/Shop/Gasha/${id}/Config.config` };
}
function createItem(root, kind, id, name) {
  if (!ITEM_DIRS.includes(kind)) throw new Error('ชนิดไม่ถูกต้อง: ' + kind); checkId(id);
  const rel = `${PUB}/Item/${kind}/Item.config`, j = readJson(path.join(root, rel), { kind: ITEM_KIND[kind], items: [] });
  if (j.items.some(x => x.id === id)) throw new Error('มี ' + id + ' แล้วใน ' + kind);
  j.items.push({ id, name: name || id, price: 0, order: Math.max(0, ...j.items.map(x => Number(x.order) || 0)) + 1 });
  writeJson(root, rel, j); if (kind === 'Background') addServerId(root, 'BGS', id);
  return { key: `${rel}#items.${j.items.length - 1}` };
}
// นำเข้ารูปเข้าโฟลเดอร์ของ resource แล้วอัปเดตฟิลด์รูปให้
function importImage(root, key, srcPath) {
  const r = loadResources(root).find(x => x.key === key); if (!r) throw new Error('ไม่พบ resource');
  const ext = path.extname(srcPath).toLowerCase(); if (!IMG_RE.test(ext)) throw new Error('ไฟล์ต้องเป็นรูป (png/webp/jpg/svg)');
  const field = r.kind === 'item' ? (r.data.tableFile && !r.data.file ? 'tableFile' : 'file') : 'image';
  const base = r.kind === 'character' ? 'Character' : r.kind === 'banner' ? 'banner' : r.id;
  const name = base + ext, tdir = r.assetDirs[0];   // ตัวละคร: ต้นฉบับอยู่ assets-src (แพ็กเข้ารหัสด้วย pack-assets) · อย่างอื่นอยู่ข้างไฟล์ config
  fs.mkdirSync(inside(root, tdir), { recursive: true });
  fs.copyFileSync(srcPath, inside(root, tdir + '/' + name));
  const d = clone(r.data); d[field] = name; saveResource(root, key, d); return { field, name, dir: tdir };
}

// ---------- ตรวจความถูกต้อง ----------
// รายชื่อพาธที่รูปอาจอยู่ (เรียงตามความสำคัญ) — ตัวละครดูใน assets-src ก่อน
function fileCandidates(r, name) { return name ? r.assetDirs.map(d => `${d}/${name}`) : []; }
function imageCandidates(r, d) {
  d = d || r.data;
  if (r.kind === 'character' || r.kind === 'banner') return fileCandidates(r, d.image);
  if (r.kind === 'item') { if (d.file) return fileCandidates(r, d.file); if (d.tableFile) return fileCandidates(r, d.tableFile); if (/^\.\//.test(d.asset || '')) return [`${PUB}/${d.asset.slice(2)}`]; }
  return [];
}
const firstExisting = (root, list) => list.find(rel => exists(path.join(root, rel))) || '';
function validate(root) {
  const P = [], R = loadResources(root), add = (level, r, msg) => P.push({ level, key: r ? r.key : null, where: r ? r.group + ' / ' + r.id : '-', msg });
  const CH = serverIds(root, 'CHARS'), BG = serverIds(root, 'BGS'), skills = readJson(path.join(root, PUB, 'skin/skills.json'), {});
  let ECO = null; try { ECO = require(path.join(root, 'server/src/economy.js')); } catch (e) { /* ข้ามเช็กตั๋ว */ }
  const itemIds = new Set(R.filter(r => r.kind === 'item').map(r => r.id)), charIds = new Set(R.filter(r => r.kind === 'character').map(r => r.id));
  const seen = {};
  for (const r of R) {
    const d = r.data;
    if (r.kind !== 'settings') { const k = r.group + ':' + r.id; if (seen[k]) add('error', r, 'id ซ้ำใน ' + r.group); seen[k] = 1; }
    if (r.kind === 'character') {
      if (d.id !== r.folder) add('error', r, `id "${d.id}" ไม่ตรงชื่อโฟลเดอร์ "${r.folder}"`);
      if (!firstExisting(root, imageCandidates(r))) add('error', r, 'ไม่มีไฟล์รูปตัวละคร (' + (d.image || 'ไม่ได้ตั้ง') + ') ใน assets-src/Character/' + r.folder);
      if (CH && !CH.includes(r.id)) add('error', r, 'id ไม่อยู่ใน CHARS ของเซิร์ฟเวอร์ (common.js) — ผู้เล่นอื่นจะไม่เห็นตัวละครนี้');
      if (skills.characters && !skills.characters[r.id]) add('warn', r, 'ยังไม่มีสกิลใน skills.json');
      if (d.star5 && !firstExisting(root, fileCandidates(r, d.star5))) add('warn', r, 'ไม่มีไฟล์ฉาก 5 ดาว ' + d.star5);
      if (d.seat && !firstExisting(root, fileCandidates(r, d.seat))) add('warn', r, 'ไม่มีไฟล์ seat ' + d.seat);
      if (!(Number(d.price) >= 0)) add('error', r, 'price ต้องเป็นตัวเลข ≥ 0');
    }
    if (r.kind === 'item') {
      const c = imageCandidates(r); if (c.length && !firstExisting(root, c)) add('error', r, 'ไม่มีไฟล์รูป ' + c[0]);
      if (r.itemKind === 'Background' && BG && !BG.includes(r.id)) add('error', r, 'id ไม่อยู่ใน BGS ของเซิร์ฟเวอร์ (common.js)');
    }
    if (r.kind === 'banner') {
      const w = d.rarityWeights || {}, sum = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
      if (sum <= 0) add('error', r, 'rarityWeights รวมเป็น 0 — สุ่มไม่ได้');
      if (!['char', 'cosm'].includes(d.group)) add('error', r, 'group ต้องเป็น char หรือ cosm');
      if (!Array.isArray(d.kinds) || !d.kinds.length) add('error', r, 'kinds ว่าง');
      if (d.image && !firstExisting(root, fileCandidates(r, d.image))) add('warn', r, 'ไม่มีรูปแบนเนอร์ ' + d.image);
      for (const it of (d.rateUp && d.rateUp.items) || []) if (!charIds.has(it) && !itemIds.has(it)) add('error', r, 'rateUp อ้างถึง "' + it + '" ที่ไม่มีอยู่');
      if (ECO && d.ticket && !(ECO.ITEMS && ECO.ITEMS[d.ticket])) add('error', r, 'ticket "' + d.ticket + '" ไม่มีใน economy.js');
      if (!(Number(d.pity) >= 0)) add('error', r, 'pity ต้องเป็นตัวเลข ≥ 0');
      if (d.enabled === false) add('info', r, 'ตู้นี้ปิดอยู่ (enabled: false)');
    }
  }
  return P;
}

function openProject(root) {
  if (!isProject(root)) throw new Error('โฟลเดอร์นี้ไม่ใช่โปรเจกต์ Dummy Online (ต้องมี client/public/index.html และ server/package.json)');
  const pkg = readJson(path.join(root, 'server/package.json'), {});
  return { root, version: pkg.version || '', rootUrl: require('url').pathToFileURL(root + path.sep).href };
}
module.exports = { PUB, ITEM_DIRS, ID_RE, isProject, inside, listDir, readFile, writeText, loadResources, saveResource, createCharacter, createBanner, createItem, importImage, validate, imageCandidates, fileCandidates, openProject, serverIds };
