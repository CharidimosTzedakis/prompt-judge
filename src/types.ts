/**
 * The vocabulary the suite is written in.
 *
 * Three things vary independently, so each gets its own type:
 *   - the prompt being tested          -> PromptVariant
 *   - the input it is tested on        -> EvalCase
 *   - the standard it is held to       -> Criterion
 *
 * A Suite is the cross product plus the judge's configuration.
 */

/** One rubric line. The judge scores each independently. */
export type Criterion = {
  id: string;
  /** What the judge checks, phrased as a question about the output. */
  question: string;
  /** Relative weight in the overall score. Defaults to 1. */
  weight?: number;
};

/** A prompt under test, plus the agent configuration it needs. */
export type PromptVariant<Input> = {
  /** Stable id - report rows are keyed on it. */
  id: string;
  /** Renders the case input into the prompt actually sent. */
  buildPrompt: (input: Input) => string;
  systemPrompt?: string;
  /** Built-in tools the agent may use. `[]` disables all of them. */
  tools?: string[];
  model?: string;
  maxTurns?: number;
  /** Hard ceiling per run, so a runaway variant cannot drain the suite budget. */
  maxBudgetUsd?: number;
};

/** One input to run every variant against. */
export type EvalCase<Input> = {
  id: string;
  input: Input;
  /** Rubric for this case. Falls back to the suite's criteria when omitted. */
  criteria?: Criterion[];
  /** Directory the agent reads surrounding code from. */
  cwd?: string;
};

export type JudgeConfig = {
  model?: string;
  /** Appended to the judge's instructions - house style, domain caveats. */
  guidance?: string;
};

export type Suite<Input> = {
  name: string;
  variants: PromptVariant<Input>[];
  cases: EvalCase<Input>[];
  /**
   * Renders a case input into the judge's context. Separate from
   * `buildPrompt`: the judge sees the task, not the prompt being graded, so a
   * variant cannot talk its way to a better score.
   */
  renderInput: (input: Input) => string;
  /** Default rubric, used by any case that does not carry its own. */
  criteria: Criterion[];
  /** Runs per variant/case pair. >1 measures run-to-run spread. Defaults to 1. */
  repeats?: number;
  judge?: JudgeConfig;
};

/** What one agent run produced. */
export type RunResult = {
  /** Final assistant text. Empty when the run did not succeed. */
  output: string;
  /** Present only when the run declared an output schema. */
  structuredOutput?: unknown;
  /** Tool names in call order - the trajectory, for trace-level assertions. */
  toolCalls: string[];
  isError: boolean;
  subtype: string;
  numTurns: number;
  totalCostUsd: number;
  durationMs: number;
};

/** One criterion's score, as returned by the judge. */
export type CriterionScore = {
  criterionId: string;
  /** 1 (fails the criterion) to 5 (fully satisfies it). */
  score: number;
  reasoning: string;
};

export type Judgment = {
  scores: CriterionScore[];
  /** Weighted mean of `scores`, computed here rather than by the model. */
  overall: number;
  summary: string;
  /** Cost of the judging call itself, kept separate from the run's cost. */
  judgeCostUsd: number;
};

/** One variant x case x repeat. */
export type Trial = {
  variantId: string;
  caseId: string;
  repeat: number;
  run: RunResult;
  /** Absent when the run errored, or when judging itself failed. */
  judgment?: Judgment;
  /** Why judging was skipped, when it was. */
  judgeError?: string;
};

/** Aggregates for one variant across every case and repeat. */
export type VariantSummary = {
  variantId: string;
  trials: number;
  judged: number;
  errors: number;
  meanOverall: number;
  /** Population standard deviation of `overall` - run-to-run instability. */
  stdDevOverall: number;
  meanCostUsd: number;
  meanTurns: number;
  meanDurationMs: number;
  /** Mean score per criterion id, for spotting which rubric line regressed. */
  meanByCriterion: Record<string, number>;
};

export type SuiteReport = {
  suite: string;
  startedAt: string;
  durationMs: number;
  totalCostUsd: number;
  trials: Trial[];
  variants: VariantSummary[];
};
