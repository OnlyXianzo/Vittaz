import { expect, it, jest } from "@jest/globals";
import type { LedgerStore } from "@vittaz/core";
import { create_mobile_qa_agent, mobile_qa_failure_message } from "./mobile_qa";

it("shows safe actionable copy for rejected keys and rate limits", () => {
  expect(mobile_qa_failure_message("provider_auth_failed")).toContain(
    "KILO_AUTH",
  );
  expect(mobile_qa_failure_message("provider_auth_failed")).toContain(
    "Auto Free is normally keyless",
  );
  expect(mobile_qa_failure_message("provider_rate_limited")).toContain(
    "KILO_RATE_LIMIT",
  );
  expect(mobile_qa_failure_message("provider_request_rejected")).toContain(
    "KILO_REQUEST_REJECTED",
  );
});

it("uses provider-neutral safe failure copy for OpenAI-compatible BYOK", () => {
  const failure = mobile_qa_failure_message(
    "provider_auth_failed",
    "openai_compatible",
  );
  expect(failure).toMatch(/OpenAI-compatible.*key|key.*OpenAI-compatible/i);
  expect(failure).not.toContain("KILO_");
  expect(failure).toContain("No ledger changes were made.");
});

it("uses Anthropic-specific safe failure copy for API-key BYOK", () => {
  const failure = mobile_qa_failure_message(
    "provider_auth_failed",
    "anthropic",
  );
  expect(failure).toContain("ANTHROPIC_AUTH");
  expect(failure).toContain("No ledger changes were made.");
  expect(failure).not.toContain("KILO_");
  expect(failure).not.toContain("BYOK_");
});

it("shows safe provider diagnostics without suggesting a blank key must be removed", () => {
  const failures = [
    ["provider_connection_failed", "KILO_CONNECTION"],
    ["provider_unavailable", "KILO_UNAVAILABLE"],
    ["provider_access_denied", "KILO_ACCESS"],
    ["provider_protocol_error", "KILO_PROTOCOL"],
    ["provider_http_error", "KILO_HTTP"],
    ["provider_error", "KILO_UNKNOWN"],
  ] as const;

  for (const [reason, code] of failures) {
    const failure = mobile_qa_failure_message(reason);
    expect(failure).toContain(code);
    expect(failure).toContain("No ledger changes were made.");
    expect(failure).not.toMatch(
      /remove a saved key|private|prompt|response body|bearer /i,
    );
  }
});

function sse_response(payload: unknown) {
  const wire = `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`;
  return new Response(wire, {
    headers: { "content-type": "text/event-stream" },
  });
}

function anthropic_sse_response(
  content_blocks: Array<Record<string, unknown>>,
  stop_reason: string,
) {
  const frames = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } })}\n\n`,
  ];
  content_blocks.forEach((block, index) => {
    if (block.type === "text") {
      frames.push(
        `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: { type: "text", text: "" } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } })}\n\n`,
      );
    } else {
      frames.push(
        `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } })}\n\n`,
      );
    }
    frames.push(
      `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`,
    );
  });
  frames.push(
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason }, usage: { output_tokens: 8 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  );
  return new Response(frames.join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

it("uses Kilo Auto Free without an auth header and streams only a read-only tool answer", async () => {
  const transactions: never[] = [];
  const ledger = {
    read: async (work: (repos: never) => Promise<unknown>) =>
      work({
        transactions: { list: async () => transactions },
        wallets: { get: async () => null },
      } as never),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetch_impl = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      const index = requests.length - 1;
      return sse_response({
        choices: [
          {
            index: 0,
            delta:
              index === 0
                ? {
                    tool_calls: [
                      {
                        index: 0,
                        id: "synthetic_call",
                        type: "function",
                        function: {
                          name: "get_month_summary",
                          arguments: '{"year_month":"2026-11"}',
                        },
                      },
                    ],
                  }
                : { content: "Synthetic month total is zero." },
            finish_reason: index === 0 ? "tool_calls" : "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    },
  ) as typeof fetch;
  const chunks: string[] = [];
  const agent = create_mobile_qa_agent(
    ledger,
    { kind: "kilo", api_key: null },
    fetch_impl,
  );
  const answer = await agent.answerQuestion("Synthetic November total", {
    maxSteps: 3,
    onValidatedChunk: (chunk: string) => chunks.push(chunk),
  });

  expect(answer).toMatchObject({
    answered: true,
    answer: "Synthetic month total is zero.",
    toolsUsed: ["get_month_summary"],
  });
  expect(chunks.join("")).toBe(answer.answer);
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.url).toBe(
      "https://ai-gateway.kilo.ai/api/v1/chat/completions",
    );
    expect(request.init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      model: "kilo-auto/free",
      stream: true,
    });
  }
  expect(ledger.transaction).not.toHaveBeenCalled();
});

it("sends an optional synthetic Kilo key only in the authorization header", async () => {
  const ledger = {
    read: async (work: (repos: never) => Promise<unknown>) =>
      work({ transactions: { list: async () => [] } } as never),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
  let recorded: { url: string; init: RequestInit } | null = null;
  const fetch_impl = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      recorded = { url: String(input), init: init ?? {} };
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: "Synthetic answer", tool_calls: [] } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  ) as typeof fetch;
  const answer = await create_mobile_qa_agent(
    ledger,
    { kind: "kilo", api_key: "fake-kilo-key" },
    fetch_impl,
  ).answerQuestion("Synthetic question");
  expect(answer.answer).toBe("Synthetic answer");
  expect(recorded).not.toBeNull();
  expect(recorded!.init.headers).toMatchObject({
    Authorization: "Bearer fake-kilo-key",
  });
  expect(String(recorded!.init.body)).not.toContain("fake-kilo-key");
});

it("routes explicitly selected OpenAI-compatible BYOK to the configured endpoint and model", async () => {
  const ledger = {
    read: async (work: (repos: never) => Promise<unknown>) =>
      work({ transactions: { list: async () => [] } } as never),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetch_impl = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: "Synthetic BYOK answer", tool_calls: [] } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  ) as typeof fetch;
  const answer = await create_mobile_qa_agent(
    ledger,
    {
      kind: "openai_compatible",
      api_key: "test-key",
      base_url: "https://compatible.example/api/v1",
      model: "synthetic-compatible-model",
    },
    fetch_impl,
  ).answerQuestion("Synthetic only: what is my balance?");

  expect(answer).toMatchObject({
    answered: true,
    answer: "Synthetic BYOK answer",
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toBe(
    "https://compatible.example/api/v1/chat/completions",
  );
  expect(requests[0]?.init.headers).toMatchObject({
    Authorization: "Bearer test-key",
  });
  expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({
    model: "synthetic-compatible-model",
    stream: false,
  });
  expect(String(requests[0]?.init.body)).not.toContain("test-key");
  expect(requests[0]?.url).not.toContain("kilo.ai");
  expect(ledger.transaction).not.toHaveBeenCalled();
});

it("runs Anthropic Messages API tool-use through the same bounded read-only Q&A loop", async () => {
  const ledger = {
    read: async (work: (repos: never) => Promise<unknown>) =>
      work({ transactions: { list: async () => [] } } as never),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetch_impl = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      const index = requests.length - 1;
      return index === 0
        ? anthropic_sse_response(
            [
              {
                type: "tool_use",
                id: "toolu_synthetic",
                name: "get_month_summary",
                input: { year_month: "2026-11" },
              },
            ],
            "tool_use",
          )
        : anthropic_sse_response(
            [{ type: "text", text: "Synthetic month total is zero." }],
            "end_turn",
          );
    },
  ) as typeof fetch;
  const chunks: string[] = [];
  const answer = await create_mobile_qa_agent(
    ledger,
    { kind: "anthropic", api_key: "fake-key" },
    fetch_impl,
  ).answerQuestion("Synthetic November total", {
    maxSteps: 3,
    onValidatedChunk: (chunk: string) => chunks.push(chunk),
  });

  expect(answer).toMatchObject({
    answered: true,
    answer: "Synthetic month total is zero.",
    toolsUsed: ["get_month_summary"],
  });
  expect(chunks.join("")).toBe(answer.answer);
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.init.headers).toMatchObject({
      "x-api-key": "fake-key",
      "anthropic-version": "2026-10-21",
    });
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      model: "claude-sonnet-5-5",
      stream: true,
    });
    expect(String(request.init.body)).not.toContain("fake-key");
  }
  const follow_up = JSON.parse(String(requests[1]?.init.body));
  expect(follow_up.messages.at(-1)).toEqual({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "qa_1_0",
        content: expect.any(String),
      },
    ],
  });
  expect(ledger.transaction).not.toHaveBeenCalled();
});

it("rejects an insecure or credential-less OpenAI-compatible profile before HTTP", () => {
  const ledger = {
    read: async () => ({ transactions: { list: async () => [] } }),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
  const fetch_impl = jest.fn() as typeof fetch;
  expect(() =>
    create_mobile_qa_agent(
      ledger,
      {
        kind: "openai_compatible",
        api_key: "",
        base_url: "http://compatible.example",
        model: "synthetic-model",
      },
      fetch_impl,
    ),
  ).toThrow("Invalid provider configuration");
  expect(() =>
    create_mobile_qa_agent(
      ledger,
      {
        kind: "openai_compatible",
        api_key: "",
        base_url: "https://compatible.example/v1",
        model: "synthetic-model",
      },
      fetch_impl,
    ),
  ).toThrow("Invalid provider configuration");
  expect(fetch_impl).not.toHaveBeenCalled();
});
