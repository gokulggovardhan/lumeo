# Graph Report - lumeo-app  (2026-08-16)

## Corpus Check
- 411 files · ~541,101 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3012 nodes · 6425 edges · 189 communities (167 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4205189c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- EditPdfTool.tsx
- data.ts
- page.tsx
- createClient
- requireAdmin
- page.tsx
- edit-page-ops.test.ts
- PublicCatalogPageShell.tsx
- PublicPdfChrome.tsx
- config.ts
- page.tsx
- page.tsx
- EditElementView.tsx
- Aura.tsx
- ControlCenterMobileNav.tsx
- AnalyticsProvider.tsx
- MicroDock.tsx
- export.ts
- page.tsx
- page.tsx
- page.tsx
- client.ts
- getToolBlockedState
- page.tsx
- parseDocumentXml
- edit-fallback-font-apply.test.ts
- FloatingIsland.tsx
- withSeoOverride
- page.tsx
- page.tsx
- page.tsx
- page.tsx
- JpgToPdfTool.tsx
- page.tsx
- catalog.ts
- Lumeo 2.0 Design System
- Lumeo Aura Design System
- pdfToWordStorage.ts
- edit-rotated-text.test.ts
- SplitPdfTool.tsx
- PageNumbersTool.tsx
- PageThumbnailSidebar.tsx
- edit-pdf-privacy-shield.test.ts
- eslint-config-next
- OrganizePdfTool.tsx
- compilerOptions
- html2pdf.js
- MergePdfTool.tsx
- shouldAttemptOnce
- jsdom
- @vercel/functions
- tailwindcss
- CompressPdfTool.tsx
- @types/react-dom
- typescript
- Browser Certification
- verify-lumeo-2-foundation.mjs
- verify-release.mjs
- dompurify
- tiles.ts
- PdfToJpgTool.tsx
- data.ts
- Page Numbers — Engineering Specification (pre-development, for review)
- Watermark PDF v1.1 — Manual Position Mode
- page.tsx
- dependencies
- Privacy Analytics
- verify-lumeo-aura-rollout.mjs
- server.js
- pdfjs.ts
- PHASE 4 — WORKSPACE EXPERIENCE
- Lumeo Control Center Foundation
- Public Experience Rollout
- aura-design-system.test.ts
- Edit PDF Workspace Redesign + Privacy Shield Implementation Plan
- tokens.ts
- parseDocumentXml.ts
- verify-lumeo-2-workspaces.mjs
- verify-lumeo-aura.mjs
- Lumeo Control Center Admin Authentication
- Final Engineering Excellence Audit
- High-Zoom Re-Rendering — Design Spec
- client.ts
- permissions.ts
- AURA_OS_V2_DESIGN_SPEC.md
- watermark-manual-rotation.test.ts
- scripts
- verify-lumeo-2-public-experience.mjs
- MicroDock.tsx
- Edit PDF Workspace Redesign + Privacy Shield — Design Spec
- page.tsx
- ENGINEERING_EXCELLENCE_AUDIT.md
- SignPdfTool.tsx
- AdminGuidance.tsx
- page.tsx
- Design: Page Organizer, HTML to PDF, Text Extractor
- Edit PDF tool — design
- PDF Workspace Rollout
- devDependencies
- editPlan.ts
- page.tsx
- types.ts
- verify-public-routes.mjs
- InboxClient.tsx
- ContinueWorking.tsx
- PHASE 1 — DESIGN LANGUAGE
- PHASE 2 — DESIGN TOKENS (design only, not implemented)
- Lumeo PDF Workspace
- ToolWorkspace.tsx
- Context-Aware Multi-Line Text Reflow — Design Spec
- toolWorkerClient.ts
- verify-control-center.mjs
- package.json
- export.ts
- elements.ts
- Aura OS v2 — Workspace Standard
- claude-flow
- ContactForm.tsx
- package.json
- verify-supabase-env.mjs
- edit-apply-plan-tj.test.ts
- FloatingIsland.tsx
- PdfToolRegistry.tsx
- Analytics Certification
- Lumeo Control Center Foundation
- Public PDF Tool Catalog
- tokens.ts
- verify-lumeo-2-workspaces.mjs
- verify-lumeo-aura.mjs
- restyleRun.ts
- embeddedImages.ts
- Lumeo Control Center Admin Authentication
- Public Experience Rollout
- Security Policy
- edit-apply-plan-quote.test.ts
- page.tsx
- page.tsx
- Lumeo Atelier Final Polish
- Lumeo roadmap
- Security Certification
- SEO Certification
- edit-shared-forms.test.ts
- buildEditPlan
- ContinueWorking.tsx
- layout.spec.ts
- Word to PDF converter service
- compression-document-structure.test.ts
- edit-shared-form-cross-page-hardening.test.ts
- watermark-export.test.ts
- PageThumbnailSidebar.tsx
- Watermark PDF — v1.0.0 freeze
- verify-release.mjs
- layout.tsx
- opengraph-image.tsx
- manifest.ts
- page.tsx
- robots.ts
- sitemap.ts
- AnalyticsDistribution.tsx
- eslint.config.mjs
- eslint-config-next
- jsdom
- jszip
- next.config.ts
- tailwindcss
- @types/react-dom
- ToolGlyph.tsx
- export.ts
- index.ts
- page.tsx
- page.tsx
- page.tsx
- page.tsx
- edit-shared-forms.test.ts
- Browser Certification
- pinned_version
- pdf-lib
- @playwright/test

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 61 edges
2. `withSeoOverride()` - 55 edges
3. `requireAdmin()` - 50 edges
4. `buildEditPlan()` - 41 edges
5. `shouldAttemptOnce()` - 36 edges
6. `resolveFont()` - 36 edges
7. `Lumeo 2.0 Design System` - 36 edges
8. `useAnalytics()` - 35 edges
9. `getToolBlockedState()` - 34 edges
10. `resolveFontMetrics()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `HomepagePage()` --calls--> `requireAdmin()`  [EXTRACTED]
  app/admin/(protected)/homepage/page.tsx → lib/admin/auth.ts
- `generateMetadata()` --calls--> `withSeoOverride()`  [EXTRACTED]
  app/page.tsx → lib/public-site/seo.ts
- `generateMetadata()` --calls--> `withSeoOverride()`  [EXTRACTED]
  app/pdf-tools/page.tsx → lib/public-site/seo.ts
- `generateMetadata()` --calls--> `withSeoOverride()`  [EXTRACTED]
  app/pdf/compress/page.tsx → lib/public-site/seo.ts
- `generateMetadata()` --calls--> `withSeoOverride()`  [EXTRACTED]
  app/pdf/crop/page.tsx → lib/public-site/seo.ts

## Import Cycles
- None detected.

## Communities (189 total, 22 thin omitted)

### Community 0 - "EditPdfTool.tsx"
Cohesion: 0.19
Nodes (21): ANCHOR_GRID, ANCHOR_LABELS, ContentMode, estimateContentSizePct(), LoadedPdf, runWithTimeout(), sanitizePdfFileName(), WatermarkTool() (+13 more)

### Community 1 - "data.ts"
Cohesion: 0.07
Nodes (52): breadcrumbSchema, CompressPdfPage(), CompressPdfTool, generateMetadata(), softwareSchema, breadcrumbSchema, CropPdfPage(), CropPdfTool (+44 more)

### Community 2 - "page.tsx"
Cohesion: 0.15
Nodes (38): deleteAnnouncement(), saveAnnouncement(), toggleAnnouncement(), tones, deleteFeatureFlag(), saveFeatureFlag(), toggleFeatureFlag(), deleteSeoSetting() (+30 more)

### Community 3 - "createClient"
Cohesion: 0.06
Nodes (46): CompressAnalysis, CompressPdfTool(), CompressResult, CompressStage, DocumentRisk, ExpertMode, Opportunity, PageInfo (+38 more)

### Community 4 - "requireAdmin"
Cohesion: 0.13
Nodes (13): fraunces, inter, metadata, plexMono, viewport, AnalyticsPageView(), PUBLIC_PAGE_ROUTES, AnnouncementBanner() (+5 more)

### Community 5 - "page.tsx"
Cohesion: 0.07
Nodes (34): PublicNavLink(), AuraCheckbox(), AuraFormField(), AuraIconButton(), AuraInput(), AuraLabeledControl(), AuraOptionCard(), AuraRadioGroup() (+26 more)

### Community 6 - "edit-page-ops.test.ts"
Cohesion: 0.09
Nodes (36): getFormValue(), signInAdmin(), POST(), ignoreErrorLog(), reopenErrorLog(), resolveErrorLog(), setErrorStatus(), buildQuery() (+28 more)

### Community 7 - "PublicCatalogPageShell.tsx"
Cohesion: 0.09
Nodes (36): ARROW_DELTAS, clamp(), LiveGeometry, PlacedElementView(), canvasToSignature(), CreatedSignature, DrawTab(), HANDWRITING_FONTS (+28 more)

### Community 8 - "PublicPdfChrome.tsx"
Cohesion: 0.09
Nodes (28): ALIGNMENTS, estimateLabelSizePct(), HeaderFooterTool(), LoadedPdf, runWithTimeout(), sanitizePdfFileName(), buildOrganizedPdf(), CORNER_PRESETS (+20 more)

### Community 9 - "config.ts"
Cohesion: 0.13
Nodes (20): aboutSchema, accessibilitySchema, contactSchema, privacySchema, securitySchema, termsSchema, InfoCallout(), InfoDefinitionList() (+12 more)

### Community 10 - "page.tsx"
Cohesion: 0.07
Nodes (56): metadata, ProtectedAdminLayout(), AdminPage(), formatDate(), AdminMemberView, AnalyticsSummary, AuditLogFilters, DataResult (+48 more)

### Community 11 - "page.tsx"
Cohesion: 0.09
Nodes (25): AdminLoginPage(), getSafeMessage(), LoginMessageKey, metadata, safeMessages, MaintenancePage(), metadata, AdminIcon() (+17 more)

### Community 12 - "EditElementView.tsx"
Cohesion: 0.07
Nodes (24): colourTokens, ToolActionBar(), ToolDocumentSummary(), ToolModeCard(), ToolOptionRow(), ToolPrivacyNote(), ToolProcessingStage(), ToolResultStage() (+16 more)

### Community 13 - "Aura.tsx"
Cohesion: 0.09
Nodes (33): clamp(), CropRectView(), describeRect(), Handle, resizeFromHandle(), ASPECT_PRESETS, CropPdfTool(), LoadedPdf (+25 more)

### Community 14 - "ControlCenterMobileNav.tsx"
Cohesion: 0.13
Nodes (18): handleInkStroke(), restyleSelectedRun(), clampPct(), createInkElement(), createShapeElement(), createTextElement(), createWhiteoutElement(), deleteElement() (+10 more)

### Community 15 - "AnalyticsProvider.tsx"
Cohesion: 0.13
Nodes (21): CommandPaletteDialog(), CommandPaletteDialog, ContinueWorking(), QUICK_ACTION_SLUGS, RecentFileLink(), buildCommandPaletteIndex(), CommandPaletteItem, normalize() (+13 more)

### Community 16 - "MicroDock.tsx"
Cohesion: 0.19
Nodes (11): groupActions(), ToolCategoryDetail(), availableTools, comingSoonTools, LumeoTool, lumeoTools, PROCESSING_LABEL, ToolAction (+3 more)

### Community 17 - "export.ts"
Cohesion: 0.10
Nodes (22): RedactionLayerProps, handleApplyRedaction(), handleDetectSensitive(), RFC-5322, boxesOverlap(), CoverageWarning, describeCoverageWarning(), findSensitiveMatches() (+14 more)

### Community 18 - "page.tsx"
Cohesion: 0.06
Nodes (21): InkCanvas(), Point, TextRunOverlay, TextRunOverlayProps, applyTextRunEdit, currentPageElements, EditEngine, EditHistorySnapshot (+13 more)

### Community 19 - "page.tsx"
Cohesion: 0.13
Nodes (28): assertGenuinelySplit(), drawSensitiveText(), SPLIT_RUN_PDF, splitRun(), TEXT_ONLY_PDF, textOnly(), TMP_DIR, TWO_PAGE_PDF (+20 more)

### Community 20 - "page.tsx"
Cohesion: 0.54
Nodes (6): updateTool(), ToolsPage(), getPdfTools(), getToolCategories(), canManageTools(), validateToolStatus()

### Community 21 - "client.ts"
Cohesion: 0.12
Nodes (26): CleanupMessage, computeRotatedPreviewBox(), ConvertStatus, correctImageOrientation(), createFileId(), getDisplayDimensions(), getPageSizeLabel(), JpgToPdfTool() (+18 more)

### Community 22 - "getToolBlockedState"
Cohesion: 0.09
Nodes (22): compressPagesToRange(), densityClasses, densityPreviewClasses, friendlyPageError(), getSuggestions(), PageInfo, ParsedRange, parsePageList() (+14 more)

### Community 23 - "page.tsx"
Cohesion: 0.06
Nodes (31): 10. Radii, 11. Motion, 12. Buttons, 13. Form Controls, 14. Switches, 15. Segmented Controls, 16. Cards, 17. Upload Experience (+23 more)

### Community 24 - "parseDocumentXml"
Cohesion: 0.06
Nodes (31): 10. Buttons, 11. Form Controls, 12. Cards, 13. Navigation, 14. Tool Workspaces, 15. Control Center, 16. Guidance System, 17. Accessibility (+23 more)

### Community 25 - "edit-fallback-font-apply.test.ts"
Cohesion: 0.19
Nodes (19): makeCorruptedPdfBytes(), makeFormFieldPdf(), makeImageOnlyPdf(), makeLandscapePdf(), makeLargePdf(), makeMediumPdf(), makeMetadataPdf(), makeMixedPageSizesPdf() (+11 more)

### Community 26 - "FloatingIsland.tsx"
Cohesion: 0.29
Nodes (4): makeType0SubsetPdf(), planFor(), PreparedEdit, toUnicodeCMapFor()

### Community 27 - "withSeoOverride"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 28 - "page.tsx"
Cohesion: 0.17
Nodes (15): AnalyticsContext, AnalyticsContextValue, AnalyticsProvider(), debugOverrideEnabled(), doNotTrackEnabled(), PUBLIC_ANALYTICS_ROUTES, fetchPublicAnalyticsEnabled(), allowedEvents (+7 more)

### Community 29 - "page.tsx"
Cohesion: 0.09
Nodes (31): applyRedaction(), pageDrawsImages(), RedactionTargetRun, collectPageTextOperators(), bestOperatorAmong(), buildOperatorSpatialIndex(), cellKey(), matchDetectedRunToOperator() (+23 more)

### Community 30 - "page.tsx"
Cohesion: 0.12
Nodes (22): CleanupMessage, createFileId(), destroyPdfJsDoc(), getOutputPageSize(), getOutputStyleLabel(), getPageSizeType(), getSizeSignature(), isSmartFitFormat() (+14 more)

### Community 31 - "page.tsx"
Cohesion: 0.13
Nodes (28): asNumber(), defaultTextState(), IDENTITY_MATRIX, isDelimiter(), isWhitespace(), Matrix2x3, multiplyMatrix(), TextShowOperatorKind (+20 more)

### Community 32 - "JpgToPdfTool.tsx"
Cohesion: 0.36
Nodes (7): absoluteTime(), InboxClient(), relativeTime(), TypeFilter, InboxCountBadge(), createClient(), FeedbackQuery

### Community 33 - "page.tsx"
Cohesion: 0.14
Nodes (16): generateMetadata(), Home(), structuredData, trustItems, whyItems, ToolCategoryPage(), PdfToolsPage(), CommandPaletteTrigger() (+8 more)

### Community 34 - "catalog.ts"
Cohesion: 0.16
Nodes (24): asNumber(), asStatus(), asString(), createPublicCatalogClient(), fetchPublicHomepageTools(), fetchPublicPdfCatalog(), getPublicHomepageTools, HomepageToolRow (+16 more)

### Community 35 - "Lumeo 2.0 Design System"
Cohesion: 0.07
Nodes (22): buttonVariants, compressTool, controlShell, css, docs, footer, guidance, mergeTool (+14 more)

### Community 36 - "Lumeo Aura Design System"
Cohesion: 0.10
Nodes (26): EditPdfTool(), ConvertStatus, DpiPreset, dpiPresets, JpgPageResult, OutputFormat, parsePageSelection(), parsePageToken() (+18 more)

### Community 37 - "pdfToWordStorage.ts"
Cohesion: 0.10
Nodes (27): ContentStreamToken, applyDifferences(), EncodingSource, findToUnicodeMap(), fontDescriptorOf(), FontKind, hexStringToCode(), hexStringToCodePoint() (+19 more)

### Community 38 - "edit-rotated-text.test.ts"
Cohesion: 0.08
Nodes (24): Abuse-Control Limitations, Admin Analytics Views, Analytics V1 Scope, Anonymous Session Design, Architecture, Collection Setting, Daily Metric Refresh, Data Collected (+16 more)

### Community 39 - "SplitPdfTool.tsx"
Cohesion: 0.14
Nodes (24): applyEditPlanToBytes(), applyEditPlanToDocument(), applyMultiRunEditPlanToDocument(), assertApplicable(), buildFallbackOperatorText(), buildReplacementOperatorText(), copyStreamDictExceptLengthAndFilter(), EditPlanRejectedError (+16 more)

### Community 40 - "PageNumbersTool.tsx"
Cohesion: 0.10
Nodes (20): acquireSlot(), busyError(), convertPdfToWord(), convertWordToPdf(), crypto, { execFile }, execFileAsync, http (+12 more)

### Community 41 - "PageThumbnailSidebar.tsx"
Cohesion: 0.14
Nodes (20): AnalyticsActivityPage(), AnalyticsPage(), formatDate(), AuditPage(), buildQuery(), entityTypes, HomepagePage(), AdminPageHeader() (+12 more)

### Community 42 - "edit-pdf-privacy-shield.test.ts"
Cohesion: 0.11
Nodes (16): useAnalytics(), OrganizePdfTool(), ConversionResult, PdfToWordTool(), SelectedFile, Stage, ConversionResult, SelectedFile (+8 more)

### Community 43 - "eslint-config-next"
Cohesion: 0.08
Nodes (24): Accordion (disclosure), Button **[carry forward, mostly]**, Card, Checkbox / Switch, Command Palette (genuinely new pattern for Lumeo), Dialog (modal), Dropdown / Select, Empty / Error / Success states **[carry forward]** (+16 more)

### Community 44 - "OrganizePdfTool.tsx"
Cohesion: 0.08
Nodes (41): loadEditEngine(), registerFallbackFont(), TextShowOperator, buildEditPlan(), bytesToCodes(), decodeCodes(), FallbackFontUse, rejectionReasonFor() (+33 more)

### Community 45 - "compilerOptions"
Cohesion: 0.08
Nodes (20): adminPrimitives, compressPage, designSystem, globals, guide, homepage, infoPage, launcher (+12 more)

### Community 46 - "html2pdf.js"
Cohesion: 0.08
Nodes (22): compressPage, css, directoryError, guidance, guide, homepage, launcher, lumeo2Doc (+14 more)

### Community 47 - "MergePdfTool.tsx"
Cohesion: 0.09
Nodes (22): Backup & Restore Point Certification — v1.0.0-production-stable, Final status, Known risks / technical debt (unchanged by this pass, reported only), Repository status, Restore readiness, Step 10 — Security baseline, Step 11 — Analytics, Step 12 — Admin (live route check) (+14 more)

### Community 48 - "shouldAttemptOnce"
Cohesion: 0.16
Nodes (18): handleDeleteSelectedPages(), handleExtractSelectedPages(), handleMergeFile(), handleReorderPages(), runPageOperation(), sanitizePdfFileName(), EditElement, countElementsOnRemovedPages() (+10 more)

### Community 49 - "jsdom"
Cohesion: 0.19
Nodes (15): ExportFormat, ExtractTextTool(), FORMAT_EXTENSION, FORMAT_MIME, buildCsvFromEntries(), buildJsonFromEntries(), buildTxtFromEntries(), csvEscape() (+7 more)

### Community 50 - "@vercel/functions"
Cohesion: 0.16
Nodes (16): Draft, ExportSurface, HtmlToPdfTool(), loadDraft(), saveDraft(), TEMPLATES, L2ActionArea(), buildHtml2PdfOptions() (+8 more)

### Community 51 - "tailwindcss"
Cohesion: 0.16
Nodes (16): allFaqs, compressFaqs, editPdfFaqs, extractTextFaqs, FaqItem, htmlToPdfFaqs, jpgToPdfFaqs, mergeFaqs (+8 more)

### Community 52 - "CompressPdfTool.tsx"
Cohesion: 0.10
Nodes (21): Accessibility, Advanced Options, Compress Workspace, File-Card Pattern, Future Tool Contribution Rules, Merge Workspace, PDF Workspace Rollout, Post-Upload Desktop Layout (+13 more)

### Community 53 - "@types/react-dom"
Cohesion: 0.10
Nodes (21): firebase-admin, html2canvas, html2pdf.js, lucide-react, next, dependencies, firebase-admin, html2canvas (+13 more)

### Community 54 - "typescript"
Cohesion: 0.43
Nodes (5): buildMultiOperatorFixture(), buildMultiRunPlanForIndices(), decodedContentStreamBytes(), firstFontDict(), hexOf()

### Community 55 - "Browser Certification"
Cohesion: 0.15
Nodes (18): asNumber(), FontMetricsSource, glyphAdvancePt(), parseCidWidthsArray(), resolveArrayMaybe(), resolveCidFontWidths(), resolveDictMaybe(), resolveFontMetrics() (+10 more)

### Community 56 - "verify-lumeo-2-foundation.mjs"
Cohesion: 0.10
Nodes (21): scripts, build, db:migrate, dev, lint, start, test, test:compression-target (+13 more)

### Community 57 - "verify-release.mjs"
Cohesion: 0.10
Nodes (17): chrome, compressTool, css, directory, docs, errorPage, footer, homepage (+9 more)

### Community 58 - "dompurify"
Cohesion: 0.14
Nodes (27): AnnouncementsPage(), effectiveStatus(), FeatureFlagsPage(), publicRoutes, SeoPage(), booleanSettings, settingDisplay(), settingMessageValue() (+19 more)

### Community 59 - "tiles.ts"
Cohesion: 0.20
Nodes (15): LoadedDocument, OrganizePageCell, OrganizePageCellProps, OrganizeResult, L2ResultState(), createInitialItems(), duplicateItem(), moveItem() (+7 more)

### Community 60 - "PdfToJpgTool.tsx"
Cohesion: 0.10
Nodes (19): Contact, Contributing expectations, Core principles, Current tools, Deployment, Design system, Development workflow, How analytics work (+11 more)

### Community 61 - "data.ts"
Cohesion: 0.11
Nodes (17): 10. Design token proposal (starting point, not final — resolve during V2-1), 1. Phase 2 — Architectural analysis (grounded in code read this session), 2. Phase 3 — Design research (general knowledge synthesis, not live-verified), 3. Current UI weaknesses (evidence-backed, from this session's audits + this analysis), 4. Current UI strengths (keep, don't rewrite), 5. Version 2 design philosophy, 6. Complete implementation roadmap (Phase 5-7 output), 7. Risk assessment (+9 more)

### Community 62 - "Page Numbers — Engineering Specification (pre-development, for review)"
Cohesion: 0.11
Nodes (17): 10. Performance targets, 11. Edge cases, 12. Implementation roadmap, 1. Problem statement, 2.1 Recommendation: separate module, shared math, not a shared config type, 2. Relationship to Watermark PDF, 3.1 Flow, 3.2 New alignment needs beyond Watermark's 5 corners (+9 more)

### Community 63 - "Watermark PDF v1.1 — Manual Position Mode"
Cohesion: 0.11
Nodes (17): 10. Multi-page behavior (req. 13) — OPEN QUESTION, needs your call before build, 11. Component/UI plan, 12. Regression surface (req. 17), 13. Test plan (maps directly to req. 18's list), 14. Accessibility (req. 12), 15. Implementation roadmap, 1. What already exists (don't rebuild this), 2. Coordinate system decision (req. 4) — percent, not raw points (+9 more)

### Community 64 - "page.tsx"
Cohesion: 0.16
Nodes (16): guidanceModules, AdminChangeSummary(), AdminDependencyList(), AdminGuideLink(), AdminImpactPreview(), AdminRiskIndicator(), AdminSettingExplanation(), AdminStoredOnlyNotice() (+8 more)

### Community 65 - "dependencies"
Cohesion: 0.12
Nodes (16): How to certify a release, Known limitations (not synthesizable here), Lumeo Production Release Certification, Part 10 — Performance baseline (measured, not optimized), Part 11 — Release checklist, Part 12 — Documentation, troubleshooting, future contributors, Part 1 — Test assets, Part 2 — Tool regression matrix (+8 more)

### Community 66 - "Privacy Analytics"
Cohesion: 0.12
Nodes (16): 10. Implementation roadmap, 1. Problem statement, 2.1 Flow, 2.2 What's explicitly NOT in v1 scope (mirrors Watermark's documented, 2. UX, 3.1 Data model (draft, for review — not final until implementation), 3.2 Reusable utilities identified (already exist, use as-is), 3.3 Reusable PDF transformation pipeline (+8 more)

### Community 67 - "verify-lumeo-aura-rollout.mjs"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, supabase, @tailwindcss/postcss, @testing-library/react (+9 more)

### Community 68 - "server.js"
Cohesion: 0.12
Nodes (16): Canvas, Context menus, Drag interactions, Drop zones, File handling, Inspector, Keyboard shortcuts, Layout (+8 more)

### Community 69 - "pdfjs.ts"
Cohesion: 0.12
Nodes (15): Analytics Privacy Model, Architecture, Audit Model, Homepage Slot Rule, Local Migration Procedure, Lumeo Control Center Foundation, Next Phase, Production Migration Procedure (+7 more)

### Community 70 - "PHASE 4 — WORKSPACE EXPERIENCE"
Cohesion: 0.12
Nodes (16): Accessibility, Action Positioning, Directory, Featured-Tool Rule, Five Configured Plus Permanent Sixth Card, Footer, Future Public Tool Contribution Rules, Homepage Hierarchy (+8 more)

### Community 71 - "Lumeo Control Center Foundation"
Cohesion: 0.12
Nodes (15): Accessibility, Architecture, Cache Duration, Homepage Five-Slot Rule, Manual Migration Procedure, Next Phase, `/pdf-tools` Directory, PDF Tools Menu (+7 more)

### Community 72 - "Public Experience Rollout"
Cohesion: 0.12
Nodes (15): Edit PDF Workspace Redesign + Privacy Shield Implementation Plan, Global Constraints, Phase 1: Workspace Shell & MicroDock, Phase 2: FloatingIsland, Phase 3: Privacy Shield, Phase 4: Final QA & Regression Verification, Plan self-review notes, Sequencing note (+7 more)

### Community 73 - "aura-design-system.test.ts"
Cohesion: 0.12
Nodes (15): auraColourTokens, AuraComponentFoundation, auraComponentFoundations, auraMotionTokens, auraSurfaceTokens, auraTextTokens, lumeo2BorderTokens, lumeo2FoundationTokens (+7 more)

### Community 74 - "Edit PDF Workspace Redesign + Privacy Shield Implementation Plan"
Cohesion: 0.12
Nodes (12): compressPage, compressTool, css, docs, mergePage, mergeTool, packageJson, root (+4 more)

### Community 75 - "tokens.ts"
Cohesion: 0.12
Nodes (12): css, guidance, guidanceFoundations, layout, nav, packageJson, requiredComponents, requiredTokens (+4 more)

### Community 76 - "parseDocumentXml.ts"
Cohesion: 0.22
Nodes (12): deleteUpload(), POST(), trimmed(), sanitizePdfFileName(), sanitizePdfFileName(), ensureExtension(), converterBaseUrl(), convertPdfToWord() (+4 more)

### Community 77 - "verify-lumeo-2-workspaces.mjs"
Cohesion: 0.13
Nodes (14): admin_members Authorization, Architecture, How To Create The First Administrator, How To Disable An Administrator, Login Flow, Lumeo Control Center Admin Authentication, Manual Supabase Setup, Next Phase (+6 more)

### Community 78 - "verify-lumeo-aura.mjs"
Cohesion: 0.13
Nodes (15): 13. Production audit, 1. Repository structure, 2. Code quality, 3. Dependency audit, 4. Bundle audit, 5. Memory leak audit, 6. React audit, 7. PDF engine audit — browser-only privacy (+7 more)

### Community 79 - "Lumeo Control Center Admin Authentication"
Cohesion: 0.13
Nodes (14): 1. Current behaviour, measured, 2. Why this isn't a one-line change, 3. Goals / non-goals, 4. Architecture: split the effect, 4a. Effect A — page identity reset, 4b. Effect B — rasterize, 4c. Effect C — detect text, 5. The invariant that makes this tractable (+6 more)

### Community 80 - "Final Engineering Excellence Audit"
Cohesion: 0.14
Nodes (13): Aura OS v2 — Complete Visual Design Specification, Breakpoints (proposed, consistent with Lumeo's existing fluid-type, How to read this document, Input method adaptation, Per-breakpoint behavior, PHASE 5 — MOTION SYSTEM, PHASE 6 — RESPONSIVE SYSTEM, PHASE 7 — DESIGN CONSISTENCY RULES (+5 more)

### Community 81 - "High-Zoom Re-Rendering — Design Spec"
Cohesion: 0.14
Nodes (14): Accessibility, Admin, Analytics, Deployment, Final certification verdict, Functional — PDF tools, Future recommendations, Honesty notice (read this first) (+6 more)

### Community 82 - "client.ts"
Cohesion: 0.15
Nodes (15): HeaderFooterPreview(), ZoneOverlay(), PageRangeSelector, PlacementCorner, alignmentToCorner(), createDefaultHeaderFooterConfig(), createDefaultZone(), HeaderFooterConfig (+7 more)

### Community 83 - "permissions.ts"
Cohesion: 0.07
Nodes (43): GET(), GET(), isAuthorized(), deleteUpload(), GET(), POST(), trimmed(), converterBaseUrl() (+35 more)

### Community 84 - "AURA_OS_V2_DESIGN_SPEC.md"
Cohesion: 0.17
Nodes (6): dockButtonClass(), MicroDock(), MicroDockProps, TOOL_META, ActiveTool, ShapeKind

### Community 86 - "watermark-manual-rotation.test.ts"
Cohesion: 0.15
Nodes (12): Architecture, Components, Edit PDF Workspace Redesign + Privacy Shield — Design Spec, `FloatingIsland.tsx`, Goal, Layout shell, `MicroDock.tsx`, Mobile adaptation (+4 more)

### Community 87 - "scripts"
Cohesion: 0.17
Nodes (12): Accessibility, Action Hierarchy, Atelier Handoff, Card Treatment, Control Treatment, Emotional Goals, Functional Preservation Rules, Lumeo Atelier Theme (+4 more)

### Community 88 - "verify-lumeo-2-public-experience.mjs"
Cohesion: 0.17
Nodes (12): Actual Component Migration, Button Positioning, Deep Workspace Implementation, File-Card Positioning, Future Tool Checklist, Mobile Order, Progress Positioning, Result Positioning (+4 more)

### Community 89 - "MicroDock.tsx"
Cohesion: 0.17
Nodes (11): Accessibility, Control Center Experience, Lumeo Aura Rollout, Manual Review URLs, PDF Tool Policy, Protected Guide, Protected Showcase, Public Experience (+3 more)

### Community 90 - "Edit PDF Workspace Redesign + Privacy Shield — Design Spec"
Cohesion: 0.17
Nodes (11): 1. Page Organizer / Rotator (`/pdf/organize`), 2. HTML to PDF (`/pdf/html-to-pdf`), 3. Text Extractor & Viewer (`/pdf/extract-text`), Architecture, Catalog & navigation wiring, Context, Dependencies, Design: Page Organizer, HTML to PDF, Text Extractor (+3 more)

### Community 91 - "page.tsx"
Cohesion: 0.17
Nodes (11): Architecture, Context, Data model & undo/redo, Edit PDF tool — design, Element interaction model, Export & error handling, Out-of-scope follow-ups (explicitly deferred, not forgotten), Prior art this design builds on (+3 more)

### Community 92 - "ENGINEERING_EXCELLENCE_AUDIT.md"
Cohesion: 0.16
Nodes (14): describePosition(), PageNumberPreview(), createDefaultPageNumbersConfig(), formatNumeral(), formatPageLabel(), NumberFormat, NumeralStyle, PageNumbersConfig (+6 more)

### Community 93 - "SignPdfTool.tsx"
Cohesion: 0.18
Nodes (10): Addendum — second pass (same mission re-run), Checked, confirmed consistent — no action needed, Honesty notice, Ideas (not implemented, not verified as beneficial — genuinely speculative), Implemented this session, Product Excellence & Commercial Readiness Audit (Phases 23-30), Real gap, documented, not fixed (needs product/design judgment, not a mechanical change), Scores (+2 more)

### Community 94 - "AdminGuidance.tsx"
Cohesion: 0.18
Nodes (10): Global Constraints, PDF Organizer, HTML to PDF, Text Extractor Implementation Plan, Task 1: Wire catalog routes and tool registry, Task 2: Page Organizer pure logic, Task 3: Page Organizer tool component and route, Task 4: HTML to PDF pure option-building logic, Task 5: HTML to PDF tool component and route, Task 6: Text extraction pure logic (+2 more)

### Community 95 - "page.tsx"
Cohesion: 0.18
Nodes (10): Edit PDF Tool Implementation Plan, Global Constraints, Self-review notes, Task 1: Element data model & pure array operations, Task 2: PDF export/flatten logic, Task 3: Ink capture component, Task 4: Placed-element view (select/move/resize/line-endpoints), Task 5: Main Edit PDF tool component (+2 more)

### Community 96 - "Design: Page Organizer, HTML to PDF, Text Extractor"
Cohesion: 0.20
Nodes (15): HealthPage(), statusLabel, statusTone, AdminMetricCard(), BuildInfo, checkLibreOfficeConverter(), checkSupabaseDatabase(), checkSupabaseStorage() (+7 more)

### Community 97 - "Edit PDF tool — design"
Cohesion: 0.25
Nodes (10): buildIdPath, imageRoutes, main(), nextBin, projectRoot, reservePort(), routes, stopServer() (+2 more)

### Community 98 - "PDF Workspace Rollout"
Cohesion: 0.26
Nodes (13): deleteFeedbackQuery(), InboxPage(), addAdminMember(), allowedRoles, updateAdminMember(), formatDate(), MembersPage(), requireAdmin() (+5 more)

### Community 99 - "devDependencies"
Cohesion: 0.20
Nodes (10): Accessibility philosophy, Emotional feeling, by moment, Information density, Interaction philosophy, Motion philosophy, Personality, PHASE 1 — DESIGN LANGUAGE, Simplicity rules (+2 more)

### Community 100 - "editPlan.ts"
Cohesion: 0.20
Nodes (10): Animation durations (extends existing tokens, doesn't replace), Animation easing, Border radius scale, Hover / focus / loading timings, Icon sizes, PHASE 2 — DESIGN TOKENS (design only, not implemented), Shadow scale, Spacing scale (+2 more)

### Community 101 - "page.tsx"
Cohesion: 0.20
Nodes (9): Architecture, Browser Client, Local Environment Setup, Lumeo Supabase Foundation, Next Phase, Proxy Session Refresh, Security Rules, Server Client (+1 more)

### Community 102 - "types.ts"
Cohesion: 0.20
Nodes (9): Catalog & admin wiring changes, Context, Explicitly deferred (not forgotten, not designed here), File lifecycle & error handling, Goal, Routing, Shell layout composition, State architecture (+1 more)

### Community 103 - "verify-public-routes.mjs"
Cohesion: 0.20
Nodes (9): 1. What multi-line editing does today, 2. Why this is the hardest item in the backlog, 3. The blocking constraint: the engine cannot insert, 4. Proposed scope, 5. Why not just use Restyle, 6. Building blocks that already exist, 7. Test plan, 8. Open questions (+1 more)

### Community 104 - "InboxClient.tsx"
Cohesion: 0.40
Nodes (12): resolvePageIndices(), composeRotationDegrees(), manualNativeAnchor(), normalizePageRotation(), toNativePoint(), visualPageSize(), embedTextFonts(), hexToRgb01() (+4 more)

### Community 105 - "ContinueWorking.tsx"
Cohesion: 0.20
Nodes (5): RunInWorkerOptions, ToolWorkerErrorMessage, ToolWorkerMessage, ToolWorkerProgressMessage, ToolWorkerResultMessage

### Community 106 - "PHASE 1 — DESIGN LANGUAGE"
Cohesion: 0.20
Nodes (5): actionFiles, protectedNonAdminFiles, protectedRoutes, root, tables

### Community 107 - "PHASE 2 — DESIGN TOKENS (design only, not implemented)"
Cohesion: 0.20
Nodes (9): description, engines, node, main, name, private, scripts, start (+1 more)

### Community 108 - "Lumeo PDF Workspace"
Cohesion: 0.18
Nodes (13): describePosition(), WatermarkPreview(), parsePageRangeInput(), computeTilePositions(), cornerAnchorPct(), createDefaultImageWatermarkConfig(), WatermarkConfig, WatermarkContent (+5 more)

### Community 109 - "ToolWorkspace.tsx"
Cohesion: 0.22
Nodes (8): Accessibility rules, Aura OS v2 — Workspace Standard, Component hierarchy, Layout rules, Responsive rules, Spacing rules, When NOT to reuse, When to reuse

### Community 110 - "Context-Aware Multi-Line Text Reflow — Design Spec"
Cohesion: 0.22
Nodes (8): CLAUDE_FLOW_HOOKS_ENABLED, CLAUDE_FLOW_MAX_AGENTS, CLAUDE_FLOW_MEMORY_BACKEND, CLAUDE_FLOW_MODE, CLAUDE_FLOW_TOPOLOGY, npm_config_update_notifier, cmd, claude-flow

### Community 111 - "toolWorkerClient.ts"
Cohesion: 0.33
Nodes (6): jszip, DocxDocument, parseDocumentXml(), DocxParseError, parseDocx(), jszip

### Community 112 - "verify-control-center.mjs"
Cohesion: 0.39
Nodes (8): decodeXmlEntities(), DocxParagraph, DocxRun, findElements(), hasSelfClosingOrEmptyElement(), parseParagraph(), parseRun(), runPropertyIsOn()

### Community 113 - "package.json"
Cohesion: 0.12
Nodes (16): generateMetadata(), generateMetadata(), generateMetadata(), generateMetadata(), generateMetadata(), breadcrumbSchema, generateMetadata(), SignPdfPage() (+8 more)

### Community 114 - "export.ts"
Cohesion: 0.29
Nodes (7): autoGrow(), ContactForm(), emptyForm, FormState, Toast, TYPE_OPTIONS, FeedbackQueryType

### Community 115 - "elements.ts"
Cohesion: 0.25
Nodes (7): name, overrides, postcss, sharp, uuid, private, version

### Community 116 - "Aura OS v2 — Workspace Standard"
Cohesion: 0.29
Nodes (4): ENV_PATH, parseEnvValue(), parseLocalEnv(), REQUIRED_KEYS

### Community 117 - "claude-flow"
Cohesion: 0.39
Nodes (6): buildPlanForOperatorIndex(), buildTjFixture(), decodedContentStreamBytes(), firstFontDict(), hexOf(), tjOperators()

### Community 118 - "ContactForm.tsx"
Cohesion: 0.38
Nodes (4): FloatingIsland(), FloatingIslandProps, toggleClass(), TextEditElement

### Community 119 - "package.json"
Cohesion: 0.29
Nodes (4): PdfToolDefinition, pdfTools, PdfToolSlug, PdfToolStatus

### Community 120 - "verify-supabase-env.mjs"
Cohesion: 0.29
Nodes (7): Accent color, Color palette, Glass colors (genuinely new — confirmed absent from current tokens), Neutral scale (foundation for both themes), Opacity scale, Semantic status colors, Surface, border, elevation colors

### Community 121 - "edit-apply-plan-tj.test.ts"
Cohesion: 0.29
Nodes (7): Bundle size, Not verified — requires follow-up, Page load (headless Chromium, uncapped network, single sample), PDF processing scale benchmark (pdf-lib, Node, this machine), Performance Certification, Recommendation, Scope and honesty notice

### Community 122 - "FloatingIsland.tsx"
Cohesion: 0.29
Nodes (7): Final Platform Hardening Audit, Fixed this session (own PR each), Honesty notice, Investigated, no change made (evidence + reasoning), Not investigated this session (explicit gaps), Recommendation — what's next, Scored certification

### Community 123 - "PdfToolRegistry.tsx"
Cohesion: 0.29
Nodes (6): Context, Design: Automatic A-Z Tool Sorting + Home Screen Polish, Implementation, Out of scope, Scope, Testing

### Community 124 - "Analytics Certification"
Cohesion: 0.29
Nodes (6): Context, Design: PDF Text Extract — rename + feature expansion, Implementation, Out of scope, Scope, Testing

### Community 125 - "Lumeo Control Center Foundation"
Cohesion: 0.43
Nodes (4): clampPct(), DetectedRunGeometry, planRunRestyle(), RestylePlan

### Community 126 - "Public PDF Tool Catalog"
Cohesion: 0.38
Nodes (4): applyTheme(), AuraTheme, resolveSystemTheme(), resolveTheme()

### Community 127 - "tokens.ts"
Cohesion: 0.29
Nodes (6): react, react, dom, globals, renderHistory(), Snapshot

### Community 128 - "verify-lumeo-2-workspaces.mjs"
Cohesion: 0.29
Nodes (6): Our approach to security, Reporting a vulnerability, Responsible disclosure, Scope, Security Policy, Supported versions

### Community 129 - "verify-lumeo-aura.mjs"
Cohesion: 0.15
Nodes (11): breadcrumbSchema, generateMetadata(), PageNumbersPage(), PageNumbersTool, softwareSchema, PageParams, breadcrumbSchema, generateMetadata() (+3 more)

### Community 130 - "restyleRun.ts"
Cohesion: 0.25
Nodes (10): AdminError(), GlobalError(), PdfToolError(), PdfToolsError(), L2PublicErrorState(), getDeviceClass(), getOperatingSystem(), captureClientError() (+2 more)

### Community 131 - "embeddedImages.ts"
Cohesion: 0.20
Nodes (7): Anchor, anchorFractions(), anchorPointFromTopLeft(), nativeAnchorForCenter(), topLeftFromAnchorPoint(), WatermarkAnchor, ALL_ANCHORS

### Community 132 - "Lumeo Control Center Admin Authentication"
Cohesion: 0.29
Nodes (6): Analytics Certification, History, Queries used, Result, What's still not covered, What this confirms

### Community 133 - "Public Experience Rollout"
Cohesion: 0.33
Nodes (6): Compact Dropdowns And Privacy Notes, Hierarchy And Spacing, Interaction Restraint, Lumeo Atelier Final Polish, Planned Tool Pages, Preservation Rules

### Community 134 - "Security Policy"
Cohesion: 0.33
Nodes (5): AI roadmap for later, Available now / build first, Current development: Non-AI studio features, Lumeo roadmap, Next non-AI features requiring stronger render engine

### Community 135 - "edit-apply-plan-quote.test.ts"
Cohesion: 0.33
Nodes (6): Fixed this session, Not verified — requires follow-up, Recommendation, Reviewed, no code change made, Scope and honesty notice, Security Certification

### Community 136 - "page.tsx"
Cohesion: 0.33
Nodes (6): Fixed this session, Not verified — requires follow-up, Recommendation, Scope and honesty notice, SEO Certification, Verified, already correct

### Community 140 - "Security Certification"
Cohesion: 0.33
Nodes (5): Deploy (Render, free tier), Keep it warm (optional but recommended), Notes, Wire it into the main app, Word to PDF converter service

### Community 141 - "SEO Certification"
Cohesion: 0.53
Nodes (4): copyAcroForm(), copyDocumentLikeCompressDoes(), copyOutline(), copyOutlineItem()

### Community 142 - "edit-shared-forms.test.ts"
Cohesion: 0.23
Nodes (8): generateMetadata(), structuredData, PdfHeroVisual(), actionMatches(), PROCESSING_TAG, ToolCard(), toolMatches(), ToolsExplorer()

### Community 143 - "buildEditPlan"
Cohesion: 0.40
Nodes (3): PageThumbnailSidebarProps, Thumb, ThumbProps

### Community 144 - "ContinueWorking.tsx"
Cohesion: 0.40
Nodes (4): Known, accepted limitations (not bugs, do not "fix" without a v1.1 request), Watermark PDF — v1.0.0 freeze, What shipped in v1.0.0, Where the architecture lives (for the next engineer)

### Community 145 - "layout.spec.ts"
Cohesion: 0.26
Nodes (9): EditElementView, EditElementViewImpl(), LiveGeometry, canResizeElement(), isLineShape(), HorizontalAlign, pickHorizontalAlign(), pickVerticalPlacement() (+1 more)

### Community 148 - "edit-shared-form-cross-page-hardening.test.ts"
Cohesion: 0.67
Nodes (3): Path, fingerprint(), main()

### Community 152 - "verify-release.mjs"
Cohesion: 0.67
Nodes (3): createExportSurface(), dompurify, dompurify

### Community 164 - "page.tsx"
Cohesion: 0.27
Nodes (8): RpcResult, safeDuration(), trackPublicAnalyticsEvent(), withTimeout(), getBrowserFamily(), GeoInfo, readGeoCookie(), getAnonymousSessionId()

### Community 165 - "robots.ts"
Cohesion: 0.25
Nodes (8): bucketFileSize(), AnalyticsBrowserFamily, AnalyticsDeviceClass, AnalyticsErrorCode, AnalyticsEventName, AnalyticsOperatingSystem, AnalyticsRemoteTrackResult, AnalyticsSizeBucket

### Community 176 - "ToolGlyph.tsx"
Cohesion: 0.24
Nodes (7): base, shard(), ShardStyle, ToolGlyph(), PublicPdfToolsMenuClient(), L2MenuSurface, ToolGlyphName

### Community 177 - "export.ts"
Cohesion: 0.46
Nodes (7): exportEditedPdf(), hexToRgb01(), normalizePageRotation(), PageRotation, toNativeBox(), toNativePoint(), visualPageSize()

### Community 178 - "index.ts"
Cohesion: 0.43
Nodes (7): cachedSnapshot, clearRecentFiles(), getRecentFiles(), isBrowser(), isValidItem(), recordRecentFile(), RecordRecentFileInput

### Community 179 - "page.tsx"
Cohesion: 0.33
Nodes (5): breadcrumbSchema, ExtractTextPage(), ExtractTextTool, generateMetadata(), softwareSchema

### Community 180 - "page.tsx"
Cohesion: 0.33
Nodes (5): breadcrumbSchema, generateMetadata(), MergePdfPage(), MergePdfTool, softwareSchema

### Community 181 - "page.tsx"
Cohesion: 0.33
Nodes (5): breadcrumbSchema, generateMetadata(), PdfToWordPage(), PdfToWordTool, softwareSchema

### Community 182 - "page.tsx"
Cohesion: 0.33
Nodes (5): breadcrumbSchema, generateMetadata(), softwareSchema, SplitPdfPage(), SplitPdfTool

### Community 183 - "edit-shared-forms.test.ts"
Cohesion: 0.40
Nodes (4): AmbiguousSharedFormError, buildFormXObject(), editFirstFormOperator(), hexOf()

### Community 185 - "Browser Certification"
Cohesion: 0.40
Nodes (5): Browser Certification, Not verified — requires follow-up, Recommendation, Scope and honesty notice, What was actually verified (Chromium, this session)

### Community 186 - "pinned_version"
Cohesion: 0.67
Nodes (3): main(), pinned_version(), The single source of truth, read rather than duplicated.

## Knowledge Gaps
- **1216 isolated node(s):** `cmd`, `npm_config_update_notifier`, `CLAUDE_FLOW_MODE`, `CLAUDE_FLOW_HOOKS_ENABLED`, `CLAUDE_FLOW_TOPOLOGY` (+1211 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `edit-page-ops.test.ts` to `Design: Page Organizer, HTML to PDF, Text Extractor`, `page.tsx`, `PDF Workspace Rollout`, `PageThumbnailSidebar.tsx`, `page.tsx`, `page.tsx`, `config.ts`, `package.json`, `permissions.ts`, `page.tsx`, `dompurify`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `dependencies` connect `@types/react-dom` to `eslint.config.mjs`, `toolWorkerClient.ts`, `elements.ts`, `verify-release.mjs`, `pdf-lib`, `tokens.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `createExportSurface()` connect `verify-release.mjs` to `@vercel/functions`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `cmd`, `npm_config_update_notifier`, `CLAUDE_FLOW_MODE` to the rest of the system?**
  _1216 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `data.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0662004662004662 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.05605499735589635 - nodes in this community are weakly interconnected._
- **Should `requireAdmin` be split into smaller, more focused modules?**
  _Cohesion score 0.1286549707602339 - nodes in this community are weakly interconnected._