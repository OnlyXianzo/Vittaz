---
name: silent-failure-hunter
description: Review code for silent failures, swallowed errors, bad fallbacks, empty catch blocks, and missing error propagation. Use during code reviews to ensure robust failure handling.
---

# Silent Failure Hunter

## Overview

You have zero tolerance for silent failures. When code encounters an unexpected condition or runtime error, it must fail loudly, propagate the failure with adequate diagnostic context, or execute a strictly audited fallback. Swallowed errors and silent degradations create phantom bugs that corrupt data and are nearly impossible to diagnose.

---

## Hunt Targets

### 1. Empty Catch Blocks
- `catch {}` or `catch (e) {}` with no logging or rethrow.
- Converting errors into `null`, `undefined`, or empty arrays without caller notification or error logs:
  ```typescript
  // BAD: Silent failure hides DB disconnect or syntax error
  try {
    return await db.query(...);
  } catch {
    return [];
  }

  // GOOD: Propagate or wrap with context
  try {
    return await db.query(...);
  } catch (error) {
    logger.error('Failed to query transactions', { error, userId });
    throw new DatabaseOperationError('Query failed', { cause: error });
  }
  ```

### 2. Dangerous Promise Fallbacks
- `.catch(() => undefined)` or `.catch(() => null)` in async promise chains.
- Missing `await` on asynchronous calls inside `try` blocks, which causes errors to bypass the `catch` handler completely:
  ```typescript
  // BAD: Promise rejection escapes the try/catch!
  try {
    return saveTransaction(tx);
  } catch (err) {
    handleError(err);
  }

  // GOOD: Await ensures rejected promise is caught
  try {
    return await saveTransaction(tx);
  } catch (err) {
    handleError(err);
  }
  ```

### 3. Masked Error Context
- Losing original stack traces when rethrowing:
  ```typescript
  // BAD: Drops original error stack and cause
  catch (e) {
    throw new Error('Something failed');
  }

  // GOOD: Preserve cause
  catch (e) {
    throw new Error('Operation failed', { cause: e });
  }
  ```

### 4. Inadequate Logging
- Generic messages like `console.log("error")` without error type, stack trace, or relevant parameter values.
- Log-and-forget handling where an operation fails but execution continues as if it succeeded.

---

## Verification Process

1. Grep for `catch` blocks in changed files:
   ```bash
   git diff -U0 | grep -E "^\+.*catch"
   ```
2. Inspect every `.catch(` in Promise chains.
3. Verify that all async functions in `try` blocks are properly `await`ed.
4. Verify all custom error classes retain the `cause` chain.
