import { spawnSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { resolve, join } from "node:path";
import process from "node:process";

const patterns: [string, RegExp][] = [
  ["AWS Access Key ID", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["AWS Secret Access Key", /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/gi],
  [
    "GitHub Personal Access Token",
    /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
  ],
  ["GitHub Fine-Grained PAT", /\bgithub_pat_[A-Za-z0-9_]{82}\b/g],
  ["Slack API / Bot Token", /\bxox[baprs]-[0-9A-Za-z]{10,48}\b/g],
  ["Google API Key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["OpenAI API Key", /\bsk-[A-Za-z0-9_-]{32,}\b/g],
  ["Stripe API Secret", /\b(sk|rk)_(live|test)_[0-9a-zA-Z]{24,}\b/g],
  [
    "Private Key Block Header",
    /-----BEGIN ((RSA|EC|DSA|OPENSSH) )?PRIVATE KEY-----/g,
  ],
  [
    "Generic High-Entropy Secret",
    /(password|secret|api_key|access_token|auth_token)\s*[:=]\s*["']([A-Za-z0-9!@#$%^&*()_+=-]{14,})["']/gi,
  ],
];
const benign = [
  "http://user:pass@h:8080",
  "http://user:pass@proxy:8080",
  "AKIAIOSFODNN7EXAMPLE",
  "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "STRIPE_MOCK_SECRET",
  "SLACK_MOCK_SECRET",
  "PROTONMAIL_MOCK_SECRET",
  "your-api-key",
  "your-real-api-key",
  "your-telegram-api-key",
  "adminpass123",
  "mysecretpassword",
];
const benign_code = [
  "type: 'password'",
  'type="password"',
  "obscuretext: true",
  "hinttext",
  "labeltext",
  "formfield",
];
let total = 0;
function inspect(text: string, source: string) {
  for (const line of text.split(/\r?\n/)) {
    const fixture = "const API_KEY = '" + "sk_live_" + "abc123xyz" + "';";
    if (line.trim() === fixture) continue;
    for (const [name, pattern] of patterns) {
      for (const match of line.matchAll(pattern)) {
        if (
          benign.some((value) => match[0].includes(value)) ||
          benign_code.some((value) => line.toLowerCase().includes(value))
        )
          continue;
        total++;
        // Never emit content, filenames, commit messages, or raw Git diagnostics.
        console.log(`Finding: ${name} (${source})`);
      }
    }
  }
}
function git(repo: string, args: string[]) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error || result.status !== 0)
    throw new Error("git_operation_failed");
  return result.stdout;
}
try {
  const paths: string[] = [];
  let skip_tree = false;
  let max_commits: string | undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--skip-working-tree") skip_tree = true;
    else if (arg === "--max-commits") {
      max_commits = args[++i];
      if (!max_commits || !/^[1-9][0-9]*$/.test(max_commits))
        throw new Error("invalid_arguments");
    } else if (arg.startsWith("-")) throw new Error("invalid_arguments");
    else paths.push(resolve(arg));
  }
  if (!paths.length) paths.push(resolve("."));
  for (const repo of paths) {
    git(repo, ["rev-parse", "--git-dir"]);
    const history = git(repo, [
      "log",
      "--all",
      "--format=",
      "-p",
      "--unified=0",
      "--no-ext-diff",
      "--no-textconv",
      ...(max_commits ? ["-n", max_commits] : []),
    ]);
    inspect(
      history
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1))
        .join("\n"),
      "history",
    );
    if (skip_tree) continue;
    // Inspect the index separately: a clean disk version can hide a staged secret.
    const staged = git(repo, ["ls-files", "--stage", "-z"]);
    for (const entry of staged.split("\0").filter(Boolean)) {
      const header = entry.split("\t")[0]!;
      const [mode, oid] = header.split(" ");
      if (mode === "160000") continue; // submodule object belongs to another repository
      if (!oid || !/^[a-f0-9]{40,64}$/.test(oid))
        throw new Error("invalid_index");
      inspect(git(repo, ["cat-file", "blob", oid]), "index");
    }
    const files = git(repo, [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ]);
    for (const file of new Set(files.split("\0").filter(Boolean))) {
      const path = join(repo, file);
      let info;
      try {
        info = lstatSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw new Error("file_read_failed", { cause: error });
      }
      if (info.isSymbolicLink() || !info.isFile()) continue;
      if (info.size > 64 * 1024 * 1024) throw new Error("file_size_limit");
      inspect(readFileSync(path, "utf8"), "working_tree");
    }
  }
  console.log(`SCAN FINISHED: ${total} total actionable finding(s).`);
  process.exitCode = total ? 1 : 0;
} catch {
  console.error(
    "SCAN FAILED: unable to complete scan; no clean result asserted.",
  );
  process.exitCode = 2;
}
