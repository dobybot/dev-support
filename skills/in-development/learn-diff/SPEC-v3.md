# learn-diff v3 — Spec: viewer app, mermaid flowcharts, AI-curated reading lists

Status: draft, settled in a grilling session with tanin-t (Aug 4, 2026).
Supersedes the v2 output pipeline (static multi-page HTML + markup contract).
Read [DEVELOPMENT.md](DEVELOPMENT.md) first — it holds the v1/v2 history and the
principles this spec must not break.

## Problem Statement

`/learn-diff` produces a static HTML page that explains a PR top-down. Two things about
that page block the reader from actually understanding the change:

1. **The diagrams are hand-laid-out.** Every flowchart is a pile of `<span class="node">`
   and `<span class="arrow">` elements that the agent positions by hand with inline
   styles. A single diagram costs ~2.5 KB of generated markup, the agent spends effort on
   layout instead of content, and the result still cannot express branching, grouping, or
   anything that isn't a left-to-right row.

2. **The code is somewhere else.** The page describes a change; verifying that description
   means leaving the page for GitHub or an editor, finding the file, finding the lines, and
   rebuilding the context by hand. The page inlines short snippets, but a snippet is the
   agent's choice of 10 lines with no way to look at line 11.

Behind (2) is a deeper problem the current page cannot address at all: **understanding a
change usually requires reading code the change did not touch.** A diff viewer — GitHub's
included — structurally cannot show that code, because it only knows what changed. The
reader is left to guess which surrounding code matters and in what order to read it.

## Solution

Replace the generated static page with a **local viewer application**: a React app served
by a Vite dev server on the reader's machine, rendering content that `/learn-diff` writes
as markdown + JSON into the target repo.

Three capabilities the current output does not have:

- **Real flowcharts.** The agent writes mermaid; the app lays it out. Diagrams gain
  branching, subgraphs (system boundaries), and highlight classes for "this is what the PR
  touched" — at roughly a quarter of the generation cost of the hand-built HTML.

- **Clickable diagrams and file references.** Clicking a flowchart node — or a filename in
  the prose, or a row in the box map — opens code in a resizable right-hand panel that
  pushes the prose narrower rather than covering it.

- **AI-curated reading lists, not diffs.** The panel does not show "the diff of this file."
  It shows an ordered sequence of code spans the agent chose, across files, in the order it
  believes is easiest to understand — **including unchanged code**, each span carrying a
  one-line "why you are reading this." Changed spans are diff-coloured; context spans are
  not. Any span expands to the full file in place.

Because the agent emits *coordinates and reasons* rather than code, and the server reads
the actual bytes from `git show`, this is also cheaper to generate than what it replaces.

Content is written incrementally, as today. The dev server watches the content directory
and pushes updates over SSE, so the reader watches pages appear as the agent writes them
instead of refreshing to check.

## User Stories

**Reading a change**

1. As a developer reviewing an AI-written PR, I want to open one URL and read a top-down
   explanation of the change, so that I can understand it before approving it.
2. As a developer, I want the explanation to open with the product-level picture, so that I
   know what the change enables before I meet any code.
3. As a developer, I want a flowchart of the system with the changed parts highlighted, so
   that I can see where this PR sits relative to everything else.
4. As a developer, I want to click a box in the flowchart, so that I can read the code
   behind that box without leaving the page.
5. As a developer, I want the code panel to push the prose narrower rather than float over
   it, so that I can read the explanation and the code at the same time.
6. As a developer, I want to drag the panel's edge to resize it, so that I can favour prose
   or code depending on what I am doing.
7. As a developer, I want my chosen panel width remembered, so that I do not re-drag it on
   every run.
8. As a developer, I want to close the panel with `Esc` or a button, so that I can get the
   full width back for reading.
9. As a developer, I want to click a filename mentioned in the prose, so that I can jump
   straight to the code being discussed.
10. As a developer, I want to click a row in the box map, so that I can enter a section's
    code from the reading plan.

**The reading list**

11. As a developer, I want the panel to show an ordered reading path rather than a raw
    diff, so that I know what to read first.
12. As a developer, I want each span to carry one line explaining why I am reading it, so
    that I am never staring at code without knowing what question it answers.
13. As a developer, I want the reading path to include code the PR did not change, so that
    I can understand the context the change depends on.
14. As a developer, I want changed and unchanged spans to be visually distinct, so that I
    never confuse "new behaviour" with "existing behaviour."
15. As a developer, I want the reading order to follow the dataflow the agent describes
    rather than file-then-line order, so that the sequence matches the explanation.
16. As a developer, I want one click on a node to open every file that node covers, so that
    a capability spread over four files reads as one thing.
17. As a developer, I want a pinned file index at the top of the panel, so that I can jump
    between the files in the current reading list.
18. As a developer, I want to expand any span into its full file in place, so that I can
    read around the span when the excerpt is not enough.
19. As a developer, I want the other pins in that file to stay visible after expanding, so
    that I do not lose the reading path when I zoom out.
20. As a developer, I want to switch between unified and side-by-side diff, so that I can
    read a heavy rewrite the way that suits it.
21. As a developer, I want my diff-view preference remembered, so that I do not reset it
    per file.
22. As a developer, I want code shown with proper syntax highlighting and line numbers, so
    that it reads like it does in my editor.
23. As a developer, I want to search within an open file, so that I can find a symbol
    without opening my editor.
24. As a developer, I want line numbers in the panel to match the PR's commit exactly, so
    that I can refer to them in review comments with confidence.
25. As a developer, I want opening a second reading list to replace the first with
    back/forward history, so that the panel stays a single focused thing.

**Generation and progress**

26. As a developer, I want to start reading page 1 while the agent is still writing page 3,
    so that I am not blocked on the whole run finishing.
27. As a developer, I want new sections to appear without me refreshing, so that I can stay
    in the reading flow.
28. As a developer, I want sections that are not written yet shown as pending, so that I
    know whether something is missing or merely not ready.
29. As a developer, I want navigating between sections to keep the code panel open, so that
    I can carry one reading list across several sections.
30. As a developer, I want section URLs to be copyable and openable directly, so that I can
    send a teammate a link to a specific part.

**Across runs**

31. As a developer, I want a home page listing every run I have generated, so that I can
    reopen an explanation from last month.
32. As a developer, I want that list to span repositories, so that I do not have to
    remember which project a run belongs to.
33. As a developer, I want each run to show its PR number, title, and date, so that I can
    identify it at a glance.
34. As a developer, I want the run header to show the pinned commit, so that I know exactly
    which snapshot I am reading.
35. As a developer, I want a link to the PR on GitHub from the run header, so that I can
    go comment once I understand it.

**Setup and lifecycle**

36. As a developer installing team skills, I want the viewer's dependencies installed by
    the installer, so that my first `/learn-diff` is not a multi-minute wait.
37. As a developer, I want the skill to detect stale dependencies after a `git pull`, so
    that I do not debug errors caused by a changed lockfile.
38. As a developer without node or pnpm, I want a clear failure telling me what to install,
    so that I am not left with a broken half-run.
39. As a developer, I want the server started for me with the URL printed in chat, so that
    running the skill is one step.
40. As a developer, I want the manual start command shown too, so that I can reopen a run
    after the chat session is gone.
41. As a developer, I want a second `/learn-diff` to reuse the running server, so that I do
    not accumulate processes and ports.
42. As a developer, I want the server to shut itself down after a long idle period, so that
    I do not leave it running for days.
43. As a developer on Windows, I want the same behaviour as on macOS, so that the team
    shares one workflow.

**Correctness and failure**

44. As a developer, I want a visible warning when the agent references a flowchart node
    that does not exist, so that a dead click is diagnosed rather than mysterious.
45. As a developer, I want a visible warning when a reading list is defined but never
    referenced, so that I know content was written but is unreachable.
46. As a developer, I want a clear message when a referenced file or line range does not
    exist at the pinned commit, so that I can tell the agent to fix it.
47. As a developer running the skill without a PR, I want to be told to open one, so that I
    am not guessing why nothing happened.
48. As a developer, I want the server to serve only from repositories that have registered
    runs, so that a stray URL cannot read arbitrary files on my machine.

**Maintaining the skill**

49. As the skill maintainer, I want to edit the viewer and see the change immediately, so
    that improving it does not require a build-and-commit cycle.
50. As the skill maintainer, I want teammates to be able to change the viewer from a
    `git pull`, so that improvements spread without a release step.
51. As the skill maintainer, I want the agent to write markdown and JSON rather than HTML,
    so that presentation changes do not require changing the generation prompt.
52. As the skill maintainer, I want the mermaid syntax the agent may use constrained to a
    documented subset, so that swapping the diagram engine later stays possible.

## Implementation Decisions

### Delivery model

- **The output is served over HTTP, not opened from `file://`.** This reverses v2's
  load-bearing constraint. It is what makes `fetch`, ES modules, on-demand file reads, and
  the future comment/question features possible. The cost accepted: an output folder is no
  longer a self-contained thing you can zip and send.
- **The server is a Vite dev server running on the reader's machine**, from the viewer
  source inside the skill folder. Chosen over a prebuilt bundle so that anyone — including
  Claude — can change the viewer and see it live, with no build or reinstall step.
- **The app is React + shadcn/ui.** Off the team's Vue stack, chosen deliberately: the
  viewer is expected to be edited by agents, and shadcn's copy-in component model is the
  easiest for an agent to modify correctly.
- **One global server instance with a run registry**, not one per repository. A registry
  file under the user's home directory maps run id → repo path, content directory, pinned
  commit, PR number, title, date. The home page lists every run across every repository.
- **Server binds `127.0.0.1` only**, and file reads are resolved against the registered
  repo root for that run id; anything escaping it is refused.
- **Lifecycle:** the skill starts the server if `/api/health` shows none running, prints
  the URL and the manual start command, and the server shuts down after a long idle period
  (target: 4 hours without a request).

### What the agent writes

- Per run, in `<repo>/.learn-diff/<slug>/`: one JSON file of structured data plus one
  markdown file per page (index, per-section, verify).
- **Prose is markdown.** Components that contain prose (questions, callouts) use
  `remark-directive` containers so their bodies stay markdown.
- **Pure data lives in the JSON file**: run metadata, section order and box assignments,
  reconciliation rows, reading-list definitions, and the flowchart node → reading-list map.
  Data never needs escaping and is schema-validated.
- MDX was rejected for now — a syntax error in generated MDX fails compilation and takes
  down content that was already correct. The `.md` files remain MDX-compatible, so the
  decision is reversible.
- The agent no longer emits HTML. `references/html-page.md`'s markup contract and the
  `assets/learn-diff.css` / `.js` pair are retired with the v2 path.

### Diagrams

- **mermaid**, vendored via npm and restricted to a **documented subset**: `flowchart`
  direction, node declarations, edges with and without labels, `subgraph`, and `classDef`.
  The subset is a rule in `references/`, not a suggestion: unconstrained mermaid usage is
  how the engine becomes unswappable in practice even when the interface says otherwise.
- **The stable contract is the mermaid text**, not a neutral JSON graph. Rationale: the
  diagram is regenerated by a stochastic writer on every run, and mermaid is a grammar the
  model already produces correctly, whereas a schema we invent is one it has never seen.
  Swapping engines later means writing a parser for the documented subset — deterministic
  code, written once, and only when the swap actually happens.
- **Diagram rendering sits behind a single module boundary** — one entry point taking a
  container, a mermaid source, and a node map — so a future engine is a drop-in.
- **Click handling does not use mermaid's `click` directive** (which would require
  `securityLevel: 'loose'`). The app walks the rendered SVG's node elements and attaches
  handlers itself, driven by the node map. This works identically under a different engine.

### Reading lists

- A **reading list** is the unit that connects the page to code. It has an id, and contains
  an ordered array of spans: file path, line range, kind (`changed` | `context`), and a
  one-line reason.
- **Many reading lists per section are allowed.** Forcing one per section would make every
  node in a section open the same thing, which makes clicking meaningless.
- Flowchart nodes and box-map rows reference a reading list by id. Filenames in prose may
  instead reference an ad-hoc file + line range with no id.
- **Code content is never embedded in the content files.** The agent emits coordinates and
  reasons; the server reads bytes from the pinned commit on request.
- **Validation runs server-side when content is loaded** and is returned with the content
  as a warnings array the app displays prominently: every referenced reading-list id must
  exist, every definition must be referenced at least once, every node id in the map must
  appear in the mermaid source, and every file/line range must resolve at the pinned
  commit. Broken references must fail loudly — a dead click is the worst outcome.

### Scope resolution

- **PR-only.** `gh pr view` resolves base and head; `git fetch origin pull/<N>/head` makes
  the head commit available locally; the head sha is pinned in the run metadata and shown
  in the UI.
- Branch-vs-merge-base and working-tree scopes are **removed**. Invoking without a PR is a
  hard failure whose message gives the `gh pr create --draft` command and offers a
  chat-only summary instead. Keeping a second output path alive for those scopes was
  rejected: two output systems means every future improvement is done twice or skipped.
- Because a PR head is always a real commit, the working-tree snapshot problem disappears
  and line ranges are stable for the life of the run.

### Viewer UI

- Layout: run header (title, PR, pinned sha, GitHub link, generation status), section nav,
  content pane, right-hand code panel.
- **The code panel pushes content narrower; it does not overlay.** Resizable by dragging,
  width persisted, closable via button or `Esc`.
- **One reading list open at a time**, with back/forward history. Tabs and stacked panels
  were rejected: the design's whole premise is that the agent chooses an order, and an
  accumulating pile of open lists competes with that.
- **Navigation between sections swaps only the content pane** — the shell, nav, and code
  panel survive. URLs still resolve directly, and the highlighter and diagram renderer
  re-run after each swap.
- **Code rendering is CodeMirror 6 in read-only mode.** Chosen over Shiki/Prism because
  every feature on the roadmap — pins, changed-line highlighting, and later inline comments
  and questions — is a gutter marker or a decoration, which CodeMirror provides and the
  alternatives require building. Virtualized rendering also makes full-file expansion cheap
  for large files.
- **Diff display defaults to unified with a side-by-side toggle**, remembered per user.
  Context spans are the same renderer with colouring absent — one code path, not two.
  Full-file expansion **retains** diff colouring.
- **Desktop only.** No responsive or mobile work.

### Repository and installation

- Viewer source lives **inside the skill folder**, so the existing symlink install makes it
  reachable and installing/removing the skill installs/removes the viewer. This stretches
  the repo convention that skill support files live in `references/` or `assets/`; CLAUDE.md
  is amended rather than the layout bent.
- `.gitignore` gains `node_modules/` and `dist/`.
- **The installer rule is generic, not learn-diff-specific:** after linking a skill, if the
  skill folder contains a `package.json`, run `pnpm install` in it (falling back to `npm`
  when pnpm is absent). `install.sh` and `install.ps1` change together per the standing repo
  rule, and the `.ps1` is saved UTF-8 **with BOM**.
- The skill re-checks at runtime by comparing a stored hash of the lockfile, and installs
  when missing or stale — `git pull` changing the lockfile must not produce confusing
  runtime errors.
- **Missing node or pnpm is a hard failure** with instructions, not a degraded fallback.
- `README.md` gains the prerequisites (node ≥ 20, pnpm); `DEVELOPMENT.md` records the
  reversals: mermaid was rejected in v2 on the CDN ban, `file://` was load-bearing and is
  now dropped, and the markup-contract approach is retired.
- Path handling in the server must not assume POSIX separators; the launch command differs
  per platform.

### Build order

Big-bang: the whole thing is built and then evaluated, rather than shipped in slices.

## Testing Decisions

A good test here asserts externally observable behaviour — what the server returns and what
it refuses — and never reaches into how a component stores state. The repository currently
has **no test infrastructure at all**, so this spec introduces the first one, and it is
worth keeping to a single seam.

**Proposed seam: the dev server's HTTP surface.** One seam, at the highest available point,
covering:

- the content API: given a fixture content directory, the parsed and validated content is
  returned as the app would receive it
- **validation warnings**, which is why validation is placed server-side rather than in the
  browser: broken reading-list references, unreferenced definitions, node ids absent from
  the mermaid source, and line ranges that do not resolve all become assertions against an
  API response rather than DOM tests
- the file API: correct bytes and line ranges from a pinned commit in a fixture git
  repository, and refusal of paths escaping the registered repo root
- the run registry: registering a run, listing runs, and resolving a run id to its repo
- SSE: writing a content file produces a change event

Fixtures are built in a temporary directory — a small git repository with a known commit,
plus a content directory exercising both valid and deliberately broken references. Vitest
is the runner, matching the team's Vite-based projects.

Explicitly **not** covered by automated tests: React component rendering, CodeMirror
decorations, panel resizing, and mermaid layout. These are visual, change often while the
design settles, and would cost more to maintain than they would catch. They are covered by
the acceptance test below instead.

**Acceptance test, in two steps:**

1. Regenerate the existing `pr-230-etax-link-notify` run in the new format and read it end
   to end. It is a known quantity, so anything lost relative to the v2 page is obvious.
2. Run it against a **fresh PR that has not been read yet**. Step 1 tests rendering; only
   step 2 tests whether an AI-ordered reading path actually teaches.

There is no prior art for tests in this repository; the monorepo's `e2e` package is the
closest reference for fixture-repo style, and `record-v2` for Vitest configuration.

## Out of Scope

- **Comments on code, and asking the agent questions from the page.** These motivated the
  architecture — the server exists partly so they become possible — but neither is built
  here. CodeMirror's line-anchored widgets are the intended primitive.
- **Branch, merge-base, and working-tree scopes.** PR-only, deliberately.
- **A "current file" view** that follows the working tree after generation, and any handling
  of line-range drift. The run is pinned to the PR head.
- **Mobile and responsive layouts.**
- **Multiple reading lists open at once** (tabs or stacked panels).
- **Swapping the diagram engine.** Only the boundary and the documented subset that make it
  possible are built now; the subset parser is written the day the swap happens, if ever.
- **A prebuilt viewer bundle** and any release process for it. The dev server runs from
  source on purpose.
- **Migrating existing generated output.** Folders like `pr-230-etax-link-notify` are
  self-contained static HTML and keep working by double-click; nothing is converted.
- **Portability of output folders.** Dropping `file://` means an output folder is no longer
  something you zip and send to a colleague.
- **Artifact mode.** The single self-contained Artifact page is retired along with the
  markup contract.

## Further Notes

- The principles in DEVELOPMENT.md survive this rewrite unchanged and must not be traded
  away for viewer features: PM view before engineer view; intent reconciliation first; box
  triage with hard rules for auth/money/migrations/deletion/security/irreversible/CI-CD;
  **no deliberately misleading questions, ever**; ceremony scaling with diff size; the
  concept ledger as a dumb append-only file.
- Two v2 decisions are explicitly reversed and should be recorded as such rather than
  quietly overwritten: mermaid was rejected on the CDN ban (Jul 29), and `file://`
  operation was treated as a hard requirement. Both were correct under v2's constraints;
  the constraint changed, not the reasoning.
- The recurring principle behind several decisions — mermaid text over invented JSON,
  markdown over MDX, loud validation over silent failure — is the same one: **keep variance
  out of the path that runs every day, and prefer failures that are visible over failures
  that are quiet.**
- The reading list is the genuinely new idea here and the one most likely to need revision
  after real use. It is also the one thing no diff viewer can offer, because it depends on
  someone deciding what unchanged code matters — which is exactly what an agent that has
  just read the whole change is positioned to do.
- Scaling rules from v2 still apply and should be revisited once the viewer exists: a tiny
  PR probably still does not deserve a server and a page.
