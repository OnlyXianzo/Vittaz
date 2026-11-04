import { expect, test } from "vitest";
import { KeyPool } from "./key_pool.js";
const keys = [
  { nickname: "alpha", apiKey: "synthetic_a" },
  { nickname: "bravo", apiKey: "synthetic_b" },
];
test("key_pool_cooldown_disable_snapshots_and_caller_mutation_are_safe", () => {
  let now = 1000;
  const pool = new KeyPool(keys, { defaultCooldownMs: 10, nowFn: () => now });
  expect(pool.getCandidateEntries()).toHaveLength(2);
  pool.getCandidateEntries()[0]!.apiKey = "synthetic_mutation";
  expect(pool.getCandidateEntries()[0]!.apiKey).toBe("synthetic_a");
  pool.markUnauthorized("alpha");
  pool.markRateLimited("bravo");
  expect(pool.getCandidateEntries()).toHaveLength(0);
  expect(pool.getStatusSnapshot().map((x) => x.state)).toEqual([
    "disabled",
    "cooldown",
  ]);
  now += 10;
  expect(pool.getCandidateEntries()).toHaveLength(1);
  expect(pool.getCandidateEntries(new Set(["bravo"]))).toHaveLength(0);
  pool.markUnauthorized("missing");
  pool.markRateLimited("missing", 1);
  pool.markRateLimited("bravo", 0);
  expect(pool.getStatusSnapshot()[1]!.state).toBe("healthy");
  expect(JSON.stringify(pool)).not.toContain("synthetic_a");
});
test("key_pool_rejects_bad_configuration_and_bounded_cooldowns_without_echo", () => {
  for (const config of [
    [],
    [
      { nickname: "alpha", apiKey: "synthetic_a" },
      { nickname: "alpha", apiKey: "synthetic_b" },
    ],
    [{ nickname: "private bad", apiKey: "synthetic" }],
    [{ nickname: "alpha", apiKey: "private\r\nheader" }],
    Array(9).fill(keys[0]),
  ])
    expect(() => new KeyPool(config)).toThrow("Invalid key configuration");
  for (const ms of [-1, NaN, 0.1, 86400001])
    expect(() => new KeyPool(keys, { defaultCooldownMs: ms })).toThrow(
      "Invalid cooldown",
    );
  const pool = new KeyPool(keys);
  for (const ms of [-1, Infinity, 86400001])
    expect(() => pool.markRateLimited("bravo", ms)).toThrow("Invalid cooldown");
  expect(
    new KeyPool([
      {
        nickname: "keyless",
        apiKey: "",
        model: "synthetic_model",
        provider: "fake",
      },
    ]).getCandidateEntries()[0],
  ).toMatchObject({ provider: "fake", model: "synthetic_model" });
});

test("key_pool_bounds_credential_and_model_metadata", () => {
  for (const config of [
    { nickname: "alpha", apiKey: "x".repeat(4097) },
    { nickname: "alpha", apiKey: "synthetic", model: "x".repeat(129) },
    { nickname: "alpha", apiKey: "synthetic", provider: "private\nprovider" },
  ])
    expect(() => new KeyPool([config])).toThrow("Invalid key configuration");
});
