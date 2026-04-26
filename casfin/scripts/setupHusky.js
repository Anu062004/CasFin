const { existsSync } = require("fs");
const { resolve } = require("path");
const { execFileSync } = require("child_process");

const repoRoot = resolve(__dirname, "..", "..");
const gitRoot = resolve(repoRoot, ".git");

if (!existsSync(gitRoot)) {
  console.warn("[husky] Skipping hook setup because the repo root was not found.");
  process.exit(0);
}

function resolveGitCommand() {
  const candidates = [
    "git",
    process.env.ProgramFiles ? resolve(process.env.ProgramFiles, "Git", "cmd", "git.exe") : null,
    process.env["ProgramFiles(x86)"] ? resolve(process.env["ProgramFiles(x86)"], "Git", "cmd", "git.exe") : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch (_error) {
      continue;
    }
  }

  throw new Error("git executable not found");
}

try {
  execFileSync(resolveGitCommand(), ["config", "core.hooksPath", ".husky"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
  console.log("[husky] core.hooksPath set to .husky");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[husky] Failed to configure core.hooksPath: ${message}`);
  process.exit(0);
}
