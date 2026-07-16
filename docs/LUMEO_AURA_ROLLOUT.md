# Lumeo Aura Rollout

Run 2 completes the first product-wide application of Lumeo Aura. It brings the luminous evolution of Midnight Notary into public navigation, the homepage, the PDF tools directory, informational pages, shared Control Center primitives and protected admin guidance.

## Scope

Run 2 updates presentation and shared interface foundations only. No SQL was executed. It does not change database migrations, SQL execution, PDF processing algorithms, admin authorization, analytics privacy behaviour, Firebase, Google Drive, upload/export APIs or video editor code.

## Public Experience

The public site now uses a brighter Aura canvas and satin navigation system. The homepage keeps PDF tools immediately visible and avoids a generic marketing-page shape. The PDF tools directory remains catalog-backed and uses Aura cards, status treatments and accessible focus states.

Key public surfaces:

- `/`
- `/pdf-tools`
- `/pdf/merge`
- `/pdf/split`
- `/pdf/compress`
- `/pdf/jpg-to-pdf`
- `/pdf/pdf-to-jpg`
- `/about`
- `/privacy`
- `/terms`

## Control Center Experience

Shared Control Center components now provide Aura-styled page headers, section cards, metric cards, data tables, forms, status badges, submit buttons and empty states. This gives existing admin pages a consistent premium system without rewriting their server actions or permission model.

The sidebar and mobile navigation use the same Aura surfaces, active states and focus treatment. The navigation now includes:

- Design System
- Guide

## Protected Guide

`/admin/guide` explains how administrators should read Control Center controls:

- what a setting controls;
- what happens when it is enabled;
- what happens when it is disabled;
- whether it is stored only;
- dependencies;
- risk level;
- whether deployment is required;
- whether changes should be audited.

Examples include Compress PDF disable behaviour, public analytics disable behaviour, homepage slot assignment and SEO record storage.

## Protected Showcase

`/admin/design-system` remains the protected showcase for:

- colour tokens;
- typography;
- buttons;
- status;
- forms;
- modern switches;
- segmented controls;
- cards;
- metrics;
- tables;
- tool workspace foundations;
- admin guidance primitives;
- dialogs and drawers;
- loading and empty states.

The showcase is intentionally protected by the admin route group and must not be exposed as a public indexed page.

## PDF Tool Policy

Run 2 does not migrate the internals of Merge PDF, Split PDF or Compress PDF into new components. Their processing behaviour remains protected:

- browser-first processing remains unchanged;
- Merge PDF output and download behaviour remain unchanged;
- Split PDF page/range and ZIP behaviour remain unchanged;
- Compress PDF profiles and Target Size Studio remain unchanged;
- analytics privacy behaviour remains unchanged.

Future tool-specific Aura migration should happen in smaller visual QA passes.

## Accessibility

Run 2 preserves and expands:

- visible focus rings;
- semantic buttons and links;
- keyboard-reachable navigation;
- protected mobile drawer navigation;
- reduced-motion support;
- high-contrast token support;
- readable status labels that do not rely on colour alone.

## Validation

The Run 2 verifier checks:

- public Aura rollout markers;
- Control Center shared primitive usage;
- protected Guide and Design System routes;
- rollout documentation;
- protected package versions;
- preserved PDF algorithm markers;
- absence of production debug logging;
- absence of hard-coded secret markers.

Use:

```powershell
npm.cmd run verify:aura-rollout
```

## Manual Review URLs

Use these local URLs after starting the app:

- `http://localhost:3000/`
- `http://localhost:3000/pdf-tools`
- `http://localhost:3000/pdf/merge`
- `http://localhost:3000/pdf/split`
- `http://localhost:3000/pdf/compress`
- `http://localhost:3000/pdf/jpg-to-pdf`
- `http://localhost:3000/pdf/pdf-to-jpg`
- `http://localhost:3000/about`
- `http://localhost:3000/privacy`
- `http://localhost:3000/terms`
- `http://localhost:3000/admin`
- `http://localhost:3000/admin/design-system`
- `http://localhost:3000/admin/guide`

## What Remains

Run 2 intentionally leaves these for future focused work:

- full internal migration of live PDF tool panels to `ToolWorkspace` primitives;
- richer per-form admin guidance;
- visual screenshot QA across every breakpoint;
- future JPG to PDF and PDF to JPG engines;
- public runtime wiring for all stored-only Control Center settings.
