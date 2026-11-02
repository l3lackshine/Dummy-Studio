'use strict';
/* Dummy Studio — หน้าต่างหลัก (renderer) · ไม่ใช้ framework · ไม่ใช้ innerHTML กับข้อมูลจากไฟล์ (กัน HTML แทรก) */
const api = window.studio;
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
// ใส่ลูกใหม่ทั้งชุด — ข้าม null/false และคลี่ array (replaceChildren เดี่ยว ๆ จะพิมพ์คำว่า "null" ออกมา)
const put = (parent, ...kids) => parent.replaceChildren(...kids.flat(9).filter(c => c != null && c !== false));
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};

const WS = {
  characters: { label: '🧑 ตัวละคร', groups: ['Characters'] },
  shop: { label: '🏪 ร้านค้า & กาชา', groups: ['Theme', 'Table', 'Background', 'Card', 'Dock', 'CardBack', 'Frame', 'Gacha banners'] },
  config: { label: '⚙ ตั้งค่า', groups: ['Settings'] },
};
const GLABEL = { Characters: 'ตัวละคร', Theme: 'ธีมสี', Table: 'โต๊ะ', Background: 'พื้นหลัง', Card: 'ไพ่', Dock: 'แถบปุ่ม', CardBack: 'หลังไพ่', Frame: 'กรอบ', 'Gacha banners': 'ตู้กาชา', Settings: 'ตั้งค่า' };
const KICON = { character: '🧑', item: '🎨', banner: '🎰', settings: '⚙' };
const ENUMS = { rarity: ['common', 'rare', 'epic', 'legendary'], group: ['char', 'cosm'], align: ['left', 'center', 'right'] };
const COLOR_KEYS = new Set(['card', 'blk', 'red', 'edge', 'b1', 'b2', 'bg', 'bg2', 'ink', 'border']);
const ITEM_KINDS = ['Theme', 'Table', 'Background', 'Card', 'Dock', 'CardBack', 'Frame'];

const S = { project: null, rootUrl: '', res: [], problems: [], tabs: [], active: null, drafts: {}, files: {}, ws: 'characters', filter: '', menu: null,
  bottom: 'output', log: [], tests: [], testSum: '', running: null, fs: { open: {}, kids: {} }, closedGroups: {}, bust: Date.now(), toast: null };
const el = {};
const urlOf = rel => S.rootUrl + String(rel).split('/').map(encodeURIComponent).join('/') + '?t=' + S.bust;
const resOf = key => S.res.find(r => r.key === key);
const problemsOf = key => S.problems.filter(p => p.key === key);
const dirty = key => (S.drafts[key] && S.drafts[key].dirty) || (S.files[key] && S.files[key].text !== S.files[key].orig);
const anyDirty = () => S.tabs.some(t => dirty(t.key));
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message || String(e), true); } };

// ---------- ข้อความแจ้ง / โมดอล ----------
function toast(msg, bad) {
  if (el.toast) el.toast.remove(); el.toast = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg); document.body.append(el.toast);
  const t = el.toast; setTimeout(() => { if (t.parentNode) t.remove(); }, bad ? 6000 : 2800);
}
function modal(title, fields) {
  return new Promise(resolve => {
    const vals = {}, inputs = {};
    const close = v => { bg.remove(); resolve(v); };
    const rows = fields.map(f => {
      const c = f.options ? h('select', {}, f.options.map(o => h('option', { value: o, selected: o === f.value }, o))) : h('input', { type: 'text', value: f.value || '', placeholder: f.placeholder || '', spellcheck: 'false' });
      inputs[f.key] = c; return h('div', { class: 'row' }, h('label', {}, f.label), c);
    });
    const ok = () => { fields.forEach(f => { vals[f.key] = inputs[f.key].value.trim(); }); close(vals); };
    const bg = h('div', { class: 'modalbg', onkeydown: e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter') ok(); } },
      h('div', { class: 'modal' }, h('h3', {}, title), rows, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => close(null) }, 'ยกเลิก'), h('button', { class: 'btn pri', onclick: ok }, 'ตกลง'))));
    document.body.append(bg); (Object.values(inputs)[0] || bg).focus();
  });
}

// ---------- โหลดข้อมูล ----------
async function refresh() {
  S.res = await api.call('resources'); S.problems = await api.call('validate'); S.bust = Date.now();
  for (const k of Object.keys(S.drafts)) { const r = resOf(k); if (!r) delete S.drafts[k]; else if (!S.drafts[k].dirty) S.drafts[k].data = clone(r.data); }
  S.tabs = S.tabs.filter(t => t.type !== 'res' || resOf(t.key));
  if (S.active && !S.tabs.some(t => t.key === S.active)) S.active = S.tabs.length ? S.tabs[S.tabs.length - 1].key : null;
  for (const rel of Object.keys(S.fs.open)) if (S.fs.open[rel]) { try { S.fs.kids[rel] = await api.call('listDir', rel); } catch (e) { delete S.fs.open[rel]; } }
  renderAll();
}
async function openPath(p) {
  const info = await api.call('open', p); S.project = info; S.rootUrl = info.rootUrl;
  S.tabs = []; S.active = null; S.drafts = {}; S.files = {}; S.fs = { open: {}, kids: { '': await api.call('listDir', '') } }; S.fs.open[''] = true;
  try { const rec = [p].concat(JSON.parse(localStorage.getItem('recent') || '[]').filter(x => x !== p)).slice(0, 6); localStorage.setItem('recent', JSON.stringify(rec)); } catch (e) { /* ไม่เป็นไร */ }
  await refresh();
}
const pickProject = guard(async () => { if (anyDirty() && !confirm('มีการแก้ไขที่ยังไม่บันทึก — เปิดโปรเจกต์ใหม่และทิ้งการแก้ไข?')) return; const p = await api.call('pick'); if (p) await openPath(p); });

// ---------- เปิด/ปิดแท็บ ----------
function openRes(key) {
  if (!resOf(key)) return;
  if (!S.drafts[key]) S.drafts[key] = { data: clone(resOf(key).data), dirty: false };
  if (!S.tabs.some(t => t.key === key)) S.tabs.push({ key, type: 'res' }); S.active = key; renderAll();
}
const openFile = guard(async rel => {
  if (!S.files[rel]) { const f = await api.call('readFile', rel); S.files[rel] = Object.assign(f, { orig: f.text }); }
  if (!S.tabs.some(t => t.key === rel)) S.tabs.push({ key: rel, type: 'file' }); S.active = rel; renderAll();
});
function closeTab(key) {
  if (dirty(key) && !confirm('แท็บนี้ยังไม่ได้บันทึก — ปิดแล้วทิ้งการแก้ไข?')) return;
  const i = S.tabs.findIndex(t => t.key === key); S.tabs.splice(i, 1); delete S.drafts[key]; if (S.files[key]) delete S.files[key];
  if (S.active === key) S.active = S.tabs.length ? S.tabs[Math.max(0, i - 1)].key : null; renderAll();
}
const tabTitle = t => (t.type === 'res' ? (resOf(t.key) ? resOf(t.key).id : t.key) : t.key.split('/').pop());

// ---------- บันทึก ----------
const save = guard(async () => {
  const t = S.tabs.find(x => x.key === S.active); if (!t) return;
  if (t.type === 'res') { const d = S.drafts[t.key]; await api.call('save', t.key, d.data); d.dirty = false; await refresh(); toast('บันทึกแล้ว ✔'); }
  else { const f = S.files[t.key]; await api.call('writeText', t.key, f.text); f.orig = f.text; await refresh(); toast('บันทึกแล้ว ✔'); }
});
function revert() { const t = S.tabs.find(x => x.key === S.active); if (!t) return; if (t.type === 'res') { S.drafts[t.key] = { data: clone(resOf(t.key).data), dirty: false }; } else S.files[t.key].text = S.files[t.key].orig; renderAll(); }
const importImg = guard(async () => {
  const t = S.tabs.find(x => x.key === S.active); if (!t || t.type !== 'res') return;
  if (dirty(t.key)) return toast('บันทึกการแก้ไขก่อนนำเข้ารูป', true);
  const r = await api.call('importImage', t.key); if (!r) return; await refresh(); toast('นำเข้ารูปแล้ว → ' + r.dir + '/' + r.name);
});

// ---------- สร้างใหม่ ----------
const newChar = guard(async () => {
  const v = await modal('ตัวละครใหม่', [{ key: 'id', label: 'id', placeholder: 'เช่น mina-01' }, { key: 'name', label: 'ชื่อที่แสดง' }]); if (!v) return;
  const r = await api.call('newCharacter', v.id, v.name); S.ws = 'characters'; await refresh(); openRes(r.key);
  toast(r.serverIdAdded ? 'สร้างแล้ว และเพิ่ม id ใน CHARS ของเซิร์ฟเวอร์ให้แล้ว — ต่อไป: นำเข้ารูป + ตั้งสกิล' : 'สร้างแล้ว (ตรวจ CHARS ใน common.js ด้วย)');
});
const newBanner = guard(async () => {
  const v = await modal('ตู้กาชาใหม่', [{ key: 'id', label: 'id', placeholder: 'เช่น summer-up' }, { key: 'name', label: 'ชื่อตู้' }]); if (!v) return;
  const r = await api.call('newBanner', v.id, v.name); S.ws = 'shop'; await refresh(); openRes(r.key); toast('สร้างตู้แล้ว (ปิดอยู่ — ตั้งค่าแล้วค่อยเปิด enabled)');
});
const newItem = guard(async () => {
  const v = await modal('ไอเทมใหม่', [{ key: 'kind', label: 'ชนิด', options: ITEM_KINDS, value: 'Background' }, { key: 'id', label: 'id' }, { key: 'name', label: 'ชื่อที่แสดง' }]); if (!v) return;
  const r = await api.call('newItem', v.kind, v.id, v.name); S.ws = 'shop'; await refresh(); openRes(r.key); toast('สร้างแล้ว — นำเข้ารูปได้ที่ปุ่ม นำเข้ารูป');
});

// ---------- รันงาน ----------
const run = guard(async kind => { if (!S.project) return; if (anyDirty() && !confirm('มีการแก้ไขที่ยังไม่บันทึก — รันต่อโดยไม่รวมการแก้ไขนั้น?')) return; S.bottom = kind === 'test' ? 'tests' : 'output'; await api.call('run', kind); if (kind === 'build') await refresh(); });
const stop = guard(async () => { await api.call('stop'); });
function wireRun() {
  api.on('run:start', d => { S.running = d.kind; S.log.push('', '══ ' + ({ build: 'Build assets', check: 'Check assets', sql: 'Generate SQL', test: 'Run tests', install: 'npm install' }[d.kind] || d.kind) + ' ══'); if (d.kind === 'test') { S.tests = []; S.testSum = ''; } renderBottom(); renderRunbar(); renderStatus(); });
  api.on('run:data', d => { S.log.push(...String(d.text).replace(/\r/g, '').split('\n').filter((x, i, a) => x !== '' || i < a.length - 1)); if (S.log.length > 4000) S.log.splice(0, S.log.length - 4000); renderBottom(true); });
  api.on('run:tests', d => { S.tests = d.list.map(n => ({ name: n, status: 'wait' })); renderBottom(); });
  api.on('run:test', d => { const t = S.tests.find(x => x.name === d.name); if (t) Object.assign(t, d); renderBottom(); });
  api.on('run:done', d => { S.running = null; if (d.kind === 'test') S.testSum = d.summary; renderBottom(); renderRunbar(); renderStatus(); toast(d.summary || 'เสร็จสิ้น', /✘/.test(d.summary || '')); });
}

// ---------- แถบเมนู ----------
function menus() {
  const p = !!S.project, busy = !!S.running;
  return {
    'Project': [['เปิดโปรเจกต์…', 'Ctrl+O', pickProject, true], ['โหลดข้อมูลใหม่', 'Ctrl+R', guard(refresh), p], '-', ['บันทึก', 'Ctrl+S', save, p]],
    'Data': [['ตัวละครใหม่…', '', newChar, p], ['ตู้กาชาใหม่…', '', newBanner, p], ['ไอเทมใหม่…', '', newItem, p]],
    'Tools': [['Build assets', 'F5', () => run('build'), p && !busy], ['Check assets', 'F6', () => run('check'), p && !busy], ['รันเทสต์เซิร์ฟเวอร์', 'F7', () => run('test'), p && !busy], '-', ['สร้าง SQL แคตตาล็อก', '', () => run('sql'), p && !busy], ['ติดตั้งแพ็กเกจเซิร์ฟเวอร์ (npm install)', '', () => run('install'), p && !busy]],
    'Help': [['เกี่ยวกับ Dummy Studio', '', () => modal('Dummy Studio 0.1', [{ key: 'x', label: 'เวอร์ชัน', value: 'ต้นแบบ — จัดการตัวละคร/ร้านค้า/กาชา' }]), true]],
  };
}
function renderMenu() {
  put(el.menubar, h('span', { class: 'brand' }, '🂡 Dummy Studio'));
  const M = menus();
  for (const name of Object.keys(M)) {
    const b = h('button', { class: 'mbtn' + (S.menu === name ? ' on' : ''), onclick: e => { e.stopPropagation(); S.menu = S.menu === name ? null : name; renderMenu(); } }, name);
    el.menubar.append(b);
    if (S.menu === name) el.menubar.append(h('div', { class: 'dropdown', style: 'left:' + (b.offsetLeft) + 'px' }, M[name].map(it => it === '-' ? h('hr') : h('button', { disabled: !it[3], onclick: () => { S.menu = null; renderMenu(); it[2](); } }, h('span', {}, it[0]), h('kbd', {}, it[1])))));
  }
}
function renderWork() {
  const b = Object.keys(WS).map(k => h('button', { class: S.ws === k ? 'on' : '', onclick: () => { S.ws = k; renderAll(); } }, WS[k].label));
  b.push(h('button', { disabled: true, title: 'เร็ว ๆ นี้' }, '🖼 หน้าจอ'), h('button', { disabled: true, title: 'เร็ว ๆ นี้' }, '📜 กฎเกม'));
  put(el.workbar, h('div', { class: 'pname' }, S.project ? '📁 ' + S.project.root.split(/[\\/]/).pop() : ''), h('div', { class: 'ws' }, b), h('div', { class: 'runbar', id: 'runbar' }));
  renderRunbar();
}
function renderRunbar() {
  const rb = $('#runbar'); if (!rb) return; const p = !!S.project, busy = !!S.running;
  put(rb, h('button', { class: 'rbtn', title: 'Build assets (F5)', disabled: !p || busy, onclick: () => run('build') }, '▶ Build'), h('button', { class: 'rbtn', title: 'Check (F6)', disabled: !p || busy, onclick: () => run('check') }, '✔ Check'),
    h('button', { class: 'rbtn', title: 'Run tests (F7)', disabled: !p || busy, onclick: () => run('test') }, '🧪 Test'), busy ? h('button', { class: 'rbtn stop', onclick: stop }, '■ Stop') : null);
}

// ---------- FileSystem dock ----------
const toggleDir = guard(async rel => { if (S.fs.open[rel]) S.fs.open[rel] = false; else { S.fs.kids[rel] = await api.call('listDir', rel); S.fs.open[rel] = true; } renderFS(); });
function renderFS() {
  const out = [];
  const walk = (rel, depth) => (S.fs.kids[rel] || []).forEach(n => {
    const pad = 'padding-left:' + (8 + depth * 14) + 'px';
    if (n.dir) { out.push(h('div', { class: 'tn', style: pad, onclick: () => toggleDir(n.rel) }, h('span', { class: 'ic' }, S.fs.open[n.rel] ? '▾' : '▸'), '📁 ' + n.name)); if (S.fs.open[n.rel]) walk(n.rel, depth + 1); }
    else out.push(h('div', { class: 'tn' + (S.active === n.rel ? ' sel' : ''), style: pad, onclick: () => openFile(n.rel) }, h('span', { class: 'ic' }, ''), (/\.(png|webp|jpe?g|gif|svg)$/i.test(n.name) ? '🖼 ' : /\.(json|config)$/i.test(n.name) ? '🧾 ' : '📄 ') + n.name));
  });
  if (S.project) walk('', 0);
  put(el.fsBody, h('div', { class: 'tree' }, out));
}

// ---------- Resources dock ----------
function renderRes() {
  const groups = WS[S.ws].groups, q = S.filter.toLowerCase(), out = [];
  for (const g of groups) {
    const list = S.res.filter(r => r.group === g && (!q || (r.id + ' ' + r.name).toLowerCase().includes(q)));
    if (!list.length && q) continue;
    out.push(h('div', { class: 'grp', onclick: () => { S.closedGroups[g] = !S.closedGroups[g]; renderRes(); } }, S.closedGroups[g] ? '▸' : '▾', GLABEL[g] || g, h('span', { class: 'badge' }, list.length)));
    if (!S.closedGroups[g]) list.forEach(r => {
      const pr = problemsOf(r.key), er = pr.some(x => x.level === 'error'), wr = pr.some(x => x.level === 'warn');
      out.push(h('div', { class: 'tn' + (S.active === r.key ? ' sel' : ''), onclick: () => openRes(r.key), title: r.id }, h('span', { class: 'ic' }, KICON[r.kind]), r.name,
        dirty(r.key) ? h('span', { class: 'dot' }, '●') : null, er ? h('span', { class: 'lvl-err' }, '⛔') : wr ? h('span', { class: 'lvl-warn' }, '⚠') : null, h('span', { class: 'sub' }, r.id !== r.name ? r.id : '')));
    });
  }
  put(el.resBody, h('div', { class: 'tree' }, out.length ? out : h('div', { class: 'dim', style: 'padding:12px' }, 'ไม่พบรายการ')));
}

// ---------- ฟอร์ม Inspector ----------
const setPath = (o, path, v) => { let c = o; for (let i = 0; i < path.length - 1; i++) c = c[path[i]]; c[path[path.length - 1]] = v; };
function touch(key) { S.drafts[key].dirty = true; renderTabs(); renderRes(); renderStatus(); renderToolbarState(); renderStage(); }
function control(val, path, key, d) {
  const k = String(path[path.length - 1]), upd = v => { setPath(d, path, v); touch(key); };
  if (typeof val === 'boolean') return h('input', { type: 'checkbox', checked: val, onchange: e => upd(e.target.checked) });
  if (typeof val === 'number') return h('input', { type: 'number', step: 'any', value: String(val), oninput: e => upd(e.target.value === '' ? 0 : Number(e.target.value)) });
  const s = val == null ? '' : String(val);
  if (ENUMS[k] && typeof val === 'string') return h('select', { onchange: e => upd(e.target.value) }, (ENUMS[k].includes(s) ? ENUMS[k] : [s].concat(ENUMS[k])).map(o => h('option', { value: o, selected: o === s }, o)));
  if (COLOR_KEYS.has(k) && /^#[0-9a-f]{6}$/i.test(s)) { const t = h('input', { type: 'text', value: s, spellcheck: 'false' }), c = h('input', { type: 'color', value: s });
    t.addEventListener('input', () => { upd(t.value); if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; }); c.addEventListener('input', () => { t.value = c.value; upd(c.value); }); return h('div', { class: 'crow' }, t, c); }
  if (s.length > 48 || s.includes('\n')) return h('textarea', { rows: 4, spellcheck: 'false', oninput: e => upd(e.target.value) }, s);
  return h('input', { type: 'text', value: s, spellcheck: 'false', oninput: e => upd(e.target.value) });
}
function node(label, val, path, key, d, depth) {
  if (Array.isArray(val)) return arrayNode(label, val, path, key, d, depth);
  if (val && typeof val === 'object') return groupNode(label, val, path, key, d, depth);
  return h('div', { class: 'row' }, h('label', { title: label }, label), control(val, path, key, d));
}
function groupNode(label, val, path, key, d, depth, extra) {
  const fb = h('div', { class: 'fb' }), box = h('div', { class: 'fs' + (depth > 1 ? ' closed' : '') }, h('div', { class: 'fh', onclick: () => box.classList.toggle('closed') }, '▾ ' + label, extra || null), fb);
  const keys = Object.keys(val); if (!keys.length) fb.append(h('div', { class: 'dim' }, '(ว่าง)'));
  keys.forEach(k => fb.append(node(k, val[k], path.concat(k), key, d, depth + 1)));
  return box;
}
function arrayNode(label, arr, path, key, d, depth) {
  const prim = arr.every(x => x === null || typeof x !== 'object'), fb = h('div', { class: 'fb' });
  const struct = () => { S.drafts[key].dirty = true; renderTabs(); renderRes(); renderStatus(); renderToolbarState(); renderInsp(); renderStage(); };
  const del = i => { arr.splice(i, 1); struct(); };
  arr.forEach((v, i) => fb.append(prim
    ? h('div', { class: 'row', style: 'grid-template-columns:30px 1fr' }, h('label', {}, '[' + i + ']'), h('div', { class: 'crow' }, control(v, path.concat(i), key, d), h('button', { class: 'mini', onclick: () => del(i) }, '✕')))
    : groupNode('[' + i + ']', v, path.concat(i), key, d, depth + 1, h('button', { class: 'mini', style: 'margin-left:auto', onclick: e => { e.stopPropagation(); del(i); } }, '✕'))));
  fb.append(h('button', { class: 'mini', onclick: () => { arr.push(prim ? (typeof arr[0] === 'number' ? 0 : '') : (arr.length ? clone(arr[arr.length - 1]) : {})); struct(); } }, '+ เพิ่ม'));
  return h('div', { class: 'fs' }, h('div', { class: 'fh', onclick: e => e.currentTarget.parentNode.classList.toggle('closed') }, '▾ ' + label + ' (' + arr.length + ')'), fb);
}
function renderInsp() {
  const t = S.tabs.find(x => x.key === S.active);
  if (!t) return put(el.inspBody, h('div', { class: 'dim', style: 'padding:14px' }, 'เลือกรายการจาก Resources หรือไฟล์จาก FileSystem'));
  if (t.type === 'file') { const f = S.files[t.key]; return put(el.inspBody, h('div', { class: 'insp' }, h('div', { class: 'row' }, h('label', {}, 'พาธ'), h('div', {}, t.key)), h('div', { class: 'row' }, h('label', {}, 'ชนิด'), h('div', {}, f.type)), h('div', { class: 'row' }, h('label', {}, 'ขนาด'), h('div', {}, f.size + ' bytes')))); }
  const r = resOf(t.key), d = S.drafts[t.key].data, pr = problemsOf(t.key);
  put(el.inspBody, h('div', { class: 'ihead' }, h('span', {}, KICON[r.kind]), h('b', {}, r.name), h('span', { class: 'dim' }, GLABEL[r.group] || r.group)),
    pr.length ? h('div', { style: 'padding:6px 10px;border-bottom:1px solid var(--line)' }, pr.map(p => h('div', { class: 'lvl-' + (p.level === 'error' ? 'err' : p.level) }, (p.level === 'error' ? '⛔ ' : p.level === 'warn' ? '⚠ ' : 'ℹ ') + p.msg))) : null,
    h('div', { class: 'insp' }, Object.keys(d).map(k => node(k, d[k], [k], t.key, d, 0))));
}

// ---------- กลาง ----------
function renderTabs() {
  put(el.tabs, ...S.tabs.map(t => h('div', { class: 'tab' + (S.active === t.key ? ' on' : ''), onclick: () => { S.active = t.key; renderAll(); } }, (t.type === 'res' ? KICON[resOf(t.key).kind] : '🧾') + ' ' + tabTitle(t), dirty(t.key) ? h('span', { class: 'dot', style: 'color:var(--warn)' }, '●') : null,
    h('span', { class: 'x', onclick: e => { e.stopPropagation(); closeTab(t.key); } }, '✕'))));
}
function renderToolbarState() { const b = $('#btnSave'); if (b) b.disabled = !dirty(S.active); const r = $('#btnRevert'); if (r) r.disabled = !dirty(S.active); }
function cands(r, d) {
  const dirs = r.assetDirs || [r.dir]; let n = '';
  if (r.kind === 'character' || r.kind === 'banner') n = d.image; else if (r.kind === 'item') { n = d.file || d.tableFile; if (!n && /^\.\//.test(d.asset || '')) return ['client/public/' + d.asset.slice(2)]; }
  return n ? dirs.map(x => x + '/' + n) : [];
}
function imgNode(list) {
  if (!list.length) return null; let i = 0; const im = h('img', { alt: '' }); im.onerror = () => { i++; if (i < list.length) im.src = urlOf(list[i]); else im.replaceWith(h('div', { class: 'empty' }, '🖼 ไม่พบไฟล์รูป', h('br'), list[0])); }; im.src = urlOf(list[0]); return im;
}
function renderStage() {
  const t = S.tabs.find(x => x.key === S.active), st = $('#stage'); if (!st || !t || t.type !== 'res') return;
  const r = resOf(t.key), d = S.drafts[t.key].data, parts = [];
  st.className = 'stage' + (r.kind === 'banner' ? ' col' : '');
  if (r.kind === 'banner') {
    const w = d.rarityWeights || {}, sum = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0), names = { legendary: 'SSR', epic: 'SR', rare: 'Rare', common: 'Common' };
    parts.push(imgNode(cands(r, d)), h('div', { class: 'rates' }, h('b', {}, d.name || r.id), h('div', { class: 'dim' }, 'การันตี ' + (d.pity || 0) + ' ครั้ง · ' + (d.enabled === false ? 'ปิดอยู่' : 'เปิดอยู่')),
      h('table', {}, h('tr', {}, h('th', {}, 'ระดับ'), h('th', {}, 'น้ำหนัก'), h('th', {}, 'โอกาส')), ['legendary', 'epic', 'rare', 'common'].map(k => h('tr', {}, h('td', {}, names[k]), h('td', {}, w[k] ?? 0), h('td', {}, sum ? ((Number(w[k]) || 0) / sum * 100).toFixed(2) + '%' : '—'))),
        h('tr', {}, h('td', {}, 'รวม'), h('td', {}, sum), h('td', {}, sum ? '100%' : '—'))), (d.rateUp && d.rateUp.items && d.rateUp.items.length) ? h('div', { class: 'dim' }, 'เรตอัป: ' + d.rateUp.items.join(', ')) : null));
  } else if (r.kind === 'settings') parts.push(h('div', { class: 'empty' }, '⚙ ' + r.name, h('br'), 'แก้ค่าที่แผง Inspector ด้านขวา'));
  else {
    const im = imgNode(cands(r, d)); if (im) parts.push(im);
    if (!im && (d.bg || d.card || d.css)) parts.push(h('div', { class: 'swatch', style: 'background:' + (d.css || (d.bg ? 'linear-gradient(160deg,' + d.bg + ',' + (d.bg2 || d.bg) + ')' : d.card)) }));
    if (!parts.length) parts.push(h('div', { class: 'empty' }, '🖼 ยังไม่มีรูป', h('br'), 'กด "นำเข้ารูป" ด้านบน'));
  }
  put(st, ...parts.filter(Boolean));
}
function renderCenter() {
  const t = S.tabs.find(x => x.key === S.active);
  if (!t) return put(el.view, h('div', { class: 'stage' }, h('div', { class: 'empty' }, '📂 เลือกรายการจากแผงซ้ายเพื่อเริ่มแก้', h('br'), 'หรือสร้างใหม่ที่เมนู Data')));
  if (t.type === 'res') {
    put(el.view, h('div', { class: 'toolbar' }, h('button', { class: 'btn pri', id: 'btnSave', onclick: save }, '💾 บันทึก'), h('button', { class: 'btn', id: 'btnRevert', onclick: revert }, '↩ ย้อนกลับ'), t.type === 'res' && resOf(t.key).kind !== 'settings' ? h('button', { class: 'btn', onclick: importImg }, '🖼 นำเข้ารูป') : null,
      h('span', { class: 'spacer' }), h('span', { class: 'dim' }, resOf(t.key).file)), h('div', { class: 'stage', id: 'stage' })); renderToolbarState(); return renderStage();
  }
  const f = S.files[t.key];
  if (f.type === 'image') return put(el.view, h('div', { class: 'imgprev' }, h('img', { src: urlOf(f.rel), style: 'max-width:90%;max-height:90%' })));
  if (f.type === 'big') return put(el.view, h('div', { class: 'stage' }, h('div', { class: 'empty' }, 'ไฟล์ใหญ่เกินไปที่จะแสดง (' + f.size + ' bytes)')));
  const ta = h('textarea', { class: 'editor', spellcheck: 'false', oninput: e => { f.text = e.target.value; renderTabs(); renderToolbarState(); } }, f.text);
  put(el.view, h('div', { class: 'toolbar' }, h('button', { class: 'btn pri', id: 'btnSave', onclick: save }, '💾 บันทึก'), h('button', { class: 'btn', id: 'btnRevert', onclick: revert }, '↩ ย้อนกลับ'), h('span', { class: 'spacer' }), h('span', { class: 'dim' }, f.rel)), ta); renderToolbarState();
}

// ---------- แผงล่าง ----------
function renderBottom(onlyLog) {
  const er = S.problems.filter(p => p.level === 'error').length, wr = S.problems.filter(p => p.level === 'warn').length;
  if (onlyLog && S.bottom !== 'output') return;
  const tab = (k, label, badge) => h('button', { class: S.bottom === k ? 'on' : '', onclick: () => { S.bottom = k; renderBottom(); } }, label, badge);
  put(el.btabs, tab('output', 'Output'), tab('tests', 'Test Runner', S.tests.length ? h('span', { class: 'badge' + (S.tests.some(t => t.status === 'fail') ? ' err' : '') }, S.tests.filter(t => t.status === 'pass').length + '/' + S.tests.length) : null),
    tab('problems', 'Problems', (er || wr) ? h('span', { class: 'badge ' + (er ? 'err' : 'warn') }, er + wr) : null), h('span', { class: 'spacer', style: 'flex:1' }), h('button', { onclick: () => { S.log = []; S.tests = []; S.testSum = ''; renderBottom(); } }, '🗑'));
  if (S.bottom === 'output') { put(el.bbody, h('pre', { class: 'log' }, S.log.length ? S.log.join('\n') : 'พร้อมใช้งาน — กด ▶ Build / ✔ Check / 🧪 Test ด้านบน')); el.bbody.scrollTop = el.bbody.scrollHeight; }
  else if (S.bottom === 'tests') {
    const ic = { wait: '○', run: '⏳', pass: '✔', fail: '✘', 'needs-install': '⚠' }, cl = { pass: 'color:var(--ok)', fail: 'color:var(--err)', 'needs-install': 'color:var(--warn)' };
    put(el.bbody, S.testSum ? h('div', { class: 'sum' }, S.testSum) : null, S.tests.length ? S.tests.map(t => h('div', { class: 'trow', title: t.tail || '' }, h('span', { style: cl[t.status] || '' }, ic[t.status] || '○'), h('span', {}, t.name + (t.status === 'needs-install' ? '  — ต้อง npm install (Tools ▸ ติดตั้งแพ็กเกจ)' : '')), h('span', { class: 'ms' }, t.ms != null ? t.ms + ' ms' : ''))) : h('div', { class: 'dim', style: 'padding:12px' }, 'ยังไม่ได้รันเทสต์ — กด 🧪 Test (F7)'));
  } else put(el.bbody, S.problems.length ? S.problems.map(p => h('div', { class: 'prow', onclick: () => p.key && openRes(p.key) }, h('span', { class: 'lvl-' + (p.level === 'error' ? 'err' : p.level) }, p.level === 'error' ? '⛔' : p.level === 'warn' ? '⚠' : 'ℹ'), h('span', { class: 'dim' }, p.where), h('span', {}, p.msg))) : h('div', { style: 'padding:12px;color:var(--ok)' }, '✔ ไม่พบปัญหา'));
}
function renderStatus() {
  const er = S.problems.filter(p => p.level === 'error').length, n = k => S.res.filter(r => r.kind === k).length;
  el.status.className = 'status' + (S.running ? '' : ' idle');
  put(el.status, h('span', {}, S.running ? '⏳ กำลังรัน: ' + S.running : '● พร้อม'), h('span', {}, S.project ? S.project.root : 'ยังไม่ได้เปิดโปรเจกต์'), h('span', { class: 'spacer', style: 'flex:1' }), S.project ? h('span', {}, `ตัวละคร ${n('character')} · ตู้ ${n('banner')} · ไอเทม ${n('item')}`) : null, S.project ? h('span', { style: er ? 'color:#ffb4ae;font-weight:700' : '' }, er ? '⛔ ' + er + ' ข้อผิดพลาด' : '✔ ไม่มีข้อผิดพลาด') : null, anyDirty() ? h('span', { style: 'color:var(--warn)' }, '● ยังไม่บันทึก') : null);
}

// ---------- ประกอบหน้าจอ ----------
function renderAll() { renderMenu(); renderWork(); if (!S.project) return renderWelcome(); if (!el.main || el.slot.firstChild !== el.main) put(el.slot, el.main); renderFS(); renderRes(); renderTabs(); renderCenter(); renderInsp(); renderBottom(); renderStatus(); }
function renderWelcome() {
  let rec = []; try { rec = JSON.parse(localStorage.getItem('recent') || '[]'); } catch (e) { /* ว่าง */ }
  put(el.slot, h('div', { class: 'welcome' }, h('div', { class: 'wbox' }, h('h1', {}, '🂡 Dummy Studio'), h('div', { class: 'dim' }, 'เครื่องมือจัดการตัวละคร ร้านค้า และตู้กาชาของ Dummy Online'), h('p', {}, h('button', { class: 'btn pri', onclick: pickProject }, '📂 เปิดโฟลเดอร์โปรเจกต์…')),
    rec.length ? h('div', { class: 'rec' }, h('div', { class: 'dim' }, 'เปิดล่าสุด'), rec.map(p => h('div', { onclick: guard(() => openPath(p)) }, '📁 ' + p))) : null)));
  renderStatus();
}
function dock(title, head2) { const body = h('div', { class: 'dbody' }); return { node: h('div', { class: 'dock' }, h('div', { class: 'dhead' }, title, head2 || null), body), body }; }
function build() {
  const app = $('#app');
  el.menubar = h('div', { class: 'menubar' }); el.workbar = h('div', { class: 'workbar' }); el.slot = h('div', { style: 'min-height:0;display:grid' }); el.status = h('div', { class: 'status idle' });
  const fsd = dock('FileSystem'), rsd = dock('Resources', h('input', { type: 'text', placeholder: 'ค้นหา…', oninput: e => { S.filter = e.target.value; renderRes(); } })), ins = dock('Inspector');
  el.fsBody = fsd.body; el.resBody = rsd.body; el.inspBody = ins.body;
  el.tabs = h('div', { class: 'tabs' }); el.view = h('div', { style: 'flex:1;min-height:0;display:flex;flex-direction:column' });
  el.btabs = h('div', { class: 'dtabs' }); el.bbody = h('div', { class: 'dbody' });
  el.main = h('div', { class: 'main' }, h('div', { class: 'left' }, fsd.node, rsd.node), h('div', { class: 'center' }, el.tabs, el.view), h('div', { class: 'dock right' }, ins.node.firstChild, ins.body), h('div', { class: 'dock bottom' }, el.btabs, el.bbody));
  put(app, el.menubar, el.workbar, el.slot, el.status);
  document.addEventListener('click', () => { if (S.menu) { S.menu = null; renderMenu(); } });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } else if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); pickProject(); } else if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); if (S.project) guard(refresh)(); }
    else if (e.key === 'F5') { e.preventDefault(); run('build'); } else if (e.key === 'F6') { e.preventDefault(); run('check'); } else if (e.key === 'F7') { e.preventDefault(); run('test'); }
  });
  window.addEventListener('beforeunload', e => { if (anyDirty()) { e.preventDefault(); e.returnValue = ''; } });
}
async function start() {
  if (!api) { document.body.textContent = 'ต้องเปิดผ่าน Dummy Studio (Electron)'; return; }
  build(); wireRun(); renderAll();
  try { const rec = JSON.parse(localStorage.getItem('recent') || '[]'); if (rec[0]) await openPath(rec[0]); } catch (e) { renderAll(); }
}
start();
