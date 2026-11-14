# Superpowers skills — vendored source

Vendored copy of the skills from [`obra/superpowers`](https://github.com/obra/superpowers), a
software-development methodology built from composable skills.

## Provenance

| | |
| --- | --- |
| Upstream | https://github.com/obra/superpowers |
| Commit | `22f0b463e7a5e579904dd6211a520321035526f7` |
| Commit date | 2026-11-03 |
| Upstream version | `superpowers@7.0.2` |
| Licence | MIT, Copyright (c) 2025 Jesse Vincent — see `LICENSE` |
| Fetched | 2026-11-11 |
| Copied | `skills/` verbatim, 15 skill directories, 80 files, plus `LICENSE` |

## What was copied and what was not

Copied is the skill content only: every `SKILL.md`, its `references/`, and the helper
scripts that ship beside them (`systematic-debugging/find-polluter.sh`,
`subagent-driven-development/scripts/*`, `executing-plans/scripts/*`).

**Not copied** — these are the plugin's own runtime, not skills, and this repository does
not load plugins: `index.js`, `hooks/`, `package.json`, `tests/`, `scripts/`, and the
per-agent plugin manifests (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`,
`.gemini-plugin/`, `.opencode/` and the rest). Also not copied: `docs/`, `assets/`,
`RELEASE-NOTES.md`.

The consequence, stated plainly: the skills read as intended, but anything that depends on
the plugin's hook lifecycle or on its command namespace will not fire on its own. Where a
skill says `superpowers:test-driven-development`, that refers to the sibling directory in
this folder.

## Why vendored rather than a submodule

A submodule would pin the same commit and cost one `.gitmodules`, but it would also put 8 MB
of plugin source and a network round-trip into every clone, and this repo's rule is that
`.agents/` is tooling that stays in its original form — a copy under review is easier to
audit than a pointer. The whole upstream repository was deliberately not imported: the ask
was the skills.

## How this interacts with the repo's rules

- `.agents/` is excluded from Prettier, ESLint, Vitest and `tsconfig.check.json`, so
  vendored Markdown cannot break a gate. That was already true before this import.
- `AGENTS.md` rule 15 forbids rewriting or refactoring anything under `.agents/`. That
  applies here: **do not reformat, edit or "improve" these files.** Change the upstream
  commit instead.
- `docs/references.md` records the row for this import.

## Updating

```bash
rm -rf .agents/skills/superpowers
git clone --depth 1 https://github.com/obra/superpowers.git /tmp/sp
mkdir -p .agents/skills/superpowers
cp -a /tmp/sp/skills/. .agents/skills/superpowers/
cp /tmp/sp/LICENSE .agents/skills/superpowers/LICENSE
```

Then update the commit above. Keep the copy verbatim; a local diff makes the next update
unreadable.

## Not verified

That any of these skills improves an agent's behaviour on this repository. They are
instructions for an agent, not code, so nothing here is covered by a test and no gate
asserts they work. Read a skill before relying on it, and check it against `AGENTS.md` and
`Plan.md` where they disagree — particularly the planning and TDD skills, which describe a
workflow this repo has its own version of.
