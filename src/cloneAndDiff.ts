import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

function withClonedRepo<T>(url: URL, work: (repoDir: string) => T): T {
  // alternative:  const workDir = mkdtempSync(join(tmpdir(), "prompt-judge-"));
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

/** Read a diff from git. Throws if the ref is unknown. */
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

const diff = withClonedRepo(
  new URL("https://github.com/CharidimosTzedakis/luna-cms"),
  (dir) => getDiff("main", "pdf-upload-improvements", dir)
);

console.log(diff);
