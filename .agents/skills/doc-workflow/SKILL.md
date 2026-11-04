---
name: doc-workflow
description: >-
  Keep a Markdown knowledge vault in sync with code changes. Use when engine
  modules, IPC methods, providers, database schema, screens, storage layout,
  CI, or release workflows change and the project keeps notes in
  `.agents/vault`. Writes only to that vault, never to `docs/`, and does not
  commit or push on its own.
---

# Doc Workflow

A repeatable way to update project notes when the code moves. The vault is a
Markdown folder, usually opened in Obsidian. In Grablytic it lives at
`.agents/vault` and is tracked; the rest of `.agents/` stays local and ignored.

## Paths

Set these before starting:

```bash
REPO_ROOT="${REPO_ROOT:-$HOME/grablytic}"
VAULT_ROOT="${VAULT_ROOT:-$REPO_ROOT/.agents/vault}"
```

The default keeps the vault inside the repo at `.agents/vault`, which is
tracked in this repository. The rest of `.agents/` is ignored. Some people
keep the vault in their home directory or directly in `$REPO_ROOT`.

If either path does not exist, stop and ask the user where the repository and
the vault live on their machine. Do not guess. Do not hardcode a personal path
into a tracked file.

If the user gives you paths, use them for this session. If they want the values
remembered, write them to `$REPO_ROOT/.agents/local-paths.md`, which is ignored
by git. Never push that file.

## Triggers

Run this workflow when any of these change:

- An engine module in `engine/grablytic_engine/`.
- `EngineService` or an IPC method.
- A Riverpod provider or the database schema.
- A screen or a user-facing flow.
- CI, release, or packaging workflows.
- A field session produces a new troubleshooting step.

## Procedure

### 1. Scope the diff

```bash
cd "$REPO_ROOT"
git log --oneline -10
git status --short
```

Read the touched paths before opening the vault. The diff decides which notes
are in scope.

### 2. Map paths to notes

Use the vault's own structure. If the vault is new, start with these folders:

| Changed path | Candidate note |
|---|---|
| `engine/grablytic_engine/format_selector.py`, `site_profiles.py`, `lib/core/utils/format_selector.dart` | `architecture/format-ladder.md` |
| `engine/grablytic_engine/downloader.py`, `opts_builder.py`, `hooks.py`, `errors.py` | `architecture/download-pipeline.md` |
| `lib/providers/batch_provider.dart`, batch and playlist screens | `architecture/batch-system.md` |
| `lib/core/utils/app_logger.dart`, `engine/grablytic_engine/logger.py`, `persistent.py`, log viewer | `architecture/logging-diagnostics.md` |
| `lib/core/engine/*`, `engine/grablytic_engine/__main__.py`, `MainActivity.kt` channels | `api/engine-service-methods.md`, `api/method-channel-surface.md`, `architecture/flutter-chaquopy-python-ipc.md` |
| `lib/providers/*` | `api/dart-providers.md` |
| `lib/core/database/download_history_db.dart` | `api/db-schema.md` |
| Settings paths, output, log, and cache directories | `architecture/storage-layout.md` |
| `.github/workflows/*`, `tool/*`, `install.sh` | `guides/nightly-release-workflow.md` |
| New user-facing flows | `guides/dev-setup.md`, `guides/triage-export-workflow.md`, `guides/bulk-archival-workflow.md` |

If no note covers the change, do not force it. Add a row to
`_inbox/open-questions.md` proposing a new note, then continue with the notes
that do exist.

### 3. Frontmatter

Every note starts with:

```yaml
---
title: <Note Title>
date: <YYYY-MM-DD>
tags: [grablytic, <area>]
status: draft
---
```

- Bump `date` on every substantive edit.
- Keep the project tag first.
- New notes start as `draft`. Promote to `complete` only after the verification
  step.
- Use `needs-review` when a claim is blocked on a human decision.

### 4. Link discipline

- Link code mentions to the note that explains them:
  `[[format-ladder|format_selector.py]]`.
- Every `[[target]]` must resolve to a note listed in `index.md`.
- Never link to a note that does not exist. Put the path in code font and file
  a question in `_inbox/open-questions.md`.
- End every note with a `## Links` section.
- Update `index.md` when you add or remove a note.

Link check:

```bash
grep -rho '\[\[[^]|]*' "$VAULT_ROOT" --include='*.md' \
  | sort -u \
  | while read -r link; do
      name="${link#[[}"
      test -f "$VAULT_ROOT/$name.md" || echo "dangling: $link"
    done
```

Adjust the lookup if the vault uses folders. The goal is zero dangling targets.

### 5. Inbox triage

Anything unclear from the code goes to `_inbox/open-questions.md`. Do not guess
architecture in a note.

Each question states:

- What is unclear.
- What you searched.
- What would resolve it.

Put the highest-impact question first. When it is answered, move the answer into
the covering note with a `file:line` or commit hash, delete the row, and bump
the note's date.

### 6. Per-area checklist

- **Format ladder:** quote the selector string and `height_map`. Record rejected
  alternatives. Cite the test run.
- **Pipeline and IPC:** method IDs are frozen. A new ID updates both the
  method-surface note and the engine-service note, plus the transport note.
- **Providers:** update the dependency graph and the ownership table. Record
  whether state lives in prefs, SQLite, or memory.
- **Database:** a schema bump needs the migration guard, the table and column
  list, the indexes, and the key queries. Never describe a column that is not in
  the code.
- **Logging:** cover both layers, the viewer, export, and the reporter. Record
  the size caps exactly.
- **Storage:** list Android and desktop directories separately. Confirm the
  default download path before writing it down.
- **Guides:** commands must be copy-pasteable and match `docs/building.md` and
  the workflows at HEAD.

### 7. Verify before finishing

1. Link check reports zero dangling targets.
2. Every edited note has a fresh date.
3. `index.md` matches the files on disk.
4. Report the notes you touched, the link counts, the open-question count, and
   anything you could not confirm.

Do not commit or push. Hand the diff back to the maintainer. If the vault is
tracked, run the repo's link check before handing it back.

## Boundaries

- Never write to `docs/` from this workflow. Product docs are tracked and
  reviewed separately.
- Never copy secrets, tokens, cookies, personal paths, or customer data into a
  note.
- Never commit on your own. Never stage `.agents/local-paths.md` or any private
  `.agents/` file. The vault is the only tracked part of `.agents/`.
- Publishing a note to another repository is a separate task with its own
  review.
