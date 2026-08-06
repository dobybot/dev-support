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

(ยังไม่มี entry)
