import type { PdfPageTextModel } from "./documentModel.ts";
import {
  replacementTextForSearchMatch,
  type PdfTextSearchMatch,
} from "./textSearch.ts";

export type StructuredReplaceSkipReason =
  | "not-editable"
  | "stale-match"
  | "overlapping-native-target";

export type StructuredReplaceSkippedMatch = Readonly<{
  matchId: string;
  pageIndex: number;
  reason: StructuredReplaceSkipReason;
  detail: string;
}>;

export type StructuredReplaceCandidate = Readonly<{
  pageIndex: number;
  lineId: string;
  sourceRunIndices: readonly number[];
  spanIds: readonly string[];
  matchIds: readonly string[];
  originalText: string;
  replacementText: string;
}>;

export type StructuredReplacePagePlan = Readonly<{
  pageIndex: number;
  totalMatches: number;
  plannedMatchCount: number;
  candidates: readonly StructuredReplaceCandidate[];
  skipped: readonly StructuredReplaceSkippedMatch[];
}>;

type CandidateUnit = {
  lineId: string;
  sourceRunIndices: number[];
  spanIds: string[];
  matchIds: string[];
  originalText: string;
  replacementText: string;
};

function skip(
  match: PdfTextSearchMatch,
  reason: StructuredReplaceSkipReason,
  detail: string,
): StructuredReplaceSkippedMatch {
  return {
    matchId: match.id,
    pageIndex: match.pageIndex,
    reason,
    detail,
  };
}

function sourceKey(indices: readonly number[]): string {
  return [...indices].sort((a, b) => a - b).join(",");
}

function candidateKey(lineId: string, indices: readonly number[]): string {
  return `${lineId}|${sourceKey(indices)}`;
}

/**
 * Plans one page of Structured Replace All without touching PDF bytes.
 *
 * Safety rules:
 * - only matches that are already capability=editable are considered;
 * - every match is re-derived from the current Page -> Line -> Span model;
 * - repeated matches inside ONE native span are folded into one rewrite so
 *   they cannot overwrite each other;
 * - any cross-span candidate that shares a native source run with another
 *   candidate is rejected rather than guessing mutation order.
 *
 * The returned candidates are still NOT write authority. Callers must build
 * the normal EditPlan/MultiRunEditPlan against live native operators, run
 * shaping/layout guards, and only then apply them transactionally.
 */
export function planStructuredReplaceAllPage({
  page,
  matches,
  replacement,
}: {
  page: PdfPageTextModel;
  matches: readonly PdfTextSearchMatch[];
  replacement: string;
}): StructuredReplacePagePlan {
  const scoped = matches
    .filter((match) => match.pageIndex === page.pageIndex)
    .sort((a, b) =>
      a.lineId.localeCompare(b.lineId) ||
      a.start - b.start ||
      a.end - b.end ||
      a.id.localeCompare(b.id),
    );

  const skipped: StructuredReplaceSkippedMatch[] = [];
  const singleSpanGroups = new Map<
    string,
    { lineId: string; sourceRunIndex: number; spanId: string; matches: PdfTextSearchMatch[] }
  >();
  const multiUnits: Array<{ match: PdfTextSearchMatch; unit: CandidateUnit }> = [];

  for (const match of scoped) {
    if (match.capability !== "editable") {
      skipped.push(
        skip(
          match,
          "not-editable",
          match.capabilityReason ??
            "This search match is visible but does not have complete native rewrite authority.",
        ),
      );
      continue;
    }

    const prepared = replacementTextForSearchMatch(page, match, replacement);
    if (!prepared) {
      skipped.push(
        skip(
          match,
          "stale-match",
          "The search match no longer maps to the current editable PDF text model.",
        ),
      );
      continue;
    }

    const uniqueRuns = [...new Set(prepared.sourceRunIndices)];
    if (uniqueRuns.length !== prepared.sourceRunIndices.length) {
      skipped.push(
        skip(
          match,
          "stale-match",
          "The search match maps to repeated source runs and cannot be rewritten deterministically.",
        ),
      );
      continue;
    }

    if (uniqueRuns.length === 1) {
      const sourceRunIndex = uniqueRuns[0];
      const line = page.lines.find((candidate) => candidate.id === match.lineId);
      const segments =
        line?.segments.filter((segment) => segment.sourceRunIndex === sourceRunIndex) ?? [];
      const span = line?.spans.find(
        (candidate) => candidate.sourceRunIndex === sourceRunIndex,
      );
      if (!line || !span || segments.length !== 1) {
        skipped.push(
          skip(
            match,
            "stale-match",
            "The native text span no longer has one unambiguous logical segment.",
          ),
        );
        continue;
      }
      const segment = segments[0];
      if (match.start < segment.start || match.end > segment.end) {
        skipped.push(
          skip(
            match,
            "stale-match",
            "The match no longer lies entirely inside its native text span.",
          ),
        );
        continue;
      }
      const key = candidateKey(match.lineId, uniqueRuns);
      const existing = singleSpanGroups.get(key);
      if (existing) {
        existing.matches.push(match);
      } else {
        singleSpanGroups.set(key, {
          lineId: match.lineId,
          sourceRunIndex,
          spanId: span.id,
          matches: [match],
        });
      }
      continue;
    }

    const line = page.lines.find((candidate) => candidate.id === match.lineId);
    if (!line) {
      skipped.push(
        skip(match, "stale-match", "The search line no longer exists on this page."),
      );
      continue;
    }
    const spans = uniqueRuns
      .map(
        (sourceRunIndex) =>
          line.spans.find((span) => span.sourceRunIndex === sourceRunIndex) ?? null,
      )
      .filter((span): span is NonNullable<typeof span> => span !== null);
    if (spans.length !== uniqueRuns.length) {
      skipped.push(
        skip(
          match,
          "stale-match",
          "One or more native spans in this match are no longer available.",
        ),
      );
      continue;
    }
    multiUnits.push({
      match,
      unit: {
        lineId: match.lineId,
        sourceRunIndices: uniqueRuns,
        spanIds: spans.map((span) => span.id),
        matchIds: [match.id],
        originalText: spans.map((span) => span.text).join(""),
        replacementText: prepared.replacementText,
      },
    });
  }

  const units: Array<{ matches: PdfTextSearchMatch[]; unit: CandidateUnit }> = [];

  for (const group of singleSpanGroups.values()) {
    const line = page.lines.find((candidate) => candidate.id === group.lineId);
    const span = line?.spans.find(
      (candidate) => candidate.sourceRunIndex === group.sourceRunIndex,
    );
    const segment = line?.segments.find(
      (candidate) => candidate.sourceRunIndex === group.sourceRunIndex,
    );
    if (!line || !span || !segment) {
      for (const match of group.matches) {
        skipped.push(
          skip(
            match,
            "stale-match",
            "The native span changed while preparing the batch replacement.",
          ),
        );
      }
      continue;
    }

    const ordered = [...group.matches].sort((a, b) => b.start - a.start);
    let nextText = span.text;
    let rightBoundary = span.text.length + 1;
    let valid = true;
    for (const match of ordered) {
      const localStart = match.start - segment.start;
      const localEnd = match.end - segment.start;
      if (
        localStart < 0 ||
        localEnd > span.text.length ||
        localEnd <= localStart ||
        localEnd > rightBoundary
      ) {
        valid = false;
        break;
      }
      nextText =
        nextText.slice(0, localStart) + replacement + nextText.slice(localEnd);
      rightBoundary = localStart;
    }
    if (!valid) {
      for (const match of group.matches) {
        skipped.push(
          skip(
            match,
            "overlapping-native-target",
            "Multiple matches overlap inside the same native text span.",
          ),
        );
      }
      continue;
    }

    units.push({
      matches: group.matches,
      unit: {
        lineId: group.lineId,
        sourceRunIndices: [group.sourceRunIndex],
        spanIds: [group.spanId],
        matchIds: group.matches.map((match) => match.id),
        originalText: span.text,
        replacementText: nextText,
      },
    });
  }

  for (const entry of multiUnits) {
    units.push({ matches: [entry.match], unit: entry.unit });
  }

  const sourceUseCount = new Map<number, number>();
  for (const { unit } of units) {
    for (const sourceRunIndex of unit.sourceRunIndices) {
      sourceUseCount.set(
        sourceRunIndex,
        (sourceUseCount.get(sourceRunIndex) ?? 0) + 1,
      );
    }
  }

  const candidates: StructuredReplaceCandidate[] = [];
  for (const { matches: unitMatches, unit } of units) {
    const overlaps = unit.sourceRunIndices.some(
      (sourceRunIndex) => (sourceUseCount.get(sourceRunIndex) ?? 0) > 1,
    );
    if (overlaps) {
      for (const match of unitMatches) {
        skipped.push(
          skip(
            match,
            "overlapping-native-target",
            "This match shares a native PDF text run with another replacement target, so the batch leaves it unchanged.",
          ),
        );
      }
      continue;
    }
    candidates.push({
      pageIndex: page.pageIndex,
      lineId: unit.lineId,
      sourceRunIndices: [...unit.sourceRunIndices],
      spanIds: [...unit.spanIds],
      matchIds: [...unit.matchIds],
      originalText: unit.originalText,
      replacementText: unit.replacementText,
    });
  }

  return {
    pageIndex: page.pageIndex,
    totalMatches: scoped.length,
    plannedMatchCount: candidates.reduce(
      (total, candidate) => total + candidate.matchIds.length,
      0,
    ),
    candidates,
    skipped,
  };
}
