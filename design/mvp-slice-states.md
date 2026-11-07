# AI Drama — MVP Thin Slice: State & Flow Design Spec

**Scope:** signup → upload → process → watch
**Status:** design handoff for frontend-engineer
**Author:** ui-ux-designer
**Spec source:** `spec.md` §3.1, §3.7, §3.8, §3.10, §4.4

This document fills **only the design gaps** in the existing build. It does not
redesign pages that already work (home, explore, studio shell, video player,
card/grid, auth shell layout). Every surface is mapped to the existing component
it extends so the engineer changes as little as possible.

---

## 0. Ground rules (from the existing build)

These are observed from the current code and are the source of truth for new work.

### Design tokens (from `src/app/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--background` | `#0a0a0d` | page base |
| `--surface` / `--surface-2` | `#131318` / `#1b1b22` | cards, panels |
| `--foreground` | `#f5f5f7` | primary text |
| `--muted-foreground` | `#a3a3b2` | secondary text |
| `--primary` | `#ff3d71` (hot pink) | primary action, progress fill |
| `--signal` | `#b46cff` (violet) | AI labels only |
| `--success` | `#4ade80` | READY / done |
| `--warning` | `#fbbf24` | PROCESSING |
| `--destructive` | `#f0616d` | FAILED / errors |
| `--border` / `--input` / `--ring` | `#26262f` / `#2a2a34` / pink | borders, focus ring |
| `--radius` / `--radius-media` | `0.5rem` / `0.625rem` | controls / media surfaces |

Fonts: `font-display` (Jakarta, heavy, tight) for headings; `font-editorial`
(Fraunces serif) reserved for featured titles only; body is Jakarta.

### Component vocabulary already present
- UI primitives: `Button` (variants: default, secondary, outline, ghost, destructive, link; sizes default/sm/lg/icon), `Badge` (default, secondary, outline, success, warning, destructive, signal), `Card`, `Input`, `Label`.
- Status chips: `ProcessingBadge` / `PublicationBadge` (`src/features/videos/components/status-badge.tsx`) — already covers `PENDING/UPLOADING/PROCESSING/READY/FAILED`.
- Auth: `AuthShell`, `Field` (labelled input + `aria-describedby` error), `RegisterForm`, `LoginForm`.
- Upload: `UploadWizard` (drag/drop, progress bar, stage checklist).
- Watch: `VideoPlayer` (HLS, already renders a "still processing" placeholder when `src` is null).
- Layout: `Navbar`, `Footer`, `PageShell`, `SectionHeader`, `StudioSidebar`.

### Reduced motion
`prefers-reduced-motion` already strips animations globally. All new spinners,
pulses, and auto-advancing countdowns must respect it (no motion-only
signalling; pair with text/icon state).

### Accessibility baseline (applies to every surface below)
- Visible focus is the global pink ring (`focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`) — already on `Button`. Any new focusable element must keep it.
- Never signal state by color alone. Each status pairs **color + icon + text label** (matches existing `ProcessingBadge`).
- Contrast: body text `--muted-foreground` on `--surface` and all status tokens meet WCAG AA at the given opacities for text use. Status tokens used as *tinted backgrounds* (e.g. `bg-warning/15 text-warning`) are the existing badge pattern — keep text at full token color, never on a low-opacity fill below AA.
- Errors are associated to the field via `aria-describedby` + `aria-invalid` (existing `Field` pattern).

---

## 1. Signup + email verification flow

**User goal:** create an account and confirm the email so publishing is unlocked.
**Entry point:** `/signup` (nav "Sign Up"), and the "Resend" path lands users back from the verification screen.

### 1.1 Flow (happy + alternate)
```
/signup  ──submit valid──▶  "Check your email" screen  ──click link──▶  /verify?token=…  ──valid──▶  verified (CTA: Go to Studio)
   │                              │                                           │
   │ validation error             │ resend (rate-limited)                     ├─ expired token  ─▶ "Link expired" + resend
   │ (inline, per field)          │                                           └─ invalid token  ─▶ "Link invalid" + resend / contact
   └─ email already registered ─▶ inline error on email + link to /login
```

### 1.2 Screens & states

#### A. Signup form — `/signup` (extends `RegisterForm` + `AuthShell`)
The form exists. Add the states below; do **not** change the split-art layout.

| State | Design |
|---|---|
| idle | Current fields: display name, username, email, password, confirm. Primary button `Create account` full width. |
| validating (field) | Inline per-field errors via `Field` (`aria-invalid`, `aria-describedby`). Password rules shown as helper text under the password field (not only on error). |
| submitting | `Button` disabled + `Loader2` spinner (existing pattern). Button text stays "Create account"; do not swap to a bare spinner (keeps accessible name). |
| error — email taken | Inline error on the email field: "This email is already registered." + a `link`-variant Button/Link to `/login`. |
| error — server/network | Non-field `role="alert"` block above the submit button, `text-destructive`, with a `Try again` affordance (re-enable submit). |
| success | **Replace the form** with the "Check your email" panel (B) in the same `AuthShell` right column. Focus moves to the panel heading. |

**Change to existing behavior:** the current `RegisterForm` shows an inline
"Account created (demo)" success line. For the MVP slice, on success it should
transition to panel **B** instead of staying on the form.

#### B. "Check your email" panel (new, lives in auth right column)
| Element | Spec |
|---|---|
| Heading | `font-display text-3xl` — "Check your email" |
| Body | "We sent a verification link to **{email}**. Open it to activate your account." Email is bold, truncates with `title`. |
| Icon | Lucide `MailCheck`, `text-primary`, decorative (`aria-hidden`). |
| Primary action | `Resend email` (Button, secondary). |
| Secondary | "Wrong address? `Use a different email`" → returns to form (A). |
| States | **resend-idle** → **resend-sending** (disabled + spinner) → **resent** (`role="status"`: "Sent. Check your inbox.") → **rate-limited** (disabled + helper "You can resend in {n}s", countdown respects reduced-motion by updating text, not animating). |

#### C. Verification result — `/verify` (new route)
Server reads `?token=`. Three terminal states, each a centered panel reusing `AuthShell`'s right column styling (no key-art needed on mobile).

| State | Icon / color | Copy | Action |
|---|---|---|---|
| verifying (loading) | spinner | "Verifying your email…" | none; `aria-busy` |
| success | `CheckCircle2` `text-success` | "Email verified. Your account is ready." | Primary `Go to Creator Studio` → `/studio`; secondary `Browse AI Drama` → `/` |
| expired | `Clock` `text-warning` | "This link has expired." | `Resend verification email` (→ panel B resend behavior) |
| invalid | `AlertCircle` `text-destructive` | "This verification link is not valid." | `Resend` + link to support/help |

### 1.3 Responsive
- `AuthShell` already handles it: key-art hidden below `lg`, logo shown on mobile, form column `max-w-sm` centered. Panels B and C inherit this. No new breakpoints.

### 1.4 Accessibility
- On state transition A→B and on the C result render, move focus to the panel `<h1>`/`<h2>` (programmatic focus, `tabIndex={-1}`), so screen-reader users hear the outcome.
- Resend confirmation uses `role="status"` (polite). Hard errors use `role="alert"` (assertive).
- Countdown text is the accessible source of truth; do not rely on a visual ring.
- The verification screen is a full page, not a dialog — no focus trap needed.

### Acceptance criteria
- Submitting an invalid form shows field-level errors and does not navigate.
- A successful submit shows "Check your email" with the entered address and a working resend (rate-limited, with visible countdown).
- `/verify` with a valid token shows success and a path into the Studio; expired/invalid tokens offer resend.
- Every result state is announced to assistive tech and reachable by keyboard.

---

## 2. Upload wizard states

**User goal:** get a video from the file system to a READY, publishable asset.
**Entry point:** `/studio/upload`.
**Extends:** `UploadWizard` (`src/features/upload/components/upload-wizard.tsx`) and `ProcessingBadge`.

The wizard already has idle, selecting, uploading(progress), processing, ready.
The gaps are: **cancel, retry, failed-with-reason**, and a tighter mapping of
the status machine to visible UI. Below is the full matrix the engineer should
implement; existing states are marked (exists).

### 2.1 State matrix
| State | Trigger | Primary UI | Actions | Status chip |
|---|---|---|---|---|
| **idle** (exists) | no file | Dashed drop zone, `UploadCloud`, "Drag and drop / Choose file", format hint MP4·MOV·WebM | `Choose file` | none |
| **selecting / rejected** (exists) | file picked | If type invalid → `role="alert"` "Unsupported format. Use MP4, MOV, or WebM." Keep drop zone. | re-pick | none |
| **selected** (exists) | valid file | File row: `FileVideo`, name (truncate), size. | `Start upload`, `X` remove | none |
| **pending** (exists) | start | File row + stage checklist, first stage active-pulse | **Cancel** (new) | PENDING (secondary) |
| **uploading** (exists + add) | bytes moving | Progress bar (`role=progressbar`, aria-valuenow), "{n}% uploaded", est. optional | **Cancel upload** (new, `destructive`/`ghost`) | UPLOADING (default) |
| **processing** (exists + add) | upload done | Stage checklist; "Transcoding to HLS" active. Indeterminate (no byte %). Copy: "This can take a few minutes. You can leave this page." | **View in My Content** (link, new) | PROCESSING (warning) |
| **ready** (exists) | worker done | Success row `CheckCircle2` `text-success`. | `Publish`, `Upload another` | READY (success) |
| **failed — upload** (new) | network/abort error | Error panel (see 2.3) with reason | **Retry upload**, `Choose different file` | FAILED (destructive) |
| **failed — processing** (new) | worker rejects | Error panel with worker reason | **Re-upload** (processing can't retry in place), `Choose different file` | FAILED (destructive) |
| **cancelled** (new) | user cancels upload | Return to **selected** state with the same file retained; toast/`role=status` "Upload cancelled." | `Start upload` again, remove | none |

### 2.2 Cancel behavior
- `Cancel upload` appears only in **pending** and **uploading**. Use `variant="ghost"` with destructive text or a small `destructive` button; label the control `aria-label="Cancel upload"`.
- Cancelling mid-upload is **non-destructive** (no confirm dialog needed — nothing published yet). It aborts the in-flight request and returns to **selected** with the file kept so the user can immediately retry.
- Cancel is hidden once status is `PROCESSING` or later (server-side work; surface a "Processing started — manage it in My Content" message instead).

### 2.3 Failure surface (the key gap: show *why*)
A bordered panel inside the wizard, not a modal:
- Container: `rounded-media border border-destructive/40 bg-destructive/10 p-4`.
- Icon: `AlertCircle` `text-destructive` (`aria-hidden`), heading "Upload failed" / "Processing failed".
- **Reason line** (required): render the backend `failureReason` string verbatim, e.g. "File is corrupt or not a valid video", "Unsupported codec", "Upload interrupted". If no reason is provided, fall back to "Something went wrong during {upload|processing}. Please try again." Never show a blank error.
- Actions: `Retry upload` (primary) for upload failures; `Re-upload` for processing failures; `Choose different file` (secondary) for both.
- Wrap the whole panel in `role="alert"` so it is announced on appearance.

### 2.4 Stage checklist (extend existing)
The existing `STAGES` list (Queued → Uploading → Transcoding to HLS → Ready to
publish) stays. Extend so that on FAILED the checklist stops at the failed stage
and that stage renders with `AlertCircle text-destructive` + label suffix
"— failed", rather than a pulsing dot. Completed stages keep `CheckCircle2 text-success`.
Keep the `<ol aria-label="Processing status">` semantics.

### 2.5 Responsive
- Single column, `max-w-2xl` (existing upload page). Drop zone reduces vertical padding below `sm` (`py-20` → `py-12`) so it fits mobile viewports without scrolling past it.
- File row and action buttons stack/wrap on narrow screens (`flex-wrap`); buttons go full-width friendly (keep `size="default"`; allow wrap).

### 2.6 Accessibility
- Progress bar: keep `role="progressbar"` + `aria-valuenow/min/max` (exists). Add `aria-label="Upload progress"`.
- Processing (indeterminate) region: `aria-live="polite"` on the status area so PENDING→UPLOADING→PROCESSING→READY transitions are announced without stealing focus.
- Failure panel `role="alert"`; focus is **not** forced (user may still be reading), but the Retry button must be the first focusable control after the panel.
- Drop zone is not keyboard-operable by itself; the `Choose file` button is the keyboard path (exists) — keep it as the primary, visible affordance.
- Cancel/Retry/Remove icon-only controls keep `aria-label`.

### Acceptance criteria
- A user can cancel during upload and the file is retained for immediate retry, with a polite announcement.
- An upload failure shows a human-readable reason and a Retry; a processing failure shows the reason and a Re-upload path.
- The stage checklist reflects the real status machine including the FAILED terminal state (stopped at the failing stage, destructive marker).
- Status changes are announced via a polite live region; no state is signalled by color alone.

---

## 3. Processing status surface + Watch page: PROCESSING vs READY

**User goal (creator):** know where a video is in the pipeline without sitting on the upload screen.
**User goal (viewer/creator on watch page):** understand that a not-yet-ready video can't play yet, and what to do.

### 3.1 Processing status surface (My Content — extends existing listing)
This is the persistent home for a video's lifecycle after the user leaves the
upload wizard. It reuses the creator content list (`src/features/videos` listing
+ `ProcessingBadge`/`PublicationBadge`).

Per-row processing affordance:
| processingStatus | Row display | Row action |
|---|---|---|
| PENDING | `ProcessingBadge PENDING` + muted "Queued" | — |
| UPLOADING | badge + thin progress bar in the row (`role=progressbar`) | Cancel |
| PROCESSING | badge (warning) + "Transcoding…" with `aria-live` on the cell | — (poll for update) |
| READY | badge (success) | `Publish` |
| FAILED | badge (destructive) + reason on hover/expand | `Re-upload`, `View reason` |

- Polling/refresh: show a subtle "updated just now" / manual `Refresh` affordance; do not auto-animate. When a row flips to READY or FAILED, announce via a single `aria-live="polite"` region at the list level ("‘{title}’ is ready to publish").
- The upload wizard's **processing** and **failed** states both deep-link here ("View in My Content" / "Manage it in My Content").

### 3.2 Watch page — PROCESSING vs READY (extends `watch/[slug]/page.tsx` + `VideoPlayer`)
The `VideoPlayer` already renders a placeholder box when `src` (hlsUrl) is null.
Make the *whole watch surface* state-aware so the page is coherent, not just the
player well.

Decision rule (server, from `video.processingStatus` / `publicationStatus`):
```
READY/PUBLISHED & hlsUrl present   ─▶ full player experience (current page, unchanged)
PENDING/UPLOADING/PROCESSING       ─▶ "Processing" watch state (3.2A)
FAILED                             ─▶ "Unavailable" watch state (3.2B)
not found / private no-access      ─▶ existing notFound() / 404
```

#### A. PROCESSING watch state
Keep the page chrome (title, creator card, metadata, description, "Keep
watching" rail) so the layout doesn't collapse. Replace only the player well:
| Element | Spec |
|---|---|
| Player well | Reuse the `VideoPlayer` null-state box styling (`aspect-video rounded-lg bg-muted`). Center a `Loader2`/`Clock` icon + heading "This video is still processing" + subline "It will be playable once transcoding finishes." |
| Status chip | `ProcessingBadge` (warning) near the title. |
| Metadata | View count / publish date hidden or shown as "—" (not yet published); do not show a 0-views line as if live. |
| Owner-only hint | If the viewer is the creator, add a secondary line + `Go to My Content` link. For non-owners, no management affordance. |
| Actions | Like/Watchlist/Share **disabled** with tooltip "Available when the video is ready." Share stays enabled only if the content is intentionally shareable while processing — default: disabled. |
| Live region | Wrap the well in `aria-live="polite"`; if the client polls and status becomes READY, swap to the player and announce "Video is ready. Press play to watch." |

#### B. FAILED / unavailable watch state
| Element | Spec |
|---|---|
| Player well | `AlertCircle text-destructive`, heading "This video is unavailable", subline "It couldn't be processed." |
| Owner-only | Creator sees the failure reason + `Re-upload` link to the wizard. Non-owners see only the generic unavailable message (don't leak internal reasons). |
| Actions | Social actions hidden (not just disabled). Keep "Keep watching" rail so the user has a next step. |
| Semantics | `role="alert"` on the well. |

### 3.3 Responsive
- Watch page grid is already `grid-cols-1` → `lg:grid-cols-[1fr_340px]`. The processing/failed well occupies the same main column; the related rail drops below the main column on mobile (existing behavior). No new breakpoints.
- Disabled action buttons wrap as today.

### 3.4 Accessibility
- The processing/unavailable well must have a real heading (`<h2>` or keep page `<h1>` for title and use `<h2>` in the well) so the state is in the heading outline.
- Disabled social buttons: use `disabled` + an accessible explanation (`aria-describedby` pointing to the "Available when ready" text) rather than only a visual tooltip.
- Status chip pairs color + text (exists).
- If client-side polling swaps processing→ready, move focus politely only on explicit user action (don't yank focus to the player automatically); announce via live region instead.

### Acceptance criteria
- A PROCESSING video shows an informative player-well state, keeps page chrome, disables social actions with an explanation, and (for the owner) links to My Content.
- A FAILED video shows an unavailable state; only the owner sees the reason and a re-upload path.
- A READY/PUBLISHED video is the current, unchanged watch experience.
- My Content reflects PENDING→UPLOADING→PROCESSING→READY→(FAILED) per row with a cancel path while uploading and a reason + re-upload path on failure.

---

## 4. Status machine → UI mapping (single reference)

`ProcessingStatus` (from `src/types/domain.ts`): `PENDING | UPLOADING | PROCESSING | READY | FAILED`.

| Status | Badge variant (existing) | Icon | Upload wizard | My Content row | Watch page |
|---|---|---|---|---|---|
| PENDING | secondary | pulsing dot | checklist stage 1 active | "Queued" | processing well |
| UPLOADING | default | pulsing dot | progress bar + cancel | inline progress + cancel | processing well |
| PROCESSING | warning | spinner/clock | checklist stage 3 active, indeterminate, "leave page" hint | "Transcoding…" live cell | processing well + live region |
| READY | success | `CheckCircle2` | Publish / Upload another | `Publish` action | full player (unchanged) |
| FAILED | destructive | `AlertCircle` | failure panel + reason + retry | reason + re-upload | unavailable well (owner sees reason) |

Transitions are forward-only except FAILED (terminal; recovery = re-upload, not
in-place retry of PROCESSING). UPLOADING is the only client-retryable failure.

---

## 5. Open questions / assumptions

1. **Verify route shape** — assumed `/verify?token=…` (server component reading the token). If the backend uses a different path (e.g. `/auth/verify/[token]`), the three result states are unchanged; only the route file moves. *Assumption, proceed.*
2. **Resend rate limit** — assumed a client-visible cooldown (e.g. 30s) surfaced as a countdown. Exact window is a backend policy; UI just needs the `retryAfter` seconds. *Assumption.*
3. **Processing failure reason exposure** — assumed owner-only on the watch page; non-owners get a generic message to avoid leaking pipeline internals. Confirm if product wants reasons public. *Assumption, proceed with owner-only.*
4. **Share while processing** — defaulted to disabled. If unlisted pre-publish sharing is desired later, flip Share to enabled in the PROCESSING state only.
5. **Polling vs push** — spec implies status polling (no websockets in MVP). All live regions assume periodic client refresh; no design change if push is added later.

---

## 6. Handoff block (for frontend-engineer)

Each item: **screen → states → components (existing to extend) → breakpoints → a11y**.

### S1 — Signup form
- **States:** idle · field-validating · submitting · error(email-taken) · error(server) · success→panel.
- **Extends:** `features/auth/components/register-form.tsx`, `auth-shell.tsx`, `field.tsx`, `ui/button.tsx`.
- **Breakpoints:** inherits `AuthShell` (key-art hidden `<lg`, form `max-w-sm`).
- **A11y:** field errors via `aria-describedby`/`aria-invalid`; server error `role=alert`; on success move focus to panel heading.

### S2 — "Check your email" panel (new)
- **States:** shown · resend-idle · resend-sending · resent · rate-limited(countdown).
- **Extends:** renders inside `AuthShell` right column; `ui/button.tsx` (secondary), Lucide `MailCheck`.
- **Breakpoints:** inherits `AuthShell`.
- **A11y:** resend confirmation `role=status`; countdown is text; focus on heading when it appears.

### S3 — Verification result `/verify` (new route)
- **States:** verifying · success · expired · invalid.
- **Extends:** `AuthShell` styling; `ui/button.tsx`; Lucide `CheckCircle2`/`Clock`/`AlertCircle`.
- **Breakpoints:** single centered column all sizes.
- **A11y:** focus to result heading; `aria-busy` while verifying.

### S4 — Upload wizard
- **States:** idle · rejected · selected · pending · uploading(progress+cancel) · processing(indeterminate) · ready · failed-upload(reason+retry) · failed-processing(reason+re-upload) · cancelled.
- **Extends:** `features/upload/components/upload-wizard.tsx`, `features/videos/components/status-badge.tsx` (`ProcessingBadge`), `ui/button.tsx`; Lucide `UploadCloud`/`FileVideo`/`AlertCircle`/`CheckCircle2`/`X`.
- **Breakpoints:** `max-w-2xl`; drop zone `py-20`→`py-12` `<sm`; actions wrap.
- **A11y:** `role=progressbar` (+aria-label); status area `aria-live=polite`; failure panel `role=alert` with Retry as first focusable; icon buttons labelled.

### S5 — Processing status surface (My Content rows)
- **States per row:** PENDING · UPLOADING(inline progress+cancel) · PROCESSING(live cell) · READY(publish) · FAILED(reason+re-upload).
- **Extends:** `features/videos` listing/grid, `status-badge.tsx` (`ProcessingBadge`/`PublicationBadge`), `ui/button.tsx`, `ui/badge.tsx`.
- **Breakpoints:** reuse existing list/table responsive behavior; on mobile collapse to stacked rows (badge + action), progress bar full-width.
- **A11y:** list-level `aria-live=polite` for ready/failed transitions; manual `Refresh`; no color-only status.

### S6 — Watch page processing/failed states
- **States:** READY(current player, unchanged) · PROCESSING(well + disabled social + owner link) · FAILED(unavailable well, owner-only reason+re-upload).
- **Extends:** `app/watch/[slug]/page.tsx`, `features/watch/components/video-player.tsx` (null-state well), `status-badge.tsx`, `ui/button.tsx`, `features/videos/components/video-card.tsx` (keep-watching rail); Lucide `Clock`/`Loader2`/`AlertCircle`.
- **Breakpoints:** existing `grid-cols-1`→`lg:grid-cols-[1fr_340px]`; well fills main column.
- **A11y:** well has a heading; disabled social buttons `aria-describedby` explanation; `role=alert` on failed well; polite announce on processing→ready, no forced focus.

**Reused tokens/variants:** pink `--primary` for progress/primary actions; `success/warning/destructive` only via existing `Badge` variants + matching Lucide icon + text label; `--signal` violet stays reserved for AI labels. Radii: controls `--radius`, media wells `--radius-media`. No new colors, gradients, or shadows introduced.
