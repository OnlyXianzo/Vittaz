---
description: Pre-submit PR checklist — verify code quality, tests, docs, and conventions before opening a pull request
---

1. **Check branch is up to date**: Ensure the feature branch has the latest main.
   // turbo
2. Run `git fetch origin main && git log HEAD..origin/main --oneline | head -5`
   - If output is non-empty, rebase first: `git rebase origin/main`

3. **Run full CI**: Typecheck, lint, and build must all pass.
   // parallel
4. Run `npx tsc --noEmit`
   // parallel
5. Run `npm run lint`
   // parallel
6. Run `npm run build`

7. **Run full test suite**: All tests must pass.
   // turbo
8. Run `npm test -- --coverage`

9. **Check for secrets**: Verify no credentials, API keys, or .env files are staged.
   // turbo
10. Run `git diff --cached | grep -E '(api.?key|secret|token|password|\.env)' | head -10`
    - If anything appears, stop and ask the user to remove it before proceeding.

11. **Check commit messages**: Verify conventional commits format (feat:, fix:, docs:, refactor:, test:, chore:).
    // turbo
12. Run `git log --oneline origin/main..HEAD`

13. **Review diff size**: Warn if the diff is over 400 lines.
    // turbo
14. Run `git diff origin/main --stat | tail -1`

15. **Confirm docs updated**: If the PR adds or changes a public API, ask if docs need updating.

16. **Open the PR**: Present the summary to the user and ask for final confirmation before opening.
    // turbo
17. Run `gh pr create --title "<conventional-commit-type>: <short description>" --body "<summary of changes>"`

18. **Add labels**: Add relevant labels (bug, enhancement, documentation, etc.).
    // turbo
19. Run `gh pr edit --add-label "$ARGUMENTS"`
