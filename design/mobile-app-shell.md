# AI Drama — Mobile App-Shell Navigation

**Scope:** Navigation + app shell only (level 1). Make the app *feel* like a native mobile app on phones.
**Status:** design handoff for frontend-engineer
**Author:** ui-ux-designer
**Design task only.** This is a specification. **No application code is written here.**
**Reads / builds on (source of truth):**
- `frontend/src/components/layout/navbar.tsx` — current top bar (primary links hidden `< lg`)
- `frontend/src/components/layout/nav-links.tsx` — the 6 primary links
- `frontend/src/components/layout/page-shell.tsx` — `PageShell` (Navbar + centered `<main>` + Footer)
- `frontend/src/components/layout/nav-auth.tsx` — auth control; `useRestoredSession()` → `status: "unknown" | "authenticated" | ...`
- `frontend/src/components/layout/studio-sidebar.tsx` — Studio has its own sidebar (`hidden … md:block`)
- `frontend/src/app/globals.css` — tokens. `frontend/src/components/ui/dialog.tsx` — Radix dialog primitive. `frontend/src/components/ui/button.tsx` — `Button`.
- Visual language: `design/studio-content-redesign.md`, `design/studio-upload-redesign.md`. **No new colors.** `--signal` violet is reserved for AI labels only.

> **Hard rule, repeated throughout:** this is **additive and mobile-only**. At **`lg` and above the existing desktop navbar/links render exactly as they do today — untouched.** Everything in this spec appears **only below `lg`**.

---

## 0. The gap (from code)

Today, below `lg` there is **no primary navigation**. `NavLinks` is `hidden … lg:flex`, so on a phone the header shows only: logo + a search icon (`md:hidden` link to `/search`) + auth buttons. The 6 primary destinations (Home, Browse, Series, Films, Shorts, Create) are **unreachable** on mobile. Library/Notifications icons are `hidden sm:inline-flex`, so on the smallest phones even those vanish.

**Fix:** a native-feeling app shell on phones — a **bottom tab bar** for primary destinations, a **compact context-aware top header**, and **bottom sheets** for overflow/secondary nav — while the desktop shell stays as-is at `lg+`.

---

## 1. The breakpoint boundary (exact rule)

The app uses **`lg`** (Tailwind default **1024px**) as the primary-nav boundary today (`NavLinks` is `lg:flex`). The mobile shell uses the **same boundary** so there is exactly one line between "mobile app shell" and "desktop":

| Viewport | What renders |
|---|---|
| **`< lg`** (`max-lg`, 0–1023px) — **mobile shell** | `MobileHeader` (compact, context-aware) + `MobileTabBar` (fixed bottom). The existing desktop `Navbar` is **hidden** (`hidden lg:block`). |
| **`≥ lg`** (1024px+) — **desktop, untouched** | Existing `Navbar` + `NavLinks` exactly as today. `MobileHeader`/`MobileTabBar` are **hidden** (`lg:hidden`). |

Implementation of the boundary (in `PageShell`, §7):
- Wrap the existing `<Navbar />` so it is `hidden lg:block` (one class on a wrapper, or add `lg:block hidden`-equivalent — the `Navbar`'s own markup is **not** edited, only gated).
- Render `<MobileHeader />` and `<MobileTabBar />` with `lg:hidden`.

> **Studio note:** `StudioSidebar` is a separate shell (`md:block`) and is **out of scope** here. This spec covers the **public `PageShell`** only. (Follow-up flagged in §12.)

---

## 2. Mobile information architecture

Six primary links + Search + Library + Notifications + auth don't all fit as tabs. Mobile IA splits them into **tabs** (primary, always one tap away), **header** (context + search + account), and a **"More" bottom sheet** (secondary destinations).

### 2.1 The 6 links, triaged

| Link | Route | Mobile placement | Why |
|---|---|---|---|
| Home | `/` | **Tab** | Top-level landing; highest frequency. |
| Browse | `/explore` | **Tab** | The primary discovery surface. |
| Series | `/series` | **"More" sheet** | A filtered slice of Browse; secondary. |
| Films | `/movies` | **"More" sheet** | A filtered slice of Browse; secondary. |
| Shorts | `/shorts` | **"More" sheet** | A distinct feed but lower-frequency than Browse. |
| Create | `/studio/upload` | **Tab** (auth-gated) | The core creator action; deserves a persistent, thumb-reachable tab. |

Added to tabs from the existing header affordances:
| Affordance | Route | Mobile placement | Why |
|---|---|---|---|
| Search | `/search` | **Tab** | Search is a primary task on mobile; it already has a dedicated route and an icon in the header today. Promoting it to a tab is more native than a header-only icon. |
| Library | `/library` | **Tab** (auth-gated) | "My stuff" — a canonical 5th tab in streaming apps (saved/continue-watching). |

### 2.2 Final tab set — **5 tabs**

> **Decision & justification.** Native streaming apps settle on **4–5 fixed tabs**. We ship **5**: **Home · Browse · Search · Library · Create**. Rationale:
> - **Home + Browse** cover discovery (the top of the funnel).
> - **Search** is a primary mobile task and already routed.
> - **Library** is the authenticated "my stuff" hub (saved, continue watching, notifications entry).
> - **Create** is AI Drama's reason-to-exist as a creator platform; it earns a persistent slot.
> - **Series / Films / Shorts** are *filtered views of Browse* — demoting them to a **"More" bottom sheet** reachable from Browse keeps the tab bar at 5 and avoids a 7-tab bar (too small to tap, un-native). They are **not hidden for authorization** reasons — they're public; this is purely IA priority.
>
> We do **not** add a 6th "More" tab. At 5 tabs each target is comfortably ≥ 64px wide on a 360px screen (360/5 = 72px), above the 44px minimum. A 6th tab would crowd targets and duplicate what the Browse→"More" sheet and the header already provide.

### 2.3 Where Series/Films/Shorts live on mobile
Reachable two ways, no dead ends:
1. **From Browse (`/explore`)** — the Browse page's own content (later phase) exposes Series/Films/Shorts as filters/sections. (Content redesign is out of this phase; we only guarantee the routes are reachable.)
2. **From a "More" bottom sheet** — opened by a **"More"** affordance (see §5.3). The sheet lists Series, Films, Shorts, plus Notifications and (guest) Sign in / Get started. This guarantees reachability even before the Browse page is redesigned.

### 2.4 Header vs tabs vs sheet (summary)

| Element | Home tab | Browse tab | Search tab | Library tab | Create tab | More sheet | Header |
|---|---|---|---|---|---|---|---|
| Home `/` | ● | | | | | | brand (Home only) |
| Browse `/explore` | | ● | | | | | |
| Search `/search` | | | ● | | | | (search icon still available on deep headers, optional) |
| Library `/library` | | | | ● (auth) | | | |
| Create `/studio/upload` | | | | | ● (auth) | | |
| Series `/series` | | | | | | ● | |
| Films `/movies` | | | | | | ● | |
| Shorts `/shorts` | | | | | | ● | |
| Notifications `/notifications` | | | | (surfaced in Library) | | ● | |
| Account / auth | | | | | | ● (guest links) | account/auth action (right side) |

---

## 3. Bottom tab bar — `MobileTabBar` (new component)

A fixed, safe-area-aware bar of 5 destinations. **New component:** `frontend/src/components/layout/mobile-tab-bar.tsx` (client — needs `usePathname` + `useRestoredSession`).

### 3.1 Items (final, with icons + routes + auth)

Icons from `lucide-react` (already used).

| # | Label | Route | Icon (lucide) | Auth rule |
|---|---|---|---|---|
| 1 | Home | `/` | `Home` | Public |
| 2 | Browse | `/explore` | `Compass` | Public |
| 3 | Search | `/search` | `Search` | Public |
| 4 | Library | `/library` | `Bookmark` | **Auth-gated** |
| 5 | Create | `/studio/upload` | `Plus` (in a filled pill) or `Clapperboard` | **Auth-gated** |

> **Create tab styling note:** to read as the "primary create action" (native apps often give the center tab emphasis), the Create tab **may** use a filled pink circle around a `Plus` icon (center, slightly raised) using `bg-primary text-primary-foreground`. This is optional emphasis, not a new color. If emphasis is not wanted, use `Clapperboard` styled like the other tabs for consistency. **Default recommendation: use the standard tab treatment (`Clapperboard`, no raised pill)** to keep the bar visually even and avoid a one-off; promote to the raised pill only if product wants the center-create pattern.

### 3.2 Active vs inactive (states)

Reuse existing tokens; mirror the desktop active pattern (pink) but adapted for a tab.

| State | Icon color | Label color | Marker |
|---|---|---|---|
| **Active** (route match) | `text-primary` | `text-primary` | optional 2px top bar `bg-primary` (or just the pink icon/label — color **plus** the filled/active icon weight, never color alone — see a11y §9) |
| **Inactive** | `text-muted-foreground` | `text-muted-foreground` | none |
| **Pressed** | `text-foreground` | — | `active:bg-accent/60` tap feedback |
| **Focus (keyboard)** | — | — | global pink ring `focus-visible:ring-2 ring-ring` inset so it isn't clipped by the bar edge (`focus-visible:ring-inset`) |
| **Disabled** | n/a — gated tabs are **not disabled**; see §3.4 | | |

Active match logic (same rule as `NavLinks`):
```
active = href === "/" ? pathname === "/" : pathname.startsWith(href)
```
Create tab (`/studio/upload`) matches `pathname.startsWith("/studio")` so the tab stays active across the Studio section on mobile (Studio has no mobile sidebar — flagged §12).

### 3.3 Sizing, layout, safe area

- Container: `fixed inset-x-0 bottom-0 z-40`, `lg:hidden`.
- Surface: `border-t border-white/5 bg-background/80 backdrop-blur-xl` (mirrors the navbar's `bg-background/60 backdrop-blur-xl` translucent treatment, slightly more opaque for legibility over content).
- **Safe area:** `pb-[env(safe-area-inset-bottom)]` on the bar so iOS home-indicator space is respected; the tappable row sits above the inset.
- Row: `grid grid-cols-5`, each tab a full-height column.
- **Touch target:** each tab is a `flex flex-col items-center justify-center gap-0.5`, **min height 56px** for the interactive row (`min-h-14`), full column width (≥ 64px). This exceeds the **44×44px** minimum (WCAG 2.2 **2.5.8 Target Size (Minimum)**; we exceed the 24px floor comfortably).
- Icon `size-5` (20px); label `text-[11px] leading-none` (short labels only; no wrapping). Labels are **always shown** (icon + label) for clarity.
- No elevation/shadow beyond the top border + blur (house rule: no heavy shadows).

### 3.4 Auth-gated tab behavior (guest vs authenticated)

`useRestoredSession()` gives `status`. Rules:

| `status` | Library tab | Create tab | Home/Browse/Search |
|---|---|---|---|
| `"authenticated"` | Normal link → `/library` | Normal link → `/studio/upload` | Normal |
| anonymous (settled, not authenticated) | **Shown**, but tapping routes to **`/login?next=/library`** | **Shown**, tapping routes to **`/login?next=/studio/upload`** | Normal |
| `"unknown"` (restore in flight) | Shown, not disabled; tapping follows the anonymous rule until session settles (optimistic: route to login; if session resolves authenticated a beat later, the destination page handles it) | same | Normal |

> **Why show, not hide:** the tab bar is a fixed 5-slot layout; hiding a tab would reflow the bar and move targets under the user's thumb mid-session (bad). Instead, gated tabs are **always visible** and **redirect unauthenticated taps to login with a `next` param**, so the user lands where they intended after signing in. **Hidden UI is never the authorization boundary** — the destination routes still enforce auth server-side/route-guard-side. This keeps the bar stable and the IA honest.
>
> **Visual treatment for gated-while-guest:** do **not** dim or lock-icon them (that implies broken). They look like normal tabs; the login redirect is the gate. (If product later wants a signal, a small `Lock` overlay is possible — not in this phase.)

### 3.5 Scroll / momentum behavior
The tab bar is **always fixed and always visible** (does not hide on scroll). This is the most predictable native pattern for a 5-tab bar and avoids the "where did my nav go" problem. Header scroll behavior is handled separately (§4.4).

---

## 4. Mobile top header — `MobileHeader` (new component)

Compact, context-aware top bar that **replaces** the desktop `Navbar` below `lg`. **New component:** `frontend/src/components/layout/mobile-header.tsx` (client — needs `usePathname`).

### 4.1 Two variants

**Variant A — Home / root (brand header):**
```
┌───────────────────────────────────────────┐
│  [AI Drama logo]            🔎   [account]  │
└───────────────────────────────────────────┘
```
- Left: `Logo` (brand identity preserved).
- Right: Search icon (link `/search`) **optional** since Search is now a tab — keep it only if product wants quick-search from any page; **recommendation: drop the header search icon on mobile** since Search is a dedicated tab (removes redundancy). Keep the **account/auth** control on the right (see §4.3).

**Variant B — deep page (context header):**
```
┌───────────────────────────────────────────┐
│  ‹ Back      Page title           [account] │
└───────────────────────────────────────────┘
```
- Left: **Back affordance** — `ChevronLeft` icon button, `aria-label="Go back"`, calls `router.back()` (client). Falls back to the tab's root if there's no history (e.g., deep link) — see §4.2.
- Center/left: **Page title** (single line, truncated) — the current section/page name.
- Right: account/auth control (compact) **or** a page-specific action slot (see §4.3).

> **When is it "deep"?** Variant A on the **tab roots** (`/`, `/explore`, `/search`, `/library`, `/studio/upload`). Variant B on **any other path** (a watch page, a title detail, a nested studio page, etc.). The tab bar still shows underneath on both; Back is for *in-section depth*, the tab bar is for *cross-section* jumps.

### 4.2 Title source & back derivation (`usePathname`)

No new data/endpoints. Derive from the route, client-side:

- **Title:** a small static map from path segment → label, e.g.:
  - `/` → brand logo (no title)
  - `/explore` → "Browse"
  - `/search` → "Search"
  - `/library` → "Library"
  - `/series` → "Series", `/movies` → "Films", `/shorts` → "Shorts"
  - `/notifications` → "Notifications"
  - `/studio*` → "Studio" (or sub-labels: `/studio/upload` → "Upload", `/studio/content` → "My Content", mirroring `StudioSidebar` labels)
  - **Fallback:** if a path isn't mapped (e.g. `/watch/[slug]`, `/title/[id]`), show **no title** (or a generic section word) and rely on the page's own `<h1>`; the header stays as a Back + account bar. The page title inside content is the source of truth; the header title is a convenience. **Do not fetch** a resource name for the header in this phase (that would need data — out of scope; flagged §12).
- **Back:** `ChevronLeft` button → `router.back()`. If `window.history.length <= 1` (direct deep link), route to the owning tab root instead (e.g. a `/studio/*` deep link → `/studio`; otherwise `/`). Keep this heuristic simple.

### 4.3 Account / auth on the mobile header (right side)

Reuse `NavAuth`'s logic, rendered compactly:
- **Authenticated:** an avatar/account button (icon `CircleUserRound` or initial) that **opens the "More"/account bottom sheet** (§5) containing: Studio, Notifications, Log out, and the secondary destinations. (Avoids cramming "Studio" + "Log out" text buttons into a tiny header.)
- **Guest:** a single compact **"Sign in"** `Button variant="outline" size="sm"` (the full Sign in / Get started pair moves into the "More" sheet to save header width). Tapping opens `/login`; "Get started" lives in the sheet.

> `NavAuth` itself is not rewritten; the mobile header either reuses it in a compact wrapper or a small `MobileAccountButton` triggers the sheet. Keep logout logic (token discard, `queryClient.clear()`, `router.refresh()`) exactly as in `NavAuth`.

### 4.4 Header scroll behavior (app-like, kept simple)

- **Sticky, with hide-on-scroll-down / show-on-scroll-up ("auto-hide").** The header is `sticky top-0 z-30`. On scroll **down** past ~64px it slides up out of view (`-translate-y-full`); on any scroll **up** it slides back in. This is the common native pattern and reclaims vertical space while reading.
- Transition: `transition-transform duration-200`. **Reduced motion:** when `prefers-reduced-motion: reduce`, **skip the animation and skip hiding** — keep the header permanently visible (no translate). The global CSS already neutralizes transition durations; additionally gate the hide logic so reduced-motion users get a stable sticky header, not an instant jump.
- The **tab bar does not auto-hide** (§3.5) — only the header does. This matches iOS/Android norms (bottom bar persistent, top bar collapses).
- **Simplicity fallback:** if auto-hide proves fiddly, ship a plain **always-sticky** header (`sticky top-0`) with no hide — still app-like. Auto-hide is a nice-to-have, not required for the native feel. Mark it optional in the handoff.

---

## 5. Bottom-sheet pattern — `Sheet` (new, on the Radix dialog primitive)

Native apps use **bottom sheets** (slide up from the bottom) for menus/filters/secondary nav instead of desktop dropdowns. Build on the **existing Radix dialog** (`components/ui/dialog.tsx`) so we inherit the focus trap, `Esc`-to-close, scroll lock, overlay, and focus-return-to-trigger for free.

### 5.1 New component: `Sheet` (`frontend/src/components/ui/sheet.tsx`)

A bottom-anchored variant of `Dialog`. Reuse Radix `@radix-ui/react-dialog` (already a dependency via `dialog.tsx`) — **no new dependency**. Expose `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetClose` mirroring the dialog API.

`SheetContent` differences from `DialogContent`:
- **Position:** `fixed inset-x-0 bottom-0` (not centered). Full width, pinned to the bottom edge.
- **Shape:** `rounded-t-2xl` (rounded top corners only), `border-t border-border`, `bg-popover text-popover-foreground`.
- **Height:** content-sized, `max-h-[85dvh]` with internal `overflow-y-auto`; never full-screen (leave a peek of the dimmed page so it reads as a sheet, not a new page).
- **Grabber:** a small centered `h-1 w-10 rounded-full bg-border` handle at the top (visual affordance; decorative, `aria-hidden`).
- **Safe area:** `pb-[env(safe-area-inset-bottom)]` so the last item/button clears the home indicator.
- **Overlay:** reuse the dialog overlay (`bg-black/80 backdrop-blur-sm`).
- **Animation:** slide up from bottom on open, down on close (`translate-y-full` → `0`). Radix `data-[state=open]`/`data-[state=closed]` drive it. **Reduced motion:** the global `prefers-reduced-motion` rule already zeroes transition/animation durations; the sheet then appears/disappears instantly (acceptable). Ensure the sheet relies on `transition`/`animation` (not a JS tween) so the global rule applies.
- **Title requirement:** like `DialogContent`, every `SheetContent` **must** include a `SheetTitle` (visually hidden is fine) + optional `SheetDescription`, so it's named for screen readers.

> **Grabber is not the only way to close:** tapping the overlay, pressing `Esc`, the `SheetClose`, and (optional) a swipe-down all dismiss. **Swipe-to-dismiss is optional** (Radix doesn't provide it natively; needs a small drag handler). Ship without it first — overlay-tap + a visible close/handle is enough. Flag swipe as a later enhancement.

### 5.2 Where sheets are used (this phase)

1. **"More" / account sheet** — opened from the header account button (§4.3) and/or a "More" trigger. Contents:
   - *Authenticated:* Studio (`/studio`), Notifications (`/notifications`), Series, Films, Shorts, separator, **Log out** (`text-destructive`, runs `NavAuth` logout).
   - *Guest:* Series, Films, Shorts, Notifications, separator, **Sign in** (`/login`), **Get started** (`/signup`, pink).
   - Each item: `44px`+ tall row, leading lucide icon, label, `role="menuitem"`-equivalent (or just links — see a11y §9).
2. **Filters sheet (pattern only)** — when a content page (later phase) needs filters/sort on mobile, it opens a `Sheet` with the controls and an "Apply"/"Clear" footer, instead of the desktop dropdown/popover. **We only define the pattern here**; no specific filter page is built in this phase.

### 5.3 "More" trigger placement
Two acceptable triggers (pick one in build, prefer the first):
1. **Header account button opens the sheet** (recommended) — one affordance, holds account + secondary nav. No 6th tab needed.
2. A dedicated small "More" affordance. **Not recommended** as a 6th tab (crowds the bar); acceptable only inside the Browse page header if product insists.

---

## 6. Content padding for the fixed bar

The fixed `MobileTabBar` would cover page content without reserved space.

- Add bottom padding to the scroll/content area **only below `lg`**, sized to the bar height **plus** the safe-area inset:
  - On `PageShell`'s `<main>` (or a wrapper): `pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0` where `3.5rem` (56px) matches the tab row height. Add a little breathing room: recommend `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` (72px) so content isn't flush against the bar.
  - At `lg+` this padding is removed (`lg:pb-0`) since the tab bar isn't rendered.
- The existing `<main>` already has `py-10`; the extra bottom padding is **in addition** below `lg`. Keep `py-10`'s top; override only bottom on mobile.
- **Footer interaction:** the `Footer` sits inside `PageShell` after `<main>`. Below `lg`, the fixed tab bar overlaps the very bottom; the `pb` on `main` plus the footer's own content means the footer scrolls above the bar. Ensure the **footer also clears the bar** — simplest is to apply the bottom padding on the *outer* `PageShell` wrapper (around both `main` and `Footer`) rather than only `main`, so nothing hides behind the bar. **Recommendation: put the `pb-[calc(...)] lg:pb-0` on the `PageShell` root wrapper.**

---

## 7. How it slots into `PageShell`

`PageShell` today: `<Navbar/>` + `<main class="mx-auto … py-10">` + `<Footer/>`.

Proposed structure (desktop untouched at `lg+`):

```
PageShell (root wrapper: pb for mobile bar, lg:pb-0)
├─ Navbar               → gated: hidden lg:block   (desktop, unchanged markup)
├─ MobileHeader         → lg:hidden                (new; variant A/B via usePathname)
├─ main (centered column, existing)
│    └─ {children}
├─ Footer               (existing; clears the bar via root pb)
└─ MobileTabBar         → lg:hidden fixed bottom   (new; 5 tabs)
```

- **`Navbar` is not edited** — only wrapped/gated with `hidden lg:block` (e.g. a wrapping `<div className="hidden lg:block">` or a class prop). Its internal layout, links, search, and auth stay byte-for-byte for desktop.
- `MobileHeader` + `MobileTabBar` are **new** and only render `< lg`.
- The sheet(s) are triggered from within `MobileHeader` (account/More), so no extra top-level mount is needed beyond Radix's portal.

---

## 8. Component inventory

### Reused as-is
| Component | Path | Role |
|---|---|---|
| `Logo` | `components/layout/logo.tsx` | brand in `MobileHeader` variant A |
| `Button` | `components/ui/button.tsx` | account button, sheet items/links, back button (ghost/icon) |
| `Dialog` primitive | `components/ui/dialog.tsx` | **foundation** the new `Sheet` is built on (same Radix dep) |
| `NavAuth` logic | `components/layout/nav-auth.tsx` | logout behavior reused by the account sheet |
| `useRestoredSession` | `features/auth/hooks/use-restored-session.ts` | auth state for gated tabs + account area |

### New — to build
| New component | Path | Built on | Purpose |
|---|---|---|---|
| `MobileTabBar` | `components/layout/mobile-tab-bar.tsx` | `Link`, `usePathname`, `useRestoredSession`, lucide | fixed 5-tab bottom bar (§3) |
| `MobileHeader` | `components/layout/mobile-header.tsx` | `Link`, `usePathname`, `useRouter`, `Logo`, `Button`, Sheet | compact context header, variants A/B (§4) |
| `Sheet` (+ parts) | `components/ui/sheet.tsx` | Radix `@radix-ui/react-dialog` (existing dep) | bottom-sheet pattern (§5) |
| `MobileNavSheet` *(optional)* | `components/layout/mobile-nav-sheet.tsx` | `Sheet` + `NavAuth`/session | the "More"/account sheet contents (§5.2); may live inside `MobileHeader` |

### Changed (gating only, no redesign)
| File | Change |
|---|---|
| `components/layout/page-shell.tsx` | gate `Navbar` `hidden lg:block`; render `MobileHeader` + `MobileTabBar` (`lg:hidden`); add mobile bottom padding on the root wrapper (`pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0`) |

> **No changes to `NavLinks`, `Navbar` internals, or any content page.** Desktop is defined by the absence of change at `lg+`.

---

## 9. Accessibility (WCAG 2.2 AA)

- **Landmarks:** `MobileHeader` is a `<header>`; `MobileTabBar` is a `<nav aria-label="Primary">` (it's primary navigation, parallel to the desktop `NavLinks` which already uses `aria-label="Primary"` — only one is ever in the DOM per breakpoint, so no duplicate-landmark conflict). The page keeps its own single `<h1>` in content; the header title is **not** an `<h1>` (use a `<span>`/`<p>`), so we don't create two `h1`s.
- **Tab bar semantics:** these are **navigation links**, not a `tablist`/`tabpanel` widget (they change the route, they don't switch panels in place). Use `<nav>` + `<a>` (`Link`). Mark the current destination with **`aria-current="page"`** (same as `NavLinks`), not `aria-selected`. Do **not** use `role="tab"` here — it would wrongly imply tab-panel semantics. (If product ever wants true ARIA Tabs semantics, that's a different widget; for route navigation, links + `aria-current` is correct.)
- **Icon + label tabs:** every tab shows a visible text label, so screen readers get a name from the link text. The leading icon is `aria-hidden`. (Even if a design later hides labels visually, each link would need an `aria-label`; current design keeps labels visible — preferred.)
- **Status not by color alone:** the active tab is signaled by **color + the `aria-current="page"` + a non-color cue** (filled/active icon variant or the 2px top marker). Never pink-only. (WCAG 1.4.1.)
- **Touch target size:** tabs ≥ 56px tall × ≥ 64px wide; back/account/close buttons ≥ 44×44 (use `Button size="icon"` which is `size-10`=40px → bump to a `size-11`/44px wrapper or add padding so the hit area is ≥ 44px). (WCAG 2.5.8.)
- **Back button:** `aria-label="Go back"`, it's a real `<button>`.
- **Account/More button:** `aria-label="Account menu"` (auth) / `aria-label="Menu"` (guest), `aria-haspopup="dialog"`, `aria-expanded` reflecting sheet state (Radix Dialog trigger provides `aria-expanded`/`aria-haspopup` automatically).
- **Bottom sheet:** inherits Radix dialog focus trap, `Esc` close, scroll lock, and **focus return to the trigger** on close. Must include a `SheetTitle` (visually hidden allowed) + `SheetDescription` so it's named — **same rule the dialog primitive documents**. Overlay tap closes. First focusable element (or the sheet container) receives focus on open.
- **Focus visibility:** every tab/button keeps the global pink focus ring (`focus-visible:ring-2 ring-ring`); on the tab bar use `ring-inset` so the ring isn't clipped by the viewport edge.
- **Reduced motion:** header auto-hide and sheet slide both respect `prefers-reduced-motion` — the global CSS zeroes durations; additionally the header hide-on-scroll logic is **disabled** under reduced motion (header stays put) so there's no jump. Sheets appear/disappear without the slide.
- **Keyboard order (mobile):** header (Back → title → account) → page content → tab bar (Home → Browse → Search → Library → Create). No positive `tabindex`. The fixed tab bar is last in DOM order so it doesn't trap keyboard users before content (place `MobileTabBar` after `<main>`/`Footer` in `PageShell`, matching §7).
- **Zoom/reflow:** at 200% zoom / 320px width the tab labels stay single-line short words (`text-[11px]`); icons + labels still fit 5-up at 320px (320/5 = 64px per tab). No horizontal scroll introduced.
- **Live regions:** none needed for navigation. The existing `NavAuth` logout `role="alert"` message is preserved if `NavAuth` is reused in the account area.

---

## 10. Interaction / state matrix (summary)

| Element | Default | Active/current | Pressed | Focus | Auth-guest | Reduced motion |
|---|---|---|---|---|---|---|
| Tab (public) | muted icon+label | pink + `aria-current="page"` + marker | `active:bg-accent/60` | inset pink ring | same | n/a |
| Tab (Library/Create) | muted | pink when in-section | tap feedback | ring | tap → `/login?next=…`; still visible | n/a |
| Header (variant A) | brand + account | — | — | ring on buttons | account → "Sign in" btn | stays sticky, no auto-hide |
| Header (variant B) | back + title + account | — | back `active:bg-accent/60` | ring | — | stays sticky |
| Header auto-hide | visible | hides on scroll-down, shows on scroll-up | — | — | — | **disabled** (always visible) |
| Sheet | closed | open (slide up) | — | trap + return | guest shows Sign in/Get started | no slide; instant |

---

## 11. No new data / endpoints

**Confirmed presentation + client-routing only.** Everything derives from:
- `usePathname()` (active tab, header variant, title map) — already used by `NavLinks`.
- `useRouter().back()` (back button).
- `useRestoredSession()` (auth gating + account area) — already used by `NavAuth`.

No new fetches, no resource-name lookups for the header (fallback to no-title / the page's own `<h1>`). **No backend work required.** The only dependency check: Radix `@radix-ui/react-dialog` is already installed (used by `dialog.tsx`), so the `Sheet` needs **no new package**.

---

## 12. Open questions / assumptions

1. **Studio mobile nav** — `StudioSidebar` is `hidden … md:block`, so on phones Studio sub-pages (`/studio/content`, `/studio/analytics`, etc.) currently have **no in-section nav**. This spec keeps the **Create** tab active across `/studio*` and routes back to `/studio`, but a proper **mobile Studio nav** (sidebar → sheet/segmented control) is a **follow-up** out of this level-1 scope. *Flagged; not built here.*
2. **Create tab emphasis** — raised pink center pill vs. flat `Clapperboard`. *Assumption: flat `Clapperboard` for an even bar; promote to the raised `Plus` pill only if product wants the center-create pattern. Proceed with flat.*
3. **Header search icon** — redundant with the Search tab. *Assumption: drop it on mobile. Proceed; trivially re-addable.*
4. **Header auto-hide** — nice-to-have. *Assumption: ship it, but a plain always-sticky header is an acceptable fallback. Proceed.*
5. **Swipe-to-dismiss sheets** — not provided by Radix. *Assumption: ship overlay-tap + handle + Esc first; swipe is a later enhancement. Proceed.*
6. **Deep-link title names** (e.g. a specific title on `/watch/[slug]`) — would need data. *Assumption: header shows no title / generic section word and defers to the page `<h1>`; no fetch. Proceed.*
7. **Exact tab icon for Browse/Create** — `Compass` for Browse, `Clapperboard` for Create assumed from lucide; swap freely if product prefers (`LayoutGrid` for Browse, `Plus` for Create). *Proceed.*

---

## 13. Handoff block (for frontend-engineer)

**Scope:** additive, **mobile-only** (`< lg`) app shell. **Desktop at `≥ lg` is untouched** — the existing `Navbar`/`NavLinks` render exactly as today. No content pages redesigned. No backend/data changes. No new npm package (reuse Radix dialog dep).

**Breakpoint rule (exact):** boundary is **`lg` (1024px)**, matching today's `NavLinks` (`lg:flex`).
- `< lg`: render `MobileHeader` + `MobileTabBar` (`lg:hidden`); wrap existing `<Navbar/>` in `hidden lg:block`.
- `≥ lg`: existing `Navbar`/`NavLinks` only; mobile components hidden.

**Bottom tab bar — `MobileTabBar` (new, `components/layout/mobile-tab-bar.tsx`, client):**
- 5 tabs, `grid grid-cols-5`, icon (`size-5`) + `text-[11px]` label, each ≥ 56px tall / ≥ 64px wide.
- Items (label · route · lucide icon · auth):
  1. Home · `/` · `Home` · public
  2. Browse · `/explore` · `Compass` · public
  3. Search · `/search` · `Search` · public
  4. Library · `/library` · `Bookmark` · **auth** → guest tap routes to `/login?next=/library`
  5. Create · `/studio/upload` · `Clapperboard` (default; optional raised `Plus` pill) · **auth** → guest tap routes to `/login?next=/studio/upload`
- Active match: `href === "/" ? pathname === "/" : pathname.startsWith(href)`; Create matches `/studio*`.
- Active = `text-primary` + `aria-current="page"` + a non-color cue (2px top `bg-primary` marker or active icon); inactive = `text-muted-foreground`.
- Gated tabs are **always visible** (never hidden/dimmed) and redirect guests to login with `next`; destinations still enforce auth.
- Container `fixed inset-x-0 bottom-0 z-40 lg:hidden border-t border-white/5 bg-background/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]`.
- `<nav aria-label="Primary">` of `<a>` links (NOT `role="tab"`). Focus ring `focus-visible:ring-2 ring-ring ring-inset`. Placed **after** `<main>`/`Footer` in DOM.

**Mobile header — `MobileHeader` (new, `components/layout/mobile-header.tsx`, client):**
- `sticky top-0 z-30 lg:hidden`, translucent (`bg-background/60 backdrop-blur-xl border-b border-white/5`), ~h-14.
- **Variant A** (tab roots `/ /explore /search /library /studio/upload`): `Logo` left + account/auth control right. (Header search icon dropped — Search is a tab.)
- **Variant B** (any other path): `ChevronLeft` back button (`aria-label="Go back"`, `router.back()`; if `history.length <= 1`, go to owning tab root else `/`) + truncated **page title** + account control right.
- Title from a static `pathname → label` map (`/explore`→Browse, `/series`→Series, `/movies`→Films, `/shorts`→Shorts, `/notifications`→Notifications, `/studio*`→Studio/Upload/My Content, etc.); unmapped paths show no title (defer to page `<h1>`). Title is a `<span>`, **not** `<h1>`.
- Account control: authenticated → avatar/account button (`aria-label="Account menu"`, `aria-haspopup="dialog"`) opening the "More"/account sheet; guest → compact `Sign in` outline button; reuse `NavAuth` logout logic verbatim in the sheet.
- **Auto-hide on scroll** (down hides, up shows, `transition-transform duration-200`): optional; **disable under `prefers-reduced-motion`** (stay visible); plain always-sticky is an acceptable fallback.

**Bottom sheet — `Sheet` (new, `components/ui/sheet.tsx`, on existing Radix `@radix-ui/react-dialog`):**
- Bottom-anchored dialog: `fixed inset-x-0 bottom-0 rounded-t-2xl border-t bg-popover max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]`, slide up/down via Radix `data-[state]`, decorative grabber handle, overlay reuse.
- Export `Sheet/SheetTrigger/SheetContent/SheetHeader/SheetTitle/SheetDescription/SheetClose`. **Require a `SheetTitle`** (visually hidden OK) per the dialog primitive's rule. Inherits focus trap / Esc / scroll-lock / focus-return.
- **"More"/account sheet contents:** authenticated → Studio, Notifications, Series, Films, Shorts, separator, Log out (`text-destructive`); guest → Series, Films, Shorts, Notifications, separator, Sign in, Get started (pink). Rows ≥ 44px, leading icon + label.
- Swipe-to-dismiss is a later enhancement; ship overlay-tap + Esc + close.

**`PageShell` change (`components/layout/page-shell.tsx`) — gating only:**
- Root wrapper gets `pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0` so neither `<main>` nor `Footer` hides behind the fixed bar.
- Gate `<Navbar/>` with `hidden lg:block`; render `<MobileHeader/>` and (after content) `<MobileTabBar/>` with `lg:hidden`. **Do not edit `Navbar`/`NavLinks` internals.**

**Content bottom padding:** `4.5rem` (72px: 56px bar + breathing room) + safe-area inset, mobile only, removed at `lg`.

**Breakpoints:** single boundary `lg` (1024px). Below = mobile shell; at/above = desktop unchanged. Tabs fit 5-up down to 320px (64px each). No horizontal scroll.

**A11y:** `<nav aria-label="Primary">` + `<a>` + `aria-current="page"` for tabs (not `role=tab`); visible labels + `aria-hidden` icons; active state color **plus** marker (never color alone); targets ≥ 44px (tabs ≥ 56px); back/account/close are real buttons with `aria-label`; sheet = Radix dialog a11y (focus trap, Esc, return, named via `SheetTitle`); focus ring preserved (`ring-inset` on tabs); reduced motion disables header auto-hide and sheet slide; header title is not an `<h1>`; mobile nav placed after content in DOM.

**New components:** `MobileTabBar`, `MobileHeader`, `Sheet` (+ parts), optional `MobileNavSheet`. **Changed:** `page-shell.tsx` (gating + padding only). **No data/endpoint work.**

**Out of scope / follow-up:** mobile Studio in-section nav (replace `StudioSidebar` with a sheet/segmented control on phones) — flagged, not built in this level-1 phase.
