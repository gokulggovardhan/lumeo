# LUMEO Phase 12 — Flows Foundation Release Evidence

**State: PENDING — POST-MERGE CERTIFICATION NOT YET COMPLETE**  
**Evidence date:** 2026-10-25  
**Production:** https://lumeo.in  
**Repository:** gokulggovardhan/lumeo  
**Phase 12 tracker:** [#662](https://github.com/gokulggovardhan/lumeo/issues/662)  
**Implementation PR:** [#663](https://github.com/gokulggovardhan/lumeo/pull/663), squash-merged  
**Original Phase 12 source:** `8e09fbe433bbdb595083a3fef435389095605961`  
**Corrective deployed main (NOT YET CERTIFIED):** `00601389191ef53bc032be9b88f323b208eb45ba`  
**Baseline preserved:** Phase 11 `18fb5626705744bf4406c1217ca2a427282d9c05`

## Approved scope

The authorized PDF Workspace roadmap issue #399 identifies Stage 8 as Flows foundation. Under current Phase 12 allocation #662, this release establishes a strict *non-executing* portable template domain boundary. It does **not** expose a public Flows UI or automatically execute PDF modifications.

Files: `lib/pdf/workspace/flows.ts`, `tests/workspace-flows.test.ts`, `docs/PHASE_12_FLOWS_FOUNDATION.md`.

Security/privacy design: capture applied journal entries only; explicitly allowlist quality-profile full-document Compress operations; exclude document bytes, filenames, source/page/session IDs, descriptions, private metadata, signatures, document-specific targets and unrecognized operation parameters; validate imported Flow JSON with v1 schema, 20-step cap and 16 KiB limit; no cloud persistence or network calls.

## Pre-merge checks

All four PR #663 GitHub Actions workflows **SUCCESS** on head `8a76371a271faae99a8786d6efc877a7e81b1aff`: Lumeo CI including final required PDF Workspace validation, Accessibility Automation, Mobile Lighthouse and Route JavaScript Budget. Core unit/build suite passed **1,348/1,348 tests**, including six new focused Flows tests. Admin Chromium/WebKit, 3-browser conversion, Edit PDF 120/320-page performance, Workspace mobile and Edit browser checks passed. The PR-only migration job was correctly **SKIPPED**.

## Cloudflare production provenance

Existing Cloudflare Workers Builds source trigger automatically ran once for merged `main` commit `8e09fbe...`, with **SUCCESS** build `8dce1020-de36-4b80-87f1-7340311b9212`. Production deployment `7bd455cb-9429-42c9-8e13-5520eecca5cd`, Worker `lumeo-app`, version `46612ca8-e231-498d-8a4d-f57f629a7e86`, 100% traffic on successful deploy. No duplicate/manual production deploy.

**Post-merge Production Health [40181406157](https://github.com/gokulggovardhan/lumeo/actions/runs/40181406157): SUCCESS**; `/api/build-info` exact source SHA and environment production, public routes/404 recovery, Admin signed-out boundary, cache/security controls and 27 SEO sitemap routes passed.

**Post-merge Route JavaScript Budget [40181406162](https://github.com/gokulggovardhan/lumeo/actions/runs/40181406162): SUCCESS**.

## Post-merge failure and corrective engineering evidence (2026-10-25)

The original Phase 12 production certification [40181406093](https://github.com/gokulggovardhan/lumeo/actions/runs/40181406093) **FAILED**, not completed successfully: 29 passed, 2 failed, 13 project-scoped skips in approximately 24 minutes. Failure evidence [artifact 12594189826](https://github.com/gokulggovardhan/lumeo/actions/runs/40181406093/artifacts/12594189826):

- Chromium professional Word-to-PDF source triggered native Zeta/LibreOffice WASM runtime traps `operation does not support unaligned accesses` and `unreachable`. The UI displayed conversion failure; the pre-fix test waited 420 seconds for success instead of surfacing the error.
- Mobile WebKit HTML-to-PDF did not emit a download event despite a returned idle "Generate PDF" button and no application error. Source revoked the generated Blob URL synchronously immediately after `link.click()`, a browser download-handoff race. The test waited its full 480-second limit.

Phase 12 corrective [PR #664](https://github.com/gokulggovardhan/lumeo/pull/664) was **MERGED** at exact source `00601389191ef53bc032be9b88f323b208eb45ba` after passing all candidate-head PR gates. The source is live via Cloudflare build `03c8f4d0-b3d4-4fe2-b18e-8e18047dc435`, production deployment `d2e7fec1-55ea-490d-9f9b-b57c75ac0cfe`, Worker version `c3d78f0a-f4a2-4072-8ccf-711ad7791f3d`, 100% traffic. Its changes defer PDF Blob URL release, detect fatal Office runtime traps and reject them safely without unsafe worker termination, make failure diagnostics prompt and actionable, add regression tests, and correct the workflow to certify the exact deployed `main` SHA only after deployment. A third-party native Office WASM trap is *not* automatically fixed by app-level fail-fast handling; it must be addressed or proven acceptably stable by subsequent mandatory release tests.

**Verified corrective post-merge at `006013...`:**
- [Lumeo CI 40187010011](https://github.com/gokulggovardhan/lumeo/actions/runs/40187010011): SUCCESS including full Workspace and Supabase.
- [PDF Workspace Production Certification 40187009998](https://github.com/gokulggovardhan/lumeo/actions/runs/40187009998): SUCCESS: 15 recovery + 31 conversion tests (roughly 6m36s vs failing original ~24m).
- [Production Conversion Smoke 40187009954](https://github.com/gokulggovardhan/lumeo/actions/runs/40187009954): SUCCESS.
- [Production Health 40187010018](https://github.com/gokulggovardhan/lumeo/actions/runs/40187010018): SUCCESS, exact `/api/build-info` SHA/environment.
- [Cloudflare Production Audit 40187009967](https://github.com/gokulggovardhan/lumeo/actions/runs/40187009967): SUCCESS.
- [Route JavaScript Budget 40187009973](https://github.com/gokulggovardhan/lumeo/actions/runs/40187009973): SUCCESS.

**Outstanding performance blocker:** [Mobile Lighthouse 40187009942](https://github.com/gokulggovardhan/lumeo/actions/runs/40187009942) **FAILED**, real `/pdf/edit` median LCP **4131ms > 4000ms**. Lighthouse artifact 12597426274 confirmed static privacy-note span painted too late after deferred editor client hydration.

**Corrective PR [#665](https://github.com/gokulggovardhan/lumeo/pull/665): IN PROGRESS**, candidate `ba0394881b8c337b2c1bf4d712ec9cc00aed3f9f`. It server-renders the identical privacy note, eliminates delayed client duplicate, updates stale legacy unit contract, and isolates a deliberate raw Admin server-action security probe from subsequent WebKit button lifecycle; retains all guard/confirmation tests. Earlier candidate-head Lighthouse [40188337484](https://github.com/gokulggovardhan/lumeo/actions/runs/40188337484) **SUCCESS** (PR-local `/pdf/edit` median 3095ms) but Lumeo CI [40188337550](https://github.com/gokulggovardhan/lumeo/actions/runs/40188337550) **FAILED** on legacy unit-test expectation and WebKit Admin fixture ordering; these have been corrected on the newer PR head. **Latest required CI checks are in progress**. No production LCP improvement is claimed yet.

**Never certify Phase 12 or begin Phase 13 until PR #665 passes, is merged through branch protection, and exact-production post-merge 4000ms Lighthouse gate plus all other required checks pass.**

## Current certification gates (updated)

- Verify all PR #665 required checks pass on the exact final branch head.
- Merge only through the permitted protected branch procedure.
- Verify the exact merged main SHA, Cloudflare build/deployment/version and live build-info provenance.
- Verify exact-production Mobile Lighthouse 3-sample median LCP <= 4000ms at /pdf/edit; do not alter the budget or skip routes.
- Verify full Lumeo CI (including Supabase), production conversion certification, health, audit, security, and browser gates on that exact released SHA.
- Retain known limitation: Flows execution, public UI, template persistence and automatic PDF mutation are NOT part of Phase 12.

**Certification:** Not yet issued. **Technical process lock:** Not yet issued. **Phase 13:** Not authorized until Phase 12 fully certified.

This evidence record lives in a dedicated certification branch to avoid an unnecessary documentation-only production redeployment. Its commit is administrative and is not the deployed application baseline.
