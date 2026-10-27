# LUMEO Phase 14 — Production Certification and Process Lock

**Certification date:** 2026-10-28 (Asia/Kolkata)  
**Program:** Phase 14 / PDF Workspace Stage 10, approved under issue #399  
**Tracker:** https://github.com/gokulggovardhan/lumeo/issues/672  
**Protected PR:** https://github.com/gokulggovardhan/lumeo/pull/673 (merged)  
**Production:** https://lumeo.in  
**Cloudflare Worker:** lumeo-app, Cloudflare Free, no additional expenditure  
**CERTIFIED IMMUTABLE APPLICATION SHA:** 18f78691fb93be3f659a51e810bfdfd02aa44332

## Scope and certified behavior

Phase 14 fixes HTML-to-PDF stale generated downloads and stale PDF Workspace continuation after source, file-name, and page-layout edits. The client invalidates obsolete output and uses a revision guard to prevent an in-flight older generation from publishing after an edit. The release preserves PDF conversion, Workspace, security, accessibility, performance and existing Phase 13 behavior.

The Phase 14 application was merged through protected PR #673 from candidate 5f8ed7b07e20197ddb5ca87b4c3111cc079ec6c9. The protected squash merge created application SHA 18f78691fb93be3f659a51e810bfdfd02aa44332. This SHA, not the candidate or a certification-document commit, is the certified application baseline.

## Protected development gates

- PR #673: all required exact-head checks green before merge, no unresolved review threads.
- Candidate Lumeo CI run https://github.com/gokulggovardhan/lumeo/actions/runs/40562527237: all required jobs SUCCESS after Chromium conversion-corpus targeted retry job 122432064964.
- Standalone Browser Conversion run 40562526840 SUCCESS; Accessibility 40562526948 SUCCESS; Mobile Lighthouse 40562526671 SUCCESS; Route JavaScript Budget 40562526619 SUCCESS; CodeQL previously verified.
- **Post-merge main CI** https://github.com/gokulggovardhan/lumeo/actions/runs/40587270509 **attempt 2 SUCCESS**, exact application SHA 18f78691fb93be3f659a51e810bfdfd02aa44332, all eight jobs SUCCESS. The first attempt's local Cloudflare Worker iPhone WebKit maintenance-mode assertion failed (8/9), and the unmodified targeted retry job 122507034133 PASSED. No assertion was suppressed or test budget weakened.

## Automatic Cloudflare production deployment

- Cloudflare Workers Build: dc625190-8c99-4649-89bd-01c0e79f8889 — SUCCESS for exact protected-main application SHA.
- Deployment: 88a78382-fd5d-4128-a45d-4afad2cc4dfe.
- Worker version: 0732471c-b3de-4be2-ae72-dec71abda06c.
- Traffic: **100%** of lumeo-app, independently rechecked through Cloudflare API after production tests.
- Production build-info exact SHA and environment were asserted by post-merge GitHub Actions tests. No duplicate manual Worker deployment was performed.

## Real post-merge production acceptance

1. **PDF Workspace Production Certification**: https://github.com/gokulggovardhan/lumeo/actions/runs/40587270120 — SUCCESS against actual https://lumeo.in and the exact deployed main SHA. 15 Phase 11 recovery/freshness browser cases passed; 31 live conversion cases passed, 13 capability-specific cases skipped as defined by existing browser feature support. Artifact 12773140821, workspace-production-certification-report, SHA256 acbf9d6e2194db5258aecb09097cc94d9ebdfab0ea0d62ac35a53554cf140776. Live desktop and iPhone WebKit HTML-to-PDF conversion produced real downloadable PDFs, checked byte length and page counts, repeated after source changes; Workspace continuation and Edit/Finish fidelity also passed. Non-Chromium Word-to-PDF limitations remain capability-honest, not falsely reported as successful conversions.
2. **Additional independent live WebKit stale-output acceptance**: https://github.com/gokulggovardhan/lumeo/actions/runs/40594862928 — SUCCESS, isolated QA branch qa/phase14-live-freshness-20261028, QA commit abc4e1c2a09ec0ff482e072083c58e399d4b13b2. The test first asserted live /api/build-info commit 18f78691fb93be3f659a51e810bfdfd02aa44332 and environment production, then used synthetic HTML in real desktop Safari/WebKit and iPhone 15 Pro WebKit. Both browsers downloaded a first **4-page** PDF (624442 and 624443 bytes respectively) and a distinct second **1-page** PDF (42087 bytes each). After editing HTML and after changing page size, both old Download generated PDF and Continue with this PDF Workspace handoff were verified hidden. New PDF SHA256 differed from old. Artifact 12774614632, phase14-live-webkit-freshness-evidence, SHA256 e648fbb3c6bb6ada69ccd9594b3eae2cbc842cfa4768ebe9a0bc6e80daeec2a8. This branch is QA-only, not merged or deployed, and makes no production database writes.
3. **Production Conversion Smoke** https://github.com/gokulggovardhan/lumeo/actions/runs/40587270177 — SUCCESS.
4. **Production Health** https://github.com/gokulggovardhan/lumeo/actions/runs/40587270098 — SUCCESS.
5. **Mobile Lighthouse** https://github.com/gokulggovardhan/lumeo/actions/runs/40587270243 — SUCCESS, four production routes with three isolated Lighthouse 13.5.0 samples each. Largest Contentful Paint (ms): / 3468.642, /pdf 3747.324, /pdf-tools 3738.274, /pdf/edit 3873.103; **all below the unchanged 4000 ms ceiling**. Performance scores 0.86, 0.86, 0.84, 0.84; accessibility scores 1.00, 0.99, 1.00, 0.99. Artifact 12771938846.
6. **Route JavaScript Budget** https://github.com/gokulggovardhan/lumeo/actions/runs/40587270204 — SUCCESS for exact production SHA, four live routes; artifact 12771053765.
7. **Fresh Cloudflare Production Audit** https://github.com/gokulggovardhan/lumeo/actions/runs/40459835277 — attempt 3 SUCCESS, audit job 122507211074 SUCCESS, PDF.js/HEIC browser smoke job 122507213566 SUCCESS, Next/vinext comparison job 122507260480 SUCCESS. The existing audit workflow was re-executed after the Phase 14 deployment and checks live Cloudflare routing, security headers, canonical metadata, admin redirects/no-store, public routes and JavaScript MIME. Its historical workflow checkout SHA is older than the certified app SHA; the audited target is the current live production, whose exact deployed SHA was independently verified in the production certification and Cloudflare API.

## Safety, exceptions, and lock conditions

- No known required release gate remains failed. The first post-merge admin test failure was addressed by a successful **unmodified** targeted rerun; no bypass or weakening.
- Existing capability-specific skips are disclosed above; they are not claimed as passing tests.
- QA used synthetic, public-facing browser data only. No private documents, production database edits, paid plans, manual redeployment, or unrelated projects were part of this certification.
- Phase 13 immutable certified SHA 3ffaad43d84baae0e574d2469778c3554b7b5b9b, its evidence, locked certificate issue #671 and locked tracker #667 are untouched.
- This certificate lives on a **documentation-only branch** certification/phase14-20261028. Its documentation commit is not a new production application SHA and must not trigger a Worker deployment.
- **PROCESS LOCK:** freeze application SHA 18f78691fb93be3f659a51e810bfdfd02aa44332 as the Phase 14 certified baseline. Any future application change requires a new approved scope, protected PR, full exact-head gates, automatic deployment and new production certification. Do not silently revise this certificate or invent Phase 15.

**Final status:** PHASE 14 VERIFIED, PRODUCTION CERTIFIED, AND ELIGIBLE FOR ISSUE CLOSE + LOCK.
