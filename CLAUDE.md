## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

Before you regenerate the graph, install the tooling from the spec:

```bash
pip install -r requirements-graphify.txt && python scripts/graphify_env_check.py
```

`graphify-out/graph.json` is committed, so the environment that builds it is a property of this repo, not of your laptop. Two things change the output silently:

- **graspologic switches the partitioner.** graphify uses Leiden when graspologic imports and falls back to networkx Louvain otherwise. The two cluster the same graph differently, and nothing in `graph.json` records which one ran. If you have graspologic installed, your regenerated graph will disagree with the committed one and your PR will fight the refresh bot's. Never install the `[leiden]` or `[all]` extras — `[sql]` is the only one this repo wants. On Python 3.13+ graspologic cannot be installed at all, which is why the pin and CI both use 3.14.
- **The graphifyy version changes extraction.** Bump the pin in `requirements-graphify.txt` and regenerate together, never one alone.

`scripts/graphify_env_check.py` checks both and explains the fix; CI runs it before every rebuild. `.github/workflows/graphify-refresh.yml` regenerates the graph on merge to main and opens a PR, so routine staleness is not your problem — but a hand-regenerated graph from a mismatched environment is.

Do not commit `graphify-out/graph.html` (gitignored) or hand-edit anything under `graphify-out/`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
