import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

const REPO_OWNER = "REPO_OWNER";
const REPO = "REPO";

export async function downloadFile(
  url: string,
  destPath: string
): Promise<void> {
  const res = await fetch(url);

  if (!res.ok || !res.body) {
    throw new Error(
      `Download failed: ${res.status} ${res.statusText} (${url})`
    );
  }

  try {
    await pipeline(
      Readable.fromWeb(res.body as any),
      createWriteStream(destPath)
    );
  } catch (err) {
    await rm(destPath, { force: true });
    throw err;
  }
}

function doWorkWithClonedRepo<T>(
  url: URL,
  work: (repoDir: string) => T,
  cloneOptions: string[] = []
): T {
  const workDir = mkdtempSync(join(process.cwd(), "work-"));
  try {
    execFileSync(
      "git",
      ["clone", "--quiet", ...cloneOptions, url.href, workDir],
      {
        stdio: "inherit"
      }
    );
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

export function getDiffAndChangedFiles({
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
  return doWorkWithClonedRepo(
    repoURL,

    async (cwd) => {
      const diff = getDiff({
        baseBranch,
        targetBranch,
        baseCommit,
        targetCommit,
        PRNumber,
        cwd,
        options: ["--name-only"]
      });

      const changedFiles = diff.trim().split("\n");

      // TODO: we want the previous version of the files
      await Promise.all(
        changedFiles.map((filePath) =>
          downloadFile(
            `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO}/${COMMIT_HASH}/${filePath}`,
            // flatten "src/a/index.ts" → "src__a__index.ts" so same-named files don't collide
            join(cwd, filePath.replaceAll("/", "__"))
          )
        )
      );

      return {
        diff,
        changedFiles
      };
    },
    ["--filter=blob:none", "--no-checkout"]
  );
}

const diff = await getDiffAndChangedFiles({
  repoURL: new URL(`https://github.com/${REPO_OWNER}/${REPO}`),
  PRNumber: 27632
});

// https://raw.githubusercontent.com/${REPO_OWNER}/${REPO}/${COMMIT_HASH}/file-path
