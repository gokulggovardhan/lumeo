# PDF Organizer, HTML to PDF, Text Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three new 100%-client-side PDF tools — Page Organizer/Rotator, HTML to PDF, Text Extractor & Viewer — filling the gaps already reserved in `lib/tools/catalog.ts`, matching the Lumeo Atelier theme and existing tool-page architecture.

**Architecture:** Each tool is a `next/dynamic`-loaded client component under `components/pdf/`, rendered from its own `app/pdf/<slug>/page.tsx`, built from the shared `L2*` primitives in `components/pdf/workspace/ToolWorkspace.tsx`. Pure, hard-to-get-wrong logic (page reordering, html2pdf option building, text-content joining) lives in small standalone `lib/pdf/*.ts` modules with `node:test` unit tests; DOM/canvas/file-IO glue lives in the component and is verified manually in the browser, matching this codebase's existing test split (see `tests/compression-target.test.ts` vs `components/pdf/CompressPdfTool.tsx`).

**Tech Stack:** Next.js 16 / React 19, TypeScript, `pdf-lib` (page mutation), `pdfjs-dist` (thumbnails + text extraction, via the shared `lib/pdf/pdfjs.ts` singleton), `html2pdf.js` (new dependency, already installed), native HTML5 Drag-and-Drop (no new drag library), Node's built-in test runner (`node --test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-pdf-organizer-html-extract-design.md` (approved).
- 100% browser-only for all three tools — zero network calls, matching `processing: "browser"` in their catalog groups.
- Every async operation wrapped in `try/catch` with a specific, actionable error message.
- `URL.revokeObjectURL()` called on every object URL this code creates, once no longer needed.
- Reuse existing shared modules — do not fork `lib/pdf/pdfjs.ts`, `uploadValidation.ts`, `sanitizeFileName.ts`, `formatBytes.ts`, `arrayBuffer.ts`, `rotation.ts`. Do not modify `SplitPdfTool.tsx` (already live, out of scope, do not risk regressing it).
- Do not add `dnd-kit`/`sortablejs` or any other new dependency beyond `html2pdf.js`.
- Match existing code style: no comments except where a subtle invariant needs explaining (see the precedent in `lib/pdf/pdfjs.ts` and `lib/pdf/rotation.ts`).

---

## Task 1: Wire catalog routes and tool registry

**Files:**
- Modify: `lib/tools/catalog.ts:65-73` (Compose actions), `lib/tools/catalog.ts:126` (Render `extract-text`), `lib/tools/catalog.ts:191` (Convert `html-to-pdf`)
- Modify: `components/pdf/PdfToolRegistry.tsx:3-10` (`PdfToolSlug`), `components/pdf/PdfToolRegistry.tsx:25-148` (`pdfTools` array)
- Test: `tests/pdf-tool-catalog-wiring.test.ts`

**Interfaces:**
- Consumes: existing `LumeoTool`, `ToolAction`, `PdfToolDefinition`, `PdfToolSlug` types (unchanged shape).
- Produces: `lumeoTools` and `pdfTools` now include `organize`, `extract-text`, `html-to-pdf` as live, routed entries — later tasks' `page.tsx` files rely on these routes existing in the catalog for the public catalog/SEO pages to link to them correctly.

- [ ] **Step 1: Update `lib/tools/catalog.ts` Compose actions to route at the new Organizer page**

Replace lines 65-73:

```ts
    actions: [
      { label: "Merge", slug: "merge", route: "/pdf/merge", live: true },
      { label: "Split", slug: "split", route: "/pdf/split", live: true },
      { label: "Split by range", slug: "split-range", route: "/pdf/split", live: true },
      { label: "Reorder pages", slug: "reorder", route: "/pdf/organize", live: true },
      { label: "Rotate pages", slug: "rotate", route: "/pdf/organize", live: true },
      { label: "Remove pages", slug: "remove-pages", route: "/pdf/organize", live: true },
      { label: "Extract pages", slug: "extract-pages", route: "/pdf/split", live: true },
      { label: "Duplicate page", slug: "duplicate-page", route: "/pdf/organize", live: true },
    ],
```

(`"Extract pages"` stays on Split — that's `SplitMode: "extract"`, a genuinely different feature from the new Organizer, which only reorders/rotates/removes/duplicates within one already-loaded document.)

- [ ] **Step 2: Flip `extract-text` and `html-to-pdf` to live with routes**

In the `render` group (around line 126), replace:

```ts
      { label: "Extract text", slug: "extract-text", live: false },
```

with:

```ts
      { label: "Extract text", slug: "extract-text", route: "/pdf/extract-text", live: true },
```

In the `convert` group (around line 191), replace:

```ts
      { label: "HTML to PDF", slug: "html-to-pdf", live: false },
```

with:

```ts
      { label: "HTML to PDF", slug: "html-to-pdf", route: "/pdf/html-to-pdf", live: true },
```

- [ ] **Step 3: Add the three new slugs to `PdfToolRegistry.tsx`**

Replace lines 3-10:

```ts
export type PdfToolSlug =
  | "merge"
  | "split"
  | "compress"
  | "jpg-to-pdf"
  | "pdf-to-jpg"
  | "sign"
  | "word-to-pdf"
  | "organize"
  | "html-to-pdf"
  | "extract-text";
```

Append these three entries to the `pdfTools` array, right before the closing `];` on line 149:

```ts
  {
    slug: "organize",
    title: "Organize PDF",
    shortTitle: "Organize",
    description: "Reorder, rotate, duplicate, or remove pages in one document.",
    route: "/pdf/organize",
    status: "live",
    browserNote: "Browser-first organizing",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Drag to reorder pages",
      "Rotate 90/180/270 degrees",
      "Duplicate or delete pages",
      "Bulk select and act on many pages",
      "Local download cleanup",
    ],
  },
  {
    slug: "html-to-pdf",
    title: "HTML to PDF",
    shortTitle: "HTML to PDF",
    description: "Turn HTML and CSS into a downloadable PDF.",
    route: "/pdf/html-to-pdf",
    status: "live",
    browserNote: "Browser-first generation",
    engineNote: "Live now",
    accepted: "HTML/CSS you type or paste",
    bullets: [
      "Live preview as you type",
      "Page size and orientation control",
      "Margin presets",
      "Starter templates",
    ],
  },
  {
    slug: "extract-text",
    title: "Extract Text",
    shortTitle: "Extract text",
    description: "Pull selectable text out of a PDF and read or export it.",
    route: "/pdf/extract-text",
    status: "live",
    browserNote: "Browser-first extraction",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Per-page text panels",
      "Search across all pages",
      "Copy per page or copy all",
      "Download as .txt",
    ],
  },
```

- [ ] **Step 4: Write the wiring test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { lumeoTools } from "../lib/tools/catalog.ts";
import { pdfTools } from "../components/pdf/PdfToolRegistry.tsx";

function findAction(slug: string) {
  for (const tool of lumeoTools) {
    const action = tool.actions.find((item) => item.slug === slug);
    if (action) return action;
  }
  return undefined;
}

test("organizer actions are live and routed to /pdf/organize", () => {
  for (const slug of ["reorder", "rotate", "remove-pages", "duplicate-page"]) {
    const action = findAction(slug);
    assert.ok(action, `expected action ${slug} to exist`);
    assert.equal(action?.live, true);
    assert.equal(action?.route, "/pdf/organize");
  }
});

test("extract-pages stays routed to the existing Split tool", () => {
  const action = findAction("extract-pages");
  assert.equal(action?.route, "/pdf/split");
});

test("extract-text is live and routed to /pdf/extract-text", () => {
  const action = findAction("extract-text");
  assert.equal(action?.live, true);
  assert.equal(action?.route, "/pdf/extract-text");
});

test("html-to-pdf is live and routed to /pdf/html-to-pdf", () => {
  const action = findAction("html-to-pdf");
  assert.equal(action?.live, true);
  assert.equal(action?.route, "/pdf/html-to-pdf");
});

test("PdfToolRegistry includes the three new tools", () => {
  const slugs = pdfTools.map((tool) => tool.slug);
  assert.ok(slugs.includes("organize"));
  assert.ok(slugs.includes("html-to-pdf"));
  assert.ok(slugs.includes("extract-text"));
});
```

- [ ] **Step 5: Run test to verify it fails (files not yet edited)**

Run: `npm test -- tests/pdf-tool-catalog-wiring.test.ts`
Expected: FAIL — routes still point at `/pdf/split` / actions still `live: false`.

- [ ] **Step 6: Apply steps 1-3 above, then run the test to verify it passes**

Run: `npm test -- tests/pdf-tool-catalog-wiring.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/tools/catalog.ts components/pdf/PdfToolRegistry.tsx tests/pdf-tool-catalog-wiring.test.ts
git commit -m "feat(pdf): wire organize/html-to-pdf/extract-text into tool catalog"
```

---

## Task 2: Page Organizer pure logic

**Files:**
- Create: `lib/pdf/pageOrganizer.ts`
- Test: `tests/page-organizer.test.ts`

**Interfaces:**
- Produces: `OrganizerItem` type, `createInitialItems`, `moveItem`, `duplicateItem`, `removeItem`, `removeItems`, `rotateItem`, `rotateItems`, `validateOrganizeItems` — all consumed by Task 3's `OrganizePdfTool.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialItems,
  duplicateItem,
  moveItem,
  removeItem,
  removeItems,
  rotateItem,
  rotateItems,
  validateOrganizeItems,
} from "../lib/pdf/pageOrganizer.ts";

test("creates one item per page, in order, with zero rotation", () => {
  const items = createInitialItems(3);
  assert.deepEqual(
    items.map((item) => item.sourcePage),
    [1, 2, 3],
  );
  assert.ok(items.every((item) => item.rotation === 0));
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
});

test("moveItem reorders by index and is a no-op for invalid indices", () => {
  const items = createInitialItems(3);
  const moved = moveItem(items, 0, 2);
  assert.deepEqual(
    moved.map((item) => item.sourcePage),
    [2, 3, 1],
  );
  assert.deepEqual(moveItem(items, 0, 0), items);
  assert.deepEqual(moveItem(items, -1, 1), items);
  assert.deepEqual(moveItem(items, 0, 99), items);
});

test("duplicateItem inserts a copy with a new id right after the source", () => {
  const items = createInitialItems(2);
  const next = duplicateItem(items, 0, "page-1-dup-1");
  assert.deepEqual(
    next.map((item) => item.sourcePage),
    [1, 1, 2],
  );
  assert.equal(next[1].id, "page-1-dup-1");
  assert.notEqual(next[1].id, next[0].id);
});

test("removeItem and removeItems drop by index, not by page number", () => {
  const items = createInitialItems(3);
  assert.deepEqual(
    removeItem(items, 1).map((item) => item.sourcePage),
    [1, 3],
  );
  assert.deepEqual(
    removeItems(items, new Set([0, 2])).map((item) => item.sourcePage),
    [2],
  );
});

test("rotateItem and rotateItems accumulate and normalize rotation", () => {
  const items = createInitialItems(2);
  const oneTurn = rotateItem(items, 0, "right");
  assert.equal(oneTurn[0].rotation, 90);
  const fourTurns = [1, 2, 3].reduce((acc, _n) => rotateItem(acc, 0, "right"), oneTurn);
  assert.equal(fourTurns[0].rotation, 0);

  const bulk = rotateItems(items, new Set([0, 1]), "left");
  assert.equal(bulk[0].rotation, 270);
  assert.equal(bulk[1].rotation, 270);
});

test("validateOrganizeItems rejects an empty document", () => {
  assert.match(validateOrganizeItems([]) ?? "", /empty/);
  assert.equal(validateOrganizeItems(createInitialItems(1)), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/page-organizer.test.ts`
Expected: FAIL with "Cannot find module '../lib/pdf/pageOrganizer.ts'"

- [ ] **Step 3: Implement `lib/pdf/pageOrganizer.ts`**

```ts
import { normalizeRotation } from "@/lib/pdf/rotation";

export type OrganizerItem = {
  id: string;
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
};

export function createInitialItems(pageCount: number): OrganizerItem[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `page-${index + 1}`,
    sourcePage: index + 1,
    rotation: 0,
  }));
}

export function moveItem(items: OrganizerItem[], fromIndex: number, toIndex: number): OrganizerItem[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function duplicateItem(items: OrganizerItem[], index: number, newId: string): OrganizerItem[] {
  const source = items[index];
  if (!source) return items;
  const next = [...items];
  next.splice(index + 1, 0, { ...source, id: newId });
  return next;
}

export function removeItem(items: OrganizerItem[], index: number): OrganizerItem[] {
  return items.filter((_, i) => i !== index);
}

export function removeItems(items: OrganizerItem[], indices: Set<number>): OrganizerItem[] {
  return items.filter((_, i) => !indices.has(i));
}

export function rotateItem(items: OrganizerItem[], index: number, direction: "left" | "right"): OrganizerItem[] {
  const target = items[index];
  if (!target) return items;
  const delta = direction === "right" ? 90 : -90;
  const rotation = normalizeRotation(target.rotation + delta);
  return items.map((item, i) => (i === index ? { ...item, rotation } : item));
}

export function rotateItems(
  items: OrganizerItem[],
  indices: Set<number>,
  direction: "left" | "right",
): OrganizerItem[] {
  const delta = direction === "right" ? 90 : -90;
  return items.map((item, i) =>
    indices.has(i) ? { ...item, rotation: normalizeRotation(item.rotation + delta) } : item,
  );
}

export function validateOrganizeItems(items: OrganizerItem[]): string | null {
  if (items.length === 0) return "Removing every page would leave an empty PDF.";
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/page-organizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/pageOrganizer.ts tests/page-organizer.test.ts
git commit -m "feat(pdf): add pure page-organizer reorder/rotate/duplicate/remove logic"
```

---

## Task 3: Page Organizer tool component and route

**Files:**
- Create: `components/pdf/OrganizePdfTool.tsx`
- Create: `app/pdf/organize/page.tsx`

**Interfaces:**
- Consumes: `createInitialItems`, `moveItem`, `duplicateItem`, `removeItem`, `removeItems`, `rotateItem`, `rotateItems`, `validateOrganizeItems`, `OrganizerItem` (Task 2); `openPdfJsDocument`, `renderPageWithTimeout`, `PAGE_RENDER_TIMEOUT_MS` (`lib/pdf/pdfjs.ts`); `isPdfNamedFile`, `hasPdfMagicBytes`, `checkPdfFileSize` (`lib/pdf/uploadValidation.ts`); `sanitizeFileStem` (`lib/pdf/sanitizeFileName.ts`); `formatBytes` (`lib/pdf/formatBytes.ts`); `copyArrayBuffer`, `toArrayBuffer` (`lib/pdf/arrayBuffer.ts`); `L2UploadStage`, `L2PrivacyNote`, `L2ToolWorkspace`, `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2ActionArea`, `L2ResultState` (`components/pdf/workspace/ToolWorkspace.tsx`); `useAnalytics` (`components/analytics/AnalyticsProvider.tsx`).
- Produces: default export `OrganizePdfTool` (React component), consumed by `app/pdf/organize/page.tsx` via `next/dynamic`.

- [ ] **Step 1: Create `components/pdf/OrganizePdfTool.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { degrees, PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2PrivacyNote,
  L2ResultState,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { copyArrayBuffer, toArrayBuffer } from "@/lib/pdf/arrayBuffer";
import { formatBytes } from "@/lib/pdf/formatBytes";
import {
  createInitialItems,
  duplicateItem,
  moveItem,
  removeItem,
  removeItems,
  rotateItem,
  rotateItems,
  validateOrganizeItems,
  type OrganizerItem,
} from "@/lib/pdf/pageOrganizer";
import { openPdfJsDocument, PAGE_RENDER_TIMEOUT_MS, renderPageWithTimeout } from "@/lib/pdf/pdfjs";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { checkPdfFileSize, hasPdfMagicBytes, isPdfNamedFile } from "@/lib/pdf/uploadValidation";

const THUMBNAIL_CONCURRENCY = 3;
const THUMBNAIL_SCALE = 0.32;

type LoadedDocument = {
  name: string;
  size: number;
  bytes: ArrayBuffer;
  pageCount: number;
};

type OrganizeResult = {
  url: string;
  fileName: string;
  size: number;
  pageCount: number;
};

function OrganizeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <rect x="5" y="6" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="18" y="14" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 20v3a2 2 0 0 0 2 2h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

async function buildOrganizedPdf(sourceBytes: ArrayBuffer, items: OrganizerItem[]) {
  const source = await PDFDocument.load(copyArrayBuffer(sourceBytes));
  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    items.map((item) => item.sourcePage - 1),
  );

  copied.forEach((page, index) => {
    const item = items[index];
    const existing = page.getRotation().angle;
    page.setRotation(degrees((existing + item.rotation) % 360));
    output.addPage(page);
  });

  return output.save();
}

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function OrganizePdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const pdfJsDocRef = useRef<PDFDocumentProxy | null>(null);
  const thumbnailUrlsRef = useRef<Map<string, string>>(new Map());
  const sessionRef = useRef(0);

  const [document_, setDocument] = useState<LoadedDocument | null>(null);
  const [items, setItems] = useState<OrganizerItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<OrganizeResult | null>(null);

  useEffect(() => {
    if (availability !== "available" || openedTrackedRef.current) return;
    track({ eventName: "tool_opened", toolSlug: "organize" });
    openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current.clear();
    };
  }, [result?.url]);

  async function renderThumbnails(doc: PDFDocumentProxy, pageCount: number, session: number) {
    const pending = Array.from({ length: pageCount }, (_, index) => index + 1);

    async function renderOne(pageNumber: number) {
      try {
        const page = await doc.getPage(pageNumber);
        if (session !== sessionRef.current) return;
        const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const task = page.render({ canvas, canvasContext: context, viewport });
        await renderPageWithTimeout(task, pageNumber);
        if (session !== sessionRef.current) return;

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.75));
        canvas.width = 0;
        canvas.height = 0;
        if (!blob || session !== sessionRef.current) return;

        const url = URL.createObjectURL(blob);
        thumbnailUrlsRef.current.set(`page-${pageNumber}`, url);
        setThumbnails((current) => ({ ...current, [pageNumber]: url }));
      } catch {
        // Best-effort preview; the page stays selectable without a thumbnail.
      }
    }

    async function worker() {
      while (pending.length && session === sessionRef.current) {
        const pageNumber = pending.shift();
        if (pageNumber === undefined) return;
        await renderOne(pageNumber);
      }
    }

    await Promise.all(Array.from({ length: THUMBNAIL_CONCURRENCY }, worker));
  }

  async function handleFiles(files: FileList) {
    const file = Array.from(files)[0];
    if (!file) return;

    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setError("");
    setResult(null);
    setThumbnails({});
    thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current.clear();

    if (!isPdfNamedFile(file)) {
      setError("Please add one PDF file.");
      return;
    }
    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        setError("This doesn't look like a valid PDF file.");
        return;
      }

      const pdf = await PDFDocument.load(copyArrayBuffer(bytes));
      const pageCount = pdf.getPageCount();
      const pdfJsDoc = await openPdfJsDocument(copyArrayBuffer(bytes));
      if (nextSession !== sessionRef.current) {
        await pdfJsDoc.destroy();
        return;
      }
      pdfJsDocRef.current = pdfJsDoc;

      setDocument({ name: file.name, size: file.size, bytes, pageCount });
      setItems(createInitialItems(pageCount));
      setSelected(new Set());
      void renderThumbnails(pdfJsDoc, pageCount, nextSession);
    } catch (readError) {
      const message =
        readError instanceof Error && /password|encrypt/i.test(readError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
    }
  }

  function toggleSelected(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function reindexSelection(next: OrganizerItem[], previousSelectedIds: Set<string>) {
    setSelected(new Set(next.flatMap((item, index) => (previousSelectedIds.has(item.id) ? [index] : []))));
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null) return;
    const selectedIds = new Set(Array.from(selected).map((index) => items[index]?.id).filter(Boolean) as string[]);
    const next = moveItem(items, dragIndex, targetIndex);
    setItems(next);
    reindexSelection(next, selectedIds);
    setDragIndex(null);
    setResult(null);
  }

  function handleRotate(direction: "left" | "right") {
    const selectedIds = new Set(Array.from(selected).map((index) => items[index]?.id).filter(Boolean) as string[]);
    const next = selected.size ? rotateItems(items, selected, direction) : items;
    setItems(next);
    reindexSelection(next, selectedIds);
    setResult(null);
  }

  function handleDuplicate(index: number) {
    const item = items[index];
    if (!item) return;
    const next = duplicateItem(items, index, `${item.id}-dup-${Date.now()}`);
    setItems(next);
    setSelected(new Set());
    setResult(null);
  }

  function handleDelete(index: number) {
    const next = selected.has(index) ? removeItems(items, selected) : removeItem(items, index);
    setItems(next);
    setSelected(new Set());
    setResult(null);
  }

  async function handleExport() {
    if (!document_ || isExporting) return;
    const validationError = validateOrganizeItems(items);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsExporting(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "organize" });

    try {
      const bytes = await buildOrganizedPdf(document_.bytes, items);
      const blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const fileName = `${sanitizeFileStem(document_.name, "lumeo-organize")}.pdf`;
      setResult({ url, fileName, size: blob.size, pageCount: items.length });
      track({
        eventName: "processing_succeeded",
        toolSlug: "organize",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Could not build the organized PDF. Try a smaller document.",
      );
      track({
        eventName: "processing_failed",
        toolSlug: "organize",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsExporting(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    track({ eventName: "download_started", toolSlug: "organize" });
    downloadUrl(result.url, result.fileName);
  }

  if (!document_) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="organize-pdf-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<OrganizeIcon />}
            buttonLabel="Select PDF"
            onFilesSelected={handleFiles}
          />
        </div>
        <L2PrivacyNote />
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
          <div
            role="list"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {items.map((item, index) => (
              <div
                key={item.id}
                role="listitem"
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(index)}
                className={`group relative rounded-xl border p-2 transition ${
                  selected.has(index)
                    ? "border-[var(--border-selected)] bg-[var(--surface-selected)]"
                    : "border-[var(--text-primary)]/12 bg-[var(--text-primary)]/[0.035]"
                }`}
              >
                <label className="absolute left-2 top-2 z-10">
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleSelected(index)}
                    aria-label={`Select page ${index + 1}`}
                  />
                </label>
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-[var(--text-primary)]/[0.045]">
                  {thumbnails[item.sourcePage] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnails[item.sourcePage]}
                      alt=""
                      className="h-full w-full object-contain"
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-[var(--text-primary)]/8" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                  <span>Page {index + 1}</span>
                  <span className="flex gap-1">
                    <button type="button" aria-label="Rotate left" onClick={() => setItems(rotateItem(items, index, "left"))}>⟲</button>
                    <button type="button" aria-label="Rotate right" onClick={() => setItems(rotateItem(items, index, "right"))}>⟳</button>
                    <button type="button" aria-label="Duplicate page" onClick={() => handleDuplicate(index)}>⧉</button>
                    <button type="button" aria-label="Delete page" onClick={() => handleDelete(index)}>✕</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel
          title="Organize"
          description={`${items.length} page${items.length === 1 ? "" : "s"} · ${formatBytes(document_.size)}`}
        >
          <L2ActionArea
            primary={
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={isExporting || items.length === 0}
                className="lumeo-primary-action lumeo-press inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? "Building PDF…" : "Save organized PDF"}
              </button>
            }
            secondary={
              selected.size > 0 ? (
                <>
                  <button type="button" onClick={() => handleRotate("left")} className="text-sm font-bold text-[var(--text-primary)]">
                    Rotate selected left
                  </button>
                  <button type="button" onClick={() => handleRotate("right")} className="text-sm font-bold text-[var(--text-primary)]">
                    Rotate selected right
                  </button>
                </>
              ) : undefined
            }
          />
          {error ? (
            <div role="alert" className="rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-3 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      {result ? (
        <L2ResultState
          title="Organized PDF ready"
          details={[
            { label: "Pages", value: String(result.pageCount) },
            { label: "Size", value: formatBytes(result.size) },
          ]}
          primaryAction={
            <button
              type="button"
              onClick={handleDownload}
              className="lumeo-primary-action lumeo-press inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)]"
            >
              Download
            </button>
          }
        />
      ) : null}

      <L2PrivacyNote />
    </section>
  );
}
```

- [ ] **Step 2: Create `app/pdf/organize/page.tsx`**

```tsx
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";

const OrganizePdfTool = dynamic(() => import("@/components/pdf/OrganizePdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/organize", {
    title: { absolute: "Organize PDF Online Privately - Reorder, Rotate, Duplicate Pages" },
    description: "Reorder, rotate, duplicate, or delete PDF pages privately in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/organize" },
    openGraph: {
      title: "Organize PDF Online Privately - Lumeo PDF",
      description: "Drag to reorder, rotate, duplicate, and delete pages in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/organize",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Organize PDF Online Privately - Lumeo PDF",
      description: "Organize PDF pages directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default async function OrganizePdfPage() {
  const toolState = await getToolBlockedState("organize");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Organize PDF"
        description="Reorder, rotate, duplicate, or remove pages in one document."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><OrganizePdfTool /></div>
      )}
    </PublicCatalogPageShell>
  );
}
```

- [ ] **Step 3: Manual verification in browser**

Run: `npm run dev`, open `http://localhost:3000/pdf/organize`.
- Upload a multi-page PDF. Confirm thumbnails render progressively.
- Drag a page to a new position; confirm it moves.
- Rotate one page 90°, then select two pages and bulk-rotate; confirm the rotation badge/transform updates on each.
- Duplicate a page; confirm a copy appears right after it.
- Delete a page; confirm it disappears and the remaining pages re-index.
- Click "Save organized PDF", download it, open the downloaded file, and confirm page order/rotation/duplication/deletion all match what was configured.
- Try deleting every page: confirm the error "Removing every page would leave an empty PDF." appears and export is blocked.

- [ ] **Step 4: Commit**

```bash
git add components/pdf/OrganizePdfTool.tsx app/pdf/organize/page.tsx
git commit -m "feat(pdf): add Page Organizer/Rotator tool at /pdf/organize"
```

---

## Task 4: HTML to PDF pure option-building logic

**Files:**
- Create: `lib/pdf/htmlToPdfOptions.ts`
- Test: `tests/html-to-pdf-options.test.ts`

**Interfaces:**
- Produces: `PageSize`, `Orientation`, `MarginPreset` types, `MARGIN_MM`, `validateHtmlSource`, `buildHtml2PdfOptions` — consumed by Task 5's `HtmlToPdfTool.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildHtml2PdfOptions, MARGIN_MM, validateHtmlSource } from "../lib/pdf/htmlToPdfOptions.ts";

test("margin presets are in millimeters, wide > normal > none", () => {
  assert.equal(MARGIN_MM.none, 0);
  assert.ok(MARGIN_MM.normal > MARGIN_MM.none);
  assert.ok(MARGIN_MM.wide > MARGIN_MM.normal);
});

test("validateHtmlSource rejects blank input only", () => {
  assert.match(validateHtmlSource("") ?? "", /Add some HTML/);
  assert.match(validateHtmlSource("   ") ?? "", /Add some HTML/);
  assert.equal(validateHtmlSource("<p>hi</p>"), null);
});

test("buildHtml2PdfOptions maps page size, orientation, and margin correctly", () => {
  const options = buildHtml2PdfOptions({
    fileName: "lumeo-html.pdf",
    pageSize: "letter",
    orientation: "landscape",
    margin: "wide",
  });
  assert.equal(options.filename, "lumeo-html.pdf");
  assert.equal(options.margin, MARGIN_MM.wide);
  assert.equal(options.jsPDF.format, "letter");
  assert.equal(options.jsPDF.orientation, "landscape");
  assert.equal(options.jsPDF.unit, "mm");
  assert.equal(options.image.type, "jpeg");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/html-to-pdf-options.test.ts`
Expected: FAIL with "Cannot find module '../lib/pdf/htmlToPdfOptions.ts'"

- [ ] **Step 3: Implement `lib/pdf/htmlToPdfOptions.ts`**

```ts
import type { Html2PdfOptions } from "html2pdf.js";

export type PageSize = "a4" | "letter" | "legal";
export type Orientation = "portrait" | "landscape";
export type MarginPreset = "none" | "normal" | "wide";

export const MARGIN_MM: Record<MarginPreset, number> = {
  none: 0,
  normal: 12,
  wide: 24,
};

export function validateHtmlSource(source: string): string | null {
  if (!source.trim()) return "Add some HTML before generating a PDF.";
  return null;
}

export function buildHtml2PdfOptions(options: {
  fileName: string;
  pageSize: PageSize;
  orientation: Orientation;
  margin: MarginPreset;
}): Html2PdfOptions {
  return {
    filename: options.fileName,
    margin: MARGIN_MM[options.margin],
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: options.pageSize, orientation: options.orientation },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/html-to-pdf-options.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/htmlToPdfOptions.ts tests/html-to-pdf-options.test.ts
git commit -m "feat(pdf): add pure html2pdf option-building logic"
```

---

## Task 5: HTML to PDF tool component and route

**Files:**
- Create: `components/pdf/HtmlToPdfTool.tsx`
- Create: `app/pdf/html-to-pdf/page.tsx`

**Interfaces:**
- Consumes: `validateHtmlSource`, `buildHtml2PdfOptions`, `PageSize`, `Orientation`, `MarginPreset` (Task 4); `sanitizeFileStem`; `L2ActionArea`, `L2PrivacyNote`, `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2ToolWorkspace`; `useAnalytics`.
- Produces: default export `HtmlToPdfTool`, consumed by `app/pdf/html-to-pdf/page.tsx`.

- [ ] **Step 1: Create `components/pdf/HtmlToPdfTool.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2PrivacyNote,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
} from "@/components/pdf/workspace/ToolWorkspace";
import {
  buildHtml2PdfOptions,
  validateHtmlSource,
  type MarginPreset,
  type Orientation,
  type PageSize,
} from "@/lib/pdf/htmlToPdfOptions";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";

const GENERATE_TIMEOUT_MS = 30_000;

const TEMPLATES: Record<string, string> = {
  Blank: "<h1>Untitled document</h1>\n<p>Start typing here.</p>",
  Invoice: `<style>
  body { font-family: sans-serif; padding: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
</style>
<h1>Invoice #001</h1>
<p>Billed to: Customer Name</p>
<table>
  <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
  <tr><td>Service</td><td>1</td><td>$100.00</td></tr>
</table>
<p><strong>Total: $100.00</strong></p>`,
  Letter: `<style>
  body { font-family: serif; padding: 40px; line-height: 1.6; }
</style>
<p>Dear Reader,</p>
<p>Write your letter content here.</p>
<p>Sincerely,<br/>Your name</p>`,
};

async function runWithTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), GENERATE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export default function HtmlToPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [source, setSource] = useState(TEMPLATES.Blank);
  const [preview, setPreview] = useState(TEMPLATES.Blank);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margin, setMargin] = useState<MarginPreset>("normal");
  const [fileName, setFileName] = useState("lumeo-document");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (availability !== "available" || openedTrackedRef.current) return;
    track({ eventName: "tool_opened", toolSlug: "html-to-pdf" });
    openedTrackedRef.current = true;
  }, [availability, track]);

  useEffect(() => {
    const id = setTimeout(() => setPreview(source), 300);
    return () => clearTimeout(id);
  }, [source]);

  const validationError = useMemo(() => validateHtmlSource(source), [source]);

  async function handleGenerate() {
    const currentValidationError = validateHtmlSource(source);
    if (currentValidationError) {
      setError(currentValidationError);
      return;
    }
    const element = iframeRef.current?.contentDocument?.body;
    if (!element) {
      setError("Preview isn't ready yet. Try again in a moment.");
      return;
    }

    setIsGenerating(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "html-to-pdf" });

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const options = buildHtml2PdfOptions({
        fileName: `${sanitizeFileStem(fileName, "lumeo-document")}.pdf`,
        pageSize,
        orientation,
        margin,
      });
      await runWithTimeout(
        html2pdf().set(options).from(element).save(),
        "Generating the PDF took too long. Try simpler HTML/CSS or fewer images.",
      );
      track({
        eventName: "processing_succeeded",
        toolSlug: "html-to-pdf",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Could not generate the PDF. Check your HTML and try again.",
      );
      track({
        eventName: "processing_failed",
        toolSlug: "html-to-pdf",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                {Object.keys(TEMPLATES).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSource(TEMPLATES[name])}
                    className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1 text-xs font-bold text-[var(--text-primary)]"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <textarea
                value={source}
                onChange={(event) => setSource(event.target.value)}
                spellCheck={false}
                aria-label="HTML and CSS source"
                className="min-h-[380px] w-full rounded-xl border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-2)] p-3 font-mono text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="rounded-xl border border-[var(--text-primary)]/14 bg-white">
              <iframe
                ref={iframeRef}
                title="HTML preview"
                srcDoc={preview}
                sandbox=""
                className="h-[380px] w-full rounded-xl"
              />
            </div>
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Page settings" description="Applied when the PDF is generated.">
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            File name
            <input
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            Page size
            <select value={pageSize} onChange={(event) => setPageSize(event.target.value as PageSize)} className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm">
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="legal">Legal</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            Orientation
            <select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)} className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm">
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
            Margin
            <select value={margin} onChange={(event) => setMargin(event.target.value as MarginPreset)} className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm">
              <option value="none">None</option>
              <option value="normal">Normal</option>
              <option value="wide">Wide</option>
            </select>
          </label>

          <L2ActionArea
            primary={
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || Boolean(validationError)}
                className="lumeo-primary-action lumeo-press inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "Generating…" : "Generate PDF"}
              </button>
            }
          />
          {error ? (
            <div role="alert" className="rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-3 text-sm font-medium text-[var(--text-danger)]">
              {error}
            </div>
          ) : null}
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      <L2PrivacyNote />
    </section>
  );
}
```

- [ ] **Step 2: Create `app/pdf/html-to-pdf/page.tsx`**

```tsx
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";

const HtmlToPdfTool = dynamic(() => import("@/components/pdf/HtmlToPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/html-to-pdf", {
    title: { absolute: "HTML to PDF Online Privately - Lumeo PDF" },
    description: "Turn HTML and CSS into a downloadable PDF, entirely in your browser. No uploads, nothing leaves your device.",
    alternates: { canonical: "/pdf/html-to-pdf" },
    openGraph: {
      title: "HTML to PDF Online Privately - Lumeo PDF",
      description: "Type or paste HTML/CSS, preview it live, and generate a PDF in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/html-to-pdf",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "HTML to PDF Online Privately - Lumeo PDF",
      description: "Generate PDFs from HTML/CSS directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default async function HtmlToPdfPage() {
  const toolState = await getToolBlockedState("html-to-pdf");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="HTML to PDF"
        description="Turn HTML and CSS into a downloadable PDF."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><HtmlToPdfTool /></div>
      )}
    </PublicCatalogPageShell>
  );
}
```

- [ ] **Step 3: Manual verification in browser**

Run: `npm run dev`, open `http://localhost:3000/pdf/html-to-pdf`.
- Confirm the "Blank" template loads by default and the preview matches the editor.
- Click "Invoice" and "Letter" templates; confirm the editor and preview update.
- Edit the HTML directly; confirm the preview updates ~300ms after typing stops.
- Change page size to Letter, orientation to Landscape, margin to Wide.
- Click "Generate PDF"; confirm a PDF downloads and opening it shows the expected content, page size/orientation/margin.
- Clear the editor entirely; confirm "Generate PDF" is disabled and the validation message shows.

- [ ] **Step 4: Commit**

```bash
git add components/pdf/HtmlToPdfTool.tsx app/pdf/html-to-pdf/page.tsx
git commit -m "feat(pdf): add HTML to PDF tool at /pdf/html-to-pdf"
```

---

## Task 6: Text extraction pure logic

**Files:**
- Create: `lib/pdf/textExtraction.ts`
- Test: `tests/text-extraction.test.ts`

**Interfaces:**
- Produces: `joinTextItems`, `isEffectivelyEmpty`, `buildTxtFile` — consumed by Task 7's `ExtractTextTool.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildTxtFile, isEffectivelyEmpty, joinTextItems } from "../lib/pdf/textExtraction.ts";

test("joinTextItems joins string items with spaces, trims, and collapses blank runs", () => {
  const items = [{ str: "Hello" }, { str: "world" }, { str: "" }, { str: "!" }];
  assert.equal(joinTextItems(items), "Hello world !");
});

test("joinTextItems returns an empty string for no items", () => {
  assert.equal(joinTextItems([]), "");
});

test("isEffectivelyEmpty detects whitespace-only page text across all pages", () => {
  assert.equal(isEffectivelyEmpty(["", "   ", "\n"]), true);
  assert.equal(isEffectivelyEmpty(["", "Some text"]), false);
  assert.equal(isEffectivelyEmpty([]), true);
});

test("buildTxtFile separates pages with a labeled divider", () => {
  const output = buildTxtFile(["Page one text", "Page two text"]);
  assert.match(output, /--- Page 1 ---/);
  assert.match(output, /--- Page 2 ---/);
  assert.ok(output.indexOf("Page one text") < output.indexOf("--- Page 2 ---"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/text-extraction.test.ts`
Expected: FAIL with "Cannot find module '../lib/pdf/textExtraction.ts'"

- [ ] **Step 3: Implement `lib/pdf/textExtraction.ts`**

```ts
export type TextItemLike = { str: string };

export function joinTextItems(items: TextItemLike[]): string {
  return items
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEffectivelyEmpty(pageTexts: string[]): boolean {
  return pageTexts.every((text) => text.trim().length === 0);
}

export function buildTxtFile(pageTexts: string[]): string {
  return pageTexts
    .map((text, index) => `--- Page ${index + 1} ---\n${text}`)
    .join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/text-extraction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/textExtraction.ts tests/text-extraction.test.ts
git commit -m "feat(pdf): add pure text-extraction join/format logic"
```

---

## Task 7: Text Extractor tool component and route

**Files:**
- Create: `components/pdf/ExtractTextTool.tsx`
- Create: `app/pdf/extract-text/page.tsx`

**Interfaces:**
- Consumes: `joinTextItems`, `isEffectivelyEmpty`, `buildTxtFile` (Task 6); `openPdfJsDocument` (`lib/pdf/pdfjs.ts`); `isPdfNamedFile`, `hasPdfMagicBytes`, `checkPdfFileSize`; `sanitizeFileStem`; `L2UploadStage`, `L2PrivacyNote`, `L2ToolMainColumn`, `L2ToolSettingsPanel`, `L2ToolWorkspace`, `L2ActionArea`; `useAnalytics`.
- Produces: default export `ExtractTextTool`, consumed by `app/pdf/extract-text/page.tsx`.

- [ ] **Step 1: Create `components/pdf/ExtractTextTool.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2PrivacyNote,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
  L2UploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";
import { openPdfJsDocument } from "@/lib/pdf/pdfjs";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { buildTxtFile, isEffectivelyEmpty, joinTextItems } from "@/lib/pdf/textExtraction";
import { checkPdfFileSize, hasPdfMagicBytes, isPdfNamedFile } from "@/lib/pdf/uploadValidation";

function ExtractIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
      <path d="M8 6.5h10.5l2.5 2.5v16.5H8v-19Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 14h8M12 18h8M12 22h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function downloadText(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ExtractTextTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);

  const [fileName, setFileName] = useState("");
  const [pageTexts, setPageTexts] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (availability !== "available" || openedTrackedRef.current) return;
    track({ eventName: "tool_opened", toolSlug: "extract-text" });
    openedTrackedRef.current = true;
  }, [availability, track]);

  async function handleFiles(files: FileList) {
    const file = Array.from(files)[0];
    if (!file) return;

    setError("");
    setPageTexts(null);

    if (!isPdfNamedFile(file)) {
      setError("Please add one PDF file.");
      return;
    }
    const sizeError = checkPdfFileSize(file);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setIsExtracting(true);
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "extract-text" });

    try {
      const bytes = await file.arrayBuffer();
      if (!hasPdfMagicBytes(bytes)) {
        setError("This doesn't look like a valid PDF file.");
        setIsExtracting(false);
        return;
      }

      const doc = await openPdfJsDocument(bytes);
      const texts: string[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        texts.push(joinTextItems(content.items as Array<{ str: string }>));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await doc.destroy();

      setFileName(file.name);
      setPageTexts(texts);
      track({
        eventName: "processing_succeeded",
        toolSlug: "extract-text",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (extractError) {
      const message =
        extractError instanceof Error && /password|encrypt/i.test(extractError.message)
          ? "This file appears to be password-protected or encrypted."
          : "This file could not be read. It may be damaged or password-protected.";
      setError(message);
      track({
        eventName: "processing_failed",
        toolSlug: "extract-text",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      setIsExtracting(false);
    }
  }

  const filteredIndices = useMemo(() => {
    if (!pageTexts || !search.trim()) return pageTexts?.map((_, index) => index) ?? [];
    const term = search.trim().toLowerCase();
    return pageTexts
      .map((text, index) => ({ text, index }))
      .filter(({ text }) => text.toLowerCase().includes(term))
      .map(({ index }) => index);
  }, [pageTexts, search]);

  const noTextLayer = pageTexts ? isEffectivelyEmpty(pageTexts) : false;

  function handleCopyAll() {
    if (!pageTexts) return;
    void navigator.clipboard.writeText(buildTxtFile(pageTexts));
  }

  function handleDownload() {
    if (!pageTexts) return;
    downloadText(buildTxtFile(pageTexts), `${sanitizeFileStem(fileName, "lumeo-extract")}.txt`);
    track({ eventName: "download_started", toolSlug: "extract-text" });
  }

  if (!pageTexts) {
    return (
      <section className="l2-tool-empty-state grid gap-4 pb-4 lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px]">
          <L2UploadStage
            inputId="extract-text-upload"
            accept="application/pdf,.pdf"
            acceptedNote="PDF only · One file"
            multiple={false}
            icon={<ExtractIcon />}
            buttonLabel="Select PDF"
            loading={isExtracting}
            onFilesSelected={handleFiles}
          />
        </div>
        <L2PrivacyNote />
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-4 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
          {noTextLayer ? (
            <div role="status" className="rounded-lg border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.045] p-4 text-sm font-medium text-[var(--text-primary)]">
              No selectable text found — this looks like a scanned document.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredIndices.map((index) => (
                <details key={index} open={index === 0} className="rounded-xl border border-[var(--text-primary)]/14 p-3">
                  <summary className="cursor-pointer text-sm font-black text-[var(--text-primary)]">
                    Page {index + 1}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                    {pageTexts[index] || "(no text on this page)"}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(pageTexts[index])}
                    className="mt-2 text-xs font-bold text-[var(--text-accent)]"
                  >
                    Copy this page
                  </button>
                </details>
              ))}
            </div>
          )}
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Search" description="Filters pages by matching text.">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search extracted text…"
            className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm"
          />
          <L2ActionArea
            primary={
              <button
                type="button"
                onClick={handleDownload}
                disabled={noTextLayer}
                className="lumeo-primary-action lumeo-press inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download .txt
              </button>
            }
            secondary={
              <button type="button" onClick={handleCopyAll} disabled={noTextLayer} className="text-sm font-bold text-[var(--text-primary)]">
                Copy all
              </button>
            }
          />
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      <L2PrivacyNote />
    </section>
  );
}
```

- [ ] **Step 2: Create `app/pdf/extract-text/page.tsx`**

```tsx
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";

const ExtractTextTool = dynamic(() => import("@/components/pdf/ExtractTextTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/extract-text", {
    title: { absolute: "Extract Text from PDF Online Privately - Lumeo PDF" },
    description: "Pull selectable text out of a PDF privately in your browser. Read it, search it, copy it, or download it as .txt.",
    alternates: { canonical: "/pdf/extract-text" },
    openGraph: {
      title: "Extract Text from PDF Online Privately - Lumeo PDF",
      description: "Read, search, and export PDF text in a calm browser-first workspace.",
      url: "https://lumeo.in/pdf/extract-text",
      siteName: "Lumeo PDF",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Extract Text from PDF Online Privately - Lumeo PDF",
      description: "Extract PDF text directly on your device using Lumeo PDF Workspace.",
    },
  });
}

export default async function ExtractTextPage() {
  const toolState = await getToolBlockedState("extract-text");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Extract Text"
        description="Pull selectable text out of a PDF and read, search, or export it."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool"><ExtractTextTool /></div>
      )}
    </PublicCatalogPageShell>
  );
}
```

- [ ] **Step 3: Manual verification in browser**

Run: `npm run dev`, open `http://localhost:3000/pdf/extract-text`.
- Upload a text-based PDF; confirm per-page panels appear, page 1 expanded by default.
- Type in the search box; confirm only matching pages remain visible.
- Click "Copy this page" on one page, then paste somewhere to confirm clipboard content.
- Click "Copy all" and "Download .txt"; confirm the downloaded file has `--- Page N ---` dividers matching page count.
- Upload a scanned/image-only PDF (no text layer); confirm the "looks like a scanned document" notice appears instead of empty panels.

- [ ] **Step 4: Commit**

```bash
git add components/pdf/ExtractTextTool.tsx app/pdf/extract-text/page.tsx
git commit -m "feat(pdf): add Text Extractor & Viewer tool at /pdf/extract-text"
```

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: All tests pass, including the four new test files from Tasks 1, 2, 4, 6.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors in the new files (`components/pdf/OrganizePdfTool.tsx`, `components/pdf/HtmlToPdfTool.tsx`, `components/pdf/ExtractTextTool.tsx`, the three `page.tsx` files, and the three `lib/pdf/*.ts` modules).

- [ ] **Step 3: Run a production type-check build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors. If `html2pdf.js`'s bundled types cause a module-resolution error, confirm `tsconfig.json`'s `moduleResolution` is `bundler` or `node16`+ (Next.js 16 default) — this project's existing `tsconfig.json` already supports this since other typed third-party packages (`pdfjs-dist`, `pdf-lib`) resolve correctly today.

- [ ] **Step 4: Re-run the three manual browser checks from Tasks 3, 5, and 7 back-to-back**

Confirm no regressions across a single dev-server session: organize → html-to-pdf → extract-text, each with the golden-path and edge-case checks already listed in those tasks.

- [ ] **Step 5: Update the design spec status**

Edit `docs/superpowers/specs/2026-07-24-pdf-organizer-html-extract-design.md` line 4:

```markdown
Status: Implemented
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-24-pdf-organizer-html-extract-design.md
git commit -m "docs(pdf): mark organizer/html-to-pdf/extract-text spec as implemented"
```
