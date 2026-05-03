# Phase 3: Quick Register Page

## Goal

ทำหน้า Quick Register สำหรับ register location ของสินค้าแบบ batch — ใช้สำหรับ initial setup, restocking, เพิ่มสินค้าใหม่, bulk reorganization (Q4) Phase นี้จบแล้วต้อง:
- Picker/admin scan shelf → scan products → ระบบบันทึกอัตโนมัติทันที (per-pair immediate save)
- รองรับ override "ตั้งเป็น primary" เมื่อ scan สินค้าที่มี primary ที่อื่น
- Admin ลบ placement ผิดได้

## Prerequisites

- Phase 1 complete (PlacementScanAPI, PlacementSetPrimaryAPI, PlacementDeleteAPI)
- Phase 2 complete (Shelves สร้างพร้อม)

## Scope

### 3.1 Route + Page Shell

**File**: `dobybot-ui/pages/stock-location/register/index.vue` (ใหม่)

- Route: `/stock-location/register`
- Auth guard: ตรวจ `picking.add_productplacement` permission
- Auth guard: ตรวจ `is_stock_location_v2(company)`

### 3.2 Frontend Models

**File**: `dobybot-ui/models/placement.ts` (ใหม่)

```typescript
export interface Placement {
  id: number
  product_sku: string
  product_name: string
  product_image?: string
  shelf_code: string
  shelf_id: number
  is_primary: boolean
  is_depleted: boolean
  depleted_at: string | null
  created_at: string
}

export interface PlacementWithSession extends Placement {
  isFromCurrentSession?: boolean
}
```

### 3.3 API Client

**File**: `dobybot-ui/services/placement.ts` (ใหม่)

- `scanPlacement(payload: {shelf_code, sku, set_primary?: boolean})` → returns Placement
- `setPrimary(id)` → returns updated Placement
- `deletePlacement(id)` → 204
- `listPlacementsByShelf(shelfCode)` → returns Placement[] (used to load existing products on shelf when entering context)
- `depletePlacement(id)` → returns updated Placement (used by Single Pick — but client lives here for reuse)

### 3.4 State Machine (composable)

**File**: `dobybot-ui/composables/useQuickRegister.ts` (ใหม่)

```typescript
export type RegisterState =
  | { kind: 'idle' }
  | { kind: 'in_shelf', shelf_code: string, placements: PlacementWithSession[] }

// Actions:
// - onScan(value): if value matches shelf prefix → switch to in_shelf state + load existing placements
//                  else → if state.kind === 'in_shelf' call scanPlacement; else warn
// - onSetPrimary(placement_id): call API + update local state
// - onDelete(placement_id): call API + remove from local state
```

### 3.5 Page Layout

- **Header (sticky top)**:
  - Page title + help icon (`mdi-help-circle-outline`)
  - Current shelf chip (large): `📍 SH-R1-01` + small "เปลี่ยนชั้น (scan ใหม่)" hint; ถ้า idle → "สแกน shelf เพื่อเริ่มต้น"
- **Body** (scroll area):
  - Empty state (idle): icon + text "scan shelf barcode เพื่อเริ่มต้น"
  - In-shelf state: list ของ placements ที่ shelf นั้น
    - Sorted: session-new ก่อน (highlight green), แล้ว pre-existing
    - Per-row:
      - Avatar (product image)
      - SKU + name
      - Chip "primary" (สีเขียว) หรือ "secondary" (สีเทา)
      - ถ้าเพิ่งเพิ่มใน session: chip เล็ก "เพิ่งเพิ่ม"
      - Per-row actions:
        - `mdi-star-outline` → "ตั้งเป็น primary" (แสดงเฉพาะถ้า is_primary=false); tap → confirm dialog → call setPrimary
        - `mdi-delete` → ลบ (เฉพาะ user ที่มี delete perm); tap → confirm dialog → call deletePlacement
- **Bottom (sticky bar)**:
  - Scan input (autofocus, single field)
  - placeholder text เปลี่ยนตาม state: "สแกน shelf" หรือ "สแกนสินค้าใน {shelf_code}"
- **Snackbar feedback**: success ทุก scan + sound (เหมือน Single Pick), error สำหรับ invalid scan

### 3.6 Scan Input Behavior

- Autofocus เสมอ (เหมือน Single Pick scan input)
- Submit on Enter
- Trim + uppercase (consistent กับ Single Pick `onScan`)
- Routing:
  - ถ้า value ขึ้นต้นด้วย shelf prefix (จาก settings_json) → ตรวจว่ามี shelf code ตรงในระบบ:
    - มี → load placements ของ shelf, switch state to in_shelf
    - ไม่มี → snackbar error "ไม่พบ shelf '{value}'"
  - ถ้า value ไม่ใช่ shelf prefix:
    - state.idle → snackbar warning "scan shelf ก่อน"
    - state.in_shelf → call `scanPlacement({shelf_code: state.shelf_code, sku: value})` → append to placements list (highlight session-new)
      - ถ้า API คืน 404 (sku not found) → snackbar error "ไม่พบ SKU '{value}'"
      - ถ้า API success + response indicates มี primary ที่อื่น → row แสดง chip เล็ก "primary อยู่ที่ SH-XX" + offer star toggle

### 3.7 Help Dialog

**File**: `dobybot-ui/components/stock-location/HelpDialog.vue` (ใหม่ — reuse ใน Single Pick ด้วย)

- เนื้อหาสำหรับ Quick Register:
  1. สแกน barcode ของชั้น (ขึ้นต้นด้วย {prefix}) เพื่อเริ่มต้น
  2. สแกนสินค้าทุกชิ้นที่อยู่บนชั้นนั้น — ระบบบันทึกอัตโนมัติทันที
  3. ถ้าสินค้ามีชั้นหลักอยู่แล้ว ชั้นนี้จะถูกบันทึกเป็นชั้นรอง — กดปุ่มดาวเพื่อเปลี่ยนชั้นนี้เป็นชั้นหลัก
  4. สแกน shelf อื่นเพื่อเปลี่ยนชั้นที่กำลังจัดการ

### 3.8 Sidebar Menu

- เพิ่มกลุ่ม "Stock Location" → "Quick Register" link ใน sidebar
- แสดงเฉพาะ v2 companies + user มี permission

### 3.9 Translations

**File**: `dobybot-ui/lang/{en,th}.json`
- Namespace `stock-location.register.*` + `stock-location.help.*`

### 3.10 Tests

**File**: `dobybot-ui/tests/pages/stock-location/register.spec.ts`

- Idle state UI
- Scan shelf → switch to in_shelf state, load existing placements
- Scan product (in_shelf) → API call + append to list
- Scan product (idle) → warning, no API call
- Scan unknown shelf → error snackbar
- Scan unknown product → error snackbar
- Star toggle: confirm + API call + state update
- Delete: confirm + API call + remove from list
- Permission gating: hide delete button without perm
- Sound + sound correct event

**E2E** (optional):
- Full session: scan shelf → scan 3 products → switch shelf → scan 2 more

## Files Touched

**New:**
- `dobybot-ui/pages/stock-location/register/index.vue`
- `dobybot-ui/models/placement.ts`
- `dobybot-ui/services/placement.ts`
- `dobybot-ui/composables/useQuickRegister.ts`
- `dobybot-ui/components/stock-location/HelpDialog.vue`
- `dobybot-ui/components/stock-location/PlacementListItem.vue`
- `dobybot-ui/tests/pages/stock-location/register.spec.ts`

**Modified:**
- `dobybot-ui/lang/en.json`, `dobybot-ui/lang/th.json`
- `dobybot-ui/components/sidebar/...` (add Stock Location group)
- `dobybot-ui/models/index.ts`
- `dobybot-ui/services/index.ts`

## Acceptance Criteria

- [ ] Page accessible only for v2 + users with `add_productplacement`
- [ ] Single scan input handles both shelf and product via prefix routing
- [ ] State machine transitions correctly (idle ↔ in_shelf)
- [ ] Shelf scan loads existing placements
- [ ] Product scan in shelf context creates placement immediately + visual feedback
- [ ] Session-new highlight (green) distinguishes recent scans
- [ ] Primary/secondary chip correct
- [ ] Star override works (with confirm)
- [ ] Delete works (admin only)
- [ ] Help dialog accessible + content readable
- [ ] Sidebar link visible only for eligible users
- [ ] Thai + English translations complete
- [ ] All tests pass

## Out of Phase

- Single Pick v2 enhancements (Phase 4)
- Quick Register history view
- Bulk operations
