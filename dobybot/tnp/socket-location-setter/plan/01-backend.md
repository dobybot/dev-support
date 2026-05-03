# Phase 1: Backend (Schema + API)

## Goal

วาง foundation ของ v2: models, migrations, API endpoints, permissions, และ feature flag plumbing — ยังไม่แตะ frontend ใดๆ Phase นี้จบแล้วต้อง:
- Django admin สามารถสร้าง/แก้ Shelf และ ProductPlacement ได้
- API endpoints ทุกตัวพร้อมใช้งาน + ผ่าน unit/integration tests
- Single Pick lookup API คืน `placements` array สำหรับ v2 companies, คืน `location` string สำหรับ v1 (unchanged)

## Scope

### 1.1 Models + Migrations

**File**: `dobybot/picking/models/models.py` (เพิ่มท้ายไฟล์ หรือแยกเป็น `stock_location.py` ถ้าต้องการ — ตาม convention ของ folder)

- `Shelf`: `id` auto, `company` FK CASCADE, `code` CharField(64), `is_active` bool, `note` text, timestamps
  - Unique: `(company, code)` ชื่อ `unique_shelf_per_company`
  - Index: `(company, code, is_active)`
- `ProductPlacement`: `id` auto, `company` FK CASCADE, `product` FK CASCADE, `shelf` FK PROTECT, `is_primary` bool, `is_depleted` bool, `depleted_at` datetime null, timestamps
  - Unique: `(company, product, shelf)` ชื่อ `unique_placement`
  - Partial unique: `(company, product) WHERE is_primary=true` ชื่อ `unique_primary_per_product`
  - Index: `(company, shelf)`, `(company, product, is_depleted)`

**Migration**: `dobybot/picking/migrations/00XX_stock_location_v2.py`
- สร้าง 2 ตาราง + constraints + indices

**Tests**: `dobybot/picking/tests/test_stock_location_models.py`
- Constraint enforcement: duplicate shelf code per company → error
- Partial unique: 2 primaries per product → error
- Cascade behavior: ลบ Product → placements gone; ลบ Shelf → PROTECT raises
- Soft-delete: set `is_active=false` ไม่กระทบ placement records

### 1.2 Feature flag helper

**File**: `dobybot/companies/utils.py` หรือใกล้เคียง (ตาม convention dobybot)

```python
def is_stock_location_v2(company) -> bool:
    return bool(company.settings_json.get("USE_STOCK_LOCATION_V2", False))

def get_shelf_prefix(company) -> str:
    return company.settings_json.get("STOCK_LOCATION_SHELF_PREFIX", "")
```

### 1.3 Permissions

ใช้ Django default permissions ของ 2 model ใหม่ (auto-generated):
- `picking.view_shelf`, `add_shelf`, `change_shelf`, `delete_shelf`
- `picking.view_productplacement`, `add_productplacement`, `change_productplacement`, `delete_productplacement`

**File**: `dobybot/picking/permissions.py`
- เพิ่ม class `CanManageShelf`, `CanRecordPlacement`, `CanChangePlacement`, `CanDeletePlacement` (เลือก pattern ตาม existing class ในไฟล์)

### 1.4 API endpoints

**File**: `dobybot/picking/views/placement.py` (ใหม่)

- `PlacementScanAPI` (POST `/api/picking/placements/scan/`)
  - Body: `{shelf_code, sku, set_primary?: bool}`
  - Logic: lookup shelf by `(company, code, is_active=true)`; lookup product by `(company, sku)`; upsert placement (`get_or_create`); ถ้า `set_primary=true` → atomic transaction flip primary เก่า + set ใหม่; ถ้า primary ของ product ยังไม่มี → set placement เป็น primary โดยอัตโนมัติ (first-scan-wins)
  - Return: placement object (id, shelf_code, is_primary, is_depleted, was_created)
  - Errors: 404 ถ้า shelf หรือ product ไม่เจอ
  - Permission: `CanRecordPlacement`

- `PlacementDepleteAPI` (POST `/api/picking/placements/{id}/deplete/`)
  - Set `is_depleted=true, depleted_at=now()`; idempotent
  - Permission: `CanChangePlacement`

- `PlacementSetPrimaryAPI` (POST `/api/picking/placements/{id}/set-primary/`)
  - Atomic transaction: flip primary เก่าของ product เป็น false → set placement นี้ `is_primary=true`
  - Permission: `CanChangePlacement`

- `PlacementDeleteAPI` (DELETE `/api/picking/placements/{id}/`)
  - Hard delete; ถ้าเป็น primary ตัวเดียว → no auto-promotion (admin จัดการเอง)
  - Permission: `CanDeletePlacement`

**File**: `dobybot/picking/views/shelf.py` (ใหม่)

- `ShelfViewSet` (CRUD ที่ `/api/picking/resource/shelves/`)
  - List/Retrieve/Create/Update/Partial-update
  - Soft-delete: override `destroy()` → set `is_active=false` แทน hard delete
  - Filter: `is_active`, search by `code`
  - Permission: `CanManageShelf`

**Auto-clear depleted on re-register**:
- ใน `PlacementScanAPI`: ถ้า placement มีอยู่แล้วและ `is_depleted=true` → set เป็น false + clear `depleted_at`

**File**: `dobybot/picking/urls.py`
- Register routes ทั้งหมดข้างบน

**Tests**: `dobybot/picking/tests/test_placement_api.py`, `test_shelf_api.py`
- Happy paths ของแต่ละ endpoint
- Permission denied paths
- Idempotent re-scan
- Atomic primary swap (race condition test ผ่าน transaction)
- Auto-clear depleted on re-register
- Multi-tenant isolation (company A ไม่เห็น shelf ของ company B)

### 1.5 Single Pick lookup extension

**File**: `dobybot/picking/views/pick_order.py:1117-1163` (`build_items` method)

- ตรวจ `is_stock_location_v2(company)`:
  - **v1 path**: คืน `location: string` เหมือนเดิม + ใช้ existing sort logic ([line 1156-1162](dobybot/picking/views/pick_order.py#L1156-L1162))
  - **v2 path**: query `ProductPlacement` ของ items ใน batch (joined select on shelf), build `placements: [{id, shelf_code, is_primary, is_depleted}]` per item; sort items โดย:
    1. Items ที่มี non-depleted primary มาก่อน
    2. ตาม `shelf.code` ของ primary alphabetical
    3. Items ไม่มี placement (lost) มาท้ายสุด

- ผลกระทบ contract: response shape ของ `single-pick/lookup/`
  - v1: `{items: [{sku, name, number, barcode, image, location: string}]}`
  - v2: `{items: [{sku, name, number, barcode, image, placements: [...]}]}`

**Tests**: extend `test_pick_order_single_pick.py`
- v1 company → response มี `location`
- v2 company → response มี `placements` array
- Sorting correctness

### 1.6 Django admin

**File**: `dobybot/picking/admin.py`
- Register `Shelf` และ `ProductPlacement` ด้วย ModelAdmin พื้นฐาน (list_display, list_filter, search_fields)
- ProductPlacement inline ใน Shelf detail (optional, สำหรับ debugging)

## Files Touched

**New:**
- `dobybot/picking/models/stock_location.py` (หรือ append ใน models.py)
- `dobybot/picking/migrations/00XX_stock_location_v2.py`
- `dobybot/picking/views/placement.py`
- `dobybot/picking/views/shelf.py`
- `dobybot/picking/serializers/placement.py`
- `dobybot/picking/serializers/shelf.py`
- `dobybot/picking/tests/test_stock_location_models.py`
- `dobybot/picking/tests/test_placement_api.py`
- `dobybot/picking/tests/test_shelf_api.py`
- `dobybot/companies/utils.py` (or append to existing helper)

**Modified:**
- `dobybot/picking/permissions.py` — add 4 permission classes
- `dobybot/picking/urls.py` — register new endpoints
- `dobybot/picking/admin.py` — register new models
- `dobybot/picking/views/pick_order.py` — extend `build_items` for v2 branch
- `dobybot/picking/tests/test_pick_order_single_pick.py` — v1/v2 coverage

## Acceptance Criteria

- [ ] Migration applies cleanly forward + backward
- [ ] All new model constraints enforced (test coverage)
- [ ] All new API endpoints return correct shapes + status codes
- [ ] Permission denied returns 403
- [ ] Multi-tenant isolation tested
- [ ] Single Pick lookup returns v1 shape for v1 company, v2 shape for v2 company
- [ ] Atomic primary swap survives concurrent requests (transaction test)
- [ ] Auto-clear depleted flag works on re-register
- [ ] Django admin can CRUD both models
- [ ] No regression in existing Single Pick tests (v1 path unchanged)

## Out of Phase

- Frontend ใดๆ
- ทุก UI page
- ทุก helper component ใน dobybot-ui
