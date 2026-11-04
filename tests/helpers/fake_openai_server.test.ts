import { afterEach, expect, test } from "vitest";
import { startFakeOpenAIServer } from "./fake_openai_server.js";
const servers: Awaited<ReturnType<typeof startFakeOpenAIServer>>[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});
async function open(responder?: Parameters<typeof startFakeOpenAIServer>[0]) {
  const s = await startFakeOpenAIServer(responder);
  servers.push(s);
  return s;
}
const send = (
  baseUrl: string,
  body = JSON.stringify({ model: "synthetic_model", messages: [] }),
  signal?: AbortSignal,
) =>
  fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic_key_a",
      "Content-Type": "application/json",
    },
    body,
    signal,
  });

test("fake_provider_records_synthetic_json_and_supports_tools_usage_and_reset", async () => {
  const s = await open();
  const r = await send(s.baseUrl);
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    choices: [{ message: { role: "assistant", content: "Synthetic OK" } }],
    usage: { total_tokens: 3 },
  });
  expect(s.recordedRequests[0]).toMatchObject({
    apiKey: "synthetic_key_a",
    parsedBody: { model: "synthetic_model" },
  });
  s.setResponder(() => ({
    content: null,
    toolCalls: [
      {
        id: "synthetic_call",
        type: "function",
        function: { name: "get_balance", arguments: "{}" },
      },
    ],
  }));
  expect(await (await send(s.baseUrl)).json()).toMatchObject({
    choices: [
      {
        finish_reason: "tool_calls",
        message: { tool_calls: [{ id: "synthetic_call" }] },
      },
    ],
  });
  s.clearRequests();
  expect(s.recordedRequests).toHaveLength(0);
});

test("fake_provider_scripts_http_failures_and_omits_responder_exception_payloads", async () => {
  const s = await open((r) => ({
    status: [401, 429, 400][r.index],
    headers: { "Retry-After": "1" },
  }));
  for (const status of [401, 429, 400]) {
    const r = await send(s.baseUrl);
    expect(r.status).toBe(status);
    expect(r.headers.get("retry-after")).toBe("1");
    await r.text();
  }
  s.setResponder(() => {
    throw new Error("private_synthetic_server_exception");
  });
  const r = await send(s.baseUrl);
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("private_synthetic_server_exception");
});

test("fake_provider_routes_malformed_and_oversized_json_are_bounded", async () => {
  const s = await open();
  expect((await fetch(`${s.baseUrl}/wrong`)).status).toBe(404);
  for (const body of ["{", "[]", "", "null"])
    expect((await send(s.baseUrl, body)).status).toBe(400);
  expect((await send(s.baseUrl, "x".repeat(65537))).status).toBe(413);
});

test("fake_provider_sse_fragments_done_and_truncation_are_observable", async () => {
  const s = await open(() => ({
    wireChunks: [
      'data: {"choices":[{"delta":{"content":"Syn',
      'thetic"}}]}\n\n',
    ],
  }));
  const stream = JSON.stringify({ stream: true });
  let r = await send(s.baseUrl, stream);
  expect(r.headers.get("content-type")).toBe("text/event-stream");
  expect(await r.text()).toContain('Synthetic"}}]}\n\ndata: [DONE]');
  s.setResponder(() => ({ content: "Synthetic truncated", omitDone: true }));
  r = await send(s.baseUrl, stream);
  expect(await r.text()).not.toContain("[DONE]");
  s.setResponder(() => ({
    content: "Synthetic socket failure",
    abortAfterChunks: 1,
  }));
  await expect(async () => {
    const r = await send(s.baseUrl, stream);
    await r.text();
  }).rejects.toThrow();
});

test("fake_provider_delay_can_be_cancelled_and_close_cleans_active_sockets", async () => {
  const s = await open(() => ({ delayMs: 100 }));
  await expect(
    send(s.baseUrl, undefined, AbortSignal.timeout(5)),
  ).rejects.toThrow();
  await s.close();
  await s.close();
});
