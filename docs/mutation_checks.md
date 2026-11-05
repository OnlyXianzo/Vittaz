# Mutation spot checks (S31)

Date: 2026-11-05. Runtime: Node v24.22.2, npm 11.19.1. Base commit:
`07af6760ee275d49d3797981bc829ecb8dd5399d` (S30 merged).

Method: each key rule was deliberately broken in the working tree, one targeted
Vitest suite was run with coverage disabled, the suite had to fail, then the
source file was restored exactly. `git diff --exit-code` was clean after all six
restorations. These are targeted mutation spot checks, not a full mutation
campaign or a coverage percentage claim. All data is synthetic.

| #   | Rule             | Mutated file                                   | Deliberate break                                                                                                                  | Targeted suite                                      | Result                                                                                                                                                                                                            |
| --- | ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Name replacement | `packages/core/src/privacy/redactor.ts`        | Replacement callback returned the raw `name` instead of `placeholder` in both redaction passes.                                   | `packages/core/src/privacy/redactor.test.ts`        | exit 1; failed `privacy_name_registration_is_stable_and_seedable`, `privacy_name_longest_first_and_exact_unicode_boundaries`, `privacy_redactor_outbound_copy_preserves_known_placeholders_and_redacts_raw_names` |
| 2   | Sensitive filter | `packages/core/src/privacy/sensitiveFilter.ts` | A matched sensitive pattern returned `{ sensitive: false, reason: null }`.                                                        | `packages/core/src/privacy/sensitiveFilter.test.ts` | exit 1; failed `privacy_sensitive_english_credentials_and_private_warnings`, `privacy_sensitive_hinglish_and_devanagari`, `privacy_sensitive_guard_drops_before_database_logs_or_network`                         |
| 3   | Approval         | `packages/core/src/ledger/approval.ts`         | `createProposal` auto-approved inside the same transaction instead of leaving the proposal pending.                               | `packages/core/src/ledger/approval.test.ts`         | exit 1; failed `baseline_1_3_pending_approve_once_reject_none`, `approval_round_trip_fields_runtime_and_atomic_batch`                                                                                             |
| 4   | Dedupe           | `packages/core/src/importers/excelImporter.ts` | Duplicate fingerprint check became `false && existing.has(...)`, disabling duplicate skips.                                       | `packages/storage/src/excel.test.ts`                | exit 1; failed `baseline_3_6_excel_dry_run_replay_benefit_tags_and_per_row_errors`, `excel_duplicates_preserve_occurrence_count_and_wallet_scope_under_concurrent_replay`                                         |
| 5   | Key fallback     | `packages/agent/src/provider_client.ts`        | After recording a non-400 key failure, the client threw `AllKeysFailedError` immediately instead of trying the next eligible key. | `packages/agent/src/provider_client.test.ts`        | exit 1; failed `baseline_4_1_provider_400_no_fallback_401_disable_429_cooldown_all_keys_fail`, `baseline_4_2_provider_truncated_stream_resets_before_clean_next_key`                                              |
| 6   | Read-only        | `packages/storage/src/repositories.ts`         | Native connection was opened with `{ readonly: false }` even for the read-only store path.                                        | `packages/storage/src/readonly.test.ts`             | exit 1; failed `baseline_4_5_actual_readonly_connection_blocks_sql_writes_even_if_query_only_is_disabled`, `readonly_missing_or_stale_or_future_schema_never_creates_or_migrates_a_file`                          |

Commands used:

```sh
npx vitest run packages/core/src/privacy/redactor.test.ts --coverage.enabled=false
npx vitest run packages/core/src/privacy/sensitiveFilter.test.ts --coverage.enabled=false
npx vitest run packages/core/src/ledger/approval.test.ts --coverage.enabled=false
npx vitest run packages/storage/src/excel.test.ts --coverage.enabled=false
npx vitest run packages/agent/src/provider_client.test.ts --coverage.enabled=false
npx vitest run packages/storage/src/readonly.test.ts --coverage.enabled=false
```

Local logs are under `/home/user/vittaz-verification/s31-mutation-*.log` and
`s31-mutation-results.json`. After restoration, the full local gate was rerun:
lint, typecheck, format, coverage, privacy, build, CLI smoke, npm audit, and
secret scan. No mutation was committed.
