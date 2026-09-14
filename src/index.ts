import { runAgent } from "./runner.ts";
import { baselineVariant, REVIEW_TOOLS } from "./use-cases/review-diff.ts";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Core: the pieces every use case is built from.
export type {
  Criterion,
  PromptVariant,
  EvalCase,
  JudgeConfig,
  Suite,
  RunResult,
  CriterionScore,
  Judgment,
  Trial,
  VariantSummary,
  SuiteReport,
} from "./types.ts";
export { runAgent, type RunOptions } from "./runner.ts";
export { judgeOutput, type JudgeOptions } from "./judge.ts";
export { runSuite, type SuiteOptions } from "./suite.ts";



// Diff review: the first use case, now expressed as data over that core.
export {
  getDiff,
  reviewSuite,
  reviewCriteria,
  baselineVariant,
  checklistVariant,
  REVIEW_TOOLS,
  type DiffInput,
} from "./use-cases/review-diff.ts";

export type ReviewOptions = {
  /** The diff to review. Supply it yourself so the reviewed input is deterministic. */
  diff: string;
  /** Base ref the diff was taken against. Recorded in the prompt and the result. */
  base?: string;
  /** Directory the agent reads surrounding code from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Called for every streamed message, for progress reporting. */
  onMessage?: (message: SDKMessage) => void;
};

export type ReviewResult = {
  /** Base ref the diff was taken against. */
  base: string;
  /** The review comment, ready to post. Empty when the run did not succeed. */
  comment: string;
  isError: boolean;
  subtype: string;
  numTurns: number;
  totalCostUsd: number;
  durationMs: number;
};

/**
 * Review a diff and return the comment. Posting is left to the caller - the
 * agent is granted read-only tools and has no write access to GitHub.
 *
 * A thin wrapper over `runAgent` with the baseline review prompt. To compare
 * review prompts against each other, use `reviewSuite` with `runSuite`.
 */
export async function reviewDiff({
  diff,
  base = "main",
  cwd,
  onMessage,
}: ReviewOptions): Promise<ReviewResult> {
  const run = await runAgent({
    prompt: baselineVariant.buildPrompt({ diff, base }),
    tools: REVIEW_TOOLS,
    ...(cwd !== undefined && { cwd }),
    ...(onMessage !== undefined && { onMessage }),
  });

  return {
    base,
    comment: run.output,
    isError: run.isError,
    subtype: run.subtype,
    numTurns: run.numTurns,
    totalCostUsd: run.totalCostUsd,
    durationMs: run.durationMs,
  };
}

