'use strict';
// lib/preview.js — เปิด "เกมจำลอง" ในเครื่องสำหรับดูผลการแก้ข้อมูล (ไม่พึ่ง Electron · ทดสอบด้วย node ล้วนได้)
//   1) รันเซิร์ฟเวอร์เกม (server/src/index.js) แบบออฟไลน์: ไม่โหลด .env และล้างค่า Supabase ทิ้ง → ไม่แตะฐานข้อมูลจริง
//   2) เปิดเว็บเซิร์ฟเวอร์เล็ก ๆ เสิร์ฟ client/public โดยแทน config.js ให้ชี้เซิร์ฟเวอร์ในข้อ 1 และปิดระบบบัญชี
//   3) ใช้ "โหมดพัฒนา" ของ pack-loader.js: ไม่ส่ง pack/manifest.json → เกมใช้รูปไฟล์ตรง ซึ่งเสิร์ฟจาก assets-src
//      (เซิร์ฟเวอร์ออฟไลน์ไม่มี PACK_MASTER จึงถอดรหัสแพ็กไม่ได้ และรูปที่เพิ่งนำเข้าก็ยังไม่ได้แพ็ก)
// Public: startPreview(root, { onLog }) → { url, gameUrl } · stopPreview() · isRunning() · previewConfigScript(backendUrl)
// Extend: เพิ่มชนิดไฟล์ที่เสิร์ฟได้ที่ MIME_TYPES · ค่าที่ต้องล้างจาก env เพิ่มที่ OFFLINE_ENV
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';                  // ฟังเฉพาะในเครื่อง คนอื่นในวง Wi-Fi เข้าไม่ได้
const SERVER_READY_TIMEOUT_MS = 20000;     // เซิร์ฟเวอร์ Render ฟรีบางครั้งช้า แต่ในเครื่องควรขึ้นภายในไม่กี่วินาที
const SERVER_POLL_INTERVAL_MS = 250;
const LOG_TAIL_LINES = 12;

// ค่า env ที่ต้องว่างเสมอในโหมดพรีวิว — กันกรณีเครื่องผู้ใช้ตั้งค่าไว้ แล้วพรีวิวไปยิงฐานข้อมูลจริง
const OFFLINE_ENV = {
  SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_SECRET_KEY: '',
  PACK_MASTER: '',
  CLIENT_ORIGIN: '',                       // ว่าง = เซิร์ฟเวอร์อนุญาตทุก origin (ค่าเริ่มต้นของ config.js)
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.config': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.pak': 'application/octet-stream',
};

// ไม่ส่งไฟล์นี้ = pack-loader.js ข้ามการถอดรหัสแพ็ก แล้วใช้ไฟล์ตรงตามที่ออกแบบไว้สำหรับโหมดพัฒนา
const HIDDEN_IN_PREVIEW = new Set(['/pack/manifest.json']);
// รูปต้นฉบับที่ไม่มีใน client/public (ถูกแพ็กเข้ารหัสไว้) หาต่อที่ assets-src — พาธเว็บ /Assets/... ตรงกับ assets-src/Assets/...
const SOURCE_FALLBACK_PREFIX = '/Assets/';

let running = null;   // { gameServer, webServer, url, gameUrl }

// ---------- config.js ปลอมสำหรับพรีวิว ----------
function previewConfigScript(backendUrl) {
  const config = {
    BACKEND_URL: backendUrl,
    SUPABASE_URL: '',            // ว่าง = เกมทำงานแบบไม่ล็อกอิน (เหรียญเก็บในเครื่อง) ตามที่ Core/db.js รองรับ
    SUPABASE_KEY: '',
    AUTH_EMAIL_DOMAIN: 'example.com',
    STUDIO_PREVIEW: true,
  };
  return 'window.DUMMY_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n';
}

// ---------- หาพอร์ตว่าง ----------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

// ---------- 1) เซิร์ฟเวอร์เกม ----------
function waitForHealth(port, child, getOutput) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let exited = false;
    child.once('exit', code => {
      exited = true;
      reject(new Error(explainServerExit(code, getOutput())));
    });

    const poll = () => {
      if (exited) return;
      if (Date.now() > deadline) {
        reject(new Error('เซิร์ฟเวอร์เกมไม่ตอบภายใน ' + SERVER_READY_TIMEOUT_MS / 1000 + ' วินาที'));
        return;
      }
      const req = http.get({ host: HOST, port, path: '/health', timeout: 1000 }, res => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else setTimeout(poll, SERVER_POLL_INTERVAL_MS);
      });
      req.on('error', () => setTimeout(poll, SERVER_POLL_INTERVAL_MS));
    };
    poll();
  });
}

function explainServerExit(code, output) {
  if (/Cannot find module/.test(output)) {
    return 'เซิร์ฟเวอร์เกมยังไม่ได้ติดตั้งแพ็กเกจ — กด Tools ▸ ติดตั้งแพ็กเกจเซิร์ฟเวอร์ (npm install) ก่อน';
  }
  const tail = output.trim().split('\n').slice(-LOG_TAIL_LINES).join('\n');
  return 'เซิร์ฟเวอร์เกมหยุดทำงาน (exit ' + code + ')' + (tail ? '\n' + tail : '');
}

async function startGameServer(root, onLog) {
  const port = await findFreePort();
  // รัน src/index.js ตรง ๆ (ไม่ผ่าน -r ./src/env.js) จึงไม่อ่าน server/.env ที่อาจมีกุญแจของจริง
  const env = Object.assign({}, process.env, OFFLINE_ENV, {
    PORT: String(port),
    ELECTRON_RUN_AS_NODE: '1',   // ใช้ Node ที่มากับ Electron ได้ ไม่ต้องติดตั้ง Node แยก
    FORCE_COLOR: '0',
  });
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(root, 'server'),
    env,
    windowsHide: true,
  });

  let output = '';
  const feed = buffer => {
    const text = buffer.toString('utf8');
    output += text;
    onLog(text);
  };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);

  try {
    await waitForHealth(port, child, () => output);
  } catch (err) {
    child.kill();
    throw err;
  }
  return { child, port };
}

// ---------- 2) เว็บเซิร์ฟเวอร์เสิร์ฟหน้าเกม ----------
function decodeUrlPath(urlPath) {
  try {
    const relative = decodeURIComponent(urlPath.split('?')[0]);
    return relative.endsWith('/') ? relative + 'index.html' : relative;
  } catch (err) {
    return null;   // URL เข้ารหัสผิดรูป
  }
}

// คืนพาธไฟล์จริงใต้ baseDir หรือ null ถ้าพาธพยายามออกนอก baseDir (../)
function resolveInside(baseDir, relative) {
  const target = path.resolve(baseDir, '.' + relative);
  const inside = target === baseDir || target.startsWith(baseDir + path.sep);
  return inside ? target : null;
}

const isFile = file => !!file && fs.existsSync(file) && fs.statSync(file).isFile();

// หาไฟล์ที่จะเสิร์ฟ: client/public ก่อน แล้วค่อยรูปต้นฉบับใน assets-src (เฉพาะ /Assets/...)
function resolveStaticFile(publicDir, urlPath, sourceDir) {
  const relative = decodeUrlPath(urlPath);
  if (!relative) return null;

  const fromPublic = resolveInside(publicDir, relative);
  if (!fromPublic) return null;
  if (isFile(fromPublic) || !sourceDir || !relative.startsWith(SOURCE_FALLBACK_PREFIX)) return fromPublic;

  const fromSource = resolveInside(sourceDir, relative);
  return isFile(fromSource) ? fromSource : fromPublic;
}

function sendText(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function handleStaticRequest(dirs, configScript, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'text/plain; charset=utf-8', 'method not allowed');
    return;
  }
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/config.js') {
    sendText(res, 200, MIME_TYPES['.js'], configScript);
    return;
  }
  if (HIDDEN_IN_PREVIEW.has(urlPath)) {
    sendText(res, 404, 'text/plain; charset=utf-8', 'not found (studio preview)');
    return;
  }

  const file = resolveStaticFile(dirs.publicDir, req.url, dirs.sourceDir);
  if (!isFile(file)) {
    sendText(res, 404, 'text/plain; charset=utf-8', 'not found');
    return;
  }

  const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // no-store: แก้ไฟล์ใน Studio แล้วกดรีโหลด ต้องเห็นของใหม่ทันที ไม่ติดแคช
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

async function startWebServer(root, backendUrl) {
  const dirs = {
    publicDir: path.resolve(root, 'client', 'public'),
    sourceDir: path.resolve(root, 'assets-src'),
  };
  const configScript = previewConfigScript(backendUrl);
  const server = http.createServer((req, res) => handleStaticRequest(dirs, configScript, req, res));
  const port = await findFreePort();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });
  return { server, port };
}

// ---------- เริ่ม/หยุด ----------
async function startPreview(root, options = {}) {
  const onLog = options.onLog || (() => {});
  if (running) return { url: running.url, gameUrl: running.gameUrl };

  onLog('เริ่มเซิร์ฟเวอร์เกมแบบออฟไลน์ (ไม่ต่อฐานข้อมูลจริง)…\n');
  const game = await startGameServer(root, onLog);
  const gameUrl = 'http://' + HOST + ':' + game.port;

  let web;
  try {
    web = await startWebServer(root, gameUrl);
  } catch (err) {
    game.child.kill();
    throw err;
  }

  const url = 'http://' + HOST + ':' + web.port + '/';
  running = { gameServer: game.child, webServer: web.server, url, gameUrl };
  game.child.once('exit', () => stopPreview());   // เซิร์ฟเวอร์เกมล้ม → ปิดทั้งชุด จะได้เริ่มใหม่สะอาด
  onLog('พรีวิวพร้อม: ' + url + '  (เซิร์ฟเวอร์เกม ' + gameUrl + ')\n');
  return { url, gameUrl };
}

function stopPreview() {
  if (!running) return false;
  const current = running;
  running = null;
  current.webServer.close();
  if (current.gameServer.exitCode === null) current.gameServer.kill();
  return true;
}

const isRunning = () => !!running;

module.exports = { startPreview, stopPreview, isRunning, previewConfigScript, resolveStaticFile };
