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
  cwd,
  options = []
}: {
  baseBranch?: string;
  targetBranch?: string;
  baseCommit?: string;
  targetCommit?: string;
  cwd?: string;
  options: string[];
}): string {
  let diffBetween: string[];
  if (baseBranch && targetBranch) {
    diffBetween = [`origin/${baseBranch}...origin/${targetBranch}`];
  } else if (baseCommit && targetCommit) {
    diffBetween = [baseCommit, targetCommit];
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
  targetCommit
}: {
  repoURL: URL;
  baseBranch?: string;
  targetBranch?: string;
  baseCommit?: string;
  targetCommit?: string;
}) {
  return withClonedRepo(
    repoURL,
    (cwd) =>
      getDiff({
        baseBranch,
        targetBranch,
        baseCommit,
        targetCommit,
        cwd,
        options: ["--name-only"]
      }),
    ["--filter=blob:none", "--no-checkout"]
  );
}

// TODO: full content of changed files, before and after
// specific commit --> 16438b3ab640f63c17b02ad51911ce39a99ce1e1
// git diff 16438b3ab6^ 16438b3ab6 --name-only
// we get the changed files
// git clone --depth=50

const diff = cloneGetDiff({
  repoURL: new URL("https://github.com/twentyhq/twenty"),
  baseCommit: "16438b3ab6^",
  targetCommit: "16438b3ab6"
});

console.log(diff.split("\n")[0]);
console.log(diff.split("\n")[40]);
console.log(diff.split("\n").length);
