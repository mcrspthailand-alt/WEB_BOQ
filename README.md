# WEB BOQ

WEB BOQ สำหรับสาขาวิชาวิศวกรรมโยธา มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น

## Stack

- Next.js App Router
- React 19
- TypeScript
- Docker / Easypanel compatible

## Migration approach

รุ่นนี้เป็น compatibility migration จาก WEB BOQ HTML prototype v15 ไปสู่ Next.js โดยคง logic ที่ผ่านการพัฒนามาแล้วทั้งหมด เช่น

- BOQ และฐานราคาวัสดุ/ค่าแรง สพฐ. 2569
- MLR quantity estimation
- ห้องน้ำ / สุขาภิบาล / ระบบไฟฟ้าอัตโนมัติ
- Factor F
- Export ปร.4 / ปร.5, CSV และ JSON
- Local browser save

ตัว WEB BOQ v15 ถูกประกอบกลับจาก verified source fragments ระหว่าง build แล้วถูกเก็บเป็น `public/legacy-v15.html.gz.b64` สำหรับ Next.js route `/legacy` เพื่อรักษา behavior เดิมก่อน refactor เป็น React components ทีละส่วน

## Development

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

## Validation

```bash
npm run verify:legacy
npm run typecheck
npm run build
```

GitHub Actions ยัง build Docker image และ run container smoke test ที่ `/api/health` ทุกครั้งที่ push เข้า `main`

## Health check

`GET /api/health`

ควรได้ HTTP 200 และ JSON เช่น:

```json
{"ok":true,"service":"WEB_BOQ","runtime":"Next.js","legacyUi":"v15"}
```

## Docker / Easypanel

Repository ใช้ multi-stage `Dockerfile` และ `next.config.mjs` ตั้ง `output: 'standalone'`

### ค่าที่ต้องใช้ใน Easypanel

- Build type: **Dockerfile**
- Dockerfile path: **Dockerfile**
- Branch: **main**
- Internal / App port: **3000**
- Protocol: **HTTP**
- Health check path: **/api/health**
- Health check port: **3000**
- `PORT=3000`
- `HOSTNAME=0.0.0.0`
- ไม่ต้องตั้ง Start Command เพิ่ม เพราะ image ใช้ `node server.js` อยู่แล้ว
- อย่าตั้ง domain target ไปที่ port 80; ให้ชี้ service ไปที่ **3000**

### ถ้าขึ้น `Waiting for service ... to start...`

1. ตรวจว่า Service ใช้ **Dockerfile** ไม่ใช่ Nixpacks/Buildpacks
2. ตรวจ Domain / Port mapping ให้เป็น **3000**
3. ลบ Start Command ที่เคยตั้งเอง เช่น `npm start`, `next start`, `npm run dev`
4. ตั้ง Health Check เป็น `/api/health` port `3000`
5. Redeploy แบบ **Rebuild without cache** หากมี image เก่าค้าง
6. หากยังไม่ขึ้น ให้เปิด Container Logs แล้วตรวจว่ามีข้อความ `Ready` / `Listening` หรือ error ก่อน process exit

## Repository

`git@github.com:mcrspthailand-alt/WEB_BOQ.git`
