import type {Criterion} from "../types.ts";

/**
 *    input: the task the output was produced for, rendered for the judge
 *   output: the output being graded
 * guidance: extra instructions
 */
export type JudgeOptions = {
  input: string;
  output: string;
  criteria: Criterion[];
  model?: string;
  guidance?: string;
};
