# Data Dictionary: {{TICKET_KEY}} {{FEATURE_NAME}}

สถานะเอกสาร: **รอ Developer review ก่อนนำ ERD ไปรวมกับ ERD หลัก**  
Feature: [{{TICKET_KEY}}]({{TICKET_URL}})  
เมนู Express: **{{EXPRESS_MENU_PATH}}**

## ขอบเขตและหลักฐาน

{{FEATURE_SCOPE_AND_PURPOSE}}

เอกสารนี้อ้างอิงหลักฐานตามลำดับดังนี้:

1. {{DATABASE_DIFF_EVIDENCE}}
2. {{SCENARIO_EVIDENCE}}
3. {{DBF_OR_ORIGINAL_SCHEMA_EVIDENCE}}
4. {{RELATIONSHIP_EVIDENCE}}
5. {{CURRENT_APPLICATION_SCHEMA_EVIDENCE}}

{{DATABASE_DIFF_FINDINGS}}

## คำอธิบายระดับ Table

| Table | ชื่อเต็ม (English) | ชื่อเต็ม (ไทย) | หน้าที่ | ขอบเขตข้อมูล |
| --- | --- | --- | --- | --- |
| `{{TABLE_NAME}}` | {{TABLE_ENGLISH_NAME}} | {{TABLE_THAI_NAME}} | {{TABLE_PURPOSE}} | {{TABLE_SCOPE}} |

> Convex เพิ่ม `_id` และ `_creationTime` ให้ทุกแถวโดยอัตโนมัติ ตารางด้านล่างจึง
> อธิบายเฉพาะ field ธุรกิจและ `companyId` ที่ประกาศใน schema ของโครงการ

## Table: `{{TABLE_NAME}}`

| Field | ชื่อเต็ม | ความหมาย | ขอบเขตข้อมูล | Data type | Validation |
| --- | --- | --- | --- | --- | --- |
| `{{FIELD_NAME}}` | {{FIELD_FULL_NAME_EN_TH}} | {{FIELD_MEANING}} | {{DATA_SCOPE}} | {{DATA_TYPE}} | {{VALIDATION}} |
