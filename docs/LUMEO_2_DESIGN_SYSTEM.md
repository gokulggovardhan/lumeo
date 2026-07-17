# Lumeo 2.0 Design System

Lumeo 2.0 is the flagship visual foundation for Lumeo PDF Workspace. Its internal visual language is **Lumeo Canvas**: a private document studio with warm editorial detail, precise modern controls and calm tactile depth.

## 1. Product Vision

Lumeo should feel elegant, bright, refined, warm, fast and trustworthy without becoming generic software. The system supports public PDF tools, informational pages and the protected Control Center from one reusable foundation.

## 2. Emotional Benchmark

The goal is confidence and delight: a handcrafted product that feels serious enough for important documents and welcoming enough for everyday work.

## 3. Design Principles

- One obvious primary action per screen.
- Secondary actions are quieter.
- Hierarchy comes from spacing, type, scale and surface depth before borders.
- Premium means restraint, not more glow.
- Performance and accessibility are part of the visual quality.

## 4. Color System

Foundation tokens now resolve to the Atelier Canvas, Ivory, Heritage Sage, Muted Brass and muted status families. Legacy Aura variables remain available as compatibility aliases while new work should prefer semantic Lumeo 2 tokens.

## 5. Semantic Tokens

Use text, surface, border, shadow, status and motion tokens instead of raw colour values. This keeps public pages, PDF tools and admin screens consistent during later migration runs.

## 6. Typography

DM Serif Display is reserved for editorial moments. DM Sans handles interface and body copy. Metrics and counts use tabular numerals. The `--font-*` scale defines intended use from display to micro labels.

## 7. Spacing

Spacing uses a true 4px base from `--space-1` through `--space-24`. Layout should breathe on desktop while staying compact at 320px mobile widths.

## 8. Surfaces

Use `--surface-canvas`, `--surface-base`, `--surface-raised`, `--surface-elevated`, `--surface-floating`, `--surface-interactive`, `--surface-selected`, `--surface-input`, `--surface-overlay`, `--surface-danger` and `--surface-success`.

## 9. Elevation

Elevation uses layered shadows and subtle inner highlights. Avoid giant blurry shadows and continuous glow effects.

## 10. Radii

Use purposeful radii. Buttons and controls use medium radii by default; pills are reserved for badges and compact rails.

## 11. Motion

Motion tokens cover instant, fast, standard, expressive and entrance durations. Primitives include fade, scale, menu reveal, drawer entry, soft lift, button press, switch slide, segmented indicator, drag highlight, shimmer and success reveal. `prefers-reduced-motion` must remain supported.

## 12. Buttons

Primary uses Heritage Sage. Secondary uses elevated graphite. Premium uses restrained Muted Brass and should not replace the main action. Danger uses calm ruby. Icon buttons require accessible names.

## 13. Form Controls

Inputs, textarea, select, checkbox and radio controls must have visible labels, readable helper text, clear focus rings and calm validation. Avoid browser-default dated styling.

## 14. Switches

Switches use an animated thumb, an on-state mark, text labels and optional impact copy. Colour is never the only indicator.

## 15. Segmented Controls

Segmented controls use a moving selected indicator, selected semantics and arrow-key navigation. They must remain usable on mobile.

## 16. Cards

Cards have base, interactive, premium, tool, file, result, metric, guidance, warning and success uses. Interactive cards lift subtly and never use mouse-following glow.

## 17. Upload Experience

Upload surfaces provide a clear icon, title, helper text, supported type summary, privacy assurance, loading/error states, drag-active state and keyboard activation.

## 18. File Cards

File cards support an icon, name, metadata, status, remove action and optional move controls. Do not invent metadata the current feature does not know.

## 19. Result States

Result cards show a concise status, details, primary download action, start-new action and local/browser-only wording. No confetti or cloud-save implications.

## 20. Public Navigation

The public shell should use a compact dark satin surface, logo-left navigation, clear active states, keyboard support and mobile-safe drawers.

## 21. Public Footer

The footer should remain compact, grouped and useful with a trust/privacy line and restrained brass detail.

## 22. Tool Workspace Layout

Future PDF tools should use a main document area and a compact settings inspector on desktop. Mobile stacks files, settings, action and result without sticky panels covering content.

## 23. Admin Foundations

Control Center pages should reuse page headers, metric cards, section cards, tables, forms, action bars, guidance panels, impact previews and status foundations.

## 24. Accessibility

Target WCAG 2.2 AA. Maintain visible focus, keyboard navigation, semantic headings, labels, help/error association, aria-live feedback, touch targets, high contrast and reduced motion support.

## 25. Responsive Rules

Design for 320px, 375px, 768px, 1024px, 1440px and wide desktop. Avoid horizontal overflow and fixed placements that break zoom or Windows scaling.

## 26. Performance

No heavy UI dependencies, animation libraries, large assets, continuous effects, background video, WebGL or hydration-risk wrappers. Prefer Server Components outside interactive primitives.

## 27. Content Tone

Copy should be calm, specific and truthful. Do not claim fake analytics, fake processing speed, exact compression guarantees or server privacy claims that are not implemented.

## 28. Component Contribution Rules

Use semantic tokens, strict TypeScript, `className` extension where useful, accessible names for icon-only controls, reduced-motion support and no `any`.

## 29. Run 2 Migration Plan

This is the Run 2 migration plan for moving existing pages onto the Lumeo Canvas foundation.

Run 2 should migrate pages gradually:

1. Public homepage positioning.
2. PDF tools directory and tool cards.
3. Placeholder tool pages.
4. Public reading pages.
5. Control Center table/form pages.
6. Live PDF tool visual wrappers only, with no processing algorithm changes.

## 30. Do And Do Not

Do use spacious hierarchy, warm editorial detail, precise controls and truthful status language.

Do not use plain white canvases, pure black pages, oversized gradients, fake metrics, old checkbox-like toggles, excessive badges or copied PDF-site patterns.

## Public Experience Rollout

### Homepage Hierarchy

The public homepage opens with a compact introduction, not a giant hero. The tools remain immediately visible and carry the primary action of the page.

### Featured-Tool Rule

The first configured homepage slot becomes the featured tool. This keeps the composition catalog-driven and lets operations change the lead tool without a code redesign.

### Five Configured Plus Permanent Sixth Card

Homepage slots 1 through 5 come from the public catalog configuration. The sixth card is always **All PDF Tools** and is never stored as a configurable slot.

### Tool-Card Variants

Use three public card variants:

- Featured tool card for the first configured tool.
- Standard tool card for configured tools two through five.
- All PDF Tools card for the permanent directory entry.

### Action Positioning

Card actions sit at the bottom of the card and use one action only: **Open tool** for active tools and **Browse all tools** for the permanent card.

### Navigation

Public navigation uses the Lumeo 2 satin surface, compact height, visible logo, PDF Tools, Guides and Privacy links. Mobile uses one clear menu button and a drawer.

### Menu

The PDF Tools menu is a command-style panel with categorized sections, concise descriptions, Escape close, outside-click close and a footer action to view all tools.

### Directory

The `/pdf-tools` directory remains catalog-driven. Categories are separated by typography and spacing, not giant boxes. No fake counts, popularity, ratings or usage totals.

### Placeholder Pages

JPG to PDF and PDF to JPG remain clearly non-operational until engines exist. They must not show fake upload areas or disabled process buttons that resemble a working feature.

### Footer

The public footer groups links under Tools, Company and Legal. It stays compact and readable, with no fake version, fake social links or oversized empty block.

### Mobile Behaviour

Homepage cards stack in one column, directory cards stay readable, menus scroll safely, and no action is hidden off-screen.

### Accessibility

Public cards and menus require visible focus, semantic links, ARIA menu/drawer state, Escape close and text labels that do not depend on colour alone.

### Performance

The public experience uses CSS and existing components only. No animation library, no background video, no WebGL and no continuous pointer effects.

### Future Public Tool Contribution Rules

Future tools should register in the catalog, provide a concise description, use the shared Lumeo 2 card system, and avoid fake claims until a real browser-first engine exists.

### What Remains For Run 3

Run 3 should bring the internal Merge, Split and Compress workspaces onto the Lumeo 2 tool workspace primitives without changing their processing algorithms.

## PDF Workspace Rollout

### Tool Workspace Lifecycle

Every live PDF workspace follows the same lifecycle: compact tool header, upload stage, document/file summary, relevant settings, one primary action, honest progress, result state and a single privacy note.

### Pre-Upload Layout

Before selection, show the tool name, one concise purpose statement and a premium upload stage. The locked upload copy remains **Drop PDFs here** and **or choose files from your device**. Settings stay hidden until they are relevant.

### Post-Upload Desktop Layout

Desktop uses a wide Lumeo 2 canvas with a main document column and a compact settings inspector. The main column carries files, document profile, progress and result. The right inspector carries tool options and the primary action.

### Post-Upload Mobile Layout

Mobile stacks document summary, settings, primary action, progress and result. Sticky side panels are disabled so no action covers content.

### Primary Action Positioning

The primary action belongs at the bottom of the settings panel on desktop and directly after settings on mobile. Do not duplicate the same primary action at the bottom of the page.

### Secondary Action Positioning

Secondary actions stay near the object they affect: Add PDFs and Clear all near the file list, Start new in the result state, and remove/reorder controls inside file cards.

### File-Card Pattern

File cards show real known values only: filename, size, format/status and pages only when a tool already knows page count. Merge cards may show ordering and reorder controls; Split and Compress should not pretend to manage a queue.

The document/file-type icon box in any file card or document profile must render `FileIcon` from `components/ui/FileIcon.tsx` — the single shared component for this element across every PDF tool. It uses a neutral `--border-subtle` border and neutral surface/text tokens; it must never use brass, gold or champagne styling. Do not inline a local copy of this icon markup in a tool component. New tools (Rotate, Watermark, Extract, etc.) must import `FileIcon` from day one rather than copying markup from an existing tool.

### Settings-Panel Pattern

Settings panels should be compact, sticky only on desktop, and ordered from primary mode to optional advanced controls. They should use spacing and surface depth before borders.

### Sticky Behaviour

Desktop inspectors use a top offset that respects navigation. Tablet and mobile fall back to normal document flow. Sticky panels must never overlap the footer or cover content.

### Merge Workspace

Merge uses the shared upload stage before selection. After selection, the main column emphasizes **Files to merge**, ordering and remove controls. The settings panel explains the real output: one combined PDF using the displayed file order.

### Split Workspace

Split uses a single-document upload stage. After selection, the main column shows the document profile and page selection surface. The settings panel groups split mode, page selection and output behaviour without adding unsupported options.

### Compress Workspace

Compress uses a single-document upload stage. After selection, the main column shows the document profile, real compression expectation, progress and Size Outcome. The settings panel groups compression method, quality or target controls, advanced options and the Compress PDF action.

### Target Size Studio

Target Size Studio keeps the existing presets of 100 KB, 200 KB and 400 KB plus custom KB/MB targets. It must describe the target as a requested maximum, never an exact guarantee.

### Advanced Options

Advanced controls use accessible disclosures. Grayscale remains opt-in and must never be applied automatically.

### Progress

Progress copy must be truthful. Use an indeterminate state when no real percentage exists. Multi-pass details are appropriate only when they come from the existing compressor.

### Result States

Result states use a single dominant download action, Start new as secondary, and calm outcome language. Do not use confetti, fake cloud-save wording or success colours for unsuccessful outcomes.

### Privacy Note

Each workspace uses the exact note: **Private by design · Browser-only · Cleared after download**. Avoid repeating the same privacy message in multiple boxes.

### Accessibility

Tool workspaces require visible focus, labelled controls, keyboard file actions, non-colour-only selection states, aria-live processing/result feedback where useful and touch targets around 44px.

### Future Tool Contribution Rules

New tools should compose `L2ToolPageHeader`, `L2ToolWorkspace`, `L2UploadStage`, `L2ToolSettingsPanel`, `L2ActionArea`, `L2ProgressState`, `L2ResultState` and `L2PrivacyNote` before adding tool-specific behaviour.

### What Remains For Run 4

Run 4 should apply the same Lumeo 2 workspace primitives more deeply inside the Merge, Split and Compress component markup where safe, then extend the pattern to future tools such as JPG to PDF and PDF to JPG when their real browser-first engines exist.

## Deep Workspace Implementation

### Actual Component Migration

Merge PDF, Split PDF and Compress PDF now use the shared Lumeo 2 workspace primitives inside their live components, not only at the route shell. Each tool composes `L2UploadStage`, `L2ToolWorkspace`, `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2ActionArea` and `L2PrivacyNote` around its existing browser-side engine.

### Button Positioning

Upload buttons remain inside the upload stage. Processing buttons live in the right settings panel. Result download buttons become the dominant action only after output exists. Secondary actions such as Start new, Compress again and Change target remain quieter.

### Settings Positioning

Settings are grouped in the right inspector on desktop and flow directly after the document area on mobile. Merge shows only real merge options. Split groups mode, page selection and output. Compress groups method, quality/target controls, advanced options and output name.

### File-Card Positioning

Merge keeps its ordered file stack with reorder and remove controls near each file. Split and Compress present a single document profile instead of a queue.

### Toggle Positioning

Compress keeps grayscale in the settings inspector as an explicit opt-in control. It remains independent in both Quality and Target Size modes.

### Progress Positioning

Progress and status messages stay near the document context. When exact progress is not available, the workspace uses honest status text rather than fake percentages.

### Result Positioning

Results live in the settings/result area with one dominant download action. Compress uses the Size Outcome language for achieved, closest-safe, not-beneficial and unable-to-process outcomes.

### Mobile Order

Mobile order is document area, options, primary action, progress/result and privacy note. Sticky side panels are disabled below desktop widths.

### Tool-Specific Rules

Merge preserves file selection, ordering, move up/down, remove, clear all, output naming and PDF creation. Split preserves modes, range parsing, ZIP creation and output naming. Compress preserves profile values, Target Size Studio, presets, custom targets, grayscale and adaptive passes.

### Future Tool Checklist

New browser-first tools should start with the same lifecycle, use the locked upload and privacy wording, expose one dominant action per state, keep result actions calm and avoid adding decorative previews that require extra file reading.

### What Remains For Run 5

Run 5 should visually QA the live tools across device widths, tune any remaining spacing or contrast issues, and migrate future real tool engines into the same workspace system when those engines exist.

## Lumeo Atelier Theme

### Emotional Goals

Lumeo Atelier is the final safe tone correction for Lumeo 2.0. It should feel soft, calm, elegant, refined, modern, trustworthy and easy on the eyes, while preserving the private document-studio identity and every existing interaction contract.

### Palette

The canonical palette is Atelier Canvas, Atelier Surface, Atelier Ivory, Heritage Sage and Muted Brass. Blue and cyan must not be public-facing accents. A quiet green-grey information tone may be used only for status semantics.

### Semantic Mapping

Existing shared tokens remain the implementation contract. `--canvas-*`, `--paper-*`, `--emerald-*`, `--champagne-*`, `--surface-*`, `--text-*`, `--border-*` and `--shadow-*` map to Atelier values so existing components inherit the theme without structure changes.

### Action Hierarchy

Primary actions use Heritage Sage with warm ivory text. Secondary actions use raised graphite surfaces. Muted Brass is for premium detail, selected accents, focus edges and small icon treatments, never long body copy or every button.

### Card Treatment

Cards use graphite-sage surfaces, a soft inner highlight and restrained elevation. Borders stay subtle. Hover lift remains small and reduced-motion friendly.

### Control Treatment

Inputs, switches, segmented controls, dropdowns and disclosures use dark graphite surfaces, readable labels and brass-neutral focus states. Switches retain a clear sage on-state and do not rely on colour alone.

### Upload Treatment

The shared upload stage keeps its real file input, stable ID, click forwarding, input reset and drag/drop handlers. Atelier changes only the visual treatment: soft graphite document tray, neutral document icon (never brass/gold — see File-Card Pattern), Heritage Sage select button and restrained sage drag-active illumination.

### Privacy Note

The privacy note remains exact: **Private by design · Browser-only · Cleared after download**. It should be compact, centered, quietly elevated and secondary to the main action.

### Accessibility

Atelier must maintain WCAG 2.2 AA contrast targets, visible focus, keyboard navigation, reduced motion, high-contrast support, labelled controls and practical touch targets.

### Functional Preservation Rules

Do not alter PDF Tools menu state ownership, native file input behaviour, drag/drop behaviour, PDF processing algorithms, Analytics V1, catalog data access, admin authentication or route URLs during Atelier retheme work.

### Atelier Handoff

Future polish may tune page-specific spacing and any remaining visual rough edges after runtime QA, but should continue to work through semantic tokens and shared components before touching page-specific JSX.

## Lumeo Atelier Final Polish

### Hierarchy And Spacing

The final polish layer tightens the public hero, upload stages and workspace capsules without changing route structure or processing behavior. Use the semantic gap tokens (`--gap-section`, `--gap-card`, `--gap-content`, `--gap-control`, `--gap-compact`) before introducing page-specific spacing. Page and panel padding should resolve through `--padding-page`, `--padding-panel` and `--padding-mobile-page` so future tools inherit the same rhythm.

### Interaction Restraint

Cards, buttons and upload panels may lift subtly, but hover motion should remain under 3px and pressed states should feel tactile rather than animated. Use Heritage Sage for primary actions, Muted Brass only for labels, icons, arrows and focus accents, and keep destructive actions in muted ruby treatments.

### Compact Dropdowns And Privacy Notes

The public PDF Tools menu is a compact anchored panel, not a page overlay. It uses stacked categorized rows, concise tool descriptions and an internal scroll area when needed. Privacy notes use a centered capsule with the exact wording `Private by design · Browser-only · Cleared after download`; avoid page-width trust strips.

### Planned Tool Pages

Planned tool pages must stay clearly non-operational. Do not show upload controls, disabled fake processing buttons or placeholder workflows. Provide only concise planned capability, related live tools and safe navigation actions.

### Preservation Rules

Final polish must not alter PDF processing algorithms, native upload contracts, drag/drop behavior, PDF Tools menu state ownership, Analytics V1, catalog data access, admin permissions, Supabase migrations or dependency versions.
