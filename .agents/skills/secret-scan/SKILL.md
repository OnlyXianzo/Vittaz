---
name: secret-scan
description: Scan reachable Git history, index and working files with Node TypeScript.
---

# Secret scan

Use pinned Node 24.22.2 and Git; no Python or extra runtime dependencies.
Run `npm run secret:scan`, or `node scripts/deep_git_scan.ts <repo_path>`.

All-ref history added lines, index blobs, and tracked/untracked disk files are
inspected. Ignored untracked files and disk symlinks are excluded; scan submodules
separately. Regex detection is a baseline, not proof that every secret is absent.

Optional `--max-commits N` limits history; `--skip-working-tree` skips index and
disk. Neither is permitted for the required CI scan. Exit codes: 0 clean,
1 potential findings, 2 incomplete scan. Files and Git output have 64 MiB bounds;
exceeding limits fails closed. Output contains detector/source metadata only.
Never print credentials, raw snippets or raw Git errors. Synthetic tests only.
