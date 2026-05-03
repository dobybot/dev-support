# Phase 4: Single Pick v2 Enhancements

## Goal

เพิ่ม v2 features ให้ Single Pick: multi-location display, in-flow shelf scan (2-step), "ของหมด" workflow, lost mode, help dialog Phase นี้จบแล้วต้อง:
- v2 companies เห็น Single Pick ที่มี shelf chip + secondary badge + "ของหมด" button
- Picker บันทึก location ที่หน้างานได้ขณะ pick (2-step flow)
- Picker กด "ของหมด" → ระบบแนะนำชั้นถัดไปทันที
- v1 companies ไม่เห็นการเปลี่ยนแปลงใดๆ

## Prerequisites

- Phase 1 complete (lookup API extended + placement endpoints)
- Phase 3 complete (placement service + HelpDialog component)

## Scope

### 4.1 Update Frontend Type

**File**: `dobybot-ui/components/single-pick/PickView.vue:222-229`

```typescript
interface SinglePickPlacement {
  id: number
  shelf_code: string
  is_primary: boolean
  is_depleted: boolean
}

interface SinglePickItem {
  sku: string
  name: string
  number: number
  barcode: string
  image: string
  // v1 only:
  location?: string | null
  // v2 only:
  placements?: SinglePickPlacement[]
}
```

### 4.2 Conditional Branching Strategy

ใช้ feature detection: ถ้า `item.placements !== undefined` → v2 mode สำหรับ row นั้น; else v1 mode (existing behavior)

อีก option: parent (`pages/single-pick/index.vue`) ส่ง `version: 'v1' | 'v2'` prop ลงมา + ใช้ branch ใน component หรือมี 2 components แยก (`PickView.vue` v1, `PickViewV2.vue`)

**คำแนะนำ**: ใช้ feature detection ที่ component-level — branch logic ใน computed/methods ของ `PickView.vue` ที่มีอยู่ + extract helper composable สำหรับ placement state เพื่อไม่ทำให้ component หนาเกิน

### 4.3 Composable: usePickPlacements

**File**: `dobybot-ui/composables/usePickPlacements.ts` (ใหม่)

```typescript
// Manages per-item placement state for v2 Single Pick
// - Tracks current "shown shelf" per item (skips depleted, alphabetical)
// - Manages 2-step shelf-then-product context
// - Provides actions: deplete, switchToNext, scanShelf, scanProductInContext, setPrimaryOverride

export function usePickPlacements(items: Ref<SinglePickItem[]>) {
  const shelfContext = ref<{
    shelf_code: string
    shelf_id: number
    set_primary_toggle: boolean
  } | null>(null)

  const itemPlacements = ref<Record<string, SinglePickPlacement[]>>({})  // local copy + mutations

  // ... actions
}
```

### 4.4 PickView.vue Changes

**File**: `dobybot-ui/components/single-pick/PickView.vue`

**Display changes** ([line 76-86](dobybot-ui/components/single-pick/PickView.vue#L76-L86)):
- v2: แทน `item.location` ด้วย "current shown shelf" จาก composable (= first non-depleted placement, primary แรก)
- ถ้ามี secondary > 0 → badge `+N` ข้าง chip (tap → expand panel แสดงทุก shelf + state)
- Lost mode: ถ้าไม่มี non-depleted placement หรือ placements เป็น empty → chip "🔍 หาที่อื่น" สีเหลือง/ส้ม

**New per-row action** ([line 92-116](dobybot-ui/components/single-pick/PickView.vue#L92-L116)):
- เพิ่ม `mdi-package-variant-closed-remove` icon button (v2 only) — show เฉพาะถ้า item มี non-depleted placement และ is current active item (or always visible? — show always for any v2 item with placement)
- Click → modal confirm "ยืนยันชั้น {shelf_code} ของหมด?" → call API → optimistic update local state → chip switches ทันที

**Scan input changes** ([line 325-356](dobybot-ui/components/single-pick/PickView.vue#L325-L356)):
- v2 path ใน `onScan(value)`:
  - ถ้า value match shelf prefix → `enterShelfContext(value)`:
    - validate shelf exists (call API or pre-loaded shelf list)
    - update `shelfContext` ref → chip "📍 next scan: SH-R1-01" ขึ้นใต้ scan input
    - ถ้า active SKU มี primary ที่อื่น → แสดง star toggle ใน chip นั้น
  - ถ้า value match shelf prefix ขณะ shelfContext มีอยู่แล้ว → สลับ shelf context (no commit)
  - ถ้า value ไม่ใช่ shelf prefix:
    - ปกติ → existing logic (find by barcode/SKU + increment)
    - ถ้า shelfContext มีอยู่ → หลัง increment สำเร็จ → call `scanPlacement({shelf_code, sku, set_primary: shelfContext.set_primary_toggle})` → update local placements state → clear shelfContext
- เก็บ existing wrong-scan / over-scan flow

**Help dialog**: เพิ่ม icon button ใน app bar / page title area → reuse `HelpDialog` component จาก Phase 3 (เนื้อหาคนละชุด — สำหรับ Single Pick)

### 4.5 Single Pick Page

**File**: `dobybot-ui/pages/single-pick/index.vue`

- ตรวจ `is_stock_location_v2(company)` (จาก auth/company state)
- ส่ง prop `mode: 'v1' | 'v2'` ลง PickView (หรือ ใช้ feature detection)
- Lookup API call ไม่เปลี่ยน (backend คืนรูปต่างกันเอง — Phase 1)

### 4.6 Help Dialog Content for Single Pick

**File**: reuse `dobybot-ui/components/stock-location/HelpDialog.vue` แต่รับ prop `context: 'single-pick' | 'quick-register'` เพื่อ select content

Single Pick content:
1. สแกนสินค้า: เพิ่มจำนวนใน list
2. สแกน shelf (ขึ้นต้นด้วย {prefix}): เปิด context "ระบุ location"
   - สแกนสินค้าหลังจากนั้น = บันทึก location + นับเป็น pick
   - กดดาวใน context chip ก่อนสแกนสินค้า = ตั้งเป็นชั้นหลัก
3. ปุ่ม "ของหมด" ใน row: ระบบแนะนำชั้นถัดไปอัตโนมัติ
4. ถ้าทุกชั้นถูก mark ว่าหมด: row จะเข้า "หาที่อื่น" mode — เดินหา + scan shelf ที่เจอ

### 4.7 Sound Differentiation

ใช้ sound ต่างกันเพื่อ feedback ว่า scan = shelf-context-set vs product-pick:
- product pick (existing): `cheerup/ding`
- shelf context set (ใหม่): `boop` หรือ `cheerup/whistle` — short distinct sound
- placement created (ใหม่): combination หรือ longer ding

(หา sound จาก existing `~/utils/sound.ts` registry)

### 4.8 Translations

**File**: `dobybot-ui/lang/{en,th}.json`
- Namespace `single-pick.v2.*`: chip labels, modal confirm texts, lost mode text, help dialog content

### 4.9 Tests

**File**: `dobybot-ui/tests/components/single-pick/PickView.spec.ts` (extend existing or new file)

- v1 mode: existing behavior unchanged (regression)
- v2 mode display:
  - Item with primary only → primary chip
  - Item with primary + 2 secondary → primary chip + "+2" badge
  - Item with depleted primary + healthy secondary → "current shown" = secondary
  - Item with all depleted → lost mode chip
- v2 mode scan flow:
  - Scan shelf → context chip appears
  - Scan shelf again → context updates (no API call yet)
  - Scan product in context → API call (scanPlacement) + count incremented + context cleared
  - Scan product without context → existing behavior (count only)
  - Star toggle in context → set_primary=true sent in next scanPlacement
- "ของหมด" button:
  - Click → modal confirm
  - Confirm → API call + chip switches to next non-depleted
  - Cancel → no API call
- Wrong scan: shelf prefix but no shelf in DB → error message specific
- Wrong scan: regular but unknown SKU → existing message

**E2E** (optional):
- Full v2 pick: load order with 3 SKUs → scan shelf + product 3 times → close order

## Files Touched

**New:**
- `dobybot-ui/composables/usePickPlacements.ts`

**Modified:**
- `dobybot-ui/pages/single-pick/index.vue` — pass v2 mode flag (or rely on response shape)
- `dobybot-ui/components/single-pick/PickView.vue` — major: v2 display + scan flow + "ของหมด" + lost mode + help icon
- `dobybot-ui/components/single-pick/InitialScanView.vue` — likely no change (initial barcode scan unchanged)
- `dobybot-ui/components/stock-location/HelpDialog.vue` — accept context prop with 2 content modes (extend from Phase 3)
- `dobybot-ui/lang/en.json`, `dobybot-ui/lang/th.json`
- `dobybot-ui/utils/sound.ts` — register new sounds if needed
- `dobybot-ui/tests/components/single-pick/PickView.spec.ts`

## Acceptance Criteria

- [ ] v1 companies see no changes (regression test)
- [ ] v2 companies see chip + "+N" badge + "ของหมด" button
- [ ] 2-step scan flow works (shelf → context → product = register + count)
- [ ] Star toggle override works
- [ ] Modal confirm prevents accidental "ของหมด"
- [ ] Chip switches to next non-depleted shelf after deplete
- [ ] Lost mode triggers when all depleted or no placements
- [ ] Help dialog accessible + content correct for Single Pick context
- [ ] Sounds differentiate scan types
- [ ] Optimistic update + background persist (UI feels instant)
- [ ] Wrong scan messages specific to shelf vs product
- [ ] No regression in existing Single Pick tests
- [ ] Thai + English translations complete

## Rollout Notes

หลัง Phase 4 deploy:
1. Verify ทุก v1 companies (ส่วนใหญ่) ใช้งานเหมือนเดิม no surprises
2. Pick 1 pilot company สำหรับ enable v2 (set `USE_STOCK_LOCATION_V2=true` + `STOCK_LOCATION_SHELF_PREFIX="SH-"` ใน Django admin)
3. ทำ shelf seed (ใน Phase 2 page) สำหรับ pilot company
4. Train pickers + observe ก่อน rollout ลูกค้าอื่น

## Out of Phase

- Picker route optimization (geographic-aware)
- Quantity per location
- CSV bulk import
- Audit log
- User-facing settings page for v2 toggle
- Migration tooling v1 → v2
