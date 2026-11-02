'use strict';
// lib/runner.js — รัน build/check/sql/test/npm install ของโปรเจกต์ (ไม่พึ่ง Electron · main.js ส่ง emit มาให้)
// สคริปต์ node รันด้วย process.execPath + ELECTRON_RUN_AS_NODE=1 จึงไม่ต้องติดตั้ง Node แยกในเครื่อง (ยกเว้น npm install)
const { spawn } = require('child_process'), path = require('path'), fs = require('fs');
let job = null;
const TIMEOUT = 180000;

function runNode(args, cwd, onData) {
  return new Promise(resolve => {
    const ch = spawn(process.execPath, args, { cwd, windowsHide: true, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', FORCE_COLOR: '0' }) });
    let out = '', killed = false; job = { kill: () => { killed = true; ch.kill(); } };
    const timer = setTimeout(() => { killed = true; ch.kill(); onData('\n⏱ เกินเวลา ' + TIMEOUT / 1000 + ' วินาที — หยุดงานนี้\n'); }, TIMEOUT);
    const feed = b => { const t = b.toString('utf8'); out += t; onData(t); };
    ch.stdout.on('data', feed); ch.stderr.on('data', feed);
    ch.on('error', e => onData('✗ ' + e.message + '\n'));
    ch.on('close', code => { clearTimeout(timer); job = null; resolve({ code: killed ? -1 : code, out }); });
  });
}
function runShell(cmd, args, cwd, onData) {
  return new Promise(resolve => {
    const ch = spawn(cmd, args, { cwd, shell: true, windowsHide: true }); job = { kill: () => ch.kill() };
    const feed = b => onData(b.toString('utf8'));
    ch.stdout.on('data', feed); ch.stderr.on('data', feed);
    ch.on('error', e => onData('✗ ' + e.message + '\n'));
    ch.on('close', code => { job = null; resolve({ code }); });
  });
}
const stop = () => { if (job) job.kill(); return !!job; };
const busy = () => !!job;

// emit(event, data) — events: run:start {kind} · run:data {text} · run:tests {list} · run:test {name,status,ms,tail} · run:done {kind,summary}
async function runTask(root, kind, emit) {
  if (!root) throw new Error('ยังไม่ได้เปิดโปรเจกต์');
  if (job) throw new Error('มีงานกำลังรันอยู่ — กด Stop ก่อน');
  const line = t => emit('run:data', { text: t }), script = n => path.join(root, 'scripts', n); let summary = '';
  emit('run:start', { kind });
  try {
    if (kind === 'build' || kind === 'check' || kind === 'sql') {
      const f = kind === 'sql' ? 'gen-catalog-sql.js' : 'build-assets.js', flag = kind === 'check' ? ['--check'] : [];
      if (!fs.existsSync(script(f))) throw new Error('ไม่พบ scripts/' + f);
      line(`$ node scripts/${f}${flag.length ? ' --check' : ''}\n`);
      const r = await runNode([script(f)].concat(flag), root, line); summary = r.code === 0 ? '✔ สำเร็จ' : r.code === -1 ? '■ หยุดแล้ว' : '✘ ล้มเหลว (exit ' + r.code + ')';
    } else if (kind === 'install') {
      line('$ npm install  (โฟลเดอร์ server)\n'); const r = await runShell('npm', ['install'], path.join(root, 'server'), line);
      summary = r.code === 0 ? '✔ ติดตั้งเสร็จ' : '✘ npm install ล้มเหลว — ต้องติดตั้ง Node.js ก่อน (nodejs.org)';
    } else if (kind === 'test') {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server/package.json'), 'utf8'));
      const list = String((pkg.scripts && pkg.scripts.test) || '').split('&&').map(s => s.trim().replace(/^node\s+/, '')).filter(Boolean);
      let pass = 0, fail = 0, need = 0; emit('run:tests', { list: list.map(c => c.split(/\s+/)[0]) });
      for (const cmd of list) {
        const parts = cmd.split(/\s+/), name = parts[0]; emit('run:test', { name, status: 'run' }); line('▶ ' + name + '\n');
        const t0 = Date.now(), r = await runNode(parts, path.join(root, 'server'), () => {}), ms = Date.now() - t0;
        if (r.code === -1) { emit('run:test', { name, status: 'fail', ms }); line('  ■ หยุด\n'); fail++; break; }
        const status = r.code === 0 ? 'pass' : /Cannot find module/.test(r.out) ? 'needs-install' : 'fail';
        if (status === 'pass') pass++; else if (status === 'needs-install') need++; else { fail++; line(r.out.split('\n').slice(-12).join('\n') + '\n'); }
        emit('run:test', { name, status, ms, tail: status === 'pass' ? '' : r.out.split('\n').slice(-6).join('\n') });
        line(`  ${status === 'pass' ? '✔' : status === 'needs-install' ? '⚠ ต้อง npm install ก่อน' : '✘'} ${name} (${ms} ms)\n`);
      }
      summary = `ผ่าน ${pass} · ล้มเหลว ${fail} · ต้องติดตั้งแพ็กเกจก่อน ${need}`;
    } else throw new Error('ไม่รู้จักงาน: ' + kind);
  } finally { emit('run:done', { kind, summary }); line('— ' + summary + '\n'); }
  return summary;
}
module.exports = { runTask, stop, busy };
