import { generateText, generateObject, streamText, tool, stepCountIs, jsonSchema } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError } from "@ai-sdk/provider";
import { z } from "zod";
import { startFakeServer, textChunks, toolCallChunks } from "./fake_server.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
}

const usage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 };

// ---------------------------------------------------------------- A. text + streaming
{
  const server = await startFakeServer((req) =>
    req.body?.stream ? { sse: textChunks("Hello synthetic", usage) } : { json: {
      id: "c1", choices: [{ index: 0, message: { role: "assistant", content: "Hello synthetic" }, finish_reason: "stop" }], usage } },
  );
  const provider = createOpenAICompatible({
    name: "fake",
    baseURL: server.baseURL,
    apiKey: "synthetic-key-A",
  });
  const model = provider("synthetic-model-1");

  const gen = await generateText({ model, prompt: "say hello" });
  check("A1 non-streaming generateText", gen.text === "Hello synthetic" && gen.usage.totalTokens === 18,
    `text=${JSON.stringify(gen.text)} tokens=${gen.usage.totalTokens} url=${server.requests[0]?.url} auth=${server.requests[0]?.apiKey} model=${server.requests[0]?.body?.model}`);

  let streamed = "";
  let deltas = 0;
  const stream = streamText({ model, prompt: "say hello streamed" });
  for await (const part of stream.textStream) { streamed += part; deltas++; }
  check("A2 streaming textStream deltas", streamed === "Hello synthetic" && deltas > 1, `chunks=${deltas} text=${JSON.stringify(streamed)} streamFlag=${server.requests[1]?.body?.stream}`);

  await server.close();
}

// ---------------------------------------------------------------- B. base URL / key / model configurability
{
  const s1 = await startFakeServer(() => ({ json: { id: "1", choices: [{ index: 0, message: { content: "one" } }], usage } }));
  const s2 = await startFakeServer(() => ({ json: { id: "2", choices: [{ index: 0, message: { content: "two" } }], usage } }));
  const p1 = createOpenAICompatible({ name: "srv1", baseURL: s1.baseURL, apiKey: "key-one" });
  const p2 = createOpenAICompatible({ name: "srv2", baseURL: s2.baseURL, apiKey: "key-two" });
  const r1 = await generateText({ model: p1("model-one"), prompt: "x" });
  const r2 = await generateText({ model: p2("model-two"), prompt: "x" });
  check("B1 two independent OpenAI-compatible endpoints + keys + model ids",
    r1.text === "one" && r2.text === "two" &&
    s1.requests[0].apiKey === "key-one" && s1.requests[0].body.model === "model-one" &&
    s2.requests[0].apiKey === "key-two" && s2.requests[0].body.model === "model-two",
    `s1=${s1.requests[0].body.model}/${s1.requests[0].apiKey} s2=${s2.requests[0].body.model}/${s2.requests[0].apiKey}`);
  await s1.close(); await s2.close();
}

// ---------------------------------------------------------------- C. tool calling (non-stream + stream)
{
  let round = 0;
  const server = await startFakeServer((req) => {
    round++;
    if (round === 1) {
      return req.body?.stream
        ? { sse: toolCallChunks("get_balance", JSON.stringify({ wallet_id: "w1" }), usage) }
        : { json: { id: "c1", choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_abc", type: "function", function: { name: "get_balance", arguments: JSON.stringify({ wallet_id: "w1" }) } }] }, finish_reason: "tool_calls" }], usage } };
    }
    return req.body?.stream
      ? { sse: textChunks("Balance is 100", usage) }
      : { json: { id: "c2", choices: [{ index: 0, message: { content: "Balance is 100" }, finish_reason: "stop" }], usage } };
  });
  const provider = createOpenAICompatible({ name: "fake", baseURL: server.baseURL, apiKey: "k" });
  const model = provider("m");
  let executed = null;
  const tools = {
    get_balance: tool({
      description: "read balance",
      inputSchema: jsonSchema({ type: "object", properties: { wallet_id: { type: "string" } }, required: ["wallet_id"] }),
      execute: async (input) => { executed = input; return { balance_paise: 10000 }; },
    }),
  };

  const gen = await generateText({ model, prompt: "balance?", tools, stopWhen: stepCountIs(3) });
  check("C1 tool call executed + result fed back (multi-step)", gen.text === "Balance is 100" && executed?.wallet_id === "w1" && gen.steps.length === 2,
    `text=${JSON.stringify(gen.text)} input=${JSON.stringify(executed)} steps=${gen.steps.length} 2ndReqMessages=${server.requests[1]?.body?.messages?.map((m) => m.role).join(",")}`);
  check("C2 tool result message shape on 2nd request",
    JSON.stringify(server.requests[1]?.body?.messages?.at(-1)).includes("10000"),
    JSON.stringify(server.requests[1]?.body?.messages?.at(-1))?.slice(0, 160));

  round = 0;
  let streamedTools = null;
  const st = streamText({ model, prompt: "balance?", tools, stopWhen: stepCountIs(3) });
  for await (const part of st.fullStream) {
    if (part.type === "tool-call") streamedTools = { name: part.toolName, input: part.input };
  }
  check("C3 tool calls visible on stream", streamedTools?.name === "get_balance", JSON.stringify(streamedTools));
  await server.close();
}

// ---------------------------------------------------------------- D. cancellation
{
  const server = await startFakeServer(() => ({ sse: textChunks("slow slow slow slow slow slow"), delayMs: 60 }));
  const provider = createOpenAICompatible({ name: "fake", baseURL: server.baseURL, apiKey: "k" });
  const model = provider("m");
  const ac = new AbortController();
  let received = 0;
  let abortErr = null;
  try {
    const st = streamText({ model, prompt: "x", abortSignal: ac.signal });
    for await (const part of st.textStream) {
      received++;
      if (received === 2) ac.abort();
    }
  } catch (e) {
    abortErr = e;
  }
  check("D1 abort mid-stream stops delivery and surfaces AbortError",
    received <= 3 && abortErr !== null && /abort/i.test(abortErr?.name ?? ""),
    `received=${received} errName=${abortErr?.name}`);
  await server.close();
}

// ---------------------------------------------------------------- E. error mapping
{
  const cases = [
    [401, { error: { message: "nope", type: "invalid_api_key", code: "invalid_api_key" } }],
    [429, { error: { message: "slow down", type: "rate_limit" } }],
    [400, { error: { message: "bad", type: "invalid_request_error" } }],
    [500, { error: { message: "boom" } }],
  ];
  for (const [status, body] of cases) {
    const server = await startFakeServer(() => ({ error: { status, body } }));
    const provider = createOpenAICompatible({ name: "fake", baseURL: server.baseURL, apiKey: "k" });
    let caught = null;
    try {
      await generateText({ model: provider("m"), prompt: "x", maxRetries: 0 });
    } catch (e) { caught = e; }
    check(`E status ${status} -> APICallError with statusCode + isRetryable`,
      caught instanceof APICallError && caught.statusCode === status,
      `class=${caught?.constructor?.name} status=${caught?.statusCode} retryable=${caught?.isRetryable}`);
    await server.close();
  }
}

// ---------------------------------------------------------------- F. structured output
{
  const server = await startFakeServer(() => ({ json: { id: "c", choices: [{ index: 0, message: { content: JSON.stringify({ amount_paise: 2500, intent: "spend" }) } }], usage } }));
  const provider = createOpenAICompatible({ name: "fake", baseURL: server.baseURL, apiKey: "k" });
  let ok = false, detail = "";
  try {
    const { object } = await generateObject({
      model: provider("m"),
      schema: z.object({ amount_paise: z.number().int(), intent: z.string() }),
      prompt: "synthetic",
    });
    ok = object.amount_paise === 2500;
    detail = JSON.stringify(object);
  } catch (e) { detail = `threw ${e?.constructor?.name}: ${e?.message}`; }
  check("F1 structured output (generateObject + zod)", ok, detail);
  await server.close();
}

// ---------------------------------------------------------------- G. provider error propagation for a 200-with-error SSE
{
  const server = await startFakeServer(() => ({ sse: [`data: ${JSON.stringify({ error: { message: "mid-stream failure", type: "server_error" } })}\n\n`] }));
  const provider = createOpenAICompatible({ name: "fake", baseURL: server.baseURL, apiKey: "k" });
  let caught = null, text = "";
  try {
    const st = streamText({ model: provider("m"), prompt: "x", maxRetries: 0 });
    for await (const part of st.textStream) text += part;
  } catch (e) { caught = e; }
  check("G1 in-band SSE error is not silently swallowed", caught !== null, `class=${caught?.constructor?.name} msg=${String(caught?.message).slice(0, 80)}`);
  await server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
