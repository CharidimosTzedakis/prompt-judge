import { getDiff, reviewDiff } from "./index.ts";

// Base ref to diff against. Override with: npm start -- <base-ref>
const base = process.argv[2] ?? "main";
const diff = getDiff(base);

if (!diff.trim()) {
  console.error(`No changes between ${base} and HEAD.`);
  process.exit(0);
}

const result = await reviewDiff({
  diff,
  base,
  // Progress goes to stderr so stdout carries only the review comment.
  onMessage: (message) => {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block) {
          console.error(block.text); // Claude's reasoning
        } else if ("name" in block) {
          console.error(`Tool: ${block.name}`); // Tool being called
        }
      }
    }
  }
});

console.error(
  `Done: ${result.subtype} (${result.numTurns} turns, $${result.totalCostUsd.toFixed(4)})`
);

if (result.isError) {
  process.exit(1);
}

console.log(result.comment);
