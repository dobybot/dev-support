---
name: run-workflow
description: "Run a cost-aware dynamic workflow: pick model/effort per stage, label sub-agents by tier (s2, o3), show cost estimate before running, report actual usage + cost after. Trigger: /run-workflow <task>."
argument-hint: "task description ที่อยากให้จัด workflow รัน เช่น '/run-workflow audit error handling ทั้ง repo'"
disable-model-invocation: true
---

# /run-workflow — รัน workflow แบบรู้ต้นทุน

รับ task description → ออกแบบ workflow ที่**เลือก model/effort ต่อ stage ตามความยากของงาน**
(ไม่ใช้ model แพงสุดพร่ำเพรื่อ) → แสดงแผน + ประเมิน cost ให้ user อนุมัติก่อนรัน →
รันโดย label ทุก agent บอก model/effort → จบแล้วรายงาน token จริง + cost estimate

ต้องมี task description — ถ้า user พิมพ์ `/run-workflow` เปล่า ๆ ให้ถามว่าจะให้รันงานอะไร

## Label convention (บังคับทุก `agent()` call)

Label = `<model><effort>:<ชื่องานสั้น ๆ>` เช่น `s2:find-bugs`, `o3:verify-auth`, `h1:format`

| ตัวอักษร | model | ตัวเลข | effort |
|---|---|---|---|
| `h` | haiku | `1` | low |
| `s` | sonnet | `2` | medium |
| `o` | opus | `3` | high |
| `f` | fable (inherit, ไม่ใส่ `model`) | `4` | xhigh |
| | | `5` | max |

คนดู `/workflows` จะรู้ทันทีว่า agent ไหนแพงแค่ไหน — prefix ต้องตรงกับ `model`/`effort`
ที่ส่งจริงใน opts เสมอ (อย่าให้ label โกหก)

**และต้องใส่ tag เดียวกันเป็นบรรทัดแรกของ prompt ด้วย** เช่น
`agent('[s2:find-bugs]\nหา bug ใน …', {label: 's2:find-bugs', model: 'sonnet'})` —
transcript ไม่เก็บ opts.label ไว้ `usage_report.py` จึง map ตาราง usage
กลับเป็นชื่อ agent จาก tag ในบรรทัดแรกของ prompt เท่านั้น ไม่มี tag = ตารางโชว์แต่ต้น prompt

## Model/effort policy

Default = **ไม่ใส่ `model`** (inherit session model) เฉพาะ stage ที่มั่นใจว่า tier อื่นพอ
ค่อย override ลง แนวทาง:

| ลักษณะงาน | เลือก |
|---|---|
| mechanical: reformat, rename, สรุปสั้น, แปลง format, เก็บ list ไฟล์ | `h1` หรือ `s1` |
| อ่าน/ค้นโค้ด, เขียนโค้ดทั่วไป, สรุปเอกสาร | `s2` |
| review, debug ที่ต้องไล่ logic, เขียนโค้ดส่วนยาก | `o2`–`o3` หรือ inherit (`f2`) |
| adversarial verify, judge panel, design/architecture ยาก ๆ | `o3`+ หรือ `f3`+ |

หลักคิด (สรุปจาก [Anthropic: choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)):

- ใช้ model ถูกสุดที่ผ่านงานได้สม่ำเสมอ — จ่ายแพงเฉพาะจุดที่ตัดสินคุณภาพ
  (verify/judge/synthesize) งาน fan-out ปริมาณมากใช้ tier ถูก แล้วให้ tier แพง verify ทีหลัง
- **ปรับ effort ก่อนคิดเปลี่ยน model** — effort เป็น lever ที่ละเอียดกว่า
  (เช่น `o2` มักดีกว่าโดด `s2` → `f3`)
- อย่าเหมาว่า tier ถูก = ประหยัดเสมอ: model เก่งกว่าอาจถูกกว่าจริงเมื่องานยาก
  เพราะ retry น้อยกว่า/ verify ตัวเองดีกว่า — ถ้า stage ไหนคาดว่าจะวนแก้หลายรอบ
  อย่าลด tier ที่ stage นั้น
- ราคาต่อ 1M input/output: haiku 4.5 = $1/$5 · sonnet 5 = $3/$15 · opus 5 = $5/$25 ·
  fable 5 = $10/$50 — ช่องว่างระหว่าง tier ราว 2–3 เท่า ไม่ใช่ 10 เท่า
  การเลือกผิดไปทาง "แพงเกิน" เจ็บน้อยกว่าผิดไปทาง "โง่เกินจนต้องรันใหม่"

## ขั้นตอน

### 1. ออกแบบ workflow

**อ่าน [references/calibration-log.md](references/calibration-log.md) ก่อน** — ส่วน Lessons
คือบทเรียนจาก run ก่อน ๆ ว่าเคยเลือก model/effort พลาดตรงไหน ให้น้ำหนักมันเหนือสัญชาตญาณ

จาก task description ออกแบบตามแนวทางของ Workflow tool (pipeline เป็น default,
barrier เฉพาะที่จำเป็น, adversarial verify สำหรับงาน review/audit ฯลฯ)
กำหนด model/effort ต่อ stage ตาม policy ข้างบน และตั้ง label ตาม convention

### 2. แสดงแผน + pre-run cost estimate แล้ว**รอ user อนุมัติ**

แสดงก่อนรันเสมอ (ห้ามข้ามแม้ดูเป็นงานเล็ก):

- โครง workflow: phase อะไรบ้าง, agent กี่ตัว, ตัวไหน model/effort อะไร (ใช้ label สื่อ)
- ประเมิน cost: ต่อ agent ประมาณ token คร่าว ๆ (งานอ่านโค้ดหนัก cache read มักหลัก
  ร้อย k–M, output หลักสิบ k) × ราคา per-model จากตาราง `PRICING` ใน
  [assets/usage_report.py](assets/usage_report.py) → บอกช่วง เช่น "~$3–8"
  ระบุชัดว่าเป็น estimate หยาบ
- ถามว่ารันเลย / ปรับ (เช่น ลด agent, ลด tier) / ยกเลิก

user อนุมัติแล้วค่อยเรียก Workflow tool

### 3. รัน

- เรียก Workflow โดย script ใส่ label + model/effort ตามแผน
- จด **path ของ script ที่ persist ไว้** และ **transcript dir** (โฟลเดอร์ `wf_<runId>`)
  จาก tool result / task notification — ต้องใช้ในขั้นถัดไป

### 4. รายงาน usage + cost หลังจบ

รัน script คำนวณ (deterministic — อย่าไล่อ่าน jsonl เองด้วยตา):

```bash
python3 <skill-dir>/assets/usage_report.py <transcript-dir ของ wf_<runId>>
```

script จะอ่าน `agent-*.jsonl` ทุกไฟล์, dedup usage ด้วย `message.id`
(streaming เขียน usage ซ้ำหลายบรรทัดต่อ message — ห้ามรวมดิบ ๆ), aggregate
per-agent + per-model แล้วพิมพ์ตาราง markdown พร้อม estimated total cost

รายงานต่อ user:

- ตารางจาก script (token per-agent/per-model + cost)
- เทียบกับ estimate ก่อนรัน — ถ้าพลาดเกินเท่าตัว บอกไว้ (ช่วย calibrate ครั้งหน้า)
- ผลงานจริงของ workflow (อันนี้สำคัญสุด อย่าให้ตาราง cost กลบ)

### 5. Append calibration log

ปิด loop การเรียนรู้ — **append entry ลง
[references/calibration-log.md](references/calibration-log.md) ทุก run** ตาม template
ในไฟล์ (task, design, estimate vs actual, verdict ✅/🔻under/🔺over/🎯estimate-พลาด,
หลักฐาน, ครั้งหน้าจะเลือกต่างยังไง) จุดที่ต้องประเมินตรง ๆ:

- stage ไหน**ต่ำไป** (ผลงานไม่ผ่าน, วนแก้หลายรอบ, ต้องรันซ้ำ tier สูงกว่า) —
  ถาม user ด้วยว่าคุณภาพผลงานโอเคไหม เพราะ under-provision บางแบบมองไม่เห็นจาก log
- stage ไหน**สูงไป** (งานง่ายแต่ใช้ tier แพง — ดูจาก token/ผลงานว่างานจริงเบากว่าที่กะ)
- estimate พลาดเกินเท่าตัวไหม เพราะอะไร

ถ้า entry สะสมจนเห็น pattern ซ้ำ ให้กลั่นขึ้นส่วน Lessons — และถ้าชัดพอ
ให้แก้ policy table ใน SKILL.md นี้เลย (log คือที่ทดลอง, policy คือที่สรุป)

ถ้า script เจอ model ที่ไม่มีในตาราง `PRICING` มันจะเตือน — ให้บอก user ว่าตัวเลข
ไม่รวม model นั้น และชวนอัปเดตตารางราคาใน `usage_report.py`

## ข้อจำกัดที่ต้องบอกตรง ๆ

- cost เป็น **estimate**: ตาราง PRICING ใน script อัปเดตมือ (ราคา ณ ส.ค. 2026 —
  ตรวจกับ https://platform.claude.com/docs/en/about-claude/models/overview เมื่อสงสัย)
  และไม่รู้ discount/plan ของบัญชีผู้ใช้
- token ที่นับคือฝั่ง sub-agent ใน workflow — ไม่รวม main loop ที่ออกแบบ/สรุป
