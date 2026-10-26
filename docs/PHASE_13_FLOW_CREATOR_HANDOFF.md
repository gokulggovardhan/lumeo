# Phase 13 — Local Flow creator review and handoff

**Status:** CANDIDATE — NOT MERGED, CERTIFIED OR LOCKED  
**Authorized source:** [PDF Workspace program #399](https://github.com/gokulggovardhan/lumeo/issues/399), Stage 9 creator workflow handoff.  
**Current phase allocation:** [issue #667](https://github.com/gokulggovardhan/lumeo/issues/667).  
**Frozen prerequisite:** Phase 12 `688c7ded2d4ab1c5bd7abb373267450d892631e1` (certificate #666).

## Delivery

The dependency-free `lib/pdf/workspace/creatorHandoff.ts` supplies an intentionally **review-only** handoff for Flow v1. It converts strict portable local history or imported Flow JSON into fixed, human-readable compress-step previews (high quality / balanced / smaller file) and a known `/pdf/compress` next-workflow destination.

Users or later UI integrations must explicitly confirm the preview. Confirmation returns an inert local data handoff with `state: "reviewed-only"`, `requiresNewLocalDocumentSelection: true` and `canExecuteAutomatically: false`. There is no engine dispatcher, new public route, automatic tool navigation, PDF mutation, remote persistence, telemetry, remote API or user document upload. The optional explicit local JSON-template download is the only user-triggered file output.

Capture rejects unstable or server-required sessions. Imported Flow JSON inherits Phase 12 strict v1 schema, 20-step and 16 KiB bounds, allowed compression quality profiles, and exclusions. Ineligible history actions are counted but never included as descriptions, identifiers, signatures, names, source bytes, target sizes or private options. Confirmation refuses a tampered preview, unrecognized draft keys and lack of consent.

## QA and release gate

Run `node --test --experimental-strip-types tests/workspace-creator-handoff.test.ts`, existing Workspace Flows unit tests and all mandated repository CI, browser, security, accessibility, mobile and Cloudflare-worker build checks. The existing Finish PDF screen integrates a **review-only creator panel**: when the session contains allowlisted full-document quality compression, the user may review the portable template, explicitly consent and download only the sanitized JSON. No standalone Flows route, automatic execution or engine dispatch is introduced. Browser/React integration still requires full CI and production proof before certification. No Phase 14 code or production deployment before Phase 13 candidate passes required protected PR tests and receives its own post-merge production certification.

The release continues to use current LUMEO Cloudflare Workers Free Plan infrastructure with no additional paid services or speculative deploys.
