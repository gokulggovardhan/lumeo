# Aura OS v2 — Foundation Plan

Branch: `feat/aura-os-v2` (based on `main` @ `d5143fa`, same commit as tag `v1.0.0-production-stable`)
Date: 2026-07-30
Status: **Planning only. No implementation. No code changed on this branch yet.**

## Honesty notice

Phase 2 (architectural analysis) below is grounded in files actually read
this session — cited by path/line. Phase 3 (design research) is
necessarily different in kind: no live browsing of iOS 26, VisionOS,
macOS Tahoe, OxygenOS, Nothing OS, Arc, Linear, Raycast, Stripe, Notion,
Figma, or Vercel's current products was done or is possible from this
environment. That section draws on general, pre-trained knowledge of
these products' publicly documented design principles as of this
model's training — it is a synthesis, not a fresh audit, and is labeled
as such throughout. Treat it as a starting reference, not verified fact.

---

## 1. Phase 2 — Architectural analysis (grounded in code read this session)

### Design token system (`app/globals.css`, 1254 lines, 258 custom properties)

The color system carries **three overlapping naming generations** in the
same file, kept alive via alias chains for backward compatibility:

1. `--lumeo-*` (original "Lumeo Aura" palette — ink/paper/seal/gold)
2. `--atelier-*` (current "Lumeo Atelier" palette — canvas/surface/ivory/sage/brass) — this is the one actually driving most components today
3. `--maison-*` and generic names (`--canvas-*`, `--paper-*`, `--emerald-*`, `--champagne-*`, `--sky-*`, `--ruby-*`) — pure aliases pointing back to `--atelier-*`, kept so older component code that references the old names doesn't break

On top of those sit **semantic tokens** (`--text-primary`, `--surface-raised`,
`--action-primary`, `--border-focus`, `--shadow-md`, etc.) — this semantic
layer is well-designed and is what most components should already be
consuming.

**Real gaps found:**
- **No glass/blur token system.** Zero `blur`/`backdrop` custom properties
  defined. `backdrop-filter` is used in exactly 2 files
  (`components/layout/AuraPublicShell.tsx`, `components/pdf/PdfToolLauncher.tsx`)
  as raw Tailwind arbitrary values, not a reusable token. Any "glass"
  aesthetic for v2 needs this built from scratch.
- **No light theme.** Zero `prefers-color-scheme` or `[data-theme]` rules
  anywhere in `globals.css` — confirmed in an earlier pass this session.
  This is a deliberate single-dark-theme brand today, not a bug, but v2's
  "Light theme" requirement (Phase 5) is genuinely new work, not a toggle
  away.
- **Three-generation naming debt.** Every new v2 token added on top of
  this without a plan risks becoming a fourth generation. v2's token
  spec (Section 5 below) proposes resolving this, not adding to it.

**What's solid:**
- Fluid typography via `clamp()` (`--text-display-xl` through
  `--text-micro`, 12 sizes) — already responsive without breakpoint
  juggling.
- A complete elevation/shadow scale (`--shadow-xs` through `--shadow-xl`,
  plus semantic `--shadow-floating`, `--shadow-interactive`,
  `--shadow-focus`, `--shadow-success`, `--shadow-danger`).
- A real motion system: 5 duration steps (`--motion-instant` 90ms through
  `--motion-entrance` 320ms) and 3 named easing curves
  (`--ease-standard`, `--ease-enter`, `--ease-exit`), all defined once
  and reused via `var()` — this is genuinely good infrastructure to build
  v2's motion language on top of, not replace.
- A 7-step radius scale (`--radius-xs` 0.375rem through `--radius-pill`).

### Component hierarchy

- `components/ui/Aura.tsx` (990 lines) — the core primitive library:
  `AuraButton`/`AuraIconButton` (7 variants each, confirmed complete
  hover/focus-visible/active/disabled/loading state coverage this
  session), `AuraSurface`, `AuraBreadcrumbs`, `AuraTabsRoot`/`AuraTabsList`,
  `AuraToast`, `L2FeaturedToolCard`, `L2ToolCard`, `L2DirectoryToolCard`,
  `L2TrustRail`, `L2PublicEmptyState`, `L2SkeletonCard`, and more — this
  is Lumeo's actual design-system source of truth today.
- `components/pdf/workspace/ToolWorkspace.tsx` (674 lines) — the
  tool-specific layer: `L2UploadStage`, `L2FileCard`, `L2ActionArea`,
  `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2ProgressState`,
  `L2ResultState`, `L2PrivacyNote` (the trust badge fixed earlier this
  session), `ToolWorkspaceLoading`. Every one of the 14 tool pages
  composes its empty/loading/result states from this file — confirmed by
  reading all 14 tool components this session.
- `lib/tools/catalog.ts` — a single declarative array of 48 tool entries
  (`label`/`slug`/`route`/`live`), only 14 marked `live: true`. This is
  the tool-registration system, and it's already built for scale
  (confirmed reading the file directly).

### Layouts, navigation, admin

- `components/layout/AuraPublicShell.tsx` — public site nav/footer shell.
- `app/admin/(protected)/layout.tsx` + `components/admin/AdminShell.tsx`,
  `ControlCenterShell.tsx`, `ControlCenterMobileNav.tsx` — a separate
  admin shell, structurally independent from the public shell.
- `app/pdf/layout.tsx` — the PDF-tools-specific layout wrapper.

**Dependency direction**: `Aura.tsx` (primitives) → `ToolWorkspace.tsx`
(tool-composition layer) → 14 individual tool components → 14
`app/pdf/*/page.tsx` route files (metadata + `dynamic()` import wrapper).
Admin has its own parallel primitive set (`components/admin/*`) that
does **not** currently share `Aura.tsx`'s button/card primitives — worth
confirming in Phase 6's component audit whether that's deliberate
separation or duplication.

### Build/CSS architecture

- Tailwind v4.3.2, CSS-first config (`@import "tailwindcss"` in
  `globals.css` + `postcss.config.mjs`, no `tailwind.config.ts` — this is
  the modern Tailwind v4 pattern, not a missing file).
- No CSS-in-JS, no styled-components — Tailwind utility classes plus
  `var(--token)` arbitrary values throughout, e.g.
  `bg-[var(--surface-raised)]`. This pattern is consistent and should
  carry into v2.

---

## 2. Phase 3 — Design research (general knowledge synthesis, not live-verified)

Common threads across the referenced products, as documented publicly:

- **iOS 26 / visionOS / macOS Tahoe**: continued push toward translucent,
  layered "material" surfaces (their term for tuned blur+tint+specular
  highlight combinations), large corner radii scaling with control size,
  spring-based motion (not linear/ease curves) for anything the user
  directly manipulates, and a strong content-vs-chrome hierarchy where
  navigation recedes until touched.
- **OxygenOS / Nothing OS**: restraint over decoration — fewer, larger
  touch targets, generous whitespace, a limited and disciplined color
  palette (often near-monochrome with one accent), and transitions that
  favor simple scale/fade over elaborate choreography.
- **Material 3 Expressive**: motion and shape as an intentional
  personality layer (not just easing), a defined small set of shape
  "families," and explicit state-layer opacity tokens for
  hover/pressed/focus rather than ad-hoc color shifts.
- **Linear / Raycast**: near-zero decorative chrome, everything reachable
  by keyboard, extremely fast perceived transitions (100-150ms range),
  and command-palette-style navigation as a first-class pattern, not an
  afterthought.
- **Stripe Dashboard / Vercel / Notion / Figma**: dense information
  surfaces that still read as calm, achieved through a strict typographic
  scale, consistent 4/8px spacing rhythm, and muted default states with
  color reserved for meaning (status, selection, danger) rather than
  decoration.
- **Apple HIG** (the one directly citable, documented source rather than
  inferred product behavior): explicit guidance that focus rings, hit
  targets, and motion should communicate *state*, not just look nice —
  motion has a purpose (orient the user through a change), not
  ornamentation.

**Cross-cutting pattern, stated plainly**: none of these products'
"premium" feeling comes from a single visual trick (blur, gradients,
shadows). It comes from *restraint applied consistently* — a small token
set used everywhere, motion that's fast and purposeful rather than showy,
and hierarchy established through spacing and type weight before color.
Lumeo's existing motion-duration/easing system (Section 1) is already
aligned with the "fast, purposeful" half of that; the token-generation
sprawl (Section 1) works against the "small set used everywhere" half.

---

## 3. Current UI weaknesses (evidence-backed, from this session's audits + this analysis)

1. Three generations of color-token naming layered with alias chains —
   real maintenance debt, confirmed by reading `globals.css` directly.
2. No glass/blur design-token system — only 2 ad-hoc `backdrop-filter`
   usages, no reusable primitive.
3. No light theme — single fixed dark theme by design, but v2 explicitly
   asks for one.
4. Root 404 and error pages are unbranded (Next.js defaults) — documented
   in `docs/PLATFORM_HARDENING_AUDIT.md` from an earlier pass.
5. Admin's component primitives (`components/admin/*`) appear structurally
   separate from `Aura.tsx` — not yet confirmed whether this is
   intentional separation of concerns or true duplication (Phase 6 task).
6. No CSP yet (documented in `docs/SECURITY_CERTIFICATION.md`) — not a
   design issue, but relevant if v2 introduces new script/style sources.

## 4. Current UI strengths (keep, don't rewrite)

1. A genuinely complete motion-duration + easing-curve system already in
   place and consistently `var()`-referenced.
2. A fluid, `clamp()`-based typography scale that's already responsive.
3. A complete shadow/elevation scale with semantic aliases.
4. `AuraButton`'s state coverage (hover/focus-visible/active/disabled/
   loading) across all 7 variants is already correct and complete —
   confirmed this session, nothing to redo here.
5. The tool-catalog architecture (`lib/tools/catalog.ts`) is already
   built to scale to the next 50 tools without structural change.
6. `ToolWorkspace.tsx`'s shared primitives (`L2UploadStage`, `L2FileCard`,
   `L2PrivacyNote`, etc.) are already consistently used across all 14
   tools (confirmed, and one real gap in that consistency was found and
   fixed earlier this session).

---

## 5. Version 2 design philosophy

**One sentence**: restraint, purposeful motion, and a single small token
set used everywhere — not a visual trick, a discipline.

**Concretely, for Lumeo v2**:
- Resolve the token-generation sprawl *before* adding new v2 tokens — one
  canonical semantic layer, legacy `--lumeo-*`/`--maison-*` names either
  formally deprecated with a removal plan or folded away, not joined by a
  fourth naming generation.
- Motion: keep the existing duration/easing system as the foundation:
  extend it with a small number of *purpose-named* transitions (e.g. "the
  curve used when a card enters," "the curve used when a sheet
  dismisses") rather than inventing new arbitrary durations per
  component.
- Glass/blur: build as a deliberately small set (2-3 "elevation classes"
  of blur+tint, not a blur-per-component free-for-all), reserved for
  actual floating/overlay surfaces (dialogs, command palettes, bottom
  sheets) — not applied decoratively to static cards, matching how iOS
  reserves "material" for genuinely floating chrome.
- Light theme: derive from the existing semantic token names (`--surface-*`,
  `--text-*`, etc.) so components don't need to change, only the values
  those tokens resolve to per theme — this is why resolving the
  three-generation aliasing problem first matters: a light theme built on
  top of `--maison-canvas-950` -> `--atelier-canvas-950` -> literal hex is
  three times the surface area to get right.
- Admin vs. public: decide explicitly in Phase 6 whether admin adopts the
  same primitive set as public tools, or keeps a deliberately distinct
  (denser, more utilitarian) design language — both are legitimate
  choices, but it should be a decision, not accidental drift.

---

## 6. Complete implementation roadmap (Phase 5-7 output)

Each phase below is independently testable and shippable on its own PR,
gated behind the existing `verify:release` pipeline, with no phase
requiring the next to already exist in production.

| Phase | Scope | Depends on | Est. effort* |
|---|---|---|---|
| V2-1 | Design tokens: resolve the 3-generation color aliasing, add light-theme values, add the small glass/blur token set, document naming convention | None (foundation) | Medium |
| V2-2 | Buttons: audit `AuraButton`/`AuraIconButton` against v2 tokens, add any new variant needed (unlikely — current coverage is already complete) | V2-1 | Small |
| V2-3 | Inputs, checkboxes, radios, switches | V2-1 | Medium |
| V2-4 | Cards, badges, alerts | V2-1 | Small-Medium |
| V2-5 | Dialogs, dropdowns, context menus, bottom sheets (new pattern) | V2-1, V2-2 | Medium-Large |
| V2-6 | Navigation: public nav, admin nav, breadcrumbs | V2-1 through V2-5 | Medium |
| V2-7 | Homepage | V2-1 through V2-6 | Medium |
| V2-8 | PDF workspace shell (`ToolWorkspace.tsx` primitives) | V2-1 through V2-6 | Large — highest-traffic, highest-regression-risk surface |
| V2-9 | Individual tool pages (14x, can parallelize per-tool once V2-8 primitives exist) | V2-8 | Large, but each tool is independently shippable |
| V2-10 | Admin console | V2-1 through V2-6, plus the admin-vs-public decision from Section 5 | Medium-Large |
| V2-11 | Accessibility pass (contrast, focus order, screen reader) across everything shipped so far | V2-1 through V2-10 | Medium |
| V2-12 | Performance pass (bundle size, animation jank) across everything shipped so far | V2-1 through V2-10 | Small-Medium |
| V2-13 | Final QA: full live-browser walkthrough of all 14 tools + admin, before merge to main | Everything above | Medium |

*Effort is a rough relative sizing (Small/Medium/Large), not a time
estimate in hours or days — this session has no reliable basis to commit
to calendar time, and a fabricated number would violate the no-guessing
rule.

## 7. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| V2-8/V2-9 (PDF workspace, tool pages) touch the highest-traffic surface — a regression here directly breaks revenue-critical flows | High | Ship tool-by-tool (V2-9 is explicitly parallelizable per-tool), keep `verify:release` gating every PR, live-verify each tool in a browser before merge (same discipline used this session) |
| Token resolution (V2-1) touches every component transitively | High if done carelessly | Do it first, alone, with the full 207-test suite plus a live visual pass on every route as the acceptance bar before V2-2 starts |
| Light theme is entirely new surface area, easy to under-scope | Medium | Explicitly out of V2-1's "small" estimate if it turns out to need per-component overrides rather than pure token-value swaps — re-scope after V2-1's actual diff is visible, don't guess now |
| Admin/public primitive divergence (Section 5) decided implicitly instead of explicitly | Medium | Make it an explicit decision at the start of V2-6, not discovered mid-implementation |
| Feature-branch drift from `main` while v2 work is long-running | Low-Medium | Rebase/merge `main` into `feat/aura-os-v2` regularly, since Phase 22-style hardening work will likely continue landing on `main` in parallel |

## 8. Component dependency graph

```
app/globals.css (258 tokens, 3 naming generations)
        |
        v
components/ui/Aura.tsx (primitives: Button, Card, Toast, Tabs, ...)
        |
        v
components/pdf/workspace/ToolWorkspace.tsx (L2UploadStage, L2FileCard,
        L2ActionArea, L2PrivacyNote, L2ResultState, ...)
        |
        v
components/pdf/{Merge,Split,Compress,...}Tool.tsx  x14
        |
        v
app/pdf/{merge,split,compress,...}/page.tsx  x14  (metadata + dynamic import)

-- parallel, structurally separate branch --
components/admin/{AdminShell,ControlCenterShell,...}.tsx
        |
        v
app/admin/(protected)/*/page.tsx
```

Public site nav (`components/layout/AuraPublicShell.tsx`) and the
tool-catalog data (`lib/tools/catalog.ts`) both sit alongside this graph
as configuration/shell layers each page consumes independently.

## 9. Folder structure proposal

No new top-level restructure is proposed — the existing
`components/ui/` (primitives) -> `components/pdf/workspace/`
(tool-composition) -> `components/pdf/` (tool implementations) layering
already matches how a v2 token/primitive rebuild would need to flow, and
changing it would add unnecessary diff noise to every phase above. The
one concrete addition:

```
components/ui/
  Aura.tsx              (existing — primitives)
  aura-v2/               <- new, if V2-1 through V2-5 land incrementally
    tokens.css            (or tokens.ts, resolved during V2-1)
    glass.ts               (new blur/glass primitive, V2-1)
    ... new/updated primitives land here during their phase,
        then get promoted into Aura.tsx (or replace it) once
        the whole primitive layer is v2-complete, avoiding a
        big-bang rename mid-flight.
```

This lets V2-1 through V2-6 ship incrementally without every intermediate
PR needing to touch all 14 tool components at once.

## 10. Design token proposal (starting point, not final — resolve during V2-1)

- Keep the existing **semantic layer** names as-is (`--text-primary`,
  `--surface-raised`, `--action-primary`, `--border-focus`, `--shadow-md`,
  etc.) — components already consume these, and v2 should change what
  they resolve to, not their names, wherever possible.
- Deprecate (not silently keep growing) the `--lumeo-*` and `--maison-*`
  aliases — during V2-1, grep every remaining consumer of each alias, and
  either fold it into the semantic layer or confirm it's truly needed and
  document why, rather than adding v2 values on top of a fourth
  generation.
- New for v2, genuinely absent today: `--glass-*` tokens (a small set —
  e.g. `--glass-thin`, `--glass-regular`, `--glass-thick`, each bundling a
  blur radius + tint + border treatment as Apple's "material" concept
  does), and a `[data-theme="light"]` block providing light-mode values
  for the existing semantic tokens.

---

## Recommendations before writing the first line of code

1. **Resolve the token-generation sprawl as V2-1's actual first commit**,
   before any new v2 visual work — everything downstream is cheaper once
   there's one naming generation instead of three.
2. **Decide the admin-vs-public primitive question explicitly** (Section
   5) before V2-6, so it's a decision on record, not something
   discovered halfway through admin work.
3. **Ship V2-9 (tool pages) one tool at a time**, each independently
   live-verified in a browser before merge — this is the highest-risk
   surface in the whole roadmap and the one place a shortcut would
   directly cost real users a working PDF tool.
4. **Re-scope the light-theme estimate after V2-1's real diff exists**,
   not before — this plan's "Medium" estimate is a guess bounded by
   what's knowable before the token work starts, not a commitment.
5. Keep this branch (`feat/aura-os-v2`) regularly synced with `main`,
   since hardening/audit work is still landing there in parallel to this
   plan.

---

**This plan is complete. No implementation has occurred. Awaiting
approval before Phase 1 (V2-1: design tokens) implementation begins.**
