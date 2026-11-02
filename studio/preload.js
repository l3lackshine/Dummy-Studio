'use strict';
// สะพานเดียวระหว่างหน้าต่างกับระบบ — renderer เรียกได้เฉพาะคำสั่งที่ main.js ประกาศไว้
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studio', {
  call: (name, ...args) => ipcRenderer.invoke('studio:' + name, ...args).then(r => { if (!r || !r.ok) throw new Error((r && r.error) || 'ผิดพลาด'); return r.data; }),
  on: (ev, cb) => { const f = (_e, d) => cb(d); ipcRenderer.on(ev, f); return () => ipcRenderer.removeListener(ev, f); },
});
