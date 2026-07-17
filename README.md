# Lumeo PDF Workspace

Lumeo PDF Workspace is a premium browser-first PDF workspace designed for private, professional document handling.

Live website: https://lumeo.in

## Product vision

Lumeo PDF is being built as a calm, serious, premium document workspace. The product direction is simple first, powerful when needed, and premium always.

The goal is not to feel like a generic PDF utility grid. Lumeo should feel like a private document console where important files are handled carefully.

## Current tools

Functional tools:

- Merge PDF
- Split PDF

Future or in-development tools:

- Compress PDF
- JPG to PDF
- PDF to JPG
- Protect PDF
- Unlock PDF

Future tools should not be described as complete until their processing engines are implemented and validated.

## Core principles

- Browser-first where practical.
- Files stay on the user's device for current supported workflows.
- No required server upload for current Merge and Split workflows.
- No backend PDF processing for current supported tools.
- Calm, professional Midnight Notary visual design.
- One carefully finished tool at a time.

## Browser-first architecture

Current supported PDF processing happens locally in the browser. Merge PDF and Split PDF use browser-side PDF libraries and do not require Firebase, Cloudinary, Google Drive, or remote PDF processing.

Document contents must not be stored in localStorage. UI preferences, such as Split PDF thumbnail density, may be stored locally when they do not contain document data.

Future features that require backend processing, accounts, cloud history, sync, or remote storage must be explicitly approved and disclosed before release.

## Design system

Theme: Midnight Notary

Core tokens:

- Notary Dark: `#0C1220`
- Parchment: `#F0EAD6`
- Aged Cream: `#E8DFC8`
- Deep Slate: `#1A2840`
- Seal Green: `#1E6B4A`
- Gold Ink: `#C9A84C`

Typography direction:

- DM Sans
- DM Serif Display

Visual rules:

- Deep navy premium surfaces.
- Parchment-inspired document styling.
- Gold only for restrained premium accents.
- Seal Green for primary actions and selected states.
- No red PDF branding, neon, generic dashboard styling, or iLovePDF-style tool grids.

## Local development

Install dependencies:

```bash
npm.cmd install
```

Run the local development server:

```bash
npm.cmd run dev
```

Build for production:

```bash
npm.cmd run build
```

## Build and validation

Before committing changes:

```bash
git diff --check
npm.cmd run build
```

Run focused lint checks for changed files when possible. If repository-wide lint reports unrelated legacy issues, document that honestly and ensure changed files pass focused validation.

## Project structure

- `app/page.tsx` - public Lumeo PDF homepage.
- `app/pdf` - PDF tool hub and tool routes.
- `components/pdf` - browser-first PDF tool components.
- `components/PublicPdfChrome.tsx` - public navigation and PDF page shell.
- `components/PublicFooter.tsx` - public footer links.
- `components/InfoPage.tsx` - reusable public information-page system.

## Privacy model

For current supported PDF workflows:

- Supported processing happens in the browser.
- Files are not uploaded for current Merge and Split processing.
- Document contents are not stored in localStorage.
- Temporary object URLs and active workspace state should be cleared by cleanup or reset flows.
- Browser downloads remain under the user's control.

## Locked feature policy

Merge PDF is permanently locked except for bug, security, and compatibility fixes.

Split PDF is protected after Premium v2. Do not redesign or alter Split PDF without explicit approval.

The PDF tool switcher is locked. Do not change its labels, order, navigation behavior, badges, or interaction model without explicit approval.

## Development workflow

The current workflow is:

1. Work directly on `main` unless repository policy requires otherwise.
2. Inspect relevant files before editing.
3. Preserve locked tools and protected SEO content.
4. Run `git diff --check`.
5. Run `npm.cmd run build`.
6. Commit focused changes.
7. Push after validation.

## Current roadmap

Near-term product direction:

- Continue polishing trust and public information pages.
- Build remaining PDF tools one at a time.
- Keep processing browser-first wherever practical.
- Add backend processing only when explicitly approved and disclosed.

## Deployment

The public domain is https://lumeo.in. Deployment configuration should not expose secrets, credentials, private keys, or service tokens.

## Contributing expectations

- Do not expose secrets.
- Do not invent legal, security, privacy, certification, or compliance claims.
- Do not modify locked PDF tools without explicit approval.
- Keep public copy calm, accurate, and premium.

## License

No public open-source license has been declared.

## Contact

See the public contact page at https://lumeo.in/contact. A verified public mailbox is not declared in this repository.
