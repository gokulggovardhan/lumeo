# PDF Workspace Production Certification

This file documents the final production-certification boundary for the connected Lumeo PDF Workspace program.

## Scope

The certification phase does not introduce a new PDF engine, storage layer, account requirement, or server-side document-processing path.

The release is considered production-certified only when all of the following are true for the exact protected-main revision under certification:

- the Cloudflare production build reports that exact commit through `/api/build-info`;
- the reported deployment environment is `production`;
- the connected Workspace routes return successfully, including Edit, Pages, Sign, Add, Compress, and Finish;
- the unauthenticated Admin boundary still redirects to the login surface and the login response remains private/no-store;
- the maintained live Word ↔ PDF and HTML → PDF production certification completes successfully in Chromium, WebKit, mobile WebKit, and Firefox;
- the prior comprehensive PDF Workspace release gate has already passed for the code revision being deployed.

## Evidence model

For pull requests, the production-certification workflow checks the pull request base SHA, because that is the protected-main revision currently deployed to production.

After the certification workflow is merged, its push-to-main run checks the resulting merge SHA. This prevents a documentation-only or workflow-only merge from being called final until Cloudflare has deployed that exact new main revision.

## Product guarantees preserved

- standalone PDF tools remain usable without entering the Workspace;
- connected Workspace state remains browser-memory only;
- Premium Edit PDF keeps its existing native content-stream rewrite, font identity, shaping, OCR/searchable OCR, semantic history, fidelity, and fail-closed safety architecture;
- no localStorage, sessionStorage, IndexedDB, or OPFS document persistence is introduced by Workspace continuation;
- Download remains the primary completion action;
- mobile Workspace navigation remains `Edit | Pages | More | Finish`;
- non-PDF outputs are not forced into PDF Workspace continuation.
