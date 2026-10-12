import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

function withClonedRepo<T>(
  url: URL,
  work: (repoDir: string) => T,
  options: string[] = []
): T {
  const workDir = mkdtempSync(join(process.cwd(), "work-"));
  try {
    execFileSync("git", ["clone", "--quiet", ...options, url.href, workDir], {
      stdio: "inherit"
    });
    // TODO: do multiple work here
    return work(workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function getDiff({
  baseBranch,
  targetBranch,
  baseCommit,
  targetCommit,
  PRNumber,
  cwd,
  options = []
}: {
  baseBranch?: string;
  targetBranch?: string;
  baseCommit?: string;
  targetCommit?: string;
  PRNumber?: number;
  cwd?: string;
  options: string[];
}): string {
  let diffBetween: string[];
  if (baseBranch && targetBranch) {
    diffBetween = [`origin/${baseBranch}...origin/${targetBranch}`];
  } else if (baseCommit && targetCommit) {
    diffBetween = [baseCommit, targetCommit];
  } else if (PRNumber) {
    // get the PR commit hash
    const commitHash = execFileSync(
      "git",
      ["log", "--all", `--grep=${PRNumber}`, "--pretty=format:%H"],
      {
        encoding: "utf8",
        cwd
      }
    );
    diffBetween = [`${commitHash}^`, commitHash];
  } else {
    throw new Error("getDiff: base and target not defined.");
  }

  return execFileSync("git", ["diff", ...diffBetween, ...options], {
    encoding: "utf8",
    cwd
  });
}

export function cloneGetDiff({
  repoURL,
  baseBranch,
  targetBranch,
  baseCommit,
  targetCommit,
  PRNumber
}: {
  repoURL: URL;
  baseBranch?: string;
  targetBranch?: string;
  baseCommit?: string;
  targetCommit?: string;
  PRNumber?: number;
}) {
  return withClonedRepo(
    repoURL,
    (cwd) =>
      getDiff({
        baseBranch,
        targetBranch,
        baseCommit,
        targetCommit,
        PRNumber,
        cwd,
        options: ["--name-only"]
      }),
    ["--filter=blob:none", "--no-checkout"]
  );
}

// TODO: full content of changed files, before and after

const diff = cloneGetDiff({
  repoURL: new URL("https://github.com/twentyhq/twenty"),
  PRNumber: 27632
});

console.log(diff.split("\n")[0]);
console.log(diff.split("\n")[40]);
console.log(diff.split("\n").length);
