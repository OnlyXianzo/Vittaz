# Agent rules

Read in this order: `AGENTS.md`, `Plan.md`, `STATE.md`, `DECISIONS.md`, then `docs/`.

1. Test-driven. Write a failing test first, then the smallest code that passes it, then refactor.
2. One step at a time. A step is done when tests pass locally, CI is green, `STATE.md` is updated and the work is pushed.
3. `reference/` is read-only. Port logic module by module through failing tests. Never copy it in wholesale.
4. Keep `packages/core` framework-free and keep its public behavior. Change it only with a failing test or a reason in `DECISIONS.md`.
5. Use `snake_case` for AI tool names, CLI JSON keys, database columns and test ids.
6. Before using any library or service, read its current official docs on the web. Record the URL, version and date in `docs/references.md`. Pin versions. Never guess an API.
7. Synthetic data only. No real transactions, names, bank messages, keys or spreadsheets anywhere.
8. No real keys in tests. Live tests use keyless providers only, are tagged `@live`, and never block a merge.
9. Privacy tests are blockers.
10. The AI never writes to the database. It can only create pending proposals. Approve, reject and undo are user-only actions.
11. Backend and CLI first. Do not open `canvas/` and do not write UI until the user signs off gate G3.
12. Commit and push after every green step. Sandboxes are temporary.
13. Do not build anything not in `Plan.md`. Write a proposal in `DECISIONS.md` instead.
14. Never put secrets in files. Read tokens from environment variables.

Stop and report at every gate.
