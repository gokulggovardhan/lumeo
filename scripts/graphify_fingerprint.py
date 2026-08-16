#!/usr/bin/env python3
"""Fingerprint a graphify graph over the parts that are actually stable.

Why this exists
---------------
graphify's clustering is not deterministic. Rebuilding an unchanged tree
produces the same 3,004 nodes and 6,417 links but a DIFFERENT partition --
measured at 182 communities on one run and 180 on the next, from identical
input. So the churn is not community IDs being renumbered over a stable
grouping; the grouping itself moves.

That matters because it rules out the obvious guard. You cannot detect
"only the IDs were renumbered, membership is identical" -- there is no such
state to detect. Comparing canonicalised membership (sorted member sets,
sorted) reports DIFFERS on an unchanged tree, so a guard built on it would
never fire and every run would open a PR.

What is stable is topology: node identity and the links between them, both
of which come straight from the AST. This hashes exactly that and nothing
else, which makes it a usable answer to "did the code actually change?".

Deliberately excluded:
  community / community_name  -- nondeterministic, see above
  built_at_commit             -- changes every run by construction
  metadata, confidence, weight -- derived, and noisy without adding signal

The cost of ignoring communities: when topology is unchanged, community
labels never refresh either. That is the right trade. Labels are derived
from membership, they are currently on their filename fallback anyway, and
a label churn is not worth a 17%-diff commit.

Usage:
    graphify_fingerprint.py <graph.json>            print counts + hash
    graphify_fingerprint.py <a.json> <b.json>       compare, exit 1 if same
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def fingerprint(path: str | Path) -> dict:
    graph = json.loads(Path(path).read_text(encoding="utf-8"))
    nodes = graph["nodes"]
    links = graph["links"]

    node_key = sorted(
        (
            node["id"],
            node.get("label", ""),
            node.get("source_file", ""),
            str(node.get("source_location", "")),
        )
        for node in nodes
    )
    link_key = sorted(
        (
            str(link.get("source")),
            str(link.get("target")),
            str(link.get("relation", "")),
        )
        for link in links
    )

    digest = hashlib.sha256(
        json.dumps([node_key, link_key], sort_keys=True).encode("utf-8")
    ).hexdigest()

    # Reported for the PR body, NOT part of the hash -- see module docstring.
    communities = {node.get("community") for node in nodes}

    return {
        "nodes": len(nodes),
        "links": len(links),
        "communities": len(communities),
        "topology": digest,
    }


def main(argv: list[str]) -> int:
    if len(argv) == 2:
        print(json.dumps(fingerprint(argv[1]), indent=2))
        return 0

    if len(argv) == 3:
        before = fingerprint(argv[1])
        after = fingerprint(argv[2])
        for key in ("nodes", "links", "communities", "topology"):
            mark = "same" if before[key] == after[key] else "CHANGED"
            print(f"{key:12} {before[key]}  ->  {after[key]}  [{mark}]")
        # Exit 1 means "topology unchanged, nothing worth committing". The
        # caller treats that as success-and-skip, not as an error.
        return 1 if before["topology"] == after["topology"] else 0

    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
