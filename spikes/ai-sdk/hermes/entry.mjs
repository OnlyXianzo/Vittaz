/**
 * Hermes runtime harness entry.
 *
 * Runs the real published `ai` + `@ai-sdk/openai-compatible` code inside a real
 * Hermes VM, with the Web API surface that React Native 0.88 + Expo SDK 58
 * document for native platforms. No network is used: `fetch` is a synthetic
 * implementation that returns provider-shaped responses so that runtime
 * compatibility is tested independently from live provider integration.
 */
import { generateText, streamText, tool, stepCountIs, jsonSchema } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const out = [];
function emit(name, payload) {
  out.push({ name, ...payload });
}
function report(name, fn) {
  try {
    const value = fn();
    emit(name, { ok: true, value });
  } catch (error) {
    emit(name, { ok: false, error: `${error?.name ?? "Error"}: ${error?.message ?? error}` });
  }
}

const GLOBALS = [
  "crypto",
  "TextEncoder",
  "TextDecoder",
  "TextDecoderStream",
  "TextEncoderStream",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "structuredClone",
  "AbortController",
  "AbortSignal",
  "DOMException",
  "URL",
  "URLSearchParams",
  "fetch",
  "Response",
  "Headers",
  "btoa",
  "atob",
];
report("globals", () => {
  const snapshot = {};
  for (const name of GLOBALS) snapshot[name] = typeof globalThis[name];
  snapshot["AbortSignal.any"] = typeof globalThis.AbortSignal?.any;
  snapshot["AbortSignal.timeout"] = typeof globalThis.AbortSignal?.timeout;
  snapshot["crypto.getRandomValues"] = typeof globalThis.crypto?.getRandomValues;
  snapshot["crypto.subtle"] = typeof globalThis.crypto?.subtle;
  return snapshot;
});

// ------------------------------------------------------------------ synthetic provider
const usage = { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 };
const enc = new TextEncoder();

function sseResponse(frames, { delayMs = 0 } = {}) {
  let cancelled = false;
  let timer = null;
  const stream = new ReadableStream({
    start(controller) {
      let index = 0;
      const tick = () => {
        if (cancelled) return;
        if (index >= frames.length) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }
        try {
          controller.enqueue(enc.encode(frames[index++]));
        } catch {
          cancelled = true;
          return;
        }
        timer = delayMs > 0 ? setTimeout(tick, delayMs) : (tick(), null);
      };
      tick();
    },
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const sse = (chunks) => chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`);
const textFrames = (text) =>
  sse(
    [...text].map((character) => ({
      id: "c",
      choices: [{ index: 0, delta: { content: character }, finish_reason: null }],
    })),
  ).concat([`data: ${JSON.stringify({ id: "c", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\n`]);

const toolFrames = sse([
  { id: "c", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_balance", arguments: "" } }] }, finish_reason: null }] },
  { id: "c", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"wallet_id":"w1"}' } }] }, finish_reason: null }] },
  { id: "c", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
]).concat([`data: ${JSON.stringify({ id: "c", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage })}\n\n`]);

// ------------------------------------------------------------------ checks
async function main() {
  let plan = "text";
  const requests = [];
  const syntheticFetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push({ url: String(input), stream: body.stream === true, model: body.model });
    if (plan === "tool") {
      const calls = requests.length;
      return body.stream
        ? sseResponse(calls === 1 ? toolFrames : textFrames("done"))
        : jsonResponse({
            id: "c",
            choices: [
              calls === 1
                ? { index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_balance", arguments: '{"wallet_id":"w1"}' } }] }, finish_reason: "tool_calls" }
                : { index: 0, message: { content: "done" }, finish_reason: "stop" },
            ],
            usage,
          });
    }
    if (plan === "inband_error") {
      return sseResponse([`data: ${JSON.stringify({ error: { message: "synthetic failure", type: "server_error" } })}\n\n`]);
    }
    if (plan === "structured") {
      return jsonResponse({ id: "c", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ intent: "spend" }) }, finish_reason: "stop" }], usage });
    }
    if (plan === "slow") {
      return sseResponse(textFrames("abcdefghijklmnop"), { delayMs: 15 });
    }
    return body.stream
      ? sseResponse(textFrames("synthetic reply"))
      : jsonResponse({ id: "c", choices: [{ index: 0, message: { role: "assistant", content: "synthetic reply" }, finish_reason: "stop" }], usage });
  };

  const provider = createOpenAICompatible({
    name: "synthetic",
    baseURL: "https://synthetic.invalid/v1",
    apiKey: "synthetic-key",
    fetch: syntheticFetch,
  });
  const model = provider("synthetic-model");

  // 1. non-streaming generation
  try {
    const result = await generateText({ model, prompt: "hello" });
    emit("generateText", { ok: result.text === "synthetic reply", text: result.text, totalTokens: result.usage?.totalTokens });
  } catch (error) {
    emit("generateText", { ok: false, error: `${error?.name}: ${error?.message}` });
  }

  // 2. streaming
  try {
    let text = "";
    let deltas = 0;
    const result = streamText({ model, prompt: "hello" });
    for await (const part of result.textStream) {
      text += part;
      deltas++;
    }
    emit("streamText", { ok: text === "synthetic reply", text, deltas });
  } catch (error) {
    emit("streamText", { ok: false, error: `${error?.name}: ${error?.message}` });
  }

  // 3. tool calling
  plan = "tool";
  requests.length = 0;
  try {
    let executed = null;
    const result = await generateText({
      model,
      prompt: "balance?",
      stopWhen: stepCountIs(3),
      tools: {
        get_balance: tool({
          description: "read balance",
          inputSchema: jsonSchema({ type: "object", properties: { wallet_id: { type: "string" } }, required: ["wallet_id"] }),
          execute: async (input) => {
            executed = input;
            return { balance_paise: 10000 };
          },
        }),
      },
    });
    emit("toolCalling", {
      ok: result.text === "done" && executed?.wallet_id === "w1" && result.steps?.length === 2,
      text: result.text,
      executed,
      steps: result.steps?.length,
    });
  } catch (error) {
    emit("toolCalling", { ok: false, error: `${error?.name}: ${error?.message}` });
  }

  // 4. cancellation
  plan = "slow";
  try {
    const controller = new AbortController();
    let received = 0;
    let threw = null;
    const result = streamText({ model, prompt: "x", abortSignal: controller.signal });
    try {
      for await (const part of result.textStream) {
        received++;
        if (received === 2) controller.abort();
      }
    } catch (error) {
      threw = `${error?.name}: ${error?.message}`;
    }
    let finish = "unset";
    let textOutcome = "unset";
    try {
      finish = await result.finishReason;
    } catch (error) {
      finish = `threw ${error?.name}: ${error?.message}`;
    }
    try {
      const text = await result.text;
      textOutcome = `resolved:${JSON.stringify(text)}`;
    } catch (error) {
      textOutcome = `threw ${error?.name}: ${error?.message}`;
    }
    // Observed semantics: the delta stream ends silently; the abort surfaces as a
    // rejection of result.text / result.finishReason.
    const observable = threw !== null || /AbortError/.test(finish) || /AbortError/.test(textOutcome);
    emit("cancellation", { ok: observable && received <= 3, received, deltaStreamThrew: threw, finish, textOutcome });
  } catch (error) {
    emit("cancellation", { ok: false, error: `${error?.name}: ${error?.message}` });
  }

  // 5. in-band provider error after HTTP 200
  plan = "inband_error";
  try {
    const result = streamText({ model, prompt: "x", maxRetries: 0 });
    let threw = null;
    let text = "";
    try {
      for await (const part of result.textStream) text += part;
    } catch (error) {
      threw = `${error?.name}: ${error?.message}`;
    }
    const finish = await result.finishReason;
    emit("inbandError", { ok: true, threw, text, finish, surfacesAsException: threw !== null });
  } catch (error) {
    emit("inbandError", { ok: false, error: `${error?.name}: ${error?.message}` });
  }

  // 6. structured output
  try {
    const { generateObject } = await import("ai");
    const { z } = await import("zod");
    plan = "structured";
    const result = await generateObject({ model, schema: z.object({ intent: z.string() }), prompt: "synthetic" });
    emit("structuredOutput", { ok: typeof result.object === "object", value: result.object });
  } catch (error) {
    emit("structuredOutput", { ok: false, error: `${error?.name}: ${error?.message}` });
  }

  console.log(`##RESULT##${JSON.stringify(out)}`);
}

main().catch((error) => {
  console.log(`##FATAL##${JSON.stringify({ error: `${error?.name}: ${error?.message}`, stack: String(error?.stack ?? "").slice(0, 400) })}`);
});
