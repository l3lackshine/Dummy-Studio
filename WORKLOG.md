# WORKLOG — สมุดส่งต่องาน Dummy Studio
> เรียงใหม่สุดไว้บน · ห้ามลบรายการเก่า · ทุกแชท/AI ต้องอ่านก่อนเริ่มและเขียนก่อนจบ
> ใช้กติกาเดียวกับ `CLAUDE.md` ของเกม Dummy-Online (ถามก่อนเมื่อไม่แน่ใจ · ทำบน branch `ai/<ระบบ>-<งาน>` · ห้ามจัดรูปโค้ดเดิมเอง · ตอบ/คอมเมนต์เป็นไทย)
> Studio อยู่คนละ repo กับเกม — บันทึกงานของ Studio ที่นี่ ไม่ใช่ใน `docs/WORKLOG.md` ของเกม

## สถานะปัจจุบัน
- งานที่กำลังทำ: ไม่มี · เวอร์ชันต้นแบบ 0.1 + ซ่อมพาธ Assets/ + เกมจำลอง (branch `ai/studio-fix-asset-paths`)
- งานค้างเรียงลำดับ:
  1. เจ้าของลองบน Windows จริง: โหลดไฟล์ `.exe` จาก GitHub Actions ▸ *Build Dummy Studio (Windows)* ▸ เปิดโปรเจกต์ ▸ Tools ▸ ติดตั้งแพ็กเกจเซิร์ฟเวอร์ ▸ 🎮 เกมจำลอง
  2. (เสนอ ยังไม่ได้รับอนุมัติ) ไฟล์ `studio/.gitignore` กัน `node_modules/` · `package-lock.json` · `dist/`
  3. ต่อไปตามแผน: Blueprint เอฟเฟคบนโต๊ะ · Playground (บอทเล่นหลายพันตา) · ตัวแก้หน้าจอ/ปุ่ม (ต้องแตะไฟล์แกนของเกม)
- คำถามที่รอเจ้าของตอบ: (ว่าง)
- ข้อห้ามชั่วคราว: ไม่มี
- กับดักที่ควรรู้ก่อนเริ่ม:
  - โค้ดเดิมของ Studio เขียนแน่นหลายคำสั่งต่อบรรทัด — **ห้ามจัดรูปทั้งไฟล์** · โค้ดใหม่เขียนแบบอ่านง่าย (ดู `lib/preview.js` เป็นตัวอย่าง)
  - พาธข้อมูลเกมรวมอยู่ที่ค่าคงที่ `ASSETS` / `SRC` ใน `studio/lib/project.js` — เกมย้ายโฟลเดอร์อีกให้แก้ที่นี่ที่เดียว
  - repo ยังไม่มี `.gitignore` — `npm install` จะสร้าง `studio/node_modules/` และ `package-lock.json` ห้าม `git add -A`
  - เกมจำลองต้องไม่แตะฐานข้อมูลจริง: อย่าเปลี่ยน `OFFLINE_ENV` ใน `lib/preview.js` และอย่ารันเซิร์ฟเวอร์ผ่าน `npm start` (มัน `-r ./src/env.js` อ่าน `.env`)

## รายการงาน (ใหม่สุดบน)

### 2026-11-07 05:40 · Claude (claude-opus-5-5) · เกมจำลอง (แบบ ก. พรีวิว)
- คำสั่งที่ได้รับ: "ทำแบบ ก แล้ว อัปพร้อมกัน เขียน worklog แยกเป็นของตัวเอง" — แบบ ก = เปิดหน้าเกมจริงใน Studio เพื่อดูผลการแก้ข้อมูล
- branch: `ai/studio-fix-asset-paths` · commit `36969c4`
- สร้างใหม่:
  - `studio/lib/preview.js` — รันเซิร์ฟเวอร์เกมแบบออฟไลน์ (ไม่อ่าน `server/.env`, ล้าง `SUPABASE_*`/`PACK_MASTER`) + เว็บเซิร์ฟเวอร์ `127.0.0.1` เสิร์ฟ `client/public` โดยแทน `config.js` (ชี้เซิร์ฟเวอร์ในเครื่อง, ปิดระบบบัญชี) · ซ่อน `pack/manifest.json` ให้ `pack-loader.js` ใช้โหมดพัฒนา · รูป `/Assets/...` ที่ไม่มีใน `client/public` หาต่อที่ `assets-src/Assets/...` · กัน `../` · รับแค่ GET/HEAD
  - `studio/test/test-preview.js` — เทส 11 ข้อบนสำเนาชั่วคราว (รวม `.env` ปลอมเพื่อพิสูจน์ว่าไม่ถูกอ่าน)
  - `WORKLOG.md` (ไฟล์นี้)
- แก้:
  - `studio/main.js` — เพิ่ม `require('./lib/preview')` · IPC `preview` / `previewReload` / `previewStop` · หน้าต่างเกมแยก (sandbox, ไม่มี preload, ล็อกให้อยู่ใน origin ของพรีวิว, F5/F12) · Build เสร็จแล้วรีโหลดเกม · เปิดโปรเจกต์อื่น/ปิดหน้าต่างหลัก/ปิดโปรแกรม = หยุดเซิร์ฟเวอร์
  - `studio/renderer/app.js` — หมวดใหม่ "เกมจำลอง" (`openPreview`, `reloadPreview`, `closePreview`, `wirePreview`) · ปุ่ม 🎮 ใน runbar · 4 รายการในเมนู Tools · ปุ่ม F8 · เรียก `wirePreview()` ใน `start()`
  - `studio/renderer/style.css` — ต่อท้าย `.rbtn.on`
  - `studio/test/ui-smoke.js` — mock `preview*` ด้วย lib จริง + ฟังก์ชัน `checkPreviewButton`
  - `studio/README.md` — หมวด 🎮 เกมจำลอง + คำสั่งเทส
- ไม่ได้แตะ (แต่เกี่ยวข้อง): repo เกม Dummy-Online ทั้งหมด (`pack-loader.js`, `config.js`, `server/src/*`) — พรีวิวใช้ความสามารถที่เกมมีอยู่แล้ว (โหมดไม่มี Supabase + โหมดพัฒนาของ pack-loader)
- ตรวจแล้ว (กับเกม Beta 0.18.5 บนสำเนาชั่วคราว):
  - `node --check` ทุกไฟล์ที่แก้ ผ่าน
  - `node test/test-preview.js <เกม>` ผ่าน 11/11
  - `node test/ui-smoke.js <เกม>` ผ่าน 15/15 (รวมปุ่มเกมจำลอง)
  - `node test/test-project.js <เกม>` ผ่าน 16/16
  - เปิดในเบราว์เซอร์ 844×390: หน้าแรก → เล่นคนเดียว → ห้องบอท → แจกไพ่ดัมมี่ได้จริง, socket ต่อเซิร์ฟเวอร์ในเครื่อง, ไม่มี pageerror
  - รัน Electron 33 จริงบน Linux (xvfb): เรียก `preview` ได้หน้าต่างเกม, หน้าเกมไม่เห็น `window.studio`/`require`, `previewStop` แล้วเซิร์ฟเวอร์หยุดจริง
- **ยังไม่ได้ทดสอบ**: Windows จริง · ไฟล์ `.exe` จาก GitHub Actions · การกดปุ่มด้วยมือในแอป Electron (ทดสอบผ่านคำสั่ง IPC)
- สถานะ: เสร็จ
- งานค้าง/ขั้นต่อไป: ดู "สถานะปัจจุบัน"
- คำถามที่รอตอบ: (ว่าง)
- วิธีย้อนกลับ: `git revert 36969c4` (เอาเกมจำลองออก ซ่อมพาธยังอยู่)
- ข้อควรระวัง: เกมยังโหลดฟอนต์ Google + `cdn.socket.io` + `cdn.jsdelivr.net` จากอินเทอร์เน็ต — เครื่องที่ไม่มีเน็ตจะเปิดเกมจำลองไม่ขึ้น (เป็นพฤติกรรมของเกม ไม่ใช่ Studio)

### 2026-11-07 05:15 · Claude (claude-opus-5-5) · ซ่อมพาธให้ใช้กับเกมปัจจุบัน
- คำสั่งที่ได้รับ: "ซ่อมพาธเลย" — Studio หาไฟล์ที่ `client/public/Character/...` แต่เกมย้ายไป `client/public/Assets/...` และ `assets-src/Assets/...` แล้ว ทำให้โหลดได้ 0 รายการ
- branch: `ai/studio-fix-asset-paths` (แตกจาก `main` `abd27ff`) · commit `02e5066`
- สร้างใหม่: —
- แก้: `studio/lib/project.js` (ค่าคงที่ `ASSETS`, `SRC` + ทุกจุดที่อ้างพาธตัวละคร/ไอเทม/ตู้กาชา/ไฟล์ตั้งค่า + ข้อความเตือนรูปตัวละคร + export) · `studio/test/test-project.js`, `studio/test/ui-smoke.js`, `studio/README.md` (พาธให้ตรง)
- ไม่ได้แตะ (แต่เกี่ยวข้อง): `studio/renderer/app.js` (พาธ `'./...'` ของไอเทมเก่าอ้าง `client/public/` ถูกแล้ว)
- ตรวจแล้ว: `node --check` ผ่าน · `test-project.js` 16/16 · `test-runner.js` (check สำเร็จ, เทสเซิร์ฟเวอร์ 24/24) · `ui-smoke.js` 12/12
- สถานะ: เสร็จ
- วิธีย้อนกลับ: `git revert 02e5066`
