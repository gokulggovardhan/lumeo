# Browser Certification

Release commit: `b4f80e6` (main, post-#116)
Date: 2026-07-30

## Scope and honesty notice

This certification was produced by an AI agent with access to exactly **one**
automated browser: a headless Chromium instance (Claude Code's Browser tool),
driven programmatically against the live production site (`https://lumeo.in`).

There was **no access** to:
- Real Safari (macOS or iOS) — no macOS/iOS hardware or BrowserStack/Sauce Labs-class device farm was available.
- Real Android Chrome on a physical or emulated Android device.
- Real Firefox or Edge (only Chromium's engine was exercised; Edge is Chromium-based so its rendering is a closer proxy than Firefox, but this was not independently run).
- Physical touch input, native OS clipboard, native pinch-zoom, or platform-native file pickers.

**Any matrix below covering those environments would be fabricated if reported
as tested.** Per explicit instruction not to fabricate results, this document
reports only what was actually exercised, and marks everything else as an
open item requiring manual QA or a device lab (BrowserStack, real hardware,
or TestFlight/Play Console beta testers).

## What was actually verified (Chromium, this session)

| Check | Viewport | Result |
|---|---|---|
| Homepage loads, no console errors | 1280×720 | ✅ Pass |
| Homepage loads, no horizontal overflow | 375×812 (mobile) | ✅ Pass |
| Merge PDF: tool page loads, file input present with correct `accept`/`multiple` attrs | 1280×720 | ✅ Pass |
| Merge PDF: programmatic file upload (2 files) → client-side PDF parse (page count, byte size shown correctly) | 1280×720 | ✅ Pass |
| Merge PDF: reorder controls, remove controls, filename field render and are keyboard/DOM-addressable | 1280×720 | ✅ Pass |
| Merge PDF: "Merge PDFs" action → "Merged PDF ready" state → download link rendered | 1280×720 | ✅ Pass, 0 console errors throughout |
| Accessible labeling spot-check (drop zone, buttons have text/aria labels in the a11y tree) | 1280×720 | ✅ Pass on inspected elements |

This confirms the core Merge PDF pipeline (upload → in-browser processing →
export) is functionally intact in a Chromium engine, and that the homepage
renders without layout overflow at a mobile viewport width. It does **not**
confirm cross-browser or cross-device behavior.

## Not verified — requires follow-up

- **Browsers**: Firefox, Safari (desktop and iOS), Edge (independently), Samsung Internet.
- **Devices**: any physical iPhone, iPad, or Android device; touch-specific gestures (pinch-zoom, long-press, swipe-to-reorder).
- **Tools not exercised this session**: Split, Compress, Crop, Edit PDF, Watermark, Sign PDF, Extract Text, PDF→Word, Word→PDF, HTML→PDF, JPG→PDF, PDF→JPG, Organize.
- **Interaction classes not exercised**: real drag-and-drop (native OS drag, as opposed to the programmatic `DataTransfer` upload used here), OS clipboard copy/paste, native browser zoom, undo/redo stacks, modal dialog focus-trapping under a screen reader, keyboard-only completion of a full tool workflow.
- **WCAG conformance**: no automated accessibility scanner (axe-core, Lighthouse a11y audit) or screen reader (VoiceOver/NVDA/TalkBack) was run.

## Recommendation

Before claiming full cross-browser/device certification, run this matrix
through an actual device lab (BrowserStack App Live / Automate, or a
physical device set) covering the 14 production tools × the 6 requested
platforms, plus an automated a11y scan (axe-core) per tool page. This
document should be re-generated once that data exists — do not hand-edit
in fabricated pass marks.
