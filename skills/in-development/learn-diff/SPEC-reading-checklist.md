# learn-diff — Spec: reading checklist & coverage meter

Status: draft, from a brainstorming session with tanin-t (Aug 7, 2026).
Extends [SPEC-v3.md](SPEC-v3.md) — the viewer app, reading lists, and content format it
describes are prerequisites. Read [DEVELOPMENT.md](DEVELOPMENT.md) first; this spec must
not break the principles recorded there.

## Problem Statement

The viewer explains a PR well, but gives the reader no memory and no completeness check:

1. **The reader cannot tell what they have already read.** A run has many sections and
   many reading lists; across sittings (or after an interruption) there is no record of
   which spans or pages were finished. The reader re-reads to be safe, or skips to be
   fast and loses confidence.

2. **The reader cannot tell whether they have seen all of the change.** Reading lists are
   AI-curated: they order and annotate the code, but nothing guarantees they *cover* every
   changed line in the diff. Finishing every list still leaves the question "did the lists
   show me everything the PR touched?" unanswered — and today that question is not even
   askable from the viewer.

These are different problems. (1) is about tracking the reader's own progress through the
curated content; (2) is about measuring the curated content — and the reader's progress —
against the ground truth of the diff. A checklist alone solves (1) but not (2).

## Solution

Four pieces, in dependency order:

- **Span-level read checkboxes.** Every span card in the reading panel gets a checkbox:
  "I have read this." Checked state persists per run in localStorage. A list-level
  control marks a whole reading list read at once. Marking is **manual only** — the
  viewer never infers reading from scrolling, consistent with the existing principle
  "never mark understanding the user didn't demonstrate."

- **Section read state.** Each section can be marked "read" (prose finished) from the
  section page. The sidebar nav shows a per-section status icon with three states:
  unread / prose read / prose read + all of the section's reading-list spans checked.
  Reading prose and reading code are tracked separately because they are different acts.

- **Run progress in the header.** The run header (next to `LiveStatus`) shows reading
  progress: sections read out of total, and spans checked out of total. This is progress
  through the *curated* content.

- **Coverage meter.** The server exposes the full diff (changed-line ranges per file,
  computed from the pinned commit range it already knows). The client intersects the
  *changed* spans the reader has checked against those ranges and reports:
  - **coverage %** — changed lines the reader has read through a checked span, over all
    changed lines in the PR;
  - **uncovered changes** — files/hunks that **no reading list span covers at all**,
    shown regardless of read state. This is a warning about the curated content itself:
    the agent's lists missed this code, and no amount of checkbox-ticking will surface it.

  Coverage answers problem (2); it is deliberately measured against `git diff`, not
  against the reading lists.

## User Stories

**Tracking what I read**

1. As a reader, I want a checkbox on every span card, so that I can record that I read it.
2. As a reader, I want to mark an entire reading list as read in one action, so that
   finishing a list is not N clicks.
3. As a reader, I want my checkmarks to survive closing the browser and restarting the
   server, so that I can read a large PR across several sittings.
4. As a reader, I want a span whose line range changed after regeneration to come back
   unchecked, so that I never carry a "read" mark onto code I have not actually seen.
5. As a reader, I want to mark a section's prose as read from the section page, so that
   the nav reflects where I stopped.
6. As a reader, I want the sidebar to show each section's status at a glance, so that I
   can find my place without opening pages.
7. As a reader, I want checking spans to update the section status automatically, so that
   "code read" is derived, never separately bookkept.

**Knowing where I stand**

8. As a reader, I want the run header to show how much of the run I have read, so that I
   know how far from done I am.
9. As a reader, I want progress shown as counts, not only a percentage, so that "3/5
   หน้า · 12/40 spans" tells me the size of the remainder.

**Knowing whether I saw everything**

10. As a reader, I want a coverage figure measured against the actual diff, so that
    finishing the reading lists does not silently equal "saw everything."
11. As a reader, I want a list of changed files/hunks that no reading list covers, so
    that I can open and read the code the agent's curation missed.
12. As a reader, I want to open an uncovered hunk in the reading panel directly, so that
    closing a coverage gap does not require leaving the viewer.
13. As a reader, I want uncovered-changes warnings visible even before I check anything,
    so that a curation gap is surfaced immediately, not after I finish reading.
14. As a reader, I want reading an uncovered hunk from the coverage view to count toward
    coverage, so that the meter can actually reach 100%.

**Correctness**

15. As a reader, I want read state keyed to the run, so that two runs over the same repo
    do not share checkmarks.
16. As a reader, I want a stale-state situation (content regenerated, spans changed) to
    degrade to "unchecked," never to a wrong checkmark or a crash.

## Implementation Decisions

### Span identity: content hash, not authored ids

- A span's identity is `hash(path + ":" + from + ":" + to)` computed client-side.
  `ReadingSpan` has no id field today and **gains none** — the content format and
  SKILL.md generation prompt are untouched by this feature.
- Consequence embraced, not tolerated: if regeneration moves a span's lines, its hash
  changes and it reverts to unchecked. Shifted lines mean different code; requiring a
  re-read is the correct semantic (story 4).
- The same span appearing in two reading lists shares one hash and therefore one checked
  state. This is intended: "read" is a property of the code, not of the list entry.
- Authored ids in the JSON were rejected: they push id-stability onto a stochastic
  writer, grow the generation prompt, and still need a fallback when the writer gets
  them wrong.

### Persistence

- One localStorage key per run: `learn-diff:read-state:<runId>`, holding raw reader
  intent only — `{ v: 1, spans: string[], sections: string[] }` (checked span hashes,
  section ids marked prose-read). Derived values (percentages, per-section rollups,
  coverage) are always recomputed, never stored — per the DEVELOPMENT.md rule about
  storing intent, not clamped/derived state.
- No server-side persistence. The server stays a read-only view over git + content dir.
  Cross-device sync is out of scope.
- Unknown hashes in stored state (from content that no longer exists) are ignored on
  read and dropped on the next write. A malformed or version-mismatched value is
  discarded wholesale (story 16).

### Coverage computation

- **Server**: one new endpoint, `GET /api/run/:runId/coverage-base`, returning the PR's
  changed-line ranges per file: `{ files: [{ path, ranges: [{from, to}] }] }`. Computed
  from the same commit range `server/diff.ts` already parses; no new git plumbing.
  Anything that makes the range unmeasurable (no `baseCommit`, base not fetched, diff over
  the git buffer cap) answers 200 with `baseCommit: null` + a Thai `reason`, like the diff
  API — never an error the client can only drop on the floor.
- **Failure is visible.** If coverage cannot be computed — including a failed request —
  the reader sees why, in the coverage view and in the header, with a way to retry. A
  viewer with no meter and no message is indistinguishable from a viewer without the
  feature.
- **Client**: pure functions compute
  - `spanCoverage`: for each changed span (kind `'changed'`), its intersection with the
    changed ranges of its file;
  - `coveragePct`: |changed lines ∩ checked spans| / |all changed lines|;
  - `uncovered`: changed ranges not intersected by any **changed** span (`kind:
    'changed'`) in any reading list — independent of checked state.
- Context spans (`kind: 'context'`) never count toward coverage — coverage measures the
  diff, and context code is outside the diff by definition. That cuts both ways: a
  context span does not make a changed range "covered" either, so a range only a context
  span overlaps is still reported as uncovered. Counting it as covered while it can never
  contribute to `coveragePct` would put 100% out of reach.
- Span paths are normalized (collapse `./`, `a/../b`, backslashes) before they are matched
  against the paths git reports, the same way `server/file.ts` normalizes them — an
  un-canonical path in `run.json` must not be silently reported as a curation gap.
- `coveragePct` is an integer that reaches 100 only when every changed line is covered;
  a partial read never rounds up to 100.
- Uncovered hunks open in the reading panel as a **synthetic reading list** (one span
  per hunk, `kind: 'changed'`, why: "โค้ดส่วนนี้ไม่อยู่ใน reading list ไหนเลย"), built
  client-side. Checking these synthetic spans uses the same hash scheme, so they persist
  and count toward coverage like any other span (stories 12, 14). The panel's existing
  single-list/history behaviour applies unchanged — but the target carries the hunk the
  reader clicked, so "เปิดอ่าน" scrolls to that hunk's card and counts as its own history
  step. Opening one list and leaving every button after the first inert would be a dead
  click, which DEVELOPMENT.md forbids.

### UI placement

- **Span card**: checkbox in the card header, next to the existing path/line label.
  List-level "mark all" control in the panel's pinned header area. The checkbox appears on
  cards of a curated unit — a reading list or the synthetic uncovered list. A card opened
  from a `:file` link in the prose has no checkbox: it is a lookup, not an item of the
  checklist, and it carries no place in any list to report progress against.
- **Sidebar nav**: one status icon per section in the existing badge slot (shared with
  "รอเขียน" — generation state wins while a section is pending). Three states:
  unread ○ / prose read ◐ / prose + all spans read ●. Sections without a reading list
  skip the third state (prose read = done).
- **Section page**: "อ่านหน้านี้จบแล้ว" toggle at the end of the prose.
- **Run header**: compact summary next to `LiveStatus` — e.g.
  `อ่านแล้ว 3/5 หน้า · 12/40 spans · coverage 78%`. Clicking the coverage figure opens
  the coverage view.
- **Coverage view**: rendered on the verify page (`99-verify`) above the existing
  checklist, plus reachable from the header. Lists uncovered files/hunks with per-hunk
  "เปิดอ่าน" actions. It annotates the verify page but writes nothing into it — the
  verification checklist's PD-by-default rule is untouched.

### Code structure

- All state logic is a pure module `viewer/src/lib/read-state.ts` (hashing, state
  reducer, rollups, coverage math) with tests in `viewer/test/read-state.test.ts` —
  no component-level tests, per the existing testing rule.
- React integration mirrors the reading-panel pattern: one hook
  (`use-read-state.ts`) hosted at `RunLayout`, shared via context, so span cards,
  nav, header, and coverage view all read one source of truth.
- Panel remains a flex sibling; the coverage view adds no overlays.

## Out of Scope

- **Auto-marking from scroll or dwell time** — rejected, not deferred. Manual marks
  only.
- **Mastery inference** of any kind — this feature records exposure ("ตาเห็นแล้ว"),
  never understanding. The verify page remains the only place understanding is assessed.
- **Server-side or cross-device persistence** of read state.
- **Feeding read state into the verification checklist** (auto-flipping PD items) —
  conflicts with "never mark understanding the user didn't demonstrate."
- **Coverage of deleted lines.** Coverage is measured over lines that exist at the
  pinned commit; pure deletions are visible in span diffs but not counted in the meter.
- **Per-line read tracking.** The unit is the span; partial-span reads do not exist.
