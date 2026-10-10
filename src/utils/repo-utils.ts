import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

function withClonedRepo<T>(url: URL, work: (repoDir: string) => T): T {
  const workDir = mkdtempSync(join(process.cwd(), "work-"));
  try {
    execFileSync("git", ["clone", "--quiet", url.href, workDir], {
      stdio: "inherit"
    });
    return work(workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function getDiff(
  baseBranch: string,
  targetBranch: string,
  cwd?: string
): string {
  return execFileSync(
    "git",
    ["diff", `origin/${baseBranch}...origin/${targetBranch}`],
    {
      encoding: "utf8",
      cwd
    }
  );
}

export function cloneGetDiff(
  repoURL: URL,
  baseBranch: string,
  targetBranch: string
) {
  return withClonedRepo(repoURL, (cwd) =>
    getDiff(baseBranch, targetBranch, cwd)
  );
}
