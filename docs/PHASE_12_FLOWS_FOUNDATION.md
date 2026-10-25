# Phase 12 — Privacy-first Lumeo Flows foundation

**Status:** IN DEVELOPMENT — NOT CERTIFIED OR DEPLOYED  
**Authorized source:** [Unified PDF Workspace program #399](https://github.com/gokulggovardhan/lumeo/issues/399), outstanding Stage 8 (Flows foundation).  
**Phase allocation:** [#662](https://github.com/gokulggovardhan/lumeo/issues/662)  
**Base release:** certified Phase 11 source `18fb5626705744bf4406c1217ca2a427282d9c05`

## Current v1 contract

`lib/pdf/workspace/flows.ts` is a private, *non-executing* and dependency-light domain boundary. It derives eligible reusable settings from the **applied** operation-history cursor. It does not mutate documents, add buttons, trigger conversions, persist templates, or contact a server.

**Allowlisted initial step:** `optimize.compress`, document-wide *quality mode*, profile one of `highQuality`, `balanced`, `smaller`. It intentionally drops operation descriptions, IDs and observed input/output byte counts, and never carries a PDF file. This matches the existing `compressAdapter.ts` metadata without inventing target-size semantics.

**Excluded:** page-scoped edits, signatures, content-specific or sensitive data, document-specific compression targets, unknown operation types/options, private filenames, source/page identifiers, arbitrary URLs, file bytes, unrecognized versions and future unmapped parameters. Unknown keys fail closed.

Imported Flow JSON accepts version 1 only, with up to 20 steps and a 16 KiB UTF-8 limit. Validation reconstructs an explicit allowlisted data structure instead of executing or passing through untrusted input. Flow capture refuses sessions marked `server-required`.

`planWorkspaceFlow` returns validated descriptive steps only. A later **separately gated** phase must implement actual engine adapters, per-document applicability checks, user confirmation, progress, cancellation, undo/rollback, document-local export, browser tests, and any Flows UI.

## Verification requirements

- Run `node --test --experimental-strip-types tests/workspace-flows.test.ts` and full repository unit tests.
- Run `npx tsc --noEmit`, `npm run lint`, the production build and all required protected-PR CI checks.
- No production deployment, roadmap promotion or status claim until every gate passes.
- Preserve Phase 11 certified baseline, all existing PDF tools, no extra Cloudflare or paid resources.

This scoped foundation deliberately avoids an unverified user-visible automation feature.
