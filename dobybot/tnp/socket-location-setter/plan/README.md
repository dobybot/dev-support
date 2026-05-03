# Implementation Plan — Stock Location v2

ดู [PRD.md](../PRD.md) สำหรับ context และ design decisions

## Phasing strategy

แบ่งเป็น 4 phases ตาม dependency layer — Phase 1 (backend) ต้องเสร็จก่อน frontend phases ทั้งหมด; Phase 2 (Shelf Management) ต้องเสร็จก่อน Phase 3/4 เพราะเป็น prerequisite ของ shelf creation; Phase 3 และ 4 ทำ parallel ได้ แต่แนะนำ Phase 3 ก่อนเพราะ Phase 4 reuse component (HelpDialog, placement service) จาก Phase 3

```
Phase 1 (Backend)
   ↓
Phase 2 (Shelf Management)
   ↓
Phase 3 (Quick Register) ──┐
                            ├── Phase 4 reuses Phase 3 components
Phase 4 (Single Pick v2) ───┘
```

## Files

- [01-backend.md](01-backend.md) — Models, migrations, API endpoints, permissions, Single Pick lookup extension
- [02-shelf-management.md](02-shelf-management.md) — Admin CRUD page at `/settings/shelves`
- [03-quick-register.md](03-quick-register.md) — Daily op page at `/stock-location/register`
- [04-single-pick-v2.md](04-single-pick-v2.md) — In-flow scan + "ของหมด" workflow in existing Single Pick

## Rollout sequence

1. Merge & deploy Phase 1 (backend-only — no behavior change for any user since flag default false)
2. Merge & deploy Phase 2 (page hidden for v1 companies)
3. Merge & deploy Phase 3 (page hidden for v1 companies)
4. Merge & deploy Phase 4 (no change for v1 companies; pilot enable for 1 v2 company)
5. Pilot validation (1-2 weeks observation)
6. Gradual rollout: enable `USE_STOCK_LOCATION_V2` per company on request

## Definition of done

- ทุก phase ผ่าน acceptance criteria ของ phase ตัวเอง
- ไม่มี regression ใน v1 path (existing Single Pick + Product.location workflow ใช้งานได้เหมือนเดิม)
- Pilot company ใช้ v2 ครบ end-to-end: create shelves → register placements (Quick Register) → pick orders (Single Pick v2 with chip + "ของหมด")
