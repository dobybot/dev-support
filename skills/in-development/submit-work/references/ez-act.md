# ส่งงาน ez-act และผูก PR กับ Artemis ACC

## ตรวจงานก่อนส่ง

อ่าน `AGENTS.md`, `docs/agents/issue-tracker.md` และ `docs/management/README.md`
ของ checkout ปัจจุบัน ตรวจ branch, git status, diff และ remote
ห้าม commit/push บน `main` หรือ `UAT` โดยตรง ทุก PR ต้องเข้า `UAT` ตัวพิมพ์ใหญ่

ชื่อ branch ที่ start-work สร้างคือ `{TICKET}--{track}--{slug}`:
- `ACC-...`: อ่าน Artemis item และ GitHub Issue ที่เชื่อมอยู่
- `GH-<number>`: อ่าน GitHub Issue และตามลิงก์ ACC ที่ยืนยันได้
- `none`: ถ้าไม่มีงานที่ผู้ใช้ระบุเพิ่มเติม ให้ข้าม Artemis ไม่สร้าง ticket เอง
- branch รูปแบบอื่น: ใช้ issue/ACC ที่ผู้ใช้ระบุหรือหลักฐานใน PR/issue เดิม
  ห้ามเดา ACC จากหัวข้อคล้ายกัน ถ้าจำเป็นต้องเลือกงานให้ถามเฉพาะว่าจะผูกกับงานใด

ทั้ง `fast-track` และ `normal-track` ใช้ flow เดียวกันคือ PR เข้า `UAT`
อ่าน issue พร้อม comments ผ่าน `gh` และอ่าน Artemis ผ่าน tool ที่มีอยู่
อ่าน URL ของ Artemis จากผลจริง ห้ามเดาลิงก์ ถ้าไม่มี URL ให้ใช้ key และรายงานข้อจำกัด

ตรวจเกณฑ์รับงานและผล validation ที่เหมาะกับสิ่งที่เปลี่ยน
หากมี failure ที่ยังแก้ไม่ได้ให้รายงาน ห้ามอ้างว่าเทสต์ผ่าน
stage เฉพาะไฟล์งานที่ตรวจแล้ว ไม่ใช้ `git add .` เมื่อมีงานอื่นปะปน
ตรวจ staged diff ก่อน commit; ถ้าไม่มี diff ไม่สร้าง empty commit
คำสั่งส่งงานจากผู้ใช้อนุญาตให้ commit/push branch งาน สร้าง PR และผูก Artemis
ไม่ต้องขออนุญาตซ้ำสำหรับขั้นตอนเหล่านี้

## เปิดหรือใช้ PR เดิม

1. ตรวจ PR เดิมของ head branch ใน `ez-dev-cluster/ez-act` ก่อน เพื่อไม่สร้างซ้ำ
   ตรวจทั้ง open และ merged/closed ถ้า PR เดิม merge แล้วและไม่มีงานใหม่ ให้ sync สถานะเท่านั้น
   ถ้ามีงานใหม่หลัง PR เดิมจบ ให้แยกเป็นงานส่งรอบใหม่ตาม diff จริง
2. Push เฉพาะ branch งาน ไม่ force-push
3. เปิด PR ด้วย `gh pr create --repo ez-dev-cluster/ez-act --base UAT --head <branch> ...`
   หรือปรับ PR เดิมในขอบเขตงาน ใช้ `--body-file` สำหรับข้อความหลายบรรทัด
   หัวข้อระบุงานที่เปลี่ยนจริง body ระบุผลที่ผู้ใช้เห็น, วิธีตรวจ, GitHub Issue และ ACC ที่เกี่ยวข้อง
   ใส่ลิงก์กลับทั้งสองระบบเมื่อยังขาดและเกี่ยวข้องกับงานนี้
4. อ่าน `gh pr view <url> --json baseRefName` หลังสร้างหรือแก้ปลายทาง ผลต้องเป็น `UAT`
   ถ้า PR เดิมที่ยังเปิดอยู่ชี้ผิด ให้แก้ด้วย `gh pr edit <url> --base UAT` และตรวจซ้ำ
   ห้ามสร้าง PR เข้า `main` และไม่ merge จากคำสั่ง submit-work

## ผูก PR และสถานะจริงเข้า Artemis

การใส่ URL ในคอมเมนต์อย่างเดียวไม่ทำให้ PR แสดงในแถบ PR ของงาน
ใช้ `mcp__artemis__link_pull_request` กับ ACC key ที่ยืนยันว่าเกี่ยวข้อง
ถ้า PR เกี่ยวหลายงาน ให้ผูกแต่ละ key; subtask ใช้ key ของ subtask เอง

อ่านค่าจริงจาก GitHub ทุกครั้ง:

```bash
gh pr view <url> --json url,title,state,author,mergedBy,baseRefName,createdAt,mergedAt
```

ส่งค่าที่อ่านได้เข้า `link_pull_request`:
- `key`, `url`, `title`
- `status`: `OPEN` → `open`, `MERGED` → `merged`, `CLOSED` → `closed`
  ห้ามตีความ closed ว่า merged และห้ามกำหนด open ตายตัวเมื่อใช้ PR เดิม
- `openedBy` = `author.login`, `openedAt` = `createdAt`
- `targetBranch` = `baseRefName`, `environment` = `UAT` สำหรับ PR เข้า `UAT`
- เมื่อ merge แล้วส่ง `mergedBy.login` และ `mergedAt` เมื่อมีค่าจริง ไม่ส่ง null แทน string

tool เป็น upsert ตาม (key, url) เรียกซ้ำเพื่ออัปเดตแถวเดิมได้
อ่านกลับด้วย `mcp__artemis__list_pull_requests` เพื่อยืนยัน URL, branch และสถานะ
ถ้า tool ไม่พร้อมหรือเรียกไม่สำเร็จ ให้รายงานว่า PR เปิดแล้วแต่ยังผูกไม่สำเร็จ
เก็บ URL ไว้สำหรับ retry ไม่สร้าง PR ซ้ำและไม่รายงานว่าผูกสำเร็จ

เพิ่มคอมเมนต์ส่งต่องานภาษาไทยใน ACC ระบุสิ่งที่เปลี่ยน, จุดที่ควรทดสอบ,
ลิงก์ PR และ GitHub Issue ถ้ามี โดยตรวจคอมเมนต์เดิมก่อนเพื่อไม่โพสต์ซ้ำเมื่อ retry
ระบุว่า PR ยังรอ merge หากยัง open อย่าอ้างว่าโค้ดขึ้น UAT แล้วจากการเปิด PR เพียงอย่างเดียว
ไม่ย้ายสถานะ feature เป็น Done หรือสร้าง labels แบบ Dobybot อัตโนมัติ
สถานะ PR กับสถานะ feature เป็นคนละเรื่อง; การเปลี่ยนสถานะ feature ต้องมีคำสั่ง/กติกาที่รองรับ
และต้องอ่าน `get_board` ก่อนเปลี่ยน status เสมอ

## หลังมีคน merge บน GitHub

Artemis tool ระบุว่าโปรเจกต์ที่เชื่อม GitHub App จะ sync PR ทุก 15 นาที
รวมถึงแถวที่ผูกผ่าน API ด้วย ต้องตรวจการเชื่อมต่อและ repo ที่ติดตามในโปรเจกต์ ACC
ก่อนรับรองว่าอัปเดตเองได้ และตรวจตาราง branch → environment ให้ `UAT` ตรงกับ `UAT`
เพราะค่าจากตารางอาจทับ `environment` ที่ส่งผ่าน tool

การมี PR ในรายการหรือค่า source=api/github ไม่ใช่หลักฐานยืนยันการเชื่อม GitHub App
ถ้าเครื่องมือที่มีไม่แสดง settings ให้รายงานว่ายังยืนยัน auto-sync ไม่ได้
ห้ามสรุปว่าการเรียก link_pull_request เพียงครั้งเดียวทำให้ติดตาม merge อัตโนมัติ
ห้ามสร้าง polling automation เองจากการส่งงานครั้งเดียว

เมื่อผู้ใช้ขอ sync สถานะหรือสั่ง merge เข้า UAT ในภายหลัง ให้ดึงค่าจริงจาก GitHub
และ upsert แถวเดิมพร้อม mergedBy/mergedAt ทันทีโดยไม่ต้องรอรอบ sync
การอัปเดตสถานะ PR ไม่ได้เปลี่ยนสถานะ feature เป็น Done

## รายงานผล

สรุปลิงก์ PR, ปลายทาง `UAT`, ผลตรวจ, ACC ที่ผูก และสถานะที่อ่านกลับจาก Artemis
แยกให้ชัดว่าผูกสำเร็จแล้วหรือยัง และยืนยันการ sync อัตโนมัติได้หรือยัง
ถ้าไม่มี ACC ให้ระบุว่าข้ามการผูกเพราะไม่มีงานที่ยืนยันได้
