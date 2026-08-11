# Calibration log — บันทึกการเลือก model/effort เพื่อเรียนรู้

log นี้คือความจำของ skill: ทุก run จบแล้วต้อง append entry (ดูขั้น 4 ใน SKILL.md)
และทุกครั้งที่ออกแบบ workflow ใหม่ต้องอ่านส่วน **Lessons** ก่อน

เป้าหมายคือจับ **การเลือกที่ผิด** สองทิศ:

- **under-provisioned** — เลือก tier/effort ต่ำไป: ผลงานคุณภาพไม่พอ, agent วนแก้หลายรอบ,
  ต้องรันซ้ำด้วย tier สูงกว่า (จ่ายสองต่อ)
- **over-provisioned** — เลือกสูงไป: งาน mechanical ง่าย ๆ แต่ใช้ opus/fable,
  cost จริงสูงกว่าที่งานควรเป็นชัด ๆ

และจับ **estimate ที่พลาด**: cost จริงต่างจาก pre-run estimate เกินเท่าตัว → จดว่าพลาดเพราะอะไร
(เดา token น้อยไป? ลืมคิด cache write? จำนวน call ต่อ agent มากกว่าคาด?)

## Lessons (สรุปที่กลั่นแล้ว — อ่านก่อนออกแบบทุกครั้ง)

<!-- เมื่อ entry สะสมพอจนเห็น pattern ให้กลั่นขึ้นมาเป็นข้อสั้น ๆ ที่นี่
     และถ้า lesson ไหนชัดจนควรเป็นกฎถาวร ให้ย้ายไปแก้ policy table ใน SKILL.md เลย
     แล้วลบออกจากส่วนนี้ -->

(ยังไม่มี — รอข้อมูลจาก run จริง)

## Entries (ใหม่สุดอยู่บนสุด)

### 2026-08-11 · implement DBT-445 subtickets (voided-order e-tax fix)

- **Task:** implement 5 subtickets (guard voided ใน resend/retry, admin filter, regression tests,
  remediation command) — sequential impl → review ขนาน 2 lens → fix
- **Design:** f2:impl-451-452-454, s2:impl-453, s2:impl-455-command, 2×o3:review (logic/spec), o3:fix
- **Estimate → Actual:** $20–40 → **$16.83** (fable $4.37 / opus $11.43 / sonnet $1.03;
  cr รวม ~15.8M, out 194k, ~72 นาที)
- **Verdict:** ✅ model/effort เหมาะ · 🎯 estimate สูงไปเล็กน้อย (ยังในช่วง) ·
  ⚠️ ล้มเหลวเชิง environment ไม่ใช่ tier
- **เหตุผล/หลักฐาน:** o3:review-logic คุ้มมาก — เจอ HIGH 2 ตัวที่ implement มองข้าม
  (ok=True reset ใน check_order_d1a_json_data, bypass_error_check ข้าม validate_status)
  พร้อมยืนยันจาก prod replica ว่า reachable จริง · o3:fix บวม (117 turns, $7.77) เพราะแก้ 11 findings
  + เขียน test ใหม่ทั้งไฟล์ — สมเหตุสมผล · **ปัญหาใหญ่: workflow รันใน main checkout ที่ session อื่น
  ใช้อยู่พร้อมกัน** → commit หลงไปลง branch อื่น (DBT-398), agent ต้อง cherry-pick กู้เอง,
  s2:impl-455 หยุดงานเพราะ HEAD ถูกสลับกลางคัน ($0.35 เสียเปล่า งานไม่ได้เริ่ม)
- **ครั้งหน้า:** งาน implement ที่ commit จริง **ต้องใช้ isolation: 'worktree' เสมอ**
  ถ้า checkout หลักอาจถูก session อื่นใช้ — อย่าเชื่อว่า branch ที่ prompt บอกคือ branch
  ที่ checkout อยู่ · review 2 lens (logic vs spec) แยกชัด ไม่ overlap — ใช้ต่อ

### 2026-08-07 · implement learn-diff reading checklist + coverage meter

- **Task:** implement SPEC-reading-checklist.md (span checkbox, section state, header
  progress, coverage meter vs git diff) ใน viewer — impl เดี่ยว → review ขนาน 2 → fix
- **Design:** f1:impl-checklist, 2×o3:review (spec + bugs), o3:fix — 4 agents
- **Estimate → Actual:** $14–29 → **$20.87** (fable $8.39 / opus $12.48; cr รวม ~17.7M,
  out 159k, 151 turns, ~38 นาที)
- **Verdict:** ✅ estimate ตรง (ครั้งแรกที่ใช้สูตร "impl เต็ม spec = $5–15/ตัว" จาก entry ก่อน)
  · 🔻 f1 (effort low) น่าจะต่ำไปเล็กน้อยสำหรับ impl เต็ม spec
- **เหตุผล/หลักฐาน:** impl f1 ทำครบ spec + 274 tests ผ่านใน 31 turns ($8.39 — ถูกกว่า o3
  impl ใน run ก่อนชัดเจน) แต่ปล่อย major หลุด 3 ตัวจริง: parser `+++` state-machine bug
  (silent wrong data), dead click ต่อ hunk, silent failure ไม่มี retry — ล้วนเป็นประเภท
  edge-case/robustness ที่ effort สูงกว่ามักเก็บเอง ผลคือ o3:fix บวม (70 turns, $6.92,
  แพงเกือบเท่า impl) รวมแล้วประหยัดจาก impl ถูกแต่จ่ายคืนที่ fix เกือบหมด ·
  review ขนาน 2 ตัว overlap กัน 2 คู่ (เจอ parser bug กับ silent-failure ซ้ำกัน) —
  มุมมองต่างกันจริงแค่บางส่วน
- **ครั้งหน้า:** impl เต็ม spec ใช้ f2/o2 ขึ้นไป — f1 เหมาะกับงาน scoped แคบกว่านี้
  (single module + tests) · ถ้าจะใช้ tier/effort ต่ำที่ impl ให้เผื่อ budget fix ≈ impl ·
  review 2 ตัวให้แยก lens ชัดกว่านี้ (เช่น ตัวหนึ่ง server/data เท่านั้น อีกตัว UI/state)
  ลด overlap

<!-- Template — copy ไปกรอก:

### YYYY-MM-DD · <ชื่องานสั้น ๆ>

- **Task:** <task description ย่อ>
- **Design:** <จำนวน agent + label เช่น 4×s2:read, 2×o3:verify>
- **Estimate → Actual:** $X–Y → $Z (in/cw/cr/out รวม: …)
- **Verdict:** ✅ ok | 🔻 under-provisioned | 🔺 over-provisioned | 🎯 estimate พลาด
- **เหตุผล/หลักฐาน:** <เห็นอะไรถึงตัดสินแบบนี้ เช่น "s2:verify ปล่อยบั๊กหลุด 2 ตัว
  ที่ o3 รอบสองจับได้" หรือ "h1 ทำงานสรุปได้ครบ ไม่ต่างจาก s2 ที่เคยใช้">
- **ครั้งหน้า:** <จะเลือกต่างยังไง>
-->

### 2026-08-07 · implement learn-diff viewer specs #47 #48 #49

- **Task:** implement 3 spec (polish / touch / GitHub comments) ของ viewer ใน worktree เดียว
  แบบ sequential + review ขนาน + fix
- **Design:** 1×s2:explore, o2:impl-47, o3:impl-48, o3:impl-49 (sequential),
  3×o3:review ขนาน, 1×o3:fix — รวม 8 agents
- **Estimate → Actual:** $10–22 → **$46.55** (in 21k / cw 1.27M / cr 60.5M / out 365k,
  1.30M output-side tokens, 519 tool calls, ~99 นาที)
- **Verdict:** ✅ model/effort เหมาะ · 🎯 estimate พลาดเกิน 2 เท่า
- **เหตุผล/หลักฐาน:** ผลงานคุณภาพดี — implementer ทำครบ spec + test ผ่านหมด (342 tests),
  reviewers (o3) จับของจริงได้หนัก ๆ: CSRF blocker ที่ยิงพิสูจน์จริง, บั๊กพิกัด zoom ที่
  unit test เดิมมองไม่เห็น, fallback เงียบของ diff-unavailable — คุ้ม tier o3 ชัดเจน ·
  ที่ estimate พลาด: เดา cache read ต่อ implementer แค่ 300k–1M แต่จริง 6M–21M
  (agent 100+ turns, ทุก turn อ่าน cache ทั้งก้อน — cache read โตแบบ ~quadratic กับจำนวน turn)
  และ implementer ตรวจด้วยมือผ่าน browser ด้วยทำให้ turn เยอะ
- **ครั้งหน้า:** ประเมิน cache read จาก "จำนวน turn คาดการณ์ × ขนาด context สะสม" —
  งาน implement เต็ม spec ต่อ agent คิดขั้นต่ำ ~$5–15/ตัว (opus) ไม่ใช่ $2–5 ·
  งานที่ agent ต้อง verify ด้วย browser เอง ให้คูณ turn เพิ่มอีกเท่าตัว
