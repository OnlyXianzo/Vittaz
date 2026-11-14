import { expect, test } from "vitest";
import { retry_after_ms } from "./retry_after.js";

/**
 * The pool has always accepted a cooldown and nothing ever supplied one, so
 * every 429 was held for the default 30 s regardless of what the provider asked
 * for. These cases pin the parsing, including the forms that must not throw.
 */

test("delta_seconds_becomes_milliseconds", () => {
  expect(retry_after_ms({ responseHeaders: { "retry-after": "7" } })).toBe(
    7000,
  );
});

test("the_header_name_is_matched_case_insensitively", () => {
  expect(retry_after_ms({ responseHeaders: { "Retry-After": "3" } })).toBe(
    3000,
  );
});

test("an_http_date_is_converted_against_now", () => {
  const now = Date.parse("2026-11-11T10:00:00Z");
  expect(
    retry_after_ms(
      { responseHeaders: { "retry-after": "Wed, 11 Nov 2026 10:00:30 GMT" } },
      now,
    ),
  ).toBe(30000);
});

test("a_date_in_the_past_means_retry_now_not_a_negative_wait", () => {
  const now = Date.parse("2026-11-11T10:00:00Z");
  expect(
    retry_after_ms(
      { responseHeaders: { "retry-after": "Wed, 11 Nov 2026 09:00:00 GMT" } },
      now,
    ),
  ).toBe(0);
});

test("an_unreasonable_wait_is_capped_rather_than_disabling_the_key", () => {
  // The pool rejects an out-of-range cooldown outright, so passing one through
  // would turn a rate limit into a crash.
  expect(
    retry_after_ms({ responseHeaders: { "retry-after": "999999999" } }),
  ).toBe(86_400_000);
});

test("a_wait_too_large_to_count_cleanly_is_capped_not_ignored", () => {
  // Beyond Number.MAX_SAFE_INTEGER seconds. It still means "wait a long time".
  expect(
    retry_after_ms({
      responseHeaders: { "retry-after": "99999999999999999999999" },
    }),
  ).toBe(86_400_000);
});

test("anything_unusable_leaves_the_default_alone", () => {
  expect(retry_after_ms(undefined)).toBeUndefined();
  expect(retry_after_ms("synthetic")).toBeUndefined();
  expect(retry_after_ms({})).toBeUndefined();
  expect(retry_after_ms({ responseHeaders: null })).toBeUndefined();
  expect(retry_after_ms({ responseHeaders: {} })).toBeUndefined();
  expect(
    retry_after_ms({ responseHeaders: { "retry-after": "" } }),
  ).toBeUndefined();
  expect(
    retry_after_ms({ responseHeaders: { "retry-after": 7 } }),
  ).toBeUndefined();
  expect(
    retry_after_ms({ responseHeaders: { "retry-after": "not a date" } }),
  ).toBeUndefined();
});

test("a_non_retry_after_header_is_ignored", () => {
  expect(
    retry_after_ms({ responseHeaders: { "x-ratelimit-reset": "7" } }),
  ).toBeUndefined();
});
