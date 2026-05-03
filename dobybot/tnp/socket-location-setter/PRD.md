# PRD: Stock Location v2 (Shelf-Based Location Tracking)

## Background

ปัจจุบัน dobybot มี Single Pick feature ที่ใช้ฟิลด์ `Product.location` (string เปล่าๆ) สำหรับสั่ง picker ไปหยิบของ — แต่ในการใช้งานจริงผู้ใช้พบว่ายังหาของไม่เจอ เพราะ string นี้ไม่ได้ผูกกับ identifier ของ shelf จริงในคลัง และไม่มี workflow ที่บังคับให้ข้อมูลตรงกับสภาพคลังจริง

โจทย์: เพิ่มระบบ "Stock Location v2" ที่
1. ผูก barcode physical กับ shelf ในระบบ (1 ชั้น = 1 barcode)
2. รองรับสินค้า 1 ตัวอยู่ได้หลายชั้น (1 primary + n secondaries) เพราะของล้นชั้นเป็นเรื่องที่หลีกเลี่ยงไม่ได้
3. มี workflow บันทึก location ที่หน้างานจริง (ground truth) ทั้งใน Single Pick (in-flow) และในหน้าเฉพาะสำหรับ initial setup / restock / reorganization
4. รองรับ "ของหมดที่ชั้นนี้" → แนะนำชั้นถัดไปอัตโนมัติ
5. Opt-in per company; v1 (Product.location string) คงไว้ 100% backward compatible

## Goals

- ลดเวลา picker เดินหาของในคลัง
- ป้องกัน data garbage จากการสแกน barcode ผิดประเภท (prefix routing)
- บันทึก location ที่หน้างาน = ข้อมูลตรงกับสภาพจริง
- ระบบรองรับ overflow stock (ของล้นไปชั้นอื่น)

## Non-goals

- Quantity tracking per location (binary depleted flag เท่านั้น; quantity granularity = future)
- Geographic/zone metadata (shelf id format ตาม layout จริงพอ; เพิ่ม column ทีหลังถ้าต้องการ)
- Auto-migration จาก v1 string เป็น v2 placement (เริ่มใหม่จาก 0 เมื่อ enable)
- Bulk CSV import (defer ภายหลัง)
- Audit log (Django auto admin log พอ; ใช้ generic audit ทีหลัง)

## Architecture

### Feature flag

- `Company.settings_json["USE_STOCK_LOCATION_V2"]` (bool, default ไม่มี = false)
- `Company.settings_json["STOCK_LOCATION_SHELF_PREFIX"]` (string, e.g. `"SH-"`)
- ตั้งค่าผ่าน Django admin เท่านั้น (ทั้ง enable + prefix)
- v1 path = code ปัจจุบัน 100% unchanged
- v2 path = code branch ใหม่ทั้งหมด, conditional ที่ entry points

### Schema

#### Shelf
```python
class Shelf(models.Model):
    company = models.ForeignKey("companies.Company", on_delete=models.CASCADE)
    code = models.CharField(max_length=64)  # ค่า barcode เช่น "SH-R1-01"
    is_active = models.BooleanField(default=True)
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="unique_shelf_per_company"),
        ]
        indexes = [
            models.Index(fields=["company", "code", "is_active"]),
        ]
```

- `code` immutable หลัง create (rename = ลบ + สร้างใหม่ + re-register placement)
- Soft-delete ผ่าน `is_active=false`; FK PROTECT บน `ProductPlacement.shelf` กันลบ Shelf จริงโดยไม่ตั้งใจ

#### ProductPlacement
```python
class ProductPlacement(models.Model):
    company = models.ForeignKey("companies.Company", on_delete=models.CASCADE)
    product = models.ForeignKey("picking.Product", on_delete=models.CASCADE)
    shelf = models.ForeignKey(Shelf, on_delete=models.PROTECT)
    is_primary = models.BooleanField(default=False)
    is_depleted = models.BooleanField(default=False)
    depleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "product", "shelf"],
                name="unique_placement",
            ),
            models.UniqueConstraint(
                fields=["company", "product"],
                condition=Q(is_primary=True),
                name="unique_primary_per_product",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "shelf"]),
            models.Index(fields=["company", "product", "is_depleted"]),
        ]
```

### Data Rules

- **Cardinality**: 1 product สามารถมี placement หลาย shelf; แต่ละ company-scoped
- **Primary designation**: First-scan-wins (ครั้งแรกที่ scan สินค้านั้น = primary); subsequent scan ที่ shelf ใหม่ = secondary
- **Override**: User toggle "ตั้งเป็น primary แทน" ก่อน commit → atomic transaction flip primary เก่าเป็น false ก่อน set ใหม่
- **Re-scan ที่ shelf เดิม**: idempotent (no-op + visual feedback ว่ามีแล้ว)
- **Depleted flag**: soft (relationship preserved); auto-clear เมื่อมี register ใหม่ที่ shelf เดียวกัน
- **Recommendation order**: alphabetical by `shelf.code`, skip depleted; primary มาก่อน secondary ใน same alpha bucket
- **All depleted fallback**: row entrer "lost mode" — picker ต้องหาของและ scan shelf ใหม่
- **Inactive shelf**: filter ออกจาก Single Pick; placement ยังอยู่ใน DB

## API

### Extend existing
- `POST /api/picking/pick-orders/single-pick/lookup/` — v2 path เพิ่มฟิลด์ `placements: [{id, shelf_code, is_primary, is_depleted}]` per item; v1 path ส่ง `location: string` เหมือนเดิม (frontend ตรวจ key เพื่อ branch)

### New endpoints
- `POST /api/picking/placements/scan/` — body: `{shelf_code, sku, set_primary?: bool}` → upsert placement; return placement object; idempotent ที่ shelf เดิม
- `POST /api/picking/placements/{id}/deplete/` → set `is_depleted=true, depleted_at=now()`
- `POST /api/picking/placements/{id}/set-primary/` → atomic transaction (flip เก่า + set ใหม่)
- `DELETE /api/picking/placements/{id}/` — admin only (`picking.delete_productplacement`)
- ViewSet สำหรับ `Shelf` CRUD ที่ `/api/picking/resource/shelves/`

## UI

### Single Pick page (`/single-pick`, v2 conditional)

- **Display**: ใช้ chip primary + badge `+N` สำหรับ secondaries (tap expand เห็นรายละเอียดทุก shelf + depleted state)
- **Scan input**: เดียวที่ bottom bar (เหมือนเดิม) + prefix routing
- **2-step shelf-then-product flow**:
  - Scan shelf → context chip "📍 next scan: SH-R1-01" ขึ้น + (ถ้า active SKU มี primary ที่อื่น) star toggle "ตั้งเป็น primary"
  - Scan product → register placement (ตาม toggle) + count pick + clear context
  - Scan shelf อีกครั้งก่อน scan product = สลับ context, ไม่ create relationship
- **"ของหมด" button**: per-row icon button ข้าง chip location → modal confirm "ยืนยันชั้น SH-R1-01 ของหมด?" → soft flag + chip switch ทันทีไป next non-depleted shelf
- **Lost mode**: ถ้า primary + secondaries ทุกชั้นหมด หรือไม่มี placement → chip "🔍 หาที่อื่น" + scan-shelf affordance reactivated
- **Help dialog**: icon `mdi-help-circle-outline` ใน app bar (v2 only) → อธิบาย flow
- **Data loading**: pre-fetch placements ทั้งหมดตอน load order; "ของหมด" ใช้ optimistic update + background API persist
- **Wrong scan**: reuse `wrong_scan_dialog` pattern + เพิ่ม message "ไม่พบ shelf '{X}'" สำหรับ shelf prefix แต่ไม่มีใน DB

### Quick Register page (`/stock-location/register`, v2 only)

- **State machine**: `[Idle]` → scan shelf → `[InShelf]` → scan product → ยังอยู่ `[InShelf]`; scan shelf อื่น = สลับ context
- **Header**: chip ใหญ่ shelf code ปัจจุบัน + help icon
- **Body**: list สินค้าที่อยู่ใน shelf นั้น (ทั้งที่ register ใน session ปัจจุบัน + ที่มีอยู่แล้วก่อนหน้า)
  - Per-row: SKU + name + image, chip "primary" หรือ "secondary", badge "เพิ่งเพิ่มใน session" (highlight green) สำหรับ row ใหม่
  - Per-row actions: `mdi-star-outline` (override → ตั้งเป็น primary; เฉพาะถ้าตอนนี้ secondary) + `mdi-delete` (เฉพาะ admin)
- **Bottom**: scan input (autofocus)
- **Help dialog**: icon ใน app bar

### Shelf Management page (`/settings/shelves`, v2 only)

- Search/filter by `code`, `is_active`
- Table: code, note, is_active toggle, count of products linked, created_at
- Actions: Add (form: code input + note), Edit (note + is_active), Soft-delete (set is_active=false)

### Sidebar / Navigation

- เฉพาะ v2 companies:
  - เพิ่ม "Stock Location" group → Quick Register link
  - เพิ่ม "Shelf Management" ใต้ Settings menu
- v1 companies: ทั้งคู่ hidden

## Permissions

| Action | Permission | Roles |
|---|---|---|
| ดู Single Pick (existing) | `picking.view_pickorder` | picker, admin |
| ใช้ Quick Register page | `picking.add_productplacement` | picker, admin |
| Scan shelf in-flow ใน Single Pick | `picking.add_productplacement` | picker, admin |
| กด "ของหมด" | `picking.change_productplacement` | picker, admin |
| Override "ตั้งเป็น primary" | `picking.change_productplacement` | picker, admin |
| Delete placement | `picking.delete_productplacement` | admin only |
| Shelf CRUD | `picking.{view,add,change,delete}_shelf` | admin only |
| เปลี่ยน v2 toggle / prefix | superadmin via Django admin | superadmin |

## Edge Cases

- **Scan barcode invalid (ไม่ตรง prefix และไม่เจอใน product)**: reuse `wrong_scan_dialog` + specific message
- **Scan shelf ที่ไม่มีใน DB (มี prefix แต่ไม่เจอ)**: error "ไม่พบ shelf '{X}' — โปรดสร้างใน Settings ก่อน"
- **Scan product ที่ไม่มีใน DB**: error "ไม่พบ SKU '{X}'"
- **Scan shelf ตอน Quick Register state Idle**: warning "scan shelf ก่อน"
- **Active SKU มี primary อยู่แล้ว + scan shelf อื่น**: register เป็น secondary (default) + offer star toggle override
- **All locations depleted**: lost mode + scan-shelf affordance
- **Shelf soft-deleted (is_active=false)**: filter ออกจาก Single Pick recommendation; placement ยังอ่านได้
- **Race condition (2 picker pick same SKU)**: optimistic update; partial unique index บังคับ atomic primary swap

## Backward Compatibility

- v1 ไม่ถูกแตะ: code path ที่อ่าน `Product.location` ยังทำงานเหมือนเดิม
- v2 enabled = ใหม่ทั้งหมด ไม่ migrate string เก่า; เริ่ม register จาก 0 ผ่าน Quick Register
- v2 disabled กลับ = กลับใช้ string เดิม (ที่ค้างอยู่); placement records ยังอยู่ใน DB เผื่อ enable ใหม่

## Out of Scope (Future)

- Quantity per location (now: binary depleted flag)
- Zone/aisle/level metadata fields
- Bulk CSV import for Shelf
- Generic audit log
- User-facing settings UI for v2 toggle / prefix
- Auto-migration v1 string → v2 placement
- Geographic-aware path optimization for picker route
