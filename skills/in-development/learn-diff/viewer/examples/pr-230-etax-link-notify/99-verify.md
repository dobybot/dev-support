## 02 — ทริกเกอร์ + เครื่องหมาย + hot path

::::question
**Q1.** ร้านเปิดฟีเจอร์แล้ว ออเดอร์ Lazada ใบหนึ่งส่งอีเมลสำเร็จเมื่อวาน วันนี้ dobysync sync ออเดอร์เดิมเข้ามาอีกรอบ (ลูกค้าเปลี่ยนที่อยู่จัดส่ง) **ผู้ซื้อจะได้อีเมลซ้ำไหม และอะไรคือสิ่งที่กันไว้?**

:::answer
**ไม่ได้ซ้ำ** และสิ่งที่กันไว้คือ `_carry_over_extra_keys()` — ไม่ใช่ task id และไม่ใช่เครื่องหมายเพียงลำพัง

เหตุผล: payload ที่ sync เข้ามา**ไม่มี `extra`** (serializer เติม `{}` ให้) ถ้าไม่มีฟังก์ชันนี้ `self.order_json = order` จะทับ `extra` ทิ้งทั้งก้อน เครื่องหมาย `etax_link_notified_at` หายไป → ฝั่ง enqueue เห็นว่า “ยังไม่เคยส่ง” → สร้างงานใหม่ → ผู้ซื้อได้อีเมลซ้ำ**ทุกรอบ sync**

task id คงที่ช่วยได้แค่ช่วงเวลาสั้น ๆ เพราะ Cloud Tasks จำ id ที่เพิ่งใช้ได้ระยะหนึ่งเท่านั้น ข้ามวันแล้วไม่กันให้

::verify[`task test:dobybot -- etax.tests.test_etax_link_notify_enqueue.…test_marker_survives_the_next_sync` · แล้วลองคอมเมนต์บรรทัด `self._carry_over_extra_keys(order)` ที่ `picking/models/models.py:504` ออก แล้วรันใหม่ — ต้องแดง]
:::
::::

::::question
**Q2.** ถ้าวันหนึ่ง dobysync เริ่มส่ง `extra.etax_link_notified_at` มาใน payload เอง (ค่าเก่ากว่าที่เรามีใน DB) **ค่าไหนชนะ และทำไมถึงออกแบบแบบนั้น?**

:::answer
**ค่าจาก payload ชนะ** เพราะโค้ดใช้ `new_extra.setdefault(key, value)` — `setdefault` เขียนก็ต่อเมื่อ key*ยังไม่มี*

เจตนาคือ “ยกค่าเก่ามาเฉพาะเมื่อไม่มีใครส่งค่ามา” ไม่ใช่ “ค่าเก่าชนะเสมอ” ถ้าใช้ `new_extra[key] = value` แทน ระบบจะกลายเป็นการ**ย้อนค่าเก่ามาทับของใหม่ตลอดกาล** ซึ่งเป็นบั๊กที่หาเจอยากมาก — ข้อมูลจะ “ไม่ยอมอัปเดต” โดยไม่มี error ให้เห็น

::verify[อ่าน `picking/models/models.py:416` · ยังไม่มีเทสต์ครอบเคสนี้โดยเฉพาะ — **เป็นช่องว่างของเทสต์ที่คุ้มค่าจะเติม**]
:::
::::

## 03 — handler + ช่องทางส่ง

::::question
**Q3.** ร้านตั้ง `ETAX_LINK_NOTIFY_CHANNEL = "chat"` แต่ยังไม่ได้ต่อแชท Lazada ออเดอร์ที่ validate ไม่ผ่านเข้ามา **จะเกิดอะไรขึ้นทั้งหมด 4 อย่าง** (HTTP, อีเมล, log, เครื่องหมาย)?

:::answer
1. **handler ตอบ 200** พร้อม `{"status": "not_sent", "channels": {"chat": "no_recipient"}}`
2. **ไม่มีอีเมลถูกส่ง** — ไม่ fallback ข้ามช่องทางเด็ดขาด เพราะข้อความแชทเป็นของที่ staff คุมด้วยเหตุผล policy ของ Lazada
3. **มี log 1 แถว** `channel=LAZADA_CHAT`, `credit=0`, `status.reason = "CHAT_NOT_CONNECTED"` — เขียนโดยฝั่งฟีเจอร์นี้เอง เพราะ `send_lazada_chat` คืน `None` เงียบ ๆ ไม่เขียนอะไรให้
4. **ไม่ปั๊มเครื่องหมาย** — รอบ sync ถัดไปจะลองใหม่ ซึ่งถูกต้อง เพราะร้านอาจไปต่อแชทวันนี้

ข้อ 3 สำคัญกว่าที่ดู: นี่คือสภาพของ **16 จาก 24 ร้าน**ที่เปิด auto-create บน prod ถ้าไม่มีแถวนี้ คนที่มา rollout จะเห็น “ไม่มีอะไรเกิดขึ้นเลย” ซึ่งแยกไม่ออกจากบั๊ก

::verify[`task test:dobybot -- etax.tests.test_etax_link_notify_chat.…test_shop_without_chat_connection_is_logged_and_not_marked` และ `…test_chat_failure_never_falls_back_to_email`]
:::
::::

::::question
**Q4.** staff แก้ข้อความแชทเป็น `"ขอใบกำกับภาษี {order_number ที่ {etax_link}"` (ปีกกาเปิดเกินมาหนึ่งตัว) **handler จะตอบอะไร และผู้ซื้อจะได้อะไร?**

:::answer
**handler ตอบ 200** · ผู้ซื้อ**ไม่ได้รับอะไร** · มี log 1 แถว `status.reason = "TEMPLATE_INVALID"` · ไม่ปั๊มเครื่องหมาย · มี event เข้า Sentry

จุดที่ควรจำ: `safe_format` **ไม่ได้ safe ทุกอย่าง** — มันคือ `template.format_map(defaultdict(str, values))` ซึ่งกลืนได้แค่*ตัวแปรที่ไม่รู้จัก* ปีกกาไม่ครบคู่ยังทำให้ `format_map` โยน `ValueError` อยู่ดี

โค้ดตอนแรกของ PR นี้เรียก `build_chat_message()` นอก try/except → **ตอบ 500** ซึ่งผิดสัญญา “handler ตอบสำเร็จเสมอ” · แก้ในคอมมิต `1ebc4cf`

::verify[`task test:dobybot -- etax.tests.test_etax_link_notify_chat.…test_broken_template_is_logged_and_handler_still_answers_200`]
:::
::::

::::question
**Q5.** ร้านตั้ง `both` · อีเมลส่งไม่สำเร็จ (Taximail ตอบ 500) แต่แชทส่งสำเร็จ **เครื่องหมายถูกปั๊มไหม? แล้วถ้ากลับกัน — อีเมลสำเร็จ แชทล้ม?**

:::answer
**ปั๊มทั้งสองกรณี** เกณฑ์คือ `RESULT_SENT in results.values()` — สำเร็จ**อย่างน้อยหนึ่งช่อง** ไม่ใช่ทุกช่อง และไม่ใช่ช่องใดช่องหนึ่งที่เจาะจง

เหตุผลเชิง product: เป้าหมายคือ “ผู้ซื้อได้รับข่าว” ถ้าเขาได้รับทางแชทแล้ว การส่งอีเมลซ้ำในรอบถัดไป คือการทวงซ้ำ ซึ่ง US6 ห้ามไว้

ทั้งสองกรณีมี log **2 แถว** (ช่องละแถว) — ช่องที่ล้มก็ยังทิ้งร่องรอย

::verify[`…test_both_channel_counts_as_sent_when_only_chat_succeeds` และคู่ของมัน `…test_both_channel_is_not_marked_when_no_channel_succeeds`]
:::
::::

::::question
**Q6.** ออเดอร์ที่ผู้ซื้อไม่มีอีเมล และร้านตั้งช่องทางเป็น `email` ออเดอร์นี้ sync วันละ 3 รอบ ติดกัน 12 วัน (`ETAX_ORDER_OPEN_DAYS = 10`) **จะมี log กี่แถว และมี Cloud Task ถูกสร้างกี่ใบ?**

:::answer
**Cloud Task ~36 ใบ · log ~30 แถว** (ตัวเลขคร่าว ๆ — task id คงที่ช่วยยุบงานที่เข้ามาชิดกันได้บ้าง)

เหตุผล: ฝั่ง enqueue ตรวจแค่ *3 อย่างที่ถูก* และหนึ่งในนั้นคือเครื่องหมาย ซึ่ง**ไม่มีวันถูกปั๊ม** เพราะส่งไม่สำเร็จสักครั้ง จึงสร้างงานใหม่ทุกรอบ sync

วันที่ 1–10: handler ผ่านด่าน eligibility → เขียน log `NO BUYER EMAIL` ทุกครั้ง (~30 แถว)
 วันที่ 11–12: ติดด่าน `past_order_open_days` → **ยังสร้าง task อยู่** (ฝั่ง enqueue ไม่รู้จักด่านนี้) แต่**ไม่มี log สักแถว**

นี่คือสองประเด็นในหน้าเดียวกัน: (ก) การ enqueue **ไม่มีเพดาน** — สเปก D6 ยอมรับ “รอบ sync ถัดไปคือ retry” แต่ไม่เคยประเมินว่าเป็นกี่รอบ · (ข) ช่วงหลังด่านปิด **ระบบเงียบสนิท** ไม่มีร่องรอยว่ายังทำงานอยู่

::verify[อ่าน `maybe_enqueue_etax_link_notify` (`etax_link_notify.py:106`) เทียบกับ `notify_etax_link` (`:488`) — สังเกตว่าด่าน eligibility อยู่ฝั่งไหน · หลัง rollout ยืนยันด้วย: `SELECT to, COUNT(*) FROM logger_smslog WHERE remark='ETAX-LINK-NOTIFY' GROUP BY 1 HAVING COUNT(*) > 3;`]
:::
::::

## 01 — ด่าน eligibility

::::question
**Q7.** ร้านตั้ง `ETAX_ORDER_OPEN_DAYS = 10` · ออเดอร์ลงวันที่ 1 ส.ค. **วันที่ 11 ส.ค. ผู้ซื้อยังกดลิงก์ได้ไหม?** แล้ววันที่ 12?

:::answer
**11 ส.ค. = ยังได้** · **12 ส.ค. = ไม่ได้แล้ว**

เงื่อนไขคือ `timezone.localdate() > order_date + timedelta(days=open_days)` ใช้ `>` ไม่ใช่ `>=` — 1 ส.ค. + 10 วัน = 11 ส.ค. และ `11 > 11` เป็นเท็จ จึงยังผ่าน

เป็น off-by-one ที่รีแฟกเตอร์ทำหลุดง่ายที่สุด และไม่มีใครสังเกตจนกว่าลูกค้าจะโวย จึงมีเทสต์ปักหมุดไว้เฉพาะ

::verify[`task test:dobybot -- etax.tests.test_etax_link_eligibility.…test_last_day_of_open_days_still_eligible`]
:::
::::

::::question
**Q8.** ร้านเปิด `ETAX_BYPASS_CUTOFF_DATE_CHECK` · ผู้ซื้อ (ไม่ใช่ staff) เปิดลิงก์ของออเดอร์ที่เลยวันตัดรอบสรรพากรไปแล้ว **ก่อน PR นี้ได้อะไร และหลัง PR นี้ได้อะไร?**

:::answer
**ก่อน:** ถูกบล็อก ได้ `ORDER_IS_NO_LONGER_ELIGIBLE_FOR_ETAX_REQUEST` — setting นั้นเป็นสิทธิ์ของ staff เท่านั้น โค้ดเดิมแก้ `cutoff_check` ก็ต่อเมื่อ `is_staff` เป็นจริง

**หลัง:** **ผ่าน** — setting ครอบทุกคนเท่ากัน

นี่คือ 🚨 หลักของหน้า 01 · **เป็นธรรมกับโค้ด:** การเปลี่ยนนี้ทำให้ตรงกับด่านกลางที่ `d1a_import_document:452` ซึ่งเคารพ setting นี้กับทุกคนอยู่แล้ว ของเดิมคือความไม่สอดคล้อง และ**ตรวจ prod แล้ว: 0 จาก 966 บริษัทเปิด setting นี้** จึงไม่มีผลจริงวันนี้

**แต่ยังเป็นปัญหา:** #219 ประกาศตัวว่าเป็น pure prefactor ที่ “ไม่เปลี่ยนพฤติกรรมแม้แต่นิดเดียว” คนที่รีวิวตั๋วนั้นจึงรีวิวหลวมกว่าที่ควร — เป็นเรื่อง*ข้อตกลงในการรีวิว* ไม่ใช่ความถูกต้องของโค้ด

::verify[`task test:dobybot -- etax.tests.test_etax_link_eligibility.…test_bypass_setting_applies_to_buyer_too` · และ `grep -n "BYPASS_CUTOFF" services/etax_invoice/etax_service.py`]
:::
::::

## 05 — ล้าง prefill

::::question
**Q9.** ผู้ซื้อเปิดหน้า ETax Link จาก**ลิงก์ SMS** ของออเดอร์ปกติ ที่ออกเอกสารอัตโนมัติได้อยู่แล้ว **ฟอร์มจะเปลี่ยนไปจากเดิมไหม?**

:::answer
**ไม่เปลี่ยนเลยแม้แต่ฟิลด์เดียว** — ออเดอร์นั้นไม่มี `order_json.extra.auto_etax_errors` (คีย์นี้เขียนเฉพาะตอน validate ไม่ผ่าน) `get_unusable_prefill_fields()` จึงคืน set ว่าง = ไม่ล้างอะไร

นี่คือความเสี่ยงข้อเดียวที่ตั๋ว #222 แคร์จริง ๆ — ไม่ใช่ “ล้างไม่ครบ” แต่คือ “ล้างของที่ไม่ควรล้าง” เพราะเส้นทาง SMS/QR มีผู้ใช้จริงอยู่แล้ว

::verify[`task test:dobybot -- etax.tests.test_etax_link_prefill.…test_order_without_auto_etax_errors_is_unchanged`]
:::
::::

## Verification checklist

ก๊อปไปวางในช่อง Verification ของ PR — ทุกข้อเริ่มที่ `PD (Pending)` เปลี่ยนเป็น `OK` เฉพาะข้อที่**ทำจริงแล้ว** ไม่ใช่ข้อที่อ่านแล้วเชื่อ

:::checklist
## Verification — PR #230 (DBT-337) ### ⬛ blackbox — ทดสอบด้วยขั้นตอน - [ ] PD — routing: `task test:dobybot -- etax.tests.test_etax_link_notify_handler` ผ่าน (path `link-notify/tasks/handler/` ต่อถูก ไม่ได้ 404) - [ ] PD — channel=EMAIL ในแถวอีเมลเดิม: `task test:dobybot -- logger.tests.test_models` → `test_success_log_has_email_channel` + `test_old_rows_with_blank_channel_still_readable` ผ่าน ### ⬜/🔲 ความเข้าใจที่ต้องยืนยัน - [ ] PD — 01: อธิบายได้ว่าทำไม helper ตอบเป็น *เหตุผล* ไม่ใช่ error code และทำไมลำดับของด่านถึงมีความหมาย - [ ] PD — 01: รับทราบการเปลี่ยนพฤติกรรมเรื่อง `ETAX_BYPASS_CUTOFF_DATE_CHECK` (0/966 บริษัทเปิดอยู่ → ไม่มีผลจริงวันนี้) และตัดสินใจว่ารับได้/ต้องแยกตั๋ว - [ ] PD — 02: อธิบายได้ว่า task id คงที่ กับ marker กันคนละเรื่องกันอย่างไร - [ ] PD — **02: ตัดสินใจเรื่อง `_carry_over_extra_keys` ในเส้น sync** → รับไว้ตามนี้ / เปลี่ยนเป็นคอลัมน์จริงบน PickOrder / แยกเป็นตั๋ว - [ ] PD — 03: อธิบายได้ว่า "ไม่ fallback ข้ามช่องทาง" เป็นเรื่อง policy ของ Lazada ไม่ใช่ UX - [ ] PD — 03: อธิบายได้ว่าทำไม handler ต้องตอบ 200 เสมอ - [ ] PD — 04: อธิบายได้ว่าทำไม migration ทั้งสองใบปลอดภัย และทำไมห้าม backfill - [ ] PD — 05: อธิบายได้ว่าทำไม `customer_phone` ที่ถูกปิดบังแต่ผ่าน validate ถึงไม่ถูกล้าง ### ⚠️ ต้องตัดสินใจก่อน merge - [ ] PD — เพิ่ม log ตอนถูกด่าน eligibility ปัดตก (แก้ตอนนี้ / แยกตั๋ว) — ตอนนี้ SmsLog ว่าง + Sentry ว่าง = คนไล่หาสาเหตุตอน rollout ตัน - [ ] PD — ประเมินการแย่ง `LAZADA_CHAT_DAILY_LIMIT` กับข้อความ "พร้อมส่ง" ของร้านนำร่อง - [ ] PD — ยืนยันว่าหน้ารายงาน SMS ฝั่งลูกค้ากรอง `channel=EMAIL` / `remark` ใหม่ได้จริง (US12/US14) - [ ] PD — แยกตั๋ว: `AllowAny` + `is_staff` จาก request body บน `/api/etax/get-etax/` - [ ] PD — แยกตั๋ว: fixture ค้างของ `test_get_company_settings` (ขาด 10 คีย์ · 7 ตัวมีมาก่อน branch นี้) ### 🚀 ก่อนเปิดร้านแรก (#220 / #227) - [ ] PD — พิสูจน์ว่า `gcloud tasks queues pause etax-link-notify` ทำงานจริง (#220 AC5) — เป็น kill switch ตัวจริง ต้องพิสูจน์ *ก่อน* ไม่ใช่ตอนต้องใช้ - [ ] PD — บันทึกคำสั่ง + ผล describe ลงคอมเมนต์ #220 (AC4) - [ ] PD — ตรวจ `ETAX_ORDER_OPEN_DAYS` ของร้านนำร่อง (US20 — 6 ร้านตั้งไว้ 10 วัน แต่ออเดอร์ยืนยันรับของวันที่ 5–9 → ผู้ซื้อบางคนเหลือเวลาวันเดียว) - [ ] PD — พิสูจน์ว่าโดเมน `etax.me` ผ่านแชท Lazada จริง (#227) - [ ] PD — พิสูจน์ว่าอีเมลเข้า inbox ไม่ใช่ spam (#227) - [ ] PD — #223: ปรับ queue `auto-etax` เป็น 2/2 (ไม่ใช่ 5/5 ตามตั๋ว) + อัปเดต AC ของตั๋วให้ตรง
:::

:::note
อธิบายส่วนไหน**ลึกเกินไป / ตื้นเกินไป**? การจัดกล่อง (⬛/🔲/⬜) ผิดตรงไหน? บอกในแชทได้เลย แล้วผมเขียนหน้านั้นใหม่ตามระดับที่ขอ — หรือฝากไว้ที่บอร์ด [artemis.dobybot.com/projects/DW](https://artemis.dobybot.com/projects/DW)

:::
