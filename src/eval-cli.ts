import { getDiff, reviewSuite, runSuite } from "./index.ts";
import type { EvalCase, DiffInput, SuiteReport } from "./index.ts";

// Usage: npm run eval -- [base-ref...] [--repeats=N] [--concurrency=N]
//
// Each base ref becomes one case: the diff between it and HEAD. Every prompt
// variant is run against every case, `repeats` times, and judged.
const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  if (!match) return fallback;
  const value = Number(match.slice(name.length + 3));
  if (!Number.isFinite(value) || value < 1) {
    console.error(`--${name} must be a positive number`);
    process.exit(2);
  }
  return value;
};

const repeats = flag("repeats", 1);
const concurrency = flag("concurrency", 4);
const bases = args.filter((a) => !a.startsWith("--"));
if (bases.length === 0) bases.push("main");

const cases: EvalCase<DiffInput>[] = [];
for (const base of bases) {
  const diff = getDiff(base);
  if (!diff.trim()) {
    console.error(`Skipping ${base}: no changes between it and HEAD.`);
    continue;
  }
  cases.push({ id: base, input: { diff, base } });
}

if (cases.length === 0) {
  console.error("No cases to run.");
  process.exit(1);
}

const suite = { ...reviewSuite(cases), repeats };

console.error(
  `Running ${suite.variants.length} variants x ${cases.length} cases x ${repeats} repeats ` +
    `(${suite.variants.length * cases.length * repeats} trials, ${concurrency} at a time)`,
);

const report: SuiteReport = await runSuite(suite, {
  concurrency,
  onTrial: (trial) => {
    const label = `${trial.variantId}/${trial.caseId}#${trial.repeat}`;
    if (trial.run.isError) {
      console.error(`  ${label}: run failed (${trial.run.subtype})`);
    } else if (trial.judgeError) {
      console.error(`  ${label}: judging failed (${trial.judgeError})`);
    } else {
      console.error(`  ${label}: ${trial.judgment!.overall.toFixed(2)}/5`);
    }
  },
});

console.error(`\n${report.suite} - $${report.totalCostUsd.toFixed(4)}, ${(report.durationMs / 1000).toFixed(1)}s\n`);
for (const v of report.variants) {
  console.error(
    `  ${v.variantId.padEnd(12)} ${v.meanOverall.toFixed(2)} +/- ${v.stdDevOverall.toFixed(2)}  ` +
      `(${v.judged}/${v.trials} judged, $${v.meanCostUsd.toFixed(4)}/run, ${v.meanTurns.toFixed(1)} turns)`,
  );
  for (const [criterion, score] of Object.entries(v.meanByCriterion)) {
    console.error(`      ${criterion.padEnd(14)} ${score.toFixed(2)}`);
  }
}

// The full report goes to stdout so it can be redirected to a file and diffed
// against a later run.
console.log(JSON.stringify(report, null, 2));
