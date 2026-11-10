# Vittaz build plan

Companion to the documents in `docs/`. When this file and `docs/` disagree, record it in `DECISIONS.md` and ask.
Read this file after `AGENTS.md` and before touching anything.

---

## 1. Rules every agent follows

1. **TDD, always.** Red, green, refactor. No production code without a failing test written first. Commit the failing test on its own when practical.
2. **One step at a time.** A step is finished only when its tests pass locally, CI is green, `STATE.md` is updated and the work is pushed. Never add several modules in one commit.
3. **The reference engine is read-only.** It lives in `reference/` (from the E2B zip). Bring its logic in module by module through failing tests. Do not copy the whole zip in.
4. **`packages/core` keeps its structure and behavior.** Keep the directory layout, public exports and behavior of the reference core. All 31 original checks must stay green. Change something only when a failing test or a written reason in `DECISIONS.md` requires it.
5. **snake_case names.** AI tool names, CLI JSON output keys, database columns and test ids use snake_case. TypeScript identifiers keep normal camelCase and PascalCase.
6. **Docs before code.** Before using any library, API or service, read its current official docs on the web. Record the URL, version and date in `docs/references.md`. Pin the version. Never guess an API from memory.
7. **Synthetic data only.** No real transactions, names, bank messages, keys or Excel files in the repo, tests, logs or prompts.
8. **No real keys in tests.** Unit tests use the fake provider. Live AI tests use Kilo keyless routes only (section 9).
9. **Privacy tests are blockers.** If a layer 2 test fails, stop and fix it before anything else.
10. **The AI never writes to the database.** The AI can only call `propose_transaction`. Approve, reject and undo are user actions and are never exposed as AI tools.
11. **Backend and CLI first.** Do not open `canvas/screens.zip` (the HTML screens) and do not write UI until gate G3 passes. After G3, wire screens in vertical slices and animate last.
12. **Push after every green step.** Sandboxes are temporary. Anything not pushed is lost.
13. **Do not build what is not in this plan.** If a step seems to need extra scope, write a proposal in `DECISIONS.md` and continue with the planned work.

## 2. Roles

| Who                  | Does what                                                        |
| -------------------- | ---------------------------------------------------------------- |
| Local agent          | Creates the plain repo: docs and config only, no code (step S0). |
| E2B agent            | All code from S1 through gate G3.                                |
| You, with your phone | Phase I device tests and every gate sign-off.                    |
| UI agent             | Phase J, only after G3.                                          |

## 3. Target repo layout

```
vittaz/
  AGENTS.md  Plan.md  STATE.md  DECISIONS.md  README.md
  docs/
    PRODUCT.md  ARCHITECTURE.md  FEATURES.md  DATA_MODEL.md  PRIVACY.md
    ASSISTANT.md  AGENT_POLICY.md  TELEGRAM.md  CONNECTORS.md  TESTING.md
    ROADMAP.md  CONTRIBUTING.md
    references.md  device_tests.md  reference_inventory.md  mutation_checks.md
  reference/            read-only reference engine (not in workspaces, not in CI)
  canvas/screens.zip     UI prototype. Do not open before G3.
  packages/
    core/               pure TypeScript logic and ports, no UI, no LangChain
    storage/            SQLite schema, migrations, Drizzle repositories
    agent/              AssistantService, providers, key fallback, tools, LangChain
    connectors/telegram/ Telegram channel connector
    cli/                command-line wrapper around the packages above
  apps/mobile/          created in phase I
  tests/fixtures/       synthetic data generators
  .github/workflows/ci.yml
```

## 4. Tooling decisions

Confirm each against current docs before first use (rule 6).

| Need            | Choice                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript, strict mode                                                                                                                               |
| Runtime         | Node 20 LTS or newer. Bun is optional later.                                                                                                          |
| Workspaces      | npm workspaces                                                                                                                                        |
| Tests           | Vitest                                                                                                                                                |
| Lint and format | ESLint and Prettier                                                                                                                                   |
| Database        | SQLite with Drizzle ORM behind **async** repository interfaces defined in core. `better-sqlite3` for Node tests and the CLI, `expo-sqlite` on mobile. |
| Validation      | Zod                                                                                                                                                   |
| Agent layer     | LangChain, only inside `packages/agent`, behind an interface                                                                                          |
| CLI             | `commander` or `citty`                                                                                                                                |
| Excel import    | `exceljs` or SheetJS. Check license and docs first.                                                                                                   |

## 5. Definition of done for every step

- A failing test existed first, and it now passes.
- All earlier tests still pass.
- Lint, typecheck and tests pass locally and in CI.
- New library use is recorded in `docs/references.md`.
- Any deviation from this plan is in `DECISIONS.md`.
- `STATE.md` shows the step checked and the next step named.
- Work is committed and pushed.

## 6. Steps and gates

### Phase A: bootstrap (local agent)

- [ ] **S0. Plain repo.** Create the repo with documentation and config only. No source code. Include `AGENTS.md`, this file, `STATE.md`, `DECISIONS.md`, `README.md`, `.gitignore`, everything in `docs/`, and the two zips in `reference/` and `canvas/`. Add no `LICENSE` file until the license is chosen. Push to GitHub.

### Phase B: foundation (E2B agent)

- [x] **S1. Workspace and CI.** Set up npm workspaces, TypeScript, Vitest, ESLint and Prettier. Add one trivial test (red, then green). Add `.github/workflows/ci.yml` (section 10). CI must be green on push.
- [x] **S2. Reference inventory.** Read `reference/` without importing anything. Write `docs/reference_inventory.md` mapping each of the 31 checks to a target test file in this repo.

### Phase C: core logic, ported by TDD

For each step: write the failing test from the inventory, implement, pass, refactor, push.

- [x] **S3. Money.** Integer paise only. Reject floats, `NaN` and `-0`. String rupee parser without float drift.
- [x] **S4. Repository ports, storage and migrations.** Async repository interfaces in core. SQLite schema and Drizzle repositories in `packages/storage`. Migrations from empty and from the previous version, safe to run twice. The reference engine is synchronous, so adapt its tests to the async interface instead of copying its database code.
- [x] **S5. Transactions and status.** `unverified`, `ai_checked`, `user_confirmed`, forward only. Manual entries start as `user_confirmed`. Columns include `benefit_paise`, `tag` and `source` (with `import`).
- [x] **S6. Approval queue.** A proposal writes no transaction. Approve commits one. Reject commits none. Approving twice commits once.
- [x] **S7. Audit log and undo.** One audit row per approved write. Undo restores the previous state exactly.
- [x] **S8. Accounts and wallet.** Cash and UPI or bank accounts. Cash in hand equals opening balance plus cash in minus cash out.
- [x] **S9. Backup and restore.** Checksummed backup. Restore reproduces the ledger exactly. Add a backup-encryption decision to `DECISIONS.md`.
- [x] **S10. Allowance math.** Budget minus spent minus bills due, divided by days left. Test month ends, leap year and overspending. Use an injectable clock and Indian time zone.

**Gate G1:** all layer 1 equivalents are green in CI.

### Phase D: privacy

- [x] **S11. Sensitive filter.** OTP, PIN, CVV, password and "do not share" drop the message with no trace anywhere.
- [x] **S12. Name replacement.** Exact match, longest name first, stable `Person_N` placeholders, reversible on the reply.
- [x] **S13. Scrubber.** Remove UPI references, VPA handles and account numbers from anything sent out.
- [x] **S14. Safe logger and crash reporter.** Keys, tokens and names never appear.
- [x] **S15. Adversarial name tests.** Lowercase, Hinglish (`aman ko 450 diye`), Devanagari names, nicknames, typos, names inside notes. Fix real leaks. Record limits in `DECISIONS.md`.
- [x] **S16. Privacy gate in CI.** The privacy job must pass before any later job runs.

**Gate G2:** every privacy test is green, including S15.

### Phase E: ingestion

- [x] **S17. Notification parser.** Allowlist, sensitive-word drop, promo rejection, debit and credit, masked accounts, failed and reversed payments, post time as timestamp.
- [x] **S18. Deduplication.** One payment from a bank SMS and an app alert becomes one entry. Match on reference, or on amount plus time window.
- [x] **S19. Excel importer.** Dry run, idempotent re-import by row hash, `benefit_paise` and `tag` mapping, clear per-row errors. Fixtures are synthetic.

### Phase F: AI layer (`packages/agent`)

- [x] **S20. Fake provider server.** An OpenAI-compatible fake with streaming and scripted failures. Test helper only.
- [x] **S21. Provider adapter and key fallback.** 400 never falls back. 401 disables the key. 429 skips it for a while. A broken stream restarts on the next key. All keys failing gives one clear error.
- [x] **S22. Tool registry.** snake_case tools (section 7) with Zod validation. Malformed calls never reach the database.
- [x] **S23. Read-only Q&A loop.** Step limit, token budget and timeout. Read-only tools. Database in read-only mode.
- [x] **S24. Analytics log.** Provider, model, key nickname, tokens, latency and cost estimate. Never prompt or reply text.
- [x] **S25. LangChain adapter.** Implement the agent interface with LangChain. Read the current docs first. Core must not import it.
- [x] **S26. Local-model interfaces.** `parse_entry` and `improve_note` behind interfaces, with fakes. Real local models come in phase I.
- [x] **S27. Live smoke tests.** Tagged `@live`, Kilo keyless routes only (section 9).
- [x] **S27a. Conversations and messages.** Tables, repositories and use cases. Each message has a `source` (`app`, `cli`, `telegram`) and a conversation id.
- [x] **S27b. Preferences.** Tone, language and detail, stored and added to the assistant context.
- [x] **S27c. Custom rules.** Validated structured rules. Message conditions are enforced in code before the assistant.
- [x] **S27d. AssistantService.** The port in core and the implementation in `packages/agent`, using the tool registry. One service for app, CLI and Telegram.
- [x] **S27e. Agent policy tests.** The acceptance tests in `docs/AGENT_POLICY.md`, including prompt injection through notifications, imported rows and tool results.

### Phase G: Telegram, headless

- [x] **S28. Telegram connector with a fake API.** Token from secure settings, one-time pairing code, ignore every other chat, sensitive-word drop, messages go to `AssistantService` with source `telegram`, shared history, poller-conflict handling, primary-device flag, and a digest builder for unverified entries and the daily allowance.

### Phase H: CLI and backend sign-off

- [x] **S29. CLI.** Commands for add, ledger, inbox (list, approve, reject), undo, balance, import, backup, restore, and ask. JSON output keys in snake_case.
- [x] **S30. Headless flows.** End-to-end tests for the eight manual flows in the test plan.
- [x] **S31. Mutation spot checks.** Turn off six key rules on purpose (name replacement, sensitive filter, approval, dedupe, key fallback, read-only). Each must make a test fail. Record results in `docs/mutation_checks.md`.
- [x] **S32. Docs complete.** README, `docs/references.md`, `DECISIONS.md` and `docs/device_tests.md` are current.

**Gate G3: backend ready.** All layers 1 to 4 pass in CI, the CLI flows pass, mutation checks pass, docs are complete. You sign off. Only now may anyone open `canvas/screens.zip`.

### Phase I: Android (you and your phone)

- [x] **S33. Environment.** Manual Android proof workflow and owner phone install/open. **Done 2026-11-05:** the blank Expo debug APK built as initial toolchain proof but crashed when paired with the preview bundle (`RNCSafeAreaProvider` mismatch). The matching `s33-preview-standalone-apk` from run `42044273087` was installed; owner reported Vittaz opened and rendered Home. `adb devices` was optional; owner report is acceptance evidence.
- [x] **S34. App shell.** `apps/mobile` imports `packages/core`. **Done 2026-11-06:** owner approved promoting `apps/mobile/ui/native` to `apps/mobile` via `git mv` (history preserved, no visual file changed). Core is reachable from the entrypoint and present in the Android Hermes bundle. Not a root workspace; see `DECISIONS.md`. The demo reducer is still in place — replacing it is S35.
- [x] **S35. SQLite adapter.** The `expo-sqlite` adapter passes the same shared `LedgerStore` contract cases as Node storage; replace native demo reducer/seeded rows with core-backed local state. Chat/quick capture were disabled at the end of S35; the current S36 slice implements read-only Quick-to-Chat. **Merged 2026-11-06:** PR #56 `a533288`; protected checks green; APK run `42215554135` built. The owner's phone test then found `crypto.randomUUID` unavailable in Android Hermes; the manual save failed before insert, so S35 on-device persistence is not accepted. Corrective Expo Crypto runtime injection merged in PR #58 (`e548227`); standalone APK run `42228039226` succeeded on retry. Owner installed the corrected APK and confirmed a synthetic manual entry remained after close/reopen on 2026-11-06; see `docs/device_tests.md`. S35 SQLite basic persistence is owner-accepted. S36 is now unblocked.
- **Add-form clarity follow-up:** Owner-approved Direction/Category labels and subtle divider merged in PR #60 (`ee274c5`). Standalone APK run `42237936656` succeeded; the owner visually confirmed the updated layout looks right on-device on 2026-11-06. Phone model and Android version were not supplied. This is a presentation-only change and does not alter the S35 persistence result.
- [ ] **S36. LangChain check.** Bundle, one tool call, safe answer display, and force-stop/reopen remain the owner/device acceptance checks.
  - **Merged 2026-11-07:** PR #62 (`9a55779`) merged as `10e31794dbec8653b165959104d0bc703c1b578b`; PR CI and main push CI passed. Local validation: root 353 tests / 56 files at 100% coverage; mobile 19 tests / 4 suites plus typecheck/lint/format under Node 24.22.2.
  - Kilo Auto Free read-only chat, optional Expo SecureStore key, and Quick-to-Chat are implemented. Fake SSE, synthetic tool-call, keyless/no-Authorization, secure-key UI, and no-ledger-write tests pass. The UI reveals bounded, validated answer chunks only after the complete provider response passes safety checks; this is not raw live token streaming.
  - Fresh merged-head APK: workflow run `42279488717` on `main` merge commit; Gradle succeeded, 1,411 modules bundled, required native-module assertions passed. APK provenance and hash are in `docs/device_tests.md` and `/home/user/S36-builds/README.md`.
  - Owner confirms run #12 standalone APK failed after clearing data/reinstall on Wi-Fi and mobile data with a blank optional key. PR #67 safe failure categories merged as `0dbacde6eaa56d0d00b55b9d5d43e6b75cff53f6`; required PR and main CI (`42358832997`) / Native (`42358832973`) checks passed. Manual standalone APK run #13 (`42358981476`) succeeded on that commit. The owner confirms the run #13 screenshot shows `KILO_UNKNOWN` twice; the app produced no answer. This is owner-reported UI evidence; no exact exception or device cause is established, and the screenshot shows the composer only with the keyboard closed. Source inspection shows `KILO_UNKNOWN` is the catch-all for several QA/adapter failures and some invalid completion outcomes. A separate anonymous synthetic Gateway probe returned HTTP 200 and a completed SSE stream, which does not validate the app path. S36 acceptance and keyboard-open behavior remain pending.
- [ ] **S37. Device tests.** Run `docs/device_tests.md`: persistence, Keystore, local model and benchmark, Telegram service, voice, OCR.

**Gate G4:** device tests pass for SQLite, secure storage, Telegram and the local model.

### Phase L: diagnostics test build

- [ ] **S38. Android diagnostics test build.** Owner-requested diagnostics to investigate the unresolved S36 `KILO_UNKNOWN` failure. Add a conspicuously TEST ONLY, separately installable Android build; structured, high-detail stage/result logs; an in-app log viewer and explicit save-to-Downloads button under `Vittaz-Diagnostics`; and a descriptive manual APK workflow. Use synthetic data only. Log only allowlisted operational metadata (stages, static reason codes, provider kind, HTTP status, elapsed time and tool name). Never log prompts/replies, ledger content, API keys/tokens, raw URLs, provider bodies, or exception text/stack traces. Diagnostics are disabled in ordinary builds. The test build must not replace the personal app. Replace the obsolete active S33 preview workflow name/file with a descriptive diagnostics workflow; retain historical evidence only in docs. Record and follow the current official Expo FileSystem/SAF references; SDK 58 SAF docs are now in `docs/references.md`. Pass app privacy tests, tests asserting `KILO_UNKNOWN` resolves to a specific safe stage/category where possible, native build/export checks, and owner-only device retest before claiming a cause.
  - [x] Implement bounded allowlisted mobile/agent stage logs; add TEST ONLY banner, safe in-app event viewer, and explicit Downloads/Vittaz-Diagnostics export; use synthetic test inputs.
  - [x] Tests: full root suite 359/359, all mobile tests 46/46, root/mobile TypeScript checks, root privacy gate, and 24 workflow/promotion tests pass; generic provider failures report fixed safe reason/stage without exception text.
  - [x] Android JavaScript export contains the test banner/export button; temp Expo prebuild confirms test label, distinct `com.vittaz.diagnostics.test` package ID, and `expo-file-system` autolinking.
  - [x] Owner selected the actual Vittaz app workflow; replaced it with `.github/workflows/mobile-diagnostics-test-apk.yml` and left the unrelated blank Expo proof workflow unchanged. All 24 workflow/promotion regression tests pass.
  - [ ] Run the manual workflow and deliver the standalone APK. Local runner lacks JDK 17/Android SDK/ADB (only JDK 11 present), so no Gradle/APK run is available here.
  - [ ] Owner device retest with synthetic data; validate SAF Downloads permission, folder creation, and saved JSON. Do not claim a root cause until device evidence identifies one.

### Phase J: UI and UX (only after G3)

Open `canvas/screens.zip`. The HTML screens are the visual specification: reuse their layout, styling and assets. Wire them to the working backend in vertical slices, each with component tests:

1. Manual entry, Ledger, Inbox and Review. The app is useful without AI, so this slice comes first.
2. Assistant chat, with tool-call steps and the model picker.
3. Telegram settings and pairing.
4. Home, Settings, Onboarding and the remaining screens.
5. Animation and polish, last, once real loading, empty and error states exist.

### Phase K: later

Voice, OCR, notification listener in Kotlin, local model catalog with download and benchmark, analytics screen, daily report, desktop wrapper, merchant mode.

## 7. AI tool catalog (snake_case)

| Tool                  | Access                          | Purpose                                              |
| --------------------- | ------------------------------- | ---------------------------------------------------- |
| `propose_transaction` | creates a pending proposal only | Draft an entry for approval.                         |
| `find_person`         | read-only                       | Look up a counterparty by name.                      |
| `query_transactions`  | read-only                       | Filter by date, category, account, person or status. |
| `get_balance`         | read-only                       | Cash and account balances, receivable and payable.   |
| `get_month_summary`   | read-only                       | Spent, received and totals for a month.              |
| `check_unverified`    | read-only                       | List entries still waiting for confirmation.         |

Local-model tasks, not tools: `parse_entry`, `improve_note`.

User-only actions, never exposed to the AI: `approve_proposal`, `reject_proposal`, `undo_audit_entry`, `import_excel`, `create_backup`, `restore_backup`.

## 8. TDD protocol

1. Pick the next unchecked step.
2. Write the test first and run it. Confirm it fails for the right reason.
3. Write the smallest code that passes it.
4. Refactor with the tests green.
5. Run the full suite, lint and typecheck.
6. Update docs, `STATE.md` and `DECISIONS.md`. Commit and push.

## 9. Live AI tests with Kilo keyless models

- Purpose: confirm the provider adapter works against a real OpenAI-compatible service without any key.
- Kilo's official Gateway docs checked 2026-11-06 list `kilo-auto/free` as a keyless route, currently rate-limited to 200 requests/hour/IP; unlike some Kilo routes, this model ID does not end in `:free`. Re-check the official model catalog and limits before any future live test because the free pool and policy can change.
- Tag these tests `@live`. They never run in the normal CI job and never block a merge.
- Use synthetic prompts only. A free public endpoint may log what it receives.
- Assert on the shape of the reply (valid response, valid tool call JSON), not on its wording.
- Add a rate-limit guard so the suite stops cleanly when it is throttled.

## 10. CI/CD on GitHub

Runs on every push and every pull request.

1. **lint and typecheck.**
2. **privacy.** Layer 2 tests. Later jobs need this one.
3. **test.** Layers 1, 3 and 4, with coverage.
4. **security.** `npm audit` and a secret scan (for example gitleaks).
5. **build.** Build `packages/cli`.
6. **live (manual or nightly).** The `@live` tests, allowed to fail.

Rules: pin actions to a commit SHA, use minimal workflow permissions, cache dependencies, protect `main` so it needs green CI.

CD: on a version tag, build the CLI and attach it to a GitHub release. Add the Android APK build in phase I.

## 11. Handoff and `STATE.md`

`STATE.md` is how agents hand work to each other. Update it at the end of every session.

```
current_step: S7
last_green_commit: <sha>
gate_status: G1 pending
blocked_on: nothing
next_actions: <the next one or two things>
notes: <anything the next agent must know>
```

## 12. Gates

| Gate | Meaning                                | Who signs off |
| ---- | -------------------------------------- | ------------- |
| G1   | Core logic green                       | You           |
| G2   | Privacy green                          | You           |
| G3   | Backend and CLI ready, canvas may open | You           |
| G4   | Device tests pass                      | You           |

## 13. Open decisions

- License. Undecided, so no license file yet.
- Backup encryption and key recovery.
- Which local model and size ship first.
- Whether to keep LangChain after the S36 phone check.

## 14. Deferred, not in this plan

Gmail, WhatsApp, Discord, MCP server and client, automatic long-term memory, voice, OCR, and the notification listener beyond its parser. Each needs its own step list when its time comes. Future connector tools such as `gmail_search_messages` are documented in `docs/CONNECTORS.md` and are not to be built now.

## 15. Native BYOK provider extensions (owner-approved scope)

S36 remains pending: the owner-confirmed run #13 screenshot reports two
`KILO_UNKNOWN` failures, with no established root cause or successful device
acceptance. Continue to report this separately; provider additions must not be
represented as fixing that failure.

- [x] **S37a. OpenAI-compatible BYOK route.** Add an explicitly user-selected
      OpenAI-compatible endpoint/model/key profile to native read-only chat.
      Preserve Kilo Auto Free as a separate optional keyless route. Keep keys in
      Expo SecureStore only; use synthetic credentials and fake-provider tests.
      Reuse the existing bounded QA loop and provider adapter; no AI database
      writes, no silent provider fallback, no bundled/default API key.
- [x] **S37b. Anthropic API-key BYOK route.** Add direct Anthropic Messages API
      requests and tool-use translation through the same bounded read-only QA
      behavior. Use only a user-supplied Anthropic API key in Expo SecureStore.
      Do not implement Claude subscription/OAuth login or collect subscription
      credentials. Test with fake HTTP/SSE responses only. PR #70 checks passed
      on `250f0453d8cf8851a76c4e5820b929d736afa518`; PR remains open pending owner
      merge authorization. No APK/device test or live provider request was run.
- [x] **S37c. Native provider disclosure and selection checks.** Verify the
      chosen route is visible, provider-specific credential removal works, prompts
      are disclosed as leaving the device, and provider failures never mutate the
      ledger. No real keys or personal prompts. **Verified 2026-11-08** on branch
      `feat/s37c-provider-disclosure-checks`: a dedicated shell audit suite asserts,
      for Kilo/OpenAI-compatible/Anthropic, that the selected route label is visible
      in chat and the provider-specific "leaves this device" disclosure is shown;
      that removing a provider's key keeps the selection (Anthropic added; Kilo and
      OpenAI-compatible already covered); and that a provider failure shows safe
      static copy and creates zero transactions or proposals. Mobile 62 tests pass;
      typecheck/lint/format, privacy gate, and secret scan pass. No real keys, live
      provider call, APK, or device run; S37d device verification remains owner-only.
- [ ] **S37d. Device verification.** After a successful test APK is delivered,
      ask the owner to test each available route with synthetic prompts. Record
      owner-reported evidence separately from agent-observed build/test evidence.

## 16. Owner device-feedback follow-up (owner-approved 2026-11-09)

- [x] **S38a. Chat correctness and visible progress.** Trusted current date/month context, human-readable money/status presentation, live tool progress, and progressive validated answer reveal. No raw provider deltas; no ledger mutation change.
- [x] **S38b. Local chat history.** Persist and restore recent app conversations on device; send only a bounded recent window through the existing privacy filters. No automatic long-term memory.
- [x] **S38c. Multi-key provider manager.** Multiple labeled BYOK profiles, explicit active selection, fetched model choices with manual fallback, and user-controlled show/hide/copy/paste/remove. Keys remain in SecureStore.
- [x] **S38d. Device verification build.** Build the diagnostics APK from the merged fixes and record owner-reported results separately from agent build/test evidence. APK delivered 2026-11-09 (run 42571222498); owner device results still pending.

## 17. Owner-requested assistant workspace

- [x] **S39a. Conversation history.** Add a local conversation list with new,
      reopen and delete actions. Migrate the existing single saved chat without
      losing valid messages. Preserve sensitive-message filtering and bound the
      context sent to the selected provider to the current conversation only.
      Handle switching or deletion while a response is in flight safely.
- [ ] **S39b. Accessible chat navigation.** Provide a consistent + entry point
      on main screens that opens the existing add-or-ask flow, and make the
      message option open chat directly. Add an accessible assistant menu for
      history, instructions and connectors without obscuring the composer.
- [ ] **S39c. Custom instructions.** Let the user view, edit, save and clear
      local instructions, disclose when they are sent to the selected provider,
      apply the existing privacy checks, and ensure they cannot change tool
      permissions or override the read-only and user-approval boundaries.
- [ ] **S39d. Connector entry.** Provide a clearly labelled connectors screen
      that accurately describes what is available in the mobile app. Do not
      imply an external service is connected or operational when it is not.
      Actual integrations require separately scoped permissions and approval.
- [ ] **S39e. Verification build.** Run the full test and privacy gates, merge
      green changes, and build a diagnostics APK. Record owner device results
      separately from agent build evidence.
