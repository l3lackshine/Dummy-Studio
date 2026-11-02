'use strict';
// ทดสอบตัวรันงาน: node test/test-runner.js <โฟลเดอร์โปรเจกต์>
const assert = require('assert'), R = require('../lib/runner');
const root = process.argv[2] || process.env.DUMMY_ROOT; if (!root) { console.log('ข้าม: ระบุโฟลเดอร์โปรเจกต์'); process.exit(0); }
(async () => {
  const ev = []; const emit = (e, d) => ev.push([e, d]);
  let s = await R.runTask(root, 'check', emit); assert(/สำเร็จ/.test(s), s); console.log('✓ check:', s);
  ev.length = 0; s = await R.runTask(root, 'test', emit);
  const tests = ev.filter(x => x[0] === 'run:test' && x[1].status !== 'run').map(x => x[1]);
  console.log('✓ test:', s, '·', tests.length, 'ชุด'); assert(tests.every(t => ['pass', 'needs-install'].includes(t.status)), JSON.stringify(tests.filter(t => t.status === 'fail')));
  await assert.rejects(R.runTask(root, 'nope', emit), /ไม่รู้จักงาน/); assert(!R.busy()); console.log('✓ งานไม่รู้จักถูกปฏิเสธ');
})().catch(e => { console.error('✘', e.message); process.exit(1); });
