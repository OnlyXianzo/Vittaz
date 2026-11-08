import { afterEach, expect, test, vi } from "vitest";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import {
  KeyPool,
  AllKeysFailedError,
  BadRequestNoFallbackError,
} from "./key_pool.js";
import { OpenAICompatibleClient } from "./provider_client.js";
const servers: Awaited<ReturnType<typeof startFakeOpenAIServer>>[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});
async function open(responder?: Parameters<typeof startFakeOpenAIServer>[0]) {
  const s = await startFakeOpenAIServer(responder);
  servers.push(s);
  return s;
}
const configs = [
  { nickname: "alpha", apiKey: "synthetic_alpha" },
  { nickname: "bravo", apiKey: "synthetic_bravo" },
  { nickname: "charlie", apiKey: "synthetic_charlie" },
];
const messages = [
  { role: "user" as const, content: "Synthetic spending summary" },
];
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

test("baseline_4_1_provider_400_no_fallback_401_disable_429_cooldown_all_keys_fail", async () => {
  let now = 100000;
  const s = await open(() => ({ status: 400 }));
  const pool = new KeyPool(configs, {
    nowFn: () => now,
    defaultCooldownMs: 10000,
  });
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl,
    keyPool: pool,
  });
  await expect(client.chatCompletion({ messages })).rejects.toBeInstanceOf(
    BadRequestNoFallbackError,
  );
  expect(s.recordedRequests).toHaveLength(1);
  s.clearRequests();
  s.setResponder((r) =>
    r.apiKey === "synthetic_alpha"
      ? { status: 401 }
      : r.apiKey === "synthetic_bravo"
        ? { status: 429 }
        : { content: "Synthetic complete" },
  );
  expect(await client.chatCompletion({ messages })).toMatchObject({
    content: "Synthetic complete",
    keyNickname: "charlie",
  });
  expect(pool.getStatusSnapshot().map((x) => x.state)).toEqual([
    "disabled",
    "cooldown",
    "healthy",
  ]);
  s.clearRequests();
  await client.chatCompletion({ messages });
  expect(s.recordedRequests).toHaveLength(1);
  now += 15000;
  expect(pool.getStatusSnapshot()[1]!.state).toBe("healthy");
  s.setResponder(() => ({ status: 429 }));
  await expect(client.chatCompletion({ messages })).rejects.toBeInstanceOf(
    AllKeysFailedError,
  );
  await expect(client.chatCompletion({ messages })).rejects.toMatchObject({
    failures: [
      { nickname: "alpha", reason: "disabled" },
      { nickname: "bravo", reason: "cooldown" },
      { nickname: "charlie", reason: "cooldown" },
    ],
  });
});

test("diagnostic_callbacks_report_safe_request_stage_and_http_category_only", async () => {
  const events: unknown[] = [];
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool([configs[0]!]),
    fetch: vi.fn(
      async () => new Response("synthetic_private_body", { status: 403 }),
    ),
  });

  await expect(
    client.chatCompletion({
      messages,
      onDiagnostic: (event) => events.push(event),
    }),
  ).rejects.toBeInstanceOf(AllKeysFailedError);

  const serialized = JSON.stringify(events);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_code: "provider_request_started",
        source: "provider_http",
        outcome: "started",
      }),
      expect.objectContaining({
        event_code: "provider_http_response",
        source: "provider_http",
        outcome: "failed",
        reason_code: "access_denied",
        http_status: 403,
      }),
    ]),
  );
  expect(serialized).not.toContain("synthetic_private_body");
  expect(serialized).not.toContain("synthetic_alpha");
  expect(serialized).not.toMatch(/prompt|api_key|url|stack|response_body/i);
});

test("provider_failures_classify_connection_http_and_protocol_causes_without_raw_details", async () => {
  const cases: Array<{
    fetch_impl: typeof fetch;
    reason: string;
  }> = [
    {
      fetch_impl: vi.fn(async () => {
        throw new Error("private_network_failure");
      }) as typeof fetch,
      reason: "connection_error",
    },
    {
      fetch_impl: vi.fn(
        async () => new Response("private_body", { status: 403 }),
      ) as typeof fetch,
      reason: "access_denied",
    },
    {
      fetch_impl: vi.fn(
        async () => new Response("private_body", { status: 503 }),
      ) as typeof fetch,
      reason: "provider_unavailable",
    },
    {
      fetch_impl: vi.fn(
        async () => new Response("private_body", { status: 404 }),
      ) as typeof fetch,
      reason: "provider_http_error",
    },
    {
      fetch_impl: vi.fn(async () =>
        Object.defineProperty({} as Response, "ok", {
          get() {
            throw new Error("private_response_failure");
          },
        }),
      ) as typeof fetch,
      reason: "provider_error",
    },
    {
      fetch_impl: vi.fn(
        async () => new Response("data: {private_json}\\n\\n"),
      ) as typeof fetch,
      reason: "protocol_error",
    },
  ];

  for (const { fetch_impl, reason } of cases) {
    const client = new OpenAICompatibleClient({
      baseUrl: "https://example.invalid",
      keyPool: new KeyPool([configs[0]!]),
      fetch: fetch_impl,
    });
    try {
      await client.chatCompletion({ messages, stream: true });
      expect.fail("expected provider failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AllKeysFailedError);
      expect(error).toMatchObject({
        failures: [{ nickname: "alpha", reason }],
      });
      expect(String(error)).not.toContain("private_");
    }
  }
});

test("provider_abort_during_stream_parse_error_stays_cancellation_not_protocol_failure", async () => {
  const controller = new AbortController();
  const fetch_impl = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(stream) {
            setTimeout(() => {
              controller.abort();
              stream.error(new Error("private_stream_failure"));
            }, 0);
          },
        }),
      ),
  ) as typeof fetch;
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool([configs[0]!]),
    fetch: fetch_impl,
  });

  await expect(
    client.chatCompletion({
      messages,
      stream: true,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch_impl).toHaveBeenCalledTimes(1);
});

test("baseline_4_2_provider_truncated_stream_resets_before_clean_next_key", async () => {
  const s = await open((r) =>
    r.index === 0
      ? { content: "HALF_WRITTEN_SYNTHETIC", omitDone: true }
      : {
          content: "Synthetic complete ₹1200",
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        },
  );
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl,
    keyPool: new KeyPool(configs),
  });
  let display = "";
  let resets = 0;
  const out = await client.chatCompletion({
    messages,
    stream: true,
    onStreamDelta: (delta) => {
      display += delta;
    },
    onStreamReset: () => {
      display = "";
      resets++;
    },
  });
  expect(out).toMatchObject({
    content: "Synthetic complete ₹1200",
    keyNickname: "bravo",
    usage: { total_tokens: 5 },
  });
  expect(display).toBe(out.content);
  expect(resets).toBe(1);
});

test("provider_sse_assembles_utf8_multiline_crlf_comments_tool_calls_and_usage", async () => {
  const wire =
    ': synthetic comment\r\n\r\ndata: {"choices":[\r\ndata: {"index":0,"delta":{"content":"₹ भोजन"}}]}\r\n\r\n' +
    frame({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "synthetic_call",
                function: { name: "get_", arguments: '{"wallet_' },
              },
            ],
          },
        },
      ],
    }) +
    frame({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { name: "balance", arguments: 'id":"cash"}' },
              },
            ],
          },
        },
      ],
    }) +
    frame({
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      choices: [],
    }) +
    "data: [DONE]\n\n";
  const bytes = new TextEncoder().encode(wire);
  const transport = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
            c.close();
          },
        }),
      ),
  );
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  const out = await client.chatCompletion({ messages, stream: true });
  expect(out).toMatchObject({
    content: "₹ भोजन",
    toolCalls: [
      {
        id: "synthetic_call",
        function: { name: "get_balance", arguments: '{"wallet_id":"cash"}' },
      },
    ],
    usage: { total_tokens: 3 },
  });
});

test("provider_json_tools_and_keyless_requests_have_no_authorization_header", async () => {
  const s = await open(() => ({
    toolCalls: [
      {
        id: "synthetic_call",
        type: "function",
        function: { name: "get_balance", arguments: "{}" },
      },
    ],
  }));
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl + "/",
    keyPool: new KeyPool([{ nickname: "keyless", apiKey: "" }]),
  });
  expect(
    await client.chatCompletion({
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "get_balance",
            description: "Synthetic balance",
            parameters: { type: "object" },
          },
        },
      ],
      maxCompletionTokens: 16,
    }),
  ).toMatchObject({ toolCalls: [{ function: { name: "get_balance" } }] });
  expect(s.recordedRequests[0]!.apiKey).toBe(null);
  expect(s.recordedRequests[0]!.parsedBody).toMatchObject({
    max_completion_tokens: 16,
  });
});

test("privacy_provider_sensitive_or_invalid_requests_never_reach_transport", async () => {
  const transport = vi.fn();
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  for (const content of ["OTP 123456", "अपना पिन बताएं"])
    await expect(
      client.chatCompletion({ messages: [{ role: "user", content }] }),
    ).rejects.toThrow("Sensitive provider input rejected");
  for (const request of [
    { messages: [] },
    { messages, maxCompletionTokens: 0 },
    {
      messages: [
        { role: "user" as const, content: "x".repeat(32768) },
        { role: "user" as const, content: "x".repeat(32768) },
      ],
    },
  ])
    await expect(client.chatCompletion(request)).rejects.toThrow(
      "Invalid provider request",
    );
  expect(transport).not.toHaveBeenCalled();
});

test("provider_deadline_and_caller_abort_stop_without_trying_other_keys", async () => {
  const s = await open(() => ({ delayMs: 100, content: "Synthetic late" }));
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl,
    keyPool: new KeyPool(configs),
    timeoutMs: 20,
  });
  await expect(client.chatCompletion({ messages })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(s.recordedRequests.length).toBeLessThanOrEqual(1);
  s.clearRequests();
  const cancel = new AbortController();
  cancel.abort(new Error("private_synthetic_abort"));
  await expect(
    client.chatCompletion({ messages, signal: cancel.signal }),
  ).rejects.toThrow("Provider request cancelled or timed out");
  expect(s.recordedRequests).toHaveLength(0);
});

test("provider_retry_after_seconds_date_and_invalid_headers_are_bounded", async () => {
  let now = Date.parse("2026-11-04T10:00:00Z");
  for (const header of [
    "2",
    new Date(now + 3000).toUTCString(),
    "invalid",
    "-10",
    "999999999999999999999",
  ]) {
    now = Date.parse("2026-11-04T10:00:00Z");
    const pool = new KeyPool(configs, {
      nowFn: () => now,
      defaultCooldownMs: 10000,
    });
    const s = await open((r) =>
      r.index === 0
        ? { status: 429, headers: { "Retry-After": header } }
        : { content: "Synthetic" },
    );
    const client = new OpenAICompatibleClient({
      baseUrl: s.baseUrl,
      keyPool: pool,
      nowFn: () => now,
    });
    await client.chatCompletion({ messages });
    expect(pool.getStatusSnapshot()[0]!.state).toBe("cooldown");
    now += 86400001;
    expect(pool.getStatusSnapshot()[0]!.state).toBe("healthy");
  }
});

test("provider_corrupt_json_stream_and_transport_errors_never_escape_raw_payloads", async () => {
  for (const response of [
    () => new Response('{"private_bad":'),
    () => new Response(JSON.stringify({ choices: [] })),
    () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Synthetic" } }],
          usage: { prompt_tokens: -1, completion_tokens: 0, total_tokens: 0 },
        }),
      ),
    () => new Response(null),
    () => new Response("x".repeat(1048577)),
    () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error("private_synthetic_transport"));
          },
        }),
      ),
  ]) {
    const client = new OpenAICompatibleClient({
      baseUrl: "https://example.invalid",
      keyPool: new KeyPool(configs),
      fetch: vi.fn(async () => response()),
    });
    try {
      await client.chatCompletion({ messages });
      expect.fail("expected protocol failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AllKeysFailedError);
      expect(String(error)).not.toContain("private_");
    }
  }
  for (const wire of [
    "data: {broken_private_json}\n\n",
    frame({ error: { message: "private_provider_error" } }),
    "data: [DONE]\n\n",
  ]) {
    const client = new OpenAICompatibleClient({
      baseUrl: "https://example.invalid",
      keyPool: new KeyPool(configs),
      fetch: vi.fn(async () => new Response(wire)),
    });
    await expect(
      client.chatCompletion({ messages, stream: true }),
    ).rejects.toBeInstanceOf(AllKeysFailedError);
  }
});

test("provider_application_callback_errors_do_not_retry_or_echo_and_final_failure_resets", async () => {
  const s = await open(() => ({ content: "Synthetic" }));
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl,
    keyPool: new KeyPool(configs),
  });
  await expect(
    client.chatCompletion({
      messages,
      stream: true,
      onStreamDelta: () => {
        throw new Error("private_ui_error");
      },
    }),
  ).rejects.toThrow("Provider callback failed");
  expect(s.recordedRequests).toHaveLength(1);
  s.clearRequests();
  s.setResponder(() => ({ content: "Synthetic half", omitDone: true }));
  const reset = vi.fn();
  await expect(
    client.chatCompletion({ messages, stream: true, onStreamReset: reset }),
  ).rejects.toBeInstanceOf(AllKeysFailedError);
  expect(reset).toHaveBeenCalledTimes(3);
  await expect(
    client.chatCompletion({
      messages,
      stream: true,
      onStreamReset: () => {
        throw new Error("private_reset_error");
      },
    }),
  ).rejects.toThrow("Provider callback failed");
});

test("provider_rejects_unsafe_endpoints_and_deadline_configuration", () => {
  for (const baseUrl of [
    "not_url",
    "http://example.invalid",
    "https://synthetic:private@example.invalid",
    "https://example.invalid?private=data",
    "https://example.invalid/#private",
  ])
    expect(
      () =>
        new OpenAICompatibleClient({ baseUrl, keyPool: new KeyPool(configs) }),
    ).toThrow("Invalid provider configuration");
  for (const timeoutMs of [0, -1, Infinity, 0.5, 300001])
    expect(
      () =>
        new OpenAICompatibleClient({
          baseUrl: "https://example.invalid",
          keyPool: new KeyPool(configs),
          timeoutMs,
        }),
    ).toThrow("Invalid provider configuration");
});

test("privacy_provider_sensitive_tool_history_is_rejected_before_network", async () => {
  const transport = vi.fn();
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  await expect(
    client.chatCompletion({
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              function: {
                name: "get_balance",
                arguments: '{"note":"OTP 123456"}',
              },
            },
          ],
        },
      ],
    }),
  ).rejects.toThrow("Sensitive provider input rejected");
  expect(transport).not.toHaveBeenCalled();
});

test("provider_abort_during_delta_discards_completion_and_resets_without_fallback", async () => {
  const server = await open(() => ({ content: "Synthetic text" }));
  const controller = new AbortController();
  const reset = vi.fn();
  const client = new OpenAICompatibleClient({
    baseUrl: server.baseUrl,
    keyPool: new KeyPool(configs),
  });
  await expect(
    client.chatCompletion({
      messages,
      stream: true,
      signal: controller.signal,
      onStreamDelta: () =>
        controller.abort(new Error("private_synthetic_abort")),
      onStreamReset: reset,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(server.recordedRequests).toHaveLength(1);
  expect(reset).toHaveBeenCalledOnce();
});

test("provider_optional_usage_and_parallel_stream_tool_fragments_are_validated", async () => {
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: null } }] }),
      ),
  );
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  expect(await client.chatCompletion({ messages, tools: [] })).toMatchObject({
    content: "",
    toolCalls: [],
    usage: { total_tokens: 0 },
  });
  const wire =
    frame({ choices: [{}] }) +
    frame({
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }) +
    frame({
      choices: [
        { delta: { tool_calls: [{ index: 1 }, { index: 0, function: {} }] } },
      ],
    }) +
    frame({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 1,
                function: { name: "check_unverified", arguments: "{}" },
              },
              { index: 0, function: { name: "get_balance", arguments: "{}" } },
            ],
          },
        },
      ],
    }) +
    "data: [DONE]\n\n";
  transport.mockImplementation(async () => new Response(wire));
  expect(
    (await client.chatCompletion({ messages, stream: true })).toolCalls.map(
      (call) => call.function.name,
    ),
  ).toEqual(["get_balance", "check_unverified"]);
});

test("provider_error_body_cancel_and_invalid_retry_date_are_static", async () => {
  const transport = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error("private_error_body"));
          },
        }),
        { status: 500 },
      ),
  );
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  await expect(client.chatCompletion({ messages })).rejects.toBeInstanceOf(
    AllKeysFailedError,
  );
  const server = await open(() => ({
    status: 429,
    headers: { "Retry-After": "Wed, 99 Nov 2026 10:00:00 GMT" },
  }));
  await expect(
    new OpenAICompatibleClient({
      baseUrl: server.baseUrl,
      keyPool: new KeyPool(configs),
    }).chatCompletion({ messages }),
  ).rejects.toBeInstanceOf(AllKeysFailedError);
});

test("provider_clock_boundary_and_incomplete_utf8_do_not_spin_or_echo", async () => {
  let clock = 0;
  const pool = new KeyPool([configs[0]!], {
    defaultCooldownMs: 150,
    nowFn: () => clock++ * 100,
  });
  pool.markRateLimited("alpha");
  const transport = vi.fn();
  await expect(
    new OpenAICompatibleClient({
      baseUrl: "https://example.invalid",
      keyPool: pool,
      fetch: transport,
    }).chatCompletion({ messages }),
  ).rejects.toBeInstanceOf(AllKeysFailedError);
  expect(transport).not.toHaveBeenCalled();
  const invalid = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: vi.fn(async () => new Response(new Uint8Array([0xe2]))),
  });
  await expect(invalid.chatCompletion({ messages })).rejects.toBeInstanceOf(
    AllKeysFailedError,
  );
});

test("provider_standard_stream_null_usage_and_requested_usage_chunk_work", async () => {
  const s = await open(() => ({
    wireChunks: [
      frame({
        choices: [{ delta: { content: "Synthetic standard stream" } }],
        usage: null,
      }),
      frame({
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    ],
  }));
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl,
    keyPool: new KeyPool(configs),
  });
  expect(await client.chatCompletion({ messages, stream: true })).toMatchObject(
    { content: "Synthetic standard stream", usage: { total_tokens: 2 } },
  );
  expect(s.recordedRequests[0]!.parsedBody).toMatchObject({
    stream_options: { include_usage: true },
  });
});

test("privacy_provider_invalid_stream_or_signal_is_static_before_network", async () => {
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Synthetic" } }] }),
      ),
  );
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  await expect(
    client.chatCompletion({
      messages,
      stream: "private_invalid_stream" as unknown as boolean,
    }),
  ).rejects.toThrow("Invalid provider request");
  await expect(
    client.chatCompletion({
      messages,
      signal: "private_invalid_signal" as unknown as AbortSignal,
    }),
  ).rejects.toThrow("Invalid provider request");
  expect(transport).not.toHaveBeenCalled();
});

test("privacy_provider_transport_redacts_known_names_and_identifiers_even_if_caller_skips_service", async () => {
  const s = await open();
  const { PrivacyRedactor } = await import("@vittaz/core");
  const client = new OpenAICompatibleClient({
    baseUrl: s.baseUrl,
    keyPool: new KeyPool([{ nickname: "synthetic", apiKey: "" }]),
    redactor: new PrivacyRedactor(["SynthPerson"]),
  });
  await client.chatCompletion({
    messages: [
      {
        role: "user",
        content:
          "Person_1 SynthPerson UPI Ref 630811112222 Account XX1234 Person_999",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_balance",
          description: "SynthPerson balance",
          parameters: { type: "object" },
        },
      },
    ],
  });
  const body = s.recordedRequests[0]!.rawBody;
  expect(body).not.toContain("SynthPerson");
  expect(body).not.toContain("630811112222");
  expect(body).not.toContain("XX1234");
  expect(body).toContain("Person_1");
  expect(body).toContain("[UPI_REF]");
  expect(body).toContain("[ACCOUNT]");
  expect(body).toContain("Person_999");
});

test("privacy_provider_sanitized_wire_still_enforces_body_limit", async () => {
  const transport = vi.fn();
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool(configs),
    fetch: transport,
  });
  const chunk = "123456789,".repeat(2222);
  await expect(
    client.chatCompletion({
      messages: [
        { role: "user", content: chunk },
        { role: "user", content: chunk },
      ],
    }),
  ).rejects.toThrow("Invalid provider request");
  expect(transport).not.toHaveBeenCalled();
});
