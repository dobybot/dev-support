# learn-diff viewer

App ที่ใช้อ่านผลลัพธ์ของ skill `learn-diff` (spec: [SPEC-v3.md](../SPEC-v3.md))
Vite + React + TypeScript + Tailwind v4 + shadcn/ui — รันเป็น **dev server บนเครื่องตัวเอง**
จาก source ในโฟลเดอร์ skill โดยตรง ไม่มีขั้นตอน build/release

## ต้องมีก่อน

- node ≥ 20
- pnpm ≥ 9 (ถ้าไม่มีจริง ๆ ตัวติดตั้งจะ fallback ไปใช้ npm)

`install.sh` / `install.ps1` ติดตั้ง dependency ให้อัตโนมัติหลัง link skill

## เปิด server (ทางที่ skill ใช้)

```bash
node scripts/serve.mjs           # มีตัวรันอยู่แล้วใช้ต่อ ไม่มีค่อยสั่งรัน
node scripts/serve.mjs --json    # ตอบเป็น JSON บรรทัดเดียว (ให้ skill อ่าน)
node scripts/serve.mjs --probe   # ถามเฉย ๆ ว่ามีใครรันอยู่ไหม (exit 3 = ยังไม่มี)
node scripts/serve.mjs --stop    # สั่งตัวที่รันอยู่ให้ปิด
```

สคริปต์นี้ยิง `/api/health` ก่อนเสมอ **เครื่องหนึ่งมี server ตัวเดียว พอร์ตเดียว** —
เรียก `/learn-diff` ครั้งที่สองจึงไม่ได้ process เพิ่ม · ระหว่างทางมันเช็คด้วยว่า dependency
ที่ติดตั้งไว้ยังตรงกับ lockfile ไหม (เทียบ hash เก็บไว้ที่ `node_modules/.learn-diff-deps.json`)
ไม่ตรง = ติดตั้งให้เลย เพื่อไม่ให้ `git pull` กลายเป็น error ประหลาดตอนรัน

`--stop` เล็งเป้าจาก **พอร์ต** (ลำดับการ resolve: `--port` → env `LEARN_DIFF_PORT` → default 5174)
— รันไว้ด้วย `LEARN_DIFF_PORT=5188` แล้วสั่ง `--stop` เปล่า ๆ จะไปเจอตัวที่พอร์ต 5174 แทน ·
กันพลาดไว้ชั้นหนึ่ง: ถ้า `home` ของตัวที่เจอไม่ตรงกับของคำสั่งนี้ สคริปต์จะปฏิเสธพร้อมบอกทั้งสอง home
เว้นแต่สั่งซ้ำด้วย `--force`

## รันเอง

```bash
pnpm --dir ~/.claude/skills/learn-diff/viewer dev      # macOS / Linux
```

```powershell
pnpm --dir "$env:USERPROFILE\.claude\skills\learn-diff\viewer" dev   # Windows
```

เปิด http://127.0.0.1:5174 — server **ผูกกับ 127.0.0.1 เท่านั้น** โดยตั้งใจ เพราะ process เดียว
อ่านไฟล์จากทุก repo ที่มี run ลงทะเบียนไว้ จึงต้องไม่โผล่ออกเน็ตเวิร์ก

## อายุของ process

- **ปิดตัวเองเมื่อไม่มี request เข้ามา 4 ชั่วโมง** (SPEC-v3 → Lifecycle) แล้วพิมพ์คำสั่งสั่งรันใหม่
  ลง log · "ว่าง" นับจาก request ทุกชนิด ไม่ใช่เฉพาะ `/api` — สาย SSE ที่เปิดค้างไว้เฉย ๆ
  ไม่นับ ไม่งั้นแท็บที่ถูกลืมจะกลายเป็นตัวกันไม่ให้ปิดตลอดไป
- แท็บที่ยังเปิดอยู่ตอน server ปิดจะขึ้นสถานะ offline แล้วต่อสายเองใหม่เมื่อสั่งรันอีกครั้ง
- `/api/health` บอก `pid`, `root`, `registry`, จำนวน run, `startedAt` และ `idleShutdownAt`
  (เวลาที่จะปิดตัวเอง) — หน้าแรกโชว์ค่าพวกนี้ไว้ที่ท้ายหน้า

| env | ทำอะไร |
|---|---|
| `LEARN_DIFF_PORT` | พอร์ตของ dev server (default 5174) — `vite.config.ts` อ่านค่านี้ และตั้ง `strictPort` ไว้ พอร์ตชนแล้วต้องล้ม ไม่ใช่แอบย้ายพอร์ต |
| `LEARN_DIFF_IDLE_MS` | เวลาว่างก่อนปิดตัวเอง (ms) · `0` = ไม่ปิด |
| `LEARN_DIFF_HOME` | ที่เก็บ registry + log (default `~/.claude/learn-diff`) |

## คำสั่งอื่น

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm dev` | dev server (hot reload) |
| `pnpm build` | typecheck (`tsc -b`) + build ลง `dist/` — ใช้ตรวจว่าโค้ดยัง compile ผ่าน |
| `pnpm typecheck` | typecheck อย่างเดียว |
| `pnpm test` | vitest — ยิงใส่ HTTP surface ของ server ด้วย fixture ใน temp dir |

`node_modules/` และ `dist/` ถูก git-ignore ไว้ที่ root ของ repo

## Run registry

Viewer อ่าน run จาก `~/.claude/learn-diff/runs.json` (override ด้วย `LEARN_DIFF_HOME`)
ตัว server **อ่านอย่างเดียว** — คนเขียนคือสคริปต์ที่ skill เรียกหลังเขียน content เสร็จ:

```bash
node scripts/register-run.mjs \
  --repo /path/to/repo \
  --content /path/to/repo/.learn-diff/pr-230-foo \
  --commit <sha> --pr 230 --title "…" --url https://github.com/…/pull/230
```

run ที่ลงทะเบียนแล้วเปิดอ่านที่ `http://127.0.0.1:5174/r/<run id>`

**หน้าแรก (`/`) คือรายการ run ทั้งหมดข้ามทุก repo** เรียงใหม่สุดขึ้นก่อน แต่ละแถวบอกเลข PR,
ชื่อเรื่อง, วันที่, ชื่อ repo, commit ที่ pin ไว้ และลิงก์ไป PR บน GitHub · เกิน 3 run จะมีช่องค้นหา
(เลข PR / ชื่อเรื่อง / ชื่อ repo / sha) · registry ไม่มีใครมาเก็บกวาด — worktree ที่ถูกลบทิ้งจะยังค้าง
อยู่ในรายการ `/api/runs` จึงเติมฟิลด์ `available` ให้ และแถวนั้นขึ้นป้าย "ไฟล์หาย" ตั้งแต่ก่อนกด

## อ่านไปพลาง agent เขียนไปพลาง (SSE)

`GET /api/runs/<id>/events` เป็น SSE: server เฝ้า content dir ของ run นั้น แล้วบอกว่ามีไฟล์ไหนเปลี่ยน

| event | ความหมาย |
|---|---|
| `ready` | `{ runId, contentDir, at }` — เฝ้าอยู่แล้ว **และจด snapshot ฐานเรียบร้อย** ตั้งแต่นี้ไปไฟล์ที่เปลี่ยนจะมาเป็น `change` ครบ |
| `change` | `{ runId, files, runFileChanged, at }` — `files` คือชื่อไฟล์ในโฟลเดอร์ที่ถูกเพิ่ม/แก้/ลบ |
| `fatal` | เฝ้าโฟลเดอร์ไม่ได้ (เช่นถูกลบทิ้ง) แล้วปิดสาย |
| `: ping` | heartbeat ทุก 25 วิ |

- server ส่งแค่ "อะไรเปลี่ยน" ไม่ส่งเนื้อหา — app เป็นคนตัดสินใจว่าจะโหลด run/หน้าไหนใหม่
  (`RunLayout` โหลด run ใหม่ทุก event, `SectionPage` โหลดเฉพาะเมื่อไฟล์ของหน้าตัวเองเปลี่ยน)
- โหลดใหม่ **ไม่ล้างของเดิม** — หน้าที่กำลังอ่านอยู่ไม่กะพริบเป็น "กำลังโหลด…"
- ตัวเฝ้าไฟล์ (`server/watch.ts`) ใช้ `fs.watch` + poll ทุก 2 วิเป็นตาข่ายรอง และเทียบ mtime+size
  ก่อนจะยิง event จึงไม่มี event ปลอมเวลา editor แตะไฟล์เฉย ๆ · watcher ตัวเดียวต่อโฟลเดอร์
  (เปิดหลายแท็บก็ยังตัวเดียว) และปิดตัวเองเมื่อไม่มีใครฟัง
- สายหลุด (เช่น restart server) EventSource ต่อใหม่เอง แล้ว `ready` รอบใหม่ทำให้ app
  โหลดสภาพจริงอีกครั้ง — ของที่เปลี่ยนไประหว่างสายขาดจึงไม่ตกหล่น · header โชว์สถานะสายให้เห็น

## โครงโค้ด

| ที่อยู่ | คืออะไร |
|---|---|
| `server/` | API (`/api/health`, `/api/runs`, `/api/runs/:id`, `/api/runs/:id/pages/:sectionId`, `/api/runs/:id/events`, `/api/runs/:id/file`, `/api/runs/:id/comments`) ต่อเข้า vite ผ่าน plugin ใน `server/plugin.ts` |
| `src/shared/types.ts` | **contract ของ content format** — server กับ app ใช้ type ชุดเดียวกัน |
| `src/shared/sections.ts` | กติกาชื่อไฟล์ของ section — ทั้งสองฝั่งต้องคิดตรงกัน |
| `src/components/run/` | ตัว render: markdown + directive, ตาราง reconciliation, box map, ไดอะแกรม |
| `src/lib/diagram/` | **ขอบเขตของตัววาดไดอะแกรม** — ทางเข้าเดียวคือ `renderDiagram()` ใน `index.ts` |
| `src/lib/code/` | **ขอบเขตของตัวแสดงโค้ด** — ทางเข้าเดียวคือ `mountCodeView()` ใน `index.ts` |
| `src/routes/` | หน้า: รายการ run, เปลือกของ run, section (โค้ดไม่ใช่หน้า — อยู่ใน panel) |
| `src/lib/reading-panel.ts` | ตรรกะล้วนของ reading-list panel (ประวัติ, ความกว้าง, ดัชนีไฟล์) |
| `server/validate.ts` | ตรวจความสอดคล้องของ content → `warnings[]` ที่ API ส่งกลับมาพร้อม run |
| `server/scan.ts` | อ่าน markdown หาไดอะแกรม / `:read` / `:file` (ตัวสแกนบรรทัด ไม่ใช่ remark) |
| `examples/` | run ตัวอย่าง (pr-230) ที่ใช้เป็น reference ของ format |
| `test/` | เทสต์ยิงใส่ HTTP surface — ไม่มีเทสต์ระดับ component โดยตั้งใจ |

format ที่ agent ต้องเขียน: [references/content-format.md](../references/content-format.md)

## ไดอะแกรม (mermaid)

` ```mermaid ` ในเนื้อหาถูกวาดโดย **mermaid ที่มาจาก npm** (ไม่มี CDN) และทุกการวาดผ่าน
`renderDiagram({ container, source, nodeMap, dark })` ที่ `src/lib/diagram/index.ts` **ที่เดียว**

| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | ทางเข้าเดียว: parse → normalize → วาด → ผูก node เข้ากับ reading list |
| `subset.ts` | parser/checker ของ subset ที่ agent เขียนได้ (pure, ไม่มี DOM) |
| `theme.ts` | สีทั้งหมด รวมถึง class `changed` / `risk` / `external` (light + dark) |
| `normalize.ts` | แทรก `classDef` ของ class มาตรฐานที่ source ไม่ได้ประกาศเอง |
| `engine-mermaid.ts` | **ไฟล์เดียวที่ import mermaid ได้** — เปลี่ยน engine = เขียนไฟล์นี้ใหม่ |

- `test/diagram.test.ts` มีเทสต์ที่สแกน `src/` เพื่อบังคับข้อสองข้อนี้ (ไฟล์เดียวที่ import mermaid /
  ไม่มีใครนอกโฟลเดอร์ import ไฟล์ข้างในตรง ๆ) — boundary ที่ไม่มีอะไรบังคับจะกลายเป็นแค่ความตั้งใจ
- **layout ของ mermaid ไม่มีเทสต์อัตโนมัติ** โดยตั้งใจ (SPEC-v3 → Testing Decisions)
- SVG ออกมาขนาดจริงแล้วให้กล่องนอกเลื่อนเอา (`useMaxWidth: false`) — ย่อให้พอดีคอลัมน์
  แล้วตัวหนังสืออ่านไม่ออก · กฎฝั่ง agent (`flowchart TB` เป็นค่าเริ่มต้น ฯลฯ) อยู่ที่
  [references/diagram-mermaid.md](../references/diagram-mermaid.md)
- **ลากเลื่อน / หนีบซูมได้ทั้งเมาส์และนิ้ว** (#40): กล่องรอบไดอะแกรมเป็น "viewport" ที่ทำ
  CSS transform ให้ wrapper ของ SVG — คณิตอยู่ที่ `src/lib/pan-zoom.ts` (ฟังก์ชันล้วน + เทสต์)
  การผูก pointer event อยู่ที่ `src/lib/use-pan-zoom.ts` · `src/lib/diagram/` ไม่รู้เรื่องนี้เลย
  · เมาส์: ลากเพื่อเลื่อน, ctrl/cmd + wheel เพื่อซูม, ปุ่ม +/− และรีเซ็ตมุมหน้าขวาบน ·
  แตะ/คลิก node ยังเปิด reading list เหมือนเดิม (แยกจากการลากด้วย threshold 6px)
- **พิกัดที่ส่งให้คณิตต้องวัดจากจุดกำเนิดของเนื้อหา ไม่ใช่ขอบกล่อง** — กล่องมี `p-4` อยู่
  ถ้าวัดจากขอบ การซูมจะคลาดไป 16·(1−r) px ทุกครั้ง (pan ไม่รู้สึกเพราะเป็น delta ล้วน จึงรอด
  สายตาได้ง่าย) · `contentOrigin()` วัด padding จาก rect จริงให้ ไม่ต้อง hardcode
- **เพดานความสูง 75vh ใช้เฉพาะ `@media (pointer: coarse)`** — ที่นั่น `touch-action: none`
  ทำให้ไดอะแกรมสูงเต็มจอกลายเป็นหลุมดักนิ้ว · บนเมาส์ไม่มีปัญหานั้นและการตัดความสูงมีแต่จะ
  ซ่อนไดอะแกรมแนวตั้ง (`overflow: hidden` ไม่มี scrollbar บอกว่ายังมีต่อ)

## โค้ดจาก commit ที่ pin ไว้ (file API + CodeMirror)

```
GET /api/runs/<id>/file?path=<path เทียบ root ของ repo>&from=<บรรทัดแรก>&to=<บรรทัดสุดท้าย>
```

ไม่ใส่ `from`/`to` = ทั้งไฟล์ · ตอบเป็น `FileResponse`
(`text`, `from`, `to`, `totalLines`, `bytes`, `language`, `commit`)

- **อ่านด้วย `git show <commit>:<path>` เสมอ ไม่ใช่จาก working tree** — commit ที่ pin ไว้คือ
  head ของ PR ทำให้เลขบรรทัดตรงกับที่เขียนไว้ในคำอธิบายตลอดอายุของ run
- **path ถูก resolve เทียบ `repoPath` ของ run นั้นแล้วปฏิเสธถ้าหลุดออกนอก** (`path_escape`)
  server process เดียวเห็นทุก repo ที่ลงทะเบียน run ไว้ — การผูก 127.0.0.1 อย่างเดียวไม่พอ
- error ที่ต้องแยกจากกันให้ชัด (ทางแก้คนละทาง):

  | code | แปลว่า |
  |---|---|
  | `commit_not_found` | ยังไม่มี commit นี้ในเครื่อง → `git fetch origin pull/<N>/head` |
  | `file_not_found` | ไม่มีไฟล์นี้ **ที่ commit นั้น** (อาจถูกเพิ่มทีหลัง) → บอก agent ให้แก้พิกัด |
  | `range_not_found` | ช่วงบรรทัดเลยท้ายไฟล์ — ข้อความบอกจำนวนบรรทัดจริงมาด้วย |
  | `path_escape` / `bad_range` / `binary_file` / `not_a_file` / `file_too_large` | ตามชื่อ |

  ช่วงที่ resolve ไม่ได้ต้อง **ไม่** คืนเนื้อหาว่าง ๆ — ผู้อ่านจะได้รู้ว่าต้องไปให้ agent แก้
- เนื้อไฟล์ที่ commit หนึ่ง ๆ ไม่มีวันเปลี่ยน จึง cache ในหน่วยความจำได้แบบไม่ต้อง invalidate
  (16 ไฟล์ล่าสุด, เฉพาะไฟล์ ≤ 512 KB)

ฝั่ง app วาดด้วย **CodeMirror 6 แบบอ่านอย่างเดียว** ผ่านทางเข้าเดียวคือ `src/lib/code/index.ts`
(`mountCodeView(...)` สำหรับมุมมองเดี่ยว/unified และ `mountSplitCodeView(...)` สำหรับสองฝั่ง)

| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | ทางเข้าเดียว: mount/update/destroy + เปิดช่องค้นหา + เลื่อนไปบรรทัด + ผูก scroll สองฝั่ง |
| `editor.ts` | ตัว editor หนึ่งตัว (ใช้ร่วมกันทั้งสามมุมมอง) |
| `decorations.ts` | สีบรรทัดของ diff + gutter หมุดของ reading list (สร้างเฉพาะช่วงที่มองเห็น) |
| `languages.ts` | `language` จาก API → parser (import แบบ dynamic ทีละภาษา) |
| `theme.ts` | สีทั้งหมด (light + dark) ของโค้ด ช่องค้นหา บรรทัด diff และหมุด |

- **`EditorState.readOnly` ไม่ใช่ `editable: false`** — ปิด editable แล้วโฟกัสไม่ได้
  Cmd/Ctrl-F ก็ใช้ไม่ได้ตาม ทั้งที่การค้นหาในไฟล์คือหนึ่งใน user story
- เลขบรรทัดใน gutter เลื่อนตามช่วงที่ขอ (ขอ 61–79 ก็ขึ้น 61) ไม่ใช่เริ่มที่ 1 เสมอ
- ภาษาที่ไม่รู้จัก = plain text ไม่ใช่ error (แผนที่นามสกุลอยู่ที่ `src/shared/languages.ts`)
- `test/code.test.ts` สแกน `src/` บังคับว่ามีแต่ไฟล์ใน `lib/code` ที่ import CodeMirror ได้
  และไม่มีใครนอกโฟลเดอร์ import ไฟล์ข้างในตรง ๆ — เหตุผลเดียวกับ boundary ของไดอะแกรม

### code navigation (F12 / Shift+F12 / Alt+F12 / Cmd-click / กดค้าง)

`navigation.ts` ตัดสินว่าตำแหน่งไหนคือ identifier แล้วยิง `NavRequest` (ตัวเลข/สตริงล้วน)
ออกไปให้ `src/components/run/use-code-navigation.tsx` — การ resolve จริงเป็นงานของ index ฝั่ง
server (`server/nav/`)

| ช่องทาง | คำสั่ง |
|---|---|
| `F12` / Cmd(Ctrl)-click | go to definition |
| `Shift+F12` | find references (เปิดใน panel) |
| `Alt+F12` | peek references (block widget ใต้บรรทัด — `peek.ts`) |
| **กดค้างบน symbol (นิ้ว/ปากกา)** | เมนู 3 คำสั่งข้างบน — `long-press.ts` (state machine ล้วน) + `nav-menu.ts` (DOM ของเมนู) |

- ทุกช่องทางลงท้ายที่ `dispatchNav()` ตัวเดียวกัน — เพิ่มช่องทางใหม่ห้ามเปิดเส้นทาง logic ที่สอง
- กดค้าง **ไม่รับ pointer ของเมาส์**: บน desktop การกดค้างนิ่ง ๆ คือจังหวะเริ่มลากเลือกข้อความ
- ปล่อยก่อน 500ms / ขยับเกิน 10px / มีนิ้วที่สอง = ยกเลิก (การแตะ, การลากเลือก, การหนีบซูม
  ต้องทำงานตามปกติ)

## Reading-list panel

โค้ดไม่ได้เปิดเป็น "หน้า" — มันเปิดใน panel ด้านขวาที่ **ดันเนื้อหาให้แคบลง ไม่ใช่ลอยทับ**
(หน้าชั่วคราว `/r/<run>/_file` ของตั๋ว #7 ถูกถอดออกแล้ว)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/reading-panel.ts` | ตรรกะล้วน ไม่มี React/DOM — เทสต์อยู่ที่ `test/reading-panel.test.ts` |
| `src/lib/use-reading-panel.ts` | state ของ panel · แขวนไว้ที่ `RunLayout` เส้นเดียวต่อ run |
| `src/components/run/panel-context.ts` | ทางเข้าเดียวที่ทุกอย่างใช้เปิดโค้ด — `openTarget()` |
| `src/components/run/reading-panel.tsx` | ตัว panel: หัว + ดัชนีไฟล์ + ช่วงโค้ดเรียงตามที่ agent เขียน |

- **ห้ามเปลี่ยนกล่องนอกของ panel เป็น `fixed`/`absolute`** — มันเป็น flex sibling ของเนื้อหา
  โดยตั้งใจ ผู้อ่านต้องเห็นคำอธิบายกับโค้ดพร้อมกัน
- **state อยู่ที่ `RunLayout` ไม่ใช่ในหน้า** panel ที่เปิดค้างจึงรอดข้ามการสลับ section
- ประวัติ back/forward เป็นของ panel เอง ไม่ผูกกับ URL (ผูกแล้วมันหายตอนเปลี่ยน section)
- `changed` / `context` ใช้ตัวแสดงเดียวกัน ต่างกันแค่ตาราง `TONE` ในไฟล์ panel
- ความกว้างเก็บที่ `localStorage['learn-diff:panel-width']` — ข้าม run และข้าม session

## กางทั้งไฟล์ + diff (unified / side-by-side)

```
GET /api/runs/<id>/diff?path=<path เทียบ root ของ repo>
```

ตอบเป็น `FileDiffResponse`: `status` (`added` / `removed` / `modified` / `unchanged` / `binary` /
`unavailable`) + `hunks[]` (`{ oldStart, oldLines[], newStart, newCount }`) + `addedLines` /
`removedLines` · base มาจาก `baseCommit` ของ registry ก่อน ถ้าไม่มีค่อยอ่านจาก `run.json`

- **ส่ง hunk ไม่ส่ง diff ที่ render แล้ว** — แอปมีเนื้อไฟล์ฝั่งใหม่จาก file API อยู่แล้ว จึงประกอบ
  ได้ทั้ง unified และ side-by-side จากชุดเดียว และไม่ต้องขนไฟล์ฝั่งเก่ามาทั้งไฟล์
  (บรรทัดฝั่งเก่าที่ต้องใช้จริงมีแค่บรรทัดที่ถูกลบ ซึ่งอยู่ใน `oldLines`)
- **"เทียบไม่ได้" ไม่ใช่ error** — ไม่มี `baseCommit` หรือยังไม่ได้ `git fetch` base มา จะได้
  200 + `status: 'unavailable'` + `reason` เป็นภาษาไทย เพราะโค้ดยังอ่านได้ตามปกติ แค่ไม่มีสี
- `git diff -U0 --no-renames` โดยตั้งใจ: ไม่เอาบริบท (แอปมีอยู่แล้ว) และไฟล์ที่ถูกเปลี่ยนชื่อมา
  ถือว่า "เพิ่มใหม่ทั้งไฟล์" ซึ่งตรงกับสิ่งที่ผู้อ่านเห็น (เราแสดงไฟล์ที่ path ปลายทางเสมอ)
- การประกอบ hunk เป็นแถวอยู่ที่ `src/lib/diff.ts` (ล้วน ๆ ไม่มี React/CodeMirror) —
  `buildRows()` → `unifiedDoc()` / `splitDocs()` · เทสต์อยู่ที่ `test/diff.test.ts`

ในการ์ดของแต่ละช่วง:

- **ปุ่ม "ทั้งไฟล์" กางช่วงนั้นเป็นทั้งไฟล์ที่เดิม** โดยยังคงสีของ diff และโชว์หมุดของช่วงอื่น
  ในไฟล์เดียวกัน (แถบซ้ายสุด + ปุ่มหมุดในหัวการ์ด) — ซูมออกแล้วต้องไม่หลุดจากลำดับการอ่าน
- **กางแล้ว editor ได้ความสูงคงที่ (`65vh`) ไม่ใช่ปล่อยยาว** เพราะ CodeMirror จะ virtualize
  ก็ต่อเมื่อมันเป็นตัว scroll เอง — ไฟล์ 27,000 บรรทัดจึงมี `.cm-line` ในหน้าไม่ถึง 30 อัน
- **ตำแหน่งเริ่มต้นส่งผ่าน `scrollTo` ของ CodeMirror ตอนสร้าง editor** ไม่ใช่สั่ง scroll ทีหลัง —
  dispatch ภายในที่ตามมา (เช่นตอน grammar ของภาษาโหลดเสร็จ) จะดึง scroll กลับไปที่ anchor เดิม
- โหมด diff เก็บที่ `localStorage['learn-diff:diff-mode']` (`unified` เป็นค่าเริ่มต้น) เป็นค่าของ
  **ผู้อ่าน** — กดที่การ์ดใบเดียว การ์ดอื่นเปลี่ยนตามทั้งหมด และข้ามไฟล์/ข้าม session
- โหมด side-by-side **ปิด line wrapping** เพราะสองฝั่งต้องอยู่แถวเดียวกัน · การ sync scroll
  ใช้วิธี "เทียบก่อนค่อยเซ็ต" ไม่ใช่ธงกันชนที่ปลดใน `requestAnimationFrame`
  (ธงแบบนั้นค้างทันทีที่เบราว์เซอร์หยุดวาด แล้วสองฝั่งก็เลื่อนหลุดกันถาวร)

### ทางเข้าโค้ดทุกทางเรียก `openTarget()` ตัวเดียว

| กดที่ไหน | มาจากข้อมูลไหน |
|---|---|
| กล่องในไดอะแกรม | `nodeMap` ใน run.json → `renderDiagram({ onNodeClick })` |
| ปุ่ม "อ่านโค้ด" ในแผนที่กล่อง | `boxMap[].readingList` (ไม่มีก็ใช้ของ section ที่แถวนั้นชี้ไป) |
| ปุ่มหัว section | `sections[].readingList` |
| `:read` / `:file` ในเนื้อความ | directive ในไฟล์ .md |

การกด node **ไม่ได้ใช้คำสั่ง `click` ของ mermaid** — `securityLevel` ยังเป็น `strict` และตัววาด
เดินบน SVG แล้วผูก handler เองจาก `nodeMap` (เทสต์บังคับไว้ที่ `test/diagram.test.ts`)

## comment ของ PR (ผ่าน gh CLI)

```
GET    /api/runs/<id>/comments                 อ่าน review + issue comment ของ PR
POST   /api/runs/<id>/comments                 { body, path?, line? }
PATCH  /api/runs/<id>/comments/<kind>/<id>     { body }        kind = review | issue
DELETE /api/runs/<id>/comments/<kind>/<id>
```

**route เดียวใน API ที่เขียนได้** — ที่เหลือยังตอบ 405 กับทุก method ที่ไม่ใช่ GET/HEAD
(guard อยู่ใน `createApiHandler()` และผ่อนเฉพาะ path ที่ segment ที่สามเป็น `comments`)

- browser ไม่เคยแตะ GitHub เอง: server เรียก `gh api` ด้วย credential ของเครื่อง —
  endpoint พวกนี้จึง **act ในนามบัญชี GitHub ของเจ้าของเครื่อง** ด่านกันคนนอกคือ Cloudflare
  Access หน้า tunnel (viewer ไม่มี auth layer ของตัวเอง โดยตั้งใจ)
- **กันการยิงข้ามเว็บ (CSRF) ที่ตัว handler เอง** — Cloudflare Access กันคนที่มาทาง tunnel
  ไม่ได้กัน browser ของเจ้าของเครื่องที่ยิงมาที่ `127.0.0.1:5174` (พอร์ตกับ run id เดาได้ทั้งคู่
  และ CORS ไม่ช่วยเพราะ side effect เกิดก่อน browser บล็อกการอ่านคำตอบ) · method เขียนทุกตัวต้อง
  ผ่าน `Sec-Fetch-Site` ที่เป็น same-origin/none (ถ้า client ไม่ส่ง header นี้ ใช้ `Origin`
  เทียบกับ host แทน) **และ** ต้องเป็น `content-type: application/json` — ปิดรูป
  `<form enctype="text/plain">` ข้าม origin ที่ไม่ต้อง preflight (`test/comments.test.ts`)
- ตัวรัน gh เป็น dependency ที่ inject ได้ (`createApiHandler({ gh })`) — เทสต์ใช้ fake
  เพื่อพิสูจน์ payload ที่ส่งไป GitHub (`test/comments.test.ts`)
- **การเลือกชนิด comment**: บรรทัดอยู่ใน diff (hunk ชุดเดียวกับที่ใช้ลงสี) → review comment
  ผูก `commit_id` ที่ run pin ไว้ · นอก diff → issue comment ที่แนบ permalink
  `blob/<sha>/<path>#L<n>` นำหน้าข้อความ · ไม่ระบุบรรทัด → issue comment ธรรมดา
- **"เทียบ diff ไม่ได้" ไม่ใช่ "อยู่นอก diff"** — `loadDiff` คืน `status: 'unavailable'` +
  `hunks: []` เมื่อไม่มี `baseCommit` หรือยังไม่ `git fetch` base มา (สถานะปกติของการ review PR
  ของคนอื่นบน clone ใหม่) · fallback เหมือนกันแต่ `fallback.kind` ต่างกัน (`outside-diff` /
  `diff-unavailable` + `reason` จริง) เพื่อไม่ให้ toast ยืนยันสิ่งที่ server ไม่รู้
- gh ไม่มี / ยังไม่ login → error ที่บอกคำสั่งที่ต้องรัน (`gh_unavailable` / `gh_not_authenticated`)
  แล้ว **แถบ comment ในกล่องโค้ดจะไม่โผล่เลย** เหตุผลถูกประกาศที่กล่องระดับ PR ท้ายหน้า run
  (ปุ่มที่กดแล้วส่งไม่ได้คือ dead click)

| ไฟล์ | หน้าที่ |
|---|---|
| `server/gh.ts` | ตัวรัน gh + แปลง stderr เป็น error ที่บอกวิธีแก้ + ตรวจ `gh auth status` (จำผลที่สำเร็จ) |
| `server/comments.ts` | เลือกชนิด comment, ประกอบ payload, map ผลของ GitHub เป็น `PrComment` |
| `src/lib/code/comments.ts` | แถบ gutter (หลังกำแพง CodeMirror) — ยิง `CommentRequest` ออกมาเป็น plain data |
| `src/lib/comments.ts` | จับคู่ comment เข้ากับ path+line (ฟังก์ชันล้วน · `test/comments-map.test.ts`) |
| `src/lib/use-comments.ts` | store ของทั้ง run — แขวนที่ `RunLayout` เหมือน reading panel |
| `src/components/run/comment-box.tsx` | กล่องเขียน (markdown + preview ด้วย `<Prose>` เดิม) + comment หนึ่งอัน |
| `src/components/run/line-comments.tsx` | กล่อง comment ของบรรทัดที่กดในการ์ดนั้น |
| `src/components/run/pr-comments.tsx` | กล่องระดับ PR ท้ายหน้า run |

- **comment เปิดจาก gutter, navigation เปิดจาก symbol** — คนละ target โดยตั้งใจ ไม่งั้นบน touch
  ทั้งสองฟีเจอร์จะแย่งการกดเดียวกัน
- ดึงตอนเปิด run + ปุ่ม refresh เท่านั้น (**ไม่ poll**) · ผลของการส่ง/แก้ถูก merge เข้า state
  จากสิ่งที่ GitHub ตอบกลับ ไม่ใช่ค่าที่เดาเอง
- ลบมียืนยันสองจังหวะในที่ ไม่ใช่ `window.confirm` (บนมือถือผ่าน tunnel กล่องของเบราว์เซอร์
  เด้งคนละที่กับสิ่งที่กด)

## Validation warnings

`GET /api/runs/:id` ตอบ `warnings[]` มาพร้อมเนื้อหาเสมอ แล้วแอปแปะไว้บนหัวทุกหน้าของ run นั้น
(`components/run/status.tsx` → `<Warnings/>`) · **กดแล้วไม่มีอะไรเกิดขึ้นคือผลลัพธ์ที่แย่ที่สุด**
ของที่จะทำให้เกิดเหตุนั้นจึงต้องดังตั้งแต่ก่อนกด — รายการ code ทั้งหมดอยู่ใน
[references/content-format.md](../references/content-format.md)

- ตรรกะอยู่ที่ `server/validate.ts` ทั้งหมด · เทสต์อยู่ที่ `test/validate.test.ts` ซึ่งสร้าง
  **git repo จริง** ใน temp dir เพราะข้อหนึ่งที่ตรวจคือช่วงบรรทัดที่ commit ที่ pin ไว้
- เพิ่มการตรวจใหม่ = เพิ่มใน `collectWarnings()` แล้วเขียนเทสต์ยิงใส่ `/api/runs/:id`
  (ห้ามย้ายไปตรวจฝั่งเบราว์เซอร์ — จะเทสต์ไม่ได้ตาม seam ที่สเปกเลือกไว้)
- warning ที่เป็นการเช็ค "ไม่มีใครอ้าง / ไม่มีในไดอะแกรม" ถูกกลั้นไว้จนกว่าทุก section
  จะถูกเขียนครบ ไม่งั้นระหว่าง generate จะขึ้นเตือนของที่ยังตัดสินไม่ได้

## หมายเหตุสำหรับคนแก้ viewer

- ใช้ shadcn/ui แบบ copy-in — เพิ่ม component ด้วย `pnpm dlx shadcn@latest add <name>`
  (ค่า config อยู่ใน `components.json`, design token อยู่ใน `src/index.css`)
- `pnpm-workspace.yaml` มีไว้เพื่อ `onlyBuiltDependencies: [esbuild]` — pnpm 10+ บล็อก
  postinstall script โดย default ถ้าไม่ประกาศไว้ vite จะพังตอนรัน
