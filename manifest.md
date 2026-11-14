# Lumeo — Consolidated Development, Security & Production Manifest

**Version:** 1.0  
**Effective:** 10 November 2026  
**Project:** Lumeo PDF Workspace  
**Repository:** gokulggovardhan/lumeo  
**Production:** https://lumeo.in  
**Protected branch:** main  
**Cloudflare Worker:** lumeo-app  
**Incremental spending ceiling:** ₹0 without separate explicit owner authorisation

> **Purpose:** This is the single permanent, owner-authorised engineering operating policy for Lumeo. It consolidates the former root CLAUDE.md and .github/LUMEO_DEVELOPMENT_CONTINUITY.md instructions and Lumeo-specific operating expectations. It is **not** a claim that any task, phase, test, pull request or deployment has been completed. Read actual repository, CI and production evidence each time.

**Instruction precedence and scope.** Applicable platform and security requirements, GitHub branch protections, provider access controls and explicit current owner requests prevail over this document. This manifest governs permanent development behaviour; current source code, package.json, lib/tools/catalog.ts and scoped technical specifications remain authoritative for their actual implementations. README.md is product/architecture documentation, **not** a competing standing-instructions file. A newer verified code/deployment state always outweighs historical notes or chat recollections. Do not manufacture permissions, bypass provider safeguards or claim unavailable tools were used.

## 1. Permanent project-owner development authorisation

- The owner authorises ordinary implementation, maintenance, UI/UX, accessibility, performance, refactoring, bug fixes, integration, safe regression correction, authorised merges and production releases **within Lumeo** using existing connections and infrastructure.
- Carry an approved objective through its available engineering lifecycle without requesting repetitive routine confirmations.
- This authorisation does not waive mandatory security, deployment, branch-protection, access or financial controls. Obtain new owner direction for material scope expansions, new paid infrastructure, new remote handling of private documents or changes expressly locked below.

## 2. No repetitive owner approvals

- Do not repeatedly request the same repository URL, Worker name, site URL, framework, budget, policy preferences or previously documented development decisions.
- Make reversible routine engineering choices independently. Ask only when essential access, owner-only consent, conflicting non-recoverable requirements or unavoidable material risks genuinely require it.
- Distinguish an owner acceptance check from a required automated/security/release check: the former can be performed after delivery; the latter must not be falsely waived.

## 3. End-to-end autonomous execution

- For approved work: inspect current state → isolate root cause → implement focused changes → run available tests → correct failures → create/update PR → satisfy required checks → merge through authorised protections → confirm Cloudflare deployment → perform safe production verification → summarise evidence.
- Retry transient failures only when bounded and safe. Do not repeatedly rerun a deterministic failure without investigating its cause.
- If a tool, credential, reviewer or protected action is unavailable, finish every safely available part and report the precise blocker; do not state that blocked work was completed.

## 4. Development continuity across chats

- On "DEV CONTINUE", "continue Lumeo", "resume", "fix remaining issues", or equivalent, re-establish state from current protected main, branches, PRs, Actions/checks, production build/deployment information, relevant Supabase state and scoped documentation before asking the owner to repeat context.
- Source-of-truth order: current GitHub main/source → relevant feature branch → PRs and current checks → Cloudflare deployed source → authorised Supabase state → current scoped specs/issue handoff → historical notes → prior chat.
- The historical continuity issue #365 may be stale or closed. Never assume it is the active handoff; discover any current handoff from live evidence. Save significant checkpoints in relevant PRs/issues rather than duplicating stale status in this manifest.
- Do not claim background supervision, automatic future follow-up or scheduled execution unless an actually configured, available system performs it. Preserve work in commits/branches/PRs, not only an ephemeral chat.

## 5. Independent engineering decisions

- Prefer smallest safe fix and existing proven components. Avoid unnecessary rewrites, packages, duplicated services and unreviewed global changes.
- Diagnose the first substantive error and pursue its root cause, not cosmetic symptom suppression or artificial green checks.
- Clearly separate unrelated issues into their own branches/PRs. Use multiple workstreams where independent, but respect ordered dependencies and production safety.

## 6. Owner's final acceptance and verification

- Complete implementation plus available meaningful automated, CI, security and production checks before presenting the outcome for the owner's final visual or functional acceptance.
- Do not force the owner to run routine commands, install software, provide device screenshots or perform manual checks when authorised tools can verify the behaviour.
- If real-device checks, credentials or authenticated production tests are unavailable, name the evidence gap honestly. Owner acceptance does not retroactively certify checks that never ran.

## 7. Permanent project identity and deployment targets

- Source: private GitHub repository gokulggovardhan/lumeo; protected authoritative branch main.
- Public production: https://lumeo.in; existing Cloudflare Worker: lumeo-app; maintain current custom domain, routes, secrets, environment bindings and deployment account.
- Use the existing **Cloudflare Workers Builds → vinext** application release path. Do not substitute CloudRoster's Worker, build pipeline or version endpoint, or deploy a feature branch over production.

## 8. ₹0 additional expenditure and quota discipline

- No new paid plan, subscription, credit card, metered overage, external AI API, storage, database, runner purchase, infrastructure or domain without separate explicit owner authorisation.
- Monitor applicable Cloudflare Workers/Builds, GitHub Actions, Supabase, KV, asset-transfer and runtime quotas; a free tier has finite capacity.
- Prefer existing free capabilities, focused builds and reuse of known-good tooling. Never spend money, reduce security, disable required checks or assume quota headroom merely to unblock a task.

## 9. Existing architecture preservation

- Preserve the existing Next.js/React/TypeScript application, vinext/Cloudflare Workers deployment, Supabase Auth/PostgreSQL, pdf-lib, PDF.js, browser-side Web Workers, and local browser conversion engines.
- Preserve immutable same-origin Office runtime asset serving via /office-runtime/<release-id>/... and the established Worker fast path; do not silently replace it with remote document conversion.
- Honor current package.json scripts, pinned/locked dependencies, runtime compatibility, wrangler.jsonc and environment contracts. Inspect their current values rather than using stale versions.
- **Graphify, consolidated from CLAUDE.md:** when graphify-out/graph.json exists and tooling is available, use graphify query for focused architecture questions, graphify path for relationships and graphify explain for concepts; use graphify-out/GRAPH_REPORT.md for broad reviews or when focused results are insufficient. Refresh with graphify update . after relevant code changes where appropriate. Never hand-edit generated graphify-out files or commit graphify-out/graph.html. Install from requirements-graphify.txt and run scripts/graphify_env_check.py before regenerating. Preserve the pinned graphifyy[sql] toolchain, avoid [leiden]/[all] extras or graspologic, and use the supported Python environment (CI currently 3.14; 3.13+ recommended). Update the version pin and generated graph together only through the supported workflow.
- Next.js may generate agent-note material during development. That generated material must not become an independent conflicting owner policy; consult the installed Next.js version's current documentation when changing framework APIs.

## 10. Existing feature and data preservation

- Keep all already-shipped PDF tools, conversion flows, shared Workspace capabilities, public routes, Admin Console, analytics, exports, accessibility, SEO and existing integrations functioning.
- Keep original documents and transformed outputs safe from corruption or accidental disclosure; maintain backward compatibility where feasible.
- **Protected tools:** Merge PDF is normally locked except bug, security and compatibility fixes; explicitly owner-approved native Merge/Compress improvements are allowed within their stated scope. Split PDF remains protected after Premium v2 and must not be redesigned or altered without explicit approval.
- Do not interpret a new design directive as permission to erase proven processing engines, locked-tool behaviour or data.

## 11. Premium Lumeo design standards

- Preserve the **Midnight Notary** visual system: Notary Dark #0C1220, Parchment #F0EAD6, Aged Cream #E8DFC8, Deep Slate #1A2840, Seal Green #1E6B4A and restrained Gold Ink #C9A84C.
- Typography direction: DM Sans and DM Serif Display. Aim for calm, highly usable, document-first, premium experiences across desktop, tablet and mobile.
- Avoid generic PDF tool grids, neon effects, aggressive animations, noisy dashboards, misleading performance claims or unapproved design rebrands.

## 12. Tool catalog and source-of-truth consistency

- lib/tools/catalog.ts is authoritative for tool/action metadata, processing mode, route and live state; README listings can lag.
- New tools begin non-live, acquire a tested implementation, appropriate route, required Supabase pdf_tools seed/migration and matching public analytics route allowlists before being marked live.
- Do not advertise a tool as available merely because a page, component, feature flag or documentation entry exists; verify the live catalog and seeded DB state together.

## 13. Browser-local document privacy

- For existing browser-processed tools, document contents are processed locally and must not be uploaded to application backends, analytics endpoints, logs, URLs, third-party providers or persistent document storage.
- Never store document bytes or document contents in localStorage. Clear object URLs, transient buffers and temporary document states through appropriate reset/cleanup paths.
- Preserve explicit privacy boundaries for Word → PDF, PDF → Word, HTML → PDF and browser-side OCR. Any new backend processing, cloud document history, sync, accounts or remote conversion requires separate explicit approval and accurate disclosure.

## 14. PDF correctness, integrity and quality

- Verify actual exported documents rather than relying solely on a successful UI preview or status message. Check page order/count, selection/text fidelity, rotations/page boxes and supported annotations, forms, signatures or other protected structures as applicable.
- Refuse unsupported or unsafe transformations honestly; never silently strip protected document content or claim lossless quality where loss is possible.
- Keep original inputs logically immutable; validate outputs independently and preserve or explicitly disclose meaningful fidelity limits.

## 15. Native Merge and Compress PDF engineering

- Respect existing native browser engines, workers, limits and conservative fail-closed handling of unsupported documents.
- For Merge, preserve page provenance, order, geometry, rotation and supported text/objects; do not conflate a smaller merged output with proof of compression quality.
- For Compress, distinguish lossless reserialization, supported image recompression, target-size best effort, closest-safe, no-benefit and unsupported cases. Never guarantee a target or quality result without evidence.
- Use a representative corpus, benchmarks, memory/cancellation checks, security/fidelity validation and real browser operation tests for claimed improvements. Synthetic benchmarks alone do not certify real documents or mobile performance.

## 16. Shared Workspace session and history integrity

- Preserve the authoritative document session, stable page IDs, original-source provenance, deliberate per-operation scope and ordered Undo/Redo semantics.
- Continue-with-this-PDF must be explicit and opt-in, using verified local results; do not silently adopt stale output or introduce persistent document recovery/storage.
- Keep original bytes logically immutable, reject stale async writes, and retain correct export/download behaviour across tool transitions.

## 17. Conversion runtime and reliability

- Maintain browser-local image-to-PDF, PDF-to-image, text extraction and available Office/HTML conversion flows.
- Word → PDF uses the existing local WebAssembly runtime with versioned immutable assets; diagnose asset loading, compatibility, initialization, upstream availability and real export failures separately.
- Guard against blank/corrupt outputs and dropped selections; test real generated files and browser behaviour, not just backend route status.

## 18. Cross-device performance and accessibility

- Keep Lumeo responsive on iPhone Safari, Android browsers, desktop Chrome/Firefox/WebKit and tablets within realistically tested support.
- Prevent excessive client JavaScript, main-thread blocking, memory growth, unbounded workers, heavy animations and unnecessary Supabase/API requests.
- Preserve keyboard accessibility, visible focus, proper labels, responsive layouts, readable feedback and robust loading/error/retry states. Do not claim measured speedups without measurements.

## 19. Authentication, permissions and secrets

- Protect Admin routes with the existing requireAdmin() pattern and verified Supabase claims, plus admin_members role checks (owner/admin/analyst) and matching server-side authorisation on every protected action.
- Never use a client-reported session or role as sufficient permission; preserve RLS and least-privilege database access.
- Do not place secrets, OTPs, customer PDF contents, session cookies, signing keys, service-role credentials or private employee/customer data in code, logs, PR text, build artifacts or screenshots.
- Keep first-party analytics on the existing allowlisted privacy-preserving events/routes; no document contents or sensitive metadata in telemetry.

## 20. GitHub change management and protected main

- Begin by inspecting the latest main, current open PRs, failing/queued workflows, release state and relevant older work.
- Use a focused feature branch and PR for nontrivial changes; respect the existing main ruleset, reviewers, required status checks and merge restrictions. No force-push to main or bypass of required checks.
- Separate unrelated dependency and generated-graph changes from feature work. Review diffs and rollback implications before integration.
- Protect against stale refs and competing edits; preserve source commit identity in the PR.

## 21. Meaningful automated validation and CI

- Select applicable commands from the current package.json, including: npm ci, npm test, npm run lint, npx tsc --noEmit, npm run build, npm run build:vinext and the relevant verify:* scripts.
- Run appropriate Playwright e2e/browser suites, accessibility, mobile, Admin auth, privacy/RLS, security/CodeQL, performance and production-certification gates for impacted functionality.
- Verify output artifacts for real PDF operations. Distinguish a true test failure from skipped tests, unavailable runners, upstream outages and unrun checks.
- Investigate known historical verify:* scripts that may reference renamed files; neither dismiss genuine regressions nor call a nonexistent file a passing test.
- Never run destructive tests on production user/customer data or fake CI success.

## 22. Cloudflare release and production verification

- Use the existing Cloudflare Git-connected Workers Builds deployment route for the live lumeo-app Worker and domain; validate applicable quota, preview build and configuration first.
- After authorised merge, confirm the real deployed revision via /api/build-info and compare it with the exact accepted main commit SHA. Verify Worker deployment status, production health, public routes and sensitive Admin boundaries.
- For changed PDF/conversion behaviour, run the relevant real production-browser processing/output suite wherever authorised access exists. A successful build, route-health response or deployment alone is not full end-to-end certification.
- Retain rollback paths and prior known-good deployment references; never report a blocked, pending or failed gate as passed.

## 23. Supabase schema and production-data safety

- Preserve the existing Supabase project, Auth, PostgreSQL, RLS, analytics and catalog contracts.
- Use reviewed, recoverable, explicitly scoped migrations with idempotency/rollback considerations; do not casually rewrite tables, weaken RLS, disable authentication or erase production data.
- Avoid schema changes for a mere UI fix and never introduce paid or remote document-storage dependencies by default.
- Preserve privacy boundaries even when analytics, Admin reporting or tool catalog migrations are added.

## 24. Phase 0 through Phase 16 engineering programme

- Treat the approved native PDF engine and broader Lumeo Phase 0–16 scope as a **17-phase** programme, not proof that any specific phase has been completed.
- Inspect the current detailed phase specifications, GitHub PRs, issue history, code and release gates before choosing the next phase. Existing dated baseline files are snapshots, not necessarily the latest status.
- Work through independent implementation tasks efficiently, while keeping required predecessor acceptance gates and explicit protected-tool scope intact. Do not silently skip a mandatory gate to declare all phases done.
- Track each phase's implementation, tests, integrations, PR, CI, release and actual verification evidence. Identify genuine blockers exactly and continue other independent authorised work if safe.
- Phase plans may evolve by explicit owner instruction; this permanent manifest should not be rewritten merely to update phase percentages or PR numbers.

## 25. Progress and blocker truthfulness

Use these labels consistently: **Not started**, **In development**, **Implemented — verification pending**, **Verified**, **Deployed — production verified**, and **Blocked**. "Completed" requires the stated scope and acceptance criteria to be met with real evidence.

- Identify blockers as code failure, failing test, pending/required review, unavailable access, provider quota, upstream service failure or missing production verification, as appropriate.
- Record actual commands/checks run, relevant PR and commit references, and missing evidence. Never replace an omitted or skipped test with an inferred PASS.
- Avoid repeated long progress narratives; report significant decisions, milestones and genuine blockers briefly.

## 26. Definition of done and final release summary

- For a code release, "Completed" ordinarily means implemented and integrated to approved main; relevant checks actually passed; the authorised Cloudflare deployment succeeded; deployed /api/build-info matches the accepted commit; affected production behaviour was checked where safely possible; and no unapproved spending or privacy/security change occurred.
- For a documentation-only task, completion means the documentation changes are reviewed/merged according to repository rules; that **does not** prove a new runtime feature, full production release or performance improvement.
- End with a concise summary: delivered changes, PR link, accepted commit, test/CI evidence, deployment/production verification evidence, outstanding gaps, rollback consideration and any owner acceptance items.

---

## Five permanent operating principles

### P1. Recover context, never require repeated briefing
Reuse these permanent identifiers and policies, discover the current live technical state, and continue from verified work. Do not make the owner paste the same master prompt in every chat. "DEV CONTINUE" is a request to resume using the current evidence, not permission to invent background automation.

### P2. Fix related defects without needless stops
When an authorised development step encounters a related code/config/test issue, diagnose and correct it as part of the same scoped work. Isolate unrelated defects, avoid broad speculative rewrites and keep a documented rollback path.

### P3. Protect proven features and privacy
Prior successful development, the locked Merge/Split boundaries, Supabase roles/RLS, local-document privacy and original-file fidelity take precedence over convenience or cosmetic redesign. A new feature is not successful if it damages existing behaviour.

### P4. Honour security and protected release gates
Standing owner permission is not a reviewer approval, a GitHub ruleset bypass, a successful CI run or a usable credential. Work autonomously up to the real boundary; do not disable protections or pretend an inaccessible mandatory action was done.

### P5. Deliver evidence, not repetitive process reports
Prefer concise factual updates and one final release summary. The owner can perform the final visual/functionality acceptance after available engineering checks and deployment. Distinguish exactly what is implemented, merged, deployed, verified or blocked.

---

## Practical command and continuity reference

Run commands from the repository root using the versions and scripts actually present in package.json and the checked-in lockfile. A common relevant verification set is:

    npm ci
    npm test
    npm run lint
    npx tsc --noEmit
    npm run build
    npm run build:vinext

Also run the relevant verify:* and Playwright/production-certification workflows for affected areas. Do not assume every command is runnable from every remote environment.

For Graphify work, only where the pinned tooling/environment is available:

    python -m pip install -r requirements-graphify.txt
    python scripts/graphify_env_check.py
    graphify query "question about the code"
    graphify update .

**Persistence note:** This file is the canonical *repository* instruction source. A new assistant session still needs to discover/read it through available repository access; it does not itself grant tools, create schedules, or automatically inject instructions into every chat. Keep any ChatGPT Project instruction to a short pointer to this manifest rather than maintaining a second long policy.

**Legacy file retirement:** The standing instructions previously in root CLAUDE.md and .github/LUMEO_DEVELOPMENT_CONTINUITY.md are consolidated here. Retire those two files through the same protected PR. Retain product README, technical docs, existing workflows, tests and code; their existence does not constitute a conflicting master instruction set.
