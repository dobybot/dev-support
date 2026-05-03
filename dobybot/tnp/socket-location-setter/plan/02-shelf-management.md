# Phase 2: Shelf Management Page

## Goal

ทำหน้า user-facing สำหรับ admin จัดการ Shelf records ซึ่งเป็น prerequisite ของทุก placement workflow (pre-create only — Q3) Phase นี้จบแล้วต้อง:
- Admin สามารถ CRUD shelf จาก dobybot-ui ได้ (ไม่ต้องเข้า Django admin)
- Soft-delete ผ่าน is_active toggle
- Search/filter shelf

## Prerequisites

- Phase 1 complete (Shelf model + ShelfViewSet + permissions)

## Scope

### 2.1 Route + Page Shell

**File**: `dobybot-ui/pages/settings/shelves/index.vue` (ใหม่)

- Route: `/settings/shelves`
- Auth guard: ตรวจ `picking.view_shelf` permission
- Auth guard: ตรวจ `is_stock_location_v2(company)` — ถ้า false → redirect /settings หรือแสดง "feature not enabled"

### 2.2 Frontend Model

**File**: `dobybot-ui/models/shelf.ts` (ใหม่)

```typescript
export interface Shelf {
  id: number
  code: string
  is_active: boolean
  note: string
  product_count?: number  // optional, populated by list endpoint
  created_at: string
  updated_at: string
}
```

### 2.3 API Client

**File**: `dobybot-ui/services/shelf.ts` (ใหม่)

- `listShelves(params: {search?, is_active?, page?})`
- `getShelf(id)`
- `createShelf(data: {code, note?})`
- `updateShelf(id, data: {note?, is_active?})`
- `deleteShelf(id)` — calls DELETE which backend handles as soft-delete

### 2.4 Page Layout

- **Header**: Page title + "Add Shelf" button
- **Toolbar**: Search input (by code), filter chip "Show inactive"
- **Table** (`v-data-table` ตาม pattern dobybot-ui):
  - Columns: Code, Note, Status (chip active/inactive), Products linked (count), Created at, Actions
  - Actions: `mdi-pencil` (edit), `mdi-delete` (soft-delete with confirm dialog)
- **Add/Edit dialog**:
  - Add: `code` input + `note` textarea + Save button
  - Edit: `note` textarea + `is_active` toggle + Save button (code disabled - immutable per Q17)
  - Validation: code required, no whitespace, no leading/trailing spaces
- **Soft-delete confirm dialog**: "ปิดการใช้งาน shelf {code}? Placement records ที่อ้างอยู่ยังคงอยู่ใน DB"

### 2.5 Sidebar Menu

**File**: `dobybot-ui/components/sidebar/...` (path ตาม structure จริง)

- เพิ่ม link "Shelf Management" ใต้ Settings menu
- แสดงเฉพาะถ้า:
  - `is_stock_location_v2(company)` == true
  - User มี `picking.view_shelf` permission

### 2.6 Translations

**File**: `dobybot-ui/lang/{en,th}.json`

- Add namespace `shelves.*` keys: page title, table columns, button labels, dialog texts, validation messages

### 2.7 Tests

**File**: `dobybot-ui/tests/pages/settings/shelves/index.spec.ts` (หรือ pattern ที่ dobybot-ui ใช้)

- Render table from API mock
- Search filter
- Add shelf flow
- Edit shelf flow
- Soft-delete confirm flow
- Permission denied → no edit/delete buttons

**E2E** (optional, defer ถ้ายังไม่มี e2e infrastructure):
- Full add → edit → soft-delete → re-activate cycle

## Files Touched

**New:**
- `dobybot-ui/pages/settings/shelves/index.vue`
- `dobybot-ui/models/shelf.ts`
- `dobybot-ui/services/shelf.ts`
- `dobybot-ui/components/shelves/ShelfFormDialog.vue`
- `dobybot-ui/tests/...spec.ts`

**Modified:**
- `dobybot-ui/lang/en.json`, `dobybot-ui/lang/th.json`
- `dobybot-ui/components/sidebar/...` (sidebar menu config)
- `dobybot-ui/models/index.ts` (re-export Shelf)
- `dobybot-ui/services/index.ts` (re-export shelfService)

## Acceptance Criteria

- [ ] Page accessible only for v2 companies + users with permission
- [ ] List shelves with search/filter
- [ ] Create new shelf (code + optional note)
- [ ] Edit shelf (note + is_active only — code immutable)
- [ ] Soft-delete with confirm dialog
- [ ] Sidebar link visible only for eligible users
- [ ] Thai + English translations complete
- [ ] No console errors / type errors
- [ ] Tests pass

## Out of Phase

- Quick Register page (Phase 3)
- Single Pick v2 enhancements (Phase 4)
- Bulk import / export
