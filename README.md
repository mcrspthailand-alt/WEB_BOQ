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

ตัว WEB BOQ v15 ถูก gzip + base64 ไว้ที่ `public/legacy-v15.html.gz.b64` และ Next.js route `/legacy` จะ decode + gunzip แล้วเสิร์ฟเป็น HTML ภายใน Next.js app shell เพื่อให้ migration ครั้งแรกคง behavior เดิมให้มากที่สุด ก่อน refactor ทีละโมดูลเป็น React components ในระยะถัดไป

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

## Health check

`GET /api/health`

## Docker / Easypanel

Repository มี multi-stage `Dockerfile` และตั้ง `next.config.mjs` เป็น `output: 'standalone'`

- Container port: `3000`
- `PORT=3000`
- `HOSTNAME=0.0.0.0`
- ไม่จำเป็นต้องกำหนด environment variable เพิ่มสำหรับ prototype ปัจจุบัน

## Repository

`git@github.com:mcrspthailand-alt/WEB_BOQ.git`
