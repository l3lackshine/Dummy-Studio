'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path'), fs = require('fs');
const P = require('./lib/project'), Runner = require('./lib/runner');

let win = null, root = null;
const send = (ev, d) => { if (win && !win.isDestroyed()) win.webContents.send(ev, d); };

function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1000, minHeight: 640, backgroundColor: '#1d2229', title: 'Dummy Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// ---------- IPC ----------
const H = (name, fn) => ipcMain.handle('studio:' + name, async (_e, ...a) => { try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: err.message }; } });
const need = () => { if (!root) throw new Error('ยังไม่ได้เปิดโปรเจกต์'); return root; };
H('pick', async () => { const r = await dialog.showOpenDialog(win, { title: 'เลือกโฟลเดอร์โปรเจกต์ Dummy Online', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
H('open', p => { const info = P.openProject(p); root = info.root; return info; });
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
H('run', kind => Runner.runTask(need(), kind, send));
H('stop', () => Runner.stop());
H('reveal', rel => { shell.showItemInFolder(P.inside(need(), rel)); return true; });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
