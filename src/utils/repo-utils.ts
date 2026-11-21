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

async function doWorkWithClonedRepo<T>(
  url: URL,
  work: (repoDir: string) => T | Promise<T>,
  cloneOptions: string[] = []
): Promise<T> {
  const workDir = mkdtempSync(join(process.cwd(), "work-"));
  try {
    execFileSync(
      "git",
      ["clone", "--quiet", ...cloneOptions, url.href, workDir],
      {
        stdio: "inherit"
      }
    );
    // await so the finally block doesn't delete workDir while async work is still running
    return await work(workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// TODO: unit test and coverage for this module

function getBaseTarget({
  branchBaseTarget,
  commitBaseTarget,
  PRNumber,
  cwd
}: {
  branchBaseTarget?: [string, string];
  commitBaseTarget?: [string, string];
  PRNumber?: number;
  cwd?: string;
}): [string, string] {
  if (branchBaseTarget) return branchBaseTarget;
  if (commitBaseTarget) return commitBaseTarget;

  if (PRNumber) {
    // get the PR commit hash. Match "#<PRNumber>" not followed by another digit,
    // as in "Merge pull request #123" or squash-merge titles ending "(#123)".
    const commitHashes = execFileSync(
      "git",
      [
        "log",
        "--all",
        "-E",
        `--grep=#${PRNumber}([^0-9]|$)`,
        "--pretty=format:%H"
      ],
      {
        encoding: "utf8",
        cwd
      }
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (commitHashes.length === 0) {
      throw new Error(`getBaseTarget: no commit found for PR #${PRNumber}.`);
    }
    if (commitHashes.length > 1) {
      throw new Error(
        `getBaseTarget: ${commitHashes.length} commits match PR #${PRNumber}, expected exactly one: ${commitHashes.join(", ")}`
      );
    }

    const [commitHash] = commitHashes as [string];
    return [`${commitHash}^`, commitHash];
  }

  throw new Error("getBaseTarget: base and target not defined.");
}

function getDiff({
  baseTarget,
  cwd,
  options = []
}: {
  baseTarget: [string, string];
  cwd?: string;
  options: string[];
}): string {
  return execFileSync(
    "git",
    ["diff", `${baseTarget[0]}...${baseTarget[1]}`, ...options],
    {
      encoding: "utf8",
      cwd
    }
  );
}

export async function getDiffAndChangedFiles({
  repoURL,
  branchBaseTarget,
  commitBaseTarget,
  PRNumber
}: {
  repoURL: URL;
  branchBaseTarget?: [string, string];
  commitBaseTarget?: [string, string];
  PRNumber?: number;
}) {
  return await doWorkWithClonedRepo(
    repoURL,

    async (cwd) => {
      const [base, target] = getBaseTarget({
        branchBaseTarget,
        commitBaseTarget,
        PRNumber,
        cwd
      });
      // remote branches only exist as origin/<name> in a fresh --no-checkout clone
      const prefix = branchBaseTarget ? "origin/" : "";
      const baseTarget: [string, string] = [
        `${prefix}${base}`,
        `${prefix}${target}`
      ];

      const diff = getDiff({
        baseTarget,
        cwd,
        options: ["--name-only"]
      });

      // same diff minus added files (--diff-filter=a excludes "A"), since those
      // don't exist at the base commit and would 404 when downloaded
      const changedFiles = getDiff({
        baseTarget,
        cwd,
        options: ["--name-only", "--diff-filter=a"]
      })
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      // resolve to a concrete SHA that raw.githubusercontent.com understands
      // (it can't resolve "sha^" or "origin/<branch>"). merge-base matches the
      // "base...target" semantics used by getDiff.
      const baseSha = execFileSync(
        "git",
        ["merge-base", baseTarget[0], baseTarget[1]],
        { encoding: "utf8", cwd }
      ).trim();

      await Promise.all(
        changedFiles.map((filePath) =>
          downloadFile(
            `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO}/${baseSha}/${filePath}`,
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
