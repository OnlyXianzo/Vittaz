# Verified references

Checked on 2026-11-04. Exact direct dependency versions are pinned in package.json; transitive resolutions and integrity hashes are in package-lock.json. Only tooling used in local S1 preparation is listed; no AI service has been used.

| Component                | Selected version                                  | Official documentation                                                                                  | Verification                                                                                                             |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node.js                  | 24.22.2                                           | https://nodejs.org/en/about/previous-releases                                                           | Supported LTS; downloaded official Linux archive and checked against https://nodejs.org/dist/v24.22.2/SHASUMS256.txt     |
| npm                      | 11.19.1 (bundled with Node)                       | https://docs.npmjs.com/cli/v10/using-npm/workspaces ; https://docs.npmjs.com/cli/v11/commands/npm-audit | Workspace linking verified by clean install and real CLI execution; audit threshold behavior reviewed                    |
| TypeScript               | 5.9.3                                             | https://www.typescriptlang.org/docs/handbook/project-references.html                                    | Keep existing compiler version; project-reference builds and separate source/test no-emit checking                       |
| Node type declarations   | 24.19.2                                           | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node                               | Match selected runtime major; exact version confirmed through npm registry                                               |
| Vitest                   | 5.1.0                                             | https://vitest.dev/guide/                                                                               | Official current docs and npm engine metadata agree Node 20 is unsupported                                               |
| V8 coverage              | 5.1.0                                             | https://vitest.dev/guide/coverage.html                                                                  | Explicit provider dependency, include uncovered source, matching Vitest version                                          |
| ESLint                   | 10.14.0                                           | https://eslint.org/docs/latest/use/configure/configuration-files                                        | Current flat config; initial 9.39.5 candidate deprecated, replaced before completion                                     |
| ESLint JavaScript config | 10.0.1                                            | https://eslint.org/docs/latest/use/configure/configuration-files                                        | Recommended rules through official config package                                                                        |
| typescript-eslint        | 8.72.1                                            | https://typescript-eslint.io/getting-started/                                                           | Registry peer dependencies support ESLint 10 and TypeScript 5.9.3                                                        |
| Prettier                 | 3.9.10                                            | https://prettier.io/docs/install                                                                        | Exact local installation and separate check command                                                                      |
| checkout action          | v4.3.1 / 34e114876b0b11c390a56381ad16ebd13914f8d5 | https://github.com/actions/checkout/tree/v4.3.1                                                         | Tag resolved using git ls-remote; credentials persistence disabled                                                       |
| setup-node action        | v4.4.0 / 49933ea5288caeca8642d1e84afbd3f7d6820020 | https://github.com/actions/setup-node/tree/v4.4.0                                                       | Tag resolved using git ls-remote; node-version-file and npm cache                                                        |
| Workflow security        | hosted service, unversioned                       | https://docs.github.com/en/actions/reference/security/secure-use                                        | Minimal contents read permission and SHA pins                                                                            |
| Existing secret scanner  | repository revision 2fb5f92                       | ../.agents/skills/secret-scan/SKILL.md                                                                  | Existing Python standard-library scanner; no new service or dependency; working tree and complete local Git history scan |

## Security findings and resolution

- Removed unused Zod 3 dependency, which had a high-severity advisory in the inherited lockfile. No core imports used it. Reintroduce validation at its planned step only after documentation and version review.
- Initial `npm audit` reported 11 moderate findings from one minimatch advisory propagated through ESLint/typescript-eslint dev tooling. Official advisory: https://github.com/advisories/GHSA-g3hv-75wg-m249 (published 2026-10-27). Patched minimatch is 11.0.1, while tooling still depends on earlier majors. Do not force a cross-major override or downgrade ESLint to npm's suggested obsolete 4.0.0 without compatibility research and tests. Security is not clean, and S1 is not complete.

## Reference engine supplied by the owner

- Source: https://github.com/OnlyXianzo/khataclaw-typescript
- Pinned revision: `b21801c3755f4da4ba4075782c45621d42a3c34c`.
- Retrieved: 2026-11-04.
- Local checkout: `reference/khataclaw-typescript/` (external, ignored by the Vittaz repository; not a workspace or CI dependency).
- Reproduce: `git clone https://github.com/OnlyXianzo/khataclaw-typescript.git reference/khataclaw-typescript`, then check out the pinned revision.
- Inspection confirmed 31 baseline test declarations: environment 4, core 8, privacy 6, parsers 6, agent 6, headless flows 1. Two extra suites contain 10 more checks.
- The upstream execution report claims 41/41 passing. That is historical evidence, not a fresh test run in this sandbox. No dependencies were installed and no reference runner was executed; its runner writes test-results.json, so future baseline execution must use a disposable copy rather than mutate this read-only checkout.
- The database interface is synchronous and exposes SQL. Adapt behavior to Vittaz async repositories, keep storage and agent implementations outside framework-free core, and inventory each baseline check at S2. Do not import this package wholesale.
- Reference working tree was clean after inspection. No license file appears in its tracked file list; do not assume general reuse permission or add a license.

### Tooling security fix verified

- Exact root override: minimatch 11.0.1. Official npm override API: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides ; maintainer patch: https://github.com/isaacs/minimatch/releases/tag/v11.0.1 . Checked 2026-11-04.
- After reviewing CommonJS/ESM exports and installed consumer call sites, a failing lockfile test confirmed the vulnerable versions, then the override removed them. Clean npm ci, ESLint, TypeScript and Vitest passed; npm audit reports zero vulnerabilities. This supersedes the unresolved finding above. Remove the temporary override once upstream toolchains adopt the fix.

## Money and repository governance references (2026-11-04)

- ECMAScript safe integers / BigInt, language built-ins (no third-party dependency): https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.issafeinteger ; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt ; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER . Runtime remains pinned Node 24.22.2 and TypeScript 5.9.3. Reference behavior independently checked in the pinned reference money module and Layer 1.1 assertions.
- GitHub rulesets REST API, version 2022-11-28: https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28 . Read creation schema, pull_request parameters, required_status_checks and active branch-rule verification before applying. Ruleset id 26531429 created and active on main.
- GitHub PR reviews REST API, version 2022-11-28: https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28 . Used to inspect reviews; no approval or reviewer identity is fabricated.
- CodeRabbit hosted review service, unversioned: https://docs.coderabbit.ai/guides/commands . Observed installed bot/check in the PR; review command available if needed. Require its check and resolve findings before merge.

### Review remediation APIs (2026-11-04)

- Vitest 5.1.0 full-name pattern selection: https://vitest.dev/config/testnamepattern . CLI filter must include both privacy selection and @live exclusion.
- GitHub REST pull requests and merge API: https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request . Use expected head SHA to avoid merging an untested concurrent update.
- GitHub GraphQL pull-request review threads: https://docs.github.com/en/graphql/reference/pulls . Use thread IDs obtained from the live query; never invent them or resolve unfixed findings.

### Python-free development scanner — 2026-11-04

- Node **24.22.2**, https://nodejs.org/docs/latest-v24.x/api/typescript.html : native erasable TypeScript, no runtime transpiler required.
- Node **24.22.2**, https://nodejs.org/docs/latest-v24.x/api/child_process.html : shell-free spawnSync argument lists, maxBuffer and failure status.
- Git CLI (environment version recorded by `git --version`), https://git-scm.com/docs/git-ls-files : cached/others/exclude-standard and NUL-delimited paths.
- Existing independent review 5768766230 and scanner source cross-check redaction and detector parity; no new library installed.

### S4 SQLite storage — 2026-11-04

- https://orm.drizzle.team/docs/get-started-sqlite and https://orm.drizzle.team/docs/transactions — current website advertises RC; use pinned stable drizzle-orm **0.45.4** only after checking installed source.
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md — **13.0.3**: synchronous transaction callbacks cannot await; manual transactions allowed, do not mix with wrapper.
- https://www.sqlite.org/lang_transaction.html — explicit transaction lifecycle; failed COMMIT may remain active; rollback required on error.
- https://www.sqlite.org/stricttables.html — STRICT >=3.37, still allows lossless coercion; explicit range constraints required.
- **@types/better-sqlite3 9.6.0**; installed package declarations verify prepared statements and pragma signatures. Reference b21801c migrations/tests cross-check preservation requirements.

Pinned-source cross-check: installed `drizzle-orm/better-sqlite3/driver.d.ts`
accepts a native client; session.js delegates transaction callbacks directly to
better-sqlite3. Installed better-sqlite3 **13.0.3** ships N-API prebuilds inside
the npm package (`gypfile: false`, no install script); no separate prebuild-install
command exists or is needed. Native in-memory smoke query succeeded without any
Python/build step. This supersedes older-driver installation assumptions.

### S4 async repository adapter — 2026-11-04

- Node **24.22.2**, https://nodejs.org/docs/latest-v24.x/api/async_context.html — AsyncLocalStorage.run/getStore for per-store reentrancy detection, isolated to Node adapter.
- Drizzle **0.45.4**, https://orm.drizzle.team/docs/insert and https://orm.drizzle.team/docs/select — parameterized values and eq selectors; installed stable driver/session source cross-checked.
- https://orm.drizzle.team/docs/sql-schema-declaration — explicit SQLite table mappings; existing SQL migrations remain authoritative for constraints (no Drizzle-Kit generation used).

- Vitest **5.1.0**, https://vitest.dev/config/alias (2026-11-04): test aliases resolve source imports without requiring compiled workspace outputs. Clean CI caught core package resolution masked by local dist files; reproduced after deleting dist, fixed with an explicit core-source alias, no early build or privacy-job bypass.

### S5 runtime capabilities — 2026-11-04

- https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID — Web Crypto v4 UUID; Node 24 supports it. Default runtime uses global Crypto, not node:crypto. Mobile supplies an injected ID/clock implementation; device support is not presumed.
- Reference b21801c `ledger/ledger.ts` manual/capture/status and baseline_1_4, cross-checked with Plan.md S5 and atomic SQLite unit-of-work tests. No new packages.

### S9 validated backup — 2026-11-04

- Zod **4.6.7**, https://zod.dev/api — strictObject, safeParse, literals/enums, bounded integer number and refinement schemas; installed source/types cross-check.
- Node **24.22.2**, https://nodejs.org/docs/latest-v24.x/api/crypto.html — createHash('sha256').update(payload).digest('hex'), isolated to Node storage, not core.
- Reference b21801c backup.ts and baseline_1_7 — deterministic five-table snapshot, allowlisted send_notes_to_cloud, checksum rejection and atomic restore.

- https://zod.dev/basics (4.6.7, 2026-11-04): safeParse produces a typed deep clone after validation; use the parsed data rather than pretending a raw audit entity_type:string is already narrowed to 'transaction'. Node snapshot export is intentionally unknown until validated. No unsafe audit-row narrowing cast retained.

### S10 allowance/time — 2026-11-04

- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat — explicit timeZone and formatToParts for injected-clock India dates; runtime Node24.22.2.
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC — 0-99 year remapping; avoid by Gregorian month/leap arithmetic.
- Reference b21801c allowance.ts/baseline_1_8 cross-checks hand-worked results; existing BigInt safe money boundaries also apply to intermediate disposable output.

### S11 sensitive ingress — 2026-11-04

- MDN String.normalize: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize — NFKC compatibility form, temporary detection copy; native ECMAScript on Node **24.22.2**, no library added.
- MDN Unicode property escapes: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape — use `u`, letters/marks/numbers rather than ASCII-only word boundaries; native ECMAScript on Node **24.22.2**.
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html — treat input as untrusted; exclude authentication secrets and private payloads from diagnostics. Rolling guidance retrieved 2026-11-04.
- Read-only reference b21801c `privacy/sensitiveFilter.ts`, `tests/layer2.privacy.test.ts:205-251`, plus Plan S11 and docs/PRIVACY: future actual entry-point zero-trace remains an integration requirement, not inferred from unit tests.

### S12 replacement — 2026-11-04

- MDN String.replace https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace — global regex and callback return literal values (no replacement-token expansion). Native ECMAScript, Node24.22.2; no package.
- MDN normalize/Unicode property escapes (S11 URLs above), reference b21801c privacy/redactor.ts and layer2.privacy.test.ts:173-203 — longest-first exact matching, stable canonical mappings and Person_10 versus Person_1. Persistence/provider proof is not included in this pure step.

### S13 identifiers — 2026-11-04

- OWASP Logging Cheat Sheet, Data to exclude: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html — account/payment-card/telephone identifiers must not be raw diagnostics/outbound context. Rolling guidance fetched 2026-11-04.
- MDN String.normalize / String.replace / Unicode property escapes (S11-S12 URLs): compatibility normalization is appropriate for detection but may alter display; sanitize outbound copies only. Native Node24.22.2.
- Read-only reference b21801c privacy/redactor.ts:224-275 + layer2.privacy.test.ts:107-171: identifier patterns and ordering; longer/grouped numeric identifiers are conservatively removed rather than leaked or truncated. No package added.

### S14 diagnostics — 2026-11-04

- OWASP Logging Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html — data exclusions, validation of untrusted event data and resource bounds. Retrieved data-to-exclude/verification sections; rolling guidance.
- Reference b21801c privacy/safeTelemetry.ts + layer2.privacy.test.ts:253-307 compared with docs/PRIVACY: structural regex sanitization does not cover unknown names; use a fixed diagnostic codebook and omit arbitrary data instead. Native TypeScript5.9.3 / Node24.22.2; no library or remote crash reporter added.

### S15 adversarial Unicode — 2026-11-04

- Unicode UTS39 **revision34, Unicode18.0.0**, published2026-08-27: https://www.unicode.org/reports/tr39/ — normalization is not general confusable/name detection. No conformance claim or Unicode data dependency added.
- MDN normalize/Unicode property escapes (above) and read-only reference b21801c extra.nameLeak.test.ts / extra.hinglish.test.ts: known casing/possessives, cold-start clear payment constructions and matra safety. Node24.22.2 native APIs; future provider/Expo parity remains unproved.

### S16 CI evidence — 2026-11-04

- Vitest **5.1.0** https://vitest.dev/guide/reporters.html — JSON reporter defaults to file output; outputFile CLI option documented. Installed probe confirms passed/failed totals, success, testResults/assertionResults and no numRuntimeErrorTestSuites field.
- Node **24.22.2** https://nodejs.org/docs/latest-v24.x/api/child_process.html — spawnSync argument array, status, timeout/maxBuffer; existing Node fs/os APIs provide fresh temporary report directory with guaranteed cleanup. Native erasable TypeScript runner, no dependency.

### S17 notifications — 2026-11-04

- Android StatusBarNotification **API18+**, https://developer.android.com/reference/android/service/notification/StatusBarNotification#getPostTime() — posting time is System.currentTimeMillis time and may differ from Notification.when; docs updated2026-08-03. No Android library/device implementation added.
- MDN Date.parse https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse — nonstandard formats implementation-dependent; accept explicit ISO-Z or safe epoch only. Native Node24.22.2; device parity unproved.
- Drizzle **0.45.4** https://orm.drizzle.team/docs/sql-schema-declaration — typed mapping for existing SQLite table, snake_case SQL keys; current docs cross-checked installed stable source and existing adapters. No new dependency/migration.
- Read-only reference b21801c notificationParser.ts and layer3.parsers.test.ts baselines3.1-3.4; OWASP Logging/privacy references above: ingress rejects before side effects, unknown formats local only.

### S18 atomic matching — 2026-11-04

- SQLite **3.53.4** https://www.sqlite.org/lang_transaction.html — BEGIN transactions do not nest; IMMEDIATE obtains write transaction before lookup/modify, explicit rollback. Existing Node store serializes awaited units.
- Read-only reference b21801c notificationParser.ts:170-290 / layer3.parsers.test.ts:139-188; cross-check audit/undo contracts: exact reference first, amount+inclusive window fallback, conservative account/source/reference conflicts and audited enrichment documented in DECISIONS. No new dependencies.

### S19 spreadsheet adapter and importer — 2026-11-04

- SheetJS CE **0.20.3** official https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ — CDN versioned tarball authoritative; npm0.18.5 outdated. Pin URL https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz and lock integrity, no warning suppression or native builds.
- https://docs.sheetjs.com/docs/api/parse-options/ — read Uint8Array, raw values, formula/date flags, sheets and sheetRows; no formula evaluation. https://docs.sheetjs.com/docs/api/utilities/array/ — raw array cells, header/blank row handling. Reference b21801c excelImporter.ts and baseline3.6 cross-checked for outputs/idempotence; adapter must preserve physical row numbers instead of compacting blank rows.
- Existing getDaysInMonth and exact decimal paise utilities: reject rolled dates, negative/zero/overprecision numbers; no floating rounding or raw error payloads. Framework-free core uses Web Crypto SHA-256, workbook decoding remains Node storage adapter.

S19 hostile-container follow-up before publication: Node24.22.2
https://nodejs.org/docs/latest-v24.x/api/zlib.html (bounded maxOutputLength and
CRC32, checksum NOT authentication); PKWARE ZIP APPNOTE6.3.10 (2022-11-01),
https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT sections4.3.7-4.3.16.
Cross-check installed SheetJS0.20.3 xlsx.js:2719-2828: central entries lead to
local records, ZIP64 extras can override sizes. Consequently preflight BOTH
headers and extras, bounded-inflate/CRC-check all entries, reject mismatched sizes,
ZIP64/encryption/multidisk/non-store/non-deflate/duplicate or overlapping records.
No hand-rolled decompressor. Lock SRI:
sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==

### S20 fake provider harness — 2026-11-04

Node24.22.2 https://nodejs.org/docs/latest-v24.x/api/http.html and http.json
(createServer/listen/close/closeAllConnections: force-close AFTER close to avoid
race); MDN https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
(SSE text/event-stream, data frames separated by blank lines). Read-only reference
b21801c tests/helpers/fakeOpenAIServer.ts cross-checked for scripted status,
stream/truncation/delay and in-memory captures. No new dependencies, no live API.

### S21 provider protocol/fallback — 2026-11-04

- Current OpenAI Chat Completions spec https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create — POST chat/completions, messages/model, JSON or SSE chunks. Use compatible Chat endpoint, not new Responses API, per reference/Plan; no model-availability assertion or live call.
- Zod **4.6.7** https://zod.dev/api — schemas without coercion, bounded strings/arrays/integers. Reuse installed pinned version in agent only, no core dependency.
- MDN https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After — seconds or HTTP date; https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static — combine caller/deadline; abort does not cancel source timeouts. Node24.22.2 fetch/Web Streams, MDN SSE framing above. Cross-check reference b21801c keyPool/client/layer4.1/4.2, but do NOT port its raw provider error propagation, unbounded buffers, invented usage or DB/logging coupling.

### S22 restricted tool registry — 2026-11-04

Zod4.6.7 https://zod.dev/api and https://zod.dev/json-schema (input JSON Schema,
draft7; runtime refinements remain authoritative). Cross-check Plan7, AGENT_POLICY,
reference b21801c tools.ts/layer4.3/4.5 and existing core createProposal, wallet,
integer sum, redactor contracts. No new dependency. Registry gets explicit
application query/balance/propose function ports, NOT database/repository/SQL
handles. Read-only storage/PRAGMA unit proof remains separate S23 integration.

## S23 (2026-11-04) — bounded Q&A and physical readonly

- https://www.sqlite.org/pragma.html#pragma_query_only — query_only blocks database changes but is reversible by trusted SQL and does not itself make a connection truly readonly. Combine no SQL capability with driver readonly open. High confidence, cross-checked driver docs/actual SQLite tests.
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md — readonly open of existing file; fileMustExist is ignored in readonly mode. No migration on readonly connection. Pinned13.0.3 already installed, SQLite3.53.4; no new dependency/native build.
- https://nodejs.org/docs/latest-v24.x/api/globals.html#class-abortcontroller —24.22.2 AbortController, AbortSignal.any; cancellation cooperative, a race must bound a non-cooperating async adapter. Pending native synchronous SQL cannot be preempted by a JS timer. High confidence for JS async boundary, no hard CPU deadline claim.
- Reference b21801c agentService/layer4.4/4.5: preserve financial read answers and stop semantics, async ports not raw SQL; fail closed on forbidden tools rather than forward private error text. Buffer replies (no unvalidated streaming callbacks). Provider-reported usage budget is a stop control, not a guaranteed billing ceiling.

## S24 (2026-11-04) — metadata-only analytics

- https://orm.drizzle.team/docs/insert — values parameterized automatically; existing pinned0.45.4 SQLite values/run and select/all API cross-checked installed source and repository integration. Latest docs advertise1.0 beta; no upgrade/new dependency.
- https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html — never log access tokens, secrets or sensitive payloads; separate operational telemetry from financial audit. Strong allowlist rather than arbitrary object sanitization. Cross-check existing SafeLogger codebook and reference layer4.6.
- Reference b21801c client estimate/log/layer4.6 — fields and success behavior preserved, raw DB/logger dependency replaced by append-metadata callback. Reference hardcoded default prices are not current verified rates: explicit caller-supplied per-model integer micro-USD/1k rates only, unpriced flagged (not silently free). Synthetic rates in tests are not price claims.

## S25 (2026-11-04) — LangChain controlled adapter

- https://docs.langchain.com/oss/javascript/langchain/models.md and https://reference.langchain.com/javascript/langchain-core/language_models/chat_models/BaseChatModel — native message/model invoke and custom _generate adapter. Registry @langchain/core1.3.4 Node>=20; pin exact, no langchain/LangGraph/provider SDK needed for existing deterministic loop.
- https://docs.langchain.com/langsmith/trace-with-langchain.md — ambient LANGSMITH/LANGCHAIN tracing can capture full inputs/outputs. callbacks:[] alone is not isolation.
- https://reference.langchain.com/javascript/langchain-core/callbacks/manager/CallbackManager and official package https://registry.npmjs.org/@langchain/core/-/core-1.3.4.tgz — pinned manager._configureSync calls copy(), then adds ambient console/tracer/configure-hook handlers before handleChatModelStart. Private subclass copy must preserve no-telemetry manager; addHandler rejects ALL attempted handlers before any payload delivery. Cross-checked installed definitions/source; high confidence at pinned version, regression test on upgrades mandatory.
- Existing S21 protocol validator/fallback and S23 controlled QA loop are authoritative. Reuse them rather than a second autonomous createAgent loop. No core/framework dependency. No cache, outer retries or unvalidated streaming callbacks. Android/Metro compatibility remains phone gate, not a Node test claim.

## S26 (2026-11-04) — local task interfaces, fake driver only

- https://zod.dev/api — existing pinned4.6.7 strict objects, safe integer validation and cloned parsed outputs; cross-checked existing S22 schemas/core money contract.
- https://nodejs.org/docs/latest-v24.x/api/globals.html#static-method-abortsignalanysignals — existing24.22.2 cancellation composition/cooperative signal; reuse S23 findings, bounded async race plus monotonic elapsed check (no CPU preemption claim).
- Plan S26/section7, docs/ASSISTANT.md workflows and reference manualFlows.headless note suggestion: tasks are not AI tools, local names allowed, no direct ledger writes. Reference cloud note improvement is not this local port; full service/consent integration remains S27d, actual local runtime/model/device selection remains phase I. No new model/SDK/heuristic parser/dependency.

## S27 research only (2026-11-04) — not implemented/run yet

- https://kilo.ai/docs/gateway/authentication — official anonymous access for :free models, no Authorization required;200 requests/hour/IP. Do not use keys or third-party proxy routes.
- https://kilo.ai/docs/gateway/api-reference — current official base https://ai-gateway.kilo.ai/api/v1, chat and models endpoints. S21 constructor appends /v1/chat/completions, so its base must be https://ai-gateway.kilo.ai/api (not doubled /v1). Native API supports tool JSON/SSE; doc request examples show max_tokens, actual max_completion_tokens compatibility not yet verified.
- https://kilo.ai/docs/gateway/usage-and-billing — :free pricing zero,429 throttling and provider token usage; public/free data-collection policies mean synthetic prompts only.
- Research GET https://ai-gateway.kilo.ai/api/v1/models returned200 unauthenticated. Six routes ending :free had explicit zero prompt/completion string prices and supported_parameters including tools. This proves catalog discovery only, NOT a live inference/tool/stream test. Catalog rotates; discover again at run time, no hardcoded paid/default route. S27 still unchecked.

Planned safety: separate @live config/manual allowed-failure workflow, excluded from
normal CI; hardcoded official origin/path, redirect:error/no credentials, tiny
request budget and bounded body/time; current :free plus explicit zero pricing and
tool capability; stop immediately on429, never fallback to another/paid route.
Deterministic fake-fetch tests before actual synthetic shape-only smoke. No code
or workflow added by this research checkpoint.

## S27 implementation verification (2026-11-05)

Re-fetched official https://kilo.ai/docs/gateway/authentication and
https://kilo.ai/docs/gateway/api-reference; current official host and anonymous
:free eligibility unchanged. https://vitest.dev/config/include confirms explicit
include replaces defaults and is used for separate live discovery (pinned5.1.0).
No dependency added or changed. Existing exact pinned action SHAs reused.

Actual opt-in `VITTAZ_RUN_KEYLESS_LIVE=1 npm run test:live`: one test PASSED,
not skipped, catalog plus reply plus tool-JSON via actual S21 adapter; three
requests, no authorization, synthetic data, no tool execution. Log
`/home/user/s27-live.log`. Public availability and catalog may change. Native
max_completion_tokens512 was accepted for this run; no max_tokens rewrite or
alternate/paid fallback. This is smoke interoperability proof, not correctness,
privacy certification, production availability or device inference evidence.

## S27a local history (2026-11-05)

- https://www.sqlite.org/foreignkeys.html — per-connection foreign_keys=ON;
  non-null child FK prevents orphan messages; index child lookup columns.
- https://www.sqlite.org/stricttables.html — STRICT enforces storage types, not
  all semantic input policy. Runtime exact shapes/IDs/times/sensitivity remain
  required, SQL adds source/role/body constraints. SQLite3.53.4 retained.
- https://www.sqlite.org/autoinc.html — INTEGER PRIMARY KEY aliases durable ROWID;
  automatic max+1 suffices for this append-only API, no AUTOINCREMENT overhead or
  deletion/cursor-lifetime guarantee claimed. Sequence stays inside SQL.
- https://orm.drizzle.team/docs/select — explicit bound filters/order/limits and
  selected fields; installed0.45.4 remains pinned, no1beta upgrade/dependency added.
- Read-only reference packages searched for conversation/chat_history: no existing
  history module/baseline contract to port. S27a is the approved additive plan step;
  existing ledger migrations1/2 and backup payloadv2 remain compatibility tests.

Tests preserve explicit v1->v2 behavior while adding latest3 migration checks;
future/stale version sentinels now relative to LATEST_SCHEMA_VERSION, including
stale2. No removed original tests, disabled checks, lower thresholds or reference
edits. Missing-module/storage reds, static-driver-leak red, and clock/tie-order red
are saved under /home/user/s27a-*.log. Full226tests36files100% all implemented-source
metrics including both new history modules. No live inference run for this step.

## S27b preferences (2026-11-05)

Re-fetched https://orm.drizzle.team/docs/insert (parameterized values and
onConflictDoUpdate) and https://zod.dev/api (strict optional validation). Existing
Drizzle0.45.4/Zod4.6.7 retained. Core remains dependency-free. Tone neutral/friendly/
formal; language english/hindi/hinglish; detail concise/balanced/detailed. Defaults
neutral/english/balanced, strict complete snapshots, no free-form instructions.
Persistence uses existing serialized app_settings key, no migration. Read invalid
JSON/shape/over256chars fails statically rather than silently resetting preferences.
Persist->load->real LangChain/S21 fake HTTP test proves optional presentation
context actually sent while immutable QA policy/tool/budget authority remains.
Default no-preference wire unchanged. No live inference or service integration claim.

## S27c structured rules (2026-11-05)

Same-turn official Drizzle insert/upsert and Zod strict-option sources above apply;
no new dependency/API or migration. Core exact own-field union: amounts_in_rupees,
short_summaries, allowed_sources and paired_telegram_only. No free text, threshold,
secret-phrase authentication or automatic approvals. Authentication and Telegram
pairing mandatory independently of stored rules; rules only restrict. Origin
booleans are trusted HOST metadata, never proof from a user/model message.
Inherited fields acceptance reproduced red and fixed with exact own-field checks.
Persisted behavior through actual LangChain/S21 fake HTTP, unauthorized/unpaired/
source-rejected requests stop before redactor/provider/tools. Default low-level
Q&A remains trusted in-process; shared service/channel verification is S27d/S28.

## S27d actual shared service (2026-11-05)

Existing official Zod strict API, Node24 AbortSignal.any (S26), SQLite transaction/
Drizzle upsert references retained; no new SDK/dependency. SharedAssistantService
implements core port; explicit question/draft_entry/improve_note, no guessing or
cloud fallback. Host origin separate from raw body. Auth/pairing/sensitive gates
before all effects; stored rules before preferences/history/model. History6 turns
only, re-filtered/redacted/scrubbed into untrusted_history user data (never system
roles). Actual framework/HTTP/native read-only integration across all3 sources.
Private ensureConversation idempotent without overwrite; user/reply IDs derive
from globally unique request ID, replay fails before inference. One service queue,
whole-request abort/elapsed guard; native pending-proposal transaction guarded
inside queue before+after core writes. Tests prove rollback/no late pending write.
Accepted user history may remain when computation fails/cancels; no SQL preemption.
AssistantNotificationWorker first deterministic ingestion, unknown only invokes
validated local task once then existing proposal validator, never cloud/AI commit.
Stored conditions gate unknown-model invocation, not authorized deterministic
notification capture. Sensitive/unallowed/unauthenticated never invoke local model.

## S28 Telegram backend (2026-11-05)

Official https://core.telegram.org/bots/api sections making-requests, getUpdates,
sendMessage, Update and ResponseParameters read from HTTP200 via Node fetch
(fetch_page403). Official https://github.com/tdlib/telegram-bot-api README also read.
HTTP JSON protocol only, no SDK/version upgrade; Node24.22.2/Zod4.6.7 retained.
HTTPS bot-token path; POST JSON; validate ok/result; positive long polling25s,
limit100/message-only; cursor highest+1; no webhooks.409 latches conflict;429 obeys
retry_after/default60s (no immediate retry). Telegram messages plain4096 chars.
API calls30s total signal deadline, shared1MiB strict UTF-8 reader reused from S21.
No actual Telegram API/token used; fake fetch plus real loopback HTTP only.

## S29 snake_case CLI (2026-11-05)

Commander **15.0.0** added only to `apps/cli`. Official source
https://github.com/tj/commander.js#readme consulted before use; `npm view
commander version engines` reported 15.0.0 and node `>=22.12.0`, compatible with
the repository Node 24.22.2 runtime. Existing core/storage/agent APIs reused; no
new storage, provider, or AI framework dependency. CLI output is JSON with
snake_case keys, static error codes, and no raw input/exception echo. `--db` or
`VITTAZ_DB_PATH` opens SQLite lazily through `@vittaz/storage`. `ask` uses the
shared `AssistantService` port with verified CLI origin; cloud Q&A requires
explicit `VITTAZ_AI_BASE_URL` and `VITTAZ_AI_API_KEY`, and local draft/note tasks
fail closed as unavailable until a local model runner is wired. Backup remains
ledger-only plaintext with mode 0600 and the existing privacy warning.

## S32 documentation completion

No new runtime dependency was added. Documentation was checked against the
existing Node **24.22.2**, npm **11.19.1**, Vitest **4.1.10**, Commander
**15.0.0**, and repository source. `docs/device_tests.md` is intentionally a
pending checklist: no Android device behavior has been verified.

## S33 Android environment (2026-11-05)

Official documentation consulted before adding the environment checker and owner
instructions:

- Android Debug Bridge: https://developer.android.com/tools/adb — `adb` is part
  of Android SDK Platform Tools; `adb devices` lists attached devices and states
  such as `device`, `offline`, and `unauthorized`.
- Expo development builds:
  https://docs.expo.dev/develop/development-builds/introduction/ — local builds
  use `npx expo install expo-dev-client`, then `npx expo run:android --device`
  for a physical device, and `npx expo prebuild --clean` when native config or
  dependencies change.
- Expo Android Studio/emulator setup:
  https://docs.expo.dev/workflow/android-studio-emulator/ — JDK 17, Android SDK
  Platform 36, SDK Build-Tools, platform-tools, and `ANDROID_HOME` are required
  for local Android builds.
- Expo DevClient SDK 58: https://docs.expo.dev/versions/v58.0.0/sdk/dev-client/ —
  recommended `expo-dev-client` version for SDK 58 is `~58.0.18`.

No new repository runtime dependency was added by the checker itself. The
owner-side blank Expo development build should use the Expo SDK selected by the
blank template and `npx expo install expo-dev-client` so the dev-client version
matches that SDK. The checker masks device serials and reports only static error
codes; it is not device proof.

## S33 GitHub Actions Android proof runner image (2026-11-05)

Official GitHub-hosted Ubuntu 24.04 runner image documentation consulted:
https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
(raw: https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md).
The recorded image version is **20261026.354.1**, OS **24.04.5 LTS**. The
workflow pins `ubuntu-24.04` because the image announcement says `ubuntu-latest`
will move to Ubuntu 26.04 in November 2026.

Relevant installed software recorded from that Ubuntu 24.04 runner image:

- **JDK 17**: `17.0.21+9` is the default Java version (`JAVA_HOME_17_X64`).
  The workflow still uses `actions/setup-java` to select JDK 17 explicitly.
- **Node**: default Node.js is `22.23.4`; cached Node versions include
  `24.22.1`, not the exact repository runtime. The workflow therefore uses
  `actions/setup-node` to install **Node 24.22.2** explicitly.
- **Android SDK Platform 36** is present (`android-36` rev 2), along with
  `android-36.1`, `android-35`, `android-34`, and Android 37 preview platforms.
- Android SDK Build-tools include `36.0.0`, `36.1.0`, and `37.0.0`.
- Android SDK Platform-Tools is `37.0.1`; Android Command Line Tools is `12.0`.
- Android NDK default is `27.3.13750724`; CMake includes `3.31.5` and `4.1.2`.
- `ANDROID_HOME` and `ANDROID_SDK_ROOT` point to `/usr/local/lib/android/sdk`.

Pinned actions used by `.github/workflows/s33-android-proof.yml`:

- `actions/checkout` v5.0.0 → `08c6903cd8c0fde910a37f88322edcfb5dd907a8`
- `actions/setup-java` v4.7.1 → `c5195efecf7bdfc987ee8bae7a71cb8b11521c00`
- `actions/setup-node` v4.4.0 → `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/upload-artifact` v4.6.2 → `ea165f8d65b6e75b540449e92b4886f43607fa02`

The workflow is `workflow_dispatch` only, uses `permissions: contents: read`,
and uses no secrets. It creates a blank Expo TypeScript app in the runner temp
directory, adds `expo-dev-client`, runs `expo prebuild --platform android
--clean`, builds `assembleDebug` with Gradle, and uploads `app-debug.apk` with
7-day retention. This is build proof only, not device proof.

## Historical S33 preview APK workflow (2026-11-05; superseded in S38)

At the time, `.github/workflows/s33-preview-apk.yml` reused the runner image and
the four pinned action SHAs recorded above for `s33-android-proof` (checkout v5.0.0,
setup-java v4.7.1, setup-node v4.4.0, upload-artifact v4.6.2), on `ubuntu-24.04`
with JDK 17 and Node 24.22.2. No new action was introduced.

Facts verified locally in a throwaway copy of the owner preview
(`expo ~58.0.23`, React Native `0.88.1`) before writing the workflow:

- `npx expo-modules-autolinking react-native-config --platform android --json`
  lists `react-native-safe-area-context` and `react-native-svg` under
  `dependencies`. Plain React Native native modules are autolinked by the React
  Native Gradle plugin and do **not** appear in
  `npx expo-modules-autolinking resolve`, which reports Expo modules only. Both
  commands are needed to check autolinking completely.
- `npx expo-modules-autolinking resolve --platform android --json` lists
  `expo-linear-gradient` and `expo-dev-client` under `modules`.
- `npx expo install expo-dev-client` resolves to `~58.0.18`, matching the SDK 58
  bundled version recorded above.
- `npx expo export --platform android` succeeds for the preview and produces a
  Hermes bundle of about 2.3 MB, confirming the Metro `watchFolders` layout
  bundles for Android without the web-only dependencies.
- The generated `android/app/build.gradle` skips JS bundling for debuggable
  variants, so `assembleDebug` needs Metro; `assembleRelease` embeds
  `assets/index.android.bundle`.
- The generated release variant uses `signingConfig signingConfigs.debug`. This
  is sideload-only, not production signing.
- `expo-dev-launcher/android/build.gradle` selects `src/disableInRelease` for the
  release source set unless `expo.devlauncher.configureInRelease=true`, so the
  dev launcher is inert in the standalone release APK.

Cause of the earlier owner-side crash, recorded so it is not re-diagnosed: the
blank `s33-android-proof` APK autolinked no `react-native-safe-area-context`,
while the preview JavaScript served by Metro rendered `SafeAreaProvider`, so
Fabric raised `IllegalViewOperationException` for `RNCSafeAreaProvider`. The fix
is to build the APK from the preview project, not to install JavaScript packages
into an already-built binary.

Workflow-context constraint learned from a real `422` on the first dispatch
attempt: GitHub exposes the `runner` context only at **step** level. Putting
`${{ runner.temp }}` in job-level `env` makes the entire workflow file fail to
parse (`Unrecognized named-value: 'runner'`), and `workflow_dispatch` then
returns `422` before any job starts. The workflow now derives `PREVIEW_DIR` from
the `$RUNNER_TEMP` environment variable in a first step and writes it to
`$GITHUB_ENV`; `${{ runner.temp }}` is used only in step-level `with:` inputs.
A regression test asserts job-level `env` contains no `runner.` expression.
See https://docs.github.com/en/actions/reference/workflows-and-actions/contexts.

This workflow is build proof only. Do not claim device behavior; S33 closes only
when the owner reports that the app opened on their phone.

## S34 native promotion and core source resolution (2026-11-06)

No new dependency was added. The Expo app moved from `apps/mobile/ui/native` to
`apps/mobile` with `git mv`; versions are unchanged (`expo ~58.0.23`,
React Native `0.88.1`, `react-native-safe-area-context ~5.11.1`,
`react-native-svg 15.16.0`, `expo-linear-gradient ~58.0.3`).

Monorepo resolution facts verified by running the app's own toolchain and a real
`npx expo export --platform android`, not by reading docs alone:

- Metro resolves a workspace source package through
  `config.watchFolders` plus `config.resolver.extraNodeModules`. Relevant official
  docs: https://docs.expo.dev/guides/monorepos/ (Expo SDK 58, consulted
  2026-11-06).
- **Metro does not substitute file extensions.** `packages/core` is written for
  NodeNext and imports `"./ledger/money.js"` while shipping `.ts` files, so the
  first export failed with `Unable to resolve "./ledger/money.js"`. A
  `config.resolver.resolveRequest` hook that retries relative `.js` specifiers
  without the extension fixes it; Jest needs the equivalent
  `moduleNameMapper` rule `"^(\\.{1,2}/.*)\\.js$": "$1"`.
- An exported-but-unimported module is tree-shaken out of the Metro graph. A
  bridge file alone left **zero** core symbols in the bundle; re-exporting it
  from `src/domain.ts` (the seam every screen already imports) made core
  reachable. Bundle size 2.3 MB -> 2.5 MB, and `MoneyValidationError`,
  `normalizeIndicDigits` and `assertIntegerPaise` are present in the Hermes
  output. Verify reachability by grepping the emitted bundle, not by asserting
  that a file contains an import string.
- `packages/core` imports `node:fs`, `node:child_process` and `vitest` only from
  `*.test.ts` files, so the production graph is Metro-safe.

Root tooling now excludes `apps/mobile` (prettier, eslint, vitest,
`tsconfig.check.json`) and root `workspaces` is `["packages/*","apps/cli"]`, so
the app's ~1151-package lockfile never enters backend CI. The app is checked by
`.github/workflows/native.yml` with `working-directory: apps/mobile`.

No device behavior is claimed for S34.

### S34 follow-up: the APK workflow must copy `packages/core` too

After the promotion, the first `s33-preview-apk` run on main `b19e181` failed at
Gradle `:app:createBundleReleaseJsAndAssets` with:

```
Failed to construct transformer: Error: ENOENT ... stat
'/home/runner/work/_temp/vittaz-preview/packages/core/src'
```

The promoted `metro.config.cjs` watches `../../packages/core/src`, but the
workflow copied only `apps/mobile` into the runner temp tree, so that watch root
did not exist. A local `expo export` had passed because the real repository does
have `packages/core` at that relative path — the local check could not catch a
missing-copy bug in the CI layout. The workflow now also copies `packages/core`
to `$PREVIEW_DIR/../packages/core`, and a regression test asserts it. The fix was
verified by reproducing the CI temp layout locally (`ui/native` +
`packages/core` as siblings) and running `expo export` there, which produced the
same 2.5 MB Hermes bundle hash as the in-repo build.

## S35 Expo SQLite adapter (2026-11-06)

Official Expo SDK 58 SQLite docs consulted:
https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/ (recommended version
`~58.0.15`, confirmed by `npx expo install expo-sqlite` on 2026-11-06).
The package is pinned in `apps/mobile/package.json` and lockfile and its config
plugin is enabled in `apps/mobile/app.json`. The adapter opens a persistent file
with `openDatabaseAsync("vittaz.db")`, applies the shared versioned SQL, and uses
parameterized `runAsync`, `getFirstAsync`, and `getAllAsync` operations.

Important transaction detail from the official docs: Expo's
`withExclusiveTransactionAsync()` uses a new connection; connection settings
such as `PRAGMA foreign_keys = ON` do not carry over, and cannot be enabled on
that transaction connection because the PRAGMA has no effect inside a
transaction. Therefore the adapter enables foreign keys on the database and
uses `withTransactionAsync()` **behind its own serialized operation queue**. The
queue ensures only store-owned operations use the connection while the
transaction is active. A shared contract case inserts an orphan transaction and
asserts the foreign-key constraint rejects it.

Jest testing guidance consulted:
https://docs.expo.dev/develop/unit-testing/ (SDK 58, 2026-11-06). Native shell
Jest uses `jest-expo` and a deterministic in-memory `LedgerStore` test double;
the **same framework-neutral core contract cases** are run in root Vitest against
both `openLedgerStore` and the Expo adapter, using a real SQLite engine through
the Expo-shaped async port. Additional adapter tests prove file persistence
across close/reopen and migration version parity. This does not replace later
owner device verification of the Expo native binding.

Schema SQL was extracted, without changing it, to
`packages/core/src/ledger/migration_steps.ts`. The Node and Expo adapters both
consume `MIGRATION_STEPS` / `LATEST_SCHEMA_VERSION`, so schema drift cannot be
introduced by maintaining separate SQL copies.

S35 removes the preview reducer and seeded data from the native app. Native
selectors derive totals from loaded rows (no demo offsets), and group arbitrary
stored dates. Manual entry, approval and rejection call core use cases through
the `LedgerStore`. Chat/quick capture are deliberately disabled, not faked.

No device behavior is claimed for S35. The owner-reported S33 open applies only
to the earlier pre-promotion APK.

### S35 Expo SQLite web support

The first `expo export --platform web` after installing `expo-sqlite` failed with
`Unable to resolve "./wa-sqlite/wa-sqlite.wasm" from expo-sqlite/web/worker.ts`.
Per the SDK 58 SQLite docs, `apps/mobile/metro.config.cjs` now adds `.wasm` to
Metro `assetExts` and sets COEP/COOP headers for `SharedArrayBuffer` in the Expo
web dev server. The follow-up web export succeeds. The Native CI workflow checks
both Android and web exports; the separate browser preview remains the Vite app
at `apps/mobile/ui`. Static hosting of the Expo web export must also set the
documented COEP/COOP response headers.

S35 local security check (2026-11-06): `npm audit --audit-level=moderate` in
`apps/mobile` reports 33 advisories (1 low, 32 moderate, 0 high/critical) in the
pinned Expo SDK 58 / ESLint 10 / Jest 30 toolchain. The suggested force fix
would downgrade Expo to 53 and Jest to 29, which breaks the app's SDK 58 baseline.
No `--force` downgrade was applied. Root backend `npm audit` remains 0 findings.
This is an app-toolchain finding to review separately; it is not hidden by the
root audit result.

### S35 adapter source boundary learned from protected CI

The first protected root `test` job failed after all assertions passed in 55
files: OXC's Vite transform followed the test import into
`apps/mobile/src/storage/expo_sqlite_store.ts` and tried to load that directory's
`tsconfig.json` (`extends: expo/tsconfig.base`). The backend test job deliberately
runs only root dependencies, so Expo's config was absent. The adapter itself is
framework-neutral and has no Expo runtime import; it was moved to
`packages/storage/src/expo_sqlite_store.ts`, while the app opens the Expo DB and
imports that source. Metro watches `packages/storage/src`; the manual APK
workflow copies `packages/storage` beside `packages/core`; Native CI now triggers
when either shared package changes. This keeps the same production adapter
under test without installing Expo in backend CI.

The privacy gate also initially returned `privacy_checks_failed_or_missing` in
CI while local execution passed. The checker now runs only its six declared
privacy suites instead of discovering and importing every repository test
file, and emits bounded failure-class diagnostics without assertion messages or
payloads. The root CI `test:coverage` command still runs the complete suite.

### S35 Android UUID runtime repair (2026-11-06)

- Expo SDK 58 Crypto documentation: https://docs.expo.dev/versions/v58.0.0/sdk/crypto/ — recommended `expo-crypto` version `~58.0.7`; `Crypto.randomUUID()` is synchronous, supported on Android/iOS/web, and returns an RFC 4122 version-4 UUID using cryptographically secure random values. Consulted 2026-11-06.
- Installed through the documented SDK-aware command `npx expo install expo-crypto`; resolved package `expo-crypto@58.0.7` and dependency range `~58.0.7` in `apps/mobile/package.json` / `package-lock.json`.
- Native app composition injects this platform ID source into both manual transaction creation and user proposal approval. The framework-free core default is unchanged. Jest regressions remove `globalThis.crypto` during both UI flows and assert the Expo API supplies IDs.
- This is an ID-generation compatibility fix, not a change to storage, ledger semantics, or security guarantees beyond Expo Crypto's documented UUIDv4 source. It does not by itself establish physical-device persistence; the corrected APK must still be retried by the owner.

### Corrected S35 APK build evidence (2026-11-06)

- GitHub Actions REST API workflow-runs documentation: https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10 — consulted 2026-11-06 for viewing/re-running the failed Android APK job. The job rerun endpoint was called with the repository's existing `X-GitHub-Api-Version: 2022-11-28` header; no repository credentials or secrets were added.
- Workflow `s33-preview-apk.yml`, run `42228039226` on merged main `e548227`: first attempt failed at Gradle dependency resolution for `org.gradle.toolchains.foojay-resolver-convention:1.0.0`; the failed APK job was rerun without source changes and attempt 2 succeeded. The original failed attempt is retained as a documented infrastructure/dependency-resolution failure, not hidden.
- Run artifact `s33-preview-standalone-apk`: APK 46,057,626 bytes, SHA-256 `3874cdb8ed54f5e4dec52d798bbc0f20c8a71f6a52fde0672f716c103be708b0`; artifact expires `2026-11-13T13:58:02Z`. Static inspection confirmed `assets/index.android.bundle` and Expo Crypto's DEX class `expo.modules.crypto.CryptoModule`, including `UUID.randomUUID()`. These checks establish packaged build contents only, not Android execution or persistence.

### S36 Android LangChain + Kilo Gateway integration (2026-11-06)

- LangChain.js official Models docs: https://docs.langchain.com/oss/javascript/langchain/models — consulted 2026-11-06 for tool calling and streaming behavior. `@langchain/core@1.3.4` and `zod@4.6.7` are exact-pinned in `apps/mobile/package.json` and its lockfile. The S36 app path reuses Vittaz's bounded read-only Q&A loop; provider chunks are buffered and exposed to UI only after the final answer passes existing safety checks. It does not enable LangSmith or arbitrary callbacks.
- Native CI typecheck failure (2026-11-07): the temp APK project installs only the mobile lockfile, so TypeScript compiling the copied `packages/agent` sources could not resolve their sibling dependency declarations through normal ancestor lookup. Checked versioned package metadata: `https://unpkg.com/@langchain/core@1.3.4/package.json` maps ESM declaration files under `dist/`; `https://registry.npmjs.org/zod/4.6.7` declares `index.d.cts`. `apps/mobile/tsconfig.json` maps those two namespaces to the app's locked `node_modules`; a workflow regression test asserts the mappings. A follow-up native run passed typecheck but showed Jest selected LangChain ESM `.js` files under its CommonJS runner. The same versioned export map exposes `.cjs` `require` entries, so `apps/mobile/jest.config.cjs` maps LangChain subpaths to those pinned CJS files; `zod@4.6.7` maps to `index.cjs` for Jest while TypeScript uses `index.d.cts`. This was confirmed by a second red case after LangChain loaded, then fixed; the native Jest suite now passes 19/19 locally under Node 24.22.2. Metro's production resolver is unchanged. These are test/type resolution changes, not provider runtime or dependency-version changes.
- Expo SDK 58 SecureStore docs: https://docs.expo.dev/versions/v58.0.0/sdk/securestore/ — recommended `expo-secure-store` `~58.0.2`; installed `58.0.2` using `npx expo install expo-secure-store`. Android stores values encrypted using Android Keystore; Expo's plugin configures SecureStore backup exclusion by default. Android secure values are not preserved after uninstall. The app stores the optional Kilo Gateway key here, not in SQLite, backups, logs, or source.
- Kilo AI Gateway Models & Providers: https://kilo.ai/docs/gateway/models-and-providers — consulted 2026-11-06. Gateway API v1 is OpenAI-compatible; free models, including `kilo-auto/free`, are available anonymously without a key and are rate-limited to 200 requests/hour per IP. Auto Free resolves to a changing upstream free-model pool. Kilo warns the pool may include providers that log prompts/outputs; the native UI therefore warns to use synthetic data only.
- Kilo AI Gateway API reference: https://kilo.ai/docs/gateway/api-reference — consulted 2026-11-06 for `/api/v1/chat/completions`. The official live catalog `https://ai-gateway.kilo.ai/api/v1/models` was fetched without credentials on 2026-11-06; its `kilo-auto/free` entry advertised `tools` support. A repository-owned fake SSE provider test checks the app's exact no-auth request shape; no financial/personal prompt was sent to Kilo during development.
- Keyless alternative checked: Ollama local API auth docs https://docs.ollama.com/api/authentication and API introduction https://docs.ollama.com/api/introduction — fetched 2026-11-06; local `http://localhost:11434` requests need no API key, while hosted cloud API requests require one. Ollama is not integrated in S36: the owner would need to run/reach a local server, and Android `localhost` refers to the phone rather than the owner's computer.
- Mobile `npm audit --audit-level=moderate` was rerun 2026-11-06 after adding the S36 dependencies. It reports 33 existing toolchain advisories (1 low, 32 moderate; 0 high/critical) across pinned Expo SDK 58, Jest 30 and ESLint 10 dependencies. `npm audit fix --force` proposes breaking downgrades (Expo 57 / Jest 29 / ESLint 9); none were applied. Root `npm audit --audit-level=moderate` remains 0 findings.

### S36 owner-reported chat failure and keyboard follow-up (2026-11-07)

- Kilo AI Gateway API reference: https://kilo.ai/docs/gateway/api-reference — current unversioned service docs fetched 2026-11-07. Confirms base URL `https://ai-gateway.kilo.ai/api/v1`, chat completions, SSE, and tool calling. Kilo Models & Providers: https://kilo.ai/docs/gateway/models-and-providers — fetched the same date; `kilo-auto/free` is a dynamically routed free tier, available to anonymous users, and may route prompts to providers that log them. Synthetic prompts only.
- A single anonymous, no-Authorization transport probe on 2026-11-07 used a synthetic prompt and one synthetic read-only tool schema with the app's endpoint/model/stream fields. It returned HTTP 200, `text/event-stream`, 17 frames, `[DONE]`, and a usage chunk. This shows the gateway accepted that specific keyless request at that time. It does **not** establish that the user's saved key is valid, explain the app screenshots, or prove mobile runtime behavior.
- React Native `0.88.1` KeyboardAvoidingView docs: https://reactnative.dev/docs/keyboardavoidingview — consulted 2026-11-07. The docs recommend setting `behavior` on Android/iOS and show `height` on Android. Expo SDK 58 app config reference: https://docs.expo.dev/versions/v58.0.0/config/app/ — consulted 2026-11-07; `android.softwareKeyboardLayoutMode` maps to `android:windowSoftInputMode`, accepts `resize`/`pan`, and defaults to `resize`. No dependency/version change.
- Kilo official status page: https://status.kilo.ai/ — checked 2026-11-07 after the owner's repeated failures; it reported the Kilo AI Gateway operational and no downtime recorded for that day. This is provider-wide status only, not evidence that a specific Auto Free route, request, mobile network, or device path worked.

### BYOK provider authentication review (2026-11-07)

- Anthropic API overview, unversioned official docs: https://docs.anthropic.com/en/api/overview — consulted 2026-11-07. The Claude API expects a Console API key or supported Workload Identity Federation; API keys are the appropriate BYOK credential for a direct third-party mobile integration.
- Anthropic Claude Code legal and compliance, unversioned official docs: https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance — consulted 2026-11-07. It says third-party developers must not offer Claude.ai login inside their own applications or route subscription credentials on users' behalf. Do not implement a Claude subscription/OAuth login in Vittaz.
- Anthropic Claude Code authentication, unversioned official docs: https://docs.anthropic.com/en/docs/claude-code/iam — consulted 2026-11-07. Subscription OAuth tokens are documented for Claude Code surfaces/scripts; that documentation is not authorization for a third-party app to collect or use a user's Claude subscription login. Recheck the current policy before any future provider-auth implementation.

### S37 official provider API references (2026-11-05)

- OpenAI Chat Completions create reference: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create — current unversioned official API reference consulted 2026-11-05. It documents `POST /chat/completions`, a model-dependent request schema, and either a completion object or streamed chunks. OpenAI recommends Responses for new OpenAI-only projects, but S37a specifically targets the widely implemented OpenAI-compatible Chat Completions surface so users can configure compatible services. No OpenAI SDK or new runtime dependency is being added.
- Anthropic Messages API reference: https://platform.claude.com/docs/en/api/messages — current official reference consulted 2026-11-05; the page identifies API documentation version `2026-10-21` and documents `POST /v1/messages`, structured content blocks, and tool-use blocks. Full request headers, tool schema, and response parsing must be rechecked before S37b implementation.
- Anthropic streaming guide: https://platform.claude.com/docs/en/build-with-claude/streaming — current unversioned official docs consulted 2026-11-05. Streaming is SSE with named events such as `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, and `message_stop`; stream errors may appear in-band, and unknown events should be handled gracefully.
- Anthropic current canonical legal and compliance page: https://code.claude.com/docs/en/legal-and-compliance — consulted 2026-11-05. It states developers building third-party services should use API key authentication and must not offer Claude.ai login or route Free/Pro/Max/Ultra subscription credentials for users. S37b is API-key-only.

### S38 diagnostics test build and Android Downloads export (2026-11-05)

- Expo FileSystem (legacy API) for SDK 58: https://docs.expo.dev/versions/v58.0.0/sdk/filesystem-legacy/ — consulted 2026-11-05. The app uses `expo-file-system@~58.0.13` and `StorageAccessFramework` for the Android directory picker, child listing, directory/file creation, and UTF-8 writes. SAF folder permission is selected explicitly when the user exports; no broad storage permission is requested. Automated Jest tests mock SAF. Downloads-folder navigation, permission persistence, and actual file placement still require owner device verification.
- React Native native debugging/logging: https://reactnative.dev/docs/debugging-native-code — consulted 2026-11-05. The current guide documents access to Android application logs through `adb logcat` / `ReactNativeJS`; the diagnostics logger emits only serialized allowlisted entries to `console.log`, in addition to its bounded in-memory ring buffer. The in-app JSON export is user-triggered and local.
- The owner chose the actual Vittaz app workflow as the S38 target: the old `.github/workflows/s33-preview-apk.yml` was renamed/replaced by `.github/workflows/mobile-diagnostics-test-apk.yml`; `.github/workflows/s33-android-proof.yml` remains the separate blank Expo toolchain proof. The new manual workflow uses the mobile lockfile in a temp copy, sets the diagnostics flag only for that build, and uploads `vittaz-diagnostics-test-apk` for 7 days. No workflow run/APK has been produced in this sandbox.
- This feature's logs deliberately omit prompts, replies, transaction/ledger values, names, keys/tokens, full URLs, provider response bodies, and exception strings/stacks. The build-time flag is set only for the distinct diagnostics test APK; standard builds leave it unset. The APK uses a separate Android application ID so it can coexist with personal Vittaz. No actual cause for `KILO_UNKNOWN` is established by implementation or synthetic tests.
