import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchCoverageBase } from '@/lib/api'
import {
  allListSpanHashes,
  computeCoverage,
  pruneReadState,
  readStoredReadState,
  runProgress,
  sameUncovered,
  sectionReadStatus,
  setSpansRead,
  toggleSectionRead,
  toggleSpanRead,
  writeStoredReadState,
  type CoverageInfo,
  type RunProgress,
  type SectionReadStatus,
  type StoredReadState,
  type UncoveredHunk,
} from '@/lib/read-state'
import { useAsync } from '@/lib/use-async'
import type { RunData } from '@/shared/types'

/**
 * read state ของ run — host ที่ RunLayout ตัวเดียว แชร์ผ่าน context (แบบเดียวกับ reading panel)
 * span card, nav, header, coverage view อ่านจาก source of truth เดียวกัน
 *
 * localStorage เก็บ raw intent เท่านั้น ({v, spans, sections}) — ทุกอย่างที่เหลือ derive สด
 */
export interface ReadStateValue {
  isSpanRead(hash: string): boolean
  toggleSpan(hash: string): void
  markSpans(hashes: readonly string[], read: boolean): void
  isSectionRead(sectionId: string): boolean
  toggleSection(sectionId: string): void
  /** unread / prose / done ต่อ section — ใช้วาด icon ใน nav */
  statusOf(sectionId: string): SectionReadStatus
  progress: RunProgress
  /** null = coverage base ยังไม่มา หรือเทียบไม่ได้ (ดู coverageReason) */
  coverage: CoverageInfo | null
  /**
   * เหตุผลที่วัด coverage ไม่ได้ — ทั้งเคสที่ server บอกเอง (ไม่มี baseCommit) และเคส request ล้ม
   * (server ตาย / 4xx / เน็ตหลุด) · null = ปกติ หรือยังโหลดอยู่ · ห้ามเงียบทั้งคู่พร้อมกัน
   */
  coverageReason: string | null
  /** ยิง coverage-base ใหม่ — ล้มครั้งเดียวต้องไม่ดับยาวจนกว่าจะ reload ทั้งหน้า */
  reloadCoverage: () => void
}

const EMPTY_PROGRESS: RunProgress = { sectionsRead: 0, sectionsTotal: 0, spansRead: 0, spansTotal: 0 }

function store(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function useReadState(runId: string, data: RunData | null): ReadStateValue {
  const [state, setState] = useState<StoredReadState>(() => readStoredReadState(store(), runId))
  const firstRun = useRef(true)

  // ย้าย run = อ่าน state ของ run ใหม่ (คนละ key — story 15)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setState(readStoredReadState(store(), runId))
  }, [runId])

  const loadBase = useCallback(() => fetchCoverageBase(runId), [runId])
  const base = useAsync(loadBase, ['coverage-base', runId])

  /**
   * identity ของ `uncovered` ต้องนิ่งข้ามการติ๊ก checkbox: panel เอาไปสร้าง synthetic span
   * แล้วส่งเป็น pins เข้า CodeMirror — array ใหม่ทุกครั้งที่ `state.spans` ขยับ = reconfigure
   * editor ทุกใบใน panel ทั้งที่เนื้อหาไม่เปลี่ยน (uncovered ไม่ขึ้นกับ checked อยู่แล้ว)
   */
  const uncoveredRef = useRef<UncoveredHunk[]>([])
  const coverage = useMemo(() => {
    if (!data || !base.data || base.data.baseCommit === null) return null
    const info = computeCoverage(data, base.data.files, new Set(state.spans))
    if (sameUncovered(uncoveredRef.current, info.uncovered)) {
      return { ...info, uncovered: uncoveredRef.current }
    }
    uncoveredRef.current = info.uncovered
    return info
  }, [data, base.data, state.spans])

  /**
   * ชุด hash/section ที่ "มีจริง" — ใช้ prune ของค้างตอน write (SPEC: dropped on the next write)
   * synthetic hash รู้ได้ต่อเมื่อ coverage base มาแล้ว — ระหว่างที่ยังไม่รู้จึง prune แค่ฝั่ง
   * section (ซึ่งรู้ครบจาก run.json เสมอ) และปล่อย span ไว้ก่อน ดีกว่าลบเครื่องหมายบน synthetic
   * span ทิ้งเพราะจังหวะโหลด/เพราะ base ยังเทียบไม่ได้
   */
  const known = useMemo(() => {
    if (!data) return null
    const sections = new Set(data.sections.map((s) => s.id))
    if (!coverage) return { spans: null, sections }
    const spans = allListSpanHashes(data)
    for (const hunk of coverage.uncovered) spans.add(hunk.hash)
    return { spans, sections }
  }, [data, coverage])
  const knownRef = useRef(known)
  knownRef.current = known

  const update = useCallback(
    (updater: (prev: StoredReadState) => StoredReadState) => {
      setState((prev) => {
        let next = updater(prev)
        const knownNow = knownRef.current
        // spans = null → ยังไม่รู้ชุด hash ที่มีจริง: เก็บของเดิมไว้ทั้งหมด (prune แต่ section)
        if (knownNow) {
          next = pruneReadState(next, knownNow.spans ?? new Set(next.spans), knownNow.sections)
        }
        writeStoredReadState(store(), runId, next)
        return next
      })
    },
    [runId],
  )

  const toggleSpan = useCallback((hash: string) => update((prev) => toggleSpanRead(prev, hash)), [update])
  const markSpans = useCallback(
    (hashes: readonly string[], read: boolean) => update((prev) => setSpansRead(prev, hashes, read)),
    [update],
  )
  const toggleSection = useCallback(
    (sectionId: string) => update((prev) => toggleSectionRead(prev, sectionId)),
    [update],
  )

  const checkedSpans = useMemo(() => new Set(state.spans), [state.spans])
  const checkedSections = useMemo(() => new Set(state.sections), [state.sections])
  const statuses = useMemo(() => {
    const map = new Map<string, SectionReadStatus>()
    if (!data) return map
    for (const section of data.sections) map.set(section.id, sectionReadStatus(data, state, section))
    return map
  }, [data, state])
  const progress = useMemo(() => (data ? runProgress(data, state) : EMPTY_PROGRESS), [data, state])

  return useMemo<ReadStateValue>(
    () => ({
      isSpanRead: (hash) => checkedSpans.has(hash),
      toggleSpan,
      markSpans,
      isSectionRead: (id) => checkedSections.has(id),
      toggleSection,
      statusOf: (id) => statuses.get(id) ?? 'unread',
      progress,
      coverage,
      // request ที่ล้มต้องดังเท่ากับเคสที่ server ตอบว่าเทียบไม่ได้ — ไม่งั้น coverage ทั้งฟีเจอร์
      // (มิเตอร์ + รายการ uncovered + ลิงก์บน header) หายไปทั้งชุดโดยไม่มีข้อความที่ไหนเลย
      coverageReason: base.data?.reason ?? base.error?.message ?? null,
      reloadCoverage: base.reload,
    }),
    [
      checkedSpans,
      checkedSections,
      statuses,
      progress,
      coverage,
      base.data,
      base.error,
      base.reload,
      toggleSpan,
      markSpans,
      toggleSection,
    ],
  )
}
