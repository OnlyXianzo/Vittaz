import { test_client } from "../../../tests/helpers/test_client.js";
import { afterEach, expect, test, vi } from "vitest";
import { openLedgerStore } from "../../storage/src/repositories.js";
import { KeyPool } from "./key_pool.js";
import { AnalyticsClient, AnalyticsError } from "./analytics.js";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const config = [
  {
    nickname: "personal_synth_nick",
    apiKey: "synthetic_primary_credential",
    provider: "synth-openai",
    model: "synthetic_model",
  },
];
const usage = { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 };
const result = {
  content: "SYNTHETIC_REPLY_MARKER",
  toolCalls: [],
  usage,
  keyNickname: "personal_synth_nick",
};
test("baseline_4_6_actual_http_analytics_has_metadata_only_and_no_prompt_reply_credential", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const server = await startFakeOpenAIServer(() => ({
    content: result.content,
    usage,
  }));
  cleanup.push(() => server.close());
  const keyPool = new KeyPool(config);
  const raw = test_client({ baseUrl: server.baseUrl, keyPool });
  const client = new AnalyticsClient({
    client: raw,
    keyPool,
    append: (input) => store.appendAnalytics(input),
    rates: {
      synthetic_model: { input_micros_per_1k: 150, output_micros_per_1k: 600 },
    },
  });
  expect(
    await client.chatCompletion({
      messages: [{ role: "user", content: "SYNTHETIC_PROMPT_MARKER" }],
    }),
  ).toMatchObject(result);
  const rows = await store.listAnalytics();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    provider: "synth-openai",
    model: "synthetic_model",
    key_nickname: "personal_synth_nick",
    prompt_tokens: 120,
    completion_tokens: 45,
    total_tokens: 165,
    cost_estimate_micros: 45,
    outcome: "success",
  });
  expect(Number.isSafeInteger(rows[0]!.latency_ms)).toBe(true);
  const serialized = JSON.stringify(rows);
  for (const text of [
    "SYNTHETIC_PROMPT_MARKER",
    result.content,
    config[0]!.apiKey,
  ])
    expect(serialized).not.toContain(text);
  expect(JSON.stringify(await store.exportSnapshot())).not.toContain(
    "personal_synth_nick",
  );
});
test("analytics_key_metadata_cannot_alias_any_configured_secret", () => {
  expect(
    () =>
      new KeyPool([
        { nickname: "alpha", apiKey: "synthetic_a", provider: "synthetic_b" },
        { nickname: "bravo", apiKey: "synthetic_b" },
      ]),
  ).toThrow("Invalid key configuration");
  expect(
    () =>
      new KeyPool([
        {
          nickname: "alpha",
          apiKey: "synthetic_a",
          model: "prefix_synthetic_a_suffix",
        },
      ]),
  ).toThrow("Invalid key configuration");
});

test("analytics_unknown_usage_unpriced_and_explicit_free_rates_are_distinct", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const keyPool = new KeyPool(config);
  const raw = { chatCompletion: vi.fn(async () => result) };
  let time = 100;
  const client = new AnalyticsClient({
    client: raw,
    keyPool,
    append: (row) => store.appendAnalytics(row),
    nowFn: () => time++,
  });
  await client.chatCompletion({
    messages: [{ role: "user", content: "Synthetic" }],
  });
  raw.chatCompletion.mockResolvedValue({
    ...result,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
  await client.chatCompletion({
    messages: [{ role: "user", content: "Synthetic" }],
  });
  raw.chatCompletion.mockResolvedValue(result);
  const free = new AnalyticsClient({
    client: raw,
    keyPool,
    append: (row) => store.appendAnalytics(row),
    rates: {
      synthetic_model: { input_micros_per_1k: 0, output_micros_per_1k: 0 },
    },
  });
  await free.chatCompletion({
    messages: [{ role: "user", content: "Synthetic" }],
  });
  const rows = await store.listAnalytics();
  expect(rows.map((r) => r.outcome).sort()).toEqual([
    "success",
    "unpriced",
    "usage_unknown",
  ]);
  expect(rows.every((r) => r.cost_estimate_micros === 0)).toBe(true);
  expect(rows.find((r) => r.outcome === "unpriced")!.latency_ms).toBe(1);
});
test("analytics_rejection_and_sensitive_input_have_zero_rows_or_extra_requests", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const server = await startFakeOpenAIServer(() => ({ status: 400 }));
  cleanup.push(() => server.close());
  const keyPool = new KeyPool(config);
  const client = new AnalyticsClient({
    client: test_client({ baseUrl: server.baseUrl, keyPool }),
    keyPool,
    append: (row) => store.appendAnalytics(row),
  });
  await expect(
    client.chatCompletion({
      messages: [{ role: "user", content: "Your OTP is 123456" }],
    }),
  ).rejects.toThrow("Sensitive provider input rejected");
  expect(server.recordedRequests).toHaveLength(0);
  await expect(
    client.chatCompletion({
      messages: [{ role: "user", content: "Synthetic" }],
    }),
  ).rejects.toThrow("fallback disabled");
  expect(server.recordedRequests).toHaveLength(1);
  expect(await store.listAnalytics()).toEqual([]);
});
test("analytics_invalid_rates_usage_metadata_overflow_and_sink_failures_are_static_without_retry", async () => {
  const keyPool = new KeyPool(config);
  const append = vi.fn(async () => {});
  const raw = { chatCompletion: vi.fn(async () => result) };
  const request = {
    messages: [{ role: "user" as const, content: "Synthetic" }],
  };
  for (const value of [-1, -0, NaN, 0.1])
    expect(
      () =>
        new AnalyticsClient({
          client: raw,
          keyPool,
          append,
          rates: {
            synthetic_model: {
              input_micros_per_1k: value,
              output_micros_per_1k: 0,
            },
          },
        }),
    ).toThrow(AnalyticsError);
  const client = new AnalyticsClient({ client: raw, keyPool, append });
  raw.chatCompletion.mockResolvedValueOnce({
    ...result,
    keyNickname: "unknown",
  });
  await expect(client.chatCompletion(request)).rejects.toBeInstanceOf(
    AnalyticsError,
  );
  raw.chatCompletion.mockResolvedValueOnce({
    ...result,
    usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 1 },
  });
  await expect(client.chatCompletion(request)).rejects.toBeInstanceOf(
    AnalyticsError,
  );
  expect(append).not.toHaveBeenCalled();
  raw.chatCompletion.mockResolvedValueOnce({
    ...result,
    usage: {
      prompt_tokens: Number.MAX_SAFE_INTEGER,
      completion_tokens: 0,
      total_tokens: Number.MAX_SAFE_INTEGER,
    },
  });
  const expensive = new AnalyticsClient({
    client: raw,
    keyPool,
    append,
    rates: {
      synthetic_model: {
        input_micros_per_1k: Number.MAX_SAFE_INTEGER,
        output_micros_per_1k: 0,
      },
    },
  });
  await expect(expensive.chatCompletion(request)).rejects.toBeInstanceOf(
    AnalyticsError,
  );
  append.mockRejectedValue(new Error("private_synthetic_sink_failure"));
  await expect(client.chatCompletion(request)).rejects.toThrow(
    "Analytics metadata could not be recorded",
  );
  expect(raw.chatCompletion).toHaveBeenCalledTimes(4);
});
test("analytics_storage_strict_payloads_reject_private_fields_getters_numbers_and_bad_outcomes", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const good = {
    provider: "fake",
    model: "synthetic",
    key_nickname: "alpha",
    prompt_tokens: 120,
    completion_tokens: 45,
    total_tokens: 165,
    latency_ms: 1,
    cost_estimate_micros: 45,
    outcome: "success" as const,
  };
  const input: unknown[] = [
    { ...good, prompt: "private_synthetic_prompt" },
    { ...good, reply: "private_synthetic_reply" },
    { ...good, api_key: "synthetic" },
    { ...good, total_tokens: 0 },
    { ...good, total_tokens: -1 },
    { ...good, latency_ms: -0 },
    { ...good, provider: "private\nprovider" },
    { ...good, outcome: "unpriced" },
    { ...good, outcome: "usage_unknown" },
    {
      ...good,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      outcome: "usage_unknown",
    },
    { ...good, provider: "otp", model: "123456" },
    Object.defineProperty({ ...good }, "model", {
      get() {
        throw new Error("private_synthetic_getter");
      },
    }),
  ];
  for (const value of input)
    await expect(store.appendAnalytics(value as typeof good)).rejects.toThrow(
      "Invalid analytics metadata",
    );
  expect(await store.listAnalytics()).toEqual([]);
  await store.appendAnalytics(good);
  good.provider = "changed";
  const rows = await store.listAnalytics();
  expect(rows[0]!.provider).toBe("fake");
  rows[0]!.provider = "mutated";
  expect((await store.listAnalytics())[0]!.provider).toBe("fake");
});
test("analytics_clock_failures_do_not_echo_private_error_or_call_provider", async () => {
  const raw = { chatCompletion: vi.fn(async () => result) };
  const append = vi.fn(async () => {});
  const client = new AnalyticsClient({
    client: raw,
    keyPool: new KeyPool(config),
    append,
    nowFn: () => {
      throw new Error("private_synthetic_clock");
    },
  });
  await expect(
    client.chatCompletion({
      messages: [{ role: "user", content: "Synthetic" }],
    }),
  ).rejects.toBeInstanceOf(AnalyticsError);
  expect(raw.chatCompletion).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
});

test("analytics_records_only_successful_fallback_key_with_exact_integer_rounding", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const server = await startFakeOpenAIServer((r) =>
    r.index === 0
      ? { status: 401 }
      : {
          content: "Synthetic",
          usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
        },
  );
  cleanup.push(() => server.close());
  const keyPool = new KeyPool([
    {
      nickname: "alpha",
      apiKey: "synthetic_alpha",
      model: "first",
      provider: "fake",
    },
    {
      nickname: "bravo",
      apiKey: "synthetic_bravo",
      model: "second",
      provider: "fake",
    },
  ]);
  const client = new AnalyticsClient({
    client: test_client({ baseUrl: server.baseUrl, keyPool }),
    keyPool,
    append: (value) => store.appendAnalytics(value),
    rates: { second: { input_micros_per_1k: 500, output_micros_per_1k: 0 } },
  });
  await client.chatCompletion({
    messages: [{ role: "user", content: "Synthetic" }],
  });
  expect(server.recordedRequests).toHaveLength(2);
  expect(await store.listAnalytics()).toMatchObject([
    { key_nickname: "bravo", model: "second", cost_estimate_micros: 1 },
  ]);
});
