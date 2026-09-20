import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RunResult } from "./types.ts";

export type RunOptions = {
  /** The fully rendered prompt. Building it is the caller's job. */
  prompt: string;
  systemPrompt?: string;
  /**
   * Built-in tools available to the agent. `[]` disables all of them - use
   * that for single-shot work like judging. Omit to inherit the defaults.
   */
  tools?: string[];
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  cwd?: string;
  /** JSON Schema. When set, the result carries `structuredOutput`. */
  outputSchema?: Record<string, unknown>;
  onMessage?: (message: SDKMessage) => void;
};

/**
 * Run one agentic turn and collect everything the suite needs to score it.
 *
 * This is the single place that touches the SDK: prompt text, tool surface and
 * model are parameters, so a prompt variant is data rather than code.
 */
export async function runAgent({
  prompt,
  systemPrompt,
  tools,
  model,
  maxTurns,
  maxBudgetUsd,
  cwd,
  outputSchema,
  onMessage
}: RunOptions): Promise<RunResult> {
  const toolCalls: string[] = [];
  let result: RunResult | undefined;

  for await (const message of query({
    prompt,
    options: {
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(tools !== undefined && { tools, allowedTools: tools }),
      ...(model !== undefined && { model }),
      ...(maxTurns !== undefined && { maxTurns }),
      ...(maxBudgetUsd !== undefined && { maxBudgetUsd }),
      ...(cwd !== undefined && { cwd }),
      ...(outputSchema !== undefined && {
        outputFormat: { type: "json_schema" as const, schema: outputSchema }
      })
    }
  })) {
    onMessage?.(message);

    if (message.type === "assistant") {
      for (const block of message.message?.content ?? []) {
        if (block.type === "tool_use") {
          toolCalls.push(block.name);
        }
      }
    }

    if (message.type === "result") {
      const success = message.subtype === "success";
      result = {
        output: success ? message.result : "",
        ...(success && message.structured_output !== undefined
          ? { structuredOutput: message.structured_output }
          : {}),
        toolCalls,
        isError: message.is_error,
        subtype: message.subtype,
        numTurns: message.num_turns,
        totalCostUsd: message.total_cost_usd,
        durationMs: message.duration_ms
      };
    }
  }

  if (!result) {
    throw new Error("Agent stream ended without a result message");
  }
  return result;
}
