# เริ่มงาน ez-act

## กติกาและข้อมูลก่อนเริ่ม

อ่าน `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/management/README.md`
และ `README.md` ใน checkout ที่จะทำงาน ใช้ `CONTEXT.md` เมื่อต้องตีความคำทางธุรกิจ

- GitHub Issues ของ `ez-dev-cluster/ez-act` ระบุงานลงมือทำและเกณฑ์ตรวจรับ
  อ่าน issue และ comments ด้วย `gh issue view <number> --repo ez-dev-cluster/ez-act --comments`
- Artemis ACC ระบุ feature, roadmap, milestone และ priority อ่าน item ที่เกี่ยวข้อง
  ผ่าน Artemis tool ที่มีอยู่เมื่อเข้าถึงได้ ห้ามสร้างหรือเปลี่ยน item เพียงเพราะเริ่มงาน
- ถ้าผู้ใช้ให้ `ACC-...` ให้ตามลิงก์ไปอ่าน GitHub Issue ที่เกี่ยวข้องด้วย
  ถ้าไม่มีลิงก์ ให้ค้นหาเลข ACC ใน GitHub Issues ของ repo และตรวจเนื้อหาก่อนเลือก
  ถ้ามีหลายงานที่ยังแยกไม่ได้จากคำสั่งผู้ใช้ ให้ถามว่าจะเริ่มงานใดโดยอธิบายผลลัพธ์ของแต่ละงาน
  ถ้ายังไม่มี issue ให้รายงานและใช้ขอบเขตงานจาก ACC ที่อ่านได้ ไม่สร้าง issue เอง
- ถ้าเข้าถึงแหล่งข้อมูลที่จำเป็นต่อขอบเขตงานไม่ได้ ให้รายงานข้อจำกัดและหยุดส่วนที่พึ่งข้อมูลนั้น
  อย่าเดาสถานะ Artemis จาก GitHub
- ถ้าไม่ระบุ ticket/issue ให้ใช้คำอธิบายงานจากผู้ใช้ ไม่บังคับสร้าง ticket

## ชื่อ branch และ track

ใช้รูปแบบเดียวกับ Dobybot: `{TICKET}--{track}--{slug}` ไม่มี `codex/` นำหน้า
สำหรับงานที่เริ่มผ่าน skill นี้ ตามที่เจ้าของโปรเจกต์เลือก

- `TICKET`: ใช้รหัส ACC เมื่อผู้ใช้ให้ ACC หรือ issue มีลิงก์ ACC ที่ยืนยันได้
  ถ้ามีเฉพาะ GitHub Issue ใช้ `GH-<number>`; ไม่ผูกงานใช้ `none`
- `slug`: สรุปงานที่จะลงมือทำเป็นอังกฤษ kebab-case สั้น ไม่เกินประมาณ 60 ตัวอักษร
  เมื่อ ACC มีหลาย GitHub Issues ให้ใส่ `gh-<number>-` ต้น slug เพื่อแยก branch
- `track`: ใช้ค่าที่ผู้ใช้ระบุ ถ้าไม่ระบุให้เลือก `fast-track` สำหรับงานเล็ก/แก้บั๊ก
  ที่ผลกระทบจำกัด และ `normal-track` สำหรับงานใหญ่หรือยังประเมินผลกระทบไม่ได้
  แจ้งค่าที่เลือกในรายงาน ไม่ต้องถามผู้ใช้เรื่องทางเทคนิคนี้
- **track เป็นเพียงส่วนหนึ่งของชื่อ ทุก track สร้างจาก `origin/UAT` และส่ง PR เข้า `UAT`**
  ไม่มีเส้นทาง fast-track เข้า `main` และห้ามใช้ `uat` ตัวพิมพ์เล็กแทน

ตัวอย่าง: `ACC-123--fast-track--fix-unit-name`,
`GH-42--normal-track--add-report`, `none--fast-track--fix-typo`
เลขเหล่านี้เป็นตัวอย่าง ไม่ใช่งานที่ต้องไปอ่านโดยอัตโนมัติ

## เตรียม branch / worktree

1. ตรวจ `git status --short`, `git branch --show-current`, `git worktree list --porcelain`
   และ `git rev-parse --path-format=absolute --git-common-dir`
   เพื่อแยก checkout ปัจจุบันออกจาก checkout ต้นทาง รวมถึง worktree ที่ Codex/แอปสร้างให้แล้ว
   อย่ายึดชื่อโฟลเดอร์เฉพาะแอปเป็นหลักฐานเพียงอย่างเดียว
2. ค่าเริ่มต้นคือ `no-worktree`; ถ้าผู้ใช้ระบุ `worktree` ให้แยกโฟลเดอร์
   ถ้า session อยู่ใน worktree ที่แอปเตรียมให้แล้ว ให้ใช้ที่เดิม ไม่สร้างซ้อน
3. ดึง base ด้วย `git fetch origin UAT` และยืนยันว่า `origin/UAT` มีอยู่
   ถ้าไม่มีหรือ fetch ไม่สำเร็จ ให้หยุด ห้ามใช้ `main` แทน
4. เลือกวิธีตามสถานะ:
   - **no-worktree:** เมื่อ working tree สะอาด ใช้
     `git switch -c <branch> origin/UAT` ไม่ checkout หรือแก้ไข `main`
   - **worktree ใหม่:** ใช้ `git worktree add -b <branch> <destination> origin/UAT`
     โดยวางเป็น sibling ของ checkout ต้นทางใน `ez-act-worktree/<branch>`
     ไม่ต้องย้าย branch ของ checkout ต้นทาง
   - **worktree ที่แอปสร้างให้:** ตรวจว่าไม่มีงานค้างและไม่มี commit ของงานเดิม
     ที่จะถูกทิ้งไว้ก่อนใช้ `git switch -c <branch> origin/UAT` ใน worktree ปัจจุบัน
     ตรวจความต่างกับ base และประวัติ branch; ถ้ายืนยันไม่ได้ว่าเป็น checkout ใหม่
     ให้รายงานสิ่งที่พบและหยุด ห้าม `reset --hard` เพื่อบังคับให้ตรง base
5. ถ้าต้องสลับ branch แต่มีงานค้าง ให้รายงานและหยุด ไม่ stash/discard เอง
   ถ้าชื่อ branch/path ซ้ำ ให้ตรวจว่าตรงงานเดิมหรือไม่แล้วรายงาน ห้ามลบหรือเขียนทับเอง

`main` ทั้ง local และ remote สงวนให้เจ้าของจัดการเอง ห้าม commit, push, merge,
rebase, reset, force-push หรือลบ และห้ามเปิด PR เข้า `main`

## เตรียมไฟล์ตั้งค่าและ dependencies

- อ่าน `README.md`, `package.json`, `.env.example` และ `.gitignore` ของ checkout ปลายทาง
  เป็นหลักฐานคำสั่งและไฟล์ที่ต้องใช้ ห้ามนำ `task dev` หรือไฟล์ตั้งค่าของ Dobybot มาใช้
- `no-worktree`: ใช้ `.env.local` ที่มีอยู่ ไม่เขียนทับ
- worktree ใหม่/ที่แอปสร้าง: ถ้าปลายทางยังไม่มี `.env.local` ให้คัดลอกจาก checkout ต้นทาง
  เป็นไฟล์แยก ไม่ symlink ไม่แสดงค่า secrets และยืนยันว่าไฟล์ถูก Git ignore
  ถ้าปลายทางมีไฟล์อยู่แล้วให้เก็บไว้ ถ้าต้นทางไม่มีให้รายงานว่ายังเตรียม env ไม่ครบ
  และชี้ขั้นตอนตั้งค่าใน `README.md` ห้ามสร้าง deployment หรือ credentials เอง
- การคัดลอก `.env.local` ยังชี้ไป Convex deployment เดิม ไม่ได้แยกฐานข้อมูลตาม worktree
  ระบุข้อนี้ในรายงานเมื่อมีการคัดลอก เพื่อไม่ให้เข้าใจว่าเป็นฐานข้อมูลใหม่
- ติดตั้ง dependencies ใน checkout ปลายทางด้วย `pnpm install --frozen-lockfile`
  ถ้าไม่สำเร็จให้รายงานสาเหตุ ไม่เปลี่ยน lockfile เพื่อให้ผ่านเอง
- ไม่รัน `convex dev`, ตั้งค่า environment ฝั่ง Convex, seed หรือ deploy อัตโนมัติ
  เพราะอยู่นอกการเตรียม branch และอาจแก้ไข deployment ที่ใช้งานร่วมกัน

## รายงานแล้วหยุด

รายงานงานที่อ่าน, branch, track, base `UAT`, mode, path และสถานะ env/dependencies
ระบุส่วนที่ยังเตรียมไม่ครบตามจริง แล้วให้คำสั่งรันต่อจาก README ปัจจุบัน:

```bash
# หน้าต่างที่ 1: รันใน checkout ปลายทาง
pnpm exec convex dev
# หน้าต่างที่ 2: รันใน checkout เดียวกัน
pnpm dev
```

เว็บใช้ port `3001` ถ้ามีงานอื่นใช้อยู่ให้แจ้ง ไม่ปิดโปรเซสหรือเปลี่ยน port เอง
เตือนว่าการส่งงานภายหลังต้องใช้ `gh pr create --base UAT ...`
และตรวจ `baseRefName` หลังสร้าง PR ไม่เรียกขั้นตอนส่งงานของ Dobybot
ที่อาจนำเข้า `main`; การเรียก start-work ครั้งนี้ยังไม่ใช่คำสั่งให้เปิด PR
