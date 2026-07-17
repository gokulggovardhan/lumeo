# Security Policy

## Our approach to security

Lumeo processes PDFs entirely in your browser. Files you upload for merging,
splitting, or compressing are never sent to our servers — they're handled
locally using browser-native and WebAssembly tooling, and cleared from
memory after you download the result. Most traditional file-handling risks
(server-side breaches, interception in transit, retention after use) don't
apply to the core PDF tools, by design.

Supabase is used only for account authentication and admin access — never
for storing or processing your documents.

## Supported versions

Lumeo is a continuously deployed web application, not a versioned package.
The version live at [lumeo.in](https://lumeo.in) is always the current,
supported one. There's nothing older to maintain separately.

## Reporting a vulnerability

Please report security issues privately — not as a public GitHub issue.

**Report via:** [GitHub Security Advisories](https://github.com/gokulggovardhan/lumeo/security/advisories/new)
*(private by default, visible only to you and repo maintainers until you
choose to publish)*

Include:
- What the vulnerability is and its potential impact
- Steps to reproduce it
- Screenshots, logs, or a proof-of-concept if you have one

**What to expect:**
- Acknowledgment within 3 business days
- Initial assessment within 7 business days
- If confirmed: a fix timeline, and a disclosure date agreed together

## Scope

**In scope:** lumeo.in and subdomains, client-side PDF processing, auth/admin flows

**Out of scope:** third-party services (report to the vendor directly),
denial-of-service testing against production, social engineering

## Responsible disclosure

- Give us reasonable time to fix before disclosing publicly
- Don't access, modify, or delete data that isn't yours
- Only test against accounts you own

Valid reports are credited on request.
