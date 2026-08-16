#!/usr/bin/env python3
"""Fail loudly if this environment would produce a different graph.

graphify-out/graph.json is committed, so "which environment built it" is a
property of the repo, not of whoever happened to run the rebuild. Three things
change the output silently:

1. The partitioner. graphify probes for graspologic and uses Leiden when it
   imports, falling back to networkx Louvain otherwise (cluster.py:47-77).
   The two cluster the same graph differently. Nothing in graph.json records
   which one ran -- the `graph` metadata block is empty -- so this cannot be
   asserted after the fact from the artifact. It CAN be asserted exactly
   before the fact, by running the same import probe graphify runs, which is
   what this does.

2. The extractor version. A different graphifyy release changes node and link
   extraction, which is precisely what the refresh workflow's guard keys on,
   so a mismatch produces a real PR on every run.

3. The input set. graphify indexes the working tree; CI checks out only
   tracked files. An untracked, unignored file is therefore in every local
   graph and in no CI graph -- the two disagree permanently, each rebuild
   undoing the other. This is the one that actually bit: pinning the
   toolchain does nothing about it.

All three look identical from outside: "the graph keeps churning".

Run before any rebuild. The workflow does this automatically; run it yourself
before regenerating locally.
"""

from __future__ import annotations

import importlib.metadata as metadata
import re
import subprocess
import sys
from pathlib import Path

SPEC = Path(__file__).resolve().parent.parent / "requirements-graphify.txt"


def pinned_version() -> str:
    """The single source of truth, read rather than duplicated."""
    for line in SPEC.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("#") or not line:
            continue
        match = re.match(r"graphifyy(?:\[[^\]]*\])?==(?P<version>[\w.]+)", line)
        if match:
            return match.group("version")
    raise SystemExit(f"No pinned graphifyy version found in {SPEC}")


def main() -> int:
    failures: list[str] = []

    # 1. The partitioner probe -- the same import graphify itself attempts.
    try:
        from graspologic.partition import leiden  # noqa: F401
    except ImportError:
        pass
    else:
        failures.append(
            "graspologic is installed, so graphify will use Leiden instead of\n"
            "  the networkx Louvain fallback every other environment uses. The\n"
            "  clusterings differ, so your regenerated graph will disagree with\n"
            "  the committed one and your PR will fight the refresh bot.\n"
            "\n"
            "  Fix: pip uninstall graspologic\n"
            "  Then reinstall from the spec and rebuild:\n"
            "    pip install -r requirements-graphify.txt\n"
            "    graphify update . --force\n"
            "\n"
            "  If it came back on its own, you installed graphifyy[leiden] or\n"
            "  graphifyy[all]. Use [sql] only."
        )

    # 2. The extractor version.
    expected = pinned_version()
    try:
        installed = metadata.version("graphifyy")
    except metadata.PackageNotFoundError:
        failures.append(
            f"graphifyy is not installed in this interpreter ({sys.executable}).\n"
            "  Fix: pip install -r requirements-graphify.txt"
        )
    else:
        if installed != expected:
            failures.append(
                f"graphifyy {installed} is installed but {SPEC.name} pins {expected}.\n"
                "  A different extractor version changes node and link extraction,\n"
                "  which is exactly what the refresh guard compares -- so every run\n"
                "  would open a PR.\n"
                "\n"
                f"  Fix: pip install -r {SPEC.name}\n"
                "  To move to a newer version, change the pin AND regenerate, so CI\n"
                "  and every developer move together."
            )

    # 3. The input set.
    #
    # Pinning the toolchain was necessary and not sufficient. graphify indexes
    # the working tree, and CI checks out only tracked files, so any untracked
    # file that is not ignored appears in a local graph and can never appear in
    # a CI one. Measured: three untracked files contributed 113 nodes, so CI
    # rebuilt 2,980 nodes against a committed 3,013 and opened a PR removing
    # them -- which a local rebuild would then put straight back. A permanent
    # oscillation, and nothing about it looks like a bug from either side.
    #
    # graphify has no "tracked files only" mode. It honours .gitignore and
    # .graphifyignore; untracked-but-not-ignored is exactly the gap.
    #
    # git computes the set precisely, so no pattern matching is reimplemented
    # here: --others is untracked, --exclude-standard applies .gitignore, and
    # --exclude-from layers .graphifyignore on top. What survives is what would
    # silently differ.
    graphify_ignore = SPEC.parent / ".graphifyignore"
    command = ["git", "ls-files", "--others", "--exclude-standard"]
    if graphify_ignore.exists():
        command.append(f"--exclude-from={graphify_ignore}")
    try:
        listed = subprocess.run(
            command, capture_output=True, text=True, check=True, cwd=SPEC.parent
        ).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"note: could not list untracked files ({error}); skipping input-set check",
              file=sys.stderr)
    else:
        stray = [line.strip() for line in listed.splitlines() if line.strip()]
        if stray:
            listing = "\n".join(f"      {path}" for path in stray)
            failures.append(
                "these files would be indexed into the graph but are not tracked\n"
                "  by git, so CI cannot see them and will build a different graph:\n"
                f"{listing}\n"
                "\n"
                "  Fix, per file: either `git add` it, if it belongs in the repo,\n"
                "  or add it to .graphifyignore, if it does not. Both are fine;\n"
                "  leaving it in neither is what breaks."
            )

    # 4. Advisory, not fatal. On 3.13+ the graspologic marker makes it
    #    uninstallable, so the invariant holds structurally rather than by
    #    anyone's discipline. Below that it is enforceable only by check 1.
    if sys.version_info < (3, 13):
        print(
            f"note: Python {sys.version_info.major}.{sys.version_info.minor} can install "
            "graspologic. On 3.13+ it cannot, which makes the partitioner "
            "invariant structural. Consider upgrading.",
            file=sys.stderr,
        )

    if failures:
        print("graphify environment check FAILED\n", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}\n", file=sys.stderr)
        return 1

    print(
        f"graphify environment OK: graphifyy {expected}, "
        f"networkx Louvain partitioner, Python "
        f"{sys.version_info.major}.{sys.version_info.minor}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
