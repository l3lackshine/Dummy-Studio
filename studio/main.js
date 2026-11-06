'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path'), fs = require('fs');
const P = require('./lib/project'), Runner = require('./lib/runner');
const Preview = require('./lib/preview');

let win = null, root = null;
const send = (ev, d) => { if (win && !win.isDestroyed()) win.webContents.send(ev, d); };

function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1000, minHeight: 640, backgroundColor: '#1d2229', title: 'Dummy Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => closePreview());   // ปิดหน้าต่างหลักแล้วเกมจำลองต้องปิดตาม
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// ---------- IPC ----------
const H = (name, fn) => ipcMain.handle('studio:' + name, async (_e, ...a) => { try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: err.message }; } });
const need = () => { if (!root) throw new Error('ยังไม่ได้เปิดโปรเจกต์'); return root; };
H('pick', async () => { const r = await dialog.showOpenDialog(win, { title: 'เลือกโฟลเดอร์โปรเจกต์ Dummy Online', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
H('open', p => { const info = P.openProject(p); if (info.root !== root) closePreview(); root = info.root; return info; });
H('resources', () => P.loadResources(need()));
H('validate', () => P.validate(need()));
H('listDir', rel => P.listDir(need(), rel));
H('readFile', rel => P.readFile(need(), rel));
H('writeText', (rel, text) => P.writeText(need(), rel, text));
H('save', (key, data) => P.saveResource(need(), key, data));
H('newCharacter', (id, name) => P.createCharacter(need(), id, name));
H('newBanner', (id, name) => P.createBanner(need(), id, name));
H('newItem', (kind, id, name) => P.createItem(need(), kind, id, name));
H('importImage', async key => {
  const r = await dialog.showOpenDialog(win, { title: 'เลือกรูป', properties: ['openFile'], filters: [{ name: 'รูปภาพ', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'] }] });
  return r.canceled ? null : P.importImage(need(), key, r.filePaths[0]);
});
H('run', async kind => {
  const summary = await Runner.runTask(need(), kind, send);
  if (kind === 'build') reloadPreview();   // build เสร็จแล้วรีโหลดเกมจำลองให้เห็นข้อมูลใหม่ทันที
  return summary;
});
H('stop', () => Runner.stop());
H('reveal', rel => { shell.showItemInFolder(P.inside(need(), rel)); return true; });

H('preview', size => openPreview(need(), size));
H('previewReload', () => reloadPreview());
H('previewStop', () => closePreview());

// ---------- เกมจำลอง (พรีวิว) ----------
// เปิดหน้าเกมจริงในหน้าต่างแยก ต่อกับเซิร์ฟเวอร์เกมในเครื่องแบบออฟไลน์ (รายละเอียดใน lib/preview.js)
// หน้าต่างนี้ไม่มี preload และเปิด sandbox — โค้ดเกมเข้าถึงระบบไฟล์หรือคำสั่งของ Studio ไม่ได้
const PREVIEW_SIZES = {
  phone: { width: 844, height: 390, label: 'มือถือแนวนอน' },   // ขนาดจอเป้าหมายหลักของเกม
  desktop: { width: 1280, height: 720, label: 'จอคอม' },
};
let previewWin = null;

const sendPreviewState = () => send('preview:state', { open: !!previewWin });
const logToOutput = text => send('run:data', { text });

async function openPreview(projectRoot, sizeName) {
  const size = PREVIEW_SIZES[sizeName] || PREVIEW_SIZES.phone;
  const { url } = await Preview.startPreview(projectRoot, { onLog: logToOutput });

  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.setContentSize(size.width, size.height);
    previewWin.focus();
    return { url };
  }

  previewWin = new BrowserWindow({
    width: size.width,
    height: size.height,
    useContentSize: true,
    backgroundColor: '#000000',
    title: 'เกมจำลอง (ออฟไลน์) — Dummy Studio',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  previewWin.setMenu(null);
  lockPreviewToOrigin(previewWin, url);
  addPreviewShortcuts(previewWin);
  previewWin.on('closed', () => {
    previewWin = null;
    Preview.stopPreview();
    sendPreviewState();
  });
  await previewWin.loadURL(url);
  sendPreviewState();
  return { url };
}

// หน้าเกมต้องอยู่ในเซิร์ฟเวอร์พรีวิวเท่านั้น ลิงก์ภายนอก (https) เปิดในเบราว์เซอร์ปกติแทน
function lockPreviewToOrigin(target, url) {
  const origin = new URL(url).origin;
  target.webContents.on('will-navigate', (event, next) => {
    if (new URL(next).origin === origin) return;
    event.preventDefault();
    if (/^https:/.test(next)) shell.openExternal(next);
  });
  target.webContents.setWindowOpenHandler(({ url: next }) => {
    if (/^https:/.test(next)) shell.openExternal(next);
    return { action: 'deny' };
  });
}

// F5 = รีโหลด · F12 = เปิดเครื่องมือดูโค้ด (ไว้ดู error ของเกม)
function addPreviewShortcuts(target) {
  target.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') {
      event.preventDefault();
      target.webContents.reloadIgnoringCache();
    } else if (input.key === 'F12') {
      event.preventDefault();
      target.webContents.toggleDevTools();
    }
  });
}

function reloadPreview() {
  if (!previewWin || previewWin.isDestroyed()) return false;
  previewWin.webContents.reloadIgnoringCache();
  return true;
}

function closePreview() {
  if (previewWin && !previewWin.isDestroyed()) previewWin.close();   // 'closed' จะหยุดเซิร์ฟเวอร์ให้
  else Preview.stopPreview();
  return true;
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => Preview.stopPreview());   // ไม่ทิ้งเซิร์ฟเวอร์เกมค้างไว้หลังปิดโปรแกรม
