import type { Criterion, CriterionScore } from "../types.ts";

export function weightedMean(
  scores: CriterionScore[],
  criteria: Criterion[]
): number {
  const weightOf = new Map(criteria.map((c) => [c.id, c.weight ?? 1]));
  let total = 0;
  let weight = 0;
  for (const s of scores) {
    const w = weightOf.get(s.criterionId) ?? 1;
    total += s.score * w;
    weight += w;
  }
  return weight === 0 ? 0 : total / weight;
}
