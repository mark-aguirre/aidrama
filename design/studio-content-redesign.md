# AI Drama — Creator Studio "My Content" Redesign

**Route:** `/studio/content`
**Shell:** `frontend/src/app/studio/content/page.tsx`
**Component under redesign:** `frontend/src/features/videos/components/creator-content-list.tsx`
**Status:** design handoff for frontend-engineer
**Author:** ui-ux-designer
**Spec source:** `spec.md` §3.4 (Content Management), §3.5 (Metadata), §3.7 (processing lifecycle)
**Builds on:** `design/mvp-slice-states.md` §S5 (processing surface). This doc **extends** S5; it does not contradict it.

> **Design task only.** This is a specification. It redesigns the presentation of
> an existing, working component. **Do not change the data layer** (the TanStack
> Query wiring, polling, `listCreatorVideos`/`deleteVideo`/`publishVideo`/
> `getProcessingStatus` calls, the inline publish/reason/delete panels, or the
> `aria-live` transition announcement). All of that behavior is kept; only the
> layout, hierarchy, controls, and states around it change.

---

## 0. Why redesign

The current page is a single `Card` with divided `<li>` rows that wrap on
`flex-wrap`. It works but reads as a plain list: no column alignment, no status
filtering, no search/sort, and every row action is a visible button, so a FAILED
or PUBLISHED row shows 4–5 buttons competing for attention. The redesign turns it
into a professional creator dashboard (YouTube-Studio-class) while keeping the
existing data and behavior intact.

Goals, in priority order:
1. **Scannability** — aligned columns, one obvious status per row, calm actions.
2. **Findability** — status filter tabs + search + sort in a sticky toolbar.
3. **Action restraint** — one primary action inline per row; everything else in an overflow menu.
4. **Responsive integrity** — a real table on desktop, stacked cards on mobile, no squashed columns.
5. **Zero new colors** — reuse `--primary`, existing `Badge` variants, `--signal` for AI only.

---

## 1. Ground rules carried over (source of truth)

### Tokens (`globals.css`) — reuse only, no new colors
| Token | Value | Use here |
|---|---|---|
| `--background` `#0a0a0d` | page base |
| `--surface` / `--surface-2` `#131318` / `#1b1b22` | card, toolbar, skeleton, row hover |
| `--foreground` / `--muted-foreground` `#f5f5f7` / `#a3a3b2` | title text / meta text |
| `--primary` `#ff3d71` | primary action (Upload, row Publish), active tab marker, focus ring |
| `--signal` `#b46cff` | **AI-generated label only** (`Badge variant="signal"`) |
| `--success` / `--warning` / `--destructive` | status badges only, via existing `Badge` variants |
| `--border` / `--input` / `--ring` | borders, field border, pink focus ring |
| `--radius` `0.5rem` / `--radius-media` `0.625rem` | controls / thumbnail & card media |

Fonts: `.font-display` (Jakarta, heavy, tight) for the `h1`; body Jakarta. Serif
`font-editorial` is **not** used on this page (reserved for featured titles).

### Component vocabulary already present
- `Button` (default, secondary, outline, ghost, destructive, link; sizes default/sm/lg/icon)
- `Badge` (default, secondary, outline, success, warning, destructive, signal)
- `Card`, `Input`, `Label`
- `ProcessingBadge` / `PublicationBadge` (`features/videos/components/status-badge.tsx`)
- `PublishForm`, `RequireCreator`, `FailureReason`/`DeleteConfirm` (inline panels, in the component)

### Accessibility baseline (applies to every surface below)
- Visible focus is the global pink ring (`focus-visible:ring-2 ring-ring ring-offset-2`). Every new focusable control keeps it.
- **Never status by color alone** — every status is color + text label (existing badge pattern); FAILED and PROCESSING also carry an icon.
- Reduced motion is stripped globally; new spinners/pulses pair with text.
- The existing list-level `aria-live="polite"` announcement ("'{title}' is ready to publish") **stays** and moves to the new layout unchanged.

---

## 2. Page layout (populated state)

Container widens from `max-w-5xl` to **`max-w-6xl`** to give the new columns room.
Three stacked regions: **header → toolbar → table/list → pagination**.

```
┌─────────────────────────────────────────────────────────────────────┐
│  My Content                                   [ + Upload content ]    │  ← header (h1 + primary action)
│  Everything you have uploaded, drafted, or published.                 │
├─────────────────────────────────────────────────────────────────────┤
│ [All][Published][Draft][Processing][Failed][Unpublished]  🔎[search] ⇅[Sort ▾] │ ← toolbar (sticky)
├─────────────────────────────────────────────────────────────────────┤
│  12 videos                                              ↻ Refresh      │ ← result meta row
├───────┬──────────────────────────┬───────────┬─────────┬─────────────┤
│ THUMB │ TITLE + meta             │ STATUS    │ VIEWS   │ ACTIONS     │ ← column header (desktop only)
├───────┼──────────────────────────┼───────────┼─────────┼─────────────┤
│ [img] │ Neon Nights              │ ● Published│ 12.4K  │ [Watch] [⋯] │
│       │ Movie · Nov 2 · AI       │           │         │             │
├───────┼──────────────────────────┼───────────┼─────────┼─────────────┤
│ [img] │ Draft Two                │ ● Ready    │ —      │ [Publish][⋯]│
│  …                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ◂ Previous            Page 1 of 3            Next ▸                   │ ← pagination (only if >1 page)
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1 Header
- `h1` `.font-display text-3xl` "My Content" + muted subline (unchanged copy from the current page shell).
- Primary action **"Upload content"** (`Button` default = pink), icon `UploadCloud` (left), `asChild` → `Link href="/studio/upload"`. Already in the page shell; keep it top-right of the header row.
- Header lives in `page.tsx` (server). Toolbar/table live in the client component.

### 2.2 Toolbar (new region, sticky)
A single horizontal bar directly under the header, `sticky top-0 z-10 bg-background/95 backdrop-blur` with a bottom `border-border`, vertical padding `py-3`. Contents, left→right:
1. **Status filter** — segmented tabs (see §5.1). This is the primary control; it gets the most space.
2. **Search** — `Input` with a leading `Search` icon, `placeholder="Search your content"`, `max-w-xs`. (Design-ready UI; backend blocked — see §8.)
3. **Sort** — a dropdown menu button "Sort: Newest ▾" (see §5.3). (Design-ready UI; backend blocked — see §8.)

Toolbar responsive behavior in §6.

### 2.3 Result meta row
Keep the existing `{n} videos` count (left, `tabular-nums`) and `Refresh` ghost button with the spinning `RefreshCw` (right). Unchanged behavior; it now sits between the toolbar and the table. When a filter/search is active, the count reflects the filtered total and reads e.g. "3 of 12 videos" (see §5.2).

### 2.4 Table / list container
One `Card` wrapping either a desktop table grid or stacked mobile cards (§3). Keep `Card overflow-hidden`. Rows divided by `divide-y divide-border/70` (existing).

### 2.5 Pagination
Unchanged logic and markup (`nav aria-label="Pagination"`, Previous / "Page x of y" / Next, `Button variant="secondary" size="sm"`). Only shown when `totalPages > 1`.

---

## 3. Row anatomy & responsive behavior

The row is the heart of the redesign: today it is a `flex-wrap` blob; it becomes an
**aligned grid on desktop** and a **stacked card on mobile**. Same data, same per-row
state logic — only layout.

### 3.1 Desktop columns (≥ `md`)
Use a CSS grid per row so columns align down the list. Column header row (a
non-selectable `role="row"` of muted `text-xs uppercase tracking-wide` labels)
sits at the top of the `Card`, inside the same grid template.

| Col | Label | Width | Content | Align |
|---|---|---|---|---|
| 1 | — (thumb) | `7rem` fixed | 112×64 thumbnail, `rounded-md ring-1 ring-border/60`; `Film` placeholder icon when `thumbnailUrl` is null | — |
| 2 | Title | `1fr` (min 0) | `title` truncated, `font-medium`; meta line below: `type` · `formatDate(createdAt)` · AI pill if `isAiGenerated` · processing note ("Queued/Uploading…/Transcoding…") when present | left |
| 3 | Status | `10rem` | **One** `PublicationBadge`; when `processingStatus !== READY` show `ProcessingBadge` **instead** of the publication badge (the lifecycle is the more urgent truth). FAILED and PROCESSING badges carry their Lucide icon. | left |
| 4 | Views | `6rem` | `formatViews(viewCount)` `tabular-nums`; render `—` (muted) when not PUBLISHED (don't show "0 views" as if live, per S5) | right |
| 5 | Actions | `auto` (min `9rem`) | primary action button (contextual) + overflow `⋯` menu (§4) | right |

Grid template: `grid-cols-[7rem_minmax(0,1fr)_10rem_6rem_auto]`, `items-center`, `gap-x-4`, row padding `px-5 py-4` (keep existing rhythm). The move hover stays `hover:bg-accent/40`.

> **Status rule detail:** the current code shows `ProcessingBadge` *and*
> `PublicationBadge` side by side. Keep exactly one chip in the Status column to
> reduce noise: show `ProcessingBadge` while `processingStatus !== "READY"`,
> otherwise show `PublicationBadge`. The processing note text in column 2 carries
> the "Transcoding…/Queued" nuance, so no information is lost.

### 3.2 Thumbnail
Always visible in the redesign (today it is `hidden … sm:block`). On the smallest
mobile card it stays, smaller (see §3.3). Keep `next/image` with `fill` + `sizes`.
Keep `alt=""` (decorative; the title is the accessible label right beside it).

### 3.3 Mobile card (< `md`)
Each row becomes a stacked card, not a squashed table row:
```
┌──────────────────────────────────────────┐
│ [thumb]  Neon Nights                 [⋯]  │
│  80×45   Movie · Nov 2 · AI                │
│          ● Published        12.4K views    │
│          [  Watch  ]                        │
└──────────────────────────────────────────┘
```
- Thumbnail left (80×45), title + meta to its right, overflow `⋯` top-right.
- Status badge and views on their own line below the meta (views shown inline with a "views" word since there's no column header for context).
- Primary action is a full-width-ish button on its own line at the bottom of the card; overflow menu holds the rest.
- Cards divided by `divide-y divide-border/70` inside the same `Card`.
- The desktop column-header row is `hidden md:grid` (not rendered on mobile).

### 3.4 One component, two layouts
Implement with responsive Tailwind on a single row component (`hidden md:grid` for the desktop grid, `md:hidden` block for the mobile card) rather than two separate components, so the per-row state/action logic is written once. The engineer may extract a `ContentRow` presentational piece, but the data/handlers stay in `ContentBody`.

---

## 4. Action model (inline primary + overflow menu)

The biggest hierarchy fix. **One** inline action per row (the single most useful next
step given state); everything else moves into an overflow `⋯` menu. Inline panels
(publish form, failure reason, delete confirm) stay as today — they open **below the
row**, triggered either by the inline button or a menu item.

### 4.1 Inline primary action by state
| Video state | Inline primary button | Variant |
|---|---|---|
| `processingStatus READY` & not `PUBLISHED` | **Publish** | `default` (pink); toggles the inline `PublishForm` panel, `aria-expanded` kept |
| `publicationStatus PUBLISHED` | **Watch** | `secondary`, `asChild` → `/watch/{slug}` |
| `processingStatus FAILED` | **Re-upload** | `default`, `asChild` → `/studio/upload` |
| `PENDING` / `UPLOADING` / `PROCESSING` | *(no inline button)* — status chip + note carry it | — |

### 4.2 Overflow menu (`⋯`) — new component, `ContentRowMenu`
Icon-only `Button variant="ghost" size="icon"` with `MoreVertical`, `aria-label="More actions for {title}"`. Built on **Radix DropdownMenu** (see §7 — new wrapper to add to `components/ui`). Items are state-aware; hide (don't just disable) what doesn't apply, **except** destructive/blocked items which are disabled with a reason (hidden UI is never authorization, but a menu is a contextual surface — items that are impossible for the state are omitted):

| Menu item | Icon | Shown when | Behavior |
|---|---|---|---|
| Watch | `Play` | PUBLISHED (and not already the inline primary) | link to `/watch/{slug}` |
| Publish | `Send` | READY & not PUBLISHED (when inline primary is something else) | opens inline PublishForm |
| View failure reason | `AlertCircle` | FAILED | opens inline `FailureReason` panel |
| Re-upload | `UploadCloud` | FAILED (when inline primary is something else) | link to `/studio/upload` |
| Edit details | `Pencil` | always | **disabled**, tooltip/`title` "Editing is coming soon" (backend blocked, §8) |
| Change visibility | `Eye` | PUBLISHED or UNPUBLISHED | **disabled**, "Coming soon" (backend blocked, §8) |
| Unpublish | `EyeOff` | PUBLISHED | **disabled**, "Coming soon" (backend blocked, §8) |
| — separator — | | before delete | |
| Delete | `Trash2` | always | `text-destructive`; opens inline `DeleteConfirm` panel |

> Keeping the disabled-but-visible "Edit / Change visibility / Unpublish" items is a
> deliberate signpost: §3.4 of the spec promises them, and showing them disabled with
> "coming soon" sets expectations without implying they work. They are **not** a
> security boundary — the server still authorizes every mutation.

### 4.3 Inline panels (unchanged behavior, restyled container)
`PublishForm`, `FailureReason`, `DeleteConfirm` keep their current logic and open in a
panel **below** the row (full row width on desktop, full card width on mobile).
Containers keep the existing styles (`rounded-media border bg-surface p-4`, destructive
tint for reason/delete). Only one panel open at a time per row (existing `OpenPanel`
state). When a panel is opened from the overflow menu, move focus into the panel's first
control; on close, return focus to the `⋯` trigger (Radix handles menu→trigger return;
the engineer wires panel→trigger).

---

## 5. Filter / search / sort UX

### 5.1 Status filter — segmented tabs (new `SegmentedTabs` / Radix Tabs)
The six spec §3.4 filters: **All · Published · Draft · Processing · Failed · Unpublished**.
- Pattern: a segmented control (Radix `Tabs` or a `role="tablist"` of toggle buttons). Visual: a pill group on `--surface-2`, active tab gets a pink underline/fill marker + `aria-selected`.
- Selecting a tab sets the query status and **resets `page` to 1** (important: current code keys the query by `page` only; adding a filter means the query key and reset must include the filter).
- Default tab: **All**.
- Horizontal scroll is **not** used; on narrow screens the tablist wraps (`flex-wrap`) — consistent with the learned fix for the genre filter row (pills wrap, never a horizontal scrollbar).

**Backend mapping caveat (must read):** `listCreatorVideos` accepts `status?: PublicationStatus`
only. The tabs map cleanly for **All / Published / Draft / Unpublished** (pass the matching
`PublicationStatus`, or omit for All). **Processing** and **Failed** are
`processingStatus` values, and `PublicationStatus` has a `PROCESSING` and `FAILED` member
too — confirm with backend which field the `status` query param filters. Two options, pick per backend reality:
- **If the API filters by `publicationStatus`:** All/Published/Draft/Unpublished/Processing/Failed all map to a `PublicationStatus` value — ship all six tabs live.
- **If not (or ambiguous):** ship All/Published/Draft/Unpublished live; render Processing/Failed tabs but have them filter the current page client-side on `processingStatus` as an interim, and flag to backend. Do **not** silently drop them — §3.4 requires them.

This is the one ambiguity worth flagging (see §8 open questions); the layout is identical either way.

### 5.2 Empty-of-filter state
When a filter/search yields zero rows but the creator *has* content, show a distinct
"no matches" empty state **inside** the Card (not the first-run empty state), with copy
"No {Published} videos yet" / "No results for '{query}'" and a `Clear filters` button that
resets tabs+search to All. The first-run empty state (§ below) is only for a truly empty
account on the All tab, page 1.

### 5.3 Sort — dropdown menu (new, same `DropdownMenu` primitive)
Button "Sort: Newest ▾". Options: **Newest**, **Oldest**, **Most viewed**, **Title A–Z**.
Default **Newest** (matches current "newest first" server order).
- Selected option marked with a check; `aria-label` on the trigger reflects current sort.
- **Backend blocked:** `listCreatorVideos` has no `sort` param (unlike public `listVideos`). Until it does, either (a) hide the Sort control, or (b) show it and sort the current page client-side (works within a page only, misleading across pages). **Recommendation: ship the control disabled with "Sorting coming soon", or omit, until the endpoint gains a `sort` param.** Flag in §8.

### 5.4 Search
`Input` + leading `Search` icon, debounced (~300ms), clears with an `X` end-adornment.
- **Backend blocked:** there is no creator-content search endpoint (`api.search` only
  searches *published public* videos). Options: (a) client-side filter of the loaded page
  by title (cheap, page-scoped only), or (b) wait for a `q` param on `/creator/videos`.
  **Recommendation: ship search as a page-scoped client-side title filter now** (clearly
  useful on a 20-item page), labeled so expectations are set, and request a server `q`
  param. Flag in §8.

---

## 6. Breakpoints & responsive rules

| Breakpoint | Layout |
|---|---|
| `< sm` (mobile) | Container full-width w/ page padding. Toolbar: tabs wrap to line 1, search full-width line 2, sort full-width line 3 (or sort folded into an icon button). Rows = stacked cards (§3.3). Thumbnail 80×45. Primary action full-width within the card. |
| `sm`–`md` | Tabs on one line (wrap if needed), search + sort share a line. Rows still stacked cards until `md`. |
| `≥ md` | Rows become the aligned grid table (§3.1); column header row appears. Toolbar single line: tabs left, search + sort right. |
| `≥ lg` | Container `max-w-6xl` centered; comfortable column widths. |

- No horizontal scroll anywhere (tabs wrap; table collapses to cards rather than scrolling).
- Sticky toolbar uses `top-0` relative to the studio content scroll area; verify against the studio shell's scroll container.

---

## 7. Component inventory (mapped to existing; new ones flagged)

### Reused as-is
| Component | Path | Role here |
|---|---|---|
| `Button` | `components/ui/button.tsx` | Upload (default), row primary (default/secondary), Refresh (ghost), pagination (secondary), menu trigger (ghost/icon) |
| `Card` | `components/ui/card.tsx` | table/list container |
| `Input` | `components/ui/input.tsx` | search field |
| `Badge` | `components/ui/badge.tsx` | AI pill (`variant="signal"`) |
| `ProcessingBadge` / `PublicationBadge` | `features/videos/components/status-badge.tsx` | status column chip |
| `PublishForm` | `features/upload/components/publish-form.tsx` | inline publish panel (unchanged) |
| `RequireCreator` | `features/auth/components/require-creator.tsx` | gate (unchanged) |
| `FailureReason`, `DeleteConfirm` | in `creator-content-list.tsx` | inline panels (restyle container only) |

### New — to build (small, generic, belong in `components/ui`)
| New component | Built on | Purpose | Notes |
|---|---|---|---|
| `DropdownMenu` wrapper | **Radix `@radix-ui/react-dropdown-menu`** + Lucide | overflow row menu (§4.2) and Sort menu (§5.3) | Standard shadcn/ui dropdown: `DropdownMenu`, `Trigger`, `Content`, `Item`, `CheckboxItem`/`RadioItem`, `Separator`, `Label`. Styled with existing tokens (`bg-popover`, `border-border`, `rounded-md`, pink focus). **Confirm Radix dropdown-menu is installed; add if missing.** |
| `SegmentedTabs` (status filter) | **Radix `@radix-ui/react-tabs`** *or* a `role="tablist"` button group | status filter (§5.1) | If a `Tabs` primitive already exists elsewhere, reuse it; otherwise a lightweight toggle-button group with `aria-selected` is sufficient and avoids a dependency. Pills on `--surface-2`, active = pink marker. |
| `ContentRowMenu` | the `DropdownMenu` wrapper | the per-row `⋯` menu with the state-aware item set (§4.2) | feature component in `features/videos/components`; pure presentation + callbacks, no data fetching |
| `ContentToolbar` | `SegmentedTabs` + `Input` + Sort `DropdownMenu` | the toolbar region (§2.2) | feature component; owns the controlled filter/search/sort state lifted into `ContentBody` |

### Changed (restyle, same behavior)
| File | Change |
|---|---|
| `app/studio/content/page.tsx` | container `max-w-5xl` → `max-w-6xl`; add `UploadCloud` icon to the Upload button |
| `features/videos/components/creator-content-list.tsx` | row layout → responsive grid/card (§3); status column shows one chip (§3.1); actions → inline primary + `ContentRowMenu` (§4); add toolbar + filter/search/sort state (§5); skeleton redesigned (§ below); filtered-empty state (§5.2); query key & reset include the active filter |

---

## 8. State matrix

| State | Trigger | Design |
|---|---|---|
| **loading (first load)** | `query.isPending` | Skeleton that **matches the new table**: a faint column-header bar + 5 skeleton rows, each with a 112×64 thumbnail block, two text lines (title + meta), a status pill block, a views block, an action block. `aria-busy="true"`, `role="status"`, muted "Loading your content". On mobile, skeleton stacks like the cards. (Current skeleton is 5 plain bars — replace it.) |
| **loading (refetch / filter change)** | `query.isFetching` with `placeholderData` | Keep previous rows visible; `Refresh` icon spins (existing); optionally dim the list `opacity-60` + `aria-busy`. No full skeleton flash (keeps `keepPreviousData`). |
| **empty — first run** | `videos.length === 0 && page === 1 && filter All && no search` | Dashed-border panel inside the content area: `Film` icon, "Nothing here yet. Upload your first film to get started." + a `Upload content` primary button (give the empty state the CTA, not just the header). |
| **empty — filtered/no match** | zero rows but account has content, or active search | §5.2 panel: "No {status} videos" / "No results for '{q}'" + `Clear filters` secondary button. Distinct from first-run. |
| **error — initial (no data)** | `query.isError && !data` | Existing centered `role="alert"` block: `AlertCircle text-destructive`, message via `errorMessage(...)`, `Try again` secondary button. Keep. |
| **error — refetch (stale data shown)** | `query.isError && data` | Existing inline `role="alert"` destructive line above the list; rows stay visible. Keep. |
| **populated** | rows present | §2–§4 layout. |
| **row: publishing** | PublishForm submit | existing inline form spinner/disabled (unchanged). |
| **row: deleting** | DeleteConfirm | existing destructive confirm + spinner (unchanged). |
| **row: processing/uploading** | polled | existing `POLL_INTERVAL_MS` polling stays; status chip + note update; list-level `aria-live` announces READY/FAILED transitions (unchanged). |
| **permission** | `RequireCreator` | gate unchanged; non-creators never reach the list. |

---

## 9. Accessibility (WCAG 2.2 AA)

- **Landmarks/headings:** page `h1` "My Content" stays the only `h1`. The toolbar is a `<div role="search">`-free plain region; the search `Input` has an associated visually-hidden `Label` or `aria-label="Search your content"`. Column-header row is decorative on desktop — if implemented as a grid of `div`s, hide from a11y tree (`aria-hidden`) and rely on per-cell context; if a real table semantics is preferred, use `role="table"/"row"/"columnheader"/"cell"`. **Recommendation:** keep the current list semantics (`<ul>`/`<li>`) with the grid purely visual, and make each row's accessible content read naturally (title, status label, views, actions) — screen readers get the badge text labels already.
- **Tabs (status filter):** `role="tablist"` with `role="tab"` + `aria-selected`; arrow-key roving tabindex (Radix Tabs gives this free). The active filter must be programmatically determinable, not color-only — the selected tab has `aria-selected="true"` plus the pink marker.
- **Dropdown menus (overflow + sort):** Radix handles `aria-haspopup`, `aria-expanded`, focus trap within the menu, arrow-key navigation, `Esc` to close, and focus return to the trigger. Each icon-only trigger has an `aria-label`. Menu items that are disabled use `aria-disabled` + a `title`/tooltip reason (not color-only).
- **Icon-only controls:** `⋯` trigger, Refresh (has visible text today — keep), search clear `X` → all need accessible names (`aria-label`).
- **Status not by color alone:** every badge keeps its text label; FAILED/PROCESSING also carry a Lucide icon. The "—" for views is textual.
- **Inline panels:** opening a panel from the menu moves focus to the panel's first field; closing returns focus to the `⋯` trigger. Delete confirm's destructive button is reachable and clearly labelled; `DeleteConfirm` copy already states irreversibility.
- **Live region:** the existing `role="status" aria-live="polite"` transition announcer is preserved verbatim and sits at the top of the list region.
- **Reduced motion:** spinners (`RefreshCw`, publish/delete `Loader2`) already carry `motion-reduce:animate-none`; the skeleton `animate-pulse` must too (add `motion-reduce:animate-none`).
- **Keyboard order:** header Upload → tabs → search → sort → Refresh → row 1 (primary action → `⋯`) → … → pagination. No positive `tabindex`.
- **Zoom/reflow:** at 200% / 320px CSS width the table collapses to the mobile card layout (it already does at `< md`), so no two-dimensional scroll.
- **Contrast:** reuse existing token pairings only (all meet AA at the given opacities per S5); no new low-contrast combinations introduced.

---

## 10. Open questions / assumptions

1. **`/creator/videos` `status` param semantics** — does it filter by `publicationStatus` or `processingStatus`? This decides whether the **Processing** and **Failed** tabs filter server-side or need an interim client-side filter. *Assumption: filters by `publicationStatus`; Processing/Failed handled client-side on the current page until confirmed. Proceed, flag to backend.* **(Only question that materially changes the data wiring.)**
2. **Sort** — no `sort` param on `listCreatorVideos`. *Assumption: ship Sort disabled ("coming soon") or omit until the endpoint supports it. Proceed.*
3. **Search** — no creator-content search endpoint. *Assumption: page-scoped client-side title filter now; request a server `q` param. Proceed.*
4. **Edit / Change visibility / Unpublish** — no `updateVideo`/`unpublish`/`setVisibility` client methods or endpoints. *Assumption: show as disabled menu items ("coming soon") to honor §3.4's promise without implying they work. Proceed.*
5. **Radix `dropdown-menu` / `tabs` install status** — assumed addable; confirm they're in `package.json` or add them. *Proceed.*
6. **Replace a video file** (§3.4) — treated as "Re-upload" → `/studio/upload` (existing FAILED path), since there is no in-place replace endpoint. *Assumption, proceed.*

---

## 11. Handoff block (for frontend-engineer)

**Scope:** restyle `features/videos/components/creator-content-list.tsx` and widen the
`app/studio/content/page.tsx` container. **Keep all data/behavior**: TanStack Query wiring,
`POLL_INTERVAL_MS` polling, `listCreatorVideos`/`publishVideo`/`deleteVideo`/
`getProcessingStatus`, the `PublishForm`/`FailureReason`/`DeleteConfirm` inline panels, and
the `aria-live` transition announcer.

**Layout:** header (h1 + pink `Upload content` w/ `UploadCloud`) → sticky toolbar
(status tabs · search · sort) → result-meta row (count + Refresh) → `Card` with a
responsive table → pagination. Container `max-w-6xl`.

**Row (desktop ≥ md):** grid `grid-cols-[7rem_minmax(0,1fr)_10rem_6rem_auto]`,
`items-center`, `px-5 py-4`, `hover:bg-accent/40`; columns = thumbnail / title+meta /
**one** status chip (ProcessingBadge while not READY, else PublicationBadge) / views
(`—` when not PUBLISHED) / actions. A muted uppercase column-header row at the top
(`hidden md:grid`, visually decorative).

**Row (mobile < md):** stacked card — thumb(80×45)+title+meta, `⋯` top-right, status+views
line, full-width primary action; `md:hidden`.

**Action model:** exactly one inline primary per state — Publish (READY, not published) /
Watch (PUBLISHED) / Re-upload (FAILED) / none (in-flight). Everything else in a new
`ContentRowMenu` (`⋯`, Radix DropdownMenu): Watch, Publish, View reason, Re-upload, Edit
(disabled), Change visibility (disabled), Unpublish (disabled), separator, Delete
(destructive). Inline panels open below the row; focus into panel on open, back to trigger
on close.

**Filter/search/sort:** segmented status tabs **All·Published·Draft·Processing·Failed·
Unpublished** (Radix Tabs or `role=tablist` button group; wrap, never scroll; selecting
resets `page` to 1 and is part of the query key) · debounced search `Input` + `Search`
icon · Sort `DropdownMenu` (Newest/Oldest/Most viewed/Title A–Z).

**New components to build:** `DropdownMenu` wrapper (`components/ui`, Radix
dropdown-menu) · `SegmentedTabs`/tablist for the status filter · `ContentRowMenu`
(`features/videos/components`) · `ContentToolbar` (`features/videos/components`). Confirm
Radix `dropdown-menu`/`tabs` are installed; add if missing.

**States:** redesign the skeleton to match the table (header bar + 5 rows w/ thumb/2
lines/status/views/action blocks, `motion-reduce:animate-none`); keep both error states;
split empty into first-run (with Upload CTA) vs filtered/no-match (with Clear filters);
`keepPreviousData` during refetch/filter (no skeleton flash, spin Refresh).

**Breakpoints:** `<md` stacked cards; `≥md` grid table + header row; `≥lg` `max-w-6xl`;
toolbar single line `≥md`, wraps below. No horizontal scroll.

**A11y:** single `h1`; tabs `role=tablist`/`aria-selected` + roving focus; Radix menus give
`aria-haspopup`/expanded/focus-return/Esc; icon-only controls (`⋯`, search clear) get
`aria-label`; disabled menu items `aria-disabled` + `title` reason; status always color +
text (+icon for FAILED/PROCESSING); `—` views are textual; preserve the `aria-live`
announcer; add `motion-reduce:animate-none` to the skeleton; 200%/320px collapses to the
card layout.

**Design-ready now (live endpoints):**
- Status tabs **All / Published / Draft / Unpublished** → `listCreatorVideos({ status })`.
- Row **Publish** → `publishVideo`; **Delete** → `deleteVideo`; **View reason** →
  `getProcessingStatus`; **Watch**/**Re-upload** → links. Pagination, polling, refresh.
- Full visual redesign (layout, row grid/card, toolbar shell, overflow menu, skeleton,
  empty/error states).

**Blocked on a missing backend endpoint (ship per §5/§8 assumptions, flag to backend):**
- **Processing / Failed tabs** filtering server-side — depends on what `/creator/videos`
  `status` filters (Q1). Interim: client-side on the current page.
- **Sort** — no `sort` param on `listCreatorVideos`. Ship disabled/"coming soon" or omit.
- **Search** — no creator-content search endpoint. Ship as page-scoped client-side title
  filter; request a server `q` param.
- **Edit details / Change visibility / Unpublish / Replace file** — no endpoints/client
  methods. Show as disabled "coming soon" menu items (Replace → Re-upload link interim).

**Reused tokens/variants:** pink `--primary` for the Upload + row Publish + active tab +
focus ring; `success/warning/destructive` only via existing `Badge` variants (+ icon +
text); `--signal` violet only for the AI pill. Radii: controls `--radius`, thumbnail/media
`--radius-media`. **No new colors, gradients, glass, heavy shadows, or animation.**
