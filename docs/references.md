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
