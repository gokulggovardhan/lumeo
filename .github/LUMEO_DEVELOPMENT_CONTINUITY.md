# Lumeo Development Continuity Protocol

This file defines the stable recovery protocol for ChatGPT-assisted Lumeo development.

The mutable current handoff state lives in GitHub issue **#365 — Lumeo Development Continuity — Active State**. Keeping mutable state in one issue avoids noisy repository commits at every checkpoint.

## Source-of-truth order

When resuming work, prefer current external state over chat history:

1. GitHub protected `main` and repository contents.
2. Current feature branch and commits.
3. Pull requests and GitHub Actions.
4. Cloudflare production/build information when available.
5. Supabase/infrastructure state when relevant.
6. GitHub issue #365 as the durable mutable handoff snapshot.
7. Chat history as supporting context only.

Always re-read live external state before acting. The continuity issue is a checkpoint snapshot, not permission to override newer repository/deployment facts.

Never store passwords, credentials, session data, private customer files, private acceptance documents, or sensitive source material in the continuity issue or this file.

## DEV CONTINUE convention

When the user types exactly `DEV CONTINUE` in a Lumeo development chat:

- fetch GitHub issue #365 and this file first;
- inspect current protected `main`, relevant development branches/commits, open PRs, GitHub Actions, deployment evidence, and relevant Supabase state;
- reconcile the durable snapshot with live state; verified external state wins;
- preserve completed work and architectural decisions;
- continue the active objective without repeating completed investigation;
- proceed through implementation, tests, safe fixes, CI, authorized merge/deployment, production verification, smoke tests, cleanup, and final audit where relevant;
- retry transient errors safely without duplicating side effects;
- stop only for genuine user input/approval or when the overall objective is complete.

A fresh chat should not require the full previous conversation when these sources contain sufficient state.

## Checkpoint policy

Update GitHub issue #365 only at meaningful checkpoints:

- material implementation/commit;
- PR creation or material PR update;
- CI outcome;
- merge;
- deployment;
- production verification;
- blocker change;
- objective completion or handoff.

Do not update it for ordinary conversational progress.

If safe uncommitted work would otherwise exist only in an ephemeral environment, preserve it on the existing feature branch/draft PR or another durable development mechanism before relying on a new chat. Never preserve secrets/private acceptance files merely for continuity.

## ChatGPT Project Instructions block

Paste this once into the Lumeo ChatGPT Project instructions:

> Treat GitHub/protected main, current branch/commits, PRs/Actions, deployment evidence, Supabase when relevant, GitHub issue #365, and `.github/LUMEO_DEVELOPMENT_CONTINUITY.md` as the authoritative Lumeo development state. If I type exactly `DEV CONTINUE`, recover and reconcile those sources first, preserve verified work, then continue the current objective autonomously without repeating completed investigation. Continue through implementation, tests, safe fixes, CI, authorized merge/deployment, production verification, smoke testing, cleanup, and final audit. Retry transient failures safely without duplicating side effects. Never expose or persist secrets or private acceptance files. Give concise progress updates without stopping while safe autonomous work remains; stop only for genuine user input/approval or when the overall objective is complete.

## Scheduled supervision

The persistent Scheduled Task should be named **Lumeo Global Development Supervisor**.

It is repository/project supervision, not a live-chat watchdog. It may periodically inspect durable external state and take safe actions available to that scheduled execution, but it must never claim to observe the live ChatGPT `Thinking` state, automatically press `Retry`, enumerate arbitrary chats, or inject a turn into another normal ChatGPT conversation.

Individual workstream watchers are optional and should be created only when they provide demonstrated additional value. Do not create one merely because a chat exists.

When a workstream completes, mark issue #365 accordingly. The global supervisor remains enabled for future Lumeo work.
