# Decisions

Record every deviation from the plan here, with a date and a reason.

| #   | Decision                                                                                                                                                     | Status                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | The app is named Vittaz.                                                                                                                                     | Settled                              |
| 2   | Repository interfaces in core are asynchronous. This replaces the earlier synchronous `Db` interface idea, because Expo's recommended APIs are asynchronous. | Settled                              |
| 3   | SQLite with Drizzle behind a separate `storage` package. `better-sqlite3` for Node tests and the CLI, `expo-sqlite` on mobile.                               | Settled, verify against current docs |
| 4   | The CLI and CI run on Node 20 or newer in v1. Bun is evaluated later.                                                                                        | Settled                              |
| 5   | The assistant runs inside the app and CLI. One `AssistantService` serves app, CLI and Telegram.                                                              | Settled                              |
| 6   | Native TypeScript tools with `snake_case` names. No MCP in v1.                                                                                               | Settled                              |
| 7   | LangChain, not LangGraph, inside `packages/agent` only. Revisit after the phone check.                                                                       | Settled                              |
| 8   | Telegram is the only connector in v1. It uses a user-supplied bot token and a pairing code.                                                                  | Settled                              |
| 9   | Gmail, WhatsApp and Discord are deferred connectors.                                                                                                         | Settled                              |
| 10  | Conversation history is shared across channels. No automatic long-term memory in v1.                                                                         | Settled                              |
| 11  | Backend and CLI first. HTML screens are wired afterwards in vertical slices, starting with manual entry. Animation last.                                     | Settled                              |
| 12  | One ledger per device, moved by export and import file.                                                                                                      | Settled                              |
| 13  | Personal mode first. Merchant mode later.                                                                                                                    | Settled                              |
| 14  | The reference engine is read-only. Logic is ported module by module through failing tests.                                                                   | Settled                              |

## Bootstrap verification — 2026-11-04 (pending user decision)

S0 is the first unchecked step. Inspection at `2fb5f92` found:

- Required `reference/` and `canvas/` archives are absent. Do not invent the 31 reference checks or inspect any UI archive before G3.
- A GPL-3.0 `LICENSE` exists, while this document, Plan.md and README.md say the license is undecided. Preserve the file pending owner clarification; do not make a licensing decision on the owner's behalf.
- Source scaffolds already exist in core, CLI and mobile, contrary to S0's docs/config-only requirement. Proposal: preserve them and reconcile the existing foundation during S1 rather than destructively reset it.
- Plan.md targets `packages/cli`, but docs/ARCHITECTURE.md targets `apps/cli`, matching the existing scaffold. Ask which location governs before changing workspace structure.
- The user requires a separate branch, PR and review. Work is on `chore/verify-repository-bootstrap`; authenticated push and PR await `GITHUB_TOKEN` in the environment. Never persist the token in a file.

No implementation or completion claim is made. Stop at the Phase A boundary until the missing inputs and bootstrap disposition are confirmed. The verified-implementation skill has been read; implementation research and a written Verified Approach must precede non-trivial code changes.

## Open

- License. Undecided. Do not add a license file until it is chosen.
- Backup encryption and key recovery.
- Whether to keep LangChain after the Android check.
- Which local model and size ships first.
- How a future Gmail connector handles OAuth without a Vittaz server.
- Whether the first assistant slice in the UI should be manual entry (current plan) or chat.

## Reference source confirmed — 2026-11-04

The owner supplied `https://github.com/OnlyXianzo/khataclaw-typescript` as the previously missing reference engine. Use revision `b21801c3755f4da4ba4075782c45621d42a3c34c` as the read-only reference, replacing the expected reference zip as the source format. Keep its checkout external to workspaces and CI; record provenance in docs/references.md. Source inspection confirms the expected 31 baseline checks plus 10 extras. Do not claim those checks have been rerun. Preserve public behavior through module-by-module TDD, not wholesale source import. The original source colocates synchronous storage and AI code under core; Vittaz's planned async repository and package boundaries govern the port.

S1 is still local work in progress: the interrupted response did not leave the replacement CI workflow in the working tree, and foundation contracts must be rerun after CI is restored. No completed step, green CI, authenticated push or PR is claimed. The user authorized continued local work, but no approval gate is waived.

## Foundation implementation — 2026-11-04

- Use Node 24.22.2 LTS (within the plan's Node 20-or-newer allowance), because current Vitest does not support the inherited Node 20 runtime.
- Apply a tested, pinned minimatch 11.0.1 override to resolve the current tooling advisory without weakening npm audit. Six bootstrap/configuration tests now cover the foundation. A clean-build failure caused by stale incremental metadata was reproduced; force reference builds to regenerate all distributable output in ephemeral sandboxes.
- Preserve existing apps/cli and the inert mobile scaffold; do not write UI, relocate packages or choose a license during S1. Record the CLI-location proposal for later resolution. The reference is external and reproducible from its pinned public revision.
- The privacy CI job is explicitly a bootstrap placeholder until S11-S16; it is not a G2 sign-off. Live-provider tests and release CD are deferred until their actual CLI/provider steps, not fabricated now.
- Latest owner instruction authorizes autonomous continuation. Nevertheless do not merge the PR or open canvas before the required sign-off.
