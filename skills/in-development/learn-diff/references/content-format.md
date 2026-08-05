# Content format (learn-diff v3)

สิ่งที่ agent เขียนลงดิสก์ต่อ 1 run — **markdown สำหรับ prose, JSON สำหรับข้อมูลที่มีโครงสร้าง**
viewer อ่านผ่าน HTTP API แล้ว render เอง · agent **ไม่เขียน HTML อีกต่อไป**
(markup contract ของ v2 กับ `assets/learn-diff.css` / `.js` ถูกลบทิ้งพร้อม output pipeline เดิม
ในตั๋ว #12 — ถ้าอยากดูของเดิมต้องย้อน git history)

## โครงไฟล์

```
<repo>/.learn-diff/<slug>/
  run.json          ← ข้อมูลที่มีโครงสร้างทั้งหมด (schema ด้านล่าง)
  index.md          ← หน้า PM altitude
  01-<slug>.md      ← section page เรียงตาม dataflow
  …
  99-verify.md      ← คำถามทำนายผล + verification checklist
```

- `.learn-diff/` ใส่ใน `.git/info/exclude` ของ repo นั้น **ห้ามแก้ `.gitignore` ที่ track อยู่**
- ชื่อไฟล์ของ section = `<section id>.md` (หรือระบุ `file` ใน run.json) — ต้องอยู่ในโฟลเดอร์เดียวกัน
  server ปฏิเสธ path ที่มี `/`, `\` หรือ `..`
- เขียน `run.json` ให้ครบ **ตั้งแต่ต้น** (ประกาศทุก section) แล้วค่อยทยอยเขียนไฟล์ `.md`
  section ที่ยังไม่มีไฟล์จะขึ้นเป็น "รอเขียน" ในเมนู ไม่ใช่หายไปเฉย ๆ

## เขียนไปพลาง ผู้ใช้อ่านไปพลาง

viewer เฝ้าโฟลเดอร์นี้อยู่ และส่งการเปลี่ยนแปลงเข้าหน้าที่เปิดค้างไว้ทันที (SSE) —
ผู้อ่านเริ่มอ่านหน้าแรกได้ตั้งแต่ยังเขียนหน้าอื่นไม่เสร็จ **โดยไม่ต้อง refresh**
สิ่งที่ agent ต้องทำเพื่อให้ผลออกมาดี:

1. **เขียน `run.json` ก่อนเสมอ แล้วค่อยลงทะเบียน run** — เมนูทั้งชุดจะขึ้นครบตั้งแต่แรก
   ผู้อ่านเห็นทันทีว่ามีทั้งหมดกี่หน้าและกำลังรออะไรอยู่
2. **เขียนหน้าตามลำดับใน `sections[]`** (index → section → verify) เพราะผู้อ่านอ่านตามลำดับนั้น
3. **หนึ่งหน้า = เขียนไฟล์ทีเดียวจบ** อย่าทยอย append ทีละย่อหน้า — ทุกครั้งที่ไฟล์เปลี่ยน
   หน้าที่เปิดอยู่จะ render ใหม่ ผู้อ่านจะเห็นเนื้อหางอกทีละท่อน
4. **แก้ `run.json` ระหว่างทางได้** (เช่นเพิ่ม section ที่เพิ่งตัดสินใจแยกออกมา) — เมนูอัปเดตเอง
5. ไฟล์ที่เขียนไม่เสร็จ/พัง ไม่ทำให้หน้าที่ถูกต้องอยู่แล้วหาย — ของเดิมค้างบนจอไว้จนกว่าจะอ่านใหม่ได้

## run.json

Type จริงอยู่ที่ [`viewer/src/shared/types.ts`](../viewer/src/shared/types.ts) — ไฟล์นั้นคือ contract
ตัวอย่างครบชุด: [`viewer/examples/pr-230-etax-link-notify/run.json`](../viewer/examples/pr-230-etax-link-notify/run.json)

| ฟิลด์ | ใช้ทำอะไร |
|---|---|
| `schemaVersion` | ต้องเป็น `1` |
| `id`, `title`, `subtitle` | ชื่อ run · `subtitle` เป็น markdown inline (บรรทัดสถิติ) |
| `pr` | `{ number, title, url }` — header ลิงก์ไป GitHub จากตรงนี้ |
| `commit` | head sha ของ PR ที่ pin ไว้ — file API อ่านไฟล์ที่ commit นี้ |
| `baseCommit` | sha ฐานของ PR (merge-base ของ base branch กับ head) — **ต้องใส่** ไม่งั้นลงสี diff ไม่ได้ |
| `generatedAt` | ISO 8601 |
| `sections[]` | `{ id, title, file?, kind?, box?, subtitle?, readingList? }` · ลำดับใน array = ลำดับเมนูและปุ่มก่อน/ถัดไป |
| `boxMap[]` | แผนที่กล่อง · แถวที่มี `section` จะกลายเป็นลิงก์ · blackbox ที่อธิบายจบในแถวไม่ต้องมี section |
| `reconciliation[]` | `{ status: done \| missing \| unrequested, ref?, what, note? }` — หัวตารางเปลี่ยนตาม status ให้เอง |
| `readingLists[]` | `{ id, title, spans: [{ path, from, to, kind: changed \| context, why }] }` |
| `nodeMap` | node id ใน mermaid → reading list id · ดู [diagram-mermaid.md](diagram-mermaid.md) |

`what` / `note` / `reason` / `subtitle` ทุกตัวเป็น **markdown inline** (ตัวหนา, `code`, ลิงก์ ได้)

### วิธีเขียน `readingLists`

reading list คือของชิ้นเดียวในหน้านี้ที่ diff viewer ให้ไม่ได้ — **ลำดับการอ่าน** ที่คนซึ่งเพิ่งอ่านทั้ง
change เลือกมาให้ · panel แสดงตาม `spans` **เรียงตามที่เขียนไว้** ไม่ได้เรียงตามชื่อไฟล์/เลขบรรทัด

- **เรียงตาม dataflow ที่คำอธิบายเล่า** ไม่ใช่ตามไฟล์ — ช่วงที่ 3 กลับไปไฟล์เดิมของช่วงที่ 1 ได้
- **ต้องมีช่วง `kind: "context"` ด้วย** ถ้าเข้าใจ change ไม่ได้โดยไม่อ่านของเดิม —
  นี่คือเหตุผลทั้งหมดที่ระบบนี้มีอยู่ · `changed` = โค้ดที่ PR แก้ (panel ลงสี), `context` = ของเดิม (ไม่ลงสี)
- **`why` หนึ่งบรรทัด บอกว่าช่วงนี้ตอบคำถามอะไร** ไม่ใช่สรุปว่าโค้ดทำอะไร (ผู้อ่านอ่านโค้ดเองอยู่แล้ว)
- **ช่วงละ ~10–80 บรรทัด** · ทั้งไฟล์ก็ได้ถ้าไฟล์เล็กจริง ๆ · ช่วงยาวเกินจะกลายเป็น "กองโค้ด" ที่ไม่ได้ช่วยจัดลำดับ
- **หลาย reading list ต่อ section ได้** — บังคับให้มีอันเดียวต่อ section จะทำให้ทุก node ในหน้าเปิดของเดียวกัน
- `path` เทียบ root ของ repo · `from`/`to` ต้อง resolve ได้จริงที่ commit ที่ pin ไว้ ไม่งั้น panel ขึ้น error

### สีของ diff มาจาก `baseCommit` ไม่ใช่จาก `kind`

`kind` บอกแค่ว่า "ช่วงนี้เป็นของที่ PR แก้หรือเป็นบริบท" (กรอบสีของการ์ด) ส่วน **บรรทัดไหนถูกเพิ่ม/ลบ**
server เป็นคนหาเองด้วย `git diff <baseCommit> <commit> -- <path>` ทุกครั้ง — agent ไม่ต้องเขียนอะไรเพิ่ม
นอกจากใส่ `baseCommit` ให้ถูก

- ไม่มี `baseCommit` → โค้ดยังอ่านได้ทุกอย่าง แต่การ์ดจะขึ้น "เทียบ diff ไม่ได้" และสลับ side-by-side ไม่ได้
- ผู้อ่าน "กางทั้งไฟล์" ได้ทุกช่วง (รวมช่วง `context`) และตอนกางจะเห็นสีของ diff ทั้งไฟล์ พร้อมหมุด
  ของช่วงอื่น ๆ ในไฟล์เดียวกัน — เลือกช่วงให้ดี แต่ไม่ต้องกลัวว่าผู้อ่านจะติดอยู่แค่ในช่วงนั้น

### ทางเข้าโค้ดมี 4 ทาง — ทุกทางชี้ไป reading list เดียวกันได้

| เขียนที่ไหน | ผู้อ่านกดตรงไหน |
|---|---|
| `sections[].readingList` | ปุ่ม "อ่านโค้ดของหัวข้อนี้" มุมขวาบนของ section |
| `boxMap[].readingList` | ปุ่ม "อ่านโค้ด" ในคอลัมน์สุดท้ายของแผนที่กล่อง (ไม่ใส่ = ใช้ของ section ที่แถวนั้นชี้ไป) |
| `nodeMap` | กล่องในไดอะแกรม (ขีดเส้นใต้แบบจุด = กดได้) |
| `:read[...]{list="…"}` | ข้อความในเนื้อความ |

`:file[...]` เป็นทางที่ห้า แต่เปิด "ช่วงเดี่ยว ๆ" ที่ไม่มี id ไม่ใช่ลำดับการอ่าน

### warning ที่ server ตรวจให้ทุกครั้งที่โหลด run

ผลออกมาเป็นกล่องเหลืองบนหัวหน้า (ทุกหน้าของ run นั้น) — **กดแล้วไม่มีอะไรเกิดขึ้นคือผลลัพธ์ที่แย่ที่สุด**
ของพวกนี้จึงต้องดังตั้งแต่ก่อนผู้อ่านจะกด:

| code | แปลว่า |
|---|---|
| `reading_list_not_found` | มีที่อ้างถึง id นั้น (section / box map / nodeMap / `:read`) แต่ไม่มีนิยามใน `readingLists` |
| `reading_list_unreferenced` | เขียนนิยามไว้แต่ไม่มีอะไรอ้างถึงเลย = ผู้อ่านเข้าไม่ถึง |
| `reading_list_duplicate` / `reading_list_empty` | id ซ้ำ / ไม่มี `spans` เลย |
| `diagram_node_not_found` | `nodeMap` มี node id ที่ไม่ปรากฏในไดอะแกรมไหนเลยของ run นี้ |
| `range_not_found` / `file_not_found` / `path_escape` | ช่วงบรรทัดหรือไฟล์ที่อ้างถึง resolve ไม่ได้ที่ commit ที่ pin ไว้ (ทั้งใน `readingLists` และ `:file`) |
| `box_map_unknown_section` | แถว box map ชี้ section ที่ไม่มีใน `sections` |
| `range_check_unavailable` | ตรวจช่วงบรรทัดไม่ได้เพราะยังไม่มี commit นั้นในเครื่อง / repo ถูกย้าย — `git fetch` แล้วเปิดใหม่ |

สองข้อที่เป็นการเช็ค "ไม่มีใครอ้าง / ไม่มีในไดอะแกรม" จะ**เงียบไว้จนกว่าทุก section จะถูกเขียนครบ**
เพราะระหว่างที่ยังเขียนไม่จบ หน้าที่ยังไม่มีอาจเป็นคนถือ `:read` หรือไดอะแกรมนั้นอยู่

## Directive ที่ใช้ได้ใน .md

ใช้ [remark-directive](https://github.com/remarkjs/remark-directive) — เนื้อในของ container
ยัง**เป็น markdown เต็มรูปแบบ** จึงไม่ต้อง escape อะไร
directive ที่ไม่อยู่ในลิสต์นี้ viewer จะ render เป็นกล่องแดง "directive ที่ไม่รู้จัก" — ตั้งใจให้ดัง

### Container (`:::`)

| directive | ใช้ตอนไหน |
|---|---|
| `:::tldr` | กล่อง TL;DR หัวหน้า index |
| `:::note{type="info\|warn\|risk"}` | หมายเหตุ/คำเตือน (`type` ไม่ใส่ = `info`) |
| `::::question{id="q1"}` | คำถามทำนายผลหนึ่งข้อ — **ใช้ 4 อัฒภาค** เพราะต้องครอบ `:::answer` |
| `:::answer` | เฉลย · render เป็น `<details>` ที่ต้องกดเปิด |
| `:::checklist` | ครอบ code block ของ verification checklist |

```markdown
::::question{id="q1"}
**Q1.** ร้านเปิดฟีเจอร์แล้ว … ผู้ซื้อจะได้อีเมลซ้ำไหม?

:::answer
**ไม่ได้ซ้ำ** เพราะ …

::verify[`task test:dobybot -- etax.tests.test_x` · แล้วลองคอมเมนต์บรรทัด … ออก — ต้องแดง]
:::
::::
```

> **กฎที่ยกมาจาก v1/v2 ไม่มีข้อยกเว้น:** ห้ามตั้งคำถามที่จงใจให้เข้าใจผิด และทุกคำถามต้องมี
> `::verify[...]` ที่รันแล้วเห็นคำตอบเองได้ (ดู DEVELOPMENT.md)

### Leaf (`::`)

| directive | ใช้ตอนไหน |
|---|---|
| `::verify[...]` | บรรทัด "พิสูจน์เอง" — คำสั่งจริงที่ผู้อ่านรันเองได้ |
| `::divider[...]` | เส้นคั่น "จากตรงนี้ = มุมมองวิศวกร" |
| `::reconciliation` | แทรกตาราง intent reconciliation ทั้ง 3 หมวดจาก `run.json` |
| `::box-map` | แทรกแผนที่กล่องจาก `run.json` |

`::reconciliation` / `::box-map` คือจุดที่ prose กับ structured data มาบรรจบกัน — agent คุมว่า
ตารางไปโผล่ตรงไหนของหน้า แต่ **ไม่ต้องเขียนตารางเอง**

### Inline (`:`)

| directive | ใช้ตอนไหน |
|---|---|
| `:file[ชื่อที่จะแสดง]{path="services/…/x.py" lines="61-79"}` | อ้างไฟล์ในเนื้อความ |
| `:read[ชื่อที่จะแสดง]{list="rl-handler"}` | อ้าง reading list ตาม id |

ทั้งคู่กดแล้ว**เปิด panel โค้ดด้านขวา** ซึ่งดันเนื้อหาให้แคบลง (ไม่ได้เปลี่ยนหน้า และไม่ได้ลอยทับ)

- `:read` เปิด "ลำดับการอ่าน" ทั้งชุดตาม id · ใช้ตัวนี้เป็นหลัก
- `:file` เปิดช่วงเดี่ยว ๆ ที่ไม่มี id — `path` ต้องเทียบ root ของ repo และช่วง `lines`
  ต้องมีอยู่จริงที่ commit ที่ pin ไว้ ไม่งั้น panel จะขึ้น error บอกจำนวนบรรทัดจริง
- panel เปิดได้ทีละรายการเดียว มีปุ่มย้อนกลับ/ถัดไป · ปิดด้วยปุ่ม × หรือ `Esc`

## Code block

````markdown
```python title="services/dobybot/etax/utils/etax_link_eligibility.py" lines="61-79"
@dataclass(frozen=True)
class ETaxLinkEligibility:
    …
```
````

- `title` → ชื่อไฟล์บนหัวกรอบ · `lines` → เลขบรรทัดเริ่มนับจากเลขแรกของช่วง
- ` ```console ` → กล่อง terminal (พื้นดำ) บรรทัดคำสั่งขึ้นต้นด้วย `$ `
- ` ```mermaid ` → flowchart ที่ viewer จัด layout ให้ · **เขียนได้เฉพาะ subset ที่กำหนด**
  ดู [diagram-mermaid.md](diagram-mermaid.md) — ใส่ `title="…"` เป็นคำบรรยายบนหัวกรอบได้

**โค้ดที่ฝังใน markdown คือ "ตัวอย่างประกอบคำอธิบาย" เท่านั้น** เช่นโค้ดเดิมที่ถูกลบไปแล้ว
หรือ SQL ที่ไม่ได้อยู่ใน repo · โค้ดจริงจาก commit ที่ pin ไว้มาจาก reading list + file API
ห้าม paste ไฟล์ทั้งไฟล์ลง markdown

## สิ่งที่หน้า HTML ของ v2 มี แต่ format นี้ยังไม่รองรับ

บันทึกจากการแปลง `pr-230-etax-link-notify` มือเปล่า (ตั๋ว #4) — ทั้งหมดเป็นการตัดสินใจ ไม่ใช่ของค้าง:

1. **ปุ่ม copy บน code block / terminal** — v2 มี JS แถมมาให้ ตอนนี้ยังไม่มี
   กระทบ checklist มากที่สุด เพราะออกแบบมาให้ก๊อปไปวางในช่อง Verification ของ PR
   (ควรกลับมาทำพร้อม ๆ กับ code panel)
2. **syntax highlighting ในโค้ดที่ฝังใน prose** — v2 มี tokenizer เขียนเอง ตอนนี้ยังเป็น plain text
   ตั้งใจ: CodeMirror ของตั๋ว #7 ครอบ "โค้ดจริง" อยู่แล้ว ส่วนตัวอย่างสั้น ๆ ยอมให้ขาวดำก่อน
3. **ตารางที่ cell มีหลายย่อหน้า / มี `<br>`** — markdown table ทำได้แค่บรรทัดเดียวต่อ cell
   ตอนแปลง box map จึงต้องแยก "ไฟล์ที่เกี่ยวข้อง" ออกเป็นฟิลด์ `files` ใน JSON
   (กลายเป็นดีกว่าเดิม เพราะ layout ไม่ปนกับข้อมูล) แต่ตารางใน prose ที่ยังเป็น markdown
   จะเขียน cell ยาว ๆ หลายย่อหน้าไม่ได้ — ถ้าต้องการ ให้ย้ายไปเป็น structured data
4. **footer nav แบบ "ถัดไป: …"** ที่ v2 เขียนลงไฟล์เอง — ตอนนี้ viewer สร้างจาก `sections[]` ให้
   ผลลัพธ์เหมือนเดิม แต่ agent ควบคุมข้อความไม่ได้อีกต่อไป
5. **กล่อง feedback ท้ายหน้า verify** — v2 มี class เฉพาะ (`.footer-feedback`) ตอนนี้ใช้ `:::note` แทน
   หน้าตาต่างไป เนื้อหาเท่าเดิม
6. **ไฟล์เดียวเปิดจาก `file://` ได้** — หายไปโดยตั้งใจทั้งหมด (ดู SPEC-v3 → Delivery model)
   run ไม่ใช่โฟลเดอร์ที่ zip ส่งให้เพื่อนได้อีกแล้ว

สิ่งที่ **ไม่หาย** และตรวจแล้วว่าแปลงได้ครบ: TL;DR, PM view ทั้ง 7 หัวข้อ, ตาราง trace ทีละสเต็ป,
ตาราง scope/risk, reconciliation ทั้ง 3 หมวด, box map, คำถาม 9 ข้อพร้อมเฉลยและบรรทัดพิสูจน์เอง,
verification checklist, และ note ทุกก้อน
