import { expect, it, vi } from "vitest";
import type { ChatMessage, ToolSpec } from "./provider_client.js";
import { BadRequestNoFallbackError } from "./key_pool.js";
import { AnthropicMessagesClient } from "./anthropic_messages_client.js";

const fake_api_key = "fake-key";
const model = "claude-sonnet-5-5";

function message_response(
  content: unknown[],
  usage = { input_tokens: 12, output_tokens: 7 },
  stop_reason = "end_turn",
) {
  return new Response(
    JSON.stringify({
      type: "message",
      role: "assistant",
      content,
      usage,
      stop_reason,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function sse_event(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function response_from_fragments(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 11, bytes.length);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function make_client(fetch_impl: typeof fetch) {
  return new AnthropicMessagesClient({
    apiKey: fake_api_key,
    model,
    fetch: fetch_impl,
    timeoutMs: 10000,
  });
}

const tools: readonly ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "get_balance",
      description: "Read the synthetic ledger balance.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

it("sends the documented Messages API request and extracts text and usage", async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const fetch_impl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      request = { url: String(input), init: init ?? {} };
      return message_response([{ type: "text", text: "Synthetic answer." }]);
    },
  ) as typeof fetch;
  const result = await make_client(fetch_impl).chatCompletion({
    messages: [
      { role: "system", content: "Use read-only tools." },
      { role: "developer", content: "Never write data." },
      { role: "user", content: "Synthetic balance question." },
    ],
    tools,
    stream: false,
    maxCompletionTokens: 96,
  });

  expect(result).toMatchObject({
    content: "Synthetic answer.",
    toolCalls: [],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
    keyNickname: "anthropic_byok",
  });
  expect(request).not.toBeNull();
  expect(request!.url).toBe("https://api.anthropic.com/v1/messages");
  expect(request!.init).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2026-10-21",
      "x-api-key": fake_api_key,
    },
  });
  const body = JSON.parse(String(request!.init.body));
  expect(body).toMatchObject({
    model,
    max_tokens: 96,
    stream: false,
    system: "Use read-only tools.\nNever write data.",
    messages: [{ role: "user", content: "Synthetic balance question." }],
    tools: [
      {
        name: "get_balance",
        description: "Read the synthetic ledger balance.",
        input_schema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  });
  expect(String(request!.init.body)).not.toContain(fake_api_key);
});

it("maps assistant tool_use and tool results to Anthropic content blocks", async () => {
  const recorded = { body: null as Record<string, unknown> | null };
  const fetch_impl = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      recorded.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return message_response([{ type: "text", text: "Synthetic follow-up." }]);
    },
  ) as typeof fetch;
  const messages: ChatMessage[] = [
    { role: "user", content: "Look up my synthetic balance." },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "qa_1_0",
          type: "function",
          function: { name: "get_balance", arguments: "{}" },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "qa_1_0",
      content: '{"cash_paise":0}',
    },
  ];
  await make_client(fetch_impl).chatCompletion({
    messages,
    tools,
    stream: false,
  });

  expect(recorded.body?.messages).toEqual([
    { role: "user", content: "Look up my synthetic balance." },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "qa_1_0",
          name: "get_balance",
          input: {},
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "qa_1_0",
          content: '{"cash_paise":0}',
        },
      ],
    },
  ]);
});

it("parses fragmented named SSE events and assembles tool JSON only at block completion", async () => {
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 20 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Synthetic " },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "result." },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "tool_use",
        id: "toolu_synthetic",
        name: "get_balance",
        input: {},
      },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"wallet' },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '_id":"cash"}' },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 1 }),
    sse_event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: 9 },
    }),
    sse_event("ping", { type: "ping" }),
    sse_event("message_stop", { type: "message_stop" }),
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  const result = await make_client(fetch_impl).chatCompletion({
    messages: [{ role: "user", content: "Synthetic lookup." }],
    tools,
    stream: true,
  });

  expect(result).toMatchObject({
    content: "Synthetic result.",
    toolCalls: [
      {
        id: "toolu_synthetic",
        type: "function",
        function: {
          name: "get_balance",
          arguments: '{"wallet_id":"cash"}',
        },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 },
  });
});

it("discards partial SSE answers on an in-band provider error and returns a static failure", async () => {
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 5 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "unreleased partial" },
    }),
    sse_event("error", {
      type: "error",
      error: { type: "overloaded_error", message: "private provider detail" },
    }),
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
    }),
  ).rejects.toMatchObject({
    name: "AllKeysFailedError",
    failures: [{ nickname: "anthropic_byok", reason: "provider_unavailable" }],
  });
});

it("maps Anthropic HTTP failures to static provider categories without exposing response text", async () => {
  const cases = [
    [401, "unauthorized"],
    [403, "access_denied"],
    [402, "provider_http_error"],
    [429, "rate_limited"],
    [529, "provider_unavailable"],
  ] as const;
  for (const [status, reason] of cases) {
    const fetch_impl = vi.fn(
      async () =>
        new Response("private provider body", {
          status,
          headers: { "retry-after": "1" },
        }),
    ) as typeof fetch;
    await expect(
      make_client(fetch_impl).chatCompletion({
        messages: [{ role: "user", content: "Synthetic question." }],
      }),
    ).rejects.toMatchObject({
      name: "AllKeysFailedError",
      failures: [{ nickname: "anthropic_byok", reason }],
    });
  }
  const bad_request_fetch = vi.fn(
    async () => new Response("private provider body", { status: 400 }),
  ) as typeof fetch;
  await expect(
    make_client(bad_request_fetch).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
    }),
  ).rejects.toBeInstanceOf(BadRequestNoFallbackError);
});

it("rejects malformed, truncated, or unknown content blocks as protocol errors", async () => {
  const malformed = vi.fn(
    async () =>
      new Response("{private body", {
        headers: { "content-type": "application/json" },
      }),
  ) as typeof fetch;
  await expect(
    make_client(malformed).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
    }),
  ).rejects.toMatchObject({
    name: "AllKeysFailedError",
    failures: [{ reason: "protocol_error" }],
  });

  const truncated = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 1 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "partial" },
    }),
  ].join("");
  const truncated_fetch = vi.fn(async () =>
    response_from_fragments(truncated),
  ) as typeof fetch;
  await expect(
    make_client(truncated_fetch).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
    }),
  ).rejects.toMatchObject({
    name: "AllKeysFailedError",
    failures: [{ reason: "protocol_error" }],
  });
});

it("validates synthetic API-key, model, and timeout configuration", () => {
  for (const apiKey of ["", "bad key", "bad\u0001key", "x".repeat(4097)])
    expect(() => new AnthropicMessagesClient({ apiKey })).toThrow(
      "Invalid provider configuration",
    );
  for (const model_value of ["", "bad model", "x".repeat(129)])
    expect(
      () =>
        new AnthropicMessagesClient({
          apiKey: fake_api_key,
          model: model_value,
        }),
    ).toThrow("Invalid provider configuration");
  for (const timeoutMs of [0, -1, 300001, 1.5])
    expect(
      () => new AnthropicMessagesClient({ apiKey: fake_api_key, timeoutMs }),
    ).toThrow("Invalid provider configuration");
});

it("uses documented defaults and maps optional or empty message fields without leaking a key", async () => {
  const fetch_impl = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model,
        max_tokens: 1024,
        stream: false,
        messages: [
          { role: "user", content: "" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "call_1_0",
                name: "get_balance",
                input: {},
              },
            ],
          },
        ],
      });
      expect(body).not.toHaveProperty("system");
      expect(body).not.toHaveProperty("tools");
      return message_response([{ type: "text", text: "Synthetic answer." }]);
    },
  ) as typeof fetch;
  const client = new AnthropicMessagesClient({
    apiKey: ` ${fake_api_key} `,
    fetch: fetch_impl,
  });
  await client.chatCompletion({
    messages: [
      { role: "system", content: null },
      { role: "user", content: null },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            type: "function",
            function: { name: "get_balance", arguments: "{}" },
          },
        ],
      },
    ],
  });
});

it("rejects malformed tool arguments and unpaired tool results before HTTP", async () => {
  const fetch_impl = vi.fn() as typeof fetch;
  const client = make_client(fetch_impl);
  for (const arguments_text of ["{", "[]"]) {
    await expect(
      client.chatCompletion({
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "qa_1_0",
                function: { name: "get_balance", arguments: arguments_text },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow("Invalid provider response");
  }
  await expect(
    client.chatCompletion({ messages: [{ role: "tool", content: "{}" }] }),
  ).rejects.toThrow("Invalid provider request");
  expect(fetch_impl).not.toHaveBeenCalled();
});

it("maps non-stream tool_use blocks and rejects invalid Anthropic response shapes", async () => {
  const valid = vi.fn(async () =>
    message_response(
      [
        { type: "text", text: "Synthetic " },
        {
          type: "tool_use",
          id: "toolu_synthetic",
          name: "get_balance",
          input: { wallet_id: "cash" },
        },
      ],
      { input_tokens: 4, output_tokens: 3 },
      "tool_use",
    ),
  ) as typeof fetch;
  const result = await make_client(valid).chatCompletion({
    messages: [{ role: "user", content: "Synthetic balance." }],
  });
  expect(result).toMatchObject({
    content: "Synthetic ",
    toolCalls: [
      {
        id: "toolu_synthetic",
        function: {
          name: "get_balance",
          arguments: '{"wallet_id":"cash"}',
        },
      },
    ],
    usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
  });

  const invalid_responses: unknown[] = [
    {
      type: "wrong",
      role: "assistant",
      content: [],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [null],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [["bad"]],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "text" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "unknown" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [
        { type: "tool_use", id: "bad id", name: "get_balance", input: {} },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [
        { type: "tool_use", id: "toolu_ok", name: "BadName", input: {} },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [
        { type: "tool_use", id: "toolu_ok", name: "get_balance", input: [] },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "tool_use",
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(32769) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "x" }],
      usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 },
    },
  ];
  for (const response of invalid_responses) {
    const fetch_impl = vi.fn(
      async () =>
        new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
        }),
    ) as typeof fetch;
    await expect(
      make_client(fetch_impl).chatCompletion({
        messages: [{ role: "user", content: "Synthetic question." }],
      }),
    ).rejects.toMatchObject({
      name: "AllKeysFailedError",
      failures: [{ nickname: "anthropic_byok", reason: "protocol_error" }],
    });
  }
});

it("rejects a mapped Anthropic payload that would exceed the bounded request size", async () => {
  const fetch_impl = vi.fn() as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [
        { role: "user", content: "x".repeat(32200) },
        { role: "user", content: "x".repeat(32200) },
      ],
    }),
  ).rejects.toThrow("Invalid provider request");
  expect(fetch_impl).not.toHaveBeenCalled();
});

it("maps fetch failures safely and preserves caller cancellation", async () => {
  const network_failure = vi.fn(async () => {
    throw new Error("synthetic network detail");
  }) as typeof fetch;
  await expect(
    make_client(network_failure).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
    }),
  ).rejects.toMatchObject({
    name: "AllKeysFailedError",
    failures: [{ nickname: "anthropic_byok", reason: "connection_error" }],
  });

  const before_fetch = new AbortController();
  before_fetch.abort();
  const unused_fetch = vi.fn() as typeof fetch;
  await expect(
    make_client(unused_fetch).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      signal: before_fetch.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(unused_fetch).not.toHaveBeenCalled();

  const during_fetch = new AbortController();
  const cancelled_fetch = vi.fn(async () => {
    during_fetch.abort();
    throw new Error("synthetic cancellation detail");
  }) as typeof fetch;
  await expect(
    make_client(cancelled_fetch).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      signal: during_fetch.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it("maps additional HTTP statuses without exposing response bodies", async () => {
  for (const status of [404, 500]) {
    const fetch_impl = vi.fn(
      async () => new Response("synthetic private body", { status }),
    ) as typeof fetch;
    await expect(
      make_client(fetch_impl).chatCompletion({
        messages: [{ role: "user", content: "Synthetic question." }],
      }),
    ).rejects.toMatchObject({
      name: "AllKeysFailedError",
      failures: [
        {
          nickname: "anthropic_byok",
          reason:
            status === 500 ? "provider_unavailable" : "provider_http_error",
        },
      ],
    });
  }
});

it("ignores unknown SSE events and data-free ping frames and handles a final unterminated frame", async () => {
  const frames = [
    ": synthetic keepalive\n\n",
    "event: future_event\ndata: this payload is ignored\n\n",
    "event: ping\n\n",
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 1 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "Synthetic final" },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse_event("message_stop", { type: "message_stop" }),
    ": final keepalive",
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
    }),
  ).resolves.toMatchObject({ content: "Synthetic final" });
});

it("resets a failed stream when the consumer callback throws", async () => {
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 1 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Synthetic delta" },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse_event("message_stop", { type: "message_stop" }),
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  const reset = vi.fn();
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
      onStreamDelta: () => {
        throw new Error("synthetic UI detail");
      },
      onStreamReset: reset,
    }),
  ).rejects.toThrow("Provider callback failed");
  expect(reset).toHaveBeenCalledOnce();
});

it("maps streaming error event classes to static failure reasons", async () => {
  const cases = [
    ["api_error", "provider_unavailable"],
    ["timeout_error", "provider_unavailable"],
    ["rate_limit_error", "rate_limited"],
    ["authentication_error", "unauthorized"],
    ["permission_error", "access_denied"],
    ["future_error", "provider_http_error"],
  ] as const;
  for (const [type, reason] of cases) {
    const fetch_impl = vi.fn(async () =>
      response_from_fragments(
        sse_event("error", {
          type: "error",
          error: { type, message: "synthetic private detail" },
        }),
      ),
    ) as typeof fetch;
    await expect(
      make_client(fetch_impl).chatCompletion({
        messages: [{ role: "user", content: "Synthetic question." }],
        stream: true,
      }),
    ).rejects.toMatchObject({
      name: "AllKeysFailedError",
      failures: [{ nickname: "anthropic_byok", reason }],
    });
  }
});

it("accepts ignored thinking blocks and their documented delta types", async () => {
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 2 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "synthetic" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "ignored" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "synthetic" },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 1,
      content_block: { type: "redacted_thinking", data: "synthetic" },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 1 }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 2,
      content_block: { type: "text", text: "Synthetic answer" },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 2 }),
    sse_event("message_stop", { type: "message_stop" }),
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
    }),
  ).resolves.toMatchObject({ content: "Synthetic answer" });
});

it("rejects malformed or out-of-order SSE protocol frames", async () => {
  const start = sse_event("message_start", {
    type: "message_start",
    message: { usage: { input_tokens: 1 } },
  });
  const text_start = sse_event("content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  });
  const text_stop = sse_event("content_block_stop", {
    type: "content_block_stop",
    index: 0,
  });
  const message_stop = sse_event("message_stop", { type: "message_stop" });
  const bad_frames = [
    "event: message_start\ndata: {broken\n\n",
    "event: message_start\ndata\n\n",
    "event: message_start\n\n",
    "data: {}\n\n",
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: -1 } },
    }),
    start + start,
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: 16,
        content_block: { type: "text", text: "" },
      }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: 1 },
      }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "unknown" },
      }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "bad id",
          name: "get_balance",
          input: {},
        },
      }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_synthetic",
          name: "get_balance",
          input: [],
        },
      }),
    start +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "unexpected" },
      }),
    start +
      text_start +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{}" },
      }),
    start + text_start + text_stop + text_stop,
    start + text_start + message_stop,
    start +
      text_start +
      text_stop +
      sse_event("message_delta", {
        type: "message_delta",
        delta: { stop_reason: 1 },
      }),
    start +
      sse_event("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
      }) +
      message_stop,
    start + message_stop,
    "",
  ];
  for (const frame_text of bad_frames) {
    const fetch_impl = vi.fn(async () =>
      response_from_fragments(frame_text),
    ) as typeof fetch;
    await expect(
      make_client(fetch_impl).chatCompletion({
        messages: [{ role: "user", content: "Synthetic question." }],
        stream: true,
      }),
    ).rejects.toMatchObject({
      name: "AllKeysFailedError",
      failures: [{ nickname: "anthropic_byok", reason: "protocol_error" }],
    });
  }
});

it("drains a failing HTTP response even if its body cancellation rejects", async () => {
  const fetch_impl = vi.fn(async () => {
    const response = new Response("synthetic private body", { status: 503 });
    Object.defineProperty(response.body, "cancel", {
      value: () => Promise.reject(new Error("synthetic stream detail")),
    });
    return response;
  }) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
    }),
  ).rejects.toMatchObject({
    name: "AllKeysFailedError",
    failures: [{ nickname: "anthropic_byok", reason: "provider_unavailable" }],
  });
});

it("classifies unexpected response access failures without exposing their message", async () => {
  const fetch_impl = vi.fn(async () => {
    const response = message_response([{ type: "text", text: "Synthetic" }]);
    Object.defineProperty(response, "ok", {
      get() {
        throw new Error("synthetic response access detail");
      },
    });
    return response;
  }) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
    }),
  ).rejects.toMatchObject({
    name: "AllKeysFailedError",
    failures: [{ nickname: "anthropic_byok", reason: "provider_error" }],
  });
});

it("maps assistant text, empty assistant blocks, and null tool-result content", async () => {
  const body_holder = { value: null as Record<string, unknown> | null };
  const fetch_impl = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      body_holder.value = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      return message_response([{ type: "text", text: "Synthetic answer." }]);
    },
  ) as typeof fetch;
  await make_client(fetch_impl).chatCompletion({
    messages: [
      { role: "assistant", content: "Synthetic note", tool_calls: [] },
      { role: "assistant", content: null },
      { role: "tool", tool_call_id: "toolu_synthetic", content: null },
      { role: "user", content: "Synthetic follow-up" },
    ],
  });
  expect(body_holder.value?.messages).toEqual([
    { role: "assistant", content: [{ type: "text", text: "Synthetic note" }] },
    { role: "assistant", content: "" },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_synthetic",
          content: "",
        },
      ],
    },
    { role: "user", content: "Synthetic follow-up" },
  ]);
});

it("supports omitted or null stream metadata and initial tool input without JSON deltas", async () => {
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 2, output_tokens: 0 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: "toolu_initial",
        name: "get_balance",
        input: null,
      },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse_event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: null },
      usage: {},
    }),
    sse_event("message_stop", { type: "message_stop" }),
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
    }),
  ).resolves.toMatchObject({
    toolCalls: [
      {
        id: "toolu_initial",
        function: { arguments: "{}" },
      },
    ],
    usage: { prompt_tokens: 2, completion_tokens: 0, total_tokens: 2 },
  });
});

it("aborts after a streaming consumer cancels while receiving a valid delta", async () => {
  const controller = new AbortController();
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 1 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Synthetic delta" },
    }),
    sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse_event("message_stop", { type: "message_stop" }),
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
      signal: controller.signal,
      onStreamDelta: () => controller.abort(),
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it("rejects additional invalid SSE shapes, bounds, and state transitions", async () => {
  const start = sse_event("message_start", {
    type: "message_start",
    message: { usage: { input_tokens: 1 } },
  });
  const text_start = sse_event("content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  });
  const text_stop = sse_event("content_block_stop", {
    type: "content_block_stop",
    index: 0,
  });
  const message_stop = sse_event("message_stop", { type: "message_stop" });
  const tool_start = (input: unknown, id = "toolu_ok", name = "get_balance") =>
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id, name, input },
    });
  const invalid = [
    "event: message_start\ndata: []\n\n",
    sse_event("message_start", {
      type: "different_event",
      message: { usage: { input_tokens: 1 } },
    }),
    sse_event("message_start", { type: "message_start", message: {} }),
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: "one" } },
    }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: -1,
        content_block: { type: "text", text: "" },
      }),
    start + text_start + text_start,
    start + tool_start({}, "toolu_ok", "BadName"),
    start +
      tool_start({}) +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: 1 },
      }),
    start +
      tool_start({}) +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "x".repeat(65537) },
      }),
    start +
      tool_start({}) +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{" },
      }) +
      sse_event("content_block_stop", { type: "content_block_stop", index: 0 }),
    start +
      text_start +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: 1 },
      }),
    start +
      text_start +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "x".repeat(32769) },
      }),
    start +
      sse_event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "x".repeat(32769) },
      }) +
      text_stop +
      message_stop,
    start +
      text_start +
      sse_event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "unexpected_delta" },
      }),
    start + text_stop,
    start +
      text_start +
      text_stop +
      sse_event("message_delta", {
        type: "message_delta",
        delta: {},
        usage: [],
      }),
    start +
      text_start +
      text_stop +
      sse_event("message_delta", {
        type: "message_delta",
        delta: {},
        usage: { output_tokens: -1 },
      }),
    start +
      text_start +
      sse_event("message_delta", {
        type: "message_delta",
        delta: {},
      }) +
      message_stop,
    start + text_start + text_stop + message_stop + message_stop,
  ];
  for (const frame_text of invalid) {
    const fetch_impl = vi.fn(async () =>
      response_from_fragments(frame_text),
    ) as typeof fetch;
    await expect(
      make_client(fetch_impl).chatCompletion({
        messages: [{ role: "user", content: "Synthetic question." }],
        stream: true,
      }),
    ).rejects.toMatchObject({
      name: "AllKeysFailedError",
      failures: [{ nickname: "anthropic_byok", reason: "protocol_error" }],
    });
  }
});

it("classifies a protocol error after caller cancellation as an abort", async () => {
  const controller = new AbortController();
  const frames = [
    sse_event("message_start", {
      type: "message_start",
      message: { usage: { input_tokens: 1 } },
    }),
    sse_event("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse_event("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Synthetic delta" },
    }),
    "event: content_block_delta\ndata: {malformed}\n\n",
  ].join("");
  const fetch_impl = vi.fn(async () =>
    response_from_fragments(frames),
  ) as typeof fetch;
  await expect(
    make_client(fetch_impl).chatCompletion({
      messages: [{ role: "user", content: "Synthetic question." }],
      stream: true,
      signal: controller.signal,
      onStreamDelta: () => controller.abort(),
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
