#!/usr/bin/env python3
"""Render two PDFs and compare their page images with anti-aliasing tolerance.

This is intentionally a coarse visual guard, not a byte-for-byte renderer test.
It blurs and downsamples both pages before measuring luminance differences so
font anti-aliasing and tiny rasterization changes do not fail CI, while missing
blocks, shifted tables, clipped content, and pagination changes remain visible.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


def render(pdf: Path, directory: Path, prefix: str) -> list[Path]:
    output = directory / prefix
    subprocess.run(
        ["pdftoppm", "-png", "-r", "96", str(pdf), str(output)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    return sorted(directory.glob(f"{prefix}-*.png"))


def compare_page(reference: Path, candidate: Path) -> dict[str, float | list[int]]:
    with Image.open(reference) as ref_image, Image.open(candidate) as cand_image:
        ref = ref_image.convert("L")
        cand = cand_image.convert("L")

        if abs(ref.width - cand.width) > 2 or abs(ref.height - cand.height) > 2:
            raise ValueError(
                f"page raster dimensions differ: reference={ref.size}, candidate={cand.size}"
            )

        width = min(ref.width, cand.width)
        height = min(ref.height, cand.height)
        ref = ref.crop((0, 0, width, height))
        cand = cand.crop((0, 0, width, height))

        target = (max(1, width // 2), max(1, height // 2))
        ref = ref.filter(ImageFilter.GaussianBlur(0.65)).resize(
            target, Image.Resampling.LANCZOS
        )
        cand = cand.filter(ImageFilter.GaussianBlur(0.65)).resize(
            target, Image.Resampling.LANCZOS
        )

        diff = ImageChops.difference(ref, cand)
        histogram = diff.histogram()
        pixels = ref.width * ref.height
        mae = sum(value * count for value, count in enumerate(histogram)) / pixels
        changed = (
            sum(count for value, count in enumerate(histogram) if value >= 28) / pixels
        )
        rmse = math.sqrt(
            sum((value * value) * count for value, count in enumerate(histogram))
            / pixels
        )
        return {
            "mae": mae,
            "rmse": rmse,
            "changed_fraction": changed,
            "size": [width, height],
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--max-mae", type=float, default=18.0)
    parser.add_argument("--max-changed", type=float, default=0.20)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="lumeo-fidelity-") as temp:
        directory = Path(temp)
        reference_pages = render(args.reference, directory, "reference")
        candidate_pages = render(args.candidate, directory, "candidate")

        if len(reference_pages) != len(candidate_pages):
            raise SystemExit(
                f"page count mismatch: reference={len(reference_pages)}, "
                f"candidate={len(candidate_pages)}"
            )

        results = [
            compare_page(reference, candidate)
            for reference, candidate in zip(reference_pages, candidate_pages)
        ]

    report = {
        "page_count": len(results),
        "pages": results,
        "worst_mae": max((float(page["mae"]) for page in results), default=0.0),
        "worst_changed_fraction": max(
            (float(page["changed_fraction"]) for page in results), default=0.0
        ),
    }
    print(json.dumps(report, indent=2))

    if report["worst_mae"] > args.max_mae:
        raise SystemExit(
            f"visual MAE {report['worst_mae']:.2f} exceeds {args.max_mae:.2f}"
        )
    if report["worst_changed_fraction"] > args.max_changed:
        raise SystemExit(
            "visual changed-pixel fraction "
            f"{report['worst_changed_fraction']:.3f} exceeds {args.max_changed:.3f}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
