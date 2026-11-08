import { expect, it, jest } from "@jest/globals";
import type { LedgerStore } from "@vittaz/core";
import { create_mobile_qa_agent, mobile_qa_failure_message } from "./mobile_qa";
import { MobileDiagnostics } from "./diagnostics";

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

it("forwards only allowlisted assistant stage metadata into mobile logs", async () => {
  const ledger = {
    read: async (work: (repos: never) => Promise<unknown>) =>
      work({ transactions: { list: async () => [] } } as never),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
  const diagnostics = new MobileDiagnostics({
    enabled: true,
    console_sink: () => undefined,
  });
  const fetch_impl = jest.fn(
    async () =>
      new Response("synthetic_private_response_marker", { status: 403 }),
  ) as unknown as typeof fetch;

  const agent = create_mobile_qa_agent(
    ledger,
    { kind: "kilo", api_key: null },
    fetch_impl,
    diagnostics,
  );
  const answer = await agent.answerQuestion("synthetic_private_prompt_marker");
  const serialized = diagnostics.dump_json();

  expect(answer.stopReason).toBe("provider_access_denied");
  expect(diagnostics.snapshot()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_code: "provider_request_started",
        source: "provider_http",
        provider_kind: "kilo",
      }),
      expect.objectContaining({
        event_code: "provider_http_response",
        http_status: 403,
        reason_code: "access_denied",
      }),
      expect.objectContaining({
        event_code: "qa_stage_failed",
        failure_stage: "provider_call",
      }),
    ]),
  );
  expect(serialized).not.toContain("synthetic_private_response_marker");
  expect(serialized).not.toContain("synthetic_private_prompt_marker");
  expect(serialized).not.toMatch(/api_key|response_body|stack|authorization/i);
  expect(ledger.transaction).not.toHaveBeenCalled();
});
