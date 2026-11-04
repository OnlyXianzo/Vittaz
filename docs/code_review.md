# Code review results

Date: 2026-11-04. PR: https://github.com/OnlyXianzo/Vittaz/pull/1 .

## Independent review actually received

CodeRabbit review https://github.com/OnlyXianzo/Vittaz/pull/1#pullrequestreview-5768766230 reviewed foundation head `4fae10cf51250b076768d61c17c3492cba62b000` and posted two actionable findings. This was a real external bot review, not a second local agent simulated by the implementation agent. It does not cover the later money changes.

| Finding                                          | Verification                                                                                            | Fix                                                                                             | Regression evidence                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Scanner copies detected content into CI logs     | Read scan_repo: printed first 80 characters; history and working-tree returned raw match/snippet fields | Remove raw detected values from output and result records; retain type/location/commit metadata | Synthetic mocked-history test first failed, then passed while still reporting a finding; no marker in captured output or serialized result |
| Privacy CLI pattern can select future live tests | CLI testNamePattern overrides configured exclusion; confirmed against official Vitest docs              | Require privacy_ and exclude @live in the same anchored expression                              | Selector test first failed for live-tagged privacy names, then passed for nested/local names and rejected both placements of @live         |

## Implementation-agent review, not independent approval

Reviewed current dirty changes relative to foundation head plus owner's reviewer import. Applied repository code-reviewer and security-auditing checklists sequentially; no subagent dispatch tool exists here.

- Money: framework-free pure exports, safe integer rejection including negative zero, BigInt parsing/summing/formatting, exact bounds and cancellation, Devanagari parsing and additive public barrel.
- Reference: unchanged; baseline 1.1 is only partially covered until SQL checks exist at S4. No claim of all 31 checks passing.
- Scanner compatibility: exact whole-line synthetic review-checklist exception only; one-character variant and unrelated synthetic secret remain detected. No directory or prefix bypass.
- Current tests: 18 pass, with 100% statements/branches/functions/lines on implemented core, lint/format/typecheck/build/CLI/audit and secret scan passing locally. Zero audit findings. Local checks are not remote CI proof.
- No remaining high-confidence critical/high findings in these reviewed local changes. This is bounded review evidence, not a guarantee of security or an external approval of S3.

## Merge conditions

Owner clarified CodeRabbit is optional. Main ruleset 26531429 still requires quality/privacy/test/security/build, strict up-to-date code, PR and resolved threads; deletion and force-push are forbidden, with no bypass actors. Reply to the two validated external findings and resolve only their fixed threads after pushing. Merge only the exact tested head after required CI succeeds. A pending or missing optional CodeRabbit update alone is not a blocker.

## Remote verification and thread resolution

Implementation head `04d0ecfff487dc649eee05f96ae73af299f7a9f3` passed all required CI jobs in https://github.com/OnlyXianzo/Vittaz/actions/runs/41835469588 . Posted detailed replies to both external findings and added the review-results summary at https://github.com/OnlyXianzo/Vittaz/pull/1#issuecomment-6631472878 . Queried actual review thread IDs; only fixed findings were resolved, leaving zero unresolved threads at verification time. Requested an incremental CodeRabbit review of later changes without making its availability mandatory. The existing owner-account approval comment is not represented as an independently launched local agent.
