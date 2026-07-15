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

Foundation tokens use Canvas, Paper, Emerald, Champagne, Sky and Ruby families. Legacy Aura variables remain available as compatibility aliases while new work should prefer semantic Lumeo 2 tokens.

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

Primary uses Emerald. Secondary uses elevated navy. Premium uses restrained Champagne and should not replace the main action. Danger uses calm Ruby. Icon buttons require accessible names.

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

The footer should remain compact, grouped and useful with a trust/privacy line and restrained Champagne detail.

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
