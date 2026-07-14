# Lumeo Aura Design System

Lumeo Aura is a luminous evolution of Midnight Notary. It keeps Lumeo's document-focused trust and privacy identity while making the product brighter, more tactile, more welcoming, and easier to extend across public PDF tools and the Control Center.

## 1. Design Philosophy

Lumeo should feel like a premium document workspace: calm, capable, precise, and modern. The interface should help people understand what is happening to important documents without feeling like a generic SaaS dashboard or utility clone.

## 2. Emotional Goals

- Bright, refined and globally professional
- Tactile without being playful for its own sake
- Spacious without hiding the actual tool
- Trustworthy without becoming governmental or clinical
- Stylish without copying Apple, Linear, Stripe, Notion, Vercel, iLovePDF, Smallpdf, Adobe, or PDF24

## 3. Colour System

Core colours live as semantic CSS variables in `app/globals.css`.

- Ink: `--lumeo-ink-950` through `--lumeo-ink-750`
- Paper: `--lumeo-paper-50` through `--lumeo-paper-600`
- Seal Green: `--lumeo-seal-400` through `--lumeo-seal-700`
- Premium Gold: `--lumeo-gold-300` through `--lumeo-gold-500`
- Aura Blue: `--lumeo-aura-300` through `--lumeo-aura-500`
- Status: `--lumeo-success`, `--lumeo-warning`, `--lumeo-danger`, `--lumeo-info`

Seal Green remains the primary action colour. Gold is reserved for emphasis, selection and special moments. Aura Blue supports focus, information and atmospheric depth.

## 4. Typography

The current Manrope and DM Serif Display setup stays in place.

- Display/editorial: DM Serif Display
- Interface/body: Manrope
- Numeric/data: tabular numerals through `.aura-tabular`

The scale includes display, heading, body, label, caption and micro tokens. Headlines should be confident and spacious. Body text should remain readable at 320px.

## 5. Spacing

Spacing follows a 4px rhythm:

- `--space-1` through `--space-20`
- Page gutters use `--page-gutter`
- Container widths: compact, content, workspace, wide and full

Use spacing and surface contrast before adding more borders.

## 6. Surfaces

Surface tokens:

- `--surface-canvas`
- `--surface-base`
- `--surface-raised`
- `--surface-elevated`
- `--surface-floating`
- `--surface-input`
- `--surface-overlay`

Surfaces should feel luminous and layered, not black-on-black.

## 7. Elevation

Elevation tokens use layered shadows and subtle inner highlights:

- `--shadow-xs`
- `--shadow-sm`
- `--shadow-md`
- `--shadow-lg`
- `--shadow-xl`
- `--shadow-floating`
- `--shadow-focus`
- `--shadow-success`

Avoid heavy glow and exaggerated 3D transforms.

## 8. Radii

Radius tokens:

- `--radius-xs`
- `--radius-sm`
- `--radius-md`
- `--radius-lg`
- `--radius-xl`
- `--radius-2xl`
- `--radius-pill`

Use purposeful radii. Buttons and chips can be pill-shaped. Panels and tool trays should be restrained.

## 9. Motion

Motion tokens:

- Durations: instant, fast, standard, expressive and entrance
- Easings: standard, enter, exit and spring-soft

Reusable animations:

- `aura-fade-in`
- `aura-fade-up`
- `aura-scale-in`
- `aura-slide-down`
- `aura-menu-reveal`
- `aura-drawer-enter`
- `aura-shimmer`
- `aura-success-reveal`
- `aura-progress-sheen`

All motion respects `prefers-reduced-motion`.

## 10. Buttons

Use `AuraButton` and `AuraIconButton`.

- Primary: Seal Green
- Secondary: quiet paper surface
- Premium: restrained gold
- Ghost: navigation and low emphasis
- Danger: recoverable destructive actions only

Buttons must keep visible focus, tactile press, loading state, disabled state and practical touch targets.

## 11. Form Controls

Foundations include input, textarea, select, checkbox, switch, radio group, segmented control, tabs and search input.

Controls must:

- keep labels visible
- associate help/error text
- avoid harsh validation blocks
- remain usable at 320px
- avoid colour-only state
- use keyboard focus states

## 12. Cards

`AuraCard`, `AuraPanel` and `AuraSurface` are the basic surfaces. Cards can lift subtly on hover when interactive. Do not make every section a heavy floating box.

## 13. Navigation

Run 1 adds a reusable `AuraPublicNav` and `AuraPublicFooter` foundation. These are not fully rolled out yet. The Control Center shell receives Aura-compatible surfaces and a protected guide link.

## 14. Tool Workspaces

Run 1 adds foundations:

- `ToolWorkspaceShell`
- `ToolStepHeader`
- `ToolUploadStage`
- `ToolSettingsStage`
- `ToolProcessingStage`
- `ToolResultStage`
- `ToolPrivacyNote`
- `ToolActionBar`
- `ToolDocumentSummary`
- `ToolModeCard`
- `ToolOptionRow`

These support future JPG to PDF, PDF to JPG, Rotate, Delete Pages, Extract Pages, Reorder, Watermark, OCR, Sign and Protect tools. Current Merge, Split and Compress processing algorithms are not migrated in Run 1.

## 15. Control Center

The Control Center should feel like a private operations desk, not an analytics template. Run 1 adds Aura surfaces, a guide entry and a protected design-system showcase.

## 16. Guidance System

Admin guidance foundations:

- `AdminWhatThisControls`
- `AdminImpactPreview`
- `AdminDependencyList`
- `AdminStoredOnlyNotice`
- `AdminRiskIndicator`
- `AdminChangeSummary`
- `AdminGuideLink`
- `AdminSettingExplanation`

These explain what options control, runtime wiring, risk, dependencies, deployment impact and history preservation.

## 17. Accessibility

Target WCAG 2.2 AA:

- visible focus
- skip-to-content support
- keyboard navigation
- Escape support for overlays
- semantic headings
- labelled forms
- 44px touch targets where practical
- colour not used alone
- high zoom resilience
- reduced motion
- accessible tables

## 18. Responsive Rules

- Public tools should prioritize the workspace above marketing copy.
- Mobile stacks should remain touch-friendly and readable.
- Desktop app shells should avoid page-level scroll only when content can fit safely.
- Dense admin pages can scroll, but data tables need horizontal overflow handling.

## 19. Performance

No large UI framework is introduced. Use Server Components by default. Client components are reserved for local interaction. Avoid continuous decorative animation and excessive backdrop filters.

## 20. Content Tone

Use calm, honest language:

- "Browser-only"
- "Stored only"
- "Requires setup"
- "Planned"
- "Unavailable"

Avoid fake guarantees, urgency, hype and ungrounded claims.

## 21. Do And Do Not

Do:

- use semantic tokens
- use Seal Green for primary action
- reserve Gold for emphasis
- explain stored-only settings
- keep privacy wording accurate

Do not:

- hard-code new palette colours in Run 2 pages
- invent metrics
- add fake progress
- create public design-system routes
- hide important controls just to remove scroll

## 22. Run 2 Migration Plan

1. Migrate public homepage sections to Aura public shell.
2. Migrate PDF Tools directory cards.
3. Migrate Merge, Split and Compress visual layers without changing engines.
4. Build JPG to PDF and PDF to JPG on the tool workspace foundation.
5. Add contextual guidance to Control Center pages.
6. Replace legacy hard-coded colours page by page.
7. Add focused interaction tests where controls become business-critical.

## 23. Future Component Contribution Rules

- Add a component only when it will be reused.
- Prefer semantic tokens over hard-coded colours.
- Keep prop APIs small and typed.
- Preserve accessibility names and keyboard use.
- Document stored-only or planned behaviour honestly.
- Do not add dependencies for simple UI primitives.
- Verify with `npm.cmd run verify:aura`.

## 24. Run 2 Rollout

Run 2 applies the Aura foundation to the visible Lumeo product without rewriting processing engines or security boundaries.

### Public surfaces

- The homepage uses a brighter Aura canvas, compact product message and immediate PDF tool workspace.
- The PDF tools directory keeps Supabase catalog data as its source of truth while adopting Aura cards, sections and focus states.
- Informational pages use luminous document panels rather than dense dark blocks.
- The PDF tools menu, public nav and footer use satin surfaces, restrained blur and accessible keyboard focus.

### PDF tools

Merge PDF, Split PDF and Compress PDF remain algorithmically unchanged. Run 2 preserves browser-first processing, output handling, analytics privacy rules and existing validation. Visual work is intentionally limited to shared shells, launchers, placeholders and surrounding navigation unless a future tool-specific pass is scheduled.

### Control Center

Shared admin primitives now use Aura surfaces, table styling, form focus states, tactile buttons and calmer empty states. This updates overview, analytics, tools, homepage, feature flags, announcements, SEO, audit, system and settings pages through their common components.

### Guide and showcase

The protected Design System showcase remains at `/admin/design-system`. The protected admin guide at `/admin/guide` explains runtime impact, stored-only states, dependencies, risk and deployment expectations for the current Control Center.

### Run 2 constraints

- No Supabase migrations changed.
- No SQL was executed.
- No PDF processing algorithms were changed.
- No analytics provider, privacy rule or admin permission model was weakened.
- No public claims were added for behaviour that is only stored for future wiring.

### Run 3 candidates

- Migrate individual Merge, Split and Compress internals to shared `ToolWorkspace` components after visual QA.
- Add richer contextual guidance to each Control Center form.
- Add compact Aura loading states for data-heavy admin tables.
- Apply Aura result cards to future JPG/PDF conversion tools as they become real engines.
