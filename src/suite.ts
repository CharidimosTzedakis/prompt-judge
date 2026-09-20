import { runAgent } from "./runner.ts";
import { judgeOutput } from "./judge/judge.ts";
import type {
  Suite,
  SuiteReport,
  Trial,
  VariantSummary,
  EvalCase,
  PromptVariant
} from "./types.ts";

export type SuiteOptions = {
  /** Trials in flight at once. Defaults to 4. */
  concurrency?: number;
  /** Called as each trial finishes, for progress reporting. */
  onTrial?: (trial: Trial) => void;
};

type PlannedTrial<Input> = {
  variant: PromptVariant<Input>;
  evalCase: EvalCase<Input>;
  repeat: number;
};

/** Runs `tasks` with at most `limit` in flight, preserving input order. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation - the spread we already have, not a sample of it. */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function summarize<Input>(
  variant: PromptVariant<Input>,
  trials: Trial[]
): VariantSummary {
  const mine = trials.filter((t) => t.variantId === variant.id);
  const judged = mine.filter((t) => t.judgment !== undefined);
  const overalls = judged.map((t) => t.judgment!.overall);

  const byCriterion: Record<string, number[]> = {};
  for (const trial of judged) {
    for (const score of trial.judgment!.scores) {
      (byCriterion[score.criterionId] ??= []).push(score.score);
    }
  }

  return {
    variantId: variant.id,
    trials: mine.length,
    judged: judged.length,
    errors: mine.filter((t) => t.run.isError).length,
    meanOverall: mean(overalls),
    stdDevOverall: stdDev(overalls),
    meanCostUsd: mean(mine.map((t) => t.run.totalCostUsd)),
    meanTurns: mean(mine.map((t) => t.run.numTurns)),
    meanDurationMs: mean(mine.map((t) => t.run.durationMs)),
    meanByCriterion: Object.fromEntries(
      Object.entries(byCriterion).map(([id, scores]) => [id, mean(scores)])
    )
  };
}

/**
 * Run every variant against every case, judge each output, and aggregate.
 *
 * Repeats exist because an agentic run is not deterministic - the same prompt
 * can take different tool paths and land on different answers. A variant's
 * `stdDevOverall` is as much a result as its `meanOverall`: a prompt that
 * scores 4.5 +/- 1.2 is not better than one that scores 4.2 +/- 0.1.
 */
export async function runSuite<Input>(
  suite: Suite<Input>,
  { concurrency = 4, onTrial }: SuiteOptions = {}
): Promise<SuiteReport> {
  const startedAt = new Date();
  const started = Date.now();
  const repeats = suite.repeats ?? 1;

  const planned: PlannedTrial<Input>[] = [];
  for (const variant of suite.variants) {
    for (const evalCase of suite.cases) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        planned.push({ variant, evalCase, repeat });
      }
    }
  }

  const trials = await mapWithLimit(planned, concurrency, async (planned) => {
    const { variant, evalCase, repeat } = planned;
    const criteria = evalCase.criteria ?? suite.criteria;

    const run = await runAgent({
      prompt: variant.buildPrompt(evalCase.input),
      ...(variant.systemPrompt !== undefined && {
        systemPrompt: variant.systemPrompt
      }),
      ...(variant.tools !== undefined && { tools: variant.tools }),
      ...(variant.model !== undefined && { model: variant.model }),
      ...(variant.maxTurns !== undefined && { maxTurns: variant.maxTurns }),
      ...(variant.maxBudgetUsd !== undefined && {
        maxBudgetUsd: variant.maxBudgetUsd
      }),
      ...(evalCase.cwd !== undefined && { cwd: evalCase.cwd })
    });

    const trial: Trial = {
      variantId: variant.id,
      caseId: evalCase.id,
      repeat,
      run
    };

    // A failed run is a result, not an exception: it counts against the
    // variant rather than aborting the suite.
    if (!run.isError) {
      try {
        trial.judgment = await judgeOutput({
          input: suite.renderInput(evalCase.input),
          output: run.output,
          criteria,
          ...(suite.judge?.model !== undefined && { model: suite.judge.model }),
          ...(suite.judge?.guidance !== undefined && {
            guidance: suite.judge.guidance
          })
        });
      } catch (error) {
        trial.judgeError =
          error instanceof Error ? error.message : String(error);
      }
    }

    onTrial?.(trial);
    return trial;
  });

  const totalCostUsd = trials.reduce(
    (sum, t) => sum + t.run.totalCostUsd + (t.judgment?.judgeCostUsd ?? 0),
    0
  );

  return {
    suite: suite.name,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - started,
    totalCostUsd,
    trials,
    variants: suite.variants.map((v) => summarize(v, trials))
  };
}
