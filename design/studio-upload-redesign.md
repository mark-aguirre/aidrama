# AI Drama — Creator Studio "Upload content" Redesign

**Route:** `/studio/upload`
**Shell:** `frontend/src/app/studio/upload/page.tsx`
**Component under redesign:** `frontend/src/features/upload/components/upload-wizard.tsx` and its sub-components (`drop-zone.tsx`, `upload-details-form.tsx`, `thumbnail-picker.tsx`, `stage-checklist.tsx`, `publish-form.tsx`, `upload-failure-panel.tsx`)
**Status:** design handoff for frontend-engineer
**Author:** ui-ux-designer
**Spec source:** `spec.md` §3.7 (Upload Management), §3.8 (Processing)
**Builds on:** `design/mvp-slice-states.md` §2 / §S4 (upload wizard states) and `design/studio-content-redesign.md` (sibling Studio page visual language). This doc **extends** both; it does not contradict them.

> **Design task only.** This is a presentation specification. It redesigns the
> layout, hierarchy, and visual treatment around an existing, working state
> machine. **Do not change the data flow.** The `useUploadFlow` hook, its phases
> (`idle · selected · pending · uploading · processing · ready · published ·
> failed`), the reducer, the TanStack Query polling, `createVideo`/
> `initiateUpload`/`putFileToSignedUrl`/`completeUpload`/`getProcessingStatus`/
> `publishVideo`, the abort/cancel/retry logic, the `sr-only aria-live`
> announcer, and the `role="progressbar"` semantics are all kept exactly as they
> are. Only the surface around them changes.
>
> **No phases are invented.** The visible stepper is a *projection* of the eight
> real phases onto five labels; it never implies a step the machine cannot reach
> (see §3). Nothing in this redesign requires a new endpoint or new data — every
> value shown already exists in `state`, `statusQuery`, `details`, or `failure`.

---

## 0. Why redesign

The current wizard is a vertical stack of unframed blocks inside a `max-w-2xl`
column: a drop zone, then (depending on phase) a file row, a details form, a
progress bar, a checklist, a processing paragraph, a failure panel, a publish
form. It is functionally complete but reads as a pile — there is no sense of
"where am I in this flow," no single framed surface, and the current action does
not stand out from the supporting text. Compared to the just-redesigned sibling
`/studio/content`, it looks unfinished.

Goals, in priority order:
1. **Progress legibility** — a persistent stepper (Select → Details → Upload → Process → Publish) so the user always knows where they are and what is left.
2. **One obvious current action** — each phase has exactly one primary button; supporting links/cancels are visually subordinate.
3. **Framed, premium surface** — the wizard lives on a single `Card` with a consistent header, not loose blocks, matching the sibling page's Card language.
4. **Polished drop zone** — distinct idle / drag-over / file-selected treatments.
5. **Confident progress + processing** — a calm, reassuring upload and transcoding presentation (bar, percent, checklist, cancel, "you can leave").
6. **Zero new colors** — reuse `--primary`, existing `Badge` variants, `--signal` for the AI label only, `--success`/`--warning`/`--destructive` via existing patterns.

---

## 1. Ground rules carried over (source of truth)

### Tokens (`globals.css`) — reuse only, no new colors
| Token | Value | Use here |
|---|---|---|
| `--background` | `#0a0a0d` | page base |
| `--surface` / `--surface-2` | `#131318` / `#1b1b22` | Card body, inset panels, stepper track |
| `--card` | `#131318` | wizard Card surface |
| `--foreground` / `--muted-foreground` | `#f5f5f7` / `#a3a3b2` | primary / secondary text |
| `--primary` | `#ff3d71` (hot pink) | primary action, progress-bar fill, active stepper node, focus ring |
| `--signal` | `#b46cff` (violet) | **AI-generated label only** (`Badge variant="signal"`) |
| `--success` | `#4ade80` | READY / done (via existing patterns + icon) |
| `--warning` | `#fbbf24` | PROCESSING (via `ProcessingBadge`) |
| `--destructive` | `#f0616d` | FAILED / errors (via existing failure panel + `Badge`) |
| `--border` / `--input` / `--ring` | `#26262f` / `#2a2a34` / pink | borders, field border, pink focus ring |
| `--radius` / `--radius-media` | `0.5rem` / `0.625rem` | controls / media & inset surfaces |

Fonts: `.font-display` (Jakarta, heavy, tight) for the page `h1` and step headings; body Jakarta. Serif `font-editorial` is **not** used here (reserved for featured titles).

### Component vocabulary already present (reuse)
- `Button` (default, secondary, outline, ghost, destructive, link; sizes default/sm/lg/icon) — `components/ui/button.tsx`
- `Badge` (default, secondary, outline, success, warning, destructive, signal) — `components/ui/badge.tsx`
- `Card` (`rounded-lg border border-border/70 bg-card`) + `CardHeader`/`CardContent` — `components/ui/card.tsx`
- `Input`, `Label`, `Select` — `components/ui`
- `Field` (labelled input + `aria-describedby` error) — `features/auth/components/field.tsx`
- `ProcessingBadge` / `PublicationBadge` — `features/videos/components/status-badge.tsx` (covers PENDING/UPLOADING/PROCESSING/READY/FAILED)
- `RequireCreator` — gate (unchanged)
- Lucide icons already in use here: `UploadCloud`, `FileVideo`, `ImagePlus`, `Loader2`, `CheckCircle2`, `AlertCircle`, `X`.

### Accessibility baseline (applies to every surface below)
- Visible focus is the global pink ring (`focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`), already on `Button`. Every new focusable control keeps it.
- **Never signal state by color alone** — each status pairs color + icon + text label (existing `ProcessingBadge`, `StageChecklist`, failure panel).
- Reduced motion is stripped globally; existing spinners/pulses carry `motion-reduce:*`. Any new animation (progress fill, stepper transition) keeps the same guard.
- Errors are associated to their field via `aria-describedby` + `aria-invalid` (existing `Field` / `Select` / `ThumbnailPicker` pattern).
- The existing `sr-only role="status" aria-live="polite"` phase announcer **stays verbatim** and keeps narrating phase changes.

---

## 2. Page layout

Match the sibling `/studio/content` page language: a header row (h1 + muted
subline) above the working surface, inside a widened centered container. The
upload flow is a single guided column, so the container widens only modestly.

```
┌──────────────────────────────────────────────────────────────┐
│  Upload content                                                │  ← header (h1 + subline), in page.tsx
│  Upload an AI-generated video. It's transcoded to a            │
│  streaming format before you can publish it.                   │
├──────────────────────────────────────────────────────────────┤
│  ①───②───③───④───⑤   Select · Details · Upload · Process · Publish │  ← stepper (new), full width of the Card header
├──────────────────────────────────────────────────────────────┤
│  ╭──────────────────────────────────────────────────────────╮ │
│  │  [ current-phase heading ]                                │ │  ← wizard Card body
│  │                                                           │ │
│  │  …phase content (drop zone / form / progress / etc.)…     │ │
│  │                                                           │ │
│  │  [ one primary action ]        secondary / cancel         │ │
│  ╰──────────────────────────────────────────────────────────╯ │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 Container
- `app/studio/upload/page.tsx`: widen `max-w-2xl` → **`max-w-3xl`** (`~48rem`). The flow stays single-column and guided; 3xl gives the details form and processing panel breathing room and a two-column field grid at `≥ sm` (see §6) without feeling sparse. Centered `mx-auto` with page padding.
- Keep `font-display text-3xl` h1 "Upload content" + the existing muted subline, in the header (server component), matching the sibling page's header rhythm (`mb-6`).

### 2.2 Wizard surface (new framing)
- The wizard renders inside **one `Card`** (`rounded-lg border border-border/70 bg-card`), replacing the current loose `flex flex-col gap-6` stack.
- **Card header region:** the stepper (§3) sits in a `CardHeader`-equivalent band with a bottom `border-border/70`, padding `p-5 sm:p-6`.
- **Card body:** `p-5 sm:p-6`, `flex flex-col gap-6`. Contains the current-phase content. One phase block is visible at a time (the machine only ever renders one primary surface); the file summary row (§4.2) persists above the body content once a file exists, as a compact inset.
- **Step heading:** each phase body opens with an `h2` (`font-display text-lg`) naming the current step ("Choose your video", "Add details", "Uploading", "Processing", "Ready to publish", "Published", or the failure heading). This gives the flow a heading outline and a focus target (§7). The `h2` is visually present, not sr-only.

### 2.3 Action placement convention
- **Exactly one primary** (`Button` default = pink) per phase, bottom-left of the Card body (`self-start`), matching the current `self-start` buttons.
- **Secondary / destructive / links** sit to the right of or below the primary, visually subordinate (`variant="secondary"`, `ghost`, or `link`). Cancel-upload stays a `ghost` button with destructive text (existing).
- Never two pink buttons in one phase.

---

## 3. The stepper (NEW component: `UploadStepper`)

A persistent horizontal progress indicator in the Card header. It is the single
biggest "feels guided/premium" change. It is **presentation only** — it reads
the current `phase` and renders derived step state; it dispatches nothing.

### 3.1 The five visible steps ← eight real phases
The state machine has eight phases but the user mentally moves through five
stages. Map phases → steps as a pure function; **do not add phases**:

| Visible step | Label | Active when `phase` ∈ | Complete when `phase` ∈ |
|---|---|---|---|
| ① | **Select** | `idle` | `selected`, `pending`, `uploading`, `processing`, `ready`, `published` (any time a file is chosen or beyond) |
| ② | **Details** | `selected` | `pending`, `uploading`, `processing`, `ready`, `published` |
| ③ | **Upload** | `pending`, `uploading` | `processing`, `ready`, `published` |
| ④ | **Process** | `processing` | `ready`, `published` |
| ⑤ | **Publish** | `ready` | `published` |

- `failed`: the stepper marks the **step where it stopped** as errored and freezes the rest as "not reached". Derive the errored step from `failure.at` / `failure.stage`:
  - `failure.at === "PENDING"` or `"UPLOADING"` (stage `"upload"`) → step ③ **Upload** errored.
  - `failure.at === "PROCESSING"` (stage `"processing"`) → step ④ **Process** errored.
  Steps before the errored one stay complete; steps after stay upcoming.
- `published`: all five steps complete (⑤ shows done).

> This mapping uses only values already in `state.phase`, `state.failure`. No
> new data. `selected` with a saved draft (the "draft exists" branch) is still
> step ② Details active — the user is confirming details before starting.

### 3.2 Visual treatment (per node)
Each node = a small circle + label beneath/beside, connected by a track segment. Three (plus one) states, each **color + shape/icon + text**, never color alone:

| Node state | Circle | Label | Connector to next |
|---|---|---|---|
| **complete** | filled `bg-primary`, `CheckCircle2`-style check (or `✓`), `text-primary-foreground` | `text-foreground` | `bg-primary` (filled) |
| **active** (current) | `border-2 border-primary` ring, pink, `animate-pulse` (reduced-motion: static ring + bold label) | `text-foreground font-medium` | upcoming styling |
| **upcoming** | `border border-border` empty, step number in `text-muted-foreground` | `text-muted-foreground` | `bg-border` (muted) |
| **errored** | `border-2 border-destructive`, `AlertCircle` `text-destructive` | `text-destructive` | track to next stays muted |

- The circle carries a number (upcoming) or a check (complete) or an alert (errored) so state is never conveyed by color alone.
- Node size `size-8`; connector `h-0.5 flex-1`; the whole strip `flex items-center` with labels in a row below each node on desktop.
- Container background `bg-surface-2` is optional; default is transparent on the Card header. Keep it calm — no gradient, no glow.

### 3.3 Stepper responsive behavior
- **≥ `sm`:** full horizontal strip, five nodes + connectors, labels under each node (`text-xs`, centered). `text-xs` labels wrap to one short line.
- **< `sm` (mobile):** collapse to a compact single-line indicator to avoid five cramped labels:
  - Show the five circles + connectors (compact, `size-6`, no per-node label), plus one line of text below: **"Step 3 of 5 · Upload"** (`text-sm`, current step label from the active node). This keeps progress legible without horizontal scroll.
  - If even the five compact circles are tight at 320px, drop to the text line alone ("Step 3 of 5 · Upload") plus a thin 5-segment progress rail. Either is acceptable; no horizontal scroll.
- The stepper never scrolls horizontally and never wraps to a second row of nodes.

### 3.4 Stepper accessibility
- Wrap in `nav aria-label="Upload progress"` containing an ordered list `ol`.
- Each node: `li` with its label as real text. The active node carries `aria-current="step"`. Complete/upcoming/errored states are conveyed by the visible icon + text label (`"Select — done"`, `"Upload — current"`, `"Process — not started"`, `"Upload — error"`) — expose that word via an `sr-only` suffix so screen readers get the state, not just the label.
- The stepper is **not** interactive (no clickable steps — the machine can't jump arbitrarily). Nodes are not buttons/links; they are status text. This avoids implying navigation the flow doesn't support.
- The stepper does **not** replace or duplicate the existing `sr-only aria-live` phase announcer; the announcer keeps narrating transitions politely. The stepper is a static snapshot updated each render.

---

## 4. Phase-by-phase visual treatment

Each phase maps 1:1 to a real `phase` value from `useUploadFlow`. Column shows
the exact phase string. "Primary" = the single pink action.

### 4.0 Persistent elements across phases
- **Stepper** (§3) — always in the Card header.
- **`sr-only` live announcer** — unchanged, top of the wizard body.
- **File summary row** (§4.2) — present whenever `state.file` exists (selected → published, and failed), as a compact inset at the top of the Card body.
- **`state.fileError`** (`role="alert" text-destructive`) — rendered under the drop zone in idle when a picked file is rejected (unchanged behavior, see §5.2).

### 4.1 `idle` — choose a file
- **Step:** ① Select active.
- **Heading:** `h2` "Choose your video".
- **Body:** the redesigned `DropZone` (§5). This is the only content.
- **Primary:** `Choose file` (inside the drop zone; keyboard path).
- **Status chip:** none.

### 4.2 `selected` — file chosen, add details
- **Step:** ② Details active.
- **File summary row** (restyle of the current file card): an inset panel
  `rounded-media border border-border bg-surface p-4`, `flex items-center gap-3`:
  `FileVideo text-primary` · filename (truncate, `font-medium`, `title=`) + size
  (`formatMegabytes`, `text-xs text-muted-foreground`) · a `X` ghost icon button
  `aria-label="Remove file"` (only in `selected`). Keep exactly the current data.
- **Heading:** `h2` "Add details".
- **Body — two branches (both exist today):**
  - **Fresh file:** the redesigned `UploadDetailsForm` (§7-form, laid out per §6).
  - **Draft already exists** (`state.videoId !== null && details`): a confirmation line ("{title} · {typeLabel}. Details are saved with your draft video.") + primary `Start upload`. Keep this branch; restyle the line as `text-sm text-muted-foreground` and the button as the one primary.
- **`state.notice`** ("Upload cancelled.") renders here as `role="status" text-sm text-muted-foreground` above the form/confirmation (unchanged).
- **Primary:** `Start upload` (form submit, or the draft-branch button).
- **Status chip:** none.

### 4.3 `pending` — preparing the upload
- **Step:** ③ Upload active.
- **File summary row:** present, with **`ProcessingBadge status="PENDING"`** (secondary) on the right; no `X` remove (upload has started).
- **Heading:** `h2` "Starting upload".
- **Body:** the `StageChecklist` (status `PENDING`, stage 1 "Queued" active-pulse). A short muted line "Getting things ready…".
- **Secondary/cancel:** `Cancel upload` (`ghost`, destructive text, `aria-label="Cancel upload"`). This is the only action; there is no pink primary in this phase (the work is automatic).
- **Status chip:** PENDING (secondary) in the file row.

### 4.4 `uploading` — bytes moving
- **Step:** ③ Upload active.
- **File summary row:** present, with **`ProcessingBadge status="UPLOADING"`** (default/pink) on the right.
- **Heading:** `h2` "Uploading".
- **Body — progress presentation (§8):** the `role="progressbar"` bar (unchanged semantics) given a calmer, framed treatment; percent text; the `StageChecklist` with "Uploading" active.
- **Secondary/cancel:** `Cancel upload` (`ghost`, destructive text). Non-destructive (nothing published), so **no confirm dialog**.
- **Status chip:** UPLOADING (default).

### 4.5 `processing` — transcoding
- **Step:** ④ Process active.
- **File summary row:** present, with **`ProcessingBadge status="PROCESSING"`** (warning) on the right.
- **Heading:** `h2` "Processing".
- **Body — processing presentation (§8):**
  - The `StageChecklist` with "Transcoding to HLS" active (indeterminate — no byte %).
  - A reassurance block: `Loader2` spinner (`animate-spin motion-reduce:animate-none`) + "Processing" + the polled percent when `> 0` ("· {percent}%") — all existing. Below it, the reassurance line **"This can take a few minutes. You can leave this page."** given more visual weight (its own muted line, not buried).
  - The deep-link line: "Processing started. **View in My Content**" (`link` to `/studio/content`). Keep.
  - **Poll error** (`statusQuery.error`): the existing `role="alert"` destructive line "We couldn't check the processing status." + `Check again` (`secondary`, calls `statusQuery.retry`). Keep.
- **Primary:** none (automatic). The "View in My Content" link is the user's escape hatch — present it as a clear secondary affordance (`Button variant="secondary" size="sm" asChild` or a prominent link), not an afterthought.
- **Status chip:** PROCESSING (warning).

### 4.6 `ready` — ready to publish
- **Step:** ⑤ Publish active.
- **File summary row:** present, with **`ProcessingBadge status="READY"`** (success).
- **Heading:** `h2` "Ready to publish".
- **Body:** a success line `CheckCircle2 text-success` + "Your video is ready to publish." (unchanged). Then the redesigned `PublishForm` (genre + visibility selects, laid out per §6). 
- **Primary:** `Publish` (the form's submit, pink, with `Loader2` while submitting — unchanged).
- **Secondary:** `Upload another` (`secondary`, `self-start`, calls `flow.reset`). Place it below/after the publish form so it doesn't compete with Publish.
- **Status chip:** READY (success).

### 4.7 `published` — done
- **Step:** all five complete.
- **Heading:** `h2` "Published".
- **Body:** success line `CheckCircle2 text-success` + "Published. "{title}" is live." (unchanged copy). Present this as a confident completion state — the success line gets a little more prominence (e.g. the `h2` plus the success line), optionally with the thumbnail from `state.published` if cheaply available (not required; no new data fetch — only if `published` already carries it).
- **Actions (three, existing):** `Watch now` (**primary**, pink, `asChild` → `/watch/{slug}`), `View in My Content` (`secondary` → `/studio/content`), `Upload another` (`secondary`, `flow.reset`). Keep as a `flex flex-wrap gap-2` row; `Watch now` is the single pink primary.
- **Status chip:** none shown in header file-row for this phase (the success heading carries it); the existing code mapped `published → READY` chip — keep or drop the chip here, but the completion heading is the truth. **Recommendation:** drop the chip in `published` (the big success state is clearer than a small chip), keep the `h2` + success line.

### 4.8 `failed` — upload or processing failed
- **Step:** ③ Upload or ④ Process errored (per §3.1), rest frozen.
- **File summary row:** present, with **`ProcessingBadge status="FAILED"`** (destructive).
- **Heading:** the failure panel supplies its own heading ("Upload failed" / "Processing failed"); no separate `h2` above it (avoid duplicate headings — the panel's `h2`/heading is the step heading).
- **Body:** the `StageChecklist` with `failedAt` set (stops at the failed stage, `AlertCircle text-destructive`, "— failed" suffix — unchanged), then the redesigned `UploadFailurePanel` (§9).
- **Actions (in the panel, existing):** `Retry upload` / `Re-upload` (**primary**, calls `flow.start(details)`) and `Choose different file` (`secondary`, `flow.clearFile`). Retry is the first focusable control.
- **Status chip:** FAILED (destructive).

---

## 5. Drop zone states (`DropZone`, restyle)

Keep the component's behavior (drag handlers, hidden input, `Choose file` button
as the keyboard path, `ACCEPT_ATTRIBUTE`, format/size hint). Restyle for three
clear states. The drop zone appears only while `!state.file` (idle / rejected).

### 5.1 Idle
- Container: `rounded-media border-2 border-dashed border-border`, generous
  padding `py-14 sm:py-16` (slightly tighter than today's `py-20` so it fits the
  Card and mobile without over-dominating), `flex flex-col items-center gap-3 text-center`.
- `UploadCloud` icon `size-8 text-muted-foreground` (bump from default size for presence).
- Primary text `text-sm text-foreground` "Drag and drop a video, or choose a file." (promote from muted → foreground so it reads as the instruction, with the format line muted below).
- Hint `text-xs text-muted-foreground` "MP4, MOV, or WebM. Up to 2 GB." (unchanged copy).
- `Choose file` — pink `Button` (the one primary). Keep it visually centered and prominent.

### 5.2 Drag-over
- Add on `dragging`: `border-primary bg-accent/50` (existing) plus the `UploadCloud` icon and primary text shift to `text-primary`, and the primary text swaps to **"Drop to upload"** (a clear drag affordance). Reverts on `dragleave`/`drop`.
- No layout shift between idle and drag-over (same box size) to avoid jump.

### 5.3 Rejected (invalid file picked)
- The drop zone stays visible (user re-picks). Below it, the existing
  `state.fileError` `role="alert" text-sm text-destructive` message (e.g.
  "Unsupported format. Use MP4, MOV, or WebM.", "This file is larger than 2 GB.").
  Keep the message exactly; place it directly under the drop zone with `mt-*`.
- Optionally tint the drop-zone border `border-destructive/50` while a file error
  is present (mirrors the `ThumbnailPicker` error-border pattern) — color + the
  text alert, never color alone.

### 5.4 File-selected
- Not a drop-zone state — the drop zone is replaced by the file summary row (§4.2). Covered there.

---

## 6. Details form layout (`UploadDetailsForm` + `ThumbnailPicker`, restyle)

Keep the schema, fields, RHF+Zod wiring, and submit handler. Only improve
grouping, spacing, hint/validation placement, and responsive layout.

### 6.1 Grouping & order
Group into two visual sections within the form (plain spacing, no nested cards):

1. **About this video**
   - **Title** (`Field`, existing; label "Title", `maxLength={200}`, error via `aria-describedby`). Add a helper line under it when empty is fine — the field already suggests a title from the filename, so a muted hint "Pre-filled from the file name — edit as needed." clarifies the prefill. (Hint only; no behavior change.)
   - **Content type** (`Select`, existing; "Select a type" placeholder, error line). 
   - On `≥ sm`, Title and Content type sit in a **two-column grid** (`grid grid-cols-1 sm:grid-cols-2 gap-4`) — Title spans full width if preferred, Content type beside it, or Title full-width row 1 and Type on row 2 left. **Recommendation:** Title full-width (it's the most important and can be long), Content type on its own row at `sm` width (`max-w-xs`) so the select isn't absurdly wide. Keep single column `< sm`.

2. **Thumbnail & declaration**
   - **Thumbnail** (`ThumbnailPicker`, existing; required, 16:9 drop target → preview with Replace/Remove, hint "JPG, PNG, or WebP. Up to 5 MB. A 16:9 image looks best."). Keep as-is; it already matches the drop-zone visual language. Give it a section label context via the group.
   - **AI-generated** checkbox + hint (existing; "This video is AI-generated" / "Viewers see an AI label on videos with this declaration."). Keep the checkbox pattern. This is the only place `--signal` semantics are referenced — the label text explains the violet AI badge viewers will see; the checkbox itself uses `accent-primary` (existing), **not** violet.

- Separate the two groups with spacing (`gap-6` between groups, `gap-4` within). Optionally a small `text-xs uppercase tracking-wide text-muted-foreground` group label per section for scannability (consistent with the content page's column-header treatment). Keep it subtle.

### 6.2 Validation placement (keep existing mechanics)
- Field-level errors render **directly under each field**, `text-xs text-destructive`, associated via `aria-describedby` + `aria-invalid` (existing `Field` / `Select` / `ThumbnailPicker`). Do not move errors to a summary.
- Hints (prefill note, AI hint, thumbnail format hint) render under their field in `text-xs text-muted-foreground`, **always visible** (not only on error) — helps first-time uploaders.
- The required thumbnail keeps its `*` marker (`text-destructive`) in the label (existing).
- Submit (`Start upload`) is `self-start`, the one pink primary.

### 6.3 Form responsive
- `< sm`: single column, full-width fields, full-width-friendly submit (keep `size="default"`, `self-start`).
- `≥ sm`: the optional two-column grouping above; thumbnail picker keeps its `aspect-video` and caps its width (`max-w-md`) so the preview isn't oversized on the 3xl container.

---

## 7. Progress & processing presentation (the "confident" treatment)

Keep all semantics. This section is pure visual polish on `uploading` and
`processing`.

### 7.1 Upload progress bar (`uploading`)
- Keep the `role="progressbar"` + `aria-label="Upload progress"` + `aria-valuenow/min/max` wrapper and the `width: {progress}%` fill (`bg-primary transition-all motion-reduce:transition-none`). **Do not change these.**
- Restyle: slightly taller track (`h-2.5`), `rounded-full bg-muted`, and a header line above it that pairs the label with the number: **"Uploading" (left) · "{progress}%" (right)** in `flex items-center justify-between text-sm`, with `{progress}%` in `tabular-nums text-foreground` so it doesn't shift width as it counts. Remove the lone muted "{n}% uploaded" line in favor of this paired header (keeps one source of truth, aligned).
- The checklist sits below the bar.

### 7.2 Processing (`processing`)
- Indeterminate by nature (no byte %); the polled `statusQuery.percent` is shown when `> 0` as supplementary ("· {percent}%"), never as a progress bar (it's a transcode %, not deterministic UI progress). Keep it as the existing text.
- Presentation: a calm inset panel (`rounded-media bg-surface p-4` or plain within the Card) containing: the `Loader2` spinner + "Processing{· percent}" line, then the checklist, then the reassurance line, then the "View in My Content" link.
- **Reassurance is the emotional job of this phase** — make "This can take a few minutes. You can leave this page." clearly legible (`text-sm text-muted-foreground`, its own line, not crammed). The user must feel safe navigating away.
- Spinner respects reduced motion (`motion-reduce:animate-none`, existing); pair with the "Processing" text so motion isn't the only signal.

### 7.3 Stage checklist (`StageChecklist`, keep)
- Keep the component as-is — it already pairs icon + color + text and handles `failedAt`. It renders in `pending`, `uploading`, `processing`, `ready`, `failed` (anywhere `status` is non-null). No change beyond sitting inside the new Card body rhythm.

---

## 8. Success & failure treatments

### 8.1 Success — `ready` then `published`
- **`ready`** is a *mid-success* (asset is ready, not yet live): green check line + the publish form. Keep the publish action as the clear next step; `Upload another` is subordinate.
- **`published`** is the *terminal success*: confident completion. `CheckCircle2 text-success` + "Published. "{title}" is live." as the hero line (step heading + success line). Three actions with `Watch now` as the single pink primary. This is the natural end — give it a moment of finish (spacing, the success color on the icon), no confetti/animation.

### 8.2 Failure — `failed` (`UploadFailurePanel`, restyle)
- Keep the component's logic: it distinguishes `stage === "processing"` ("Processing failed" / "Re-upload") vs upload ("Upload failed" / "Retry upload"), shows `failure.message` verbatim with a non-blank fallback, shows `failure.requestId` as a reference, wraps in `role="alert"`, and makes Retry the first focusable control.
- **Restyle only:** keep the container `rounded-media border border-destructive/40 bg-destructive/10 p-4`, the `AlertCircle text-destructive` icon, heading `font-display text-base`. Ensure it sits well inside the Card body (consistent padding, `mt-*` from the checklist). The actions row `flex flex-wrap gap-2`: `Retry upload`/`Re-upload` (primary pink) + `Choose different file` (secondary).
- The stepper (§3.1) reflects *where* it failed (step ③ or ④ errored), so the panel explains *why* and the stepper shows *where* — complementary, no duplication.

---

## 9. Responsive rules & breakpoints

Single-column guided flow at all sizes; the container caps the width.

| Breakpoint | Layout |
|---|---|
| `< sm` (mobile) | Container full-width + page padding. **Stepper collapses** to compact circles + "Step N of 5 · {label}" line (§3.3). Card padding `p-5`. Drop zone `py-14`. Details form single column, full-width fields. Thumbnail picker full-width `aspect-video`. Progress header (label/percent) stays on one line. Action buttons wrap (`flex-wrap`); primary stays `self-start` but may go full-width-friendly. Published-state action row wraps to stacked buttons. |
| `sm`–`lg` | **Stepper full horizontal strip** with per-node labels. Card padding `p-6`. Details form may use the two-column grouping (§6.1). Thumbnail capped `max-w-md`. |
| `≥ lg` | Container `max-w-3xl` centered; comfortable single column; everything above at its roomy spacing. |

- **No horizontal scroll anywhere** — the stepper collapses rather than scrolls; the form stacks.
- **Zoom/reflow:** at 200% / 320px CSS width the stepper is in its compact form and the form is single-column, so there is no two-dimensional scrolling (WCAG 2.2 AA reflow).

---

## 10. Component inventory

### Reused as-is (behavior unchanged; restyle only where noted)
| Component | Path | Role here | Change |
|---|---|---|---|
| `UploadWizard` / `WizardBody` | `features/upload/components/upload-wizard.tsx` | orchestration + phase rendering | **Restyle:** wrap in `Card`, add stepper + step `h2`s, framed file row, action placement. **No data/flow change.** |
| `useUploadFlow` | `features/upload/hooks/use-upload-flow.ts` | state machine | **None** (read-only consumer). |
| `DropZone` | `features/upload/components/drop-zone.tsx` | idle/drag-over/rejected | **Restyle** (§5): icon size, promoted text, "Drop to upload" on drag, optional error border. Behavior unchanged. |
| `UploadDetailsForm` | `features/upload/components/upload-details-form.tsx` | details form | **Restyle** (§6): grouping, two-column at `sm`, prefill hint. Schema/wiring unchanged. |
| `ThumbnailPicker` | `features/upload/components/thumbnail-picker.tsx` | required thumbnail | **Keep**; cap width `max-w-md` at `≥ sm`. |
| `StageChecklist` | `features/upload/components/stage-checklist.tsx` | lifecycle checklist | **Keep as-is** (already icon+color+text, handles `failedAt`). |
| `PublishForm` | `features/upload/components/publish-form.tsx` | publish (genre+visibility) | **Restyle** spacing to match form (§6); wiring unchanged. |
| `UploadFailurePanel` | `features/upload/components/upload-failure-panel.tsx` | failure surface | **Restyle** container fit (§8.2); logic unchanged. |
| `ProcessingBadge` | `features/videos/components/status-badge.tsx` | phase status chip in file row | **Keep**; used in file summary row per phase. |
| `Button`, `Badge`, `Card`, `Input`, `Label`, `Select`, `Field` | `components/ui`, `features/auth` | primitives | **Keep.** |
| Lucide `UploadCloud`/`FileVideo`/`ImagePlus`/`Loader2`/`CheckCircle2`/`AlertCircle`/`X` | — | icons | **Keep**; stepper adds a check glyph (reuse `CheckCircle2` or `Check`). |

### New — to build
| New component | Built on | Purpose | Notes |
|---|---|---|---|
| **`UploadStepper`** | plain markup + Lucide (`CheckCircle2`/`Check`, `AlertCircle`), Tailwind tokens | the five-step progress indicator (§3) | **Pure presentation.** Props: `phase: UploadPhase` and the derived errored-step info (compute from `phase` + `failure.at`/`failure.stage` — pass `failure` or a precomputed `erroredStep`). No state, no dispatch. Lives in `features/upload/components`. Renders `nav > ol`, `aria-current="step"` on active, `sr-only` state suffixes, responsive collapse (§3.3). This is the **only** new component required. |

### Changed shells
| File | Change |
|---|---|
| `app/studio/upload/page.tsx` | container `max-w-2xl` → `max-w-3xl`; keep h1 + subline; render `UploadWizard` below in the widened container. (Header copy unchanged.) |

**No new `components/ui` primitives are needed** (unlike the content redesign,
there are no menus/tabs here). No Radix additions. No new dependency.

---

## 11. Accessibility (WCAG 2.2 AA)

- **Heading outline:** page `h1` "Upload content" stays the only `h1`. Each phase body opens with an `h2` step heading (§2.2), so the flow has a real outline. The failure panel's heading is the `h2` for the `failed` phase (no duplicate).
- **Focus movement between phases:** on each phase transition that changes the primary surface (idle→selected, selected→pending/uploading, →processing, →ready, →published, →failed), **move focus to the current step `h2`** (programmatic, `tabIndex={-1}`), so keyboard and screen-reader users land on the new step rather than losing focus when a button they were on unmounts. *Exception:* do **not** yank focus during the automatic `uploading`→`processing` churn if the user has navigated away within the Card; move focus only on phase changes the user initiated or on terminal states (`ready`, `published`, `failed`). Pair with the existing live announcer. *(If precise focus rules are ambiguous, the safe default: move focus to the step `h2` on `selected`, `ready`, `published`, and `failed`; rely on the live region for the in-flight `pending`/`uploading`/`processing` transitions.)*
- **Existing `sr-only aria-live="polite"` announcer:** kept verbatim; narrates "Uploading your video." / "Processing has started." / "ready to publish." / "published." / failure. The stepper is a visual complement, not a replacement.
- **Progress bar:** `role="progressbar"` + `aria-label` + `aria-valuenow/min/max` unchanged (§7.1).
- **Stepper:** `nav aria-label="Upload progress"` > `ol`; active node `aria-current="step"`; each node's state exposed as text (`sr-only` suffix "— done / current / not started / error"); nodes are non-interactive status, not links. Never color alone (number/check/alert icon + text).
- **Status not by color alone:** `ProcessingBadge` (color+text), `StageChecklist` (icon+color+text), failure panel (icon+heading+text), stepper (icon+number+text). All preserved.
- **Icon-only controls:** `X` remove (`aria-label="Remove file"`), `X` thumbnail remove (`aria-label="Remove thumbnail"`), cancel (`aria-label="Cancel upload"`) — all existing, kept.
- **Field errors:** associated via `aria-describedby` + `aria-invalid` (existing). Hints always visible (§6.2).
- **Failure panel:** `role="alert"` (announced on appearance); Retry is the first focusable control (existing).
- **Keyboard path for drop zone:** the `Choose file` button is the keyboard affordance (drag-drop is pointer-only enhancement) — kept visible and primary.
- **Reduced motion:** progress-fill transition, spinner, stepper active-pulse all carry `motion-reduce:*` guards; state is always also conveyed by text/icon, so no motion-only signalling.
- **Contrast:** reuse existing token pairings only (badges, destructive tint panel, muted text on surface) — all meet AA per the baseline in `mvp-slice-states.md`. No new low-contrast combinations; the promoted drop-zone instruction text moves muted→`text-foreground` (higher contrast, safe).
- **Keyboard order (selected phase example):** step `h2` → file row remove `X` → Title → Content type → thumbnail choose/replace → AI checkbox → `Start upload`. No positive `tabindex`.

---

## 12. Data / endpoint impact

**None.** This is a pure presentation redesign. Every value rendered already
exists in the current hook output:
- `state.phase`, `state.file`, `state.details`, `state.failure`, `state.notice`, `state.fileError`, `state.progress`, `state.videoId`, `state.published`
- `statusQuery.percent`, `statusQuery.error`, `statusQuery.retry`
- `flow.pickFile` / `start` / `cancel` / `clearFile` / `published` / `reset`

The new `UploadStepper` derives its entire display from `phase` (+ `failure`).
No new API call, no new field, no change to the reducer or query wiring. If the
engineer finds any proposed element needs data not listed above, **stop and flag
it** — it should not happen.

---

## 13. Open questions / assumptions

1. **Container width** — assumed `max-w-2xl` → `max-w-3xl` for breathing room while staying a single guided column (the sibling content page went to `max-w-6xl`, but that page is a wide table; this is a form flow, so 3xl is the right analog). *Assumption, proceed.*
2. **Stepper interactivity** — assumed **non-interactive** (status only), because the state machine cannot jump to an arbitrary phase. Not clickable, not links. *Assumption, proceed.*
3. **Focus-on-phase-change granularity** — moving focus to the step `h2` on user-initiated and terminal transitions, relying on the live region for automatic in-flight churn (§11). If product wants focus moved on *every* transition, it's a one-line change; the live announcer already covers the SR case either way. *Assumption, proceed with the conservative rule.*
4. **`published` status chip** — recommended dropping the small READY chip in the `published` phase in favor of the big success heading (the current code maps `published → READY` chip). *Recommendation; either is acceptable. Proceed with drop.*
5. **Two-column details grouping** — offered at `≥ sm` as polish; if the engineer prefers the simpler single-column form, that is acceptable and loses nothing functionally. *Assumption, proceed with the two-column option as default, single-column fallback fine.*

---

## 14. Handoff block (for frontend-engineer)

**Scope:** restyle the upload wizard presentation and widen the page container.
**Keep all data/behavior:** `useUploadFlow` (all eight phases, reducer, abort/
cancel/retry, TanStack polling, `createVideo`/`initiateUpload`/`putFileToSignedUrl`/
`completeUpload`/`getProcessingStatus`/`publishVideo`), the `role="progressbar"`
semantics, and the `sr-only aria-live` phase announcer. **No endpoint or data
change — §12.**

**Page layout:** `app/studio/upload/page.tsx` container `max-w-2xl` → `max-w-3xl`;
keep the `h1` "Upload content" + muted subline. Render `UploadWizard` on **one
`Card`** (`rounded-lg border border-border/70 bg-card`): a Card-header band with
the **stepper** (bottom-bordered, `p-5 sm:p-6`) over a Card body (`p-5 sm:p-6`,
`flex flex-col gap-6`) that holds the current phase, opened by an `h2` step
heading.

**Stepper (NEW `UploadStepper`, the only new component):** five visible steps
**Select · Details · Upload · Process · Publish** projected from the eight real
phases:
- Select active @ `idle`; Details active @ `selected`; Upload active @ `pending`/`uploading`; Process active @ `processing`; Publish active @ `ready`; all complete @ `published`.
- A step is complete once `phase` is past it; `failed` marks step ③ **Upload** errored when `failure.at` ∈ {PENDING, UPLOADING} (stage `upload`) or step ④ **Process** errored when `failure.at` = PROCESSING (stage `processing`), freezing later steps.
- Nodes: complete = filled pink + check; active = pink ring + pulse (`aria-current="step"`); upcoming = muted border + number; errored = destructive border + `AlertCircle`. Always icon/number + text, never color alone. `nav aria-label="Upload progress" > ol`, `sr-only` state suffixes, non-interactive.
- Responsive: `≥ sm` full strip with per-node labels; `< sm` compact circles + "Step N of 5 · {label}" line; never horizontal scroll.
- Pure presentation; props `phase` (+ `failure`/derived errored step); no dispatch.

**Phase treatments (each maps 1:1 to a real phase):**
- `idle`: `h2` "Choose your video" + redesigned DropZone.
- `selected`: `h2` "Add details" + framed file row (`FileVideo`, name/size, `X` remove) + `UploadDetailsForm` (fresh) or draft-confirmation line + `Start upload`; `state.notice` as `role=status`.
- `pending`: `h2` "Starting upload" + file row w/ `ProcessingBadge PENDING` + StageChecklist + `Cancel upload` (ghost/destructive).
- `uploading`: `h2` "Uploading" + file row w/ `ProcessingBadge UPLOADING` + progress bar (paired "Uploading"/"{%}" header, `tabular-nums`) + checklist + `Cancel upload`.
- `processing`: `h2` "Processing" + file row w/ `ProcessingBadge PROCESSING` + checklist (Transcoding active) + `Loader2` "Processing{· %}" + prominent "This can take a few minutes. You can leave this page." + "View in My Content" link + poll-error alert/`Check again`.
- `ready`: `h2` "Ready to publish" + green check line + `PublishForm` (`Publish` primary) + `Upload another` (secondary).
- `published`: `h2` "Published" + big success line "Published. "{title}" is live." + `Watch now` (pink primary) / `View in My Content` / `Upload another`.
- `failed`: checklist with `failedAt` + `UploadFailurePanel` (its heading serves as the step heading; Retry/Re-upload primary + Choose different file; `role=alert`).

**Drop zone (restyle):** idle (dashed border, `UploadCloud` `size-8`, promoted
`text-foreground` instruction, muted format hint, pink `Choose file`); drag-over
(`border-primary bg-accent/50`, text→pink, label "Drop to upload"); rejected
(drop zone stays, existing `state.fileError` `role=alert` below, optional
`border-destructive/50`). `py-14 sm:py-16`. Keyboard path = `Choose file`.

**Details form (restyle):** group into "About this video" (Title full-width,
Content type at `max-w-xs`, two-column at `≥ sm`) and "Thumbnail & declaration"
(`ThumbnailPicker` capped `max-w-md`, AI checkbox + hint). Errors under each field
(`aria-describedby`/`aria-invalid`, existing); hints always visible. Submit
`self-start` primary. AI label explains the violet viewer badge; checkbox stays
`accent-primary` (no violet on the control).

**Progress/processing:** keep progressbar semantics; restyle to a paired
label/percent header + `h-2.5` track. Processing = indeterminate + reassurance +
"View in My Content"; percent is supplementary text only, never a bar.

**Success/failure:** `ready` = mid-success + publish; `published` = terminal
success, `Watch now` the one primary; `failed` = restyled `UploadFailurePanel`
(reason verbatim + fallback + requestId + Retry first-focusable), stepper shows
where it failed.

**Responsive/breakpoints:** `< sm` compact stepper, `p-5`, single-column form,
wrapping actions; `sm`–`lg` full stepper, `p-6`, two-column form grouping; `≥ lg`
`max-w-3xl`. No horizontal scroll; reflow-safe at 200%/320px.

**Component inventory:** restyle `UploadWizard`, `DropZone`, `UploadDetailsForm`,
`PublishForm`, `UploadFailurePanel`; keep `StageChecklist`, `ThumbnailPicker`,
`ProcessingBadge`, all `components/ui` primitives and the hook unchanged. **Build
one new component: `UploadStepper`** (`features/upload/components`, pure
presentation). No new `components/ui` primitive, no Radix, no dependency.

**A11y:** single `h1`; per-phase `h2` + move focus to it on user-initiated/
terminal transitions (live region covers in-flight churn); keep the `sr-only`
live announcer; stepper `nav>ol` with `aria-current="step"` + `sr-only` state
suffixes, non-interactive; status never by color alone; icon-only controls keep
`aria-label`; field errors associated; failure panel `role=alert` with Retry
first; reduced-motion guards on all animation; reuse existing contrast-safe token
pairings only.

**Reused tokens/variants:** pink `--primary` for progress fill / primary actions /
active+complete stepper nodes; `success`/`warning`/`destructive` only via existing
`Badge`/`StageChecklist`/failure-panel patterns (+ icon + text); `--signal` violet
stays **reserved for the AI label meaning only**, never applied to the stepper or
controls. Radii: controls `--radius`, media/inset surfaces `--radius-media`. No new
colors, gradients, glass, or heavy shadows.

**Data/endpoint flags:** none — pure presentation (§12). If any element appears to
need data beyond the listed `useUploadFlow` output, stop and flag it.
