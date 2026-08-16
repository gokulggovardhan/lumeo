# Graph Report - lumeo-app  (2026-08-16)

## Corpus Check
- 409 files · ~538,249 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3004 nodes · 6417 edges · 182 communities (162 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.64)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `45cd5982`
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
- PdfToJpgTool.tsx
- data.ts
- dependencies
- Privacy Analytics
- verify-lumeo-aura-rollout.mjs
- server.js
- aura-design-system.test.ts
- scripts
- verify-lumeo-2-public-experience.mjs
- SignPdfTool.tsx
- AdminGuidance.tsx
- page.tsx
- PDF Workspace Rollout
- devDependencies
- editPlan.ts
- page.tsx
- Lumeo PDF Workspace
- ToolWorkspace.tsx
- elements.ts
- Lumeo Control Center Foundation
- Public PDF Tool Catalog
- tokens.ts
- verify-lumeo-2-workspaces.mjs
- verify-lumeo-aura.mjs
- Lumeo Control Center Admin Authentication
- Public Experience Rollout
- buildEditPlan
- ContinueWorking.tsx
- layout.spec.ts
- WatermarkTool.tsx
- Lumeo Atelier Theme
- Deep Workspace Implementation
- Lumeo Aura Rollout
- toolWorkerClient.ts
- formXObjects.ts
- verify-public-routes.mjs
- edit-match-text-run.test.ts
- applyRedaction.ts
- Lumeo Supabase Foundation
- verify-control-center.mjs
- package.json
- applyEditPlan.ts
- claude-flow
- fontEncoding.ts
- ContactForm.tsx
- PHASE 3 — COMPONENT INVENTORY
- config.ts
- verify-supabase-env.mjs
- Backup & Restore Point Certification — v1.0.0-production-stable
- Security Policy
- Lumeo Atelier Final Polish
- Lumeo roadmap
- verify-admin-auth.mjs
- verify-privacy-analytics.mjs
- verify-public-tool-catalog.mjs
- ExtractTextTool.tsx
- Word to PDF converter service
- layout.tsx
- config.ts
- export.ts
- Aura OS v2 — Foundation Plan
- Page Numbers — Engineering Specification (pre-development, for review)
- Watermark PDF v1.1 — Manual Position Mode
- Lumeo Production Release Certification
- Crop PDF — Engineering Specification (pre-development, for review)
- PHASE 4 — WORKSPACE EXPERIENCE
- Edit PDF Workspace Redesign + Privacy Shield Implementation Plan
- parseDocumentXml.ts
- fontMetrics.ts
- package.json
- Final Engineering Excellence Audit
- opengraph-image.tsx
- twitter-image.tsx
- High-Zoom Re-Rendering — Design Spec
- AURA_OS_V2_DESIGN_SPEC.md
- vercel.json
- Production Certification
- CLAUDE.md
- watermark-manual-rotation.test.ts
- eslint.config.mjs
- Edit PDF Workspace Redesign + Privacy Shield — Design Spec
- pdfFixtures.ts
- next.config.ts
- sign-history.test.ts
- Design: Page Organizer, HTML to PDF, Text Extractor
- Edit PDF tool — design
- postcss.config.mjs
- db-migrate.mjs
- Product Excellence & Commercial Readiness Audit (Phases 23-30)
- PDF Organizer, HTML to PDF, Text Extractor Implementation Plan
- Global Constraints
- PHASE 1 — DESIGN LANGUAGE
- PHASE 2 — DESIGN TOKENS (design only, not implemented)
- Workspace Shell — Phase 1 design (pilot: Merge PDF)
- Context-Aware Multi-Line Text Reflow — Design Spec
- Aura OS v2 — Workspace Standard
- edit-apply-plan-tj.test.ts
- Color palette
- Performance Certification
- Final Platform Hardening Audit
- Design: Automatic A-Z Tool Sorting + Home Screen Polish
- Design: PDF Text Extract — rename + feature expansion
- restyleRun.ts
- theme.ts
- edit-apply-plan-quote.test.ts
- Analytics Certification
- Security Certification
- SEO Certification
- compression-document-structure.test.ts
- Watermark PDF — v1.0.0 freeze
- html2canvas.d.ts
- pdfjs-page-timeout.test.ts

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

## Communities (182 total, 20 thin omitted)

### Community 0 - "EditPdfTool.tsx"
Cohesion: 0.06
Nodes (23): InkCanvas(), Point, RedactionLayerProps, TextRunOverlay, TextRunOverlayProps, applyTextRunEdit, currentPageElements, EditEngine (+15 more)

### Community 1 - "data.ts"
Cohesion: 0.08
Nodes (47): AdminMemberView, AnalyticsSummary, AuditLogFilters, DataResult, getAnalyticsSummary(), isRecord(), numberValue(), OverviewData (+39 more)

### Community 2 - "page.tsx"
Cohesion: 0.11
Nodes (27): AnalyticsActivityPage(), AnalyticsPage(), formatDate(), AuditPage(), buildQuery(), entityTypes, HomepagePage(), AdminDataTable() (+19 more)

### Community 3 - "createClient"
Cohesion: 0.30
Nodes (9): InboxPage(), updateTool(), ToolsPage(), getFeedbackQueries(), getToolCategories(), canManageInbox(), canManageTools(), canViewInbox() (+1 more)

### Community 4 - "requireAdmin"
Cohesion: 0.16
Nodes (30): deleteAnnouncement(), saveAnnouncement(), toggleAnnouncement(), tones, AnnouncementsPage(), saveFeatureFlag(), settingValue(), updateSiteSetting() (+22 more)

### Community 5 - "page.tsx"
Cohesion: 0.20
Nodes (16): deleteFeatureFlag(), toggleFeatureFlag(), effectiveStatus(), FeatureFlagsPage(), booleanSettings, settingDisplay(), settingMessageValue(), SettingsPage() (+8 more)

### Community 6 - "edit-page-ops.test.ts"
Cohesion: 0.15
Nodes (20): handleDeleteSelectedPages(), handleExtractSelectedPages(), handleMergeFile(), handleReorderPages(), runPageOperation(), sanitizePdfFileName(), createTextElement(), EditElement (+12 more)

### Community 7 - "PublicCatalogPageShell.tsx"
Cohesion: 0.33
Nodes (5): breadcrumbSchema, generateMetadata(), softwareSchema, SplitPdfPage(), SplitPdfTool

### Community 8 - "PublicPdfChrome.tsx"
Cohesion: 0.28
Nodes (6): base, shard(), ShardStyle, ToolGlyph(), PublicPdfToolsMenuClient(), L2MenuSurface

### Community 9 - "config.ts"
Cohesion: 0.18
Nodes (13): describePosition(), WatermarkPreview(), parsePageRangeInput(), computeTilePositions(), cornerAnchorPct(), createDefaultImageWatermarkConfig(), WatermarkConfig, WatermarkContent (+5 more)

### Community 10 - "page.tsx"
Cohesion: 0.20
Nodes (15): HealthPage(), statusLabel, statusTone, AdminMetricCard(), BuildInfo, checkLibreOfficeConverter(), checkSupabaseDatabase(), checkSupabaseStorage() (+7 more)

### Community 11 - "page.tsx"
Cohesion: 0.14
Nodes (11): fraunces, inter, metadata, plexMono, viewport, AnnouncementBanner(), AnnouncementTone, PublicAnnouncement (+3 more)

### Community 12 - "EditElementView.tsx"
Cohesion: 0.26
Nodes (9): EditElementView, EditElementViewImpl(), LiveGeometry, canResizeElement(), isLineShape(), HorizontalAlign, pickHorizontalAlign(), pickVerticalPlacement() (+1 more)

### Community 13 - "Aura.tsx"
Cohesion: 0.07
Nodes (33): PublicNavLink(), AuraButton(), AuraCheckbox(), AuraFormField(), AuraIconButton(), AuraInput(), AuraLabeledControl(), AuraRadioGroup() (+25 more)

### Community 14 - "ControlCenterMobileNav.tsx"
Cohesion: 0.09
Nodes (25): AdminLoginPage(), getSafeMessage(), LoginMessageKey, metadata, safeMessages, MaintenancePage(), metadata, AdminIcon() (+17 more)

### Community 15 - "AnalyticsProvider.tsx"
Cohesion: 0.14
Nodes (21): AnalyticsPageView(), PUBLIC_PAGE_ROUTES, AnalyticsContext, AnalyticsContextValue, AnalyticsProvider(), debugOverrideEnabled(), doNotTrackEnabled(), PUBLIC_ANALYTICS_ROUTES (+13 more)

### Community 16 - "MicroDock.tsx"
Cohesion: 0.17
Nodes (6): dockButtonClass(), MicroDock(), MicroDockProps, TOOL_META, ActiveTool, ShapeKind

### Community 17 - "export.ts"
Cohesion: 0.39
Nodes (8): loadEditEngine(), exportEditedPdf(), hexToRgb01(), normalizePageRotation(), PageRotation, toNativeBox(), toNativePoint(), visualPageSize()

### Community 18 - "page.tsx"
Cohesion: 0.22
Nodes (13): EditPdfTool(), clampRenderScaleToMaxDimension(), clampRenderScaleToPixelBudget(), computeAdaptiveRenderScale(), loadPdfJsModule(), MinimalRenderTask, openPdfJsDocument(), quantizeRenderScale() (+5 more)

### Community 19 - "page.tsx"
Cohesion: 0.24
Nodes (11): AdminPage(), formatDate(), AdminStatusBadge(), getAnnouncements(), getOverviewData(), getPdfTools(), getSystemStatus(), getUnreadInboxCount() (+3 more)

### Community 20 - "page.tsx"
Cohesion: 0.10
Nodes (22): generateMetadata(), Home(), structuredData, trustItems, whyItems, PageParams, ToolCategoryPage(), generateMetadata() (+14 more)

### Community 21 - "client.ts"
Cohesion: 0.23
Nodes (11): fetchPublicAnalyticsEnabled(), RpcResult, safeDuration(), trackPublicAnalyticsEvent(), withTimeout(), getBrowserFamily(), getDeviceClass(), getOperatingSystem() (+3 more)

### Community 22 - "getToolBlockedState"
Cohesion: 0.05
Nodes (67): breadcrumbSchema, CompressPdfPage(), CompressPdfTool, generateMetadata(), softwareSchema, breadcrumbSchema, CropPdfPage(), CropPdfTool (+59 more)

### Community 23 - "page.tsx"
Cohesion: 0.19
Nodes (17): getFormValue(), signInAdmin(), metadata, ProtectedAdminLayout(), addAdminMember(), allowedRoles, updateAdminMember(), formatDate() (+9 more)

### Community 25 - "edit-fallback-font-apply.test.ts"
Cohesion: 0.28
Nodes (8): AdminError(), GlobalError(), PdfToolError(), PdfToolsError(), L2PublicErrorState(), captureClientError(), ErrorCaptureInput, withTimeout()

### Community 26 - "FloatingIsland.tsx"
Cohesion: 0.38
Nodes (4): FloatingIsland(), FloatingIslandProps, toggleClass(), TextEditElement

### Community 27 - "withSeoOverride"
Cohesion: 0.11
Nodes (27): aboutSchema, generateMetadata(), accessibilitySchema, generateMetadata(), contactSchema, generateMetadata(), generateMetadata(), generateMetadata() (+19 more)

### Community 28 - "page.tsx"
Cohesion: 0.40
Nodes (9): deleteSeoSetting(), saveSeoSetting(), publicRoutes, SeoPage(), getSeoSettings(), canManageSeo(), validateRoute(), validateSeoDescription() (+1 more)

### Community 29 - "page.tsx"
Cohesion: 0.15
Nodes (10): breadcrumbSchema, generateMetadata(), MergePdfPage(), MergePdfTool, softwareSchema, breadcrumbSchema, generateMetadata(), OrganizePdfPage() (+2 more)

### Community 30 - "page.tsx"
Cohesion: 0.25
Nodes (8): bucketFileSize(), AnalyticsBrowserFamily, AnalyticsDeviceClass, AnalyticsErrorCode, AnalyticsEventName, AnalyticsOperatingSystem, AnalyticsRemoteTrackResult, AnalyticsSizeBucket

### Community 31 - "page.tsx"
Cohesion: 0.36
Nodes (7): absoluteTime(), InboxClient(), relativeTime(), TypeFilter, InboxCountBadge(), createClient(), FeedbackQuery

### Community 32 - "JpgToPdfTool.tsx"
Cohesion: 0.12
Nodes (27): CleanupMessage, computeRotatedPreviewBox(), ConvertStatus, correctImageOrientation(), createFileId(), getDisplayDimensions(), getPageSizeLabel(), JpgToPdfTool() (+19 more)

### Community 33 - "page.tsx"
Cohesion: 0.31
Nodes (8): ContinueWorking(), QUICK_ACTION_SLUGS, RecentFileLink(), RecentFileItem, EMPTY_SNAPSHOT, getServerSnapshot(), subscribe(), useRecentFiles()

### Community 34 - "catalog.ts"
Cohesion: 0.13
Nodes (17): groupActions(), ToolCategoryDetail(), actionMatches(), PROCESSING_TAG, ToolCard(), toolMatches(), ToolsExplorer(), availableTools (+9 more)

### Community 35 - "Lumeo 2.0 Design System"
Cohesion: 0.06
Nodes (31): 10. Radii, 11. Motion, 12. Buttons, 13. Form Controls, 14. Switches, 15. Segmented Controls, 16. Cards, 17. Upload Experience (+23 more)

### Community 36 - "Lumeo Aura Design System"
Cohesion: 0.06
Nodes (31): 10. Buttons, 11. Form Controls, 12. Cards, 13. Navigation, 14. Tool Workspaces, 15. Control Center, 16. Guidance System, 17. Accessibility (+23 more)

### Community 37 - "pdfToWordStorage.ts"
Cohesion: 0.06
Nodes (51): deleteUpload(), GET(), POST(), trimmed(), GET(), isAuthorized(), deleteUpload(), GET() (+43 more)

### Community 38 - "edit-rotated-text.test.ts"
Cohesion: 0.29
Nodes (4): PdfToolDefinition, pdfTools, PdfToolSlug, PdfToolStatus

### Community 39 - "SplitPdfTool.tsx"
Cohesion: 0.08
Nodes (23): compressPagesToRange(), densityClasses, densityPreviewClasses, friendlyPageError(), getSuggestions(), PageInfo, ParsedRange, parsePageList() (+15 more)

### Community 40 - "PageNumbersTool.tsx"
Cohesion: 0.06
Nodes (58): ASPECT_PRESETS, CropPdfTool(), LoadedPdf, runWithTimeout(), sanitizePdfFileName(), ALIGNMENTS, estimateLabelSizePct(), HeaderFooterTool() (+50 more)

### Community 41 - "PageThumbnailSidebar.tsx"
Cohesion: 0.40
Nodes (3): PageThumbnailSidebarProps, Thumb, ThumbProps

### Community 42 - "edit-pdf-privacy-shield.test.ts"
Cohesion: 0.43
Nodes (4): EmbeddedJpegXObject, findEmbeddedJpegs(), isDctDecodeFilter(), isPlainDctDecodeJpeg()

### Community 44 - "OrganizePdfTool.tsx"
Cohesion: 0.22
Nodes (14): LoadedDocument, OrganizePageCell, OrganizePageCellProps, OrganizeResult, createInitialItems(), duplicateItem(), moveItem(), normalizeRotation() (+6 more)

### Community 45 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 46 - "html2pdf.js"
Cohesion: 0.33
Nodes (5): breadcrumbSchema, generateMetadata(), softwareSchema, WatermarkPdfPage(), WatermarkTool

### Community 47 - "MergePdfTool.tsx"
Cohesion: 0.11
Nodes (25): CleanupMessage, createFileId(), destroyPdfJsDoc(), getOutputPageSize(), getOutputStyleLabel(), getPageSizeType(), getSizeSignature(), isSmartFitFormat() (+17 more)

### Community 48 - "shouldAttemptOnce"
Cohesion: 0.16
Nodes (16): Draft, ExportSurface, HtmlToPdfTool(), loadDraft(), saveDraft(), TEMPLATES, L2ActionArea(), buildHtml2PdfOptions() (+8 more)

### Community 50 - "@vercel/functions"
Cohesion: 0.40
Nodes (4): AmbiguousSharedFormError, buildFormXObject(), editFirstFormOperator(), hexOf()

### Community 52 - "CompressPdfTool.tsx"
Cohesion: 0.06
Nodes (42): CompressAnalysis, CompressPdfTool(), CompressResult, CompressStage, DocumentRisk, ExpertMode, Opportunity, PageInfo (+34 more)

### Community 55 - "Browser Certification"
Cohesion: 0.40
Nodes (5): Browser Certification, Not verified — requires follow-up, Recommendation, Scope and honesty notice, What was actually verified (Chromium, this session)

### Community 56 - "verify-lumeo-2-foundation.mjs"
Cohesion: 0.07
Nodes (22): buttonVariants, compressTool, controlShell, css, docs, footer, guidance, mergeTool (+14 more)

### Community 57 - "verify-release.mjs"
Cohesion: 0.40
Nodes (4): CORE_STEPS, DEPRECATED_SCRIPTS, results, VERIFY_SCRIPTS

### Community 58 - "dompurify"
Cohesion: 0.67
Nodes (3): createExportSurface(), dompurify, dompurify

### Community 60 - "PdfToJpgTool.tsx"
Cohesion: 0.11
Nodes (19): ConvertStatus, DpiPreset, dpiPresets, JpgPageResult, OutputFormat, parsePageSelection(), parsePageToken(), PdfAnalysis (+11 more)

### Community 61 - "data.ts"
Cohesion: 0.16
Nodes (24): asNumber(), asStatus(), asString(), createPublicCatalogClient(), fetchPublicHomepageTools(), fetchPublicPdfCatalog(), getPublicHomepageTools, HomepageToolRow (+16 more)

### Community 65 - "dependencies"
Cohesion: 0.08
Nodes (25): firebase-admin, html2canvas, html2pdf.js, lucide-react, next, dependencies, firebase-admin, html2canvas (+17 more)

### Community 66 - "Privacy Analytics"
Cohesion: 0.08
Nodes (24): Abuse-Control Limitations, Admin Analytics Views, Analytics V1 Scope, Anonymous Session Design, Architecture, Collection Setting, Daily Metric Refresh, Data Collected (+16 more)

### Community 67 - "verify-lumeo-aura-rollout.mjs"
Cohesion: 0.08
Nodes (20): adminPrimitives, compressPage, designSystem, globals, guide, homepage, infoPage, launcher (+12 more)

### Community 68 - "server.js"
Cohesion: 0.10
Nodes (20): acquireSlot(), busyError(), convertPdfToWord(), convertWordToPdf(), crypto, { execFile }, execFileAsync, http (+12 more)

### Community 73 - "aura-design-system.test.ts"
Cohesion: 0.08
Nodes (22): compressPage, css, directoryError, guidance, guide, homepage, launcher, lumeo2Doc (+14 more)

### Community 87 - "scripts"
Cohesion: 0.10
Nodes (21): scripts, build, db:migrate, dev, lint, start, test, test:compression-target (+13 more)

### Community 88 - "verify-lumeo-2-public-experience.mjs"
Cohesion: 0.10
Nodes (17): chrome, compressTool, css, directory, docs, errorPage, footer, homepage (+9 more)

### Community 93 - "SignPdfTool.tsx"
Cohesion: 0.09
Nodes (29): ARROW_DELTAS, clamp(), LiveGeometry, PlacedElementView(), canvasToSignature(), CreatedSignature, DrawTab(), HANDWRITING_FONTS (+21 more)

### Community 94 - "AdminGuidance.tsx"
Cohesion: 0.16
Nodes (16): guidanceModules, AdminChangeSummary(), AdminDependencyList(), AdminGuideLink(), AdminImpactPreview(), AdminRiskIndicator(), AdminSettingExplanation(), AdminStoredOnlyNotice() (+8 more)

### Community 95 - "page.tsx"
Cohesion: 0.16
Nodes (16): allFaqs, compressFaqs, editPdfFaqs, extractTextFaqs, FaqItem, htmlToPdfFaqs, jpgToPdfFaqs, mergeFaqs (+8 more)

### Community 98 - "PDF Workspace Rollout"
Cohesion: 0.10
Nodes (21): Accessibility, Advanced Options, Compress Workspace, File-Card Pattern, Future Tool Contribution Rules, Merge Workspace, PDF Workspace Rollout, Post-Upload Desktop Layout (+13 more)

### Community 99 - "devDependencies"
Cohesion: 0.12
Nodes (17): eslint, devDependencies, eslint, @playwright/test, supabase, @tailwindcss/postcss, @testing-library/react, @types/jsdom (+9 more)

### Community 100 - "editPlan.ts"
Cohesion: 0.10
Nodes (31): buildEditPlan(), bytesToCodes(), decodeCodes(), FallbackFontUse, rejectionReasonFor(), SUPPORTED_OPERATOR_KINDS, asNumber(), embeddedByDocument (+23 more)

### Community 101 - "page.tsx"
Cohesion: 0.10
Nodes (30): POST(), ignoreErrorLog(), reopenErrorLog(), resolveErrorLog(), setErrorStatus(), buildQuery(), ErrorsPage(), severities (+22 more)

### Community 108 - "Lumeo PDF Workspace"
Cohesion: 0.10
Nodes (19): Contact, Contributing expectations, Core principles, Current tools, Deployment, Design system, Development workflow, How analytics work (+11 more)

### Community 109 - "ToolWorkspace.tsx"
Cohesion: 0.07
Nodes (25): colourTokens, L2ResultState(), ToolDocumentSummary(), ToolModeCard(), ToolOptionRow(), ToolPrivacyNote(), ToolProcessingStage(), ToolResultStage() (+17 more)

### Community 115 - "elements.ts"
Cohesion: 0.14
Nodes (16): handleInkStroke(), restyleSelectedRun(), clampPct(), createInkElement(), createShapeElement(), createWhiteoutElement(), deleteElement(), EditElementBase (+8 more)

### Community 125 - "Lumeo Control Center Foundation"
Cohesion: 0.12
Nodes (15): Analytics Privacy Model, Architecture, Audit Model, Homepage Slot Rule, Local Migration Procedure, Lumeo Control Center Foundation, Next Phase, Production Migration Procedure (+7 more)

### Community 126 - "Public PDF Tool Catalog"
Cohesion: 0.12
Nodes (15): Accessibility, Architecture, Cache Duration, Homepage Five-Slot Rule, Manual Migration Procedure, Next Phase, `/pdf-tools` Directory, PDF Tools Menu (+7 more)

### Community 127 - "tokens.ts"
Cohesion: 0.12
Nodes (15): auraColourTokens, AuraComponentFoundation, auraComponentFoundations, auraMotionTokens, auraSurfaceTokens, auraTextTokens, lumeo2BorderTokens, lumeo2FoundationTokens (+7 more)

### Community 128 - "verify-lumeo-2-workspaces.mjs"
Cohesion: 0.12
Nodes (12): compressPage, compressTool, css, docs, mergePage, mergeTool, packageJson, root (+4 more)

### Community 129 - "verify-lumeo-aura.mjs"
Cohesion: 0.12
Nodes (12): css, guidance, guidanceFoundations, layout, nav, packageJson, requiredComponents, requiredTokens (+4 more)

### Community 132 - "Lumeo Control Center Admin Authentication"
Cohesion: 0.13
Nodes (14): admin_members Authorization, Architecture, How To Create The First Administrator, How To Disable An Administrator, Login Flow, Lumeo Control Center Admin Authentication, Manual Supabase Setup, Next Phase (+6 more)

### Community 133 - "Public Experience Rollout"
Cohesion: 0.12
Nodes (16): Accessibility, Action Positioning, Directory, Featured-Tool Rule, Five Configured Plus Permanent Sixth Card, Footer, Future Public Tool Contribution Rules, Homepage Hierarchy (+8 more)

### Community 143 - "buildEditPlan"
Cohesion: 0.47
Nodes (4): buildFormXObject(), buildTwoPageDocWithSharedHeader(), editFirstFormOperator(), hexOf()

### Community 144 - "ContinueWorking.tsx"
Cohesion: 0.18
Nodes (14): CommandPaletteDialog(), CommandPaletteDialog, CommandPaletteTrigger(), buildCommandPaletteIndex(), CommandPaletteItem, normalize(), searchCommandPaletteIndex(), STATIC_PAGES (+6 more)

### Community 145 - "layout.spec.ts"
Cohesion: 0.13
Nodes (28): assertGenuinelySplit(), drawSensitiveText(), SPLIT_RUN_PDF, splitRun(), TEXT_ONLY_PDF, textOnly(), TMP_DIR, TWO_PAGE_PDF (+20 more)

### Community 156 - "WatermarkTool.tsx"
Cohesion: 0.19
Nodes (21): ANCHOR_GRID, ANCHOR_LABELS, ContentMode, estimateContentSizePct(), LoadedPdf, runWithTimeout(), sanitizePdfFileName(), WatermarkTool() (+13 more)

### Community 178 - "Lumeo Atelier Theme"
Cohesion: 0.17
Nodes (12): Accessibility, Action Hierarchy, Atelier Handoff, Card Treatment, Control Treatment, Emotional Goals, Functional Preservation Rules, Lumeo Atelier Theme (+4 more)

### Community 179 - "Deep Workspace Implementation"
Cohesion: 0.17
Nodes (12): Actual Component Migration, Button Positioning, Deep Workspace Implementation, File-Card Positioning, Future Tool Checklist, Mobile Order, Progress Positioning, Result Positioning (+4 more)

### Community 180 - "Lumeo Aura Rollout"
Cohesion: 0.17
Nodes (11): Accessibility, Control Center Experience, Lumeo Aura Rollout, Manual Review URLs, PDF Tool Policy, Protected Guide, Protected Showcase, Public Experience (+3 more)

### Community 181 - "toolWorkerClient.ts"
Cohesion: 0.20
Nodes (5): RunInWorkerOptions, ToolWorkerErrorMessage, ToolWorkerMessage, ToolWorkerProgressMessage, ToolWorkerResultMessage

### Community 198 - "formXObjects.ts"
Cohesion: 0.12
Nodes (29): asNumber(), ContentStreamToken, defaultTextState(), IDENTITY_MATRIX, isDelimiter(), isWhitespace(), Matrix2x3, multiplyMatrix() (+21 more)

### Community 199 - "verify-public-routes.mjs"
Cohesion: 0.25
Nodes (10): buildIdPath, imageRoutes, main(), nextBin, projectRoot, reservePort(), routes, stopServer() (+2 more)

### Community 200 - "edit-match-text-run.test.ts"
Cohesion: 0.10
Nodes (23): collectPageTextOperators(), bestOperatorAmong(), buildOperatorSpatialIndex(), cellKey(), matchDetectedRunToOperator(), matchDetectedRunToOperatorIndexed(), MatchedTextRun, operatorOriginPx() (+15 more)

### Community 236 - "applyRedaction.ts"
Cohesion: 0.13
Nodes (24): handleApplyRedaction(), handleDetectSensitive(), RFC-5322, applyRedaction(), pageDrawsImages(), RedactionTargetRun, assessRedactionCoverage(), boxesOverlap() (+16 more)

### Community 237 - "Lumeo Supabase Foundation"
Cohesion: 0.20
Nodes (9): Architecture, Browser Client, Local Environment Setup, Lumeo Supabase Foundation, Next Phase, Proxy Session Refresh, Security Rules, Server Client (+1 more)

### Community 238 - "verify-control-center.mjs"
Cohesion: 0.20
Nodes (5): actionFiles, protectedNonAdminFiles, protectedRoutes, root, tables

### Community 239 - "package.json"
Cohesion: 0.20
Nodes (9): description, engines, node, main, name, private, scripts, start (+1 more)

### Community 255 - "applyEditPlan.ts"
Cohesion: 0.17
Nodes (22): applyEditPlanToBytes(), applyEditPlanToDocument(), applyMultiRunEditPlanToDocument(), assertApplicable(), buildFallbackOperatorText(), buildReplacementOperatorText(), copyStreamDictExceptLengthAndFilter(), EditPlanRejectedError (+14 more)

### Community 256 - "claude-flow"
Cohesion: 0.22
Nodes (8): CLAUDE_FLOW_HOOKS_ENABLED, CLAUDE_FLOW_MAX_AGENTS, CLAUDE_FLOW_MEMORY_BACKEND, CLAUDE_FLOW_MODE, CLAUDE_FLOW_TOPOLOGY, npm_config_update_notifier, cmd, claude-flow

### Community 267 - "fontEncoding.ts"
Cohesion: 0.10
Nodes (26): applyDifferences(), classifyReplacementChar(), EncodingSource, findToUnicodeMap(), fontDescriptorOf(), FontKind, hexStringToCode(), hexStringToCodePoint() (+18 more)

### Community 268 - "ContactForm.tsx"
Cohesion: 0.29
Nodes (7): autoGrow(), ContactForm(), emptyForm, FormState, Toast, TYPE_OPTIONS, FeedbackQueryType

### Community 269 - "PHASE 3 — COMPONENT INVENTORY"
Cohesion: 0.08
Nodes (24): Accordion (disclosure), Button **[carry forward, mostly]**, Card, Checkbox / Switch, Command Palette (genuinely new pattern for Lumeo), Dialog (modal), Dropdown / Select, Empty / Error / Success states **[carry forward]** (+16 more)

### Community 270 - "config.ts"
Cohesion: 0.15
Nodes (15): HeaderFooterPreview(), ZoneOverlay(), PageRangeSelector, PlacementCorner, alignmentToCorner(), createDefaultHeaderFooterConfig(), createDefaultZone(), HeaderFooterConfig (+7 more)

### Community 271 - "verify-supabase-env.mjs"
Cohesion: 0.29
Nodes (4): ENV_PATH, parseEnvValue(), parseLocalEnv(), REQUIRED_KEYS

### Community 283 - "Backup & Restore Point Certification — v1.0.0-production-stable"
Cohesion: 0.09
Nodes (22): Backup & Restore Point Certification — v1.0.0-production-stable, Final status, Known risks / technical debt (unchanged by this pass, reported only), Repository status, Restore readiness, Step 10 — Security baseline, Step 11 — Analytics, Step 12 — Admin (live route check) (+14 more)

### Community 287 - "Security Policy"
Cohesion: 0.29
Nodes (6): Our approach to security, Reporting a vulnerability, Responsible disclosure, Scope, Security Policy, Supported versions

### Community 305 - "Lumeo Atelier Final Polish"
Cohesion: 0.33
Nodes (6): Compact Dropdowns And Privacy Notes, Hierarchy And Spacing, Interaction Restraint, Lumeo Atelier Final Polish, Planned Tool Pages, Preservation Rules

### Community 306 - "Lumeo roadmap"
Cohesion: 0.33
Nodes (5): AI roadmap for later, Available now / build first, Current development: Non-AI studio features, Lumeo roadmap, Next non-AI features requiring stronger render engine

### Community 341 - "ExtractTextTool.tsx"
Cohesion: 0.19
Nodes (15): ExportFormat, ExtractTextTool(), FORMAT_EXTENSION, FORMAT_MIME, buildCsvFromEntries(), buildJsonFromEntries(), buildTxtFromEntries(), csvEscape() (+7 more)

### Community 342 - "Word to PDF converter service"
Cohesion: 0.33
Nodes (5): Deploy (Render, free tier), Keep it warm (optional but recommended), Notes, Wire it into the main app, Word to PDF converter service

### Community 345 - "config.ts"
Cohesion: 0.16
Nodes (14): describePosition(), PageNumberPreview(), createDefaultPageNumbersConfig(), formatNumeral(), formatPageLabel(), NumberFormat, NumeralStyle, PageNumbersConfig (+6 more)

### Community 346 - "export.ts"
Cohesion: 0.40
Nodes (12): resolvePageIndices(), composeRotationDegrees(), manualNativeAnchor(), normalizePageRotation(), toNativePoint(), visualPageSize(), embedTextFonts(), hexToRgb01() (+4 more)

### Community 347 - "Aura OS v2 — Foundation Plan"
Cohesion: 0.11
Nodes (17): 10. Design token proposal (starting point, not final — resolve during V2-1), 1. Phase 2 — Architectural analysis (grounded in code read this session), 2. Phase 3 — Design research (general knowledge synthesis, not live-verified), 3. Current UI weaknesses (evidence-backed, from this session's audits + this analysis), 4. Current UI strengths (keep, don't rewrite), 5. Version 2 design philosophy, 6. Complete implementation roadmap (Phase 5-7 output), 7. Risk assessment (+9 more)

### Community 350 - "Page Numbers — Engineering Specification (pre-development, for review)"
Cohesion: 0.11
Nodes (17): 10. Performance targets, 11. Edge cases, 12. Implementation roadmap, 1. Problem statement, 2.1 Recommendation: separate module, shared math, not a shared config type, 2. Relationship to Watermark PDF, 3.1 Flow, 3.2 New alignment needs beyond Watermark's 5 corners (+9 more)

### Community 351 - "Watermark PDF v1.1 — Manual Position Mode"
Cohesion: 0.11
Nodes (17): 10. Multi-page behavior (req. 13) — OPEN QUESTION, needs your call before build, 11. Component/UI plan, 12. Regression surface (req. 17), 13. Test plan (maps directly to req. 18's list), 14. Accessibility (req. 12), 15. Implementation roadmap, 1. What already exists (don't rebuild this), 2. Coordinate system decision (req. 4) — percent, not raw points (+9 more)

### Community 353 - "Lumeo Production Release Certification"
Cohesion: 0.12
Nodes (16): How to certify a release, Known limitations (not synthesizable here), Lumeo Production Release Certification, Part 10 — Performance baseline (measured, not optimized), Part 11 — Release checklist, Part 12 — Documentation, troubleshooting, future contributors, Part 1 — Test assets, Part 2 — Tool regression matrix (+8 more)

### Community 355 - "Crop PDF — Engineering Specification (pre-development, for review)"
Cohesion: 0.12
Nodes (16): 10. Implementation roadmap, 1. Problem statement, 2.1 Flow, 2.2 What's explicitly NOT in v1 scope (mirrors Watermark's documented, 2. UX, 3.1 Data model (draft, for review — not final until implementation), 3.2 Reusable utilities identified (already exist, use as-is), 3.3 Reusable PDF transformation pipeline (+8 more)

### Community 357 - "PHASE 4 — WORKSPACE EXPERIENCE"
Cohesion: 0.12
Nodes (16): Canvas, Context menus, Drag interactions, Drop zones, File handling, Inspector, Keyboard shortcuts, Layout (+8 more)

### Community 358 - "Edit PDF Workspace Redesign + Privacy Shield Implementation Plan"
Cohesion: 0.12
Nodes (15): Edit PDF Workspace Redesign + Privacy Shield Implementation Plan, Global Constraints, Phase 1: Workspace Shell & MicroDock, Phase 2: FloatingIsland, Phase 3: Privacy Shield, Phase 4: Final QA & Regression Verification, Plan self-review notes, Sequencing note (+7 more)

### Community 359 - "parseDocumentXml.ts"
Cohesion: 0.25
Nodes (12): decodeXmlEntities(), DocxDocument, DocxParagraph, DocxRun, findElements(), hasSelfClosingOrEmptyElement(), parseDocumentXml(), parseParagraph() (+4 more)

### Community 393 - "fontMetrics.ts"
Cohesion: 0.10
Nodes (29): TextShowOperator, ResolvedFont, asNumber(), compareAdvance(), compareAdvanceAcrossFonts(), FontMetrics, FontMetricsSource, glyphAdvancePt() (+21 more)

### Community 394 - "package.json"
Cohesion: 0.25
Nodes (7): name, overrides, postcss, sharp, uuid, private, version

### Community 395 - "Final Engineering Excellence Audit"
Cohesion: 0.13
Nodes (15): 13. Production audit, 1. Repository structure, 2. Code quality, 3. Dependency audit, 4. Bundle audit, 5. Memory leak audit, 6. React audit, 7. PDF engine audit — browser-only privacy (+7 more)

### Community 415 - "High-Zoom Re-Rendering — Design Spec"
Cohesion: 0.13
Nodes (14): 1. Current behaviour, measured, 2. Why this isn't a one-line change, 3. Goals / non-goals, 4. Architecture: split the effect, 4a. Effect A — page identity reset, 4b. Effect B — rasterize, 4c. Effect C — detect text, 5. The invariant that makes this tractable (+6 more)

### Community 416 - "AURA_OS_V2_DESIGN_SPEC.md"
Cohesion: 0.14
Nodes (13): Aura OS v2 — Complete Visual Design Specification, Breakpoints (proposed, consistent with Lumeo's existing fluid-type, How to read this document, Input method adaptation, Per-breakpoint behavior, PHASE 5 — MOTION SYSTEM, PHASE 6 — RESPONSIVE SYSTEM, PHASE 7 — DESIGN CONSISTENCY RULES (+5 more)

### Community 420 - "Production Certification"
Cohesion: 0.14
Nodes (14): Accessibility, Admin, Analytics, Deployment, Final certification verdict, Functional — PDF tools, Future recommendations, Honesty notice (read this first) (+6 more)

### Community 439 - "watermark-manual-rotation.test.ts"
Cohesion: 0.20
Nodes (7): Anchor, anchorFractions(), anchorPointFromTopLeft(), nativeAnchorForCenter(), topLeftFromAnchorPoint(), WatermarkAnchor, ALL_ANCHORS

### Community 442 - "Edit PDF Workspace Redesign + Privacy Shield — Design Spec"
Cohesion: 0.15
Nodes (12): Architecture, Components, Edit PDF Workspace Redesign + Privacy Shield — Design Spec, `FloatingIsland.tsx`, Goal, Layout shell, `MicroDock.tsx`, Mobile adaptation (+4 more)

### Community 443 - "pdfFixtures.ts"
Cohesion: 0.07
Nodes (44): clamp(), CropRectView(), describeRect(), Handle, resizeFromHandle(), applyAspectPreset(), centerCropRect(), clampCropRect() (+36 more)

### Community 445 - "sign-history.test.ts"
Cohesion: 0.29
Nodes (6): react, react, dom, globals, renderHistory(), Snapshot

### Community 446 - "Design: Page Organizer, HTML to PDF, Text Extractor"
Cohesion: 0.17
Nodes (11): 1. Page Organizer / Rotator (`/pdf/organize`), 2. HTML to PDF (`/pdf/html-to-pdf`), 3. Text Extractor & Viewer (`/pdf/extract-text`), Architecture, Catalog & navigation wiring, Context, Dependencies, Design: Page Organizer, HTML to PDF, Text Extractor (+3 more)

### Community 447 - "Edit PDF tool — design"
Cohesion: 0.17
Nodes (11): Architecture, Context, Data model & undo/redo, Edit PDF tool — design, Element interaction model, Export & error handling, Out-of-scope follow-ups (explicitly deferred, not forgotten), Prior art this design builds on (+3 more)

### Community 450 - "Product Excellence & Commercial Readiness Audit (Phases 23-30)"
Cohesion: 0.18
Nodes (10): Addendum — second pass (same mission re-run), Checked, confirmed consistent — no action needed, Honesty notice, Ideas (not implemented, not verified as beneficial — genuinely speculative), Implemented this session, Product Excellence & Commercial Readiness Audit (Phases 23-30), Real gap, documented, not fixed (needs product/design judgment, not a mechanical change), Scores (+2 more)

### Community 451 - "PDF Organizer, HTML to PDF, Text Extractor Implementation Plan"
Cohesion: 0.18
Nodes (10): Global Constraints, PDF Organizer, HTML to PDF, Text Extractor Implementation Plan, Task 1: Wire catalog routes and tool registry, Task 2: Page Organizer pure logic, Task 3: Page Organizer tool component and route, Task 4: HTML to PDF pure option-building logic, Task 5: HTML to PDF tool component and route, Task 6: Text extraction pure logic (+2 more)

### Community 452 - "Global Constraints"
Cohesion: 0.18
Nodes (10): Edit PDF Tool Implementation Plan, Global Constraints, Self-review notes, Task 1: Element data model & pure array operations, Task 2: PDF export/flatten logic, Task 3: Ink capture component, Task 4: Placed-element view (select/move/resize/line-endpoints), Task 5: Main Edit PDF tool component (+2 more)

### Community 454 - "PHASE 1 — DESIGN LANGUAGE"
Cohesion: 0.20
Nodes (10): Accessibility philosophy, Emotional feeling, by moment, Information density, Interaction philosophy, Motion philosophy, Personality, PHASE 1 — DESIGN LANGUAGE, Simplicity rules (+2 more)

### Community 455 - "PHASE 2 — DESIGN TOKENS (design only, not implemented)"
Cohesion: 0.20
Nodes (10): Animation durations (extends existing tokens, doesn't replace), Animation easing, Border radius scale, Hover / focus / loading timings, Icon sizes, PHASE 2 — DESIGN TOKENS (design only, not implemented), Shadow scale, Spacing scale (+2 more)

### Community 456 - "Workspace Shell — Phase 1 design (pilot: Merge PDF)"
Cohesion: 0.20
Nodes (9): Catalog & admin wiring changes, Context, Explicitly deferred (not forgotten, not designed here), File lifecycle & error handling, Goal, Routing, Shell layout composition, State architecture (+1 more)

### Community 457 - "Context-Aware Multi-Line Text Reflow — Design Spec"
Cohesion: 0.20
Nodes (9): 1. What multi-line editing does today, 2. Why this is the hardest item in the backlog, 3. The blocking constraint: the engine cannot insert, 4. Proposed scope, 5. Why not just use Restyle, 6. Building blocks that already exist, 7. Test plan, 8. Open questions (+1 more)

### Community 459 - "Aura OS v2 — Workspace Standard"
Cohesion: 0.22
Nodes (8): Accessibility rules, Aura OS v2 — Workspace Standard, Component hierarchy, Layout rules, Responsive rules, Spacing rules, When NOT to reuse, When to reuse

### Community 460 - "edit-apply-plan-tj.test.ts"
Cohesion: 0.39
Nodes (6): buildPlanForOperatorIndex(), buildTjFixture(), decodedContentStreamBytes(), firstFontDict(), hexOf(), tjOperators()

### Community 461 - "Color palette"
Cohesion: 0.29
Nodes (7): Accent color, Color palette, Glass colors (genuinely new — confirmed absent from current tokens), Neutral scale (foundation for both themes), Opacity scale, Semantic status colors, Surface, border, elevation colors

### Community 462 - "Performance Certification"
Cohesion: 0.29
Nodes (7): Bundle size, Not verified — requires follow-up, Page load (headless Chromium, uncapped network, single sample), PDF processing scale benchmark (pdf-lib, Node, this machine), Performance Certification, Recommendation, Scope and honesty notice

### Community 463 - "Final Platform Hardening Audit"
Cohesion: 0.29
Nodes (7): Final Platform Hardening Audit, Fixed this session (own PR each), Honesty notice, Investigated, no change made (evidence + reasoning), Not investigated this session (explicit gaps), Recommendation — what's next, Scored certification

### Community 464 - "Design: Automatic A-Z Tool Sorting + Home Screen Polish"
Cohesion: 0.29
Nodes (6): Context, Design: Automatic A-Z Tool Sorting + Home Screen Polish, Implementation, Out of scope, Scope, Testing

### Community 465 - "Design: PDF Text Extract — rename + feature expansion"
Cohesion: 0.29
Nodes (6): Context, Design: PDF Text Extract — rename + feature expansion, Implementation, Out of scope, Scope, Testing

### Community 466 - "restyleRun.ts"
Cohesion: 0.43
Nodes (4): clampPct(), DetectedRunGeometry, planRunRestyle(), RestylePlan

### Community 467 - "theme.ts"
Cohesion: 0.38
Nodes (4): applyTheme(), AuraTheme, resolveSystemTheme(), resolveTheme()

### Community 468 - "edit-apply-plan-quote.test.ts"
Cohesion: 0.43
Nodes (5): buildPlanForOperatorIndex(), buildQuoteFixture(), decodedContentStreamBytes(), firstFontDict(), hexOf()

### Community 469 - "Analytics Certification"
Cohesion: 0.29
Nodes (6): Analytics Certification, History, Queries used, Result, What's still not covered, What this confirms

### Community 470 - "Security Certification"
Cohesion: 0.33
Nodes (6): Fixed this session, Not verified — requires follow-up, Recommendation, Reviewed, no code change made, Scope and honesty notice, Security Certification

### Community 471 - "SEO Certification"
Cohesion: 0.33
Nodes (6): Fixed this session, Not verified — requires follow-up, Recommendation, Scope and honesty notice, SEO Certification, Verified, already correct

### Community 472 - "compression-document-structure.test.ts"
Cohesion: 0.53
Nodes (4): copyAcroForm(), copyDocumentLikeCompressDoes(), copyOutline(), copyOutlineItem()

### Community 473 - "Watermark PDF — v1.0.0 freeze"
Cohesion: 0.40
Nodes (4): Known, accepted limitations (not bugs, do not "fix" without a v1.1 request), Watermark PDF — v1.0.0 freeze, What shipped in v1.0.0, Where the architecture lives (for the next engineer)

## Knowledge Gaps
- **1216 isolated node(s):** `cmd`, `npm_config_update_notifier`, `CLAUDE_FLOW_MODE`, `CLAUDE_FLOW_HOOKS_ENABLED`, `CLAUDE_FLOW_TOPOLOGY` (+1211 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `page.tsx` to `data.ts`, `page.tsx`, `createClient`, `requireAdmin`, `page.tsx`, `pdfToWordStorage.ts`, `page.tsx`, `ControlCenterMobileNav.tsx`, `page.tsx`, `page.tsx`, `withSeoOverride`, `page.tsx`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `parseDocumentXml`, `package.json`, `dompurify`, `sign-history.test.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `createExportSurface()` connect `dompurify` to `shouldAttemptOnce`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `cmd`, `npm_config_update_notifier`, `CLAUDE_FLOW_MODE` to the rest of the system?**
  _1216 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `EditPdfTool.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05641025641025641 - nodes in this community are weakly interconnected._
- **Should `data.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08081632653061224 - nodes in this community are weakly interconnected._
- **Should `page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11282051282051282 - nodes in this community are weakly interconnected._