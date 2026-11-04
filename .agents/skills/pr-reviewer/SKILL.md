---
name: pr-reviewer
description: Pull request reviewer and enhancer that conducts end-to-end PR analysis — categorizing diffs, evaluating test coverage and TDD compliance, assessing blast radius and risks, and producing reviewer-ready summaries and checklists.
---

# Pull Request Reviewer & Enhancer

## When to Use

- When preparing, reviewing, or summarizing a Pull Request or multi-commit branch
- When asked to "review this PR", "analyze PR test coverage", "write a PR description", or "assess PR risk"
- Before merging a feature branch into main to verify behavioral coverage and convention adherence

---

## Workflow

1. **Inspect Scope and Diffs**:
   ```bash
   git diff origin/main...HEAD --stat
   git log --oneline origin/main...HEAD
   ```
2. **Categorize Changes**:
   - `core` / `domain`: Pure business logic, models, interfaces
   - `storage`: SQLite schemas, migrations, repositories
   - `agent`: Assistant services, tool definitions, prompts, models
   - `connectors`: External interfaces (Telegram, CLI)
   - `test`: Unit, integration, or privacy tests
   - `config` / `docs`: Build configs, references, documentation
3. **Analyze Behavioral Test Coverage**:
   - Verify every new behavior or bug fix has corresponding tests
   - Check edge cases (empty strings, zero amounts, negative paise, invalid tokens)
   - Ensure tests verify outcomes rather than merely asserting "does not throw"
4. **Evaluate Risk & Blast Radius**:
   - Check if changes break existing public exports or database schemas
   - Evaluate whether untrusted input can reach sensitive layers
5. **Generate PR Review & Summary**:
   - Output structured review with risk rating, category breakdown, test verification, and actionable checklist.

---

## PR Review Template

```markdown
# PR Review: [Title]

## 1. Summary
[Executive summary of what changed, why, and the architectural context]

## 2. Change Breakdown
| Category | Files Changed | Key Responsibility |
|---|---|---|
| Core | `packages/core/src/...` | Added domain model validation |
| Storage | `packages/storage/src/...` | Added repository query method |
| Test | `packages/core/src/...test.ts` | Unit tests for new edge cases |

## 3. Test Coverage & Behavioral Analysis
- **Tests Added/Modified**: [List test files]
- **TDD Compliance**: [Yes/No - verified test exists for every new branch]
- **Edge Cases Tested**: [Nulls, boundaries, error paths]
- **Coverage Gaps**:
  - [Note any untested code paths or regressions]

## 4. Risk & Blast Radius Assessment
- **Risk Level**: LOW | MEDIUM | HIGH
- **Database Schema Migration**: [None | Forward-compatible | Requires migration]
- **Public API / Contract Breaking**: [Yes/No]
- **Rollback Strategy**: [Revert commit | Migration rollback needed]

## 5. Review Checklist
- [ ] Automated tests pass (`npm test`)
- [ ] TypeScript build succeeds (`npx tsc --noEmit`)
- [ ] No hardcoded secrets, keys, or real credentials
- [ ] Only synthetic data used in tests and fixtures
- [ ] Core package remains framework-free
- [ ] Error paths explicitly handled (no swallowed errors)

## 6. Verdict
- [ ] **APPROVE** — Ready to merge
- [ ] **REQUEST CHANGES** — Blockers identified below
```

---

## Large PR Splitting Strategy

When a PR exceeds 400 lines or touches more than 15 files, recommend splitting:
- **Phase 1**: Interfaces and core domain logic + tests
- **Phase 2**: Storage implementation / migrations + tests
- **Phase 3**: Integration / connectors / CLI wrapper

---

## Supporting Resources

- `resources/implementation-playbook.md`: Python scripts for automated diff parsing, category analysis, and risk scoring.
